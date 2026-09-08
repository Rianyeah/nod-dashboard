import base64

import pytest

from config import SecurityConfigurationError, SecuritySettings


def valid_env(**overrides):
    env = {
        "APP_ENV": "production",
        "PUBLIC_APP_ORIGIN": "https://nod-dashboard.zeabur.app",
        "ALLOWED_HOSTS": "nod-dashboard.zeabur.app",
        "DASHBOARD_USER": "operator",
        "DASHBOARD_PASSWORD_HASH": "$argon2id$v=19$m=65536,t=3,p=4$abc$def",
        "DASHBOARD_SESSION_SECRET": base64.urlsafe_b64encode(b"x" * 32).decode(),
        "DASHBOARD_SESSION_TTL_SECONDS": "28800",
        "SESSION_COOKIE_SECURE": "true",
        "N8N_API_KEY": "n" * 32,
        "N8N_MAP_API_KEY": "m" * 32,
        "N8N_CAPTURE_API_KEY": "c" * 32,
        "N8N_CAPTURE_SIGNING_SECRET": base64.urlsafe_b64encode(b"s" * 32).decode(),
        "REDIS_URL": "",
    }
    env.update(overrides)
    return env


def enabled_sync_env(**overrides):
    env = valid_env(
        DATA_SYNC_ENABLED="true",
        DATA_SYNC_JOB_TIMEOUT_SECONDS="1800",
        N8N_SYNC_BASE_URL="https://n8n.example.com",
        N8N_IMPACT_SERVICE_SYNC_WEBHOOK_URL=(
            "https://n8n.example.com/webhook/impact-service-sync"
        ),
        N8N_DATA_MASTER_SYNC_WEBHOOK_URL=(
            "https://n8n.example.com/webhook/data-master-sync"
        ),
        N8N_ACTIVITY_ENOM_SYNC_WEBHOOK_URL=(
            "https://n8n.example.com/webhook/activity-enom-sync"
        ),
        N8N_SYNC_TRIGGER_API_KEY="s" * 40,
    )
    env.update(overrides)
    return env


def test_data_sync_is_disabled_by_default_without_webhook_settings():
    settings = SecuritySettings.from_env(valid_env())

    assert settings.data_sync.enabled is False
    assert settings.data_sync.job_timeout_seconds == 1800
    assert settings.data_sync.webhook_urls == {}
    assert settings.data_sync.trigger_api_key == ""


def test_enabled_data_sync_maps_each_dataset_to_its_webhook():
    settings = SecuritySettings.from_env(enabled_sync_env())

    assert settings.data_sync.enabled is True
    assert settings.data_sync.webhook_url_for("impact_service").endswith(
        "/webhook/impact-service-sync"
    )
    assert settings.data_sync.webhook_url_for("data_master").endswith(
        "/webhook/data-master-sync"
    )
    assert settings.data_sync.webhook_url_for("activity_enom").endswith(
        "/webhook/activity-enom-sync"
    )


@pytest.mark.parametrize(
    "name",
    [
        "N8N_SYNC_BASE_URL",
        "N8N_IMPACT_SERVICE_SYNC_WEBHOOK_URL",
        "N8N_DATA_MASTER_SYNC_WEBHOOK_URL",
        "N8N_ACTIVITY_ENOM_SYNC_WEBHOOK_URL",
        "N8N_SYNC_TRIGGER_API_KEY",
    ],
)
def test_enabled_data_sync_requires_every_setting(name):
    with pytest.raises(SecurityConfigurationError, match=name):
        SecuritySettings.from_env(enabled_sync_env(**{name: ""}))


@pytest.mark.parametrize("value", ["59", "86401", "not-a-number"])
def test_data_sync_job_timeout_rejects_unsafe_values(value):
    with pytest.raises(SecurityConfigurationError, match="DATA_SYNC_JOB_TIMEOUT_SECONDS"):
        SecuritySettings.from_env(enabled_sync_env(DATA_SYNC_JOB_TIMEOUT_SECONDS=value))


@pytest.mark.parametrize(
    "overrides",
    [
        {"N8N_SYNC_BASE_URL": "http://n8n.example.com"},
        {
            "N8N_IMPACT_SERVICE_SYNC_WEBHOOK_URL": (
                "https://other.example.com/webhook/impact-service-sync"
            )
        },
        {
            "N8N_IMPACT_SERVICE_SYNC_WEBHOOK_URL": (
                "https://n8n.example.com/webhook-test/impact-service-sync"
            )
        },
        {
            "N8N_IMPACT_SERVICE_SYNC_WEBHOOK_URL": (
                "https://user:pass@n8n.example.com/webhook/impact-service-sync"
            )
        },
        {
            "N8N_IMPACT_SERVICE_SYNC_WEBHOOK_URL": (
                "https://n8n.example.com/webhook/impact-service-sync?debug=true"
            )
        },
        {
            "N8N_IMPACT_SERVICE_SYNC_WEBHOOK_URL": (
                "https://n8n.example.com/webhook/impact-service-sync#fragment"
            )
        },
    ],
)
def test_data_sync_rejects_unapproved_webhook_urls(overrides):
    with pytest.raises(SecurityConfigurationError):
        SecuritySettings.from_env(enabled_sync_env(**overrides))


@pytest.mark.parametrize("value", ["short", "n" * 32, "m" * 32, "c" * 32])
def test_data_sync_trigger_key_must_be_strong_and_distinct(value):
    with pytest.raises(SecurityConfigurationError, match="N8N_SYNC_TRIGGER_API_KEY"):
        SecuritySettings.from_env(enabled_sync_env(N8N_SYNC_TRIGGER_API_KEY=value))


def test_unknown_dataset_never_selects_a_webhook():
    settings = SecuritySettings.from_env(enabled_sync_env())

    with pytest.raises(KeyError):
        settings.data_sync.webhook_url_for("unknown")

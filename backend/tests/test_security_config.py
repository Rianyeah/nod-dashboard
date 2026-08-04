import base64
import unittest

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


class SecuritySettingsTest(unittest.TestCase):
    def test_valid_production_settings_are_parsed(self):
        settings = SecuritySettings.from_env(valid_env())

        self.assertTrue(settings.is_production)
        self.assertEqual(settings.allowed_hosts, ("nod-dashboard.zeabur.app",))
        self.assertEqual(settings.dashboard_session_ttl_seconds, 28800)
        self.assertEqual(settings.n8n_map_api_key, "m" * 32)
        self.assertEqual(settings.n8n_capture_api_key, "c" * 32)

    def test_each_required_value_fails_without_echoing_the_value(self):
        for name in (
            "PUBLIC_APP_ORIGIN",
            "ALLOWED_HOSTS",
            "DASHBOARD_USER",
            "DASHBOARD_PASSWORD_HASH",
            "DASHBOARD_SESSION_SECRET",
            "N8N_API_KEY",
            "N8N_MAP_API_KEY",
            "N8N_CAPTURE_API_KEY",
            "N8N_CAPTURE_SIGNING_SECRET",
        ):
            with self.subTest(name=name):
                env = valid_env()
                original_value = env[name]
                env[name] = ""

                with self.assertRaises(SecurityConfigurationError) as raised:
                    SecuritySettings.from_env(env)

                self.assertIn(name, str(raised.exception))
                self.assertNotIn(original_value, str(raised.exception))

    def test_production_rejects_insecure_origin_cookie_and_short_secret(self):
        invalid_values = (
            {"PUBLIC_APP_ORIGIN": "http://example.com"},
            {"SESSION_COOKIE_SECURE": "false"},
            {"DASHBOARD_SESSION_SECRET": "short"},
            {"N8N_CAPTURE_SIGNING_SECRET": "short"},
            {"N8N_CAPTURE_API_KEY": "n" * 32},
            {"N8N_CAPTURE_API_KEY": "m" * 32},
        )

        for overrides in invalid_values:
            with self.subTest(overrides=overrides):
                with self.assertRaises(SecurityConfigurationError):
                    SecuritySettings.from_env(valid_env(**overrides))

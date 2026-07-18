import base64
import os

import pytest
from argon2 import PasswordHasher
from fastapi.testclient import TestClient


TEST_PASSWORD = "test-only-password"
TEST_ORIGIN = "https://nod-dashboard.zeabur.app"

os.environ.update(
    {
        "APP_ENV": "production",
        "PUBLIC_APP_ORIGIN": TEST_ORIGIN,
        "ALLOWED_HOSTS": "nod-dashboard.zeabur.app",
        "DASHBOARD_USER": "operator",
        "DASHBOARD_PASSWORD_HASH": PasswordHasher().hash(TEST_PASSWORD),
        "DASHBOARD_SESSION_SECRET": base64.urlsafe_b64encode(b"x" * 32).decode(),
        "DASHBOARD_SESSION_TTL_SECONDS": "28800",
        "SESSION_COOKIE_SECURE": "true",
        "N8N_API_KEY": "test-only-n8n-key",
        "DATABASE_URL": "postgresql+asyncpg://test:test@127.0.0.1:5432/test",
        "REDIS_URL": "",
    }
)


@pytest.fixture
def security_settings():
    from config import SecuritySettings

    return SecuritySettings.from_env()


@pytest.fixture
def session_manager(security_settings):
    from security import SessionManager

    return SessionManager(security_settings)


@pytest.fixture
def client(security_settings):
    from main import create_app

    return TestClient(create_app(security_settings), base_url=TEST_ORIGIN)


@pytest.fixture
def credentials():
    return {"username": "operator", "password": TEST_PASSWORD}


@pytest.fixture
def authenticated_client(client, credentials):
    response = client.post(
        "/api/v1/auth/login",
        json=credentials,
        headers={"Origin": TEST_ORIGIN},
    )
    assert response.status_code == 200
    return client

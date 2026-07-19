import base64
import socket
from dataclasses import replace

import pytest
from fastapi.testclient import TestClient


def test_valid_login_sets_hardened_cookie(client, credentials):
    response = client.post(
        "/api/v1/auth/login",
        json=credentials,
        headers={"Origin": "https://nod-dashboard.zeabur.app"},
    )

    assert response.status_code == 200
    cookie = response.headers["set-cookie"]
    assert "nod_session=" in cookie
    assert "HttpOnly" in cookie
    assert "Secure" in cookie
    assert "SameSite=strict" in cookie
    assert "Max-Age=28800" in cookie
    assert response.json() == {"authenticated": True, "username": "operator"}
    assert "token" not in response.json()


def test_invalid_credentials_use_one_generic_response(client):
    headers = {"Origin": "https://nod-dashboard.zeabur.app"}
    wrong_user = client.post(
        "/api/v1/auth/login",
        json={"username": "other", "password": "wrong"},
        headers=headers,
    )
    wrong_password = client.post(
        "/api/v1/auth/login",
        json={"username": "operator", "password": "wrong"},
        headers=headers,
    )

    assert wrong_user.status_code == wrong_password.status_code == 401
    assert wrong_user.json() == wrong_password.json() == {
        "detail": "Invalid username or password"
    }


def test_modified_expired_and_wrong_secret_sessions_are_rejected(
    session_manager, security_settings
):
    from security import SessionManager, SessionValidationError

    token = session_manager.issue("operator")
    assert session_manager.verify(token) == "operator"

    with pytest.raises(SessionValidationError):
        session_manager.verify(token + "x")

    expired_manager = SessionManager(
        replace(security_settings, dashboard_session_ttl_seconds=-1)
    )
    with pytest.raises(SessionValidationError):
        expired_manager.verify(token)

    wrong_secret_manager = SessionManager(
        replace(
            security_settings,
            dashboard_session_secret=base64.urlsafe_b64encode(b"z" * 32).decode(),
        )
    )
    with pytest.raises(SessionValidationError):
        wrong_secret_manager.verify(token)


def test_runtime_private_ip_is_trusted_without_allowing_unknown_hosts(
    monkeypatch, security_settings
):
    from main import create_app

    monkeypatch.setattr(socket, "gethostname", lambda: "zeabur-pod")
    monkeypatch.setattr(socket, "gethostbyname", lambda _hostname: "10.42.0.133")
    client = TestClient(create_app(security_settings), base_url="http://10.42.0.133:8000")

    assert client.get("/api/v1/health").status_code == 200
    assert client.get(
        "/api/v1/health", headers={"Host": "attacker.example"}
    ).status_code == 400

import asyncio

from argon2 import PasswordHasher
from fastapi.testclient import TestClient


ORIGIN = "https://nod-dashboard.zeabur.app"


def build_client(security_settings, role):
    from main import create_app
    from user_store import AppUser, InMemoryUserStore

    store = InMemoryUserStore([
        AppUser(
            id="00000000-0000-0000-0000-000000000010",
            username="role-user",
            password_hash=PasswordHasher().hash("role-test-password"),
            role=role,
        )
    ])
    client = TestClient(create_app(security_settings, user_store=store), base_url=ORIGIN)
    response = client.post(
        "/api/v1/auth/login",
        json={"username": "role-user", "password": "role-test-password"},
        headers={"Origin": ORIGIN},
    )
    assert response.status_code == 200
    return client, store


def test_viewer_cannot_open_management_data(security_settings):
    client, _ = build_client(security_settings, "viewer")

    response = client.get("/api/v1/management-data/targets")

    assert response.status_code == 403
    assert response.json() == {"detail": "Insufficient permission"}

    thresholds = client.get(
        "/api/v1/management-data/reporting-thresholds",
        params={"effective_month": "2026-08"},
    )
    assert thresholds.status_code == 403
    assert thresholds.json() == {"detail": "Insufficient permission"}


def test_data_admin_can_import_but_cannot_manage_users(security_settings):
    client, _ = build_client(security_settings, "data_admin")

    targets = client.get("/api/v1/management-data/targets")
    users = client.get("/api/v1/management-data/users")

    assert targets.status_code == 200
    assert {target["key"] for target in targets.json()} == {
        "ticketing_swfm_non_inap",
        "ticketing_fault_center",
    }
    assert users.status_code == 403


def test_sysadmin_can_manage_users(security_settings):
    client, _ = build_client(security_settings, "sysadmin")

    response = client.get("/api/v1/management-data/users")

    assert response.status_code == 200
    assert response.json()[0]["role"] == "sysadmin"
    assert "password_hash" not in response.json()[0]


def test_role_change_invalidates_existing_session(security_settings):
    client, store = build_client(security_settings, "data_admin")
    assert client.get("/api/v1/auth/session").status_code == 200

    asyncio.run(store.update_user(
        user_id="00000000-0000-0000-0000-000000000010",
        role="viewer",
        is_active=None,
        new_password=None,
    ))

    assert client.get("/api/v1/auth/session").status_code == 401


def test_machine_admin_boundary_does_not_accept_browser_role(security_settings):
    client, _ = build_client(security_settings, "sysadmin")

    response = client.get("/api/v1/admin/cache/site-month-metrics")

    assert response.status_code in {401, 404, 405, 422}

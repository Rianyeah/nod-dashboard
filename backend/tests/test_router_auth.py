import pytest


PROTECTED_PATHS = (
    "/api/v1/map/sites",
    "/api/v1/availability/latest-period",
    "/api/v1/sites",
    "/api/v1/reporting/available-months",
    "/api/v1/impact-service/filters",
    "/api/v1/transport-quality/filters",
    "/api/v1/ticketing/filters",
    "/api/v1/ticketing/toti/filters",
    "/api/v1/overview",
    "/api/v1/activity-enom/filters",
    "/api/v1/data-potensi/filter-options",
    "/api/v1/rf-tilt/sites?q=x",
    "/api/v1/tower-plan/sites?q=x",
)


@pytest.mark.parametrize("path", PROTECTED_PATHS)
def test_dashboard_routers_reject_anonymous_requests_before_handler(client, path):
    assert client.get(path).status_code == 401


def test_health_is_public_and_minimal(client):
    response = client.get("/api/v1/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_admin_and_n8n_routes_do_not_accept_dashboard_session(authenticated_client):
    headers = {"Origin": "https://nod-dashboard.zeabur.app"}
    admin = authenticated_client.post("/api/v1/admin/cache/invalidate", headers=headers)
    webhook = authenticated_client.post(
        "/api/v1/webhook/n8n/alert",
        json={"site_id": "S1", "event_type": "down", "timestamp": "2026-07-18T00:00:00Z"},
        headers=headers,
    )

    assert admin.status_code in {401, 422}
    assert webhook.status_code in {401, 422}

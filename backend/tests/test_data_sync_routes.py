from datetime import datetime, timezone
from uuid import uuid4

from models.data_sync import (
    DataSyncPublicJob,
    DataSyncStartResponse,
    DataSyncStatusResponse,
)
from services.data_sync import DataSyncDisabledError, DataSyncRateLimitError


NOW = datetime(2026, 9, 8, 10, 0, tzinfo=timezone.utc)
ORIGIN = "https://nod-dashboard.zeabur.app"


def public_job(status="running"):
    return DataSyncPublicJob(
        id=uuid4(),
        dataset="impact_service",
        status=status,
        started_at=NOW,
    )


class BrowserService:
    def __init__(self):
        self.started = []
        self.start_error = None
        self.job = public_job()

    async def start(self, dataset, actor):
        self.started.append((dataset, actor.role))
        if self.start_error:
            raise self.start_error
        return DataSyncStartResponse(job=self.job, already_running=False)

    async def status(self):
        return DataSyncStatusResponse(
            enabled=True,
            jobs={
                "impact_service": self.job,
                "data_master": None,
                "activity_enom": None,
            },
        )


def test_viewer_can_start_dataset_sync(authenticated_client):
    service = BrowserService()
    authenticated_client.app.state.data_sync_service = service

    response = authenticated_client.post(
        "/api/v1/data-sync/impact_service",
        headers={"Origin": ORIGIN},
    )

    assert response.status_code == 200
    assert response.json()["job"]["status"] == "running"
    assert response.json()["already_running"] is False
    assert service.started == [("impact_service", "viewer")]


def test_data_sync_browser_routes_require_session(client):
    assert client.get("/api/v1/data-sync/status").status_code == 401
    assert client.post(
        "/api/v1/data-sync/impact_service", headers={"Origin": ORIGIN}
    ).status_code == 401


def test_start_rejects_disabled_feature_and_exposes_retry_after(authenticated_client):
    service = BrowserService()
    authenticated_client.app.state.data_sync_service = service
    service.start_error = DataSyncDisabledError()

    disabled = authenticated_client.post(
        "/api/v1/data-sync/data_master", headers={"Origin": ORIGIN}
    )
    service.start_error = DataSyncRateLimitError(37)
    limited = authenticated_client.post(
        "/api/v1/data-sync/activity_enom", headers={"Origin": ORIGIN}
    )

    assert disabled.status_code == 503
    assert disabled.json() == {"detail": "Sinkronisasi data sedang dinonaktifkan"}
    assert limited.status_code == 429
    assert limited.headers["Retry-After"] == "37"


def test_status_has_all_dataset_keys_without_private_job_fields(authenticated_client):
    service = BrowserService()
    authenticated_client.app.state.data_sync_service = service

    response = authenticated_client.get("/api/v1/data-sync/status")

    assert response.status_code == 200
    body = response.json()
    assert set(body["jobs"]) == {"impact_service", "data_master", "activity_enom"}
    assert "requested_by_username" not in body["jobs"]["impact_service"]
    assert "callback_token_hash" not in body["jobs"]["impact_service"]


def test_unknown_dataset_is_rejected_without_calling_service(authenticated_client):
    service = BrowserService()
    authenticated_client.app.state.data_sync_service = service

    response = authenticated_client.post(
        "/api/v1/data-sync/not-a-dataset", headers={"Origin": ORIGIN}
    )

    assert response.status_code == 422
    assert service.started == []

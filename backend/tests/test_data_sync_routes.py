from datetime import datetime, timezone
from uuid import uuid4

from models.data_sync import (
    DataSyncCancelResponse,
    DataSyncDataset,
    DataSyncPublicJob,
    DataSyncStartResponse,
    DataSyncStatusResponse,
    DataSyncStatus,
)
from services.data_sync import (
    DataSyncCancelForbiddenError,
    DataSyncCancelUnavailableError,
    DataSyncDisabledError,
    DataSyncRateLimitError,
)


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

    async def status(self, actor):
        return DataSyncStatusResponse(
            enabled=True,
            jobs={
                "impact_service": self.job,
                "data_master": None,
                "activity_enom": None,
            },
        )

    async def cancel(self, dataset, job_id, actor):
        if self.start_error:
            raise self.start_error
        self.job = self.job.model_copy(
            update={
                "id": job_id,
                "dataset": DataSyncDataset(dataset),
                "status": DataSyncStatus.CANCELED,
                "finished_at": NOW,
                "result_code": "canceled",
                "public_message": "Sinkronisasi telah dibatalkan.",
                "can_cancel": False,
            }
        )
        return DataSyncCancelResponse(canceled=True, job=self.job)


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


def test_creator_cancel_route_returns_safe_terminal_job(authenticated_client):
    service = BrowserService()
    authenticated_client.app.state.data_sync_service = service
    job_id = uuid4()

    response = authenticated_client.post(
        f"/api/v1/data-sync/impact_service/{job_id}/cancel",
        headers={"Origin": ORIGIN},
    )

    assert response.status_code == 200
    assert response.json()["job"]["status"] == "canceled"
    assert "n8n_execution_id" not in response.text


def test_cancel_route_maps_forbidden_and_timeout_safely(authenticated_client):
    service = BrowserService()
    authenticated_client.app.state.data_sync_service = service
    endpoint = f"/api/v1/data-sync/impact_service/{uuid4()}/cancel"

    service.start_error = DataSyncCancelForbiddenError()
    forbidden = authenticated_client.post(endpoint, headers={"Origin": ORIGIN})
    service.start_error = DataSyncCancelUnavailableError(timed_out=True)
    unavailable = authenticated_client.post(endpoint, headers={"Origin": ORIGIN})

    assert forbidden.status_code == 403
    assert unavailable.status_code == 504
    assert unavailable.json() == {
        "detail": "Execution belum berhasil dihentikan. Coba batalkan kembali."
    }

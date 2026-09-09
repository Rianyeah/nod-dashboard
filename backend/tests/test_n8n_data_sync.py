from datetime import datetime, timezone
from uuid import uuid4

from models.data_sync import DataSyncClaimResponse, DataSyncPublicJob
from services.data_sync import DataSyncAuthenticationError, DataSyncConflictError


NOW = datetime(2026, 9, 8, 10, 0, tzinfo=timezone.utc)


class MachineService:
    def __init__(self):
        self.claim_execute = True
        self.calls = []

    async def claim(self, job_id, token):
        self.calls.append(("claim", str(job_id), token))
        if token != "valid-job-token":
            raise DataSyncAuthenticationError
        return DataSyncClaimResponse(execute=self.claim_execute)

    async def complete(self, job_id, token, **payload):
        self.calls.append(("callback", str(job_id), token, payload))
        if token != "valid-job-token":
            raise DataSyncAuthenticationError
        if payload["result_code"] == "workflow_failed" and payload["status"] == "succeeded":
            raise DataSyncConflictError
        return DataSyncPublicJob(
            id=job_id,
            dataset="data_master",
            status=payload["status"],
            started_at=NOW,
            finished_at=NOW,
            rows_processed=payload["rows_processed"],
            result_code=payload["result_code"],
            public_message="Sinkronisasi selesai."
            if payload["status"] == "succeeded"
            else "Sinkronisasi gagal.",
        )


def test_first_and_duplicate_claim_return_execute_instruction(client):
    service = MachineService()
    client.app.state.data_sync_service = service
    job_id = uuid4()

    first = client.post(
        f"/api/v1/integrations/n8n/data-sync/{job_id}/claim",
        headers={"X-Data-Sync-Job-Token": "valid-job-token"},
    )
    service.claim_execute = False
    duplicate = client.post(
        f"/api/v1/integrations/n8n/data-sync/{job_id}/claim",
        headers={"X-Data-Sync-Job-Token": "valid-job-token"},
    )

    assert first.status_code == 200
    assert first.json() == {"execute": True}
    assert duplicate.json() == {"execute": False}


def test_missing_wrong_and_unknown_job_credentials_share_generic_401(client):
    service = MachineService()
    client.app.state.data_sync_service = service
    unknown_job = uuid4()

    missing = client.post(
        f"/api/v1/integrations/n8n/data-sync/{unknown_job}/claim"
    )
    wrong = client.post(
        f"/api/v1/integrations/n8n/data-sync/{unknown_job}/claim",
        headers={"X-Data-Sync-Job-Token": "wrong"},
    )

    assert missing.status_code == wrong.status_code == 401
    assert missing.json() == wrong.json() == {
        "detail": "Invalid data sync credential"
    }


def test_success_and_failure_callbacks_are_validated_and_return_safe_job(client):
    service = MachineService()
    client.app.state.data_sync_service = service
    job_id = uuid4()
    headers = {"X-Data-Sync-Job-Token": "valid-job-token"}

    success = client.post(
        f"/api/v1/integrations/n8n/data-sync/{job_id}/callback",
        headers=headers,
        json={"status": "succeeded", "rows_processed": 25, "result_code": "completed"},
    )
    failure = client.post(
        f"/api/v1/integrations/n8n/data-sync/{uuid4()}/callback",
        headers=headers,
        json={"status": "failed", "result_code": "database_write_failed"},
    )

    assert success.status_code == 200
    assert success.json()["accepted"] is True
    assert success.json()["job"]["rows_processed"] == 25
    assert failure.status_code == 200
    assert failure.json()["job"]["public_message"] == "Sinkronisasi gagal."


def test_callback_rejects_arbitrary_fields_and_invalid_status_result_pair(client):
    service = MachineService()
    client.app.state.data_sync_service = service
    endpoint = f"/api/v1/integrations/n8n/data-sync/{uuid4()}/callback"
    headers = {"X-Data-Sync-Job-Token": "valid-job-token"}

    arbitrary = client.post(
        endpoint,
        headers=headers,
        json={
            "status": "failed",
            "result_code": "workflow_failed",
            "error_message": "raw SQL error must not be accepted",
        },
    )
    mismatched = client.post(
        endpoint,
        headers=headers,
        json={"status": "succeeded", "result_code": "workflow_failed"},
    )

    assert arbitrary.status_code == 422
    assert mismatched.status_code == 422
    assert service.calls == []

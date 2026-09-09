from datetime import datetime, timezone

import pytest
from pydantic import ValidationError

from models.data_sync import (
    DataSyncClaimRequest,
    DataSyncStatus,
    public_job_from_row,
)
from user_store import AppUser


NOW = datetime(2026, 9, 9, tzinfo=timezone.utc)


def _row(**overrides):
    row = {
        "id": "11111111-1111-4111-8111-111111111111",
        "dataset": "impact_service",
        "status": "running",
        "requested_by_user_id": "viewer-1",
        "started_at": NOW,
        "finished_at": None,
        "rows_processed": None,
        "result_code": None,
        "n8n_execution_id": "secret-execution-id",
    }
    row.update(overrides)
    return row


def test_claim_request_trims_execution_id():
    assert DataSyncClaimRequest(execution_id=" 12345 ").execution_id == "12345"


@pytest.mark.parametrize("value", ["", "   ", "x" * 129])
def test_claim_request_rejects_invalid_execution_id(value):
    with pytest.raises(ValidationError):
        DataSyncClaimRequest(execution_id=value)


def test_public_job_allows_creator_to_cancel_without_leaking_private_fields():
    actor = AppUser(id="viewer-1", username="viewer", password_hash="hash", role="viewer")

    job = public_job_from_row(_row(), actor=actor)

    assert job.can_cancel is True
    assert "n8n_execution_id" not in job.model_dump()
    assert "requested_by_user_id" not in job.model_dump()


def test_public_job_allows_sysadmin_but_not_another_viewer_to_cancel():
    sysadmin = AppUser(id="admin-1", username="admin", password_hash="hash", role="sysadmin")
    other_viewer = AppUser(id="viewer-2", username="other", password_hash="hash", role="viewer")

    assert public_job_from_row(_row(), actor=sysadmin).can_cancel is True
    assert public_job_from_row(_row(), actor=other_viewer).can_cancel is False


def test_canceled_job_is_terminal_and_not_cancelable():
    actor = AppUser(id="viewer-1", username="viewer", password_hash="hash", role="viewer")

    job = public_job_from_row(
        _row(status=DataSyncStatus.CANCELED, finished_at=NOW, result_code="canceled"),
        actor=actor,
    )

    assert job.status is DataSyncStatus.CANCELED
    assert job.can_cancel is False
    assert job.public_message == "Sinkronisasi telah dibatalkan."

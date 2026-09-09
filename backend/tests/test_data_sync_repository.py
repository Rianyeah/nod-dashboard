from datetime import datetime, timedelta, timezone
from uuid import uuid4

import pytest
from pydantic import ValidationError


NOW = datetime(2026, 9, 8, 10, 0, tzinfo=timezone.utc)


def job_row(**overrides):
    row = {
        "id": uuid4(),
        "dataset": "impact_service",
        "status": "running",
        "requested_by_user_id": "user-1",
        "requested_by_username": "viewer.one",
        "requested_by_role": "viewer",
        "callback_token_hash": "a" * 64,
        "correlation_id": uuid4(),
        "protocol_version": 1,
        "started_at": NOW,
        "dispatch_finished_at": NOW,
        "dispatch_outcome_code": "accepted",
        "claimed_at": None,
        "callback_received_at": None,
        "n8n_execution_id": None,
        "canceled_at": None,
        "canceled_by_user_id": None,
        "finished_at": None,
        "rows_processed": None,
        "result_code": None,
        "cache_outcome_code": None,
        "created_at": NOW,
        "updated_at": NOW,
    }
    row.update(overrides)
    return row


class Result:
    def __init__(self, *, first=None, rows=(), mapping=None, rowcount=0):
        self._first = first
        self._rows = list(rows)
        self._mapping = mapping
        self.rowcount = rowcount

    def mappings(self):
        return self

    def first(self):
        return self._first

    def all(self):
        return self._rows

    def one(self):
        return self._mapping

    def __iter__(self):
        return iter(self._rows)


class ScriptedSession:
    def __init__(self, handler):
        self.handler = handler
        self.sql = []

    async def execute(self, statement, parameters=None):
        sql = str(statement)
        self.sql.append((sql, parameters or {}))
        return self.handler(sql, parameters or {})


def test_callback_request_enforces_terminal_status_and_result_code_pairing():
    from models.data_sync import DataSyncCallbackRequest

    succeeded = DataSyncCallbackRequest(
        status="succeeded", rows_processed=12, result_code="completed"
    )
    failed = DataSyncCallbackRequest(
        status="failed", result_code="database_write_failed"
    )

    assert succeeded.rows_processed == 12
    assert failed.rows_processed is None
    with pytest.raises(ValidationError):
        DataSyncCallbackRequest(status="succeeded", result_code="workflow_failed")
    with pytest.raises(ValidationError):
        DataSyncCallbackRequest(status="failed", result_code="completed")
    with pytest.raises(ValidationError):
        DataSyncCallbackRequest(
            status="succeeded", rows_processed=-1, result_code="completed"
        )


def test_public_job_redacts_requester_token_and_internal_diagnostics():
    from models.data_sync import public_job_from_row

    payload = public_job_from_row(
        job_row(
            status="failed",
            finished_at=NOW,
            result_code="database_write_failed",
            dispatch_outcome_code="server_unknown",
            cache_outcome_code="unavailable",
        )
    ).model_dump(mode="json")

    assert payload == {
        "id": payload["id"],
        "dataset": "impact_service",
        "status": "failed",
        "started_at": "2026-09-08T10:00:00Z",
        "finished_at": "2026-09-08T10:00:00Z",
        "rows_processed": None,
        "result_code": "database_write_failed",
        "public_message": "Sinkronisasi gagal.",
        "can_cancel": False,
    }
    assert "requested_by_username" not in payload
    assert "callback_token_hash" not in payload
    assert "dispatch_outcome_code" not in payload


@pytest.mark.asyncio
async def test_create_or_join_returns_active_job_before_counting_quota():
    from data_sync_repository import create_or_join_job
    from user_store import AppUser

    active = job_row()

    def handler(sql, _parameters):
        if "pg_advisory_xact_lock" in sql:
            return Result()
        if "status IN ('dispatching', 'running', 'dispatch_unknown')" in sql:
            return Result(first=active)
        raise AssertionError(f"quota or insert should not run for a joined job: {sql}")

    session = ScriptedSession(handler)
    result = await create_or_join_job(
        session,
        dataset="impact_service",
        actor=AppUser("user-1", "viewer.one", "hash", "viewer"),
        job_id=uuid4(),
        token_hash="b" * 64,
        correlation_id=uuid4(),
        now=NOW,
    )

    assert result.created is False
    assert result.job["id"] == active["id"]
    assert result.retry_after is None


@pytest.mark.asyncio
async def test_create_or_join_enforces_durable_hourly_user_limit():
    from data_sync_repository import create_or_join_job
    from user_store import AppUser

    def handler(sql, _parameters):
        if "pg_advisory_xact_lock" in sql:
            return Result()
        if "status IN ('dispatching', 'running', 'dispatch_unknown')" in sql:
            return Result(first=None)
        if "AS job_count" in sql:
            return Result(first={"job_count": 10, "oldest_started_at": NOW - timedelta(minutes=30)})
        raise AssertionError(f"cooldown or insert should not run after quota rejection: {sql}")

    result = await create_or_join_job(
        ScriptedSession(handler),
        dataset="data_master",
        actor=AppUser("user-1", "viewer.one", "hash", "viewer"),
        job_id=uuid4(),
        token_hash="b" * 64,
        correlation_id=uuid4(),
        now=NOW,
    )

    assert result.job is None
    assert result.created is False
    assert result.retry_after == 1800
    assert result.limit_kind == "hourly_quota"


@pytest.mark.asyncio
async def test_create_or_join_enforces_dataset_cooldown():
    from data_sync_repository import create_or_join_job
    from user_store import AppUser

    def handler(sql, _parameters):
        if "pg_advisory_xact_lock" in sql:
            return Result()
        if "status IN ('dispatching', 'running', 'dispatch_unknown')" in sql:
            return Result(first=None)
        if "AS job_count" in sql:
            return Result(first={"job_count": 0, "oldest_started_at": None})
        if "finished_at IS NOT NULL" in sql:
            return Result(first={"finished_at": NOW - timedelta(seconds=25)})
        raise AssertionError(f"insert should not run during cooldown: {sql}")

    result = await create_or_join_job(
        ScriptedSession(handler),
        dataset="activity_enom",
        actor=AppUser("user-1", "viewer.one", "hash", "viewer"),
        job_id=uuid4(),
        token_hash="b" * 64,
        correlation_id=uuid4(),
        now=NOW,
    )

    assert result.retry_after == 35
    assert result.limit_kind == "cooldown"


@pytest.mark.asyncio
async def test_first_claim_executes_and_duplicate_claim_stops():
    from data_sync_repository import claim_job, hash_callback_token

    token = "one-job-token"
    active = job_row(callback_token_hash=hash_callback_token(token))
    duplicate = job_row(
        callback_token_hash=hash_callback_token(token),
        claimed_at=NOW - timedelta(seconds=1),
    )

    first_session = ScriptedSession(
        lambda sql, _params: (
            Result(first=active)
            if "FOR UPDATE" in sql
            else Result(first={**active, "claimed_at": NOW})
        )
    )
    duplicate_session = ScriptedSession(
        lambda sql, _params: Result(first=duplicate)
        if "FOR UPDATE" in sql
        else (_ for _ in ()).throw(AssertionError("duplicate claim must not update"))
    )

    first = await claim_job(
        first_session,
        job_id=active["id"],
        presented_token=token,
        execution_id="execution-1",
        now=NOW,
    )
    second = await claim_job(
        duplicate_session,
        job_id=duplicate["id"],
        presented_token=token,
        execution_id="execution-2",
        now=NOW,
    )

    assert first.authenticated is True
    assert first.execute is True
    assert first_session.sql[-1][1]["execution_id"] == "execution-1"
    assert second.authenticated is True
    assert second.execute is False


@pytest.mark.asyncio
async def test_wrong_callback_token_is_uniformly_unauthenticated():
    from data_sync_repository import claim_job, hash_callback_token

    row = job_row(callback_token_hash=hash_callback_token("correct-token"))
    result = await claim_job(
        ScriptedSession(lambda _sql, _params: Result(first=row)),
        job_id=row["id"],
        presented_token="wrong-token",
        execution_id="execution-1",
        now=NOW,
    )

    assert result.authenticated is False
    assert result.execute is False
    assert result.job is None


@pytest.mark.asyncio
async def test_expiration_uses_distinct_dispatch_and_execution_deadlines():
    from data_sync_repository import expire_stale_jobs

    session = ScriptedSession(lambda _sql, _params: Result(rowcount=3))

    count = await expire_stale_jobs(
        session,
        now=NOW,
        dispatch_timeout_seconds=60,
        job_timeout_seconds=1800,
    )

    sql, params = session.sql[0]
    assert count == 3
    assert "status = 'dispatching'" in sql
    assert "dispatch_timed_out" in sql
    assert "workflow_timed_out" in sql
    assert params["dispatch_expires_before"] == NOW - timedelta(seconds=60)
    assert params["job_expires_before"] == NOW - timedelta(seconds=1800)


@pytest.mark.asyncio
async def test_canceled_job_cannot_be_claimed():
    from data_sync_repository import claim_job, hash_callback_token

    token = "one-job-token"
    canceled = job_row(
        status="canceled",
        finished_at=NOW,
        callback_token_hash=hash_callback_token(token),
    )
    session = ScriptedSession(
        lambda sql, _params: Result(first=canceled)
        if "FOR UPDATE" in sql
        else (_ for _ in ()).throw(AssertionError("canceled claim must not update"))
    )

    result = await claim_job(
        session,
        job_id=canceled["id"],
        presented_token=token,
        execution_id="execution-late",
        now=NOW,
    )

    assert result.authenticated is True
    assert result.execute is False


@pytest.mark.asyncio
async def test_publish_cancellation_sets_terminal_audit_fields_only_while_active():
    from data_sync_repository import publish_cancellation

    canceled = job_row(
        status="canceled",
        finished_at=NOW,
        canceled_at=NOW,
        canceled_by_user_id="admin-1",
        result_code="canceled",
    )
    session = ScriptedSession(lambda _sql, _params: Result(first=canceled))

    row = await publish_cancellation(
        session,
        job_id=canceled["id"],
        canceled_by_user_id="admin-1",
        now=NOW,
    )

    sql, params = session.sql[0]
    assert "status IN ('dispatching', 'running', 'dispatch_unknown')" in sql
    assert params["canceled_by_user_id"] == "admin-1"
    assert row["status"] == "canceled"


@pytest.mark.asyncio
async def test_unclaimed_active_job_cannot_be_completed():
    from data_sync_repository import prepare_completion, hash_callback_token

    token = "one-job-token"
    unclaimed = job_row(
        status="running",
        claimed_at=None,
        callback_token_hash=hash_callback_token(token),
    )

    result = await prepare_completion(
        ScriptedSession(lambda _sql, _params: Result(first=unclaimed)),
        job_id=unclaimed["id"],
        presented_token=token,
        status="succeeded",
        rows_processed=12,
        result_code="completed",
        now=NOW,
    )

    assert result.disposition == "unclaimed"


@pytest.mark.asyncio
async def test_matching_terminal_callback_is_idempotent_but_conflict_is_rejected():
    from data_sync_repository import prepare_completion, hash_callback_token

    token = "one-job-token"
    completed = job_row(
        status="succeeded",
        callback_token_hash=hash_callback_token(token),
        callback_received_at=NOW,
        finished_at=NOW,
        rows_processed=12,
        result_code="completed",
    )

    same = await prepare_completion(
        ScriptedSession(lambda _sql, _params: Result(first=completed)),
        job_id=completed["id"],
        presented_token=token,
        status="succeeded",
        rows_processed=12,
        result_code="completed",
        now=NOW,
    )
    conflict = await prepare_completion(
        ScriptedSession(lambda _sql, _params: Result(first=completed)),
        job_id=completed["id"],
        presented_token=token,
        status="failed",
        rows_processed=None,
        result_code="workflow_failed",
        now=NOW,
    )

    assert same.disposition == "idempotent"
    assert conflict.disposition == "conflict"

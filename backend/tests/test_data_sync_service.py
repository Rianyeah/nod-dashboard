from contextlib import asynccontextmanager
from datetime import datetime, timezone
from types import SimpleNamespace
from uuid import uuid4

import pytest

from config import DataSyncSettings
from user_store import AppUser


NOW = datetime(2026, 9, 8, 10, 0, tzinfo=timezone.utc)


def job_row(**overrides):
    row = {
        "id": uuid4(),
        "dataset": "impact_service",
        "status": "dispatching",
        "started_at": NOW,
        "finished_at": None,
        "rows_processed": None,
        "result_code": None,
    }
    row.update(overrides)
    return row


class Session:
    def __init__(self):
        self.commits = 0

    async def commit(self):
        self.commits += 1


def session_factory(sessions):
    @asynccontextmanager
    async def factory():
        session = Session()
        sessions.append(session)
        yield session

    return factory


def settings(enabled=True):
    return SimpleNamespace(
        public_app_origin="https://dashboard.example",
        data_sync=DataSyncSettings(
            enabled=enabled,
            job_timeout_seconds=1800,
            base_url="https://n8n.example.com" if enabled else "",
            webhook_urls={
                "impact_service": "https://n8n.example.com/webhook/impact-sync"
            }
            if enabled
            else {},
            trigger_api_key="s" * 40 if enabled else "",
        ),
    )


class Repository:
    def __init__(self, *, created=True, row=None):
        self.created = created
        self.row = row or job_row()
        self.events = []

    async def expire_stale_jobs(self, _session, **_kwargs):
        self.events.append("expire")
        return 0

    async def create_or_join_job(self, _session, **_kwargs):
        self.events.append("create" if self.created else "join")
        return SimpleNamespace(job=self.row, created=self.created, retry_after=None)

    async def mark_dispatch_running(self, _session, **_kwargs):
        self.events.append("running")
        self.row = {**self.row, "status": "running"}
        return self.row

    async def mark_dispatch_failed(self, _session, **_kwargs):
        self.events.append("failed")
        self.row = {
            **self.row,
            "status": "failed",
            "finished_at": NOW,
            "result_code": "trigger_rejected",
        }
        return self.row

    async def mark_dispatch_unknown(self, _session, **_kwargs):
        self.events.append("unknown")
        self.row = {**self.row, "status": "dispatch_unknown"}
        return self.row

    async def latest_jobs_by_dataset(self, _session):
        self.events.append("latest")
        return {self.row["dataset"]: self.row}

    async def claim_job(self, _session, **_kwargs):
        self.events.append("claim")
        return SimpleNamespace(authenticated=True, execute=True, job=self.row)

    async def prepare_completion(self, _session, **_kwargs):
        self.events.append("prepare")
        return SimpleNamespace(disposition="prepared", job=self.row)

    async def publish_completion(self, _session, **kwargs):
        self.events.append("publish")
        self.row = {
            **self.row,
            "status": kwargs["status"],
            "finished_at": NOW,
            "rows_processed": kwargs["rows_processed"],
            "result_code": kwargs["result_code"],
        }
        return self.row


class Cache:
    enabled = True

    def __init__(self, events):
        self.events = events

    async def invalidate_namespace(self, namespace):
        self.events.append(f"cache:{namespace}")
        return 1


@pytest.mark.asyncio
async def test_new_start_commits_before_dispatch_and_publishes_running():
    from services.data_sync import DataSyncService
    from services.data_sync_dispatch import DispatchResult

    repository = Repository(created=True)
    sessions = []
    dispatch_observations = []

    async def dispatcher(**kwargs):
        dispatch_observations.append((sum(s.commits for s in sessions), kwargs))
        return DispatchResult("accepted")

    service = DataSyncService(
        settings=settings(),
        session_factory=session_factory(sessions),
        repository=repository,
        dispatcher=dispatcher,
        now=lambda: NOW,
        token_factory=lambda: "single-job-token",
    )
    result = await service.start(
        "impact_service", AppUser("user-1", "viewer.one", "hash", "viewer")
    )

    assert dispatch_observations[0][0] == 1
    assert dispatch_observations[0][1]["job_token"] == "single-job-token"
    assert result.already_running is False
    assert result.job.status == "running"
    assert repository.events == ["expire", "create", "running"]


@pytest.mark.asyncio
async def test_joined_start_never_dispatches_again():
    from services.data_sync import DataSyncService

    repository = Repository(created=False, row=job_row(status="running"))
    calls = 0

    async def dispatcher(**_kwargs):
        nonlocal calls
        calls += 1
        raise AssertionError("joined job must not dispatch")

    service = DataSyncService(
        settings=settings(),
        session_factory=session_factory([]),
        repository=repository,
        dispatcher=dispatcher,
        now=lambda: NOW,
    )
    result = await service.start(
        "impact_service", AppUser("user-2", "viewer.two", "hash", "viewer")
    )

    assert calls == 0
    assert result.already_running is True
    assert result.job.status == "running"


@pytest.mark.asyncio
async def test_ambiguous_dispatch_remains_active_and_is_not_retried():
    from services.data_sync import DataSyncService
    from services.data_sync_dispatch import DispatchResult

    repository = Repository()
    calls = 0

    async def dispatcher(**_kwargs):
        nonlocal calls
        calls += 1
        return DispatchResult("timeout_unknown")

    service = DataSyncService(
        settings=settings(),
        session_factory=session_factory([]),
        repository=repository,
        dispatcher=dispatcher,
        now=lambda: NOW,
    )
    result = await service.start(
        "impact_service", AppUser("user-1", "viewer.one", "hash", "viewer")
    )

    assert calls == 1
    assert result.job.status == "dispatch_unknown"


@pytest.mark.asyncio
async def test_success_callback_invalidates_dataset_cache_before_publish():
    from services.data_sync import DataSyncService

    repository = Repository(row=job_row(status="running"))
    events = repository.events
    service = DataSyncService(
        settings=settings(),
        session_factory=session_factory([]),
        repository=repository,
        cache=Cache(events),
        now=lambda: NOW,
    )

    result = await service.complete(
        repository.row["id"],
        "single-job-token",
        status="succeeded",
        rows_processed=21,
        result_code="completed",
    )

    assert result.status == "succeeded"
    assert events == ["expire", "prepare", "cache:filters", "publish"]


@pytest.mark.asyncio
async def test_disabled_feature_rejects_new_start_but_status_remains_available():
    from services.data_sync import DataSyncDisabledError, DataSyncService

    repository = Repository(row=job_row(status="running"))
    service = DataSyncService(
        settings=settings(enabled=False),
        session_factory=session_factory([]),
        repository=repository,
        now=lambda: NOW,
    )

    with pytest.raises(DataSyncDisabledError):
        await service.start(
            "impact_service", AppUser("user-1", "viewer.one", "hash", "viewer")
        )
    status = await service.status()

    assert status.enabled is False
    assert status.jobs["impact_service"].status == "running"

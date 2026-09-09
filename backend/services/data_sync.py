"""Application service coordinating durable data-sync jobs."""

from __future__ import annotations

import secrets
from datetime import datetime, timezone
from typing import Callable
from uuid import UUID, uuid4

import data_sync_repository
from cache import CacheUnavailableError, redis_cache
from config import SecuritySettings
from database import async_session
from models.data_sync import (
    DataSyncClaimResponse,
    DataSyncDataset,
    DataSyncPublicJob,
    DataSyncStartResponse,
    DataSyncStatusResponse,
    public_job_from_row,
)
from services.data_sync_dispatch import DispatchOutcome, dispatch_n8n
from user_store import AppUser


CACHE_NAMESPACES_BY_DATASET = {
    "impact_service": ("filters",),
    "data_master": ("data-potensi", "overview", "reporting", "filters"),
    "activity_enom": ("reporting",),
}


class DataSyncDisabledError(RuntimeError):
    pass


class DataSyncRateLimitError(RuntimeError):
    def __init__(self, retry_after: int):
        super().__init__("Data sync rate limit exceeded")
        self.retry_after = retry_after


class DataSyncAuthenticationError(RuntimeError):
    pass


class DataSyncConflictError(RuntimeError):
    pass


def _iso_z(value: datetime) -> str:
    return value.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


class DataSyncService:
    def __init__(
        self,
        *,
        settings: SecuritySettings,
        session_factory=async_session,
        repository=data_sync_repository,
        dispatcher=dispatch_n8n,
        cache=redis_cache,
        now: Callable[[], datetime] | None = None,
        token_factory: Callable[[], str] | None = None,
    ):
        self.settings = settings
        self.session_factory = session_factory
        self.repository = repository
        self.dispatcher = dispatcher
        self.cache = cache
        self.now = now or (lambda: datetime.now(timezone.utc))
        self.token_factory = token_factory or (lambda: secrets.token_urlsafe(32))

    async def start(self, dataset: str, actor: AppUser) -> DataSyncStartResponse:
        if not self.settings.data_sync.enabled:
            raise DataSyncDisabledError

        started_at = self.now()
        job_id = uuid4()
        correlation_id = uuid4()
        job_token = self.token_factory()
        async with self.session_factory() as session:
            await self.repository.expire_stale_jobs(
                session,
                now=started_at,
                timeout_seconds=self.settings.data_sync.job_timeout_seconds,
            )
            start_result = await self.repository.create_or_join_job(
                session,
                dataset=dataset,
                actor=actor,
                job_id=job_id,
                token_hash=data_sync_repository.hash_callback_token(job_token),
                correlation_id=correlation_id,
                now=started_at,
            )
            await session.commit()

        if start_result.retry_after is not None:
            raise DataSyncRateLimitError(start_result.retry_after)
        if not start_result.created:
            return DataSyncStartResponse(
                job=public_job_from_row(start_result.job),
                already_running=True,
            )

        dispatch_result = await self.dispatcher(
            settings=self.settings.data_sync,
            dataset=dataset,
            job_id=job_id,
            requested_by=actor.username,
            requested_at=_iso_z(started_at),
            public_app_origin=self.settings.public_app_origin,
            job_token=job_token,
            correlation_id=str(correlation_id),
        )
        dispatch_finished_at = self.now()
        async with self.session_factory() as session:
            if dispatch_result.outcome == DispatchOutcome.ACCEPTED:
                row = await self.repository.mark_dispatch_running(
                    session,
                    job_id=job_id,
                    finished_at=dispatch_finished_at,
                    outcome_code=str(dispatch_result.outcome),
                )
            elif dispatch_result.outcome == DispatchOutcome.REJECTED_4XX:
                row = await self.repository.mark_dispatch_failed(
                    session,
                    job_id=job_id,
                    finished_at=dispatch_finished_at,
                    outcome_code=str(dispatch_result.outcome),
                )
            else:
                row = await self.repository.mark_dispatch_unknown(
                    session,
                    job_id=job_id,
                    finished_at=dispatch_finished_at,
                    outcome_code=str(dispatch_result.outcome),
                )
            if row is None:
                latest = await self.repository.latest_jobs_by_dataset(session)
                row = latest.get(dataset)
            await session.commit()

        if row is None:
            raise RuntimeError("Data-sync job disappeared after dispatch")
        return DataSyncStartResponse(
            job=public_job_from_row(row),
            already_running=False,
        )

    async def status(self) -> DataSyncStatusResponse:
        checked_at = self.now()
        async with self.session_factory() as session:
            await self.repository.expire_stale_jobs(
                session,
                now=checked_at,
                timeout_seconds=self.settings.data_sync.job_timeout_seconds,
            )
            latest = await self.repository.latest_jobs_by_dataset(session)
            await session.commit()
        jobs = {
            dataset: public_job_from_row(latest[dataset]) if dataset in latest else None
            for dataset in (item.value for item in DataSyncDataset)
        }
        return DataSyncStatusResponse(
            enabled=self.settings.data_sync.enabled,
            jobs=jobs,
        )

    async def claim(self, job_id: UUID, token: str) -> DataSyncClaimResponse:
        checked_at = self.now()
        async with self.session_factory() as session:
            await self.repository.expire_stale_jobs(
                session,
                now=checked_at,
                timeout_seconds=self.settings.data_sync.job_timeout_seconds,
            )
            result = await self.repository.claim_job(
                session,
                job_id=job_id,
                presented_token=token,
                now=checked_at,
            )
            await session.commit()
        if not result.authenticated:
            raise DataSyncAuthenticationError
        return DataSyncClaimResponse(execute=result.execute)

    async def complete(
        self,
        job_id: UUID,
        token: str,
        *,
        status: str,
        rows_processed: int | None,
        result_code: str,
    ) -> DataSyncPublicJob:
        completed_at = self.now()
        async with self.session_factory() as session:
            await self.repository.expire_stale_jobs(
                session,
                now=completed_at,
                timeout_seconds=self.settings.data_sync.job_timeout_seconds,
            )
            prepared = await self.repository.prepare_completion(
                session,
                job_id=job_id,
                presented_token=token,
                status=status,
                rows_processed=rows_processed,
                result_code=result_code,
                now=completed_at,
            )
            if prepared.disposition == "unauthenticated":
                await session.commit()
                raise DataSyncAuthenticationError
            if prepared.disposition in {"conflict", "unclaimed"}:
                await session.commit()
                raise DataSyncConflictError
            if prepared.disposition == "idempotent":
                await session.commit()
                return public_job_from_row(prepared.job)

            cache_outcome = None
            if status == "succeeded":
                cache_outcome = await self._invalidate_dataset_cache(
                    str(prepared.job["dataset"])
                )
            row = await self.repository.publish_completion(
                session,
                job_id=job_id,
                status=status,
                rows_processed=rows_processed,
                result_code=result_code,
                cache_outcome_code=cache_outcome,
                now=completed_at,
            )
            await session.commit()
        if row is None:
            raise DataSyncConflictError
        return public_job_from_row(row)

    async def _invalidate_dataset_cache(self, dataset: str) -> str:
        if not self.cache.enabled:
            return "disabled"
        try:
            for namespace in CACHE_NAMESPACES_BY_DATASET[dataset]:
                await self.cache.invalidate_namespace(namespace)
        except CacheUnavailableError:
            return "unavailable"
        return "invalidated"

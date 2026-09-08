"""Transactional PostgreSQL operations for durable data-sync jobs."""

from __future__ import annotations

import hashlib
import math
import secrets
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Mapping
from uuid import UUID

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from user_store import AppUser


ACTIVE_STATUS_SQL = "'dispatching', 'running', 'dispatch_unknown'"
DUMMY_TOKEN_HASH = hashlib.sha256(b"data-sync-unknown-job").hexdigest()


@dataclass(frozen=True)
class StartResult:
    job: Mapping[str, object] | None
    created: bool
    retry_after: int | None = None


@dataclass(frozen=True)
class ClaimResult:
    authenticated: bool
    execute: bool
    job: Mapping[str, object] | None = None


@dataclass(frozen=True)
class CompletionResult:
    disposition: str
    job: Mapping[str, object] | None = None


def hash_callback_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _token_matches(stored_hash: object, presented_token: str) -> bool:
    candidate = hash_callback_token(presented_token)
    expected = str(stored_hash) if stored_hash else DUMMY_TOKEN_HASH
    return secrets.compare_digest(expected, candidate)


async def expire_stale_jobs(
    session: AsyncSession, *, now: datetime, timeout_seconds: int
) -> int:
    result = await session.execute(
        text(
            f"""
            UPDATE public.data_sync_jobs
            SET status = 'timed_out', finished_at = :now,
                result_code = 'timed_out', updated_at = :now
            WHERE status IN ({ACTIVE_STATUS_SQL})
              AND started_at <= :expires_before
            """
        ),
        {"now": now, "expires_before": now - timedelta(seconds=timeout_seconds)},
    )
    return int(result.rowcount or 0)


async def _active_job(
    session: AsyncSession, dataset: str
) -> Mapping[str, object] | None:
    result = await session.execute(
        text(
            f"""
            SELECT * FROM public.data_sync_jobs
            WHERE dataset = :dataset
              AND status IN ({ACTIVE_STATUS_SQL})
            ORDER BY started_at DESC
            LIMIT 1
            """
        ),
        {"dataset": dataset},
    )
    return result.mappings().first()


async def create_or_join_job(
    session: AsyncSession,
    *,
    dataset: str,
    actor: AppUser,
    job_id: UUID,
    token_hash: str,
    correlation_id: UUID,
    now: datetime,
) -> StartResult:
    await session.execute(
        text("SELECT pg_advisory_xact_lock(hashtext(:actor_key))"),
        {"actor_key": f"data-sync-user:{actor.id}"},
    )

    active = await _active_job(session, dataset)
    if active is not None:
        return StartResult(job=active, created=False)

    quota = await session.execute(
        text(
            """
            SELECT COUNT(*) AS job_count, MIN(started_at) AS oldest_started_at
            FROM public.data_sync_jobs
            WHERE requested_by_user_id = :user_id
              AND started_at > :window_start
            """
        ),
        {"user_id": actor.id, "window_start": now - timedelta(hours=1)},
    )
    quota_row = quota.mappings().first()
    if quota_row and int(quota_row["job_count"]) >= 10:
        oldest = quota_row["oldest_started_at"]
        retry_after = max(1, math.ceil(3600 - (now - oldest).total_seconds()))
        return StartResult(job=None, created=False, retry_after=retry_after)

    latest_terminal = await session.execute(
        text(
            """
            SELECT finished_at FROM public.data_sync_jobs
            WHERE dataset = :dataset
              AND finished_at IS NOT NULL
            ORDER BY finished_at DESC
            LIMIT 1
            """
        ),
        {"dataset": dataset},
    )
    terminal_row = latest_terminal.mappings().first()
    if terminal_row is not None:
        elapsed = (now - terminal_row["finished_at"]).total_seconds()
        if elapsed < 60:
            return StartResult(
                job=None,
                created=False,
                retry_after=max(1, math.ceil(60 - elapsed)),
            )

    inserted = await session.execute(
        text(
            f"""
            INSERT INTO public.data_sync_jobs (
                id, dataset, status, requested_by_user_id,
                requested_by_username, requested_by_role,
                callback_token_hash, correlation_id, protocol_version,
                started_at, created_at, updated_at
            ) VALUES (
                :id, :dataset, 'dispatching', :user_id,
                :username, :role, :token_hash, :correlation_id, 1,
                :now, :now, :now
            )
            ON CONFLICT (dataset)
            WHERE status IN ({ACTIVE_STATUS_SQL})
            DO NOTHING
            RETURNING *
            """
        ),
        {
            "id": job_id,
            "dataset": dataset,
            "user_id": actor.id,
            "username": actor.username,
            "role": actor.role,
            "token_hash": token_hash,
            "correlation_id": correlation_id,
            "now": now,
        },
    )
    job = inserted.mappings().first()
    if job is not None:
        return StartResult(job=job, created=True)

    concurrent = await _active_job(session, dataset)
    if concurrent is None:
        raise RuntimeError("Active data-sync job disappeared after conflict")
    return StartResult(job=concurrent, created=False)


async def latest_jobs_by_dataset(
    session: AsyncSession,
) -> dict[str, Mapping[str, object]]:
    result = await session.execute(
        text(
            """
            SELECT DISTINCT ON (dataset) *
            FROM public.data_sync_jobs
            ORDER BY dataset, started_at DESC
            """
        )
    )
    return {str(row["dataset"]): row for row in result.mappings().all()}


async def _mark_dispatch(
    session: AsyncSession,
    *,
    job_id: UUID,
    status: str,
    finished_at: datetime,
    outcome_code: str,
    result_code: str | None,
) -> Mapping[str, object] | None:
    result = await session.execute(
        text(
            """
            UPDATE public.data_sync_jobs
            SET status = :status,
                dispatch_finished_at = :finished_at,
                dispatch_outcome_code = :outcome_code,
                finished_at = CASE WHEN :result_code IS NULL THEN NULL ELSE :finished_at END,
                result_code = :result_code,
                updated_at = :finished_at
            WHERE id = CAST(:id AS uuid) AND status = 'dispatching'
            RETURNING *
            """
        ),
        {
            "id": str(job_id),
            "status": status,
            "finished_at": finished_at,
            "outcome_code": outcome_code,
            "result_code": result_code,
        },
    )
    return result.mappings().first()


async def mark_dispatch_running(
    session: AsyncSession, *, job_id: UUID, finished_at: datetime, outcome_code: str
) -> Mapping[str, object] | None:
    return await _mark_dispatch(
        session,
        job_id=job_id,
        status="running",
        finished_at=finished_at,
        outcome_code=outcome_code,
        result_code=None,
    )


async def mark_dispatch_failed(
    session: AsyncSession, *, job_id: UUID, finished_at: datetime, outcome_code: str
) -> Mapping[str, object] | None:
    return await _mark_dispatch(
        session,
        job_id=job_id,
        status="failed",
        finished_at=finished_at,
        outcome_code=outcome_code,
        result_code="trigger_rejected",
    )


async def mark_dispatch_unknown(
    session: AsyncSession, *, job_id: UUID, finished_at: datetime, outcome_code: str
) -> Mapping[str, object] | None:
    return await _mark_dispatch(
        session,
        job_id=job_id,
        status="dispatch_unknown",
        finished_at=finished_at,
        outcome_code=outcome_code,
        result_code=None,
    )


async def _locked_job(
    session: AsyncSession, job_id: UUID
) -> Mapping[str, object] | None:
    result = await session.execute(
        text(
            """
            SELECT * FROM public.data_sync_jobs
            WHERE id = CAST(:id AS uuid)
            FOR UPDATE
            """
        ),
        {"id": str(job_id)},
    )
    return result.mappings().first()


async def claim_job(
    session: AsyncSession,
    *,
    job_id: UUID,
    presented_token: str,
    now: datetime,
) -> ClaimResult:
    job = await _locked_job(session, job_id)
    if not _token_matches(
        job.get("callback_token_hash") if job is not None else None,
        presented_token,
    ):
        return ClaimResult(authenticated=False, execute=False)
    if job["status"] in {"succeeded", "failed", "timed_out"} or job["claimed_at"]:
        return ClaimResult(authenticated=True, execute=False, job=job)

    result = await session.execute(
        text(
            """
            UPDATE public.data_sync_jobs
            SET status = 'running', claimed_at = :now, updated_at = :now
            WHERE id = CAST(:id AS uuid)
            RETURNING *
            """
        ),
        {"id": str(job_id), "now": now},
    )
    return ClaimResult(
        authenticated=True,
        execute=True,
        job=result.mappings().first(),
    )


async def prepare_completion(
    session: AsyncSession,
    *,
    job_id: UUID,
    presented_token: str,
    status: str,
    rows_processed: int | None,
    result_code: str,
    now: datetime,
) -> CompletionResult:
    job = await _locked_job(session, job_id)
    if not _token_matches(
        job.get("callback_token_hash") if job is not None else None,
        presented_token,
    ):
        return CompletionResult(disposition="unauthenticated")
    if job["status"] in {"succeeded", "failed", "timed_out"}:
        is_same = (
            job["status"] == status
            and job["rows_processed"] == rows_processed
            and job["result_code"] == result_code
        )
        return CompletionResult(
            disposition="idempotent" if is_same else "conflict",
            job=job,
        )
    return CompletionResult(disposition="prepared", job=job)


async def publish_completion(
    session: AsyncSession,
    *,
    job_id: UUID,
    status: str,
    rows_processed: int | None,
    result_code: str,
    cache_outcome_code: str | None,
    now: datetime,
) -> Mapping[str, object] | None:
    result = await session.execute(
        text(
            """
            UPDATE public.data_sync_jobs
            SET status = :status, rows_processed = :rows_processed,
                result_code = :result_code,
                cache_outcome_code = :cache_outcome_code,
                callback_received_at = :now, finished_at = :now,
                updated_at = :now
            WHERE id = CAST(:id AS uuid)
              AND status IN ('dispatching', 'running', 'dispatch_unknown')
            RETURNING *
            """
        ),
        {
            "id": str(job_id),
            "status": status,
            "rows_processed": rows_processed,
            "result_code": result_code,
            "cache_outcome_code": cache_outcome_code,
            "now": now,
        },
    )
    return result.mappings().first()

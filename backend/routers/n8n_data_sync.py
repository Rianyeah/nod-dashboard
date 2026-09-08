"""Per-job machine endpoints used only by the matching n8n execution."""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Header, HTTPException, Request, status

from models.data_sync import (
    DataSyncCallbackRequest,
    DataSyncCallbackResponse,
    DataSyncClaimResponse,
)
from services.data_sync import (
    DataSyncAuthenticationError,
    DataSyncConflictError,
    DataSyncService,
)


router = APIRouter(prefix="/integrations/n8n/data-sync", tags=["N8N Data Sync"])


def _service(request: Request) -> DataSyncService:
    return request.app.state.data_sync_service


def _credential_error() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid data sync credential",
    )


def _token_or_reject(token: str | None) -> str:
    if not token or len(token) > 256:
        raise _credential_error()
    return token


@router.post("/{job_id}/claim", response_model=DataSyncClaimResponse)
async def claim_data_sync_job(
    job_id: UUID,
    request: Request,
    x_data_sync_job_token: str | None = Header(
        default=None,
        alias="X-Data-Sync-Job-Token",
    ),
):
    token = _token_or_reject(x_data_sync_job_token)
    try:
        return await _service(request).claim(job_id, token)
    except DataSyncAuthenticationError as exc:
        raise _credential_error() from exc


@router.post("/{job_id}/callback", response_model=DataSyncCallbackResponse)
async def complete_data_sync_job(
    job_id: UUID,
    payload: DataSyncCallbackRequest,
    request: Request,
    x_data_sync_job_token: str | None = Header(
        default=None,
        alias="X-Data-Sync-Job-Token",
    ),
):
    token = _token_or_reject(x_data_sync_job_token)
    try:
        job = await _service(request).complete(
            job_id,
            token,
            status=payload.status,
            rows_processed=payload.rows_processed,
            result_code=payload.result_code,
        )
    except DataSyncAuthenticationError as exc:
        raise _credential_error() from exc
    except DataSyncConflictError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Data sync job cannot be completed",
        ) from exc
    return DataSyncCallbackResponse(job=job)

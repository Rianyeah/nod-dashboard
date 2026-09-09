"""Authenticated browser endpoints for shared dashboard data-sync state."""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, status

from models.data_sync import (
    DataSyncDataset,
    DataSyncCancelResponse,
    DataSyncStartResponse,
    DataSyncStatusResponse,
)
from security import require_permission
from services.data_sync import (
    DataSyncDisabledError,
    DataSyncCancelForbiddenError,
    DataSyncCancelNotFoundError,
    DataSyncCancelUnavailableError,
    DataSyncConflictError,
    DataSyncRateLimitError,
    DataSyncService,
)
from user_store import AppUser


router = APIRouter(prefix="/data-sync", tags=["Data Sync"])


def _service(request: Request) -> DataSyncService:
    return request.app.state.data_sync_service


@router.get("/status", response_model=DataSyncStatusResponse)
async def get_data_sync_status(
    request: Request,
    actor: AppUser = Depends(require_permission("dashboard:view")),
):
    return await _service(request).status(actor)


@router.post("/{dataset}", response_model=DataSyncStartResponse)
async def start_data_sync(
    dataset: DataSyncDataset,
    request: Request,
    actor: AppUser = Depends(require_permission("data_sync:trigger")),
):
    try:
        return await _service(request).start(dataset.value, actor)
    except DataSyncDisabledError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Sinkronisasi data sedang dinonaktifkan",
        ) from exc
    except DataSyncRateLimitError as exc:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Terlalu banyak permintaan sinkronisasi",
            headers={"Retry-After": str(exc.retry_after)},
        ) from exc


@router.post(
    "/{dataset}/{job_id}/cancel",
    response_model=DataSyncCancelResponse,
)
async def cancel_data_sync(
    dataset: DataSyncDataset,
    job_id: UUID,
    request: Request,
    actor: AppUser = Depends(require_permission("data_sync:trigger")),
):
    try:
        return await _service(request).cancel(dataset.value, job_id, actor)
    except DataSyncCancelForbiddenError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden") from exc
    except DataSyncCancelNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Data sync job not found") from exc
    except DataSyncCancelUnavailableError as exc:
        code = status.HTTP_504_GATEWAY_TIMEOUT if exc.timed_out else status.HTTP_502_BAD_GATEWAY
        raise HTTPException(
            status_code=code,
            detail="Execution belum berhasil dihentikan. Coba batalkan kembali.",
        ) from exc
    except DataSyncConflictError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Data sync job state changed",
        ) from exc

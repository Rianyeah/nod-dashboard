"""Validated public and machine contracts for dashboard data sync."""

from __future__ import annotations

from datetime import datetime
from enum import StrEnum
from typing import Literal, Mapping
from uuid import UUID

from pydantic import BaseModel, Field, model_validator


class DataSyncDataset(StrEnum):
    IMPACT_SERVICE = "impact_service"
    DATA_MASTER = "data_master"
    ACTIVITY_ENOM = "activity_enom"


class DataSyncStatus(StrEnum):
    DISPATCHING = "dispatching"
    RUNNING = "running"
    DISPATCH_UNKNOWN = "dispatch_unknown"
    SUCCEEDED = "succeeded"
    FAILED = "failed"
    TIMED_OUT = "timed_out"


ACTIVE_DATA_SYNC_STATUSES = frozenset(
    {
        DataSyncStatus.DISPATCHING,
        DataSyncStatus.RUNNING,
        DataSyncStatus.DISPATCH_UNKNOWN,
    }
)
TERMINAL_DATA_SYNC_STATUSES = frozenset(
    {
        DataSyncStatus.SUCCEEDED,
        DataSyncStatus.FAILED,
        DataSyncStatus.TIMED_OUT,
    }
)

PUBLIC_MESSAGES = {
    "completed": "Sinkronisasi selesai.",
    "workflow_failed": "Sinkronisasi gagal.",
    "source_validation_failed": "Sinkronisasi gagal.",
    "database_write_failed": "Sinkronisasi gagal.",
    "trigger_rejected": "Workflow tidak dapat dimulai.",
    "timed_out": "Sinkronisasi melewati batas waktu.",
}


class DataSyncPublicJob(BaseModel):
    id: UUID
    dataset: DataSyncDataset
    status: DataSyncStatus
    started_at: datetime
    finished_at: datetime | None = None
    rows_processed: int | None = Field(default=None, ge=0)
    result_code: str | None = None
    public_message: str | None = None


class DataSyncStartResponse(BaseModel):
    job: DataSyncPublicJob
    already_running: bool


class DataSyncStatusResponse(BaseModel):
    enabled: bool
    jobs: dict[DataSyncDataset, DataSyncPublicJob | None]


class DataSyncClaimResponse(BaseModel):
    execute: bool


class DataSyncCallbackRequest(BaseModel):
    status: Literal["succeeded", "failed"]
    rows_processed: int | None = Field(default=None, ge=0)
    result_code: Literal[
        "completed",
        "workflow_failed",
        "source_validation_failed",
        "database_write_failed",
    ]

    @model_validator(mode="after")
    def validate_status_result_pair(self) -> "DataSyncCallbackRequest":
        if self.status == "succeeded" and self.result_code != "completed":
            raise ValueError("succeeded callbacks require completed")
        if self.status == "failed" and self.result_code == "completed":
            raise ValueError("failed callbacks require a failure result code")
        return self


class DataSyncCallbackResponse(BaseModel):
    accepted: bool = True
    job: DataSyncPublicJob


def public_job_from_row(row: Mapping[str, object]) -> DataSyncPublicJob:
    result_code = row.get("result_code")
    return DataSyncPublicJob(
        id=row["id"],
        dataset=row["dataset"],
        status=row["status"],
        started_at=row["started_at"],
        finished_at=row.get("finished_at"),
        rows_processed=row.get("rows_processed"),
        result_code=result_code,
        public_message=PUBLIC_MESSAGES.get(str(result_code)) if result_code else None,
    )

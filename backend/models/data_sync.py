"""Validated public and machine contracts for dashboard data sync."""

from __future__ import annotations

from datetime import datetime
from enum import StrEnum
from typing import Literal, Mapping
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from user_store import AppUser


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
    CANCELED = "canceled"


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
        DataSyncStatus.CANCELED,
    }
)

PUBLIC_MESSAGES = {
    "completed": "Sinkronisasi selesai.",
    "workflow_failed": "Sinkronisasi gagal.",
    "source_validation_failed": "Sinkronisasi gagal.",
    "database_write_failed": "Sinkronisasi gagal.",
    "trigger_rejected": "Workflow tidak dapat dimulai.",
    "timed_out": "Sinkronisasi melewati batas waktu.",
    "dispatch_timed_out": "Workflow tidak merespons dalam 60 detik.",
    "workflow_timed_out": "Sinkronisasi melewati batas waktu 30 menit.",
    "canceled": "Sinkronisasi telah dibatalkan.",
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
    can_cancel: bool = False


class DataSyncStartResponse(BaseModel):
    job: DataSyncPublicJob
    already_running: bool


class DataSyncStatusResponse(BaseModel):
    enabled: bool
    jobs: dict[DataSyncDataset, DataSyncPublicJob | None]


class DataSyncClaimResponse(BaseModel):
    execute: bool


class DataSyncClaimRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    execution_id: str = Field(min_length=1, max_length=128)

    @field_validator("execution_id")
    @classmethod
    def normalize_execution_id(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("execution_id must not be blank")
        return normalized


class DataSyncCallbackRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

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


class DataSyncCancelResponse(BaseModel):
    canceled: bool
    job: DataSyncPublicJob


def public_job_from_row(
    row: Mapping[str, object], *, actor: AppUser | None = None
) -> DataSyncPublicJob:
    result_code = row.get("result_code")
    status = DataSyncStatus(str(row["status"]))
    can_cancel = bool(
        actor
        and status in ACTIVE_DATA_SYNC_STATUSES
        and (
            str(row.get("requested_by_user_id")) == str(actor.id)
            or actor.role == "sysadmin"
        )
    )
    return DataSyncPublicJob(
        id=row["id"],
        dataset=row["dataset"],
        status=status,
        started_at=row["started_at"],
        finished_at=row.get("finished_at"),
        rows_processed=row.get("rows_processed"),
        result_code=result_code,
        public_message=PUBLIC_MESSAGES.get(str(result_code)) if result_code else None,
        can_cancel=can_cancel,
    )

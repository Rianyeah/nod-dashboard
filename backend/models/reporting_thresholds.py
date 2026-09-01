"""Typed contracts for effective-dated Network Reporting thresholds."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, model_validator


class AvailabilityThresholdInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    diamond: float = Field(gt=0, le=100)
    platinum: float = Field(gt=0, le=100)
    gold: float = Field(gt=0, le=100)
    silver: float = Field(gt=0, le=100)
    bronze: float = Field(gt=0, le=100)


class ThresholdVersionInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    availability: AvailabilityThresholdInput
    revenue_u30_upper: int = Field(gt=0)
    revenue_u60_upper: int = Field(gt=0)
    payload_target_tb: float = Field(gt=0)

    @model_validator(mode="after")
    def validate_revenue_boundaries(self):
        if self.revenue_u30_upper >= self.revenue_u60_upper:
            raise ValueError("Batas U30 harus lebih kecil dari batas U60")
        return self


class ReportingThresholdSnapshot(BaseModel):
    availability: dict[str, float | None]
    revenue_u30_upper: int | None = None
    revenue_u60_upper: int | None = None
    payload_target_tb: float | None = None
    effective_month: str | None = None
    requested_month: str
    complete: bool = False
    missing_keys: list[str] = Field(default_factory=list)
    version: str = "unconfigured"
    updated_by: str | None = None
    updated_at: datetime | None = None


class RevenueTargetInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    target_revenue: int = Field(ge=0)
    note: str | None = Field(default=None, max_length=500)

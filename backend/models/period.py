"""Shared period metadata returned by month-filtered dashboards."""

from pydantic import BaseModel, Field


class MonthPeriodMeta(BaseModel):
    period_start: str
    period_end: str
    comparison_start: str
    comparison_end: str
    active_months: list[str] = Field(default_factory=list)
    missing_months_by_source: dict[str, list[str]] = Field(default_factory=dict)

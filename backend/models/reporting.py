"""
Pydantic schemas for network reporting data.
"""
from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, Field, model_validator

from models.period import MonthPeriodMeta
from models.reporting_thresholds import ReportingThresholdSnapshot


class ReportingScorecard(BaseModel):
    """Top-level KPI scorecards for the reporting page."""
    total_sites: int = 0
    epm_sites: int = 0
    non_epm_sites: int = 0
    total_revenue: int = 0
    total_payload: int = 0
    revenue_ytd: int = 0
    payload_ytd: int = 0
    avg_availability: Optional[float] = None
    period_meta: MonthPeriodMeta | None = None


class RevenueByKabupaten(BaseModel):
    """Revenue & payload breakdown by Kabupaten/Kota."""
    kabupaten: Optional[str] = None
    total_sites: int = 0
    rev: int = 0
    rev_voice: int = 0
    rev_bb: int = 0
    rev_dig: int = 0
    rev_sms: int = 0
    rev_ir: int = 0
    payload: int = 0
    pld_2g: int = 0
    pld_3g: int = 0
    pld_4g: int = 0
    pld_5g: int = 0
    traffic: int = 0
    trf_2g: int = 0
    trf_3g: int = 0
    trf_4g: int = 0
    avg_availability: Optional[float] = None
    ticket_swfm_bps: int = 0
    ticket_swfm_ts: int = 0
    backup_sukses_bps: int = 0
    backup_sukses_rate: float = 0.0
    proker_open: int = 0
    proker_closed: int = 0


class SiteClassByKabupaten(BaseModel):
    """Site class distribution cross-tab by Kabupaten/Kota."""
    kabupaten: Optional[str] = None
    diamond: int = 0
    platinum: int = 0
    gold: int = 0
    silver: int = 0
    bronze: int = 0
    total: int = 0


class BatteryByKabupaten(BaseModel):
    """Battery type distribution cross-tab by Kabupaten/Kota."""
    kabupaten: Optional[str] = None
    lithium: int = 0
    vrla: int = 0
    tidak_ada: int = 0
    total: int = 0


class RevenueTrendItem(BaseModel):
    """Single month in revenue trend."""
    trx_month: str
    total_revenue: int = 0
    total_payload: int = 0
    total_traffic: int = 0
    avg_availability: Optional[float] = None


class SitePerformance(BaseModel):
    """Latest Revenue and Payload values for one site with calendar-month MoM."""
    site_id: str
    trx_month: str | None = None
    previous_trx_month: str | None = None
    total_revenue: int | None = None
    previous_revenue: int | None = None
    revenue_mom_pct: float | None = None
    total_payload: int | None = None
    previous_payload: int | None = None
    payload_mom_pct: float | None = None


class ReportingContribution(BaseModel):
    """Selected-scope relationship to the Regional Jatim baseline."""

    regional_value: int | float | None = None
    contribution_pct: float | None = None
    difference_pp: float | None = None


class ReportingTarget(BaseModel):
    target_revenue: int = 0
    selected_months: int = 0
    configured_months: int = 0
    missing_months: list[str] = Field(default_factory=list)
    complete: bool = False
    gap: int | None = None
    attainment_pct: float | None = None


class ReportingMetricFact(BaseModel):
    value: int | float | None = None
    previous_value: int | float | None = None
    delta_pct: float | None = None
    contribution: ReportingContribution = Field(default_factory=ReportingContribution)
    severity: Literal["success", "warning", "info", "unavailable"] = "unavailable"


class ReportingRevenueFact(ReportingMetricFact):
    target: ReportingTarget = Field(default_factory=ReportingTarget)


class ReportingSourceCoverage(BaseModel):
    source_key: str
    label: str
    expected_periods: list[str] = Field(default_factory=list)
    available_periods: list[str] = Field(default_factory=list)
    missing_periods: list[str] = Field(default_factory=list)
    latest_data_period: str | None = None
    record_count: int | None = None
    mapped_sites: int | None = None
    total_sites: int | None = None
    last_refreshed_at: datetime | None = None
    status: Literal["complete", "partial", "missing", "untracked"]


class ReportingOverviewScorecards(BaseModel):
    total_sites: int = 0
    epm_sites: int = 0
    non_epm_sites: int = 0
    total_revenue: int = 0
    total_payload: int = 0
    revenue_ytd: int = 0
    payload_ytd: int = 0
    avg_availability: float | None = None


class ReportingAreaRow(BaseModel):
    area_key: str
    kabupaten: str
    is_unmapped: bool = False
    total_sites: int = 0
    revenue: int = 0
    rev_voice: int = 0
    rev_bb: int = 0
    rev_dig: int = 0
    rev_sms: int = 0
    rev_ir: int = 0
    payload: int = 0
    pld_2g: int = 0
    pld_3g: int = 0
    pld_4g: int = 0
    pld_5g: int = 0
    traffic: int = 0
    trf_2g: int = 0
    trf_3g: int = 0
    trf_4g: int = 0
    total_time_minutes: float = 0
    outage_minutes: float = 0
    avg_availability: float | None = None
    sla_status: Literal["met", "missed", "unavailable"]
    ticket_swfm_bps: int = 0
    ticket_swfm_ts: int = 0
    backup_sukses_bps: int = 0
    backup_sukses_rate: float | None = None
    proker_open: int = 0
    proker_closed: int = 0
    revenue_delta_pct: float | None = None
    payload_delta_pct: float | None = None


class ReportingOverview(BaseModel):
    scope_label: str
    scorecards: ReportingOverviewScorecards
    revenue: ReportingRevenueFact
    payload: ReportingMetricFact
    availability: ReportingMetricFact
    thresholds: ReportingThresholdSnapshot | None = None
    coverage: list[ReportingSourceCoverage] = Field(default_factory=list)
    trend: list[RevenueTrendItem] = Field(default_factory=list)
    period_meta: MonthPeriodMeta


class ReportingSiteQuery(BaseModel):
    page: int = Field(default=1, ge=1)
    page_size: int = Field(default=25, ge=1, le=100)
    sort_by: Literal[
        "site_id",
        "site_class",
        "status_site",
        "transport_type",
        "revenue",
        "payload",
        "availability",
        "revenue_mom",
        "payload_mom",
    ] = "revenue"
    sort_dir: Literal["asc", "desc"] = "desc"
    rank: Literal["all", "top", "bottom"] = "all"
    rank_limit: int = Field(default=10, ge=1, le=100)
    rank_metric: Literal[
        "site_id",
        "site_class",
        "status_site",
        "transport_type",
        "revenue",
        "payload",
        "availability",
        "revenue_mom",
        "payload_mom",
    ] = "revenue"
    target_status: Literal["all", "achieved", "not_achieved", "unavailable"] = "all"
    site_class: str | None = Field(default=None, max_length=80)
    q: str | None = Field(default=None, max_length=100)


class ReportingSiteRow(BaseModel):
    site_id: str
    site_name: str | None = None
    nop: str | None = None
    kabupaten: str | None = None
    status_site: str | None = None
    site_class: str | None = None
    transport_type: str | None = None
    revenue: int = 0
    previous_revenue: int = 0
    revenue_mom_pct: float | None = None
    payload: int = 0
    previous_payload: int = 0
    payload_mom_pct: float | None = None
    avg_availability: float | None = None
    outage_minutes: float = 0
    sla_status: Literal["met", "missed", "unavailable"]
    availability_target: float | None = None
    availability_target_status: Literal["achieved", "not_achieved", "unavailable"] = "unavailable"
    revenue_band: Literal["u30", "u60", "achieved", "unavailable"] = "unavailable"
    revenue_target_status: Literal["achieved", "not_achieved", "unavailable"] = "unavailable"
    payload_target_tb: float | None = None
    payload_target_status: Literal["achieved", "not_achieved", "unavailable"] = "unavailable"
    overall_target_status: Literal["achieved", "not_achieved", "unavailable"] = "unavailable"


class ReportingSitePage(BaseModel):
    area_key: str
    kabupaten: str
    total: int = 0
    page: int = 1
    page_size: int = 25
    items: list[ReportingSiteRow] = Field(default_factory=list)
    site_classes: list[str] = Field(default_factory=list)
    rank: Literal["all", "top", "bottom"] = "all"
    rank_metric: str = "revenue"


PIVOT_DIMENSIONS = {
    "performance": {"period", "nop", "kabupaten", "site_id", "site_class", "transport_type", "mapping_status"},
    "ticketing": {"period", "nop", "kabupaten", "site_id", "ticket_category", "backup_result", "mapping_status"},
    "proker": {"period", "nop", "kabupaten", "site_id", "status", "mapping_status"},
}
PIVOT_MEASURES = {
    "performance": {
        "sites": "distinct_count",
        "revenue": "sum",
        "revenue_per_site": "ratio",
        "payload": "sum",
        "payload_per_site": "ratio",
        "traffic": "sum",
        "availability": "weighted_avg",
        "outage_minutes": "sum",
    },
    "ticketing": {
        "tickets": "count",
        "bps_tickets": "sum",
        "ts_tickets": "sum",
        "backup_success": "sum",
        "backup_success_rate": "ratio",
    },
    "proker": {"activities": "count", "open_activities": "sum", "closed_activities": "sum"},
}


class ReportingPivotValue(BaseModel):
    field: str
    aggregation: Literal["sum", "count", "distinct_count", "weighted_avg", "ratio"]


class ReportingPivotFilter(BaseModel):
    field: str
    values: list[str] = Field(min_length=1, max_length=25)


class ReportingPivotRequest(BaseModel):
    dataset: Literal["performance", "ticketing", "proker"]
    period_start: str
    period_end: str
    nop: str | None = None
    rows: list[str] = Field(min_length=1, max_length=2)
    columns: list[str] = Field(default_factory=list, max_length=1)
    values: list[ReportingPivotValue] = Field(min_length=1, max_length=3)
    filters: list[ReportingPivotFilter] = Field(default_factory=list, max_length=5)

    @model_validator(mode="after")
    def validate_allowlists(self):
        from fastapi import HTTPException
        from periods import resolve_month_period

        dimensions = self.rows + self.columns
        if len(dimensions) != len(set(dimensions)):
            raise ValueError("Dimensi row dan column harus unik.")
        allowed_dimensions = PIVOT_DIMENSIONS[self.dataset]
        invalid_dimensions = [field for field in dimensions if field not in allowed_dimensions]
        invalid_filters = [item.field for item in self.filters if item.field not in allowed_dimensions]
        if invalid_dimensions or invalid_filters:
            raise ValueError("Dimensi atau filter tidak tersedia untuk dataset.")
        allowed_measures = PIVOT_MEASURES[self.dataset]
        for item in self.values:
            if allowed_measures.get(item.field) != item.aggregation:
                raise ValueError("Measure atau agregasi tidak tersedia untuk dataset.")
        if len({item.field for item in self.values}) != len(self.values):
            raise ValueError("Measure Pivot harus unik.")
        try:
            resolve_month_period(period_start=self.period_start, period_end=self.period_end)
        except HTTPException as exc:
            raise ValueError(str(exc.detail)) from exc
        return self


class ReportingPivotRow(BaseModel):
    dimensions: dict[str, str | None] = Field(default_factory=dict)
    values: dict[str, int | float | None] = Field(default_factory=dict)


class ReportingPivotResponse(BaseModel):
    dataset: str
    row_dimensions: list[str]
    column_dimensions: list[str]
    value_fields: list[str]
    estimated_cells: int = 0
    rows: list[ReportingPivotRow] = Field(default_factory=list)

"""Pydantic schemas for Impact Service alarm dashboard data."""
from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel


class ImpactServiceFilters(BaseModel):
    """Available filter bounds and NOP values for Impact Service."""
    min_date: Optional[date] = None
    max_date: Optional[date] = None
    today: Optional[date] = None
    default_date: Optional[date] = None
    has_today_data: bool = False
    nops: list[str] = []


class ImpactServiceSummary(BaseModel):
    """Top-level Impact Service KPI scorecards."""
    total_alarms: int = 0
    impacted_sites: int = 0
    open_alarms: int = 0
    clear_alarms: int = 0
    sow_tsel: int = 0
    previous_total_alarms: int = 0
    previous_impacted_sites: int = 0
    previous_open_alarms: int = 0
    previous_clear_alarms: int = 0
    previous_sow_tsel: int = 0


class ImpactServiceDailyTrendItem(BaseModel):
    """Single date alarm counts split by status."""
    tanggal: date
    total: int = 0
    open: int = 0
    clear: int = 0


class ImpactServiceDistributionItem(BaseModel):
    """Generic distribution row split by status."""
    label: str
    total: int = 0
    open: int = 0
    clear: int = 0


class ImpactServiceDistributions(BaseModel):
    """All chart-ready distribution groups."""
    by_severity: list[ImpactServiceDistributionItem] = []
    by_category: list[ImpactServiceDistributionItem] = []
    by_aging_range: list[ImpactServiceDistributionItem] = []
    by_sow: list[ImpactServiceDistributionItem] = []
    by_nop: list[ImpactServiceDistributionItem] = []


class ImpactServiceTopAlarm(BaseModel):
    """Top alarm names by volume and impacted sites."""
    alarm_name: str
    total: int = 0
    impacted_sites: int = 0
    open: int = 0
    clear: int = 0


class ImpactServiceTopSite(BaseModel):
    """Top impacted sites by alarm volume."""
    site_id: str
    site_name: Optional[str] = None
    nop: Optional[str] = None
    total: int = 0
    open: int = 0
    clear: int = 0
    critical: int = 0
    max_aging: Optional[int] = None


class ImpactServiceAlarmListItem(BaseModel):
    """Impact Service alarm row for the detail table."""
    id: int
    tanggal: date
    site_id: Optional[str] = None
    site_name: Optional[str] = None
    nop: Optional[str] = None
    alarm_name: Optional[str] = None
    category: Optional[str] = None
    severity: Optional[str] = None
    aging: Optional[int] = None
    aging_range: Optional[str] = None
    status: Optional[str] = None
    sow: Optional[str] = None
    comment: Optional[str] = None


class ImpactServiceAlarmListResponse(BaseModel):
    """Paginated Impact Service alarm table response."""
    items: list[ImpactServiceAlarmListItem] = []
    total: int = 0
    page: int = 1
    limit: int = 20
    total_pages: int = 0


class ImpactServiceAlarmDetail(ImpactServiceAlarmListItem):
    """Modal detail for a single Impact Service alarm."""
    week: Optional[int] = None
    location_information: Optional[str] = None
    mo_name: Optional[str] = None
    tp: Optional[str] = None
    alarm_id: Optional[int] = None
    alarm_type: Optional[str] = None
    last_occurred_nt: Optional[datetime] = None
    avail_1w: Optional[str] = None
    rhi_2w: Optional[str] = None
    priority: Optional[str] = None
    remarks: Optional[str] = None
    remarks2: Optional[str] = None
    status_site_x: Optional[str] = None
    ticket_no: Optional[str] = None
    plan_action: Optional[str] = None
    pic_officer: Optional[str] = None
    date_cleared: Optional[datetime] = None
    root_cause_analyst: Optional[str] = None
    pic_onsite: Optional[str] = None
    carrier: Optional[str] = None
    poi_rafi: Optional[str] = None
    carrier_2: Optional[str] = None
    count_site: Optional[str] = None
    dash: Optional[str] = None
    longitude: Optional[float] = None
    latitude: Optional[float] = None
    sore: Optional[str] = None
    poi: Optional[str] = None

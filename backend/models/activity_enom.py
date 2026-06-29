"""Pydantic schemas for the Activity ENOM dashboard."""
from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel, Field


class ActivityEnomMonthOption(BaseModel):
    """Available Activity ENOM month option."""
    value: date
    label: str


class ActivityEnomYearOption(BaseModel):
    """Available Activity ENOM year option."""
    value: int
    label: str


class ActivityEnomFilters(BaseModel):
    """Available global filters for Activity ENOM."""
    years: list[ActivityEnomYearOption] = Field(default_factory=list)
    months: list[ActivityEnomMonthOption] = Field(default_factory=list)
    nops: list[str] = Field(default_factory=list)
    categories: list[str] = Field(default_factory=list)
    default_year: Optional[int] = None
    default_month: Optional[date] = None


class ActivityEnomSummary(BaseModel):
    """Top-level Activity ENOM KPI scorecards."""
    month_date: date
    annual_total_activity: int = 0
    annual_open_activity: int = 0
    annual_close_activity: int = 0
    total_activity: int = 0
    impacted_sites: int = 0
    open_activity: int = 0
    close_activity: int = 0
    completion_rate: float = 0


class ActivityEnomDistributionItem(BaseModel):
    """Generic Activity ENOM distribution row."""
    label: str
    total: int = 0
    open: int = 0
    close: int = 0
    sites: int = 0
    completion_rate: float = 0


class ActivityEnomBreakdowns(BaseModel):
    """Chart-ready Activity ENOM breakdown groups."""
    breakdown_title: str = "NOP Contribution"
    ranking_title: str = "Ranking NOP"
    contribution: list[ActivityEnomDistributionItem] = Field(default_factory=list)
    ranking: list[ActivityEnomDistributionItem] = Field(default_factory=list)
    by_category: list[ActivityEnomDistributionItem] = Field(default_factory=list)
    by_status: list[ActivityEnomDistributionItem] = Field(default_factory=list)
    by_week_done: list[ActivityEnomDistributionItem] = Field(default_factory=list)


class ActivityEnomTrendItem(BaseModel):
    """Single month Activity ENOM trend point."""
    create_date: date
    total: int = 0
    open: int = 0
    close: int = 0
    sites: int = 0


class ActivityEnomTopActivity(BaseModel):
    """Top activity row."""
    activity: str
    total: int = 0
    open: int = 0
    close: int = 0
    sites: int = 0


class ActivityEnomActivityRow(BaseModel):
    """Activity ENOM table row."""
    id: int
    source_row_number: int
    create_date: date
    bulan: int
    site_id: Optional[str] = None
    site_name: Optional[str] = None
    nop: Optional[str] = None
    kabupaten: Optional[str] = None
    part: Optional[str] = None
    activity: Optional[str] = None
    status: Optional[str] = None
    week_done: Optional[int] = None
    date_done: Optional[date] = None


class ActivityEnomActivityResponse(BaseModel):
    """Paginated Activity ENOM table response."""
    items: list[ActivityEnomActivityRow] = Field(default_factory=list)
    total: int = 0
    page: int = 1
    limit: int = 20
    total_pages: int = 0


class ActivityEnomActivityDetail(ActivityEnomActivityRow):
    """Modal detail for a single Activity ENOM row."""
    baseline_activity: Optional[str] = None
    info: Optional[str] = None
    analisis: Optional[str] = None
    remark_1: Optional[str] = None
    remark_2: Optional[str] = None
    milestone: Optional[str] = None
    xcek: Optional[str] = None
    workshop: Optional[str] = None
    target_workshop: Optional[str] = None
    source_row_hash: Optional[str] = None
    imported_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

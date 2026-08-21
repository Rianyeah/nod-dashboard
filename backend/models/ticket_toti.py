"""Response models for the Ticket TOTI dashboard."""

from datetime import date, datetime

from pydantic import BaseModel, Field

from models.period import MonthPeriodMeta


class TicketTotiFilters(BaseModel):
    min_date: date | None = None
    max_date: date | None = None
    default_start_date: date | None = None
    default_end_date: date | None = None
    available_months: list[str] = Field(default_factory=list)
    nops: list[str] = Field(default_factory=list)
    clusters: list[str] = Field(default_factory=list)
    mitras: list[str] = Field(default_factory=list)
    categories: list[str] = Field(default_factory=list)
    statuses: list[str] = Field(default_factory=list)


class TicketTotiTopItem(BaseModel):
    label: str
    tickets: int = 0
    share: float = 0


class TicketTotiSummary(BaseModel):
    total_tickets: int = 0
    total_tickets_period_delta: int | None = None
    total_tickets_period_rate: float | None = None
    top_mitra: TicketTotiTopItem
    top_category: TicketTotiTopItem
    vandalism_tickets: int = 0
    vandalism_rate: float = 0
    last_updated_at: datetime | None = None


class TicketTotiTrendItem(BaseModel):
    period: date
    label: str
    total: int = 0
    vandalism: int = 0


class TicketTotiDistributionItem(BaseModel):
    label: str
    tickets: int = 0
    share: float = 0


class TicketTotiDashboard(BaseModel):
    summary: TicketTotiSummary
    trend_granularity: str = "day"
    trend: list[TicketTotiTrendItem] = Field(default_factory=list)
    cluster_distribution: list[TicketTotiDistributionItem] = Field(default_factory=list)
    mitra_distribution: list[TicketTotiDistributionItem] = Field(default_factory=list)
    period_meta: MonthPeriodMeta | None = None


class TicketTotiTicketItem(BaseModel):
    siteid: str | None = None
    sitename: str | None = None
    id: str
    kategori: str
    sub_kategori: str | None = None
    permasalahan: str | None = None
    kondisi_site: str | None = None
    requested_at: datetime
    closed_at: datetime | None = None
    duration_seconds: int | None = None


class TicketTotiTicketResponse(BaseModel):
    items: list[TicketTotiTicketItem] = Field(default_factory=list)
    total: int
    page: int
    limit: int
    total_pages: int
    period_meta: MonthPeriodMeta | None = None

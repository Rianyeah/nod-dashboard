from datetime import date, datetime
from typing import Any

from pydantic import BaseModel
from models.period import MonthPeriodMeta


class TicketingFilters(BaseModel):
    min_date: date | None = None
    max_date: date | None = None
    default_start_date: date | None = None
    default_end_date: date | None = None
    years: list[int] = []
    months: list[int] = []
    available_months: list[str] = []
    nops: list[str] = []
    clusters: list[str] = []
    categories: list[str] = []
    takeovers: list[str] = []
    ticket_statuses: list[str] = []
    backup_sukses: list[str] = []
    rc_categories: list[str] = []


class TicketCategorySummary(BaseModel):
    bps: int = 0
    ts: int = 0
    total: int = 0


class TicketingSummary(BaseModel):
    total_tickets: int = 0
    total_tickets_mom_delta: int | None = None
    total_tickets_mom_rate: float | None = None
    ticket_category: TicketCategorySummary
    out_sla_tickets: int = 0
    out_sla_rate: float = 0
    average_mttr_hours: float | None = None
    median_mttr_hours: float | None = None
    visitation_tickets: int = 0
    visitation_rate: float = 0
    p90_response_minutes: float | None = None
    backup_sukses_tickets: int = 0
    backup_sukses_rate: float = 0
    escalated_tickets: int = 0
    escalated_rate: float = 0
    manual_takeover_tickets: int = 0
    manual_takeover_rate: float = 0
    closed_tickets: int = 0
    closed_rate: float = 0
    canceled_tickets: int = 0
    last_created_at: datetime | None = None


class TicketingTrendItem(BaseModel):
    day: date
    label: str
    bps: int = 0
    ts: int = 0
    total: int = 0


class TicketingDistributionItem(BaseModel):
    label: str
    tickets: int = 0
    out_sla: int = 0
    out_sla_rate: float = 0


class TicketingRcParetoItem(BaseModel):
    label: str
    tickets: int = 0
    cumulative_rate: float = 0


class TicketingVisitingBackupItem(BaseModel):
    label: str
    tickets: int = 0
    visiting_site: int = 0
    backup_genset: int = 0
    backup_rate: float = 0


class TicketingLocationBreakdownItem(BaseModel):
    label: str
    metric: str
    value: str
    tickets: int = 0


class TicketingFopPerformanceItem(BaseModel):
    rank: int
    pic: str
    performance_score: float
    takeover_tickets: int = 0
    visitation_tickets: int = 0
    backup_sukses_tickets: int = 0
    average_response_minutes: float | None = None


class TicketingTakeoverRankingItem(BaseModel):
    rank: int
    pic: str
    bps: int = 0
    ts: int = 0
    pms: int = 0
    pmg: int = 0
    fna: int = 0
    bbm: int = 0
    avg_daily: float = 0
    total_takeover: int = 0


class TicketingTopSite(BaseModel):
    site_id: str
    site_name: str | None = None
    cluster_to: str | None = None
    tickets: int = 0
    out_sla: int = 0
    out_sla_rate: float = 0
    p90_mttr_hours: float | None = None
    backup_sukses_rate: float = 0


class TicketingDashboard(BaseModel):
    summary: TicketingSummary
    trend: list[TicketingTrendItem] = []
    trend_granularity: str = "day"
    sla_distribution: list[TicketingDistributionItem] = []
    backup_distribution: list[TicketingDistributionItem] = []
    location_breakdown_title: str
    location_breakdown: list[TicketingLocationBreakdownItem] = []
    visiting_backup_distribution: list[TicketingVisitingBackupItem] = []
    rc_category_pareto: list[TicketingRcParetoItem] = []
    type_ticket_distribution: list[TicketingDistributionItem] = []
    top_sites: list[TicketingTopSite] = []
    fop_performance: list[TicketingFopPerformanceItem] = []
    takeover_ranking: list[TicketingTakeoverRankingItem] = []
    period_meta: MonthPeriodMeta | None = None


class TicketingTicketItem(BaseModel):
    ticket_number_swfm: str
    ticket_number_inap: str | None = None
    site_id: str | None = None
    site_name: str | None = None
    cluster_to: str | None = None
    kategori_tt: str | None = None
    sla_status: str | None = None
    ticket_swfm_status: str | None = None
    created_at: datetime | None = None
    mttr_hours: float | None = None
    response_minutes: float | None = None
    backup_sukses: str | None = None
    rc_category: str | None = None
    is_escalate: bool | None = None


class TicketingTicketResponse(BaseModel):
    items: list[TicketingTicketItem]
    total: int
    page: int
    limit: int
    total_pages: int
    period_meta: MonthPeriodMeta | None = None


class TicketingTicketDetail(BaseModel):
    ticket_number_swfm: str
    data: dict[str, Any]

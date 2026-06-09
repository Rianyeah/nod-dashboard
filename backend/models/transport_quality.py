"""Pydantic schemas for the Transport Quality dashboard."""
from datetime import date as DateType
from typing import Optional

from pydantic import BaseModel, Field


class TransportQualityPeriod(BaseModel):
    """Available weekly snapshot period."""
    date: DateType
    week: Optional[int] = None
    label: str


class TransportQualityFilters(BaseModel):
    """Available global filter values for Transport Quality."""
    min_date: Optional[DateType] = None
    max_date: Optional[DateType] = None
    periods: list[TransportQualityPeriod] = Field(default_factory=list)
    nops: list[str] = Field(default_factory=list)
    kabupaten: list[str] = Field(default_factory=list)
    transport_types: list[str] = Field(default_factory=list)
    thi_statuses: list[str] = Field(default_factory=list)
    distribution_pl: list[str] = Field(default_factory=list)
    pl_status_0_1_pct: list[str] = Field(default_factory=list)
    distribution_lat: list[str] = Field(default_factory=list)
    jitter_statuses: list[str] = Field(default_factory=list)


class TransportQualitySummary(BaseModel):
    """Top-level Transport Quality KPI scorecards."""
    date: Optional[DateType] = None
    week: Optional[int] = None
    total_records: int = 0
    total_sites: int = 0
    pl_over_1_sites: int = 0
    latency_over_5_sites: int = 0
    flag_pl_fail_sites: int = 0
    thi_fail_sites: int = 0
    p1_sites: int = 0
    p2_sites: int = 0
    priority_sites: int = 0
    avg_packet_loss: Optional[float] = None
    avg_latency: Optional[float] = None
    avg_jitter: Optional[float] = None


class TransportQualityTrendItem(BaseModel):
    """Single weekly quality trend point."""
    date: DateType
    week: Optional[int] = None
    total_sites: int = 0
    avg_packet_loss: Optional[float] = None
    avg_latency: Optional[float] = None
    avg_jitter: Optional[float] = None
    pl_over_1_sites: int = 0
    latency_over_5_sites: int = 0
    jitter_not_clear_sites: int = 0
    thi_fail_sites: int = 0
    p1_sites: int = 0


class TransportQualityDistributionItem(BaseModel):
    """Distribution bucket for PL, latency, or jitter status."""
    label: str
    records: int = 0
    sites: int = 0
    bad_records: int = 0


class TransportQualityDistributions(BaseModel):
    """Chart-ready distribution groups."""
    by_packet_loss: list[TransportQualityDistributionItem] = Field(default_factory=list)
    by_latency: list[TransportQualityDistributionItem] = Field(default_factory=list)
    by_jitter: list[TransportQualityDistributionItem] = Field(default_factory=list)


class TransportQualityBreakdownItem(BaseModel):
    """Issue breakdown for a business or transport dimension."""
    label: str
    records: int = 0
    sites: int = 0
    pl_over_1_sites: int = 0
    latency_over_5_sites: int = 0
    flag_pl_fail_sites: int = 0
    thi_fail_sites: int = 0
    p1_sites: int = 0
    p2_sites: int = 0
    avg_packet_loss: Optional[float] = None
    avg_latency: Optional[float] = None
    avg_jitter: Optional[float] = None


class TransportQualityBreakdowns(BaseModel):
    """All ranked operational breakdowns."""
    by_nop: list[TransportQualityBreakdownItem] = Field(default_factory=list)
    by_kabupaten: list[TransportQualityBreakdownItem] = Field(default_factory=list)
    by_transport_type: list[TransportQualityBreakdownItem] = Field(default_factory=list)


class TransportQualityPrioritySite(BaseModel):
    """Priority site row for the Transport Quality table."""
    site_id: str
    site_name: Optional[str] = None
    nop: Optional[str] = None
    kabupaten: Optional[str] = None
    transport_type: Optional[str] = None
    avg_packet_loss: Optional[float] = None
    latency: Optional[float] = None
    jitter: Optional[float] = None
    distribution_pl: Optional[str] = None
    distribution_lat: Optional[str] = None
    jitter_status: Optional[str] = None
    flag_pl_status: Optional[str] = None
    thi_status: Optional[str] = None
    pl_over_threshold: bool = False
    latency_over_threshold: bool = False
    flag_pl_fail: bool = False
    thi_fail: bool = False
    priority_level: str = "Normal"
    priority_score: int = 0
    action_hint: str = "Monitor"


class TransportQualityPrioritySiteResponse(BaseModel):
    """Paginated priority site table response."""
    items: list[TransportQualityPrioritySite] = Field(default_factory=list)
    total: int = 0
    page: int = 1
    limit: int = 20
    total_pages: int = 0

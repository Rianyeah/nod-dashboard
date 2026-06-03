"""Pydantic schemas for the cross-module Home overview."""
from datetime import date
from typing import Optional

from pydantic import BaseModel, Field

from models.availability import AvailabilitySummary, WorstSite
from models.impact_service import (
    ImpactServiceDailyTrendItem,
    ImpactServiceDistributions,
    ImpactServiceSummary,
    ImpactServiceTopSite,
)
from models.reporting import ReportingScorecard, RevenueTrendItem
from models.ticketing import TicketingDashboard
from models.transport_quality import (
    TransportQualityPrioritySiteResponse,
    TransportQualitySummary,
    TransportQualityTrendItem,
)


class OverviewPeriod(BaseModel):
    """Resolved periods used by the Home overview modules."""
    bulan: Optional[int] = None
    tahun: Optional[int] = None
    trx_month: Optional[str] = None
    impact_start_date: Optional[date] = None
    impact_end_date: Optional[date] = None
    transport_date: Optional[date] = None
    ticketing_start_date: Optional[date] = None
    ticketing_end_date: Optional[date] = None
    nop: Optional[str] = None


class SitePotentialMetric(BaseModel):
    """Single potential-site KPI with share against total master sites."""
    total: int = 0
    percentage: float = 0.0


class SiteClassBreakdown(BaseModel):
    """Small class distribution item for the Command Center potential panel."""
    label: str
    total: int = 0
    percentage: float = 0.0


class SitePotential(BaseModel):
    """Potential site summary sourced from data_site_master."""
    total_sites: int = 0
    site_lithium: SitePotentialMetric = Field(default_factory=SitePotentialMetric)
    site_vrla: SitePotentialMetric = Field(default_factory=SitePotentialMetric)
    enva_validated: SitePotentialMetric = Field(default_factory=SitePotentialMetric)
    radio_ip: SitePotentialMetric = Field(default_factory=SitePotentialMetric)
    class_breakdown: list[SiteClassBreakdown] = Field(default_factory=list)


class WorstRevenueSite(BaseModel):
    """Lowest revenue site row for the Home worst site panel."""
    site_id: str
    site_name: Optional[str] = None
    kabupaten: Optional[str] = None
    total_revenue: int = 0
    total_payload: int = 0
    previous_revenue: int = 0
    mom_percentage: Optional[float] = None


class OverviewResponse(BaseModel):
    """Command center payload combining the dashboard's existing modules."""
    period: OverviewPeriod = Field(default_factory=OverviewPeriod)
    availability: AvailabilitySummary = Field(default_factory=AvailabilitySummary)
    worst_sites: list[WorstSite] = Field(default_factory=list)
    worst_revenue_sites: list[WorstRevenueSite] = Field(default_factory=list)
    reporting: ReportingScorecard = Field(default_factory=ReportingScorecard)
    reporting_trend: list[RevenueTrendItem] = Field(default_factory=list)
    impact_service: ImpactServiceSummary = Field(default_factory=ImpactServiceSummary)
    impact_daily_trend: list[ImpactServiceDailyTrendItem] = Field(default_factory=list)
    impact_distributions: ImpactServiceDistributions = Field(default_factory=ImpactServiceDistributions)
    impact_top_sites: list[ImpactServiceTopSite] = Field(default_factory=list)
    transport_quality: TransportQualitySummary = Field(default_factory=TransportQualitySummary)
    transport_trend: list[TransportQualityTrendItem] = Field(default_factory=list)
    transport_priority_sites: TransportQualityPrioritySiteResponse = Field(default_factory=TransportQualityPrioritySiteResponse)
    ticketing: Optional[TicketingDashboard] = None
    site_potential: SitePotential = Field(default_factory=SitePotential)
    errors: dict[str, str] = Field(default_factory=dict)

"""Pydantic schemas for the Data Potensi page."""
from typing import Optional

from pydantic import BaseModel, Field


class DataPotensiScorecard(BaseModel):
    """Aggregate KPIs from data_site_master."""
    total_sites: int = 0
    site_lithium: int = 0
    site_vrla: int = 0
    site_lithium_pct: float = 0.0
    site_vrla_pct: float = 0.0
    enva_validated: int = 0
    enva_validated_pct: float = 0.0
    radio_ip: int = 0
    radio_ip_pct: float = 0.0
    total_cluster: int = 0


class DonutBreakdownItem(BaseModel):
    """Single slice for a donut chart."""
    label: str
    value: int = 0
    percentage: float = 0.0


class StackedBarItem(BaseModel):
    """One cluster row with category→count mapping for stacked bar charts."""
    cluster: str
    categories: dict[str, int] = Field(default_factory=dict)


class TpDistributionItem(BaseModel):
    """Tower Provider distribution row."""
    tp: str
    count: int = 0


class DataPotensiFilterOptions(BaseModel):
    """Advanced filter values available for the selected global scope."""
    clusters: list[str] = Field(default_factory=list)
    kabupaten: list[str] = Field(default_factory=list)
    site_classes: list[str] = Field(default_factory=list)
    type_sites: list[str] = Field(default_factory=list)
    transport_types: list[str] = Field(default_factory=list)
    battery_types: list[str] = Field(default_factory=list)
    tower_providers: list[str] = Field(default_factory=list)


class DataPotensiSiteRow(BaseModel):
    """Single site row for the detail table."""
    site_id: str
    site_name: Optional[str] = None
    cluster: Optional[str] = None
    kabupaten: Optional[str] = None
    site_class: Optional[str] = None
    type_site: Optional[str] = None
    transport_type: Optional[str] = None
    type_battery: Optional[str] = None
    jenis_rectifier: Optional[str] = None
    backup_time_battery: Optional[str] = None
    belting_battery: Optional[str] = None
    tp: Optional[str] = None
    status_site: Optional[str] = None
    enva_status: Optional[str] = None


class DataPotensiSitesResponse(BaseModel):
    """Paginated site list for the Data Potensi table."""
    data: list[DataPotensiSiteRow] = Field(default_factory=list)
    total: int = 0
    page: int = 1
    limit: int = 20
    total_pages: int = 0


class DataPotensiResponse(BaseModel):
    """Full dashboard payload for the Data Potensi page."""
    scorecard: DataPotensiScorecard = Field(default_factory=DataPotensiScorecard)
    cluster_breakdown: list[DonutBreakdownItem] = Field(default_factory=list)
    transport_type_breakdown: list[DonutBreakdownItem] = Field(default_factory=list)
    site_class_breakdown: list[DonutBreakdownItem] = Field(default_factory=list)
    battery_by_cluster: list[StackedBarItem] = Field(default_factory=list)
    rectifier_by_cluster: list[StackedBarItem] = Field(default_factory=list)
    belting_by_cluster: list[StackedBarItem] = Field(default_factory=list)
    backup_time_by_cluster: list[StackedBarItem] = Field(default_factory=list)
    tp_distribution: list[TpDistributionItem] = Field(default_factory=list)

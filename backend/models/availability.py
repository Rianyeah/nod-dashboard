"""
Pydantic schemas for availability data.
"""
from pydantic import BaseModel
from typing import Optional


class AvailabilitySummary(BaseModel):
    """Dashboard summary card data."""
    total_site_dengan_data: int = 0
    total_site_master: int = 0
    avg_availability: Optional[float] = None
    total_outage_menit: Optional[float] = None
    total_cell: int = 0
    site_excellent: int = 0
    site_degraded: int = 0
    site_critical: int = 0


class LatestPeriod(BaseModel):
    """Most recent availability period present in the database."""
    bulan: int
    tahun: int
    row_count: int = 0
    site_count: int = 0


class AvailabilityTrendItem(BaseModel):
    """Single month in availability trend."""
    bulan: int
    tahun: int
    avg_availability: Optional[float] = None
    total_outage_menit: Optional[float] = None


class AvailabilityByKabupaten(BaseModel):
    """Availability grouped by kabupaten."""
    kabupaten: Optional[str] = None
    total_site: int = 0
    avg_availability: Optional[float] = None
    total_outage_menit: Optional[float] = None


class WorstSite(BaseModel):
    """Site with worst availability."""
    site_id: str
    site_name: Optional[str] = None
    kabupaten: Optional[str] = None
    site_class: Optional[str] = None
    avg_availability: Optional[float] = None
    total_outage_menit: Optional[float] = None
    jumlah_cell: Optional[int] = None


class SiteAvailabilityDetail(BaseModel):
    """Daily availability detail for a single site."""
    site_id: str
    site_name: Optional[str] = None
    bulan: Optional[int] = None
    tahun: Optional[int] = None
    tgl: Optional[int] = None
    availability: Optional[float] = None
    outage_menit: Optional[float] = None
    outage_jam: Optional[float] = None
    kelas: Optional[str] = None
    rca: Optional[str] = None

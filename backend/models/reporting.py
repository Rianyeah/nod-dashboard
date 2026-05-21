"""
Pydantic schemas for network reporting data.
"""
from pydantic import BaseModel
from typing import Optional


class ReportingScorecard(BaseModel):
    """Top-level KPI scorecards for the reporting page."""
    total_sites: int = 0
    total_revenue: int = 0
    total_payload: int = 0
    avg_availability: Optional[float] = None


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

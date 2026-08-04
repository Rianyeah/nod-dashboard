"""Pydantic contracts for N8N site-detail capture boundaries."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel

from models.availability import AvailabilityTrendItem
from models.reporting import SitePerformance


class CaptureTokenRequest(BaseModel):
    site_id: str
    theme: Literal["dark"] = "dark"


class CaptureTokenResponse(BaseModel):
    site_id: str
    capture_url: str
    expires_at: datetime


class SiteDetailCaptureBundle(BaseModel):
    site_id: str
    detail: dict[str, Any]
    trend_data: list[AvailabilityTrendItem]
    performance_data: SitePerformance

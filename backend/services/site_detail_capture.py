"""Load every source needed to render one complete Site Detail capture."""

from __future__ import annotations

import asyncio
import re

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from models.capture import SiteDetailCaptureBundle
from queries.sql_queries import SITE_CAPTURE_EXISTS_QUERY
from routers.availability import get_trend
from routers.reporting import get_site_performance
from routers.sites import get_site_detail


CAPTURE_SITE_ID_PATTERN = re.compile(r"^[A-Z0-9][A-Z0-9_-]{1,31}$")


class CaptureBundleUnavailable(RuntimeError):
    """Raised when a complete capture bundle cannot be safely assembled."""


def normalize_capture_site_id(value: str) -> str:
    normalized = value.strip().upper()
    if not CAPTURE_SITE_ID_PATTERN.fullmatch(normalized):
        raise ValueError("Invalid Site ID")
    return normalized


async def site_exists_for_capture(site_id: str, session: AsyncSession) -> bool:
    result = await session.execute(text(SITE_CAPTURE_EXISTS_QUERY), {"site_id": site_id})
    return bool(result.scalar())


async def load_site_detail_capture_bundle(
    site_id: str,
    session: AsyncSession,
) -> SiteDetailCaptureBundle:
    """Resolve detail first, then load both optional modal sources concurrently."""
    detail = await get_site_detail(
        site_id=site_id,
        bulan=None,
        tahun=None,
        session=session,
    )
    try:
        trend_data, performance_data = await asyncio.gather(
            get_trend(
                site_id=site_id,
                tahun=int(detail["tahun"]),
                bulan=int(detail["bulan"]),
                session=session,
            ),
            get_site_performance(site_id=site_id, session=session),
        )
    except Exception as exc:
        raise CaptureBundleUnavailable() from exc

    return SiteDetailCaptureBundle(
        site_id=site_id,
        detail=detail,
        trend_data=trend_data,
        performance_data=performance_data,
    )

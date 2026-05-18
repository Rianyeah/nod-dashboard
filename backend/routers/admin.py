"""
Admin router for operational maintenance endpoints.
"""
from time import perf_counter

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_session
from queries.metrics_cache import (
    BOOTSTRAP_SITE_MONTH_METRICS_STATEMENTS,
    REFRESH_SITE_MONTH_DELETE_QUERY,
    REFRESH_SITE_MONTH_INSERT_QUERY,
)
from security import verify_n8n_key


router = APIRouter(prefix="/admin", tags=["Admin"])


class MetricsRefreshResponse(BaseModel):
    bulan: int
    tahun: int
    refreshed_sites: int
    elapsed_ms: int


@router.post(
    "/metrics/refresh",
    response_model=MetricsRefreshResponse,
    dependencies=[Depends(verify_n8n_key)],
)
async def refresh_site_month_metrics(
    bulan: int = Query(..., ge=1, le=12),
    tahun: int = Query(..., ge=2020),
    session: AsyncSession = Depends(get_session),
):
    started_at = perf_counter()
    params = {"bulan": bulan, "tahun": tahun}

    try:
        for statement in BOOTSTRAP_SITE_MONTH_METRICS_STATEMENTS:
            await session.execute(text(statement))

        await session.execute(text(REFRESH_SITE_MONTH_DELETE_QUERY), params)
        result = await session.execute(text(REFRESH_SITE_MONTH_INSERT_QUERY), params)
        refreshed_sites = len(result.scalars().all())
        await session.commit()
    except Exception:
        await session.rollback()
        raise

    return MetricsRefreshResponse(
        bulan=bulan,
        tahun=tahun,
        refreshed_sites=refreshed_sites,
        elapsed_ms=round((perf_counter() - started_at) * 1000),
    )

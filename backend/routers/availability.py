"""
Availability router — endpoints for availability monitoring.
GET /availability/summary         — Summary card data
GET /availability/by-kabupaten    — Grouped by kabupaten
GET /availability/site/{id}       — Single site availability
GET /availability/trend/{id}      — 12-month trend
GET /availability/worst           — Worst performing sites
"""
from fastapi import APIRouter, Depends, Query, HTTPException
import runtime_compat  # noqa: F401
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text

from database import get_session
from queries.sql_queries import (
    SUMMARY_CARD_QUERY,
    LATEST_PERIOD_QUERY,
    AVAILABILITY_BY_KABUPATEN_QUERY,
    SITE_AVAILABILITY_QUERY,
    TREND_AVAILABILITY_QUERY,
    WORST_SITES_QUERY,
)
from models.availability import (
    AvailabilitySummary,
    LatestPeriod,
    AvailabilityByKabupaten,
    SiteAvailabilityDetail,
    AvailabilityTrendItem,
    WorstSite,
)

router = APIRouter(prefix="/availability", tags=["Availability"])


@router.get("/latest-period", response_model=LatestPeriod)
async def get_latest_period(
    session: AsyncSession = Depends(get_session),
):
    """Get the newest month/year with availability data."""
    result = await session.execute(text(LATEST_PERIOD_QUERY))
    row = result.mappings().first()

    if not row:
        raise HTTPException(status_code=404, detail="No availability period found")

    return LatestPeriod(
        bulan=int(row["bulan"]),
        tahun=int(row["tahun"]),
        row_count=int(row.get("row_count") or 0),
        site_count=int(row.get("site_count") or 0),
    )


@router.get("/summary", response_model=AvailabilitySummary)
async def get_summary(
    bulan: int = Query(..., ge=1, le=12),
    tahun: int = Query(..., ge=2020),
    kabupaten: str = Query(None),
    cluster: str = Query(None),
    status: str = Query(None),
    kelas: str = Query(None),
    nop: str = Query(None),
    session: AsyncSession = Depends(get_session),
):
    """Summary card: total sites, avg availability, total outage."""
    from routers.sites import _build_filters
    filters, filter_params = _build_filters(kabupaten, cluster, status, kelas, nop)

    query = SUMMARY_CARD_QUERY.format(filters=filters)
    params = {"bulan": bulan, "tahun": tahun, **filter_params}

    result = await session.execute(
        text(query),
        params,
    )
    row = result.mappings().first()
    if not row:
        return AvailabilitySummary()

    return AvailabilitySummary(
        total_site_dengan_data=int(row.get("total_site_dengan_data") or 0),
        total_site_master=int(row.get("total_site_master") or 0),
        avg_availability=float(row["avg_availability"]) if row.get("avg_availability") is not None else None,
        total_outage_menit=float(row["total_outage_menit"]) if row.get("total_outage_menit") is not None else None,
        total_cell=int(row.get("total_cell") or 0),
        site_excellent=int(row.get("site_excellent") or 0),
        site_degraded=int(row.get("site_degraded") or 0),
        site_critical=int(row.get("site_critical") or 0),
    )


@router.get("/by-kabupaten", response_model=list[AvailabilityByKabupaten])
async def get_by_kabupaten(
    bulan: int = Query(..., ge=1, le=12),
    tahun: int = Query(..., ge=2020),
    session: AsyncSession = Depends(get_session),
):
    """Availability grouped by kabupaten/kota."""
    result = await session.execute(
        text(AVAILABILITY_BY_KABUPATEN_QUERY),
        {"bulan": bulan, "tahun": tahun},
    )
    rows = result.mappings().all()

    return [
        AvailabilityByKabupaten(
            kabupaten=row.get("kabupaten"),
            total_site=int(row.get("total_site") or 0),
            avg_availability=float(row["avg_availability"]) if row.get("avg_availability") is not None else None,
            total_outage_menit=float(row["total_outage_menit"]) if row.get("total_outage_menit") is not None else None,
        )
        for row in rows
    ]


@router.get("/site/{site_id}", response_model=list[SiteAvailabilityDetail])
async def get_site_availability(
    site_id: str,
    bulan: int = Query(..., ge=1, le=12),
    tahun: int = Query(..., ge=2020),
    session: AsyncSession = Depends(get_session),
):
    """Daily availability detail for a specific site."""
    result = await session.execute(
        text(SITE_AVAILABILITY_QUERY),
        {"site_id": site_id, "bulan": bulan, "tahun": tahun},
    )
    rows = result.mappings().all()

    return [
        SiteAvailabilityDetail(
            site_id=row.get("site_id", site_id),
            site_name=row.get("site_name"),
            bulan=int(row["Bulan"]) if row.get("Bulan") is not None else None,
            tahun=int(row["Tahun"]) if row.get("Tahun") is not None else None,
            tgl=int(row["Tgl"]) if row.get("Tgl") is not None else None,
            availability=float(row["availability"]) if row.get("availability") is not None else None,
            outage_menit=float(row["outage_menit"]) if row.get("outage_menit") is not None else None,
            outage_jam=float(row["outage_jam"]) if row.get("outage_jam") is not None else None,
            kelas=row.get("CLASS"),
            rca=row.get("RCA"),
        )
        for row in rows
    ]


@router.get("/trend/{site_id}", response_model=list[AvailabilityTrendItem])
async def get_trend(
    site_id: str,
    tahun: int = Query(..., ge=2020),
    bulan: int = Query(12, ge=1, le=12),
    session: AsyncSession = Depends(get_session),
):
    """12-month availability trend for a site."""
    result = await session.execute(
        text(TREND_AVAILABILITY_QUERY),
        {"site_id": site_id, "tahun": tahun, "bulan": bulan},
    )
    rows = result.mappings().all()

    return [
        AvailabilityTrendItem(
            bulan=int(row["Bulan"]),
            tahun=int(row["Tahun"]),
            avg_availability=float(row["avg_availability"]) if row.get("avg_availability") is not None else None,
            total_outage_menit=float(row["total_outage_menit"]) if row.get("total_outage_menit") is not None else None,
        )
        for row in rows
    ]


@router.get("/worst", response_model=list[WorstSite])
async def get_worst_sites(
    bulan: int = Query(..., ge=1, le=12),
    tahun: int = Query(..., ge=2020),
    limit: int = Query(10, ge=1, le=100),
    session: AsyncSession = Depends(get_session),
):
    """Sites with worst availability."""
    result = await session.execute(
        text(WORST_SITES_QUERY),
        {"bulan": bulan, "tahun": tahun, "limit_val": limit},
    )
    rows = result.mappings().all()

    return [
        WorstSite(
            site_id=row.get("site_id", ""),
            site_name=row.get("site_name"),
            kabupaten=row.get("kabupaten"),
            site_class=row.get("Site Class"),
            avg_availability=float(row["avg_availability"]) if row.get("avg_availability") is not None else None,
            total_outage_menit=float(row["total_outage_menit"]) if row.get("total_outage_menit") is not None else None,
            jumlah_cell=int(row["jumlah_cell"]) if row.get("jumlah_cell") is not None else None,
        )
        for row in rows
    ]

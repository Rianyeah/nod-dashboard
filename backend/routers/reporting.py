"""
Reporting router — endpoints for Network Reporting page.
Surfaces traktor_data revenue/payload/traffic metrics broken down by Kabupaten/Kota.

GET /reporting/scorecards              — KPI scorecard data
GET /reporting/revenue-by-kabupaten    — Revenue & payload pivot table
GET /reporting/site-class-by-kabupaten — Site class cross-tab
GET /reporting/battery-by-kabupaten    — Battery type cross-tab
GET /reporting/trend                   — Monthly revenue trend
GET /reporting/available-months        — List of trx_month values
"""
from fastapi import APIRouter, Depends, Query
import runtime_compat  # noqa: F401
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text

from database import get_session
from models.reporting import (
    ReportingScorecard,
    RevenueByKabupaten,
    SiteClassByKabupaten,
    BatteryByKabupaten,
    RevenueTrendItem,
)

router = APIRouter(prefix="/reporting", tags=["Reporting"])


# ---------- SQL Queries ----------

SCORECARDS_QUERY = """
SELECT
    COUNT(DISTINCT t.site_id) AS total_sites,
    COALESCE(SUM(t.rev), 0) AS total_revenue,
    COALESCE(SUM(t.payload), 0) AS total_payload
FROM traktor_data t
WHERE t.trx_month = :trx_month
"""

AVAILABILITY_SCORECARD_QUERY = """
SELECT
    ROUND(
        (
            SUM(total_time_in_minutes) - SUM(total_outage_menit)
        ) / NULLIF(SUM(total_time_in_minutes), 0) * 100.0
    , 4) AS avg_availability
FROM site_month_metrics
WHERE tahun = :tahun AND bulan = :bulan
"""

REVENUE_BY_KABUPATEN_QUERY = """
SELECT
    d."Kabupaten/KOTA" AS kabupaten,
    COUNT(DISTINCT t.site_id) AS total_sites,
    COALESCE(SUM(t.rev), 0) AS rev,
    COALESCE(SUM(t.rev_voice), 0) AS rev_voice,
    COALESCE(SUM(t.rev_bb), 0) AS rev_bb,
    COALESCE(SUM(t.rev_dig), 0) AS rev_dig,
    COALESCE(SUM(t.rev_sms), 0) AS rev_sms,
    COALESCE(SUM(t.rev_ir), 0) AS rev_ir,
    COALESCE(SUM(t.payload), 0) AS payload,
    COALESCE(SUM(t.pld_2g), 0) AS pld_2g,
    COALESCE(SUM(t.pld_3g), 0) AS pld_3g,
    COALESCE(SUM(t.pld_4g), 0) AS pld_4g,
    COALESCE(SUM(t.pld_5g), 0) AS pld_5g,
    COALESCE(SUM(t.traffic), 0) AS traffic,
    COALESCE(SUM(t.trf_2g), 0) AS trf_2g,
    COALESCE(SUM(t.trf_3g), 0) AS trf_3g,
    COALESCE(SUM(t.trf_4g), 0) AS trf_4g
FROM traktor_data t
JOIN data_site_master d ON t.site_id = d."Siteid"
WHERE t.trx_month = :trx_month
  AND d."Kabupaten/KOTA" IS NOT NULL
GROUP BY d."Kabupaten/KOTA"
ORDER BY rev DESC
"""

SITE_CLASS_BY_KABUPATEN_QUERY = """
SELECT
    d."Kabupaten/KOTA" AS kabupaten,
    COUNT(DISTINCT CASE WHEN d."Site Class" = 'Diamond' THEN t.site_id END) AS diamond,
    COUNT(DISTINCT CASE WHEN d."Site Class" = 'Platinum' THEN t.site_id END) AS platinum,
    COUNT(DISTINCT CASE WHEN d."Site Class" = 'Gold' THEN t.site_id END) AS gold,
    COUNT(DISTINCT CASE WHEN d."Site Class" = 'Silver' THEN t.site_id END) AS silver,
    COUNT(DISTINCT CASE WHEN d."Site Class" = 'Bronze' THEN t.site_id END) AS bronze,
    COUNT(DISTINCT t.site_id) AS total
FROM traktor_data t
JOIN data_site_master d ON t.site_id = d."Siteid"
WHERE t.trx_month = :trx_month
  AND d."Kabupaten/KOTA" IS NOT NULL
  AND d."Site Class" NOT LIKE '#N/A%'
GROUP BY d."Kabupaten/KOTA"
ORDER BY d."Kabupaten/KOTA"
"""

BATTERY_BY_KABUPATEN_QUERY = """
SELECT
    d."Kabupaten/KOTA" AS kabupaten,
    COUNT(DISTINCT CASE WHEN LOWER(d."Type Battery") = 'lithium' THEN d."Siteid" END) AS lithium,
    COUNT(DISTINCT CASE WHEN LOWER(d."Type Battery") = 'vrla' THEN d."Siteid" END) AS vrla,
    COUNT(DISTINCT CASE WHEN LOWER(d."Type Battery") IN ('tidak ada', '#n/a', '') OR d."Type Battery" IS NULL THEN d."Siteid" END) AS tidak_ada,
    COUNT(DISTINCT d."Siteid") AS total
FROM data_site_master d
WHERE d."Kabupaten/KOTA" IS NOT NULL
GROUP BY d."Kabupaten/KOTA"
ORDER BY d."Kabupaten/KOTA"
"""

REVENUE_TREND_QUERY = """
SELECT
    t.trx_month,
    COALESCE(SUM(t.rev), 0) AS total_revenue,
    COALESCE(SUM(t.payload), 0) AS total_payload,
    COALESCE(SUM(t.traffic), 0) AS total_traffic
FROM traktor_data t
GROUP BY t.trx_month
ORDER BY t.trx_month
"""

AVAILABLE_MONTHS_QUERY = """
SELECT DISTINCT trx_month
FROM traktor_data
ORDER BY trx_month DESC
"""


# ---------- Endpoints ----------

@router.get("/available-months")
async def get_available_months(
    session: AsyncSession = Depends(get_session),
):
    """List available trx_month values for the period selector."""
    result = await session.execute(text(AVAILABLE_MONTHS_QUERY))
    rows = result.mappings().all()
    return [row["trx_month"] for row in rows]


@router.get("/scorecards", response_model=ReportingScorecard)
async def get_scorecards(
    trx_month: str = Query(..., description="Period in YYYY-MM format"),
    session: AsyncSession = Depends(get_session),
):
    """Scorecard KPIs: total sites, revenue, payload, availability."""
    # Revenue/payload from traktor_data
    result = await session.execute(
        text(SCORECARDS_QUERY),
        {"trx_month": trx_month},
    )
    row = result.mappings().first()

    total_sites = int(row["total_sites"]) if row else 0
    total_revenue = int(row["total_revenue"]) if row else 0
    total_payload = int(row["total_payload"]) if row else 0

    # Availability from site_month_metrics (derive bulan/tahun from trx_month)
    avg_availability = None
    try:
        parts = trx_month.split("-")
        tahun = int(parts[0])
        bulan = int(parts[1])
        avail_result = await session.execute(
            text(AVAILABILITY_SCORECARD_QUERY),
            {"tahun": tahun, "bulan": bulan},
        )
        avail_row = avail_result.mappings().first()
        if avail_row and avail_row["avg_availability"] is not None:
            avg_availability = float(avail_row["avg_availability"])
    except (ValueError, IndexError):
        pass

    return ReportingScorecard(
        total_sites=total_sites,
        total_revenue=total_revenue,
        total_payload=total_payload,
        avg_availability=avg_availability,
    )


@router.get("/revenue-by-kabupaten", response_model=list[RevenueByKabupaten])
async def get_revenue_by_kabupaten(
    trx_month: str = Query(..., description="Period in YYYY-MM format"),
    session: AsyncSession = Depends(get_session),
):
    """Revenue & payload breakdown pivot by Kabupaten/Kota."""
    result = await session.execute(
        text(REVENUE_BY_KABUPATEN_QUERY),
        {"trx_month": trx_month},
    )
    rows = result.mappings().all()

    return [
        RevenueByKabupaten(
            kabupaten=row.get("kabupaten"),
            total_sites=int(row.get("total_sites") or 0),
            rev=int(row.get("rev") or 0),
            rev_voice=int(row.get("rev_voice") or 0),
            rev_bb=int(row.get("rev_bb") or 0),
            rev_dig=int(row.get("rev_dig") or 0),
            rev_sms=int(row.get("rev_sms") or 0),
            rev_ir=int(row.get("rev_ir") or 0),
            payload=int(row.get("payload") or 0),
            pld_2g=int(row.get("pld_2g") or 0),
            pld_3g=int(row.get("pld_3g") or 0),
            pld_4g=int(row.get("pld_4g") or 0),
            pld_5g=int(row.get("pld_5g") or 0),
            traffic=int(row.get("traffic") or 0),
            trf_2g=int(row.get("trf_2g") or 0),
            trf_3g=int(row.get("trf_3g") or 0),
            trf_4g=int(row.get("trf_4g") or 0),
        )
        for row in rows
    ]


@router.get("/site-class-by-kabupaten", response_model=list[SiteClassByKabupaten])
async def get_site_class_by_kabupaten(
    trx_month: str = Query(..., description="Period in YYYY-MM format"),
    session: AsyncSession = Depends(get_session),
):
    """Site class distribution cross-tab by Kabupaten/Kota."""
    result = await session.execute(
        text(SITE_CLASS_BY_KABUPATEN_QUERY),
        {"trx_month": trx_month},
    )
    rows = result.mappings().all()

    return [
        SiteClassByKabupaten(
            kabupaten=row.get("kabupaten"),
            diamond=int(row.get("diamond") or 0),
            platinum=int(row.get("platinum") or 0),
            gold=int(row.get("gold") or 0),
            silver=int(row.get("silver") or 0),
            bronze=int(row.get("bronze") or 0),
            total=int(row.get("total") or 0),
        )
        for row in rows
    ]


@router.get("/battery-by-kabupaten", response_model=list[BatteryByKabupaten])
async def get_battery_by_kabupaten(
    session: AsyncSession = Depends(get_session),
):
    """Battery type distribution cross-tab by Kabupaten/Kota."""
    result = await session.execute(text(BATTERY_BY_KABUPATEN_QUERY))
    rows = result.mappings().all()

    return [
        BatteryByKabupaten(
            kabupaten=row.get("kabupaten"),
            lithium=int(row.get("lithium") or 0),
            vrla=int(row.get("vrla") or 0),
            tidak_ada=int(row.get("tidak_ada") or 0),
            total=int(row.get("total") or 0),
        )
        for row in rows
    ]


@router.get("/trend", response_model=list[RevenueTrendItem])
async def get_revenue_trend(
    session: AsyncSession = Depends(get_session),
):
    """Monthly revenue/payload/traffic trend across all available months."""
    result = await session.execute(text(REVENUE_TREND_QUERY))
    rows = result.mappings().all()

    return [
        RevenueTrendItem(
            trx_month=row["trx_month"],
            total_revenue=int(row.get("total_revenue") or 0),
            total_payload=int(row.get("total_payload") or 0),
            total_traffic=int(row.get("total_traffic") or 0),
        )
        for row in rows
    ]

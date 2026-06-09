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
from fastapi import APIRouter, Depends, Query, Response
import runtime_compat  # noqa: F401
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text

from cache import redis_cache
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

def build_nop_filter(nop: str | None, alias: str = "d") -> str:
    if not nop:
        return ""
    filters = {
        "d": ' AND d."NOP" = :nop',
        "d2": ' AND d2."NOP" = :nop',
        "tfc": " AND tfc.nop = :nop",
        "p": " AND p.nop = :nop",
    }
    return filters[alias]


SCORECARDS_QUERY = """
SELECT
    COALESCE(SUM(t.rev), 0) AS total_revenue,
    COALESCE(SUM(t.payload), 0) AS total_payload
FROM traktor_data t
LEFT JOIN data_site_master d ON t.site_id = d."Siteid"
WHERE t.trx_month = :trx_month
{nop_filter}
"""

ACTIVE_MASTER_SITE_BREAKDOWN_QUERY = """
SELECT
    COUNT(DISTINCT d."Siteid") AS total_sites,
    COUNT(DISTINCT CASE
        WHEN UPPER(TRIM(d."Siteid")) LIKE 'EPM%' THEN d."Siteid"
    END) AS epm_sites,
    COUNT(DISTINCT CASE
        WHEN UPPER(TRIM(d."Siteid")) NOT LIKE 'EPM%' THEN d."Siteid"
    END) AS non_epm_sites
FROM data_site_master d
WHERE d."Status Site" = 'Active'
{nop_filter}
"""

YTD_SCORECARDS_QUERY = """
SELECT
    COALESCE(SUM(t.rev), 0) AS revenue_ytd,
    COALESCE(SUM(t.payload), 0) AS payload_ytd
FROM traktor_data t
LEFT JOIN data_site_master d ON t.site_id = d."Siteid"
WHERE CAST(SPLIT_PART(t.trx_month, '-', 1) AS INTEGER) = :tahun
  AND CAST(SPLIT_PART(t.trx_month, '-', 2) AS INTEGER) <= :bulan
{nop_filter}
"""

AVAILABILITY_SCORECARD_QUERY = """
WITH availability_cache AS (
    SELECT
        ROUND(
            (
                SUM(smm.total_time_in_minutes) - SUM(smm.total_outage_menit)
            ) / NULLIF(SUM(smm.total_time_in_minutes), 0) * 100.0
        , 4) AS avg_availability
    FROM site_month_metrics smm
    LEFT JOIN data_site_master d ON smm.site_id = d."Siteid"
    WHERE smm.tahun = :tahun AND smm.bulan = :bulan
    {nop_filter}
),
availability_logs AS (
    SELECT
        ROUND(AVG(NULLIF(a.availability::TEXT, '')::NUMERIC), 4) AS avg_availability,
        COUNT(DISTINCT a."SITE ID") AS total_sites
    FROM availability_logs_jatim a
    LEFT JOIN data_site_master d ON a."SITE ID" = d."Siteid"
    WHERE a.availability IS NOT NULL
      AND a."Tahun" = :tahun
      AND a."Bulan" = :bulan
    {nop_filter}
)
SELECT
    COALESCE(c.avg_availability, l.avg_availability) AS avg_availability,
    COALESCE(l.total_sites, 0) AS total_sites
FROM availability_cache c
CROSS JOIN availability_logs l
"""

REVENUE_BY_KABUPATEN_QUERY = """
WITH availability_cache AS (
    SELECT
        d2."Kabupaten/KOTA" AS kabupaten,
        ROUND(
            (SUM(smm.total_time_in_minutes) - SUM(smm.total_outage_menit))
            / NULLIF(SUM(smm.total_time_in_minutes), 0) * 100.0
        , 4) AS avg_availability
    FROM site_month_metrics smm
    JOIN data_site_master d2 ON smm.site_id = d2."Siteid"
    WHERE smm.tahun = CAST(SPLIT_PART(:trx_month, '-', 1) AS INTEGER)
      AND smm.bulan = CAST(SPLIT_PART(:trx_month, '-', 2) AS INTEGER)
      AND d2."Kabupaten/KOTA" IS NOT NULL
      {availability_nop_filter}
    GROUP BY d2."Kabupaten/KOTA"
),
availability_logs AS (
    SELECT
        d2."Kabupaten/KOTA" AS kabupaten,
        ROUND(AVG(NULLIF(a.availability::TEXT, '')::NUMERIC), 4) AS avg_availability
    FROM availability_logs_jatim a
    JOIN data_site_master d2 ON a."SITE ID" = d2."Siteid"
    WHERE a.availability IS NOT NULL
      AND a."Tahun" = CAST(SPLIT_PART(:trx_month, '-', 1) AS INTEGER)
      AND a."Bulan" = CAST(SPLIT_PART(:trx_month, '-', 2) AS INTEGER)
      AND d2."Kabupaten/KOTA" IS NOT NULL
      {availability_nop_filter}
    GROUP BY d2."Kabupaten/KOTA"
),
availability AS (
    SELECT
        COALESCE(c.kabupaten, l.kabupaten) AS kabupaten,
        COALESCE(c.avg_availability, l.avg_availability) AS avg_availability
    FROM availability_cache c
    FULL OUTER JOIN availability_logs l ON l.kabupaten = c.kabupaten
),
ticket_aggregate AS (
    SELECT
        COALESCE(NULLIF(TRIM(tfc.kabupaten_kota), ''), 'Unknown') AS kabupaten,
        COUNT(*) FILTER (WHERE UPPER(TRIM(tfc.kategori_tt)) = 'BPS') AS ticket_swfm_bps,
        COUNT(*) FILTER (WHERE UPPER(TRIM(tfc.kategori_tt)) LIKE 'TS%') AS ticket_swfm_ts
    FROM public.ticketing_fault_center tfc
    WHERE tfc.tahun = CAST(SPLIT_PART(:trx_month, '-', 1) AS INTEGER)
      AND EXTRACT(MONTH FROM tfc.created_at)::int = CAST(SPLIT_PART(:trx_month, '-', 2) AS INTEGER)
      AND NULLIF(TRIM(tfc.kabupaten_kota), '') IS NOT NULL
      {ticket_nop_filter}
    GROUP BY 1
),
proker_aggregate AS (
    SELECT
        COALESCE(NULLIF(TRIM(p.kabupaten), ''), 'Unknown') AS kabupaten,
        COUNT(*) FILTER (WHERE UPPER(TRIM(p.status)) = 'OPEN') AS proker_open,
        COUNT(*) FILTER (WHERE UPPER(TRIM(p.status)) = 'CLOSE') AS proker_closed
    FROM public.proker_enom_jatim_2026 p
    WHERE CAST(SPLIT_PART(:trx_month, '-', 1) AS INTEGER) = 2026
      AND p.bulan = CAST(SPLIT_PART(:trx_month, '-', 2) AS INTEGER)
      AND NULLIF(TRIM(p.kabupaten), '') IS NOT NULL
      {proker_nop_filter}
    GROUP BY 1
)
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
    COALESCE(SUM(t.trf_4g), 0) AS trf_4g,
    avail.avg_availability,
    COALESCE(MAX(tickets.ticket_swfm_bps), 0) AS ticket_swfm_bps,
    COALESCE(MAX(tickets.ticket_swfm_ts), 0) AS ticket_swfm_ts,
    COALESCE(MAX(proker.proker_open), 0) AS proker_open,
    COALESCE(MAX(proker.proker_closed), 0) AS proker_closed
FROM traktor_data t
JOIN data_site_master d ON t.site_id = d."Siteid"
LEFT JOIN availability avail ON avail.kabupaten = d."Kabupaten/KOTA"
LEFT JOIN ticket_aggregate tickets ON tickets.kabupaten = d."Kabupaten/KOTA"
LEFT JOIN proker_aggregate proker ON proker.kabupaten = d."Kabupaten/KOTA"
WHERE t.trx_month = :trx_month
  AND d."Kabupaten/KOTA" IS NOT NULL
  {nop_filter}
GROUP BY d."Kabupaten/KOTA", avail.avg_availability
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
  {nop_filter}
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
{nop_filter}
GROUP BY d."Kabupaten/KOTA"
ORDER BY d."Kabupaten/KOTA"
"""

REVENUE_TREND_QUERY = """
WITH revenue AS (
    SELECT
        t.trx_month,
        CAST(SPLIT_PART(t.trx_month, '-', 1) AS INTEGER) AS tahun,
        CAST(SPLIT_PART(t.trx_month, '-', 2) AS INTEGER) AS bulan,
        COALESCE(SUM(t.rev), 0) AS total_revenue,
        COALESCE(SUM(t.payload), 0) AS total_payload,
        COALESCE(SUM(t.traffic), 0) AS total_traffic
    FROM traktor_data t
    LEFT JOIN data_site_master d ON t.site_id = d."Siteid"
    WHERE 1 = 1
      {nop_filter}
    GROUP BY t.trx_month
),
availability_cache AS (
    SELECT
        CONCAT(smm.tahun::TEXT, '-', LPAD(smm.bulan::TEXT, 2, '0')) AS trx_month,
        ROUND(
            (
                SUM(smm.total_time_in_minutes) - SUM(smm.total_outage_menit)
            ) / NULLIF(SUM(smm.total_time_in_minutes), 0) * 100.0
        , 4) AS avg_availability
    FROM site_month_metrics smm
    LEFT JOIN data_site_master d ON smm.site_id = d."Siteid"
    WHERE 1 = 1
      {availability_nop_filter}
    GROUP BY smm.tahun, smm.bulan
),
availability_logs AS (
    SELECT
        CONCAT(a."Tahun"::TEXT, '-', LPAD(a."Bulan"::TEXT, 2, '0')) AS trx_month,
        ROUND(AVG(NULLIF(a.availability::TEXT, '')::NUMERIC), 4) AS avg_availability
    FROM availability_logs_jatim a
    LEFT JOIN data_site_master d ON a."SITE ID" = d."Siteid"
    WHERE a.availability IS NOT NULL
      {availability_nop_filter}
    GROUP BY a."Tahun", a."Bulan"
),
availability AS (
    SELECT
        COALESCE(c.trx_month, l.trx_month) AS trx_month,
        COALESCE(c.avg_availability, l.avg_availability) AS avg_availability
    FROM availability_cache c
    FULL OUTER JOIN availability_logs l ON l.trx_month = c.trx_month
)
SELECT
    r.trx_month,
    r.total_revenue,
    r.total_payload,
    r.total_traffic,
    avail.avg_availability
FROM revenue r
LEFT JOIN availability avail ON avail.trx_month = r.trx_month
ORDER BY r.trx_month
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
    response: Response = None,
):
    """List available trx_month values for the period selector."""
    cache_key = redis_cache.make_key("reporting", "available-months")
    cache_status, cached_value = await redis_cache.get_json(cache_key)
    if cache_status == "HIT":
        if response is not None:
            response.headers["X-Cache"] = cache_status
        return cached_value

    result = await session.execute(text(AVAILABLE_MONTHS_QUERY))
    rows = result.mappings().all()
    payload = [row["trx_month"] for row in rows]
    if cache_status == "MISS":
        await redis_cache.set_json(cache_key, payload)
    if response is not None:
        response.headers["X-Cache"] = cache_status
    return payload


@router.get("/scorecards", response_model=ReportingScorecard)
async def get_scorecards(
    trx_month: str = Query(..., description="Period in YYYY-MM format"),
    nop: str = Query(None),
    session: AsyncSession = Depends(get_session),
    response: Response = None,
):
    """Scorecard KPIs: total sites, revenue, payload, availability."""
    cache_key = redis_cache.make_key(
        "reporting",
        "scorecards",
        trx_month=trx_month,
        nop=nop or "",
    )
    cache_status, cached_value = await redis_cache.get_json(cache_key)
    if cache_status == "HIT":
        if response is not None:
            response.headers["X-Cache"] = cache_status
        return cached_value

    # Revenue/payload from traktor_data
    params = {"trx_month": trx_month, "nop": nop}
    result = await session.execute(
        text(SCORECARDS_QUERY.format(nop_filter=build_nop_filter(nop, "d"))),
        params,
    )
    row = result.mappings().first()

    total_revenue = int(row["total_revenue"]) if row else 0
    total_payload = int(row["total_payload"]) if row else 0

    site_result = await session.execute(
        text(ACTIVE_MASTER_SITE_BREAKDOWN_QUERY.format(nop_filter=build_nop_filter(nop, "d"))),
        {"nop": nop},
    )
    site_row = site_result.mappings().first()
    total_sites = int(site_row.get("total_sites") or 0) if site_row else 0
    epm_sites = int(site_row.get("epm_sites") or 0) if site_row else 0
    non_epm_sites = int(site_row.get("non_epm_sites") or 0) if site_row else 0

    revenue_ytd = 0
    payload_ytd = 0
    avg_availability = None
    try:
        tahun, bulan = (int(part) for part in trx_month.split("-", 1))

        ytd_result = await session.execute(
            text(YTD_SCORECARDS_QUERY.format(nop_filter=build_nop_filter(nop, "d"))),
            {"tahun": tahun, "bulan": bulan, "nop": nop},
        )
        ytd_row = ytd_result.mappings().first()
        if ytd_row:
            revenue_ytd = int(ytd_row.get("revenue_ytd") or 0)
            payload_ytd = int(ytd_row.get("payload_ytd") or 0)

        avail_result = await session.execute(
            text(AVAILABILITY_SCORECARD_QUERY.format(nop_filter=build_nop_filter(nop, "d"))),
            {"tahun": tahun, "bulan": bulan, "nop": nop},
        )
        avail_row = avail_result.mappings().first()
        if avail_row:
            if avail_row["avg_availability"] is not None:
                avg_availability = float(avail_row["avg_availability"])
    except (ValueError, IndexError):
        pass

    payload = ReportingScorecard(
        total_sites=total_sites,
        epm_sites=epm_sites,
        non_epm_sites=non_epm_sites,
        total_revenue=total_revenue,
        total_payload=total_payload,
        revenue_ytd=revenue_ytd,
        payload_ytd=payload_ytd,
        avg_availability=avg_availability,
    )
    if cache_status == "MISS":
        await redis_cache.set_json(cache_key, payload)
    if response is not None:
        response.headers["X-Cache"] = cache_status
    return payload


@router.get("/revenue-by-kabupaten", response_model=list[RevenueByKabupaten])
async def get_revenue_by_kabupaten(
    trx_month: str = Query(..., description="Period in YYYY-MM format"),
    nop: str = Query(None),
    session: AsyncSession = Depends(get_session),
    response: Response = None,
):
    """Revenue & payload breakdown pivot by Kabupaten/Kota."""
    cache_key = redis_cache.make_key(
        "reporting",
        "revenue-by-kabupaten",
        trx_month=trx_month,
        nop=nop or "",
    )
    cache_status, cached_value = await redis_cache.get_json(cache_key)
    if cache_status == "HIT":
        if response is not None:
            response.headers["X-Cache"] = cache_status
        return cached_value

    result = await session.execute(
        text(REVENUE_BY_KABUPATEN_QUERY.format(
            nop_filter=build_nop_filter(nop, "d"),
            availability_nop_filter=build_nop_filter(nop, "d2"),
            ticket_nop_filter=build_nop_filter(nop, "tfc"),
            proker_nop_filter=build_nop_filter(nop, "p"),
        )),
        {"trx_month": trx_month, "nop": nop},
    )
    rows = result.mappings().all()

    payload = [
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
            avg_availability=float(row["avg_availability"]) if row.get("avg_availability") is not None else None,
            ticket_swfm_bps=int(row.get("ticket_swfm_bps") or 0),
            ticket_swfm_ts=int(row.get("ticket_swfm_ts") or 0),
            proker_open=int(row.get("proker_open") or 0),
            proker_closed=int(row.get("proker_closed") or 0),
        )
        for row in rows
    ]
    if cache_status == "MISS":
        await redis_cache.set_json(cache_key, payload)
    if response is not None:
        response.headers["X-Cache"] = cache_status
    return payload


@router.get("/site-class-by-kabupaten", response_model=list[SiteClassByKabupaten])
async def get_site_class_by_kabupaten(
    trx_month: str = Query(..., description="Period in YYYY-MM format"),
    nop: str = Query(None),
    session: AsyncSession = Depends(get_session),
    response: Response = None,
):
    """Site class distribution cross-tab by Kabupaten/Kota."""
    cache_key = redis_cache.make_key(
        "reporting",
        "site-class-by-kabupaten",
        trx_month=trx_month,
        nop=nop or "",
    )
    cache_status, cached_value = await redis_cache.get_json(cache_key)
    if cache_status == "HIT":
        if response is not None:
            response.headers["X-Cache"] = cache_status
        return cached_value

    result = await session.execute(
        text(SITE_CLASS_BY_KABUPATEN_QUERY.format(nop_filter=build_nop_filter(nop, "d"))),
        {"trx_month": trx_month, "nop": nop},
    )
    rows = result.mappings().all()

    payload = [
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
    if cache_status == "MISS":
        await redis_cache.set_json(cache_key, payload)
    if response is not None:
        response.headers["X-Cache"] = cache_status
    return payload


@router.get("/battery-by-kabupaten", response_model=list[BatteryByKabupaten])
async def get_battery_by_kabupaten(
    nop: str = Query(None),
    session: AsyncSession = Depends(get_session),
    response: Response = None,
):
    """Battery type distribution cross-tab by Kabupaten/Kota."""
    cache_key = redis_cache.make_key(
        "reporting",
        "battery-by-kabupaten",
        nop=nop or "",
    )
    cache_status, cached_value = await redis_cache.get_json(cache_key)
    if cache_status == "HIT":
        if response is not None:
            response.headers["X-Cache"] = cache_status
        return cached_value

    result = await session.execute(
        text(BATTERY_BY_KABUPATEN_QUERY.format(nop_filter=build_nop_filter(nop, "d"))),
        {"nop": nop},
    )
    rows = result.mappings().all()

    payload = [
        BatteryByKabupaten(
            kabupaten=row.get("kabupaten"),
            lithium=int(row.get("lithium") or 0),
            vrla=int(row.get("vrla") or 0),
            tidak_ada=int(row.get("tidak_ada") or 0),
            total=int(row.get("total") or 0),
        )
        for row in rows
    ]
    if cache_status == "MISS":
        await redis_cache.set_json(cache_key, payload)
    if response is not None:
        response.headers["X-Cache"] = cache_status
    return payload


@router.get("/trend", response_model=list[RevenueTrendItem])
async def get_revenue_trend(
    nop: str = Query(None),
    session: AsyncSession = Depends(get_session),
    response: Response = None,
):
    """Monthly revenue/payload/traffic trend across all available months."""
    cache_key = redis_cache.make_key(
        "reporting",
        "trend",
        nop=nop or "",
    )
    cache_status, cached_value = await redis_cache.get_json(cache_key)
    if cache_status == "HIT":
        if response is not None:
            response.headers["X-Cache"] = cache_status
        return cached_value

    result = await session.execute(
        text(REVENUE_TREND_QUERY.format(
            nop_filter=build_nop_filter(nop, "d"),
            availability_nop_filter=build_nop_filter(nop, "d"),
        )),
        {"nop": nop},
    )
    rows = result.mappings().all()

    payload = [
        RevenueTrendItem(
            trx_month=row["trx_month"],
            total_revenue=int(row.get("total_revenue") or 0),
            total_payload=int(row.get("total_payload") or 0),
            total_traffic=int(row.get("total_traffic") or 0),
            avg_availability=float(row["avg_availability"]) if row.get("avg_availability") is not None else None,
        )
        for row in rows
    ]
    if cache_status == "MISS":
        await redis_cache.set_json(cache_key, payload)
    if response is not None:
        response.headers["X-Cache"] = cache_status
    return payload

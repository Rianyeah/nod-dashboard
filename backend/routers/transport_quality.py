"""
Transport Quality router - endpoints for packet_los_jatim operational dashboard.

GET /transport-quality/filters        - date/week periods and global filter values
GET /transport-quality/summary        - KPI scorecards for selected snapshot
GET /transport-quality/trend          - weekly PL, latency, jitter trend
GET /transport-quality/distributions  - PL, latency, jitter distributions
GET /transport-quality/breakdowns     - NOP, Kabupaten, transport type issue rankings
GET /transport-quality/priority-sites - paginated high-priority site table
"""
from datetime import date
import math

from fastapi import APIRouter, Depends, Query
import runtime_compat  # noqa: F401
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_session
from models.transport_quality import (
    TransportQualityBreakdownItem,
    TransportQualityBreakdowns,
    TransportQualityDistributionItem,
    TransportQualityDistributions,
    TransportQualityFilters,
    TransportQualityPeriod,
    TransportQualityPrioritySite,
    TransportQualityPrioritySiteResponse,
    TransportQualitySummary,
    TransportQualityTrendItem,
)

router = APIRouter(prefix="/transport-quality", tags=["Transport Quality"])

PL_THRESHOLD = 1
LATENCY_THRESHOLD = 5
DEFAULT_LIMIT = 20


def build_filter_params(
    date_filter: date | None = None,
    nop: str | None = None,
    kabupaten: str | None = None,
    transport_type: str | None = None,
    thi_status: str | None = None,
    distribution_pl: str | None = None,
    pl_status_0_1_pct: str | None = None,
    distribution_lat: str | None = None,
    jitter_status: str | None = None,
) -> dict:
    """Collect shared filter params for SQL execution."""
    return {
        "date_filter": date_filter,
        "nop": nop,
        "kabupaten": kabupaten,
        "transport_type": transport_type,
        "thi_status": thi_status,
        "distribution_pl": distribution_pl,
        "pl_status_0_1_pct": pl_status_0_1_pct,
        "distribution_lat": distribution_lat,
        "jitter_status": jitter_status,
    }


def build_filter_clause(params: dict, include_date: bool = True) -> str:
    """Build the shared packet_los_jatim filter clause."""
    clauses = []
    if include_date and params.get("date_filter"):
        clauses.append("p.date = :date_filter")
    if params.get("nop"):
        clauses.append("p.nop = :nop")
    if params.get("kabupaten"):
        clauses.append("p.kabupaten = :kabupaten")
    if params.get("transport_type"):
        clauses.append("p.transport_type = :transport_type")
    if params.get("thi_status"):
        clauses.append("p.thi_status = :thi_status")
    if params.get("distribution_pl"):
        clauses.append("p.distribution_pl = :distribution_pl")
    if params.get("pl_status_0_1_pct"):
        clauses.append("p.pl_status_0_1_pct = :pl_status_0_1_pct")
    if params.get("distribution_lat"):
        clauses.append("p.distribution_lat = :distribution_lat")
    if params.get("jitter_status"):
        clauses.append("p.jitter_status = :jitter_status")
    return "".join(f" AND {clause}" for clause in clauses)


async def resolve_date_filter(session: AsyncSession, date_filter: date | None) -> date | None:
    """Default to latest available packet loss snapshot."""
    if date_filter:
        return date_filter
    result = await session.execute(text("SELECT MAX(date) FROM public.packet_los_jatim"))
    return result.scalar_one_or_none()


def rows_to_models(rows, model):
    """Convert SQLAlchemy rows to Pydantic models."""
    return [model(**dict(row._mapping)) for row in rows]


FILTER_PERIODS_QUERY = """
SELECT
    date,
    week,
    TO_CHAR(date, '"W"IW - YYYY-MM-DD') AS label
FROM (
    SELECT DISTINCT date, week
    FROM public.packet_los_jatim
    WHERE date IS NOT NULL
) periods
ORDER BY date DESC
"""

FILTER_OPTIONS_QUERY = """
SELECT
    MIN(date) AS min_date,
    MAX(date) AS max_date,
    ARRAY(
        SELECT DISTINCT NULLIF(TRIM(nop), '')
        FROM public.packet_los_jatim
        WHERE NULLIF(TRIM(nop), '') IS NOT NULL
        ORDER BY 1
    ) AS nops,
    ARRAY(
        SELECT DISTINCT NULLIF(TRIM(kabupaten), '')
        FROM public.packet_los_jatim
        WHERE NULLIF(TRIM(kabupaten), '') IS NOT NULL
        ORDER BY 1
    ) AS kabupaten,
    ARRAY(
        SELECT DISTINCT NULLIF(TRIM(transport_type), '')
        FROM public.packet_los_jatim
        WHERE NULLIF(TRIM(transport_type), '') IS NOT NULL
        ORDER BY 1
    ) AS transport_types,
    ARRAY(
        SELECT DISTINCT NULLIF(TRIM(thi_status), '')
        FROM public.packet_los_jatim
        WHERE NULLIF(TRIM(thi_status), '') IS NOT NULL
        ORDER BY 1
    ) AS thi_statuses,
    ARRAY(
        SELECT DISTINCT NULLIF(TRIM(distribution_pl), '')
        FROM public.packet_los_jatim
        WHERE NULLIF(TRIM(distribution_pl), '') IS NOT NULL
        ORDER BY 1
    ) AS distribution_pl,
    ARRAY(
        SELECT DISTINCT NULLIF(TRIM(pl_status_0_1_pct), '')
        FROM public.packet_los_jatim
        WHERE NULLIF(TRIM(pl_status_0_1_pct), '') IS NOT NULL
        ORDER BY 1
    ) AS pl_status_0_1_pct,
    ARRAY(
        SELECT DISTINCT NULLIF(TRIM(distribution_lat), '')
        FROM public.packet_los_jatim
        WHERE NULLIF(TRIM(distribution_lat), '') IS NOT NULL
        ORDER BY 1
    ) AS distribution_lat,
    ARRAY(
        SELECT DISTINCT NULLIF(TRIM(jitter_status), '')
        FROM public.packet_los_jatim
        WHERE NULLIF(TRIM(jitter_status), '') IS NOT NULL
        ORDER BY 1
    ) AS jitter_statuses
FROM public.packet_los_jatim
"""

SUMMARY_QUERY = """
WITH base AS (
    SELECT p.*
    FROM public.packet_los_jatim p
    WHERE 1=1
    {filter_clause}
),
site_rollup AS (
    SELECT
        site_id,
        AVG(avg_packet_loss) AS avg_packet_loss,
        AVG(latency) AS latency,
        AVG(jitter) AS jitter,
        BOOL_OR(UPPER(COALESCE(flag_pl_status, '')) = 'FAIL') AS flag_pl_fail,
        BOOL_OR(UPPER(COALESCE(thi_status, '')) = 'FAIL') AS thi_fail
    FROM base
    WHERE site_id IS NOT NULL
    GROUP BY site_id
)
SELECT
    :date_filter AS date,
    (SELECT MAX(week) FROM base) AS week,
    (SELECT COUNT(*) FROM base) AS total_records,
    COUNT(*) AS total_sites,
    COUNT(*) FILTER (WHERE avg_packet_loss > 1) AS pl_over_1_sites,
    COUNT(*) FILTER (WHERE latency > 5) AS latency_over_5_sites,
    COUNT(*) FILTER (WHERE flag_pl_fail) AS flag_pl_fail_sites,
    COUNT(*) FILTER (WHERE thi_fail) AS thi_fail_sites,
    COUNT(*) FILTER (WHERE flag_pl_fail OR thi_fail) AS p1_sites,
    COUNT(*) FILTER (
        WHERE (avg_packet_loss > 1 OR latency > 5)
          AND NOT (flag_pl_fail OR thi_fail)
    ) AS p2_sites,
    COUNT(*) FILTER (
        WHERE avg_packet_loss > 1 OR latency > 5 OR flag_pl_fail OR thi_fail
    ) AS priority_sites,
    ROUND(AVG(avg_packet_loss), 4)::float AS avg_packet_loss,
    ROUND(AVG(latency), 3)::float AS avg_latency,
    ROUND(AVG(jitter), 3)::float AS avg_jitter
FROM site_rollup
"""

TREND_QUERY = """
WITH selected_dates AS (
    SELECT DISTINCT date
    FROM public.packet_los_jatim
    WHERE date <= :date_filter
    ORDER BY date DESC
    LIMIT 12
),
base AS (
    SELECT p.*
    FROM public.packet_los_jatim p
    JOIN selected_dates d ON d.date = p.date
    WHERE 1=1
    {filter_clause}
),
site_rollup AS (
    SELECT
        date,
        MAX(week) AS week,
        site_id,
        AVG(avg_packet_loss) AS avg_packet_loss,
        AVG(latency) AS latency,
        AVG(jitter) AS jitter,
        BOOL_OR(UPPER(COALESCE(flag_pl_status, '')) = 'FAIL') AS flag_pl_fail,
        BOOL_OR(UPPER(COALESCE(thi_status, '')) = 'FAIL') AS thi_fail
    FROM base
    WHERE site_id IS NOT NULL
    GROUP BY date, site_id
)
SELECT
    date,
    MAX(week) AS week,
    COUNT(*) AS total_sites,
    ROUND(AVG(avg_packet_loss), 4)::float AS avg_packet_loss,
    ROUND(AVG(latency), 3)::float AS avg_latency,
    ROUND(AVG(jitter), 3)::float AS avg_jitter,
    COUNT(*) FILTER (WHERE avg_packet_loss > 1) AS pl_over_1_sites,
    COUNT(*) FILTER (WHERE latency > 5) AS latency_over_5_sites,
    COUNT(*) FILTER (WHERE flag_pl_fail OR thi_fail) AS p1_sites
FROM site_rollup
GROUP BY date
ORDER BY date
"""

PL_DISTRIBUTION_QUERY = """
SELECT
    COALESCE(NULLIF(TRIM(p.distribution_pl), ''), 'Unknown') AS label,
    COUNT(*) AS records,
    COUNT(DISTINCT p.site_id) AS sites,
    COUNT(*) FILTER (WHERE p.avg_packet_loss > 1) AS bad_records
FROM public.packet_los_jatim p
WHERE 1=1
{filter_clause}
GROUP BY 1
ORDER BY CASE COALESCE(NULLIF(TRIM(p.distribution_pl), ''), 'Unknown')
    WHEN '0-0.1%' THEN 1
    WHEN '0.1-1%' THEN 2
    WHEN '1-5%' THEN 3
    WHEN '>5%' THEN 4
    ELSE 5
END, label
"""

LATENCY_DISTRIBUTION_QUERY = """
SELECT
    COALESCE(NULLIF(TRIM(p.distribution_lat), ''), 'Unknown') AS label,
    COUNT(*) AS records,
    COUNT(DISTINCT p.site_id) AS sites,
    COUNT(*) FILTER (WHERE p.latency > 5) AS bad_records
FROM public.packet_los_jatim p
WHERE 1=1
{filter_clause}
GROUP BY 1
ORDER BY CASE COALESCE(NULLIF(TRIM(p.distribution_lat), ''), 'Unknown')
    WHEN '0-5ms' THEN 1
    WHEN '5-10ms' THEN 2
    WHEN '10-20ms' THEN 3
    WHEN '20-40ms' THEN 4
    WHEN '>40ms' THEN 5
    ELSE 6
END, label
"""

JITTER_DISTRIBUTION_QUERY = """
SELECT
    COALESCE(NULLIF(TRIM(p.jitter_status), ''), 'Unknown') AS label,
    COUNT(*) AS records,
    COUNT(DISTINCT p.site_id) AS sites,
    COUNT(*) FILTER (WHERE UPPER(COALESCE(p.jitter_status, '')) IN ('NOT-CLEAR', 'NOT CLEAR')) AS bad_records
FROM public.packet_los_jatim p
WHERE 1=1
{filter_clause}
GROUP BY 1
ORDER BY bad_records DESC, records DESC, label
"""

BREAKDOWN_QUERY = """
WITH base AS (
    SELECT
        COALESCE(NULLIF(TRIM({dimension_expr}::text), ''), 'Unknown') AS label,
        p.*
    FROM public.packet_los_jatim p
    WHERE 1=1
    {filter_clause}
),
site_rollup AS (
    SELECT
        label,
        site_id,
        AVG(avg_packet_loss) AS avg_packet_loss,
        AVG(latency) AS latency,
        AVG(jitter) AS jitter,
        BOOL_OR(UPPER(COALESCE(flag_pl_status, '')) = 'FAIL') AS flag_pl_fail,
        BOOL_OR(UPPER(COALESCE(thi_status, '')) = 'FAIL') AS thi_fail
    FROM base
    WHERE site_id IS NOT NULL
    GROUP BY label, site_id
)
SELECT
    label,
    (SELECT COUNT(*) FROM base WHERE base.label = site_rollup.label) AS records,
    COUNT(*) AS sites,
    COUNT(*) FILTER (WHERE avg_packet_loss > 1) AS pl_over_1_sites,
    COUNT(*) FILTER (WHERE latency > 5) AS latency_over_5_sites,
    COUNT(*) FILTER (WHERE flag_pl_fail) AS flag_pl_fail_sites,
    COUNT(*) FILTER (WHERE thi_fail) AS thi_fail_sites,
    COUNT(*) FILTER (WHERE flag_pl_fail OR thi_fail) AS p1_sites,
    COUNT(*) FILTER (
        WHERE (avg_packet_loss > 1 OR latency > 5)
          AND NOT (flag_pl_fail OR thi_fail)
    ) AS p2_sites,
    ROUND(AVG(avg_packet_loss), 4)::float AS avg_packet_loss,
    ROUND(AVG(latency), 3)::float AS avg_latency,
    ROUND(AVG(jitter), 3)::float AS avg_jitter
FROM site_rollup
GROUP BY label
ORDER BY p1_sites DESC, pl_over_1_sites DESC, latency_over_5_sites DESC, sites DESC, label
LIMIT :limit
"""

PRIORITY_COUNT_QUERY = """
WITH base AS (
    SELECT p.*
    FROM public.packet_los_jatim p
    WHERE 1=1
    {filter_clause}
),
site_rollup AS (
    SELECT
        site_id,
        MAX(site_name) AS site_name,
        MAX(nop) AS nop,
        MAX(kabupaten) AS kabupaten,
        MAX(transport_type) AS transport_type,
        AVG(avg_packet_loss) AS avg_packet_loss,
        AVG(latency) AS latency,
        AVG(jitter) AS jitter,
        MAX(distribution_pl) AS distribution_pl,
        MAX(distribution_lat) AS distribution_lat,
        MAX(jitter_status) AS jitter_status,
        MAX(flag_pl_status) AS flag_pl_status,
        MAX(thi_status) AS thi_status,
        AVG(avg_packet_loss) > 1 AS pl_over_threshold,
        AVG(latency) > 5 AS latency_over_threshold,
        BOOL_OR(UPPER(COALESCE(flag_pl_status, '')) = 'FAIL') AS flag_pl_fail,
        BOOL_OR(UPPER(COALESCE(thi_status, '')) = 'FAIL') AS thi_fail
    FROM base
    WHERE site_id IS NOT NULL
    GROUP BY site_id
)
SELECT COUNT(*) AS total
FROM site_rollup
WHERE pl_over_threshold OR latency_over_threshold OR flag_pl_fail OR thi_fail
"""

PRIORITY_LIST_QUERY = """
WITH base AS (
    SELECT p.*
    FROM public.packet_los_jatim p
    WHERE 1=1
    {filter_clause}
),
site_rollup AS (
    SELECT
        site_id,
        MAX(site_name) AS site_name,
        MAX(nop) AS nop,
        MAX(kabupaten) AS kabupaten,
        MAX(transport_type) AS transport_type,
        AVG(avg_packet_loss) AS avg_packet_loss,
        AVG(latency) AS latency,
        AVG(jitter) AS jitter,
        MAX(distribution_pl) AS distribution_pl,
        MAX(distribution_lat) AS distribution_lat,
        MAX(jitter_status) AS jitter_status,
        MAX(flag_pl_status) AS flag_pl_status,
        MAX(thi_status) AS thi_status,
        AVG(avg_packet_loss) > 1 AS pl_over_threshold,
        AVG(latency) > 5 AS latency_over_threshold,
        BOOL_OR(UPPER(COALESCE(flag_pl_status, '')) = 'FAIL') AS flag_pl_fail,
        BOOL_OR(UPPER(COALESCE(thi_status, '')) = 'FAIL') AS thi_fail
    FROM base
    WHERE site_id IS NOT NULL
    GROUP BY site_id
)
SELECT
    site_id,
    site_name,
    nop,
    kabupaten,
    transport_type,
    ROUND(avg_packet_loss, 4)::float AS avg_packet_loss,
    ROUND(latency, 3)::float AS latency,
    ROUND(jitter, 3)::float AS jitter,
    distribution_pl,
    distribution_lat,
    jitter_status,
    flag_pl_status,
    thi_status,
    pl_over_threshold,
    latency_over_threshold,
    flag_pl_fail,
    thi_fail,
    CASE
        WHEN flag_pl_fail OR thi_fail THEN 'P1'
        WHEN pl_over_threshold OR latency_over_threshold THEN 'P2'
        ELSE 'Normal'
    END AS priority_level,
    (
        pl_over_threshold::int
        + latency_over_threshold::int
        + flag_pl_fail::int
        + thi_fail::int
    ) AS priority_score,
    CASE
        WHEN flag_pl_fail OR thi_fail THEN 'Escalate transport recovery'
        WHEN pl_over_threshold AND latency_over_threshold THEN 'Investigate PL and latency'
        WHEN pl_over_threshold THEN 'Investigate packet loss'
        WHEN latency_over_threshold THEN 'Review latency path'
        ELSE 'Monitor'
    END AS action_hint
FROM site_rollup
WHERE pl_over_threshold OR latency_over_threshold OR flag_pl_fail OR thi_fail
ORDER BY
    CASE
        WHEN flag_pl_fail OR thi_fail THEN 1
        WHEN pl_over_threshold OR latency_over_threshold THEN 2
        ELSE 3
    END,
    priority_score DESC,
    avg_packet_loss DESC NULLS LAST,
    latency DESC NULLS LAST,
    site_id
LIMIT :limit OFFSET :offset
"""

BREAKDOWN_DIMENSIONS = {
    "nop": "p.nop",
    "kabupaten": "p.kabupaten",
    "transport_type": "p.transport_type",
}


@router.get("/filters", response_model=TransportQualityFilters)
async def get_transport_quality_filters(session: AsyncSession = Depends(get_session)):
    """Return available period and global filter values."""
    options_result = await session.execute(text(FILTER_OPTIONS_QUERY))
    options = dict(options_result.one()._mapping)
    periods_result = await session.execute(text(FILTER_PERIODS_QUERY))
    periods = rows_to_models(periods_result.fetchall(), TransportQualityPeriod)

    return TransportQualityFilters(
        min_date=options.get("min_date"),
        max_date=options.get("max_date"),
        periods=periods,
        nops=options.get("nops") or [],
        kabupaten=options.get("kabupaten") or [],
        transport_types=options.get("transport_types") or [],
        thi_statuses=options.get("thi_statuses") or [],
        distribution_pl=options.get("distribution_pl") or [],
        pl_status_0_1_pct=options.get("pl_status_0_1_pct") or [],
        distribution_lat=options.get("distribution_lat") or [],
        jitter_statuses=options.get("jitter_statuses") or [],
    )


@router.get("/summary", response_model=TransportQualitySummary)
async def get_transport_quality_summary(
    date_filter: date | None = Query(None, alias="date"),
    nop: str | None = Query(None),
    kabupaten: str | None = Query(None),
    transport_type: str | None = Query(None),
    thi_status: str | None = Query(None),
    distribution_pl: str | None = Query(None),
    pl_status_0_1_pct: str | None = Query(None),
    distribution_lat: str | None = Query(None),
    jitter_status: str | None = Query(None),
    session: AsyncSession = Depends(get_session),
):
    date_filter = await resolve_date_filter(session, date_filter)
    params = build_filter_params(
        date_filter, nop, kabupaten, transport_type, thi_status,
        distribution_pl, pl_status_0_1_pct, distribution_lat, jitter_status,
    )
    query = SUMMARY_QUERY.format(filter_clause=build_filter_clause(params))
    result = await session.execute(text(query), params)
    row = result.one_or_none()
    return TransportQualitySummary(**dict(row._mapping)) if row else TransportQualitySummary(date=date_filter)


@router.get("/trend", response_model=list[TransportQualityTrendItem])
async def get_transport_quality_trend(
    date_filter: date | None = Query(None, alias="date"),
    nop: str | None = Query(None),
    kabupaten: str | None = Query(None),
    transport_type: str | None = Query(None),
    thi_status: str | None = Query(None),
    distribution_pl: str | None = Query(None),
    pl_status_0_1_pct: str | None = Query(None),
    distribution_lat: str | None = Query(None),
    jitter_status: str | None = Query(None),
    session: AsyncSession = Depends(get_session),
):
    date_filter = await resolve_date_filter(session, date_filter)
    params = build_filter_params(
        date_filter, nop, kabupaten, transport_type, thi_status,
        distribution_pl, pl_status_0_1_pct, distribution_lat, jitter_status,
    )
    query = TREND_QUERY.format(filter_clause=build_filter_clause(params, include_date=False))
    result = await session.execute(text(query), params)
    return rows_to_models(result.fetchall(), TransportQualityTrendItem)


@router.get("/distributions", response_model=TransportQualityDistributions)
async def get_transport_quality_distributions(
    date_filter: date | None = Query(None, alias="date"),
    nop: str | None = Query(None),
    kabupaten: str | None = Query(None),
    transport_type: str | None = Query(None),
    thi_status: str | None = Query(None),
    distribution_pl: str | None = Query(None),
    pl_status_0_1_pct: str | None = Query(None),
    distribution_lat: str | None = Query(None),
    jitter_status: str | None = Query(None),
    session: AsyncSession = Depends(get_session),
):
    date_filter = await resolve_date_filter(session, date_filter)
    params = build_filter_params(
        date_filter, nop, kabupaten, transport_type, thi_status,
        distribution_pl, pl_status_0_1_pct, distribution_lat, jitter_status,
    )
    filter_clause = build_filter_clause(params)
    pl_result = await session.execute(text(PL_DISTRIBUTION_QUERY.format(filter_clause=filter_clause)), params)
    lat_result = await session.execute(text(LATENCY_DISTRIBUTION_QUERY.format(filter_clause=filter_clause)), params)
    jitter_result = await session.execute(text(JITTER_DISTRIBUTION_QUERY.format(filter_clause=filter_clause)), params)
    return TransportQualityDistributions(
        by_packet_loss=rows_to_models(pl_result.fetchall(), TransportQualityDistributionItem),
        by_latency=rows_to_models(lat_result.fetchall(), TransportQualityDistributionItem),
        by_jitter=rows_to_models(jitter_result.fetchall(), TransportQualityDistributionItem),
    )


async def load_breakdown(
    session: AsyncSession,
    dimension: str,
    filter_clause: str,
    params: dict,
) -> list[TransportQualityBreakdownItem]:
    query = BREAKDOWN_QUERY.format(
        dimension_expr=BREAKDOWN_DIMENSIONS[dimension],
        filter_clause=filter_clause,
    )
    result = await session.execute(text(query), {**params, "limit": 12})
    return rows_to_models(result.fetchall(), TransportQualityBreakdownItem)


@router.get("/breakdowns", response_model=TransportQualityBreakdowns)
async def get_transport_quality_breakdowns(
    date_filter: date | None = Query(None, alias="date"),
    nop: str | None = Query(None),
    kabupaten: str | None = Query(None),
    transport_type: str | None = Query(None),
    thi_status: str | None = Query(None),
    distribution_pl: str | None = Query(None),
    pl_status_0_1_pct: str | None = Query(None),
    distribution_lat: str | None = Query(None),
    jitter_status: str | None = Query(None),
    session: AsyncSession = Depends(get_session),
):
    date_filter = await resolve_date_filter(session, date_filter)
    params = build_filter_params(
        date_filter, nop, kabupaten, transport_type, thi_status,
        distribution_pl, pl_status_0_1_pct, distribution_lat, jitter_status,
    )
    filter_clause = build_filter_clause(params)
    return TransportQualityBreakdowns(
        by_nop=await load_breakdown(session, "nop", filter_clause, params),
        by_kabupaten=await load_breakdown(session, "kabupaten", filter_clause, params),
        by_transport_type=await load_breakdown(session, "transport_type", filter_clause, params),
    )


@router.get("/priority-sites", response_model=TransportQualityPrioritySiteResponse)
async def get_transport_quality_priority_sites(
    date_filter: date | None = Query(None, alias="date"),
    nop: str | None = Query(None),
    kabupaten: str | None = Query(None),
    transport_type: str | None = Query(None),
    thi_status: str | None = Query(None),
    distribution_pl: str | None = Query(None),
    pl_status_0_1_pct: str | None = Query(None),
    distribution_lat: str | None = Query(None),
    jitter_status: str | None = Query(None),
    page: int = Query(1, ge=1),
    limit: int = Query(DEFAULT_LIMIT, ge=1, le=100),
    session: AsyncSession = Depends(get_session),
):
    date_filter = await resolve_date_filter(session, date_filter)
    params = build_filter_params(
        date_filter, nop, kabupaten, transport_type, thi_status,
        distribution_pl, pl_status_0_1_pct, distribution_lat, jitter_status,
    )
    filter_clause = build_filter_clause(params)
    count_result = await session.execute(
        text(PRIORITY_COUNT_QUERY.format(filter_clause=filter_clause)),
        params,
    )
    total = count_result.scalar_one() or 0
    total_pages = math.ceil(total / limit) if total else 0
    offset = (page - 1) * limit

    list_result = await session.execute(
        text(PRIORITY_LIST_QUERY.format(filter_clause=filter_clause)),
        {**params, "limit": limit, "offset": offset},
    )
    return TransportQualityPrioritySiteResponse(
        items=rows_to_models(list_result.fetchall(), TransportQualityPrioritySite),
        total=total,
        page=page,
        limit=limit,
        total_pages=total_pages,
    )

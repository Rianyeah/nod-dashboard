"""Overview router - single Home payload composed from existing dashboard modules."""
import asyncio
from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from cache import CACHE_HIT, CACHE_MISS, OVERVIEW_CACHE_TTL_SECONDS, redis_cache
from database import async_session, get_session
from models.availability import AvailabilitySummary, WorstSite
from models.impact_service import (
    ImpactServiceDistributions,
    ImpactServiceFilters,
    ImpactServiceSummary,
)
from models.overview import (
    OverviewPeriod,
    OverviewResponse,
    SiteClassBreakdown,
    SitePotential,
    SitePotentialMetric,
    WorstRevenueSite,
)
from models.reporting import ReportingScorecard, RevenueTrendItem
from models.ticketing import TicketingDashboard, TicketingFilters
from models.transport_quality import (
    TransportQualityPrioritySite,
    TransportQualityPrioritySiteResponse,
    TransportQualitySummary,
    TransportQualityTrendItem,
)
from periods import MonthPeriod, build_period_meta, resolve_month_period
from routers.availability import (
    get_latest_period,
    get_summary,
    get_worst_sites,
)
from routers.impact_service import (
    get_impact_service_daily_trend,
    get_impact_service_distributions,
    get_impact_service_filters,
    get_impact_service_last_7_days_trend,
    get_impact_service_latest_window,
    get_impact_service_summary,
    get_impact_service_top_sites,
)
from routers.reporting import (
    get_available_months,
    get_revenue_trend,
    get_scorecards,
)
from routers.ticketing import (
    DASHBOARD_SUMMARY_QUERY,
    TOP_SITES_QUERY,
    TREND_QUERY,
    build_filter_clause as build_ticketing_filter_clause,
    build_filter_params as build_ticketing_filter_params,
    get_ticketing_dashboard,
    get_ticketing_filters,
    normalize_category_sql as normalize_ticket_category_sql,
    row_to_dict,
    rows_to_dicts,
)
from routers.transport_quality import (
    PRIORITY_COUNT_QUERY as TRANSPORT_PRIORITY_COUNT_QUERY,
    PRIORITY_LIST_QUERY as TRANSPORT_PRIORITY_LIST_QUERY,
    SUMMARY_QUERY as TRANSPORT_SUMMARY_QUERY,
    TREND_QUERY as TRANSPORT_TREND_QUERY,
    build_filter_clause as build_transport_filter_clause,
    build_filter_params as build_transport_filter_params,
    get_transport_quality_priority_sites,
    get_transport_quality_summary,
    get_transport_quality_trend,
    rows_to_models as transport_rows_to_models,
)
from queries.metrics_cache import ensure_site_month_metrics
from queries.sql_queries import (
    SUMMARY_CARD_QUERY as AVAILABILITY_SUMMARY_QUERY,
    WORST_SITES_QUERY as AVAILABILITY_WORST_SITES_QUERY,
)

router = APIRouter(prefix="/overview", tags=["Overview"])


SITE_POTENTIAL_SUMMARY_QUERY = """
WITH base AS (
    SELECT DISTINCT
        d."Siteid",
        d."Type Battery",
        d."ENVA STATUS",
        d."Transport Type",
        d."Site Class"
    FROM public.data_site_master d
    WHERE NULLIF(TRIM(d."Siteid"), '') IS NOT NULL
      AND (
        CAST(:module_nop AS text) IS NULL
        OR REGEXP_REPLACE(UPPER(TRIM(COALESCE(d."NOP", ''))), '^NOP\\s+', '') = :module_nop
      )
)
SELECT
    COUNT(*)::int AS total_sites,
    COUNT(*) FILTER (WHERE LOWER(TRIM(COALESCE("Type Battery", ''))) = 'lithium')::int AS site_lithium,
    COUNT(*) FILTER (WHERE LOWER(TRIM(COALESCE("Type Battery", ''))) = 'vrla')::int AS site_vrla,
    COUNT(*) FILTER (WHERE LOWER(TRIM(COALESCE("ENVA STATUS", ''))) = 'completed')::int AS enva_validated,
    COUNT(*) FILTER (
        WHERE NULLIF(TRIM(COALESCE("Transport Type", '')), '') IS NOT NULL
          AND UPPER(TRIM("Transport Type")) <> 'FO_TELKOM'
          AND UPPER(TRIM("Transport Type")) NOT LIKE '#N/A%'
    )::int AS radio_ip
FROM base
"""

SITE_CLASS_BREAKDOWN_QUERY = """
WITH base AS (
    SELECT DISTINCT
        d."Siteid",
        CASE
            WHEN NULLIF(TRIM(COALESCE(d."Site Class", '')), '') IS NULL THEN 'Unknown'
            WHEN UPPER(TRIM(d."Site Class")) LIKE '#N/A%' THEN 'Unknown'
            ELSE TRIM(d."Site Class")
        END AS site_class
    FROM public.data_site_master d
    WHERE NULLIF(TRIM(d."Siteid"), '') IS NOT NULL
      AND (
        CAST(:module_nop AS text) IS NULL
        OR REGEXP_REPLACE(UPPER(TRIM(COALESCE(d."NOP", ''))), '^NOP\\s+', '') = :module_nop
      )
)
SELECT
    site_class AS label,
    COUNT(*)::int AS total
FROM base
GROUP BY site_class
ORDER BY total DESC, site_class ASC
LIMIT 6
"""


WORST_REVENUE_SITES_QUERY = """
WITH current_revenue AS (
    SELECT
        t.site_id,
        MAX(NULLIF(TRIM(d."Site Name"), '')) AS site_name,
        MAX(NULLIF(TRIM(d."Kabupaten/KOTA"), '')) AS kabupaten,
        COALESCE(SUM(t.rev), 0)::bigint AS total_revenue,
        COALESCE(SUM(t.payload), 0)::bigint AS total_payload
    FROM public.traktor_data t
    LEFT JOIN public.data_site_master d ON t.site_id = d."Siteid"
    WHERE t.trx_month BETWEEN :period_start AND :period_end
      AND NULLIF(TRIM(t.site_id), '') IS NOT NULL
      AND (
        CAST(:site_master_nop AS text) IS NULL
        OR d."NOP" = :site_master_nop
        OR REGEXP_REPLACE(UPPER(TRIM(COALESCE(d."NOP", ''))), '^NOP\\s+', '') = :module_nop
      )
    GROUP BY t.site_id
    HAVING COALESCE(SUM(t.rev), 0) > 1000000
),
previous_revenue AS (
    SELECT
        t.site_id,
        COALESCE(SUM(t.rev), 0)::bigint AS previous_revenue
    FROM public.traktor_data t
    LEFT JOIN public.data_site_master d ON t.site_id = d."Siteid"
    WHERE t.trx_month BETWEEN :comparison_start AND :comparison_end
      AND NULLIF(TRIM(t.site_id), '') IS NOT NULL
      AND (
        CAST(:site_master_nop AS text) IS NULL
        OR d."NOP" = :site_master_nop
        OR REGEXP_REPLACE(UPPER(TRIM(COALESCE(d."NOP", ''))), '^NOP\\s+', '') = :module_nop
      )
    GROUP BY t.site_id
)
SELECT
    c.site_id,
    c.site_name,
    c.kabupaten,
    c.total_revenue,
    c.total_payload,
    COALESCE(p.previous_revenue, 0)::bigint AS previous_revenue,
    CASE
        WHEN COALESCE(p.previous_revenue, 0) > 0
            THEN ROUND(((c.total_revenue - p.previous_revenue)::numeric / p.previous_revenue) * 100.0, 1)
        ELSE NULL
    END AS mom_percentage
FROM current_revenue c
LEFT JOIN previous_revenue p ON p.site_id = c.site_id
ORDER BY total_revenue ASC, site_id ASC
LIMIT :limit_val
"""


RECENT_REVENUE_TREND_QUERY = """
WITH selected_months AS (
    SELECT TO_CHAR(month_start, 'YYYY-MM') AS trx_month
    FROM generate_series(
        DATE_TRUNC('month', TO_DATE(:context_start || '-01', 'YYYY-MM-DD')),
        DATE_TRUNC('month', TO_DATE(:period_end || '-01', 'YYYY-MM-DD')),
        INTERVAL '1 month'
    ) AS months(month_start)
),
revenue AS (
    SELECT
        t.trx_month,
        COUNT(DISTINCT t.site_id) AS total_sites,
        COALESCE(SUM(t.rev), 0)::bigint AS total_revenue,
        COALESCE(SUM(t.payload), 0)::bigint AS total_payload,
        COALESCE(SUM(t.traffic), 0)::bigint AS total_traffic
    FROM public.traktor_data t
    LEFT JOIN public.data_site_master d ON t.site_id = d."Siteid"
    WHERE t.trx_month IN (SELECT trx_month FROM selected_months)
      AND (
        CAST(:site_master_nop AS text) IS NULL
        OR d."NOP" = :site_master_nop
        OR REGEXP_REPLACE(UPPER(TRIM(COALESCE(d."NOP", ''))), '^NOP\\s+', '') = :module_nop
      )
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
    FROM public.site_month_metrics smm
    LEFT JOIN public.data_site_master d ON smm.site_id = d."Siteid"
    WHERE CONCAT(smm.tahun::TEXT, '-', LPAD(smm.bulan::TEXT, 2, '0')) IN (SELECT trx_month FROM selected_months)
      AND (
        CAST(:site_master_nop AS text) IS NULL
        OR d."NOP" = :site_master_nop
        OR REGEXP_REPLACE(UPPER(TRIM(COALESCE(d."NOP", ''))), '^NOP\\s+', '') = :module_nop
    )
    GROUP BY smm.tahun, smm.bulan
)
SELECT
    sm.trx_month,
    COALESCE(r.total_sites, 0) AS total_sites,
    COALESCE(r.total_revenue, 0)::bigint AS total_revenue,
    COALESCE(r.total_payload, 0)::bigint AS total_payload,
    COALESCE(r.total_traffic, 0)::bigint AS total_traffic,
    avail.avg_availability
FROM selected_months sm
LEFT JOIN revenue r ON r.trx_month = sm.trx_month
LEFT JOIN availability_cache avail ON avail.trx_month = sm.trx_month
ORDER BY sm.trx_month
"""

AVAILABILITY_RANGE_SUMMARY_QUERY = """
WITH site_aggregate AS (
    SELECT
        smm.site_id,
        SUM(smm.total_time_in_minutes)::numeric AS total_time_in_minutes,
        SUM(smm.total_outage_menit)::numeric AS total_outage_menit,
        MAX(smm.jumlah_cell)::int AS jumlah_cell
    FROM public.site_month_metrics smm
    JOIN public.data_site_master d ON d."Siteid" = smm.site_id
    WHERE CONCAT(smm.tahun::text, '-', LPAD(smm.bulan::text, 2, '0')) BETWEEN :period_start AND :period_end
      AND (
        CAST(:site_master_nop AS text) IS NULL
        OR d."NOP" = :site_master_nop
        OR REGEXP_REPLACE(UPPER(TRIM(COALESCE(d."NOP", ''))), '^NOP\\s+', '') = :module_nop
      )
    GROUP BY smm.site_id
), scored AS (
    SELECT *, ROUND((total_time_in_minutes - total_outage_menit) / NULLIF(total_time_in_minutes, 0) * 100.0, 4) AS avg_availability
    FROM site_aggregate
)
SELECT
    COUNT(*)::int AS total_site_dengan_data,
    COUNT(*)::int AS total_site_master,
    ROUND((SUM(total_time_in_minutes) - SUM(total_outage_menit)) / NULLIF(SUM(total_time_in_minutes), 0) * 100.0, 4) AS avg_availability,
    SUM(total_outage_menit) AS total_outage_menit,
    SUM(jumlah_cell)::int AS total_cell,
    COUNT(*) FILTER (WHERE avg_availability >= 99.5)::int AS site_excellent,
    COUNT(*) FILTER (WHERE avg_availability >= 95 AND avg_availability < 99.5)::int AS site_degraded,
    COUNT(*) FILTER (WHERE avg_availability < 95)::int AS site_critical
FROM scored
"""

AVAILABILITY_RANGE_WORST_QUERY = """
WITH site_aggregate AS (
    SELECT
        smm.site_id,
        SUM(smm.total_time_in_minutes)::numeric AS total_time_in_minutes,
        SUM(smm.total_outage_menit)::numeric AS total_outage_menit,
        MAX(smm.jumlah_cell)::int AS jumlah_cell
    FROM public.site_month_metrics smm
    JOIN public.data_site_master d ON d."Siteid" = smm.site_id
    WHERE CONCAT(smm.tahun::text, '-', LPAD(smm.bulan::text, 2, '0')) BETWEEN :period_start AND :period_end
      AND (
        CAST(:site_master_nop AS text) IS NULL
        OR d."NOP" = :site_master_nop
        OR REGEXP_REPLACE(UPPER(TRIM(COALESCE(d."NOP", ''))), '^NOP\\s+', '') = :module_nop
      )
    GROUP BY smm.site_id
)
SELECT
    a.site_id,
    d."Site Name" AS site_name,
    d."Kabupaten/KOTA" AS kabupaten,
    d."Site Class",
    ROUND((a.total_time_in_minutes - a.total_outage_menit) / NULLIF(a.total_time_in_minutes, 0) * 100.0, 4) AS avg_availability,
    a.total_outage_menit,
    a.jumlah_cell
FROM site_aggregate a
JOIN public.data_site_master d ON d."Siteid" = a.site_id
ORDER BY avg_availability ASC NULLS LAST
LIMIT :limit_val
"""

OVERVIEW_SOURCE_MONTHS_QUERY = """
SELECT
    ARRAY(
        SELECT DISTINCT CONCAT(tahun::text, '-', LPAD(bulan::text, 2, '0'))
        FROM public.site_month_metrics
        ORDER BY 1 DESC
    ) AS availability,
    ARRAY(
        SELECT DISTINCT TO_CHAR(created_at, 'YYYY-MM')
        FROM public.ticketing_fault_center
        WHERE created_at IS NOT NULL
        ORDER BY 1 DESC
    ) AS ticketing,
    ARRAY(
        SELECT DISTINCT TO_CHAR(date, 'YYYY-MM')
        FROM public.packet_los_jatim
        WHERE date IS NOT NULL
        ORDER BY 1 DESC
    ) AS transport
"""


def normalize_nop_value(nop: str | None) -> str | None:
    """Return a canonical NOP label without the optional NOP prefix."""
    if not nop:
        return None
    normalized = " ".join(str(nop).strip().upper().split())
    if normalized.startswith("NOP "):
        normalized = normalized[4:].strip()
    return normalized or None


def previous_trx_month_label(trx_month: str | None) -> str | None:
    """Return the previous month label for a YYYY-MM reporting period."""
    if not trx_month:
        return None
    try:
        year, month = [int(part) for part in trx_month.split("-", 1)]
    except (TypeError, ValueError):
        return None
    if month == 1:
        return f"{year - 1}-12"
    return f"{year}-{month - 1:02d}"


def metric_with_percentage(total: int | None, total_sites: int) -> SitePotentialMetric:
    value = int(total or 0)
    percentage = round((value / total_sites) * 100, 1) if total_sites else 0.0
    return SitePotentialMetric(total=value, percentage=percentage)


async def load_site_potential(session: AsyncSession, module_nop: str | None) -> SitePotential:
    """Load site potential KPIs from data_site_master for the Home page."""
    site_master_nop = f"NOP {module_nop}" if module_nop else None
    params = {"module_nop": module_nop, "site_master_nop": site_master_nop}
    summary_result = await session.execute(text(SITE_POTENTIAL_SUMMARY_QUERY), params)
    summary = summary_result.mappings().first() or {}
    total_sites = int(summary.get("total_sites") or 0)

    class_result = await session.execute(text(SITE_CLASS_BREAKDOWN_QUERY), params)
    class_breakdown = [
        SiteClassBreakdown(
            label=row.get("label") or "Unknown",
            total=int(row.get("total") or 0),
            percentage=round((int(row.get("total") or 0) / total_sites) * 100, 1) if total_sites else 0.0,
        )
        for row in class_result.mappings().all()
    ]

    return SitePotential(
        total_sites=total_sites,
        site_lithium=metric_with_percentage(summary.get("site_lithium"), total_sites),
        site_vrla=metric_with_percentage(summary.get("site_vrla"), total_sites),
        enva_validated=metric_with_percentage(summary.get("enva_validated"), total_sites),
        radio_ip=metric_with_percentage(summary.get("radio_ip"), total_sites),
        class_breakdown=class_breakdown,
    )


async def load_worst_revenue_sites(
    session: AsyncSession,
    period: MonthPeriod,
    site_master_nop: str | None,
    module_nop: str | None,
    limit: int = 10,
) -> list[WorstRevenueSite]:
    """Load the lowest-revenue sites for the selected reporting month."""
    result = await session.execute(
        text(WORST_REVENUE_SITES_QUERY),
        {
            "period_start": period.period_start,
            "period_end": period.period_end,
            "comparison_start": period.comparison_start,
            "comparison_end": period.comparison_end,
            "site_master_nop": site_master_nop,
            "module_nop": module_nop,
            "limit_val": limit,
        },
    )
    return [
        WorstRevenueSite(
            site_id=row.get("site_id") or "",
            site_name=row.get("site_name"),
            kabupaten=row.get("kabupaten"),
            total_revenue=int(row.get("total_revenue") or 0),
            total_payload=int(row.get("total_payload") or 0),
            previous_revenue=int(row.get("previous_revenue") or 0),
            mom_percentage=float(row["mom_percentage"]) if row.get("mom_percentage") is not None else None,
        )
        for row in result.mappings().all()
    ]


async def load_recent_revenue_trend(
    session: AsyncSession,
    period: MonthPeriod | None,
    site_master_nop: str | None,
    module_nop: str | None,
) -> list[RevenueTrendItem]:
    """Load only the six trend points needed by the Home overview."""
    if not period:
        return []

    result = await session.execute(
        text(RECENT_REVENUE_TREND_QUERY),
        {
            "context_start": period.context_start,
            "period_end": period.period_end,
            "site_master_nop": site_master_nop,
            "module_nop": module_nop,
        },
    )
    return [
        RevenueTrendItem(
            trx_month=row["trx_month"],
            total_revenue=int(row.get("total_revenue") or 0),
            total_payload=int(row.get("total_payload") or 0),
            total_traffic=int(row.get("total_traffic") or 0),
            avg_availability=float(row["avg_availability"]) if row.get("avg_availability") is not None else None,
        )
        for row in result.mappings().all()
    ]


async def load_reporting_overview_metrics(
    session: AsyncSession,
    period: MonthPeriod | None,
    site_master_nop: str | None,
    module_nop: str | None,
) -> tuple[ReportingScorecard, list[RevenueTrendItem]]:
    """Build Home reporting scorecard and trend from one compact monthly aggregate."""
    rows = []
    if period:
        result = await session.execute(
            text(RECENT_REVENUE_TREND_QUERY),
            {
                "context_start": period.context_start,
                "period_end": period.period_end,
                "site_master_nop": site_master_nop,
                "module_nop": module_nop,
            },
        )
        rows = result.mappings().all()

    trend = [
        RevenueTrendItem(
            trx_month=row["trx_month"],
            total_revenue=int(row.get("total_revenue") or 0),
            total_payload=int(row.get("total_payload") or 0),
            total_traffic=int(row.get("total_traffic") or 0),
            avg_availability=float(row["avg_availability"]) if row.get("avg_availability") is not None else None,
        )
        for row in rows
    ]
    active_rows = [row for row in rows if period and row.get("trx_month") in period.active_months]
    current = active_rows[-1] if active_rows else None
    reporting = ReportingScorecard(
        total_sites=max((int(row.get("total_sites") or 0) for row in active_rows), default=0),
        total_revenue=sum(int(row.get("total_revenue") or 0) for row in active_rows),
        total_payload=sum(int(row.get("total_payload") or 0) for row in active_rows),
        avg_availability=float(current["avg_availability"]) if current and current.get("avg_availability") is not None else None,
    )
    return reporting, trend


async def load_ticketing_overview_dashboard(
    session: AsyncSession,
    ticketing_params: dict,
) -> TicketingDashboard:
    """Load only Ticketing fields rendered by Home: summary, daily trend, and top sites."""
    filter_clause = build_ticketing_filter_clause(ticketing_params)
    category_expr = normalize_ticket_category_sql("t.kategori_tt")
    sql_params = {**ticketing_params, "distribution_limit": 12}

    summary_result = await session.execute(
        text(DASHBOARD_SUMMARY_QUERY.format(filter_clause=filter_clause, category_expr=category_expr)),
        sql_params,
    )
    summary_row = summary_result.first()
    summary = row_to_dict(summary_row) if summary_row else {
        "total_tickets": 0,
        "ticket_category": {"bps": 0, "ts": 0, "total": 0},
    }
    trend = await rows_to_dicts(
        session,
        TREND_QUERY.format(filter_clause=filter_clause, category_expr=category_expr),
        sql_params,
    )
    top_sites = await rows_to_dicts(
        session,
        TOP_SITES_QUERY.format(filter_clause=filter_clause),
        sql_params,
    )

    return TicketingDashboard(
        summary=summary,
        trend=trend,
        sla_distribution=[],
        backup_distribution=[],
        location_breakdown_title="Kabupaten/Kota Distribution",
        location_breakdown=[],
        visiting_backup_distribution=[],
        rc_category_pareto=[],
        top_sites=top_sites,
    )


def month_bounds(tahun: int, bulan: int) -> tuple[date, date]:
    month_start = date(tahun, bulan, 1)
    if bulan == 12:
        next_month = date(tahun + 1, 1, 1)
    else:
        next_month = date(tahun, bulan + 1, 1)
    return month_start, next_month - timedelta(days=1)


async def resolve_transport_date_for_period(
    session: AsyncSession,
    month_start: date | None,
    month_end: date | None,
) -> date | None:
    if not month_start or not month_end:
        return None

    result = await session.execute(
        text(
            """
            SELECT MAX(date)
            FROM public.packet_los_jatim
            WHERE date >= :month_start AND date <= :month_end
            """
        ),
        {"month_start": month_start, "month_end": month_end},
    )
    selected_date = result.scalar_one_or_none()
    if selected_date:
        return selected_date

    fallback = await session.execute(
        text(
            """
            SELECT MAX(date)
            FROM public.packet_los_jatim
            WHERE date <= :month_end
            """
        ),
        {"month_end": month_end},
    )
    return fallback.scalar_one_or_none()


async def load_or_error(errors: dict[str, str], key: str, fallback, loader):
    """Run one module loader without letting a partial failure blank the Home page."""
    try:
        return await loader()
    except Exception as exc:  # pragma: no cover - exercised by live backend conditions.
        errors[key] = str(exc)
        return fallback


async def load_module_with_session(errors: dict[str, str], key: str, fallback, loader):
    """Run one overview module in its own DB session so Home loaders can be parallelized."""
    async with async_session() as module_session:
        return await load_or_error(errors, key, fallback, lambda: loader(module_session))


async def load_availability_module(
    session: AsyncSession,
    period: MonthPeriod | None,
    site_master_nop: str | None,
    module_nop: str | None,
):
    if not period:
        return AvailabilitySummary(), []

    for active_month in period.active_months:
        active_year, active_month_number = (int(part) for part in active_month.split("-"))
        await ensure_site_month_metrics(session, active_month_number, active_year)

    params = {
        "period_start": period.period_start,
        "period_end": period.period_end,
        "site_master_nop": site_master_nop,
        "module_nop": module_nop,
    }

    summary_result = await session.execute(
        text(AVAILABILITY_RANGE_SUMMARY_QUERY),
        params,
    )
    summary_row = summary_result.mappings().first()
    availability = AvailabilitySummary()
    if summary_row:
        availability = AvailabilitySummary(
            total_site_dengan_data=int(summary_row.get("total_site_dengan_data") or 0),
            total_site_master=int(summary_row.get("total_site_master") or 0),
            avg_availability=float(summary_row["avg_availability"]) if summary_row.get("avg_availability") is not None else None,
            total_outage_menit=float(summary_row["total_outage_menit"]) if summary_row.get("total_outage_menit") is not None else None,
            total_cell=int(summary_row.get("total_cell") or 0),
            site_excellent=int(summary_row.get("site_excellent") or 0),
            site_degraded=int(summary_row.get("site_degraded") or 0),
            site_critical=int(summary_row.get("site_critical") or 0),
        )

    worst_result = await session.execute(
        text(AVAILABILITY_RANGE_WORST_QUERY),
        {**params, "limit_val": 10},
    )
    worst_sites = [
        WorstSite(
            site_id=row.get("site_id", ""),
            site_name=row.get("site_name"),
            kabupaten=row.get("kabupaten"),
            site_class=row.get("Site Class"),
            avg_availability=float(row["avg_availability"]) if row.get("avg_availability") is not None else None,
            total_outage_menit=float(row["total_outage_menit"]) if row.get("total_outage_menit") is not None else None,
            jumlah_cell=int(row["jumlah_cell"]) if row.get("jumlah_cell") is not None else None,
        )
        for row in worst_result.mappings().all()
    ]
    return availability, worst_sites


async def load_reporting_module(
    session: AsyncSession,
    period: MonthPeriod | None,
    site_master_nop: str | None,
    module_nop: str | None,
):
    worst_revenue_sites = []
    if not period:
        return ReportingScorecard(), ReportingScorecard(), [], []
    reporting = ReportingScorecard.model_validate(await get_scorecards(
        trx_month=None,
        period_start=period.period_start,
        period_end=period.period_end,
        nop=module_nop,
        session=session,
        response=None,
    ))
    comparison_reporting = ReportingScorecard.model_validate(await get_scorecards(
        trx_month=None,
        period_start=period.comparison_start,
        period_end=period.comparison_end,
        nop=module_nop,
        session=session,
        response=None,
    ))
    reporting_trend = await get_revenue_trend(
        period_start=period.period_start,
        period_end=period.period_end,
        nop=module_nop,
        session=session,
        response=None,
    )
    worst_revenue_sites = await load_worst_revenue_sites(
        session=session,
        period=period,
        site_master_nop=site_master_nop,
        module_nop=module_nop,
        limit=10,
    )
    return reporting, comparison_reporting, worst_revenue_sites, reporting_trend


async def load_overview_source_months(session: AsyncSession) -> dict[str, list[str]]:
    result = await session.execute(text(OVERVIEW_SOURCE_MONTHS_QUERY))
    row = result.mappings().first() or {}
    return {
        "availability": list(row.get("availability") or []),
        "ticketing": list(row.get("ticketing") or []),
        "transport": list(row.get("transport") or []),
    }


async def load_impact_module(
    session: AsyncSession,
    month_start: date | None,
    month_end: date | None,
    module_nop: str | None,
):
    return await load_latest_impact_module(session, module_nop)


async def load_latest_impact_module(
    session: AsyncSession,
    module_nop: str | None,
):
    latest_impact_start_date, latest_impact_end_date = await get_impact_service_latest_window(
        session=session,
        nop=module_nop,
    )
    impact_service = ImpactServiceSummary()
    impact_daily_trend = []
    impact_distributions = ImpactServiceDistributions()
    impact_top_sites = []
    if latest_impact_start_date and latest_impact_end_date:
        impact_service = await get_impact_service_summary(
            start_date=latest_impact_start_date,
            end_date=latest_impact_end_date,
            nop=module_nop,
            session=session,
        )
        impact_daily_trend = await get_impact_service_last_7_days_trend(
            nop=module_nop,
            session=session,
        )
        impact_distributions = await get_impact_service_distributions(
            start_date=latest_impact_start_date,
            end_date=latest_impact_end_date,
            nop=module_nop,
            session=session,
        )
        impact_top_sites = await get_impact_service_top_sites(
            start_date=latest_impact_start_date,
            end_date=latest_impact_end_date,
            nop=module_nop,
            limit=5,
            session=session,
        )

    return latest_impact_start_date, latest_impact_end_date, impact_service, impact_daily_trend, impact_distributions, impact_top_sites


async def load_transport_module(
    session: AsyncSession,
    month_start: date | None,
    month_end: date | None,
    module_nop: str | None,
):
    transport_date = await resolve_transport_date_for_period(session, month_start, month_end)
    transport_quality = TransportQualitySummary(date=transport_date)
    transport_trend = []
    transport_priority_sites = TransportQualityPrioritySiteResponse()
    if transport_date and month_start and month_end:
        params = build_transport_filter_params(date_filter=transport_date, nop=module_nop)
        params.update({
            "period_start_date": month_start,
            "period_end_exclusive": month_end + timedelta(days=1),
            "limit": 5,
            "offset": 0,
        })
        filter_clause = (
            build_transport_filter_clause(params, include_date=False)
            + " AND p.date >= :period_start_date AND p.date < :period_end_exclusive"
        )
        summary_result = await session.execute(
            text(TRANSPORT_SUMMARY_QUERY.format(filter_clause=filter_clause)),
            params,
        )
        summary_row = summary_result.first()
        if summary_row:
            transport_quality = TransportQualitySummary(**dict(summary_row._mapping))

        trend_result = await session.execute(
            text(TRANSPORT_TREND_QUERY.format(filter_clause=filter_clause)),
            params,
        )
        transport_trend = transport_rows_to_models(trend_result.fetchall(), TransportQualityTrendItem)

        count_result = await session.execute(
            text(TRANSPORT_PRIORITY_COUNT_QUERY.format(filter_clause=filter_clause)),
            params,
        )
        priority_total = int(count_result.scalar_one() or 0)
        list_result = await session.execute(
            text(TRANSPORT_PRIORITY_LIST_QUERY.format(filter_clause=filter_clause)),
            params,
        )
        transport_priority_sites = TransportQualityPrioritySiteResponse(
            items=transport_rows_to_models(list_result.fetchall(), TransportQualityPrioritySite),
            total=priority_total,
            page=1,
            limit=5,
            total_pages=(priority_total + 4) // 5,
        )
    return transport_quality, transport_trend, transport_priority_sites


async def load_ticketing_module(
    session: AsyncSession,
    month_start: date | None,
    month_end: date | None,
    site_master_nop: str | None,
):
    ticketing_filters = TicketingFilters()
    if month_start and month_end:
        start_date = month_start
        end_date = month_end
    else:
        ticketing_filters = await get_ticketing_filters(session=session)
        start_date = ticketing_filters.default_start_date or ticketing_filters.min_date
        end_date = ticketing_filters.default_end_date or ticketing_filters.max_date
    ticketing_params = build_ticketing_filter_params(
        start_date=start_date,
        end_date=end_date,
        tahun=None,
        bulan=None,
        nop=site_master_nop,
    )
    ticketing = await load_ticketing_overview_dashboard(session=session, ticketing_params=ticketing_params)
    return ticketing_filters, start_date, end_date, ticketing


@router.get("", response_model=OverviewResponse)
async def get_overview(
    bulan: int | None = Query(None, ge=1, le=12),
    tahun: int | None = Query(None, ge=2020),
    period_start: str | None = None,
    period_end: str | None = None,
    nop: str | None = Query(None),
    session: AsyncSession = Depends(get_session),
    response: Response = None,
):
    """Return the cached executive Home overview when available."""
    if (bulan is None) != (tahun is None):
        raise HTTPException(status_code=422, detail="bulan dan tahun wajib diisi bersama.")
    if (period_start is not None or period_end is not None) and (bulan is not None or tahun is not None):
        raise HTTPException(status_code=422, detail="Gunakan periode baru atau bulan/tahun lama, bukan keduanya.")
    normalized_nop = normalize_nop_value(nop)
    legacy_month = f"{tahun}-{bulan:02d}" if bulan is not None and tahun is not None else None
    requested_period = None
    if period_start is not None or period_end is not None or legacy_month is not None:
        requested_period = resolve_month_period(
            period_start=period_start,
            period_end=period_end,
            legacy_month=legacy_month,
        )
    cache_key = redis_cache.make_key(
        "overview",
        "home",
        period_start=requested_period.period_start if requested_period else "latest",
        period_end=requested_period.period_end if requested_period else "latest",
        nop=normalized_nop or "",
    )
    cache_status, cached_value = await redis_cache.get_json(cache_key)
    if cache_status == CACHE_HIT:
        if response is not None:
            response.headers["X-Cache"] = cache_status
        return OverviewResponse.model_validate(cached_value)

    payload = await load_overview_response(
        bulan=bulan,
        tahun=tahun,
        period_start=period_start,
        period_end=period_end,
        nop=normalized_nop,
        session=session,
    )
    if cache_status == CACHE_MISS and not payload.errors:
        await redis_cache.set_json(
            cache_key,
            payload.model_dump(mode="json"),
            ttl_seconds=OVERVIEW_CACHE_TTL_SECONDS,
        )
    if response is not None:
        response.headers["X-Cache"] = cache_status
    return payload


async def load_overview_response(
    bulan: int | None,
    tahun: int | None,
    nop: str | None,
    session: AsyncSession,
    period_start: str | None = None,
    period_end: str | None = None,
):
    """Return the executive Home overview using the dashboard's existing contracts."""
    errors: dict[str, str] = {}
    module_nop = normalize_nop_value(nop)
    site_master_nop = f"NOP {module_nop}" if module_nop else None

    latest_period = None
    legacy_month = f"{tahun}-{bulan:02d}" if bulan is not None and tahun is not None else None
    if (bulan is None) != (tahun is None):
        raise HTTPException(status_code=422, detail="bulan dan tahun wajib diisi bersama.")
    if (period_start is not None or period_end is not None) and legacy_month is not None:
        raise HTTPException(status_code=422, detail="Gunakan periode baru atau bulan/tahun lama, bukan keduanya.")
    if period_start is None and period_end is None and legacy_month is None:
        latest_period = await load_or_error(
            errors,
            "availability_period",
            None,
            lambda: get_latest_period(session=session),
        )
    available_months = await load_or_error(
        errors,
        "reporting_months",
        [],
        lambda: get_available_months(session=session),
    )
    latest_month = None
    if latest_period and getattr(latest_period, "bulan", None) and getattr(latest_period, "tahun", None):
        latest_month = f"{latest_period.tahun}-{latest_period.bulan:02d}"
    latest_month = latest_month or (available_months[0] if available_months else date.today().strftime("%Y-%m"))
    period = resolve_month_period(
        period_start=period_start,
        period_end=period_end,
        legacy_month=legacy_month or (latest_month if period_start is None and period_end is None else None),
    )
    source_months = await load_or_error(
        errors,
        "overview_source_months",
        {},
        lambda: load_overview_source_months(session),
    )
    source_months["reporting"] = available_months
    selected_tahun, selected_bulan = (int(part) for part in period.period_end.split("-"))
    month_start = period.start_date
    month_end = period.end_date_exclusive - timedelta(days=1)
    trx_month = period.period_end

    (
        (availability, worst_sites),
        (reporting, comparison_reporting, worst_revenue_sites, reporting_trend),
        site_potential,
        (impact_start_date, impact_end_date, impact_service, impact_daily_trend, impact_distributions, impact_top_sites),
        (transport_quality, transport_trend, transport_priority_sites),
        (ticketing_filters, ticketing_start_date, ticketing_end_date, ticketing),
    ) = await asyncio.gather(
        load_module_with_session(
            errors,
            "availability",
            (AvailabilitySummary(), []),
            lambda module_session: load_availability_module(
                module_session,
                period,
                site_master_nop,
                module_nop,
            ),
        ),
        load_module_with_session(
            errors,
            "reporting",
            (ReportingScorecard(), ReportingScorecard(), [], []),
            lambda module_session: load_reporting_module(
                module_session,
                period,
                site_master_nop,
                module_nop,
            ),
        ),
        load_module_with_session(
            errors,
            "site_potential",
            SitePotential(),
            lambda module_session: load_site_potential(
                session=module_session,
                module_nop=module_nop,
            ),
        ),
        load_module_with_session(
            errors,
            "impact_service",
            (None, None, ImpactServiceSummary(), [], ImpactServiceDistributions(), []),
            lambda module_session: load_latest_impact_module(
                module_session,
                module_nop,
            ),
        ),
        load_module_with_session(
            errors,
            "transport_quality",
            (TransportQualitySummary(), [], TransportQualityPrioritySiteResponse()),
            lambda module_session: load_transport_module(
                module_session,
                month_start,
                month_end,
                module_nop,
            ),
        ),
        load_module_with_session(
            errors,
            "ticketing",
            (TicketingFilters(), None, None, None),
            lambda module_session: load_ticketing_module(
                module_session,
                month_start,
                month_end,
                site_master_nop,
            ),
        ),
    )

    return OverviewResponse(
        period=OverviewPeriod(
            bulan=selected_bulan,
            tahun=selected_tahun,
            trx_month=trx_month,
            period_start=period.period_start,
            period_end=period.period_end,
            comparison_start=period.comparison_start,
            comparison_end=period.comparison_end,
            active_months=list(period.active_months),
            impact_start_date=impact_start_date,
            impact_end_date=impact_end_date,
            transport_date=transport_quality.date,
            ticketing_start_date=ticketing_start_date,
            ticketing_end_date=ticketing_end_date,
            nop=module_nop,
        ),
        availability=availability,
        worst_sites=worst_sites,
        worst_revenue_sites=worst_revenue_sites,
        reporting=reporting,
        comparison_reporting=comparison_reporting,
        reporting_trend=reporting_trend,
        period_meta=build_period_meta(period, source_months),
        impact_service=impact_service,
        impact_daily_trend=impact_daily_trend,
        impact_distributions=impact_distributions,
        impact_top_sites=impact_top_sites,
        transport_quality=transport_quality,
        transport_trend=transport_trend,
        transport_priority_sites=transport_priority_sites,
        ticketing=ticketing,
        site_potential=site_potential,
        errors=errors,
    )

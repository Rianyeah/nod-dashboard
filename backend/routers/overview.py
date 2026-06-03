"""Overview router - single Home payload composed from existing dashboard modules."""
import asyncio
from datetime import date, timedelta

from fastapi import APIRouter, Depends, Query
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

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
from models.transport_quality import TransportQualityPrioritySiteResponse, TransportQualitySummary
from routers.availability import (
    get_latest_period,
    get_summary,
    get_worst_sites,
)
from routers.impact_service import (
    get_impact_service_daily_trend,
    get_impact_service_distributions,
    get_impact_service_filters,
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
    get_transport_quality_priority_sites,
    get_transport_quality_summary,
    get_transport_quality_trend,
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
    WHERE t.trx_month = :trx_month
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
    WHERE t.trx_month = :previous_trx_month
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
        DATE_TRUNC('month', TO_DATE(:trx_month || '-01', 'YYYY-MM-DD')) - INTERVAL '5 months',
        DATE_TRUNC('month', TO_DATE(:trx_month || '-01', 'YYYY-MM-DD')),
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
    trx_month: str,
    previous_trx_month: str | None,
    site_master_nop: str | None,
    module_nop: str | None,
    limit: int = 10,
) -> list[WorstRevenueSite]:
    """Load the lowest-revenue sites for the selected reporting month."""
    result = await session.execute(
        text(WORST_REVENUE_SITES_QUERY),
        {
            "trx_month": trx_month,
            "previous_trx_month": previous_trx_month,
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
    trx_month: str | None,
    site_master_nop: str | None,
    module_nop: str | None,
) -> list[RevenueTrendItem]:
    """Load only the six trend points needed by the Home overview."""
    if not trx_month:
        return []

    result = await session.execute(
        text(RECENT_REVENUE_TREND_QUERY),
        {
            "trx_month": trx_month,
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
    trx_month: str | None,
    site_master_nop: str | None,
    module_nop: str | None,
) -> tuple[ReportingScorecard, list[RevenueTrendItem]]:
    """Build Home reporting scorecard and trend from one compact monthly aggregate."""
    rows = []
    if trx_month:
        result = await session.execute(
            text(RECENT_REVENUE_TREND_QUERY),
            {
                "trx_month": trx_month,
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
    current = next((row for row in rows if row.get("trx_month") == trx_month), None)
    reporting = ReportingScorecard(
        total_sites=int(current.get("total_sites") or 0) if current else 0,
        total_revenue=int(current.get("total_revenue") or 0) if current else 0,
        total_payload=int(current.get("total_payload") or 0) if current else 0,
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
    selected_bulan: int | None,
    selected_tahun: int | None,
    site_master_nop: str | None,
):
    if not selected_bulan or not selected_tahun:
        return AvailabilitySummary(), []

    await ensure_site_month_metrics(session, selected_bulan, selected_tahun)

    from routers.sites import _build_filters
    filters, filter_params = _build_filters(nop=site_master_nop)
    params = {"bulan": selected_bulan, "tahun": selected_tahun, **filter_params}

    summary_result = await session.execute(
        text(AVAILABILITY_SUMMARY_QUERY.format(filters=filters)),
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
        text(AVAILABILITY_WORST_SITES_QUERY.format(filters=filters)),
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
    trx_month: str | None,
    previous_trx_month: str | None,
    site_master_nop: str | None,
    module_nop: str | None,
):
    worst_revenue_sites = []
    reporting, reporting_trend = await load_reporting_overview_metrics(
        session=session,
        trx_month=trx_month,
        site_master_nop=site_master_nop,
        module_nop=module_nop,
    )
    if trx_month:
        worst_revenue_sites = await load_worst_revenue_sites(
            session=session,
            trx_month=trx_month,
            previous_trx_month=previous_trx_month,
            site_master_nop=site_master_nop,
            module_nop=module_nop,
            limit=10,
        )
    return reporting, worst_revenue_sites, reporting_trend


async def load_impact_module(
    session: AsyncSession,
    month_start: date | None,
    month_end: date | None,
    module_nop: str | None,
):
    impact_filters = await get_impact_service_filters(session=session)
    impact_start_date = None
    impact_end_date = None
    if month_start and month_end and impact_filters.min_date and impact_filters.max_date:
        impact_start_date = max(month_start, impact_filters.min_date)
        impact_end_date = min(month_end, impact_filters.max_date)
        if impact_start_date > impact_end_date:
            impact_start_date = None
            impact_end_date = None

    impact_service = ImpactServiceSummary()
    impact_daily_trend = []
    impact_distributions = ImpactServiceDistributions()
    impact_top_sites = []
    if impact_start_date and impact_end_date:
        impact_service = await get_impact_service_summary(
            start_date=impact_start_date,
            end_date=impact_end_date,
            nop=module_nop,
            session=session,
        )
        impact_daily_trend = await get_impact_service_daily_trend(
            start_date=impact_start_date,
            end_date=impact_end_date,
            nop=module_nop,
            session=session,
        )
        impact_top_sites = await get_impact_service_top_sites(
            start_date=impact_start_date,
            end_date=impact_end_date,
            nop=module_nop,
            limit=5,
            session=session,
        )

    return impact_start_date, impact_end_date, impact_service, impact_daily_trend, impact_distributions, impact_top_sites


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
    if transport_date:
        transport_quality = await get_transport_quality_summary(
            date_filter=transport_date,
            nop=module_nop,
            kabupaten=None,
            transport_type=None,
            thi_status=None,
            distribution_pl=None,
            pl_status_0_1_pct=None,
            distribution_lat=None,
            jitter_status=None,
            session=session,
        )
        transport_trend = await get_transport_quality_trend(
            date_filter=transport_date,
            nop=module_nop,
            kabupaten=None,
            transport_type=None,
            thi_status=None,
            distribution_pl=None,
            pl_status_0_1_pct=None,
            distribution_lat=None,
            jitter_status=None,
            session=session,
        )
        transport_priority_sites = await get_transport_quality_priority_sites(
            date_filter=transport_date,
            nop=module_nop,
            kabupaten=None,
            transport_type=None,
            thi_status=None,
            distribution_pl=None,
            pl_status_0_1_pct=None,
            distribution_lat=None,
            jitter_status=None,
            page=1,
            limit=5,
            session=session,
        )
    return transport_quality, transport_trend, transport_priority_sites


async def load_ticketing_module(
    session: AsyncSession,
    month_start: date | None,
    month_end: date | None,
    selected_tahun: int | None,
    selected_bulan: int | None,
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
        tahun=selected_tahun,
        bulan=selected_bulan,
        nop=site_master_nop,
    )
    ticketing = await load_ticketing_overview_dashboard(session=session, ticketing_params=ticketing_params)
    return ticketing_filters, start_date, end_date, ticketing


@router.get("", response_model=OverviewResponse)
async def get_overview(
    bulan: int | None = Query(None, ge=1, le=12),
    tahun: int | None = Query(None, ge=2020),
    nop: str | None = Query(None),
    session: AsyncSession = Depends(get_session),
):
    """Return the executive Home overview using the dashboard's existing contracts."""
    errors: dict[str, str] = {}
    module_nop = normalize_nop_value(nop)
    site_master_nop = f"NOP {module_nop}" if module_nop else None

    latest_period = None
    if not (bulan and tahun):
        latest_period = await load_or_error(
            errors,
            "availability_period",
            None,
            lambda: get_latest_period(session=session),
        )
    selected_bulan = bulan or getattr(latest_period, "bulan", None)
    selected_tahun = tahun or getattr(latest_period, "tahun", None)
    month_start = None
    month_end = None
    if selected_bulan and selected_tahun:
        month_start, month_end = month_bounds(selected_tahun, selected_bulan)

    available_months = await load_or_error(
        errors,
        "reporting_months",
        [],
        lambda: get_available_months(session=session),
    )
    preferred_trx_month = f"{selected_tahun}-{selected_bulan:02d}" if selected_bulan and selected_tahun else None
    trx_month = preferred_trx_month if preferred_trx_month in available_months else (available_months[0] if available_months else preferred_trx_month)
    previous_trx_month = previous_trx_month_label(trx_month)

    (
        (availability, worst_sites),
        (reporting, worst_revenue_sites, reporting_trend),
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
                selected_bulan,
                selected_tahun,
                site_master_nop,
            ),
        ),
        load_module_with_session(
            errors,
            "reporting",
            (ReportingScorecard(), [], []),
            lambda module_session: load_reporting_module(
                module_session,
                trx_month,
                previous_trx_month,
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
            lambda module_session: load_impact_module(
                module_session,
                month_start,
                month_end,
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
                selected_tahun,
                selected_bulan,
                site_master_nop,
            ),
        ),
    )

    return OverviewResponse(
        period=OverviewPeriod(
            bulan=selected_bulan,
            tahun=selected_tahun,
            trx_month=trx_month,
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
        reporting_trend=reporting_trend,
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

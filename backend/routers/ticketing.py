"""
Ticketing router - endpoints for public.ticketing_fault_center dashboard.

GET /ticketing/filters                    - global filter values
GET /ticketing/dashboard                  - scorecards, charts, top sites
GET /ticketing/tickets                    - paginated ticket table
GET /ticketing/tickets/{ticket_number_swfm} - ticket drilldown detail
"""
import csv
from datetime import date, timedelta
import io
import math

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from fastapi.responses import StreamingResponse
import runtime_compat  # noqa: F401
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from cache import CACHE_HIT, CACHE_MISS, FILTER_CACHE_TTL_SECONDS, redis_cache
from database import get_session
from models.ticketing import (
    TicketingDashboard,
    TicketingFilters,
    TicketingTicketDetail,
    TicketingTicketResponse,
)
from periods import MonthPeriod, build_period_meta, resolve_month_period
from ticketing_metrics import (
    active_period_day_count,
    add_takeover_daily_average,
    rank_fop_performance,
    resolve_trend_granularity,
)

router = APIRouter(prefix="/ticketing", tags=["Ticketing"])

TABLE_NAME = "public.ticketing_fault_center"
DEFAULT_LIMIT = 20


def normalize_category_sql(column: str) -> str:
    """Normalize ticket category values into dashboard-facing BPS/TS buckets."""
    return (
        "CASE "
        f"WHEN upper(trim({column})) LIKE 'TS%' THEN 'TS' "
        f"WHEN upper(trim({column})) = 'BPS' THEN 'BPS' "
        f"ELSE coalesce(nullif(trim({column}), ''), 'Unknown') "
        "END"
    )


def period_month_sql(column: str) -> str:
    """Map periode_bulan text values to month numbers for the bulan filter."""
    return (
        "CASE lower(trim({column})) "
        "WHEN 'january' THEN 1 "
        "WHEN 'february' THEN 2 "
        "WHEN 'march' THEN 3 "
        "WHEN 'april' THEN 4 "
        "WHEN 'may' THEN 5 "
        "WHEN 'mei' THEN 5 "
        "WHEN 'june' THEN 6 "
        "WHEN 'july' THEN 7 "
        "WHEN 'august' THEN 8 "
        "WHEN 'september' THEN 9 "
        "WHEN 'october' THEN 10 "
        "WHEN 'november' THEN 11 "
        "WHEN 'december' THEN 12 "
        "ELSE NULL END"
    ).format(column=column)


def build_filter_params(
    start_date: date | None = None,
    end_date: date | None = None,
    tahun: int | None = None,
    bulan: int | None = None,
    nop: str | None = None,
    cluster_to: str | None = None,
    kategori_tt: str | None = None,
    takeover: str | None = None,
    ticket_swfm_status: str | None = None,
    backup_sukses: str | None = None,
    rc_category: str | None = None,
    is_escalate: bool | None = None,
) -> dict:
    return {
        "start_date": start_date,
        "end_date": end_date,
        "tahun": tahun,
        "bulan": bulan,
        "nop": nop,
        "cluster_to": cluster_to,
        "kategori_tt": kategori_tt,
        "takeover": takeover,
        "ticket_swfm_status": ticket_swfm_status,
        "backup_sukses": backup_sukses,
        "rc_category": rc_category,
        "is_escalate": is_escalate,
    }


def build_filter_clause(params: dict) -> str:
    clauses = []
    if params.get("start_date"):
        clauses.append("t.created_at >= CAST(:start_date AS date)")
    if params.get("end_date"):
        clauses.append("t.created_at < (CAST(:end_date AS date) + interval '1 day')")
    if params.get("tahun"):
        clauses.append("t.tahun = :tahun")
    if params.get("bulan"):
        clauses.append(f"{period_month_sql('t.periode_bulan')} = :bulan")
    if params.get("nop"):
        clauses.append("t.nop = :nop")
    if params.get("cluster_to"):
        clauses.append("t.cluster_to = :cluster_to")
    if params.get("kategori_tt"):
        clauses.append(f"{normalize_category_sql('t.kategori_tt')} = :kategori_tt")
    if params.get("takeover"):
        clauses.append("UPPER(TRIM(t.takeover)) = UPPER(TRIM(:takeover))")
    if params.get("ticket_swfm_status"):
        clauses.append("t.ticket_swfm_status = :ticket_swfm_status")
    if params.get("backup_sukses"):
        clauses.append("t.backup_sukses = :backup_sukses")
    if params.get("rc_category"):
        clauses.append("coalesce(t.rc_category, 'Unclassified') = :rc_category")
    if params.get("is_escalate") is not None:
        clauses.append("t.is_escalate = :is_escalate")
    return "".join(f" AND {clause}" for clause in clauses)


def build_takeover_filter_clause(params: dict, *, source: str) -> str:
    """Use only filters shared by Fault Center and non-INAP takeover sources."""
    date_column = "t.created_at" if source == "fault_center" else "t.ticket_date"
    clauses = []
    if params.get("start_date"):
        clauses.append(f"{date_column} >= CAST(:start_date AS date)")
    if params.get("end_date"):
        clauses.append(f"{date_column} < (CAST(:end_date AS date) + interval '1 day')")
    if params.get("tahun"):
        clauses.append(f"EXTRACT(YEAR FROM {date_column})::int = :tahun")
    if params.get("bulan"):
        clauses.append(f"EXTRACT(MONTH FROM {date_column})::int = :bulan")
    if params.get("nop"):
        clauses.append("t.nop = :nop")
    return "".join(f" AND {clause}" for clause in clauses)


def row_to_dict(row):
    return dict(row._mapping)


async def rows_to_dicts(session: AsyncSession, sql: str, params: dict) -> list[dict]:
    result = await session.execute(text(sql), params)
    return [row_to_dict(row) for row in result.fetchall()]


def previous_month_bounds(params: dict) -> dict | None:
    """Build a matching filter set for the previous month."""
    previous_params = {**params}
    if params.get("tahun") and params.get("bulan"):
        year = int(params["tahun"])
        month = int(params["bulan"])
        if month == 1:
            year -= 1
            month = 12
        else:
            month -= 1
        previous_params.update({"tahun": year, "bulan": month, "start_date": None, "end_date": None})
        return previous_params

    period = params.get("_period")
    if period:
        previous_params.update({
            "start_date": date.fromisoformat(f"{period.comparison_start}-01"),
            "end_date": date.fromisoformat(f"{period.period_start}-01") - timedelta(days=1),
            "tahun": None,
            "bulan": None,
            "_period": None,
        })
        return previous_params

    anchor = params.get("start_date")
    end_anchor = params.get("end_date")
    if not anchor or not end_anchor:
        return None
    selected_days = (end_anchor - anchor).days + 1
    previous_end = anchor - timedelta(days=1)
    previous_start = previous_end - timedelta(days=selected_days - 1)
    previous_params.update({
        "start_date": previous_start,
        "end_date": previous_end,
        "tahun": None,
        "bulan": None,
    })
    return previous_params


LATEST_MONTH_DEFAULT_QUERY = f"""
monthly_counts AS (
    SELECT
        date_trunc('month', created_at)::date AS month_start,
        MIN(created_at)::date AS start_date,
        MAX(created_at)::date AS end_date,
        COUNT(*) AS tickets
    FROM {TABLE_NAME}
    WHERE created_at IS NOT NULL
    GROUP BY 1
),
default_month AS (
    SELECT start_date, end_date
    FROM monthly_counts
    ORDER BY CASE WHEN tickets >= 10 THEN 0 ELSE 1 END, month_start DESC
    LIMIT 1
)
"""

FILTER_OPTIONS_QUERY = f"""
WITH {LATEST_MONTH_DEFAULT_QUERY}
SELECT
    MIN(created_at)::date AS min_date,
    MAX(created_at)::date AS max_date,
    (SELECT start_date FROM default_month) AS default_start_date,
    (SELECT end_date FROM default_month) AS default_end_date,
    ARRAY(
        SELECT DISTINCT EXTRACT(YEAR FROM created_at)::int
        FROM {TABLE_NAME}
        WHERE created_at IS NOT NULL
        ORDER BY 1 DESC
    ) AS years,
    ARRAY(
        SELECT DISTINCT {period_month_sql('periode_bulan')}
        FROM {TABLE_NAME}
        WHERE {period_month_sql('periode_bulan')} IS NOT NULL
        ORDER BY 1
    ) AS months,
    ARRAY(
        SELECT DISTINCT TO_CHAR(created_at, 'YYYY-MM')
        FROM {TABLE_NAME}
        WHERE created_at IS NOT NULL
        ORDER BY 1 DESC
    ) AS available_months,
    ARRAY(
        SELECT DISTINCT NULLIF(TRIM(nop), '')
        FROM {TABLE_NAME}
        WHERE NULLIF(TRIM(nop), '') IS NOT NULL
        ORDER BY 1
    ) AS nops,
    ARRAY(
        SELECT DISTINCT NULLIF(TRIM(cluster_to), '')
        FROM {TABLE_NAME}
        WHERE NULLIF(TRIM(cluster_to), '') IS NOT NULL
        ORDER BY 1
    ) AS clusters,
    ARRAY(
        SELECT DISTINCT {normalize_category_sql('kategori_tt')}
        FROM {TABLE_NAME}
        WHERE NULLIF(TRIM(kategori_tt), '') IS NOT NULL
        ORDER BY 1
    ) AS categories,
    ARRAY(
        SELECT DISTINCT NULLIF(UPPER(TRIM(takeover)), '')
        FROM {TABLE_NAME}
        WHERE NULLIF(TRIM(takeover), '') IS NOT NULL
        ORDER BY 1
    ) AS takeovers,
    ARRAY(
        SELECT DISTINCT NULLIF(TRIM(ticket_swfm_status), '')
        FROM {TABLE_NAME}
        WHERE NULLIF(TRIM(ticket_swfm_status), '') IS NOT NULL
        ORDER BY 1
    ) AS ticket_statuses,
    ARRAY(
        SELECT DISTINCT NULLIF(TRIM(backup_sukses), '')
        FROM {TABLE_NAME}
        WHERE NULLIF(TRIM(backup_sukses), '') IS NOT NULL
        ORDER BY 1
    ) AS backup_sukses,
    ARRAY(
        SELECT DISTINCT coalesce(NULLIF(TRIM(rc_category), ''), 'Unclassified')
        FROM {TABLE_NAME}
        ORDER BY 1
    ) AS rc_categories
FROM {TABLE_NAME}
"""

DASHBOARD_SUMMARY_QUERY = """
WITH base AS (
    SELECT t.*, {category_expr} AS ticket_category_label
    FROM public.ticketing_fault_center t
    WHERE 1=1
    {filter_clause}
)
SELECT
    COUNT(*) AS total_tickets,
    jsonb_build_object(
        'bps', COUNT(*) FILTER (WHERE ticket_category_label = 'BPS'),
        'ts', COUNT(*) FILTER (WHERE ticket_category_label = 'TS'),
        'total', COUNT(*)
    ) AS ticket_category,
    COUNT(*) FILTER (WHERE sla_status = 'OUT SLA') AS out_sla_tickets,
    COALESCE(ROUND(100.0 * COUNT(*) FILTER (WHERE sla_status = 'OUT SLA') / NULLIF(COUNT(*), 0), 2), 0)::float AS out_sla_rate,
    (
        AVG(extract(epoch FROM mttr))
        FILTER (WHERE mttr IS NOT NULL AND extract(epoch FROM mttr) >= 0)
    ) / 3600 AS average_mttr_hours,
    (
        percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM mttr))
        FILTER (WHERE mttr IS NOT NULL AND extract(epoch FROM mttr) >= 0)
    ) / 3600 AS median_mttr_hours,
    COUNT(*) FILTER (WHERE TRIM(visitation) = 'Visit site') AS visitation_tickets,
    COALESCE(ROUND(100.0 * COUNT(*) FILTER (WHERE TRIM(visitation) = 'Visit site') / NULLIF(COUNT(*), 0), 2), 0)::float AS visitation_rate,
    (
        percentile_cont(0.9) WITHIN GROUP (ORDER BY extract(epoch FROM respon_time))
        FILTER (WHERE respon_time IS NOT NULL AND extract(epoch FROM respon_time) >= 0)
    ) / 60 AS p90_response_minutes,
    COUNT(*) FILTER (WHERE backup_sukses = 'BU Genset') AS backup_sukses_tickets,
    COALESCE(ROUND(100.0 * COUNT(*) FILTER (WHERE backup_sukses = 'BU Genset') / NULLIF(COUNT(*), 0), 2), 0)::float AS backup_sukses_rate,
    COUNT(*) FILTER (WHERE is_escalate = true) AS escalated_tickets,
    COALESCE(ROUND(100.0 * COUNT(*) FILTER (WHERE is_escalate = true) / NULLIF(COUNT(*), 0), 2), 0)::float AS escalated_rate,
    COUNT(*) FILTER (WHERE UPPER(TRIM(takeover)) = 'TAKE OVER') AS manual_takeover_tickets,
    COALESCE(ROUND(100.0 * COUNT(*) FILTER (WHERE UPPER(TRIM(takeover)) = 'TAKE OVER') / NULLIF(COUNT(*), 0), 2), 0)::float AS manual_takeover_rate,
    COUNT(*) FILTER (WHERE ticket_swfm_status = 'CLOSED') AS closed_tickets,
    COALESCE(ROUND(100.0 * COUNT(*) FILTER (WHERE ticket_swfm_status = 'CLOSED') / NULLIF(COUNT(*), 0), 2), 0)::float AS closed_rate,
    COUNT(*) FILTER (WHERE ticket_swfm_status = 'CANCELED') AS canceled_tickets,
    MAX(created_at) AS last_created_at
FROM base
"""

PREVIOUS_MONTH_TICKETS_QUERY = """
SELECT COUNT(*) AS previous_total_tickets
FROM public.ticketing_fault_center t
WHERE 1=1
{filter_clause}
"""

TREND_BUCKET_SQL = {
    "day": ("day", "DD Mon"),
    "week": ("week", "DD Mon"),
    "month": ("month", "Mon YYYY"),
}


TREND_QUERY = """
WITH base AS (
    SELECT t.*, {category_expr} AS ticket_category_label
    FROM public.ticketing_fault_center t
    WHERE t.created_at IS NOT NULL
    {filter_clause}
)
SELECT
    date_trunc('{trend_unit}', created_at)::date AS day,
    to_char(date_trunc('{trend_unit}', created_at), '{trend_label_format}') AS label,
    COUNT(*) FILTER (WHERE ticket_category_label = 'BPS') AS bps,
    COUNT(*) FILTER (WHERE ticket_category_label = 'TS') AS ts,
    COUNT(*) AS total
FROM base
GROUP BY 1, 2
ORDER BY 1
"""

DISTRIBUTION_QUERY = """
WITH base AS (
    SELECT t.*
    FROM public.ticketing_fault_center t
    WHERE 1=1
    {filter_clause}
)
SELECT
    {label_expr} AS label,
    COUNT(*) AS tickets,
    COUNT(*) FILTER (WHERE sla_status = 'OUT SLA') AS out_sla,
    COALESCE(ROUND(100.0 * COUNT(*) FILTER (WHERE sla_status = 'OUT SLA') / NULLIF(COUNT(*), 0), 2), 0)::float AS out_sla_rate
FROM base t
GROUP BY 1
ORDER BY tickets DESC, label
LIMIT :distribution_limit
"""

LOCATION_BREAKDOWN_QUERY = """
WITH base AS (
    SELECT t.*
    FROM public.ticketing_fault_center t
    WHERE 1=1
    {filter_clause}
)
SELECT
    'Kabupaten/Kota Distribution' AS breakdown_title,
    coalesce(NULLIF(TRIM(t.kabupaten_kota), ''), 'Unknown') AS label,
    category.metric,
    category.value,
    COUNT(*) AS tickets
FROM base t
CROSS JOIN LATERAL (
    VALUES
        (
            'takeover',
            CASE
                WHEN NULLIF(TRIM(t.takeover), '') IS NULL THEN 'Unknown'
                ELSE UPPER(TRIM(t.takeover))
            END
        ),
        (
            'visitation',
            CASE UPPER(TRIM(t.visitation))
                WHEN 'VISIT SITE' THEN 'Visit site'
                WHEN 'NOT VISIT' THEN 'Not Visit'
                ELSE coalesce(NULLIF(TRIM(t.visitation), ''), 'Unknown')
            END
        ),
        (
            'backup_sukses',
            CASE UPPER(TRIM(t.backup_sukses))
                WHEN 'BU GENSET' THEN 'BU Genset'
                WHEN 'NOT BU GENSET' THEN 'Not BU Genset'
                ELSE coalesce(NULLIF(TRIM(t.backup_sukses), ''), 'Unknown')
            END
        ),
        (
            'escalate',
            CASE
                WHEN t.is_escalate IS TRUE THEN 'Escalated'
                WHEN t.is_escalate IS FALSE THEN 'Not Escalated'
                ELSE 'Unknown'
            END
        )
) AS category(metric, value)
GROUP BY 1, 2, 3, 4
ORDER BY label, category.metric, tickets DESC, category.value
"""

FOP_PERFORMANCE_QUERY = """
WITH base AS (
    SELECT t.*
    FROM public.ticketing_fault_center t
    WHERE NULLIF(TRIM(t.pic_take_over_ticket), '') IS NOT NULL
    {filter_clause}
)
SELECT
    TRIM(t.pic_take_over_ticket) AS pic,
    COUNT(*) FILTER (WHERE UPPER(TRIM(t.takeover)) = 'TAKE OVER') AS takeover_tickets,
    COUNT(*) FILTER (WHERE UPPER(TRIM(t.visitation)) = 'VISIT SITE') AS visitation_tickets,
    COUNT(*) FILTER (WHERE UPPER(TRIM(t.backup_sukses)) = 'BU GENSET') AS backup_sukses_tickets,
    (
        AVG(extract(epoch FROM t.respon_time))
        FILTER (WHERE t.respon_time IS NOT NULL AND extract(epoch FROM t.respon_time) >= 0)
    ) / 60 AS average_response_minutes
FROM base t
GROUP BY 1
ORDER BY pic
"""

TAKEOVER_RANKING_QUERY = """
WITH takeover_events AS (
    SELECT
        LOWER(REGEXP_REPLACE(TRIM(t.pic_take_over_ticket), '\\s+', ' ', 'g')) AS pic_key,
        REGEXP_REPLACE(TRIM(t.pic_take_over_ticket), '\\s+', ' ', 'g') AS pic_display,
        {fault_category_expr} AS ticket_type,
        t.created_at::date AS event_date
    FROM public.ticketing_fault_center t
    WHERE UPPER(TRIM(t.takeover)) = 'TAKE OVER'
      AND NULLIF(TRIM(t.pic_take_over_ticket), '') IS NOT NULL
      AND {fault_category_expr} IN ('BPS', 'TS')
      {fault_filter_clause}

    UNION ALL

    SELECT
        t.pic_takeover_key AS pic_key,
        t.pic_takeover_raw AS pic_display,
        t.ticket_type,
        t.ticket_date::date AS event_date
    FROM public.ticketing_swfm_non_inap t
    WHERE NULLIF(TRIM(t.pic_takeover_key), '') IS NOT NULL
      {non_inap_filter_clause}
), normalized AS (
    SELECT
        COALESCE(a.canonical_pic, e.pic_display) AS pic,
        e.ticket_type,
        e.event_date
    FROM takeover_events e
    LEFT JOIN public.ticketing_pic_aliases a ON a.alias_key = e.pic_key
), totals AS (
    SELECT
        pic,
        COUNT(*) FILTER (WHERE ticket_type = 'BPS')::int AS bps,
        COUNT(*) FILTER (WHERE ticket_type = 'TS')::int AS ts,
        COUNT(*) FILTER (WHERE ticket_type = 'PMS')::int AS pms,
        COUNT(*) FILTER (WHERE ticket_type = 'PMG')::int AS pmg,
        COUNT(*) FILTER (WHERE ticket_type = 'FNA')::int AS fna,
        COUNT(*) FILTER (WHERE ticket_type = 'BBM')::int AS bbm,
        COUNT(*)::int AS total_takeover
    FROM normalized
    GROUP BY pic
), coverage AS (
    SELECT
        MIN(event_date)::date AS coverage_start,
        MAX(event_date)::date AS coverage_end,
        ARRAY_AGG(
            DISTINCT EXTRACT(YEAR FROM event_date)::int
            ORDER BY EXTRACT(YEAR FROM event_date)::int
        ) FILTER (WHERE event_date IS NOT NULL) AS active_years
    FROM normalized
)
SELECT
    ROW_NUMBER() OVER (
        ORDER BY total_takeover DESC, bps DESC, ts DESC, pms DESC, pmg DESC,
                 fna DESC, bbm DESC, LOWER(pic)
    )::int AS rank,
    pic,
    bps,
    ts,
    pms,
    pmg,
    fna,
    bbm,
    total_takeover,
    coverage.coverage_start,
    coverage.coverage_end,
    coverage.active_years
FROM totals
CROSS JOIN coverage
ORDER BY rank
"""

VISITING_BACKUP_BY_KABUPATEN_QUERY = """
WITH base AS (
    SELECT t.*
    FROM public.ticketing_fault_center t
    WHERE 1=1
    {filter_clause}
)
SELECT
    coalesce(NULLIF(TRIM(t.kabupaten_kota), ''), 'Unknown') AS label,
    COUNT(*) AS tickets,
    COUNT(*) FILTER (WHERE TRIM(t.visitation) = 'Visit site') AS visiting_site,
    COUNT(*) FILTER (WHERE t.backup_sukses = 'BU Genset') AS backup_genset,
    COALESCE(ROUND(100.0 * COUNT(*) FILTER (WHERE t.backup_sukses = 'BU Genset') / NULLIF(COUNT(*), 0), 2), 0)::float AS backup_rate
FROM base t
GROUP BY 1
ORDER BY tickets DESC, label
LIMIT 12
"""

RC_CATEGORY_PARETO_QUERY = """
WITH grouped AS (
    SELECT
        coalesce(NULLIF(TRIM(t.rc_category), ''), 'Unclassified') AS label,
        COUNT(*) AS tickets
    FROM public.ticketing_fault_center t
    WHERE 1=1
    {filter_clause}
    GROUP BY 1
),
ranked AS (
    SELECT
        label,
        tickets,
        SUM(tickets) OVER (ORDER BY tickets DESC, label) AS running_tickets,
        SUM(tickets) OVER () AS total_tickets
    FROM grouped
)
SELECT
    label,
    tickets,
    COALESCE(ROUND(100.0 * running_tickets / NULLIF(total_tickets, 0), 2), 0)::float AS cumulative_rate
FROM ranked
ORDER BY tickets DESC, label
LIMIT 8
"""

TYPE_TICKET_DISTRIBUTION_QUERY = """
WITH categories(sort_order, normalized_label, label) AS (
    VALUES
        (1, 'INCIDENT', 'Incident'),
        (2, 'EVENT', 'Event')
),
base AS (
    SELECT UPPER(TRIM(t.type_ticket)) AS normalized_label
    FROM public.ticketing_fault_center t
    WHERE 1=1
    {filter_clause}
)
SELECT
    c.label,
    COUNT(b.normalized_label)::int AS tickets
FROM categories c
LEFT JOIN base b ON b.normalized_label = c.normalized_label
GROUP BY c.sort_order, c.label
ORDER BY c.sort_order
"""

TOP_SITES_QUERY = """
WITH base AS (
    SELECT t.*
    FROM public.ticketing_fault_center t
    WHERE t.site_id IS NOT NULL
    {filter_clause}
)
SELECT
    site_id,
    MAX(site_name) AS site_name,
    MAX(cluster_to) AS cluster_to,
    COUNT(*) AS tickets,
    COUNT(*) FILTER (WHERE sla_status = 'OUT SLA') AS out_sla,
    COALESCE(ROUND(100.0 * COUNT(*) FILTER (WHERE sla_status = 'OUT SLA') / NULLIF(COUNT(*), 0), 2), 0)::float AS out_sla_rate,
    (
        percentile_cont(0.9) WITHIN GROUP (ORDER BY extract(epoch FROM mttr))
        FILTER (WHERE mttr IS NOT NULL AND extract(epoch FROM mttr) >= 0)
    ) / 3600 AS p90_mttr_hours,
    COALESCE(ROUND(100.0 * COUNT(*) FILTER (WHERE backup_sukses = 'BU Genset') / NULLIF(COUNT(*), 0), 2), 0)::float AS backup_sukses_rate
FROM base
GROUP BY site_id
ORDER BY tickets DESC, out_sla DESC
LIMIT 10
"""

TICKETS_COUNT_QUERY = """
SELECT COUNT(*)
FROM public.ticketing_fault_center t
WHERE 1=1
{filter_clause}
{search_clause}
"""

TICKETS_LIST_QUERY = """
SELECT
    t.ticket_number_swfm,
    t.ticket_number_inap,
    t.site_id,
    t.site_name,
    t.cluster_to,
    {category_expr} AS kategori_tt,
    t.sla_status,
    t.ticket_swfm_status,
    t.created_at,
    CASE WHEN t.mttr IS NOT NULL AND extract(epoch FROM t.mttr) >= 0 THEN extract(epoch FROM t.mttr) / 3600 ELSE NULL END AS mttr_hours,
    CASE WHEN t.respon_time IS NOT NULL AND extract(epoch FROM t.respon_time) >= 0 THEN extract(epoch FROM t.respon_time) / 60 ELSE NULL END AS response_minutes,
    t.backup_sukses,
    coalesce(t.rc_category, 'Unclassified') AS rc_category,
    t.is_escalate
FROM public.ticketing_fault_center t
WHERE 1=1
{filter_clause}
{search_clause}
ORDER BY {sort_column} {sort_direction}
LIMIT :limit OFFSET :offset
"""

TICKET_DETAIL_QUERY = """
SELECT
    ticket_number_swfm,
    ticket_number_inap,
    kategori_tt,
    severity,
    type_ticket,
    site_id,
    site_name,
    site_class,
    cluster_to,
    kabupaten_kota,
    impact,
    occured_time,
    created_at,
    tahun,
    periode_bulan,
    tanggal,
    extract(epoch FROM mttr) AS mttr_seconds,
    extract(epoch FROM respon_time) AS response_seconds,
    takeover,
    pln_downtime,
    durasi,
    visitation,
    backup_sukses,
    ticket_inap_status,
    ticket_swfm_status,
    pic_take_over_ticket,
    nop,
    regional,
    area,
    is_escalate,
    escalate_to,
    cleared_time,
    is_auto_resolved,
    rc_owner,
    rc_category,
    rc_1,
    rc_2,
    note,
    resolution_action,
    take_over_date,
    chek_in_at,
    inap_rc_1,
    inap_rc_2,
    inap_resolution_action,
    sla_status,
    fault_text,
    nossa_no,
    assignee_group,
    summary,
    description,
    submitted_time,
    incident_priority,
    hub,
    is_excluded_in_kpi,
    ticket_creation,
    ticket_creator,
    site_cleared_on,
    rank,
    closed_at,
    follow_up_at,
    holding_status
FROM public.ticketing_fault_center
WHERE ticket_number_swfm = :ticket_number_swfm
"""


def shared_query_params(
    start_date: date | None = Query(None),
    end_date: date | None = Query(None),
    tahun: int | None = Query(None),
    bulan: int | None = Query(None, ge=1, le=12),
    period_start: str | None = Query(None),
    period_end: str | None = Query(None),
    nop: str | None = Query(None),
    cluster_to: str | None = Query(None),
    kategori_tt: str | None = Query(None),
    takeover: str | None = Query(None),
    ticket_swfm_status: str | None = Query(None),
    backup_sukses: str | None = Query(None),
    rc_category: str | None = Query(None),
    is_escalate: bool | None = Query(None),
) -> dict:
    has_canonical = period_start is not None or period_end is not None
    has_custom = start_date is not None or end_date is not None
    has_legacy = tahun is not None or bulan is not None
    if has_canonical and (has_custom or has_legacy):
        raise HTTPException(status_code=422, detail="Periode bulan tidak boleh digabung dengan tanggal kustom atau tahun/bulan lama.")
    if has_custom and (start_date is None or end_date is None):
        raise HTTPException(status_code=422, detail="start_date dan end_date wajib diisi bersama.")
    period: MonthPeriod | None = None
    if has_canonical:
        period = resolve_month_period(period_start=period_start, period_end=period_end)
        start_date = period.start_date
        end_date = period.end_date_exclusive - timedelta(days=1)
    params = build_filter_params(
        start_date=start_date,
        end_date=end_date,
        tahun=tahun,
        bulan=bulan,
        nop=nop,
        cluster_to=cluster_to,
        kategori_tt=kategori_tt,
        takeover=takeover,
        ticket_swfm_status=ticket_swfm_status,
        backup_sukses=backup_sukses,
        rc_category=rc_category,
        is_escalate=is_escalate,
    )
    params["_period"] = period
    return params


async def ticketing_period_meta(session: AsyncSession, params: dict):
    period = params.get("_period")
    if not period:
        return None
    result = await session.execute(text(
        f"SELECT DISTINCT TO_CHAR(created_at, 'YYYY-MM') AS month FROM {TABLE_NAME} WHERE created_at IS NOT NULL"
    ))
    available_months = [row[0] for row in result.fetchall() if row[0]]
    return build_period_meta(period, {"ticketing": available_months})


@router.get("/filters", response_model=TicketingFilters)
async def get_ticketing_filters(
    session: AsyncSession = Depends(get_session),
    response: Response = None,
):
    cache_key = redis_cache.make_key("filters", "ticketing-v2")
    cache_status, cached_value = await redis_cache.get_json(cache_key)
    if cache_status == CACHE_HIT:
        if response is not None:
            response.headers["X-Cache"] = cache_status
        return TicketingFilters.model_validate(cached_value)

    result = await session.execute(text(FILTER_OPTIONS_QUERY))
    row = result.mappings().first() or {}
    payload = TicketingFilters(**dict(row))
    if cache_status == CACHE_MISS:
        await redis_cache.set_json(
            cache_key,
            payload.model_dump(mode="json"),
            ttl_seconds=FILTER_CACHE_TTL_SECONDS,
        )
    if response is not None:
        response.headers["X-Cache"] = cache_status
    return payload


@router.get("/dashboard", response_model=TicketingDashboard)
async def get_ticketing_dashboard(
    params: dict = Depends(shared_query_params),
    session: AsyncSession = Depends(get_session),
):
    filter_clause = build_filter_clause(params)
    category_expr = normalize_category_sql("t.kategori_tt")
    sql_params = {**params, "distribution_limit": 12}
    period = params.get("_period")
    trend_granularity = resolve_trend_granularity(
        month_count=(
            period.month_count
            if period
            else (1 if params.get("tahun") and params.get("bulan") else None)
        ),
        start_date=params.get("start_date"),
        end_date=params.get("end_date"),
    )
    trend_unit, trend_label_format = TREND_BUCKET_SQL[trend_granularity]

    summary_result = await session.execute(
        text(DASHBOARD_SUMMARY_QUERY.format(filter_clause=filter_clause, category_expr=category_expr)),
        sql_params,
    )
    summary = row_to_dict(summary_result.first())
    previous_total_tickets = 0
    previous_params = previous_month_bounds(params)
    if previous_params:
        previous_filter_clause = build_filter_clause(previous_params)
        previous_result = await session.execute(
            text(PREVIOUS_MONTH_TICKETS_QUERY.format(filter_clause=previous_filter_clause)),
            previous_params,
        )
        previous_total_tickets = int(previous_result.scalar() or 0)
    total_tickets = int(summary.get("total_tickets") or 0)
    total_tickets_mom_delta = total_tickets - previous_total_tickets
    summary["previous_total_tickets"] = previous_total_tickets
    summary["total_tickets_mom_delta"] = total_tickets_mom_delta
    summary["total_tickets_mom_rate"] = (
        round((total_tickets_mom_delta / previous_total_tickets) * 100, 2)
        if previous_total_tickets
        else None
    )

    trend = await rows_to_dicts(
        session,
        TREND_QUERY.format(
            filter_clause=filter_clause,
            category_expr=category_expr,
            trend_unit=trend_unit,
            trend_label_format=trend_label_format,
        ),
        sql_params,
    )
    sla_distribution = await rows_to_dicts(
        session,
        DISTRIBUTION_QUERY.format(
            filter_clause=filter_clause,
            label_expr="coalesce(NULLIF(TRIM(t.sla_status), ''), 'Unknown')",
        ),
        sql_params,
    )
    backup_distribution = await rows_to_dicts(
        session,
        DISTRIBUTION_QUERY.format(
            filter_clause=filter_clause,
            label_expr="coalesce(NULLIF(TRIM(t.backup_sukses), ''), 'Unknown')",
        ),
        sql_params,
    )
    location_rows = await rows_to_dicts(
        session,
        LOCATION_BREAKDOWN_QUERY.format(filter_clause=filter_clause),
        sql_params,
    )
    location_breakdown_title = location_rows[0]["breakdown_title"] if location_rows else "Kabupaten/Kota Distribution"
    for row in location_rows:
        row.pop("breakdown_title", None)

    visiting_backup_distribution = await rows_to_dicts(
        session,
        VISITING_BACKUP_BY_KABUPATEN_QUERY.format(filter_clause=filter_clause),
        sql_params,
    )
    rc_category_pareto = await rows_to_dicts(
        session,
        RC_CATEGORY_PARETO_QUERY.format(filter_clause=filter_clause),
        sql_params,
    )
    type_ticket_distribution = await rows_to_dicts(
        session,
        TYPE_TICKET_DISTRIBUTION_QUERY.format(filter_clause=filter_clause),
        sql_params,
    )
    top_sites = await rows_to_dicts(
        session,
        TOP_SITES_QUERY.format(filter_clause=filter_clause),
        sql_params,
    )
    fop_rows = await rows_to_dicts(
        session,
        FOP_PERFORMANCE_QUERY.format(filter_clause=filter_clause),
        sql_params,
    )
    fop_performance = rank_fop_performance(fop_rows)
    takeover_rows = await rows_to_dicts(
        session,
        TAKEOVER_RANKING_QUERY.format(
            fault_category_expr=normalize_category_sql("t.kategori_tt"),
            fault_filter_clause=build_takeover_filter_clause(params, source="fault_center"),
            non_inap_filter_clause=build_takeover_filter_clause(params, source="non_inap"),
        ),
        sql_params,
    )
    coverage = takeover_rows[0] if takeover_rows else {}
    coverage_start = coverage.get("coverage_start")
    coverage_end = coverage.get("coverage_end")
    active_years = coverage.get("active_years")
    for row in takeover_rows:
        row.pop("coverage_start", None)
        row.pop("coverage_end", None)
        row.pop("active_years", None)
    takeover_ranking = add_takeover_daily_average(
        takeover_rows,
        active_days=active_period_day_count(
            start_date=params.get("start_date"),
            end_date=params.get("end_date"),
            year=params.get("tahun"),
            month=params.get("bulan"),
            active_years=active_years,
            coverage_start=coverage_start,
            coverage_end=coverage_end,
        ),
    )

    return TicketingDashboard(
        summary=summary,
        trend=trend,
        trend_granularity=trend_granularity,
        sla_distribution=sla_distribution,
        backup_distribution=backup_distribution,
        location_breakdown_title=location_breakdown_title,
        location_breakdown=location_rows,
        visiting_backup_distribution=visiting_backup_distribution,
        rc_category_pareto=rc_category_pareto,
        type_ticket_distribution=type_ticket_distribution,
        top_sites=top_sites,
        fop_performance=fop_performance,
        takeover_ranking=takeover_ranking,
        period_meta=await ticketing_period_meta(session, params),
    )


@router.get("/tickets", response_model=TicketingTicketResponse)
async def list_ticketing_tickets(
    params: dict = Depends(shared_query_params),
    q: str | None = Query(None),
    page: int = Query(1, ge=1),
    limit: int = Query(DEFAULT_LIMIT, ge=1, le=100),
    sort_by: str = Query("created_at"),
    sort_dir: str = Query("desc"),
    session: AsyncSession = Depends(get_session),
):
    filter_clause = build_filter_clause(params)
    search_clause = ""
    sql_params = {**params, "limit": limit, "offset": (page - 1) * limit}
    if q:
        search_clause = """
        AND (
            t.ticket_number_swfm ILIKE :search
            OR t.ticket_number_inap ILIKE :search
            OR t.site_id ILIKE :search
            OR t.site_name ILIKE :search
            OR t.summary ILIKE :search
        )
        """
        sql_params["search"] = f"%{q}%"

    sort_map = {
        "created_at": "t.created_at",
        "ticket_number_swfm": "t.ticket_number_swfm",
        "site_id": "t.site_id",
        "sla_status": "t.sla_status",
        "ticket_swfm_status": "t.ticket_swfm_status",
        "mttr": "t.mttr",
    }
    sort_column = sort_map.get(sort_by, "t.created_at")
    sort_direction = "ASC" if sort_dir.lower() == "asc" else "DESC"

    total = await session.scalar(
        text(TICKETS_COUNT_QUERY.format(filter_clause=filter_clause, search_clause=search_clause)),
        sql_params,
    )
    result = await session.execute(
        text(TICKETS_LIST_QUERY.format(
            filter_clause=filter_clause,
            search_clause=search_clause,
            category_expr=normalize_category_sql("t.kategori_tt"),
            sort_column=sort_column,
            sort_direction=sort_direction,
        )),
        sql_params,
    )
    items = [row_to_dict(row) for row in result.fetchall()]
    return TicketingTicketResponse(
        items=items,
        total=total or 0,
        page=page,
        limit=limit,
        total_pages=math.ceil((total or 0) / limit) if limit else 0,
        period_meta=await ticketing_period_meta(session, params),
    )


@router.get("/tickets/export")
async def export_ticketing_tickets(
    params: dict = Depends(shared_query_params),
    q: str | None = Query(None),
    sort_by: str = Query("created_at"),
    sort_dir: str = Query("desc"),
    session: AsyncSession = Depends(get_session),
):
    """Stream every ticket matching the same dashboard/list filters as CSV."""
    filter_clause = build_filter_clause(params)
    search_clause = ""
    sql_params = {**params}
    if q:
        search_clause = """
        AND (
            t.ticket_number_swfm ILIKE :search
            OR t.ticket_number_inap ILIKE :search
            OR t.site_id ILIKE :search
            OR t.site_name ILIKE :search
            OR t.summary ILIKE :search
        )
        """
        sql_params["search"] = f"%{q}%"

    sort_map = {
        "created_at": "t.created_at",
        "ticket_number_swfm": "t.ticket_number_swfm",
        "site_id": "t.site_id",
        "sla_status": "t.sla_status",
        "ticket_swfm_status": "t.ticket_swfm_status",
        "mttr": "t.mttr",
    }
    sort_column = sort_map.get(sort_by, "t.created_at")
    sort_direction = "ASC" if sort_dir.lower() == "asc" else "DESC"
    export_query = TICKETS_LIST_QUERY.rsplit("LIMIT :limit OFFSET :offset", 1)[0]
    period_meta = await ticketing_period_meta(session, params)
    result = await session.stream(
        text(export_query.format(
            filter_clause=filter_clause,
            search_clause=search_clause,
            category_expr=normalize_category_sql("t.kategori_tt"),
            sort_column=sort_column,
            sort_direction=sort_direction,
        )),
        sql_params,
    )
    missing_months = ";".join((period_meta.missing_months_by_source.get("ticketing") if period_meta else []) or [])
    report_period = (
        f"{period_meta.period_start}..{period_meta.period_end}"
        if period_meta else f"{params.get('start_date') or 'all'}..{params.get('end_date') or 'all'}"
    )
    header = [
        "report_period", "missing_months", "ticket_number_swfm", "ticket_number_inap",
        "site_id", "site_name", "cluster_to", "kategori_tt", "sla_status",
        "ticket_swfm_status", "created_at", "mttr_hours", "response_minutes",
        "backup_sukses", "rc_category", "is_escalate",
    ]

    async def csv_rows():
        buffer = io.StringIO()
        writer = csv.writer(buffer)
        writer.writerow(header)
        yield buffer.getvalue()
        async for row in result.mappings():
            buffer.seek(0)
            buffer.truncate(0)
            item = dict(row)
            writer.writerow([report_period, missing_months, *[item.get(column) for column in header[2:]]])
            yield buffer.getvalue()

    filename_start = period_meta.period_start if period_meta else str(params.get("start_date") or "all")
    filename_end = period_meta.period_end if period_meta else str(params.get("end_date") or "all")
    return StreamingResponse(
        csv_rows(),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="ticketing-{filename_start}-{filename_end}.csv"'},
    )


@router.get("/tickets/{ticket_number_swfm}", response_model=TicketingTicketDetail)
async def get_ticketing_ticket_detail(
    ticket_number_swfm: str,
    session: AsyncSession = Depends(get_session),
):
    result = await session.execute(text(TICKET_DETAIL_QUERY), {"ticket_number_swfm": ticket_number_swfm})
    row = result.mappings().first()
    if not row:
        raise HTTPException(status_code=404, detail="Ticket not found")
    data = dict(row)
    return TicketingTicketDetail(ticket_number_swfm=ticket_number_swfm, data=data)

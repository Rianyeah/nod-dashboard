"""
Ticketing router - endpoints for public.ticketing_fault_center dashboard.

GET /ticketing/filters                    - global filter values
GET /ticketing/dashboard                  - scorecards, charts, top sites
GET /ticketing/tickets                    - paginated ticket table
GET /ticketing/tickets/{ticket_number_swfm} - ticket drilldown detail
"""
from datetime import date
import math

from fastapi import APIRouter, Depends, HTTPException, Query
import runtime_compat  # noqa: F401
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_session
from models.ticketing import (
    TicketingDashboard,
    TicketingFilters,
    TicketingTicketDetail,
    TicketingTicketResponse,
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
    sla_status: str | None = None,
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
        "sla_status": sla_status,
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
    if params.get("sla_status"):
        clauses.append("t.sla_status = :sla_status")
    if params.get("ticket_swfm_status"):
        clauses.append("t.ticket_swfm_status = :ticket_swfm_status")
    if params.get("backup_sukses"):
        clauses.append("t.backup_sukses = :backup_sukses")
    if params.get("rc_category"):
        clauses.append("coalesce(t.rc_category, 'Unclassified') = :rc_category")
    if params.get("is_escalate") is not None:
        clauses.append("t.is_escalate = :is_escalate")
    return "".join(f" AND {clause}" for clause in clauses)


def row_to_dict(row):
    return dict(row._mapping)


async def rows_to_dicts(session: AsyncSession, sql: str, params: dict) -> list[dict]:
    result = await session.execute(text(sql), params)
    return [row_to_dict(row) for row in result.fetchall()]


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
        SELECT DISTINCT NULLIF(TRIM(sla_status), '')
        FROM {TABLE_NAME}
        WHERE NULLIF(TRIM(sla_status), '') IS NOT NULL
        ORDER BY 1
    ) AS sla_statuses,
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
    COUNT(*) FILTER (WHERE takeover = 'TAKE OVER') AS manual_takeover_tickets,
    COALESCE(ROUND(100.0 * COUNT(*) FILTER (WHERE takeover = 'TAKE OVER') / NULLIF(COUNT(*), 0), 2), 0)::float AS manual_takeover_rate,
    COUNT(*) FILTER (WHERE ticket_swfm_status = 'CLOSED') AS closed_tickets,
    COALESCE(ROUND(100.0 * COUNT(*) FILTER (WHERE ticket_swfm_status = 'CLOSED') / NULLIF(COUNT(*), 0), 2), 0)::float AS closed_rate,
    COUNT(*) FILTER (WHERE ticket_swfm_status = 'CANCELED') AS canceled_tickets,
    MAX(created_at) AS last_created_at
FROM base
"""

TREND_QUERY = """
WITH base AS (
    SELECT t.*, {category_expr} AS ticket_category_label
    FROM public.ticketing_fault_center t
    WHERE t.created_at IS NOT NULL
    {filter_clause}
)
SELECT
    date_trunc('day', created_at)::date AS day,
    to_char(date_trunc('day', created_at), 'DD Mon') AS label,
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
    COUNT(*) AS tickets,
    COUNT(*) FILTER (WHERE t.sla_status = 'OUT SLA') AS out_sla,
    COALESCE(ROUND(100.0 * COUNT(*) FILTER (WHERE t.sla_status = 'OUT SLA') / NULLIF(COUNT(*), 0), 2), 0)::float AS out_sla_rate
FROM base t
GROUP BY 1, 2
ORDER BY tickets DESC, label
LIMIT 12
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
    nop: str | None = Query(None),
    cluster_to: str | None = Query(None),
    kategori_tt: str | None = Query(None),
    sla_status: str | None = Query(None),
    ticket_swfm_status: str | None = Query(None),
    backup_sukses: str | None = Query(None),
    rc_category: str | None = Query(None),
    is_escalate: bool | None = Query(None),
) -> dict:
    return build_filter_params(
        start_date=start_date,
        end_date=end_date,
        tahun=tahun,
        bulan=bulan,
        nop=nop,
        cluster_to=cluster_to,
        kategori_tt=kategori_tt,
        sla_status=sla_status,
        ticket_swfm_status=ticket_swfm_status,
        backup_sukses=backup_sukses,
        rc_category=rc_category,
        is_escalate=is_escalate,
    )


@router.get("/filters", response_model=TicketingFilters)
async def get_ticketing_filters(session: AsyncSession = Depends(get_session)):
    result = await session.execute(text(FILTER_OPTIONS_QUERY))
    row = result.mappings().first() or {}
    return TicketingFilters(**dict(row))


@router.get("/dashboard", response_model=TicketingDashboard)
async def get_ticketing_dashboard(
    params: dict = Depends(shared_query_params),
    session: AsyncSession = Depends(get_session),
):
    filter_clause = build_filter_clause(params)
    category_expr = normalize_category_sql("t.kategori_tt")
    sql_params = {**params, "distribution_limit": 12}

    summary_result = await session.execute(
        text(DASHBOARD_SUMMARY_QUERY.format(filter_clause=filter_clause, category_expr=category_expr)),
        sql_params,
    )
    summary = row_to_dict(summary_result.first())

    trend = await rows_to_dicts(
        session,
        TREND_QUERY.format(filter_clause=filter_clause, category_expr=category_expr),
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
    top_sites = await rows_to_dicts(
        session,
        TOP_SITES_QUERY.format(filter_clause=filter_clause),
        sql_params,
    )

    return TicketingDashboard(
        summary=summary,
        trend=trend,
        sla_distribution=sla_distribution,
        backup_distribution=backup_distribution,
        location_breakdown_title=location_breakdown_title,
        location_breakdown=location_rows,
        visiting_backup_distribution=visiting_backup_distribution,
        rc_category_pareto=rc_category_pareto,
        top_sites=top_sites,
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

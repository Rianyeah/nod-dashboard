"""Neon-backed Ticket TOTI dashboard endpoints."""

from datetime import date, timedelta
import math

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from cache import CACHE_HIT, CACHE_MISS, FILTER_CACHE_TTL_SECONDS, redis_cache
from database import get_session
from models.ticket_toti import (
    TicketTotiDashboard,
    TicketTotiFilters,
    TicketTotiSummary,
    TicketTotiTicketResponse,
    TicketTotiTopItem,
)
from periods import build_period_meta, resolve_month_period


router = APIRouter(prefix="/ticketing/toti", tags=["Ticket TOTI"])

TABLE_NAME = "public.ticket_toti"
DEFAULT_LIMIT = 15


def normalize_category_label(value: str | None) -> str:
    normalized = (value or "").strip()
    if not normalized:
        return "Unknown"
    if normalized.upper() == "VANDALISM":
        return "Vandalisme"
    return normalized


def normalized_nop_sql(column: str) -> str:
    collapsed = f"regexp_replace(trim(coalesce({column}, '')), '\\s+', ' ', 'g')"
    return (
        "CASE "
        f"WHEN {collapsed} = '' THEN 'Unknown' "
        f"WHEN {collapsed} ~* '^NSA(?:\\s+|$)' "
        f"THEN regexp_replace({collapsed}, '^NSA(?:\\s+|$)', 'NOP ', 'i') "
        f"ELSE {collapsed} END"
    )


def safe_timestamp_sql(column: str) -> str:
    trimmed = f"trim({column})"
    return (
        "CASE "
        f"WHEN {trimmed} ~ '^\\d{{4}}-\\d{{2}}-\\d{{2}} "
        "\\d{2}:\\d{2}:\\d{2}$' "
        f"AND pg_input_is_valid({trimmed}, 'timestamp without time zone') "
        f"THEN {trimmed}::timestamp "
        "ELSE NULL END"
    )


def previous_period_bounds(start_date: date, end_date: date) -> tuple[date, date]:
    selected_days = (end_date - start_date).days + 1
    previous_end = start_date - timedelta(days=1)
    return previous_end - timedelta(days=selected_days - 1), previous_end


def shared_query_params(
    *,
    start_date: date | None = None,
    end_date: date | None = None,
    period_start: str | None = None,
    period_end: str | None = None,
    nop: str | None = None,
    cluster: str | None = None,
    mitra: str | None = None,
    kategori: str | None = None,
    status: str | None = None,
) -> dict:
    has_month_period = period_start is not None or period_end is not None
    has_custom_period = start_date is not None or end_date is not None
    if has_month_period and has_custom_period:
        raise HTTPException(
            status_code=422,
            detail="Gunakan rentang bulan atau rentang tanggal khusus, bukan keduanya.",
        )
    if (start_date is None) != (end_date is None):
        raise HTTPException(status_code=422, detail="start_date dan end_date wajib diisi bersama.")

    period = None
    if has_month_period:
        period = resolve_month_period(period_start=period_start, period_end=period_end)
        start_date = period.start_date
        end_date = period.end_date_exclusive - timedelta(days=1)

    if start_date and end_date and end_date < start_date:
        raise HTTPException(status_code=422, detail="Rentang tanggal harus berurutan.")

    return {
        "start_date": start_date,
        "end_date": end_date,
        "nop": nop,
        "cluster": cluster,
        "mitra": mitra,
        "kategori": kategori,
        "status": status,
        "_period": period,
    }


def build_filter_clause(params: dict) -> str:
    clauses: list[str] = []
    if params.get("start_date"):
        clauses.append("t.requested_at >= CAST(:start_date AS date)")
    if params.get("end_date"):
        clauses.append("t.requested_at < (CAST(:end_date AS date) + interval '1 day')")
    if params.get("nop"):
        clauses.append("UPPER(t.normalized_nop) = UPPER(:nop)")
    if params.get("cluster"):
        clauses.append("UPPER(TRIM(t.cluster)) = UPPER(TRIM(:cluster))")
    if params.get("mitra"):
        clauses.append("UPPER(TRIM(t.mitra)) = UPPER(TRIM(:mitra))")
    if params.get("kategori"):
        if params["kategori"].strip().upper() in {"VANDALISM", "VANDALISME"}:
            clauses.append("UPPER(TRIM(t.kategori)) = 'VANDALISM'")
        else:
            clauses.append("UPPER(TRIM(t.kategori)) = UPPER(TRIM(:kategori))")
    if params.get("status"):
        clauses.append("UPPER(TRIM(t.status)) = UPPER(TRIM(:status))")
    return "".join(f" AND {clause}" for clause in clauses)


def category_label_sql(column: str) -> str:
    return (
        "CASE "
        f"WHEN upper(trim(coalesce({column}, ''))) = 'VANDALISM' THEN 'Vandalisme' "
        f"ELSE coalesce(nullif(trim({column}), ''), 'Unknown') END"
    )


PARSED_BASE_CTE = f"""
parsed_toti AS (
    SELECT
        src.id,
        src.mitra,
        src.siteid,
        src.sitename,
        src.permasalahan,
        src.kategori,
        src.sub_kategori,
        src.kondisi_site,
        src.status,
        src.cluster,
        {safe_timestamp_sql('src.tgl_request')} AS requested_at,
        {safe_timestamp_sql('src.tgl_close')} AS closed_at,
        {safe_timestamp_sql('src.created_at')} AS created_at_parsed,
        {safe_timestamp_sql('src.updated_at')} AS updated_at_parsed,
        {normalized_nop_sql('src.nop')} AS normalized_nop,
        {category_label_sql('src.kategori')} AS category_label
    FROM {TABLE_NAME} src
),
valid_toti AS (
    SELECT *
    FROM parsed_toti
    WHERE requested_at IS NOT NULL
)
"""


FILTER_OPTIONS_QUERY = f"""
/* ticket_toti:filters */
WITH {PARSED_BASE_CTE}
SELECT
    MIN(requested_at)::date AS min_date,
    MAX(requested_at)::date AS max_date,
    date_trunc('month', MAX(requested_at))::date AS default_start_date,
    (date_trunc('month', MAX(requested_at)) + interval '1 month - 1 day')::date AS default_end_date,
    ARRAY(
        SELECT DISTINCT to_char(requested_at, 'YYYY-MM')
        FROM valid_toti
        ORDER BY 1 DESC
    ) AS available_months,
    ARRAY(
        SELECT DISTINCT normalized_nop
        FROM valid_toti
        WHERE normalized_nop <> 'Unknown'
        ORDER BY 1
    ) AS nops,
    ARRAY(
        SELECT DISTINCT trim(cluster)
        FROM valid_toti
        WHERE nullif(trim(cluster), '') IS NOT NULL
        ORDER BY 1
    ) AS clusters,
    ARRAY(
        SELECT DISTINCT trim(mitra)
        FROM valid_toti
        WHERE nullif(trim(mitra), '') IS NOT NULL
        ORDER BY 1
    ) AS mitras,
    ARRAY(
        SELECT DISTINCT category_label
        FROM valid_toti
        WHERE category_label <> 'Unknown'
        ORDER BY 1
    ) AS categories,
    ARRAY(
        SELECT DISTINCT trim(status)
        FROM valid_toti
        WHERE nullif(trim(status), '') IS NOT NULL
        ORDER BY 1
    ) AS statuses
FROM valid_toti
"""


DEFAULT_PERIOD_QUERY = f"""
/* ticket_toti:default_period */
WITH {PARSED_BASE_CTE}
SELECT
    date_trunc('month', MAX(requested_at))::date AS start_date,
    (date_trunc('month', MAX(requested_at)) + interval '1 month - 1 day')::date AS end_date
FROM valid_toti
"""


SUMMARY_QUERY = f"""
/* ticket_toti:summary */
WITH {PARSED_BASE_CTE}
SELECT
    COUNT(*)::int AS total_tickets,
    MAX(coalesce(updated_at_parsed, created_at_parsed)) AS last_updated_at
FROM valid_toti t
WHERE TRUE {{filter_clause}}
"""


PREVIOUS_TOTAL_QUERY = f"""
/* ticket_toti:previous_total */
WITH {PARSED_BASE_CTE}
SELECT COUNT(*)::int
FROM valid_toti t
WHERE TRUE {{filter_clause}}
"""


TOP_GROUP_QUERY = f"""
/* ticket_toti:{{marker}} */
WITH {PARSED_BASE_CTE}
SELECT {{label_expression}} AS label, COUNT(*)::int AS tickets
FROM valid_toti t
WHERE TRUE {{filter_clause}}
GROUP BY 1
ORDER BY tickets DESC, label ASC
LIMIT 1
"""


VANDALISM_QUERY = f"""
/* ticket_toti:vandalism */
WITH {PARSED_BASE_CTE}
SELECT COUNT(*)::int
FROM valid_toti t
WHERE TRUE {{filter_clause}}
  AND upper(trim(coalesce(t.kategori, ''))) = 'VANDALISM'
"""


TREND_QUERY = f"""
/* ticket_toti:trend */
WITH {PARSED_BASE_CTE}
SELECT
    date_trunc('{{trend_unit}}', t.requested_at)::date AS period,
    to_char(date_trunc('{{trend_unit}}', t.requested_at), '{{label_format}}') AS label,
    COUNT(*)::int AS total,
    COUNT(*) FILTER (
        WHERE upper(trim(coalesce(t.kategori, ''))) = 'VANDALISM'
    )::int AS vandalism
FROM valid_toti t
WHERE TRUE {{filter_clause}}
GROUP BY 1, 2
ORDER BY 1
"""


DISTRIBUTION_QUERY = f"""
/* ticket_toti:{{marker}} */
WITH {PARSED_BASE_CTE}
SELECT {{label_expression}} AS label, COUNT(*)::int AS tickets
FROM valid_toti t
WHERE TRUE {{filter_clause}}
GROUP BY 1
ORDER BY tickets DESC, label ASC
"""


AVAILABLE_MONTHS_QUERY = f"""
/* ticket_toti:available_months */
WITH {PARSED_BASE_CTE}
SELECT DISTINCT to_char(requested_at, 'YYYY-MM') AS month
FROM valid_toti
ORDER BY 1
"""


TICKETS_COUNT_QUERY = f"""
/* ticket_toti:tickets_count */
WITH {PARSED_BASE_CTE}
SELECT COUNT(*)::int
FROM valid_toti t
WHERE TRUE {{filter_clause}} {{search_clause}}
"""


TICKETS_LIST_QUERY = f"""
/* ticket_toti:tickets_list */
WITH {PARSED_BASE_CTE}
SELECT
    nullif(trim(t.siteid), '') AS siteid,
    nullif(trim(t.sitename), '') AS sitename,
    coalesce(nullif(trim(t.id), ''), 'Unknown') AS id,
    t.category_label AS kategori,
    nullif(trim(t.sub_kategori), '') AS sub_kategori,
    nullif(trim(t.permasalahan), '') AS permasalahan,
    nullif(trim(t.kondisi_site), '') AS kondisi_site,
    t.requested_at,
    t.closed_at,
    CASE
        WHEN t.closed_at IS NOT NULL AND t.closed_at >= t.requested_at
        THEN floor(EXTRACT(EPOCH FROM (t.closed_at - t.requested_at)))::bigint
        ELSE NULL
    END AS duration_seconds
FROM valid_toti t
WHERE TRUE {{filter_clause}} {{search_clause}}
ORDER BY t.requested_at DESC, t.id DESC
LIMIT :limit OFFSET :offset
"""


def _row_mapping(result) -> dict:
    row = result.mappings().first()
    return dict(row) if row else {}


def _mapping_rows(result) -> list[dict]:
    return [dict(row) for row in result.mappings().all()]


def _sql_params(params: dict) -> dict:
    return {key: value for key, value in params.items() if not key.startswith("_")}


def _render_query(template: str, **values: str) -> str:
    rendered = template
    for name, value in values.items():
        rendered = rendered.replace("{" + name + "}", value)
    return rendered


def _share(tickets: int, total_tickets: int) -> float:
    return round((tickets / total_tickets) * 100, 2) if total_tickets else 0.0


def compact_distribution(
    rows: list[dict],
    *,
    total_tickets: int,
    limit: int = 10,
) -> list[dict]:
    compact = [
        {
            "label": normalize_category_label(row.get("label")),
            "tickets": int(row.get("tickets") or 0),
            "share": _share(int(row.get("tickets") or 0), total_tickets),
        }
        for row in rows[:limit]
    ]
    remainder = sum(int(row.get("tickets") or 0) for row in rows[limit:])
    if remainder:
        compact.append(
            {
                "label": "Lainnya",
                "tickets": remainder,
                "share": _share(remainder, total_tickets),
            }
        )
    return compact


def _comparison_params(params: dict) -> dict | None:
    start_date = params.get("start_date")
    end_date = params.get("end_date")
    if not start_date or not end_date:
        return None

    period = params.get("_period")
    if period:
        previous = resolve_month_period(
            period_start=period.comparison_start,
            period_end=period.comparison_end,
        )
        previous_start = previous.start_date
        previous_end = previous.end_date_exclusive - timedelta(days=1)
    else:
        previous_start, previous_end = previous_period_bounds(start_date, end_date)

    return {
        **params,
        "start_date": previous_start,
        "end_date": previous_end,
        "_period": None,
    }


async def _ensure_default_period(session: AsyncSession, params: dict) -> dict:
    if params.get("start_date") or params.get("end_date"):
        return params
    result = await session.execute(text(DEFAULT_PERIOD_QUERY))
    row = _row_mapping(result)
    if not row.get("start_date") or not row.get("end_date"):
        return params
    return {**params, "start_date": row["start_date"], "end_date": row["end_date"]}


async def ticket_toti_period_meta(session: AsyncSession, params: dict):
    period = params.get("_period")
    if not period:
        return None
    result = await session.execute(text(AVAILABLE_MONTHS_QUERY))
    available_months = [row[0] for row in result.fetchall() if row[0]]
    return build_period_meta(period, {"ticket_toti": available_months})


@router.get("/filters", response_model=TicketTotiFilters)
async def get_ticket_toti_filters(
    session: AsyncSession = Depends(get_session),
    response: Response = None,
):
    cache_key = redis_cache.make_key("filters", "ticket-toti-v1")
    cache_status, cached_value = await redis_cache.get_json(cache_key)
    if cache_status == CACHE_HIT:
        if response is not None:
            response.headers["X-Cache"] = cache_status
        return TicketTotiFilters.model_validate(cached_value)

    result = await session.execute(text(FILTER_OPTIONS_QUERY))
    payload = TicketTotiFilters(**_row_mapping(result))
    if cache_status == CACHE_MISS:
        await redis_cache.set_json(
            cache_key,
            payload.model_dump(mode="json"),
            ttl_seconds=FILTER_CACHE_TTL_SECONDS,
        )
    if response is not None:
        response.headers["X-Cache"] = cache_status
    return payload


@router.get("/dashboard", response_model=TicketTotiDashboard)
async def get_ticket_toti_dashboard(
    params: dict = Depends(shared_query_params),
    session: AsyncSession = Depends(get_session),
):
    params = await _ensure_default_period(session, params)
    filter_clause = build_filter_clause(params)
    sql_params = _sql_params(params)

    cache_key = redis_cache.make_key("dashboard", "ticket-toti-v1", **sql_params)
    cache_status, cached_value = await redis_cache.get_json(cache_key)
    if cache_status == CACHE_HIT:
        return TicketTotiDashboard.model_validate(cached_value)

    summary_result = await session.execute(
        text(_render_query(SUMMARY_QUERY, filter_clause=filter_clause)),
        sql_params,
    )
    summary_row = _row_mapping(summary_result)
    total_tickets = int(summary_row.get("total_tickets") or 0)

    previous_total = 0
    previous_params = _comparison_params(params)
    if previous_params:
        previous_result = await session.execute(
            text(
                _render_query(
                    PREVIOUS_TOTAL_QUERY,
                    filter_clause=build_filter_clause(previous_params),
                )
            ),
            _sql_params(previous_params),
        )
        previous_total = int(previous_result.scalar() or 0)

    top_mitra_result = await session.execute(
        text(
            _render_query(
                TOP_GROUP_QUERY,
                marker="top_mitra",
                label_expression="coalesce(nullif(trim(t.mitra), ''), 'Unknown')",
                filter_clause=filter_clause,
            )
        ),
        sql_params,
    )
    top_mitra_row = _row_mapping(top_mitra_result)

    top_category_result = await session.execute(
        text(
            _render_query(
                TOP_GROUP_QUERY,
                marker="top_category",
                label_expression="t.category_label",
                filter_clause=filter_clause,
            )
        ),
        sql_params,
    )
    top_category_row = _row_mapping(top_category_result)

    vandalism_result = await session.execute(
        text(_render_query(VANDALISM_QUERY, filter_clause=filter_clause)),
        sql_params,
    )
    vandalism_tickets = int(vandalism_result.scalar() or 0)

    period = params.get("_period")
    is_daily = bool(period and period.month_count == 1)
    if not period and params.get("start_date") and params.get("end_date"):
        is_daily = (params["end_date"] - params["start_date"]).days < 32
    trend_granularity = "day" if is_daily else "month"
    trend_result = await session.execute(
        text(
            _render_query(
                TREND_QUERY,
                trend_unit=trend_granularity,
                label_format="DD Mon" if is_daily else "Mon YYYY",
                filter_clause=filter_clause,
            )
        ),
        sql_params,
    )
    trend = _mapping_rows(trend_result)

    cluster_result = await session.execute(
        text(
            _render_query(
                DISTRIBUTION_QUERY,
                marker="cluster_distribution",
                label_expression="coalesce(nullif(trim(t.cluster), ''), 'Unknown')",
                filter_clause=filter_clause,
            )
        ),
        sql_params,
    )
    mitra_result = await session.execute(
        text(
            _render_query(
                DISTRIBUTION_QUERY,
                marker="mitra_distribution",
                label_expression="coalesce(nullif(trim(t.mitra), ''), 'Unknown')",
                filter_clause=filter_clause,
            )
        ),
        sql_params,
    )

    delta = total_tickets - previous_total
    top_mitra_tickets = int(top_mitra_row.get("tickets") or 0)
    top_category_tickets = int(top_category_row.get("tickets") or 0)
    payload = TicketTotiDashboard(
        summary=TicketTotiSummary(
            total_tickets=total_tickets,
            total_tickets_period_delta=delta,
            total_tickets_period_rate=(
                round((delta / previous_total) * 100, 2) if previous_total else None
            ),
            top_mitra=TicketTotiTopItem(
                label=normalize_category_label(top_mitra_row.get("label")),
                tickets=top_mitra_tickets,
                share=_share(top_mitra_tickets, total_tickets),
            ),
            top_category=TicketTotiTopItem(
                label=normalize_category_label(top_category_row.get("label")),
                tickets=top_category_tickets,
                share=_share(top_category_tickets, total_tickets),
            ),
            vandalism_tickets=vandalism_tickets,
            vandalism_rate=_share(vandalism_tickets, total_tickets),
            last_updated_at=summary_row.get("last_updated_at"),
        ),
        trend_granularity=trend_granularity,
        trend=trend,
        cluster_distribution=compact_distribution(
            _mapping_rows(cluster_result),
            total_tickets=total_tickets,
        ),
        mitra_distribution=compact_distribution(
            _mapping_rows(mitra_result),
            total_tickets=total_tickets,
        ),
        period_meta=await ticket_toti_period_meta(session, params),
    )
    if cache_status == CACHE_MISS:
        await redis_cache.set_json(cache_key, payload.model_dump(mode="json"))
    return payload


@router.get("/tickets", response_model=TicketTotiTicketResponse)
async def list_ticket_toti_tickets(
    params: dict = Depends(shared_query_params),
    q: str | None = Query(None),
    page: int = Query(1, ge=1),
    limit: int = Query(DEFAULT_LIMIT, ge=1, le=100),
    session: AsyncSession = Depends(get_session),
):
    params = await _ensure_default_period(session, params)
    filter_clause = build_filter_clause(params)
    search_clause = ""
    sql_params = {
        **_sql_params(params),
        "limit": limit,
        "offset": (page - 1) * limit,
    }
    if q and q.strip():
        search_clause = """
        AND (
            t.id ILIKE :search
            OR t.siteid ILIKE :search
            OR t.sitename ILIKE :search
            OR t.permasalahan ILIKE :search
        )
        """
        sql_params["search"] = f"%{q.strip()}%"

    count_result = await session.execute(
        text(
            _render_query(
                TICKETS_COUNT_QUERY,
                filter_clause=filter_clause,
                search_clause=search_clause,
            )
        ),
        sql_params,
    )
    total = int(count_result.scalar() or 0)
    list_result = await session.execute(
        text(
            _render_query(
                TICKETS_LIST_QUERY,
                filter_clause=filter_clause,
                search_clause=search_clause,
            )
        ),
        sql_params,
    )
    return TicketTotiTicketResponse(
        items=_mapping_rows(list_result),
        total=total,
        page=page,
        limit=limit,
        total_pages=math.ceil(total / limit) if total else 0,
        period_meta=await ticket_toti_period_meta(session, params),
    )

"""
Activity ENOM router - endpoints for proker_enom_jatim_2026 dashboard.

GET /activity-enom/filters          - month, NOP, and category options
GET /activity-enom/summary          - KPI scorecards
GET /activity-enom/trend            - monthly status trend
GET /activity-enom/breakdowns       - NOP/kabupaten, ranking, category, status, week breakdowns
GET /activity-enom/top-activities   - top activity names
GET /activity-enom/activities       - sorted paginated activity table
GET /activity-enom/activities/{id}  - modal detail for one activity row
"""
from datetime import date
import math

from fastapi import APIRouter, Depends, HTTPException, Query
import runtime_compat  # noqa: F401
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_session
from models.activity_enom import (
    ActivityEnomActivityDetail,
    ActivityEnomActivityResponse,
    ActivityEnomActivityRow,
    ActivityEnomBreakdowns,
    ActivityEnomDistributionItem,
    ActivityEnomFilters,
    ActivityEnomMonthOption,
    ActivityEnomSummary,
    ActivityEnomTopActivity,
    ActivityEnomTrendItem,
    ActivityEnomYearOption,
)

router = APIRouter(prefix="/activity-enom", tags=["Activity ENOM"])
TABLE_NAME = "public.proker_enom_jatim_2026"
DEFAULT_LIMIT = 20
SORT_ORDER_TEMPLATE = "ORDER BY {sort_column} {sort_direction}, a.id DESC"


def build_filter_clause(
    params: dict,
    include_month: bool = True,
    include_year: bool = True,
    alias: str = "a",
) -> str:
    """Build shared Activity ENOM global filter clause."""
    clauses = []
    if include_month and params.get("month_date"):
        clauses.append("a.create_date = :month_date" if alias == "a" else f"{alias}.create_date = :month_date")
    if include_year and params.get("year"):
        clauses.append(
            f"EXTRACT(YEAR FROM {alias}.create_date) = :year"
            if alias != "a"
            else "EXTRACT(YEAR FROM a.create_date) = :year"
        )
    if params.get("nop"):
        clauses.append("a.nop = :nop" if alias == "a" else f"{alias}.nop = :nop")
    if params.get("category"):
        clauses.append("a.part = :category" if alias == "a" else f"{alias}.part = :category")
    return "".join(f" AND {clause}" for clause in clauses)


def build_search_clause(q: str | None, alias: str = "a") -> str:
    if not q:
        return ""
    return (
        " AND ("
        f"{alias}.site_id ILIKE :q OR "
        f"{alias}.site_name ILIKE :q OR "
        f"{alias}.activity ILIKE :q OR "
        f"{alias}.info ILIKE :q OR "
        f"{alias}.analisis ILIKE :q OR "
        f"{alias}.kabupaten ILIKE :q"
        ")"
    )


def base_params(
    month_date: date,
    year: int | None = None,
    nop: str | None = None,
    category: str | None = None,
) -> dict:
    return {"month_date": month_date, "year": year, "nop": nop, "category": category}


def int_value(value, fallback: int = 0) -> int:
    return int(value) if value is not None else fallback


def float_value(value, fallback: float = 0) -> float:
    return float(value) if value is not None else fallback


def distribution_item(row) -> ActivityEnomDistributionItem:
    return ActivityEnomDistributionItem(
        label=str(row.get("label") or "Unknown"),
        total=int_value(row.get("total")),
        open=int_value(row.get("open")),
        close=int_value(row.get("close")),
        sites=int_value(row.get("sites")),
        completion_rate=float_value(row.get("completion_rate")),
    )


def activity_row(row) -> ActivityEnomActivityRow:
    return ActivityEnomActivityRow(
        id=int_value(row.get("id")),
        source_row_number=int_value(row.get("source_row_number")),
        create_date=row.get("create_date"),
        bulan=int_value(row.get("bulan")),
        site_id=row.get("site_id"),
        site_name=row.get("site_name"),
        nop=row.get("nop"),
        kabupaten=row.get("kabupaten"),
        part=row.get("part"),
        activity=row.get("activity"),
        status=row.get("status"),
        week_done=row.get("week_done"),
        date_done=row.get("date_done"),
    )


FILTER_MONTHS_QUERY = f"""
SELECT
    create_date AS value,
    TO_CHAR(create_date, 'YYYY-MM-DD') AS label
FROM (
    SELECT DISTINCT create_date
    FROM {TABLE_NAME}
    WHERE create_date IS NOT NULL
) months
ORDER BY create_date DESC
"""

FILTER_OPTIONS_QUERY = f"""
SELECT
    MAX(create_date) AS default_month,
    EXTRACT(YEAR FROM MAX(create_date))::int AS default_year,
    ARRAY(
        SELECT DISTINCT EXTRACT(YEAR FROM create_date)::int
        FROM {TABLE_NAME}
        WHERE create_date IS NOT NULL
        ORDER BY 1 DESC
    ) AS years,
    ARRAY(
        SELECT DISTINCT NULLIF(TRIM(nop), '')
        FROM {TABLE_NAME}
        WHERE NULLIF(TRIM(nop), '') IS NOT NULL
        ORDER BY 1
    ) AS nops,
    ARRAY(
        SELECT DISTINCT NULLIF(TRIM(part), '')
        FROM {TABLE_NAME}
        WHERE NULLIF(TRIM(part), '') IS NOT NULL
        ORDER BY 1
    ) AS categories
FROM {TABLE_NAME}
"""

SUMMARY_QUERY = f"""
SELECT
    CAST(:month_date AS date) AS month_date,
    monthly.total_activity,
    monthly.impacted_sites,
    monthly.open_activity,
    monthly.close_activity,
    monthly.completion_rate,
    annual.annual_total_activity,
    annual.annual_open_activity,
    annual.annual_close_activity
FROM (
    SELECT
        COUNT(*) AS total_activity,
        COUNT(DISTINCT a.site_id) AS impacted_sites,
        COUNT(*) FILTER (WHERE UPPER(a.status) = 'OPEN') AS open_activity,
        COUNT(*) FILTER (WHERE UPPER(a.status) = 'CLOSE') AS close_activity,
        ROUND(
            100.0 * COUNT(*) FILTER (WHERE UPPER(a.status) = 'CLOSE') / NULLIF(COUNT(*), 0),
            2
        )::float AS completion_rate
    FROM {TABLE_NAME} a
    WHERE 1=1
    {{filter_clause}}
) monthly
CROSS JOIN (
    SELECT
        COUNT(*) FILTER (WHERE a.xcek IS NULL) AS annual_total_activity,
        COUNT(*) FILTER (WHERE a.xcek IS NULL AND UPPER(a.status) = 'OPEN') AS annual_open_activity,
        COUNT(*) FILTER (WHERE a.xcek IS NULL AND UPPER(a.status) = 'CLOSE') AS annual_close_activity
    FROM {TABLE_NAME} a
    WHERE 1=1
    {{annual_filter_clause}}
) annual
"""

TREND_QUERY = f"""
SELECT
    a.create_date,
    COUNT(*) AS total,
    COUNT(*) FILTER (WHERE UPPER(a.status) = 'OPEN') AS open,
    COUNT(*) FILTER (WHERE UPPER(a.status) = 'CLOSE') AS close,
    COUNT(DISTINCT a.site_id) AS sites
FROM {TABLE_NAME} a
WHERE 1=1
{{filter_clause}}
GROUP BY a.create_date
ORDER BY a.create_date
"""

CONTRIBUTION_QUERY = f"""
SELECT
    {{label_expr}} AS label,
    COUNT(*) AS total,
    COUNT(*) FILTER (WHERE UPPER(a.status) = 'OPEN') AS open,
    COUNT(*) FILTER (WHERE UPPER(a.status) = 'CLOSE') AS close,
    COUNT(DISTINCT a.site_id) AS sites
FROM {TABLE_NAME} a
WHERE 1=1
{{filter_clause}}
GROUP BY 1
ORDER BY total DESC, label
"""

RANKING_QUERY = f"""
SELECT
    {{label_expr}} AS label,
    COUNT(*) AS total,
    COUNT(*) FILTER (WHERE UPPER(a.status) = 'OPEN') AS open,
    COUNT(*) FILTER (WHERE UPPER(a.status) = 'CLOSE') AS close,
    COUNT(DISTINCT a.site_id) AS sites,
    COALESCE(
        ROUND(
            100.0 * COUNT(*) FILTER (WHERE UPPER(a.status) = 'CLOSE') / NULLIF(COUNT(*), 0),
            2
        ),
        0
    )::float AS completion_rate
FROM {TABLE_NAME} a
WHERE 1=1
{{filter_clause}}
GROUP BY 1
ORDER BY completion_rate DESC, close DESC, total DESC, label
LIMIT 12
"""

CATEGORY_DISTRIBUTION_QUERY = f"""
SELECT
    COALESCE(NULLIF(TRIM(a.part), ''), 'Unknown') AS label,
    COUNT(*) AS total,
    COUNT(*) FILTER (WHERE UPPER(a.status) = 'OPEN') AS open,
    COUNT(*) FILTER (WHERE UPPER(a.status) = 'CLOSE') AS close,
    COUNT(DISTINCT a.site_id) AS sites
FROM {TABLE_NAME} a
WHERE 1=1
{{filter_clause}}
GROUP BY 1
ORDER BY total DESC, label
"""

STATUS_DISTRIBUTION_QUERY = f"""
SELECT
    COALESCE(NULLIF(TRIM(a.status), ''), 'Unknown') AS label,
    COUNT(*) AS total,
    COUNT(*) FILTER (WHERE UPPER(a.status) = 'OPEN') AS open,
    COUNT(*) FILTER (WHERE UPPER(a.status) = 'CLOSE') AS close,
    COUNT(DISTINCT a.site_id) AS sites
FROM {TABLE_NAME} a
WHERE 1=1
{{filter_clause}}
GROUP BY 1
ORDER BY total DESC, label
"""

WEEK_DONE_DISTRIBUTION_QUERY = f"""
SELECT
    COALESCE(a.week_done::text, 'Not Scheduled') AS label,
    COUNT(*) AS total,
    COUNT(*) FILTER (WHERE UPPER(a.status) = 'OPEN') AS open,
    COUNT(*) FILTER (WHERE UPPER(a.status) = 'CLOSE') AS close,
    COUNT(DISTINCT a.site_id) AS sites
FROM {TABLE_NAME} a
WHERE 1=1
{{filter_clause}}
GROUP BY a.week_done
ORDER BY CASE WHEN a.week_done IS NULL THEN 999 ELSE a.week_done END
"""

TOP_ACTIVITIES_QUERY = f"""
SELECT
    COALESCE(NULLIF(TRIM(a.activity), ''), 'Unknown') AS activity,
    COUNT(*) AS total,
    COUNT(*) FILTER (WHERE UPPER(a.status) = 'OPEN') AS open,
    COUNT(*) FILTER (WHERE UPPER(a.status) = 'CLOSE') AS close,
    COUNT(DISTINCT a.site_id) AS sites
FROM {TABLE_NAME} a
WHERE 1=1
{{filter_clause}}
GROUP BY 1
ORDER BY total DESC, sites DESC, activity
LIMIT :limit
"""

ACTIVITIES_COUNT_QUERY = f"""
SELECT COUNT(*)
FROM {TABLE_NAME} a
WHERE 1=1
{{filter_clause}}
{{search_clause}}
"""

ACTIVITIES_LIST_QUERY = f"""
SELECT
    a.id,
    a.source_row_number,
    a.create_date,
    a.bulan,
    a.site_id,
    a.site_name,
    a.nop,
    a.kabupaten,
    a.part,
    a.activity,
    a.status,
    a.week_done,
    a.date_done
FROM {TABLE_NAME} a
WHERE 1=1
{{filter_clause}}
{{search_clause}}
{{status_clause}}
{SORT_ORDER_TEMPLATE}
LIMIT :limit OFFSET :offset
"""

ACTIVITY_DETAIL_QUERY = f"""
SELECT
    a.id,
    a.source_row_number,
    a.create_date,
    a.bulan,
    a.baseline_activity,
    a.nop,
    a.site_id,
    a.site_name,
    a.kabupaten,
    a.part,
    a.activity,
    a.info,
    a.analisis,
    a.week_done,
    a.status,
    a.date_done,
    a.remark_1,
    a.remark_2,
    a.milestone,
    a.xcek,
    a.workshop,
    a.target_workshop,
    a.source_row_hash,
    a.imported_at,
    a.updated_at
FROM {TABLE_NAME} a
WHERE a.id = :activity_id
{{filter_clause}}
"""


async def fetch_distribution(
    session: AsyncSession,
    query: str,
    params: dict,
    filter_clause: str,
    **format_values,
) -> list[ActivityEnomDistributionItem]:
    result = await session.execute(
        text(query.format(filter_clause=filter_clause, **format_values)),
        params,
    )
    return [distribution_item(row) for row in result.mappings().all()]


@router.get("/filters", response_model=ActivityEnomFilters)
async def get_activity_enom_filters(session: AsyncSession = Depends(get_session)):
    months_result = await session.execute(text(FILTER_MONTHS_QUERY))
    option_result = await session.execute(text(FILTER_OPTIONS_QUERY))
    option_row = option_result.mappings().first() or {}
    return ActivityEnomFilters(
        years=[
            ActivityEnomYearOption(value=int(year), label=str(year))
            for year in (option_row.get("years") or [])
            if year is not None
        ],
        months=[ActivityEnomMonthOption(**dict(row)) for row in months_result.mappings().all()],
        nops=option_row.get("nops") or [],
        categories=option_row.get("categories") or [],
        default_year=option_row.get("default_year"),
        default_month=option_row.get("default_month"),
    )


@router.get("/summary", response_model=ActivityEnomSummary)
async def get_activity_enom_summary(
    month_date: date = Query(...),
    year: int | None = Query(None),
    nop: str | None = Query(None),
    category: str | None = Query(None),
    session: AsyncSession = Depends(get_session),
):
    params = base_params(month_date, year, nop, category)
    annual_filter_clause = build_filter_clause(params, include_month=False, include_year=True)
    result = await session.execute(
        text(SUMMARY_QUERY.format(
            filter_clause=build_filter_clause(params),
            annual_filter_clause=annual_filter_clause,
        )),
        params,
    )
    row = result.mappings().first() or {}
    return ActivityEnomSummary(
        month_date=month_date,
        annual_total_activity=int_value(row.get("annual_total_activity")),
        annual_open_activity=int_value(row.get("annual_open_activity")),
        annual_close_activity=int_value(row.get("annual_close_activity")),
        total_activity=int_value(row.get("total_activity")),
        impacted_sites=int_value(row.get("impacted_sites")),
        open_activity=int_value(row.get("open_activity")),
        close_activity=int_value(row.get("close_activity")),
        completion_rate=float_value(row.get("completion_rate")),
    )


@router.get("/trend", response_model=list[ActivityEnomTrendItem])
async def get_activity_enom_trend(
    month_date: date = Query(...),
    year: int | None = Query(None),
    nop: str | None = Query(None),
    category: str | None = Query(None),
    session: AsyncSession = Depends(get_session),
):
    params = base_params(month_date, year, nop, category)
    result = await session.execute(
        text(TREND_QUERY.format(filter_clause=build_filter_clause(params, include_month=False))),
        params,
    )
    return [ActivityEnomTrendItem(**dict(row)) for row in result.mappings().all()]


@router.get("/breakdowns", response_model=ActivityEnomBreakdowns)
async def get_activity_enom_breakdowns(
    month_date: date = Query(...),
    year: int | None = Query(None),
    nop: str | None = Query(None),
    category: str | None = Query(None),
    session: AsyncSession = Depends(get_session),
):
    params = base_params(month_date, year, nop, category)
    filter_clause = build_filter_clause(params)
    selected_nop_breakdown = bool(params.get("nop"))
    label_expr = (
        "COALESCE(NULLIF(TRIM(a.kabupaten), ''), 'Unknown')"
        if selected_nop_breakdown
        else "COALESCE(NULLIF(TRIM(a.nop), ''), 'Unknown')"
    )
    breakdown_title="NOP Contribution"
    ranking_title="Ranking NOP"
    if selected_nop_breakdown:
        breakdown_title="Kabupaten Contribution"
        ranking_title="Ranking Kabupaten"

    return ActivityEnomBreakdowns(
        breakdown_title=breakdown_title,
        ranking_title=ranking_title,
        contribution=await fetch_distribution(
            session,
            CONTRIBUTION_QUERY,
            params,
            filter_clause,
            label_expr=label_expr,
        ),
        ranking=await fetch_distribution(
            session,
            RANKING_QUERY,
            params,
            filter_clause,
            label_expr=label_expr,
        ),
        by_category=await fetch_distribution(session, CATEGORY_DISTRIBUTION_QUERY, params, filter_clause),
        by_status=await fetch_distribution(session, STATUS_DISTRIBUTION_QUERY, params, filter_clause),
        by_week_done=await fetch_distribution(session, WEEK_DONE_DISTRIBUTION_QUERY, params, filter_clause),
    )


@router.get("/top-activities", response_model=list[ActivityEnomTopActivity])
async def get_activity_enom_top_activities(
    month_date: date = Query(...),
    year: int | None = Query(None),
    nop: str | None = Query(None),
    category: str | None = Query(None),
    limit: int = Query(10, ge=1, le=50),
    session: AsyncSession = Depends(get_session),
):
    params = {**base_params(month_date, year, nop, category), "limit": limit}
    result = await session.execute(
        text(TOP_ACTIVITIES_QUERY.format(filter_clause=build_filter_clause(params))),
        params,
    )
    return [ActivityEnomTopActivity(**dict(row)) for row in result.mappings().all()]


@router.get("/activities", response_model=ActivityEnomActivityResponse)
async def list_activity_enom_activities(
    month_date: date = Query(...),
    year: int | None = Query(None),
    nop: str | None = Query(None),
    category: str | None = Query(None),
    status: str | None = Query(None),
    q: str | None = Query(None),
    page: int = Query(1, ge=1),
    limit: int = Query(DEFAULT_LIMIT, ge=1, le=100),
    sort_by: str = Query("create_date"),
    sort_dir: str = Query("desc"),
    session: AsyncSession = Depends(get_session),
):
    params = {
        **base_params(month_date, year, nop, category),
        "q": f"%{q.strip()}%" if q and q.strip() else None,
        "status": status,
        "limit": limit,
        "offset": (page - 1) * limit,
    }
    filter_clause = build_filter_clause(params)
    search_clause = build_search_clause(q)
    status_clause = " AND UPPER(a.status) = UPPER(:status)" if status else ""
    sort_map = {
        "create_date": "a.create_date",
        "site_id": "a.site_id",
        "site_name": "a.site_name",
        "nop": "a.nop",
        "kabupaten": "a.kabupaten",
        "part": "a.part",
        "activity": "a.activity",
        "status": "a.status",
        "week_done": "a.week_done",
        "date_done": "a.date_done",
    }
    sort_column = sort_map.get(sort_by, "a.create_date")
    sort_direction = "ASC" if sort_dir.lower() == "asc" else "DESC"

    total = await session.scalar(
        text(ACTIVITIES_COUNT_QUERY.format(filter_clause=filter_clause, search_clause=search_clause + status_clause)),
        params,
    )
    result = await session.execute(
        text(ACTIVITIES_LIST_QUERY.format(
            filter_clause=filter_clause,
            search_clause=search_clause,
            status_clause=status_clause,
            sort_column=sort_column,
            sort_direction=sort_direction,
        )),
        params,
    )
    return ActivityEnomActivityResponse(
        items=[activity_row(row) for row in result.mappings().all()],
        total=int_value(total),
        page=page,
        limit=limit,
        total_pages=math.ceil((total or 0) / limit) if limit else 0,
    )


@router.get("/activities/{activity_id}", response_model=ActivityEnomActivityDetail)
async def get_activity_enom_activity_detail(
    activity_id: int,
    month_date: date = Query(...),
    year: int | None = Query(None),
    nop: str | None = Query(None),
    category: str | None = Query(None),
    session: AsyncSession = Depends(get_session),
):
    params = {**base_params(month_date, year, nop, category), "activity_id": activity_id}
    result = await session.execute(
        text(ACTIVITY_DETAIL_QUERY.format(filter_clause=build_filter_clause(params))),
        params,
    )
    row = result.mappings().first()
    if not row:
        raise HTTPException(status_code=404, detail="Activity ENOM row not found")

    data = dict(row)
    base = activity_row(data).model_dump()
    return ActivityEnomActivityDetail(
        **base,
        baseline_activity=data.get("baseline_activity"),
        info=data.get("info"),
        analisis=data.get("analisis"),
        remark_1=data.get("remark_1"),
        remark_2=data.get("remark_2"),
        milestone=data.get("milestone"),
        xcek=data.get("xcek"),
        workshop=data.get("workshop"),
        target_workshop=data.get("target_workshop"),
        source_row_hash=data.get("source_row_hash"),
        imported_at=data.get("imported_at"),
        updated_at=data.get("updated_at"),
    )

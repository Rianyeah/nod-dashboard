"""
Impact Service router - endpoints for alarm_impact_service operational dashboard.

GET /impact-service/filters       - date bounds and NOP options
GET /impact-service/summary       - KPI scorecards
GET /impact-service/daily-trend   - daily status trend
GET /impact-service/last-7-days-trend - latest seven daily status points
GET /impact-service/distributions - chart distribution groups
GET /impact-service/top-alarms    - top alarm names
GET /impact-service/top-sites     - top impacted sites
GET /impact-service/alarms        - paginated alarm detail table
GET /impact-service/alarms/{id}   - modal detail for one alarm
"""
from datetime import date, datetime, timedelta, timezone
import math

from fastapi import APIRouter, Depends, HTTPException, Query
import runtime_compat  # noqa: F401
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_session
from models.impact_service import (
    ImpactServiceAlarmDetail,
    ImpactServiceAlarmListItem,
    ImpactServiceAlarmListResponse,
    ImpactServiceDailyTrendItem,
    ImpactServiceDistributionItem,
    ImpactServiceDistributions,
    ImpactServiceFilters,
    ImpactServiceSummary,
    ImpactServiceTopAlarm,
    ImpactServiceTopSite,
)

router = APIRouter(prefix="/impact-service", tags=["Impact Service"])
JAKARTA_TZ = timezone(timedelta(hours=7))


def get_jakarta_today() -> date:
    return datetime.now(JAKARTA_TZ).date()


def build_nop_filter(nop: str | None, alias: str = "a") -> str:
    """Build optional NOP filter for alarm_impact_service aliases."""
    if not nop:
        return ""
    return f" AND {alias}.nop = :nop"


def build_optional_filters(
    status: str | None = None,
    severity: str | None = None,
    q: str | None = None,
    alias: str = "a",
) -> str:
    filters = []
    if status:
        filters.append(f"UPPER({alias}.status) = UPPER(:status)")
    if severity:
        filters.append(f"{alias}.severity = :severity")
    if q:
        filters.append(
            "("
            f"{alias}.site_id ILIKE :q OR "
            f"{alias}.site_name ILIKE :q OR "
            f"{alias}.alarm_name ILIKE :q OR "
            f"{alias}.comment ILIKE :q"
            ")"
        )
    return "".join(f" AND {part}" for part in filters)


FILTERS_QUERY = """
SELECT
    MIN(tanggal) AS min_date,
    MAX(tanggal) AS max_date,
    CAST(:today AS date) AS today,
    (COUNT(*) FILTER (WHERE tanggal = CAST(:today AS date)) > 0) AS has_today_data,
    CASE
        WHEN COUNT(*) FILTER (WHERE tanggal = CAST(:today AS date)) > 0 THEN CAST(:today AS date)
        ELSE MAX(tanggal)
    END AS default_date
FROM alarm_impact_service
"""

FILTER_NOPS_QUERY = """
SELECT DISTINCT TRIM(nop) AS nop
FROM alarm_impact_service
WHERE nop IS NOT NULL AND NULLIF(TRIM(nop), '') IS NOT NULL
ORDER BY nop
"""

SUMMARY_QUERY = """
SELECT
    COUNT(*) AS total_alarms,
    COUNT(DISTINCT site_id) AS impacted_sites,
    COUNT(*) FILTER (WHERE UPPER(status) = 'OPEN') AS open_alarms,
    COUNT(*) FILTER (WHERE UPPER(status) = 'CLEAR') AS clear_alarms,
    COUNT(*) FILTER (WHERE UPPER(sow) = 'TSEL') AS sow_tsel
FROM alarm_impact_service a
WHERE a.tanggal between :start_date and :end_date
{nop_filter}
"""

DAILY_TREND_QUERY = """
SELECT
    a.tanggal,
    COUNT(*) AS total,
    COUNT(*) FILTER (WHERE UPPER(a.status) = 'OPEN') AS open,
    COUNT(*) FILTER (WHERE UPPER(a.status) = 'CLEAR') AS clear
FROM alarm_impact_service a
WHERE a.tanggal between :start_date and :end_date
{nop_filter}
GROUP BY a.tanggal
ORDER BY a.tanggal
"""

LATEST_IMPACT_WINDOW_QUERY = """
SELECT
    (MAX(tanggal) - INTERVAL '6 days')::date AS latest_impact_start_date,
    MAX(tanggal) AS latest_impact_end_date
FROM alarm_impact_service a
WHERE 1=1
{nop_filter}
"""

SEVERITY_DISTRIBUTION_QUERY = """
WITH grouped AS (
SELECT
    COALESCE(NULLIF(TRIM(a.severity), ''), 'Unknown') AS label,
    COUNT(*) AS total,
    COUNT(*) FILTER (WHERE UPPER(a.status) = 'OPEN') AS open,
    COUNT(*) FILTER (WHERE UPPER(a.status) = 'CLEAR') AS clear
FROM alarm_impact_service a
WHERE a.tanggal between :start_date and :end_date
{nop_filter}
GROUP BY 1
)
SELECT label, total, open, clear
FROM grouped
ORDER BY CASE label
    WHEN 'Critical' THEN 1
    WHEN 'Major' THEN 2
    WHEN 'Minor' THEN 3
    WHEN 'Warning' THEN 4
    ELSE 5
END, label
"""

CATEGORY_DISTRIBUTION_QUERY = """
WITH grouped AS (
SELECT
    COALESCE(NULLIF(TRIM(a.category), ''), 'Unknown') AS label,
    COUNT(*) AS total,
    COUNT(*) FILTER (WHERE UPPER(a.status) = 'OPEN') AS open,
    COUNT(*) FILTER (WHERE UPPER(a.status) = 'CLEAR') AS clear
FROM alarm_impact_service a
WHERE a.tanggal between :start_date and :end_date
{nop_filter}
GROUP BY 1
)
SELECT label, total, open, clear
FROM grouped
ORDER BY total DESC, label
"""

AGING_RANGE_DISTRIBUTION_QUERY = """
WITH grouped AS (
SELECT
    COALESCE(NULLIF(TRIM(a.aging_range), ''), 'Unknown') AS label,
    COUNT(*) AS total,
    COUNT(*) FILTER (WHERE UPPER(a.status) = 'OPEN') AS open,
    COUNT(*) FILTER (WHERE UPPER(a.status) = 'CLEAR') AS clear
FROM alarm_impact_service a
WHERE a.tanggal between :start_date and :end_date
{nop_filter}
GROUP BY 1
)
SELECT label, total, open, clear
FROM grouped
ORDER BY CASE label
    WHEN '0-1 days' THEN 1
    WHEN '2-5 days' THEN 2
    WHEN '6-10 days' THEN 3
    WHEN '>10 days' THEN 4
    ELSE 5
END, label
"""

SOW_DISTRIBUTION_QUERY = """
WITH grouped AS (
SELECT
    COALESCE(NULLIF(TRIM(a.sow), ''), 'Unknown') AS label,
    COUNT(*) AS total,
    COUNT(*) FILTER (WHERE UPPER(a.status) = 'OPEN') AS open,
    COUNT(*) FILTER (WHERE UPPER(a.status) = 'CLEAR') AS clear
FROM alarm_impact_service a
WHERE a.tanggal between :start_date and :end_date
{nop_filter}
GROUP BY 1
)
SELECT label, total, open, clear
FROM grouped
ORDER BY total DESC, label
"""

NOP_DISTRIBUTION_QUERY = """
WITH grouped AS (
SELECT
    COALESCE(NULLIF(TRIM(a.nop), ''), 'Unknown') AS label,
    COUNT(*) AS total,
    COUNT(*) FILTER (WHERE UPPER(a.status) = 'OPEN') AS open,
    COUNT(*) FILTER (WHERE UPPER(a.status) = 'CLEAR') AS clear
FROM alarm_impact_service a
WHERE a.tanggal between :start_date and :end_date
{nop_filter}
GROUP BY 1
)
SELECT label, total, open, clear
FROM grouped
ORDER BY total DESC, label
"""

TOP_ALARMS_QUERY = """
SELECT
    COALESCE(NULLIF(TRIM(a.alarm_name), ''), 'Unknown') AS alarm_name,
    COUNT(*) AS total,
    COUNT(DISTINCT a.site_id) AS impacted_sites,
    COUNT(*) FILTER (WHERE UPPER(a.status) = 'OPEN') AS open,
    COUNT(*) FILTER (WHERE UPPER(a.status) = 'CLEAR') AS clear
FROM alarm_impact_service a
WHERE a.tanggal between :start_date and :end_date
{nop_filter}
GROUP BY 1
ORDER BY total DESC, impacted_sites DESC, alarm_name
LIMIT :limit
"""

TOP_SITES_QUERY = """
SELECT
    a.site_id,
    MAX(a.site_name) AS site_name,
    MAX(a.nop) AS nop,
    COUNT(*) AS total,
    COUNT(*) FILTER (WHERE UPPER(a.status) = 'OPEN') AS open,
    COUNT(*) FILTER (WHERE UPPER(a.status) = 'CLEAR') AS clear,
    COUNT(*) FILTER (WHERE a.severity = 'Critical') AS critical,
    MAX(a.aging) AS max_aging
FROM alarm_impact_service a
WHERE a.tanggal between :start_date and :end_date
{nop_filter}
  AND a.site_id IS NOT NULL
GROUP BY a.site_id
ORDER BY total DESC, critical DESC, a.site_id
LIMIT :limit
"""

ALARMS_COUNT_QUERY = """
SELECT COUNT(*) AS total
FROM alarm_impact_service a
WHERE a.tanggal between :start_date and :end_date
{nop_filter}
{extra_filter}
"""

ALARMS_LIST_QUERY = """
SELECT
    a.id,
    a.tanggal,
    a.site_id,
    a.site_name,
    a.nop,
    a.alarm_name,
    a.category,
    a.severity,
    a.aging,
    a.aging_range,
    a.status,
    a.sow,
    a.comment
FROM alarm_impact_service a
WHERE a.tanggal between :start_date and :end_date
{nop_filter}
{extra_filter}
ORDER BY a.tanggal DESC, a.id DESC
LIMIT :limit OFFSET :offset
"""

ALARM_DETAIL_QUERY = """
SELECT
    a.id,
    a.tanggal,
    a.week,
    a.location_information,
    a.mo_name,
    a.site_id,
    a.site_name,
    a.nop,
    a.tp,
    a.alarm_id,
    a.alarm_name,
    a.alarm_type,
    a.category,
    a.severity,
    a.last_occurred_nt,
    a.aging,
    a.aging_range,
    a.avail_1w,
    a.rhi_2w,
    a.priority,
    a.remarks,
    a.remarks2,
    a.sow,
    a.status,
    a.status_site_x,
    a.comment,
    a.plan_action,
    a.date_cleared,
    a.ticket_no,
    a.root_cause_analyst,
    a.pic_officer,
    a.pic_onsite,
    a.carrier,
    a.poi_rafi,
    a.carrier_2,
    a.count_site,
    a.dash,
    a.longitude,
    a.latitude,
    a.sore,
    a.poi
FROM alarm_impact_service a
WHERE a.tanggal between :start_date and :end_date
{nop_filter}
  AND a.id = :alarm_id
LIMIT 1
"""


def base_params(start_date: date, end_date: date, nop: str | None = None) -> dict:
    return {"start_date": start_date, "end_date": end_date, "nop": nop}


def previous_equal_period(start_date: date, end_date: date) -> tuple[date, date]:
    """Return the equal-length period immediately before the active range."""
    range_days = (end_date - start_date).days + 1
    previous_end_date = start_date - timedelta(days=1)
    previous_start_date = previous_end_date - timedelta(days=range_days - 1)
    return previous_start_date, previous_end_date


def int_value(value, fallback: int = 0) -> int:
    return int(value) if value is not None else fallback


def distribution_item(row) -> ImpactServiceDistributionItem:
    return ImpactServiceDistributionItem(
        label=str(row.get("label") or "Unknown"),
        total=int_value(row.get("total")),
        open=int_value(row.get("open")),
        clear=int_value(row.get("clear")),
    )


def alarm_list_item(row) -> ImpactServiceAlarmListItem:
    return ImpactServiceAlarmListItem(
        id=int_value(row.get("id")),
        tanggal=row.get("tanggal"),
        site_id=row.get("site_id"),
        site_name=row.get("site_name"),
        nop=row.get("nop"),
        alarm_name=row.get("alarm_name"),
        category=row.get("category"),
        severity=row.get("severity"),
        aging=row.get("aging"),
        aging_range=row.get("aging_range"),
        status=row.get("status"),
        sow=row.get("sow"),
        comment=row.get("comment"),
    )


@router.get("/filters", response_model=ImpactServiceFilters)
async def get_impact_service_filters(
    session: AsyncSession = Depends(get_session),
):
    """Date bounds and NOP options for Impact Service filters."""
    date_result = await session.execute(text(FILTERS_QUERY), {"today": get_jakarta_today()})
    date_row = date_result.mappings().first()
    nop_result = await session.execute(text(FILTER_NOPS_QUERY))
    nop_rows = nop_result.mappings().all()

    return ImpactServiceFilters(
        min_date=date_row.get("min_date") if date_row else None,
        max_date=date_row.get("max_date") if date_row else None,
        today=date_row.get("today") if date_row else None,
        default_date=date_row.get("default_date") if date_row else None,
        has_today_data=bool(date_row.get("has_today_data")) if date_row else False,
        nops=[row["nop"] for row in nop_rows if row.get("nop")],
    )


@router.get("/summary", response_model=ImpactServiceSummary)
async def get_impact_service_summary(
    start_date: date = Query(...),
    end_date: date = Query(...),
    nop: str | None = Query(None),
    session: AsyncSession = Depends(get_session),
):
    """Scorecard KPIs for Impact Service alarms."""
    previous_start_date, previous_end_date = previous_equal_period(start_date, end_date)
    nop_filter = build_nop_filter(nop)
    result = await session.execute(
        text(SUMMARY_QUERY.format(nop_filter=nop_filter)),
        base_params(start_date, end_date, nop),
    )
    previous_result = await session.execute(
        text(SUMMARY_QUERY.format(nop_filter=nop_filter)),
        base_params(previous_start_date, previous_end_date, nop),
    )
    row = result.mappings().first() or {}
    previous_row = previous_result.mappings().first() or {}
    return ImpactServiceSummary(
        total_alarms=int_value(row.get("total_alarms")),
        impacted_sites=int_value(row.get("impacted_sites")),
        open_alarms=int_value(row.get("open_alarms")),
        clear_alarms=int_value(row.get("clear_alarms")),
        sow_tsel=int_value(row.get("sow_tsel")),
        previous_total_alarms=int_value(previous_row.get("total_alarms")),
        previous_impacted_sites=int_value(previous_row.get("impacted_sites")),
        previous_open_alarms=int_value(previous_row.get("open_alarms")),
        previous_clear_alarms=int_value(previous_row.get("clear_alarms")),
        previous_sow_tsel=int_value(previous_row.get("sow_tsel")),
    )


@router.get("/daily-trend", response_model=list[ImpactServiceDailyTrendItem])
async def get_impact_service_daily_trend(
    start_date: date = Query(...),
    end_date: date = Query(...),
    nop: str | None = Query(None),
    session: AsyncSession = Depends(get_session),
):
    """Daily alarm counts split by OPEN and CLEAR."""
    result = await session.execute(
        text(DAILY_TREND_QUERY.format(nop_filter=build_nop_filter(nop))),
        base_params(start_date, end_date, nop),
    )
    return [
        ImpactServiceDailyTrendItem(
            tanggal=row["tanggal"],
            total=int_value(row.get("total")),
            open=int_value(row.get("open")),
            clear=int_value(row.get("clear")),
        )
        for row in result.mappings().all()
    ]


async def get_impact_service_latest_window(
    session: AsyncSession,
    nop: str | None = None,
) -> tuple[date | None, date | None]:
    """Resolve the latest 7-day Impact Service window for the active NOP."""
    result = await session.execute(
        text(LATEST_IMPACT_WINDOW_QUERY.format(nop_filter=build_nop_filter(nop))),
        {"nop": nop},
    )
    row = result.mappings().first() or {}
    return row.get("latest_impact_start_date"), row.get("latest_impact_end_date")


async def load_impact_service_last_7_days_trend(
    session: AsyncSession,
    nop: str | None = None,
) -> list[ImpactServiceDailyTrendItem]:
    window_start, window_end = await get_impact_service_latest_window(session, nop)
    if not window_start or not window_end:
        return []

    result = await session.execute(
        text(DAILY_TREND_QUERY.format(nop_filter=build_nop_filter(nop))),
        {"start_date": window_start, "end_date": window_end, "nop": nop},
    )
    return [
        ImpactServiceDailyTrendItem(
            tanggal=row["tanggal"],
            total=int_value(row.get("total")),
            open=int_value(row.get("open")),
            clear=int_value(row.get("clear")),
        )
        for row in result.mappings().all()
    ]


@router.get("/last-7-days-trend", response_model=list[ImpactServiceDailyTrendItem])
async def get_impact_service_last_7_days_trend(
    nop: str | None = Query(None),
    session: AsyncSession = Depends(get_session),
):
    """Latest seven daily alarm counts split by OPEN and CLEAR."""
    return await load_impact_service_last_7_days_trend(session=session, nop=nop)


@router.get("/distributions", response_model=ImpactServiceDistributions)
async def get_impact_service_distributions(
    start_date: date = Query(...),
    end_date: date = Query(...),
    nop: str | None = Query(None),
    session: AsyncSession = Depends(get_session),
):
    """Chart distribution groups for Impact Service alarms."""
    params = base_params(start_date, end_date, nop)
    nop_filter = build_nop_filter(nop)

    async def fetch_distribution(query: str) -> list[ImpactServiceDistributionItem]:
        result = await session.execute(text(query.format(nop_filter=nop_filter)), params)
        return [distribution_item(row) for row in result.mappings().all()]

    return ImpactServiceDistributions(
        by_severity=await fetch_distribution(SEVERITY_DISTRIBUTION_QUERY),
        by_category=await fetch_distribution(CATEGORY_DISTRIBUTION_QUERY),
        by_aging_range=await fetch_distribution(AGING_RANGE_DISTRIBUTION_QUERY),
        by_sow=await fetch_distribution(SOW_DISTRIBUTION_QUERY),
        by_nop=await fetch_distribution(NOP_DISTRIBUTION_QUERY),
    )


@router.get("/top-alarms", response_model=list[ImpactServiceTopAlarm])
async def get_impact_service_top_alarms(
    start_date: date = Query(...),
    end_date: date = Query(...),
    nop: str | None = Query(None),
    limit: int = Query(10, ge=1, le=50),
    session: AsyncSession = Depends(get_session),
):
    """Top alarm names by volume."""
    params = {**base_params(start_date, end_date, nop), "limit": limit}
    result = await session.execute(
        text(TOP_ALARMS_QUERY.format(nop_filter=build_nop_filter(nop))),
        params,
    )
    return [
        ImpactServiceTopAlarm(
            alarm_name=row.get("alarm_name") or "Unknown",
            total=int_value(row.get("total")),
            impacted_sites=int_value(row.get("impacted_sites")),
            open=int_value(row.get("open")),
            clear=int_value(row.get("clear")),
        )
        for row in result.mappings().all()
    ]


@router.get("/top-sites", response_model=list[ImpactServiceTopSite])
async def get_impact_service_top_sites(
    start_date: date = Query(...),
    end_date: date = Query(...),
    nop: str | None = Query(None),
    limit: int = Query(10, ge=1, le=50),
    session: AsyncSession = Depends(get_session),
):
    """Top impacted sites by alarm volume."""
    params = {**base_params(start_date, end_date, nop), "limit": limit}
    result = await session.execute(
        text(TOP_SITES_QUERY.format(nop_filter=build_nop_filter(nop))),
        params,
    )
    return [
        ImpactServiceTopSite(
            site_id=row.get("site_id"),
            site_name=row.get("site_name"),
            nop=row.get("nop"),
            total=int_value(row.get("total")),
            open=int_value(row.get("open")),
            clear=int_value(row.get("clear")),
            critical=int_value(row.get("critical")),
            max_aging=row.get("max_aging"),
        )
        for row in result.mappings().all()
    ]


@router.get("/alarms", response_model=ImpactServiceAlarmListResponse)
async def list_impact_service_alarms(
    start_date: date = Query(...),
    end_date: date = Query(...),
    nop: str | None = Query(None),
    status: str | None = Query(None),
    severity: str | None = Query(None),
    q: str | None = Query(None),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    session: AsyncSession = Depends(get_session),
):
    """Paginated Impact Service alarm detail table."""
    offset = (page - 1) * limit
    params = {
        **base_params(start_date, end_date, nop),
        "status": status,
        "severity": severity,
        "q": f"%{q}%" if q else None,
        "limit": limit,
        "offset": offset,
    }
    nop_filter = build_nop_filter(nop)
    extra_filter = build_optional_filters(status=status, severity=severity, q=q)

    count_result = await session.execute(
        text(ALARMS_COUNT_QUERY.format(nop_filter=nop_filter, extra_filter=extra_filter)),
        params,
    )
    total = int_value(count_result.scalar())

    list_result = await session.execute(
        text(ALARMS_LIST_QUERY.format(nop_filter=nop_filter, extra_filter=extra_filter)),
        params,
    )

    return ImpactServiceAlarmListResponse(
        items=[alarm_list_item(row) for row in list_result.mappings().all()],
        total=total,
        page=page,
        limit=limit,
        total_pages=math.ceil(total / limit) if total else 0,
    )


@router.get("/alarms/{alarm_id}", response_model=ImpactServiceAlarmDetail)
async def get_impact_service_alarm_detail(
    alarm_id: int,
    start_date: date = Query(...),
    end_date: date = Query(...),
    nop: str | None = Query(None),
    session: AsyncSession = Depends(get_session),
):
    """Modal detail for one alarm constrained by active page filters."""
    params = {**base_params(start_date, end_date, nop), "alarm_id": alarm_id}
    result = await session.execute(
        text(ALARM_DETAIL_QUERY.format(nop_filter=build_nop_filter(nop))),
        params,
    )
    row = result.mappings().first()
    if not row:
        raise HTTPException(status_code=404, detail="Impact Service alarm not found")

    base = alarm_list_item(row).model_dump()
    return ImpactServiceAlarmDetail(
        **base,
        week=row.get("week"),
        location_information=row.get("location_information"),
        mo_name=row.get("mo_name"),
        tp=row.get("tp"),
        alarm_id=row.get("alarm_id"),
        alarm_type=row.get("alarm_type"),
        last_occurred_nt=row.get("last_occurred_nt"),
        avail_1w=row.get("avail_1w"),
        rhi_2w=row.get("rhi_2w"),
        priority=row.get("priority"),
        remarks=row.get("remarks"),
        remarks2=row.get("remarks2"),
        status_site_x=row.get("status_site_x"),
        ticket_no=row.get("ticket_no"),
        plan_action=row.get("plan_action"),
        pic_officer=row.get("pic_officer"),
        date_cleared=row.get("date_cleared"),
        root_cause_analyst=row.get("root_cause_analyst"),
        pic_onsite=row.get("pic_onsite"),
        carrier=row.get("carrier"),
        poi_rafi=row.get("poi_rafi"),
        carrier_2=row.get("carrier_2"),
        count_site=row.get("count_site"),
        dash=row.get("dash"),
        longitude=row.get("longitude"),
        latitude=row.get("latitude"),
        sore=row.get("sore"),
        poi=row.get("poi"),
    )

"""
Data Potensi router — endpoints for the Data Potensi page.
Surfaces site infrastructure data from data_site_master.

GET /data-potensi/dashboard  — Scorecard + chart breakdowns
GET /data-potensi/sites      — Paginated site detail table
"""
from collections import defaultdict
import math
from typing import Literal

from fastapi import APIRouter, Depends, Query, Response
import runtime_compat  # noqa: F401
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text

from cache import redis_cache
from database import get_session
from models.data_potensi import (
    DataPotensiFilterOptions,
    DataPotensiResponse,
    DataPotensiScorecard,
    DataPotensiSiteRow,
    DataPotensiSitesResponse,
    DonutBreakdownItem,
    StackedBarItem,
    TpDistributionItem,
)

router = APIRouter(prefix="/data-potensi", tags=["Data Potensi"])

DATA_POTENSI_FILTER_COLUMNS = {
    "cluster": 'd."New Cluster"',
    "kabupaten": 'd."Kabupaten/KOTA"',
    "site_class": 'd."Site Class"',
    "type_site": 'd."Type Site"',
    "transport_type": 'd."Transport Type"',
    "type_battery": 'd."Type Battery"',
    "tp": 'd."TP"',
}

FILTER_OPTION_COLUMNS = {
    "clusters": 'd."New Cluster"',
    "kabupaten": 'd."Kabupaten/KOTA"',
    "site_classes": 'd."Site Class"',
    "type_sites": 'd."Type Site"',
    "transport_types": 'd."Transport Type"',
    "battery_types": 'd."Type Battery"',
    "tower_providers": 'd."TP"',
}

DATA_POTENSI_SORT_EXPRESSIONS = {
    "site_id": 'LOWER(COALESCE(d."Siteid", \'\'))',
    "site_name": 'LOWER(COALESCE(d."Site Name", \'\'))',
    "cluster": 'LOWER(COALESCE(d."New Cluster", \'\'))',
    "kabupaten": 'LOWER(COALESCE(d."Kabupaten/KOTA", \'\'))',
    "site_class": 'LOWER(COALESCE(d."Site Class", \'\'))',
    "type_site": 'LOWER(COALESCE(d."Type Site", \'\'))',
    "transport_type": 'LOWER(COALESCE(d."Transport Type", \'\'))',
    "type_battery": 'LOWER(COALESCE(d."Type Battery", \'\'))',
    "jenis_rectifier": 'LOWER(COALESCE(d."Jenis Rectifier", \'\'))',
    "tp": 'LOWER(COALESCE(d."TP", \'\'))',
    "status_site": 'LOWER(COALESCE(d."Status Site", \'\'))',
}
DATA_POTENSI_SORT_DIRECTIONS = {"asc": "ASC", "desc": "DESC"}


# ---------- Filter Helpers ----------

def build_nop_filter(nop: str | None) -> str:
    if not nop:
        return ""
    return ' AND d."NOP" = :nop'


def build_status_filter(status_site: str | None) -> str:
    if not status_site:
        return ""
    return ' AND UPPER(TRIM(COALESCE(d."Status Site", \'\'))) = UPPER(TRIM(:status_site))'


def normalized_category_expression(column: str) -> str:
    """Normalize blank and equivalent missing-value labels."""
    return f"""
    CASE
        WHEN NULLIF(TRIM(COALESCE({column}, '')), '') IS NULL THEN 'Tidak ada'
        WHEN LOWER(TRIM(COALESCE({column}, ''))) IN ('tidak ada', 'tidak tersedia', 'n/a', 'na', '-') THEN 'Tidak ada'
        WHEN UPPER(TRIM(COALESCE({column}, ''))) LIKE '#N/A%' THEN 'Tidak ada'
        ELSE TRIM({column})
    END
    """.strip()


def build_data_potensi_filters(
    *,
    cluster: str | None = None,
    kabupaten: str | None = None,
    site_class: str | None = None,
    type_site: str | None = None,
    transport_type: str | None = None,
    type_battery: str | None = None,
    tp: str | None = None,
) -> tuple[str, dict[str, str]]:
    values = {
        "cluster": cluster,
        "kabupaten": kabupaten,
        "site_class": site_class,
        "type_site": type_site,
        "transport_type": transport_type,
        "type_battery": type_battery,
        "tp": tp,
    }
    filters = []
    params = {}
    for key, value in values.items():
        if value is None or not value.strip():
            continue
        expression = normalized_category_expression(DATA_POTENSI_FILTER_COLUMNS[key])
        filters.append(f"UPPER({expression}) = UPPER(:{key})")
        params[key] = value.strip()
    return "".join(f" AND {part}" for part in filters), params


def build_data_potensi_order_by(sort_by: str, sort_dir: str) -> str:
    """Build a trusted ORDER BY clause for the paginated site table."""
    expression = DATA_POTENSI_SORT_EXPRESSIONS.get(
        sort_by,
        DATA_POTENSI_SORT_EXPRESSIONS["site_id"],
    )
    direction = DATA_POTENSI_SORT_DIRECTIONS.get(sort_dir, "ASC")
    return f'{expression} {direction} NULLS LAST, d."Siteid" ASC'


# ---------- SQL Queries ----------

SCORECARD_QUERY = """
SELECT
    COUNT(DISTINCT d."Siteid")::int AS total_sites,
    COUNT(DISTINCT d."Siteid") FILTER (
        WHERE LOWER(TRIM(COALESCE(d."Type Battery", ''))) = 'lithium'
    )::int AS site_lithium,
    COUNT(DISTINCT d."Siteid") FILTER (
        WHERE LOWER(TRIM(COALESCE(d."Type Battery", ''))) = 'vrla'
    )::int AS site_vrla,
    COUNT(DISTINCT d."Siteid") FILTER (
        WHERE LOWER(TRIM(COALESCE(d."ENVA STATUS", ''))) = 'completed'
    )::int AS enva_validated,
    COUNT(DISTINCT d."Siteid") FILTER (
        WHERE NULLIF(TRIM(COALESCE(d."Transport Type", '')), '') IS NOT NULL
          AND UPPER(TRIM(d."Transport Type")) <> 'FO_TELKOM'
          AND UPPER(TRIM(d."Transport Type")) NOT LIKE '#N/A%'
    )::int AS radio_ip,
    COUNT(DISTINCT NULLIF(TRIM(d."New Cluster"), ''))::int AS total_cluster
FROM public.data_site_master d
WHERE NULLIF(TRIM(d."Siteid"), '') IS NOT NULL
{nop_filter}
{status_filter}
{advanced_filter}
"""

CLUSTER_BREAKDOWN_QUERY = """
SELECT
    CASE
        WHEN NULLIF(TRIM(COALESCE(d."Kabupaten/KOTA", '')), '') IS NULL THEN 'Tidak ada'
        WHEN LOWER(TRIM(COALESCE(d."Kabupaten/KOTA", ''))) IN ('tidak ada', 'tidak tersedia', 'n/a', 'na', '-') THEN 'Tidak ada'
        WHEN UPPER(TRIM(COALESCE(d."Kabupaten/KOTA", ''))) LIKE '#N/A%' THEN 'Tidak ada'
        ELSE TRIM(d."Kabupaten/KOTA")
    END AS label,
    COUNT(DISTINCT d."Siteid")::int AS value
FROM public.data_site_master d
WHERE NULLIF(TRIM(d."Siteid"), '') IS NOT NULL
{nop_filter}
{status_filter}
{advanced_filter}
GROUP BY label
ORDER BY value DESC
"""

TRANSPORT_TYPE_BREAKDOWN_QUERY = """
SELECT
    CASE
        WHEN NULLIF(TRIM(COALESCE(d."Transport Type", '')), '') IS NULL THEN 'Tidak ada'
        WHEN LOWER(TRIM(COALESCE(d."Transport Type", ''))) IN ('tidak ada', 'tidak tersedia', 'n/a', 'na', '-') THEN 'Tidak ada'
        WHEN UPPER(TRIM(COALESCE(d."Transport Type", ''))) LIKE '#N/A%' THEN 'Tidak ada'
        ELSE TRIM(d."Transport Type")
    END AS label,
    COUNT(DISTINCT d."Siteid")::int AS value
FROM public.data_site_master d
WHERE NULLIF(TRIM(d."Siteid"), '') IS NOT NULL
  AND UPPER(TRIM(COALESCE(d."Transport Type", ''))) NOT LIKE '#N/A%'
{nop_filter}
{status_filter}
{advanced_filter}
GROUP BY label
ORDER BY value DESC
"""

SITE_CLASS_BREAKDOWN_QUERY = """
SELECT
    CASE
        WHEN NULLIF(TRIM(COALESCE(d."Site Class", '')), '') IS NULL THEN 'Tidak ada'
        WHEN LOWER(TRIM(COALESCE(d."Site Class", ''))) IN ('tidak ada', 'tidak tersedia', 'n/a', 'na', '-') THEN 'Tidak ada'
        WHEN UPPER(TRIM(COALESCE(d."Site Class", ''))) LIKE '#N/A%' THEN 'Tidak ada'
        ELSE TRIM(d."Site Class")
    END AS label,
    COUNT(DISTINCT d."Siteid")::int AS value
FROM public.data_site_master d
WHERE NULLIF(TRIM(d."Siteid"), '') IS NOT NULL
{nop_filter}
{status_filter}
{advanced_filter}
GROUP BY label
ORDER BY value DESC
"""

_STACKED_BAR_TEMPLATE = """
SELECT
    COALESCE(NULLIF(TRIM(d."Kabupaten/KOTA"), ''), 'Unknown') AS kabupaten,
    {category_expression} AS category,
    COUNT(DISTINCT d."Siteid")::int AS cnt
FROM public.data_site_master d
WHERE NULLIF(TRIM(d."Siteid"), '') IS NOT NULL
  AND NULLIF(TRIM(d."Kabupaten/KOTA"), '') IS NOT NULL
{{nop_filter}}
{{status_filter}}
{{advanced_filter}}
GROUP BY kabupaten, category
ORDER BY kabupaten, cnt DESC
"""

BATTERY_BY_KAB_QUERY = _STACKED_BAR_TEMPLATE.format(
    category_expression=normalized_category_expression('d."Type Battery"'),
)
RECTIFIER_BY_KAB_QUERY = _STACKED_BAR_TEMPLATE.format(
    category_expression=normalized_category_expression('d."Jenis Rectifier"'),
)
BELTING_BY_KAB_QUERY = _STACKED_BAR_TEMPLATE.format(
    category_expression=normalized_category_expression('d."Belting Battery"'),
)
BACKUP_TIME_BY_KAB_QUERY = _STACKED_BAR_TEMPLATE.format(
    category_expression=normalized_category_expression('d."Backup Time Battery"'),
)

TP_DISTRIBUTION_QUERY = """
SELECT
    CASE
        WHEN NULLIF(TRIM(COALESCE(d."TP", '')), '') IS NULL THEN 'Tidak ada'
        WHEN LOWER(TRIM(COALESCE(d."TP", ''))) IN ('tidak ada', 'tidak tersedia', 'n/a', 'na', '-') THEN 'Tidak ada'
        WHEN UPPER(TRIM(COALESCE(d."TP", ''))) LIKE '#N/A%' THEN 'Tidak ada'
        ELSE TRIM(d."TP")
    END AS tp,
    COUNT(DISTINCT d."Siteid")::int AS count
FROM public.data_site_master d
WHERE NULLIF(TRIM(d."Siteid"), '') IS NOT NULL
{nop_filter}
{status_filter}
{advanced_filter}
GROUP BY tp
ORDER BY count DESC
"""

SITES_QUERY = """
SELECT
    d."Siteid",
    d."Site Name",
    d."New Cluster",
    d."Kabupaten/KOTA",
    d."Site Class",
    d."Type Site",
    d."Transport Type",
    d."Type Battery",
    d."Jenis Rectifier",
    d."Backup Time Battery",
    d."Belting Battery",
    d."TP",
    d."Status Site",
    d."ENVA STATUS"
FROM public.data_site_master d
WHERE NULLIF(TRIM(d."Siteid"), '') IS NOT NULL
{nop_filter}
{status_filter}
{advanced_filter}
{search_filter}
ORDER BY {order_by}
LIMIT :limit_val OFFSET :offset_val
"""

SITES_COUNT_QUERY = """
SELECT COUNT(DISTINCT d."Siteid")::int AS total
FROM public.data_site_master d
WHERE NULLIF(TRIM(d."Siteid"), '') IS NOT NULL
{nop_filter}
{status_filter}
{advanced_filter}
{search_filter}
"""

STATUS_OPTIONS_QUERY = """
SELECT DISTINCT TRIM(d."Status Site") AS status_site
FROM public.data_site_master d
WHERE d."Status Site" IS NOT NULL AND TRIM(d."Status Site") <> ''
ORDER BY status_site
"""

FILTER_OPTIONS_QUERY = """
SELECT DISTINCT {value_expression} AS value
FROM public.data_site_master d
WHERE NULLIF(TRIM(d."Siteid"), '') IS NOT NULL
{nop_filter}
{status_filter}
ORDER BY value
"""


# ---------- Helpers ----------

def _pct(part: int, whole: int) -> float:
    return round((part / whole) * 100, 1) if whole else 0.0


def _rows_to_donut(rows, total: int | None = None) -> list[DonutBreakdownItem]:
    items = [
        DonutBreakdownItem(
            label=row.get("label") or "Unknown",
            value=int(row.get("value") or 0),
        )
        for row in rows
    ]
    if total is None:
        total = sum(item.value for item in items)
    for item in items:
        item.percentage = _pct(item.value, total)
    return items


def _rows_to_stacked_bar(rows) -> list[StackedBarItem]:
    kab_map: dict[str, dict[str, int]] = defaultdict(dict)
    for row in rows:
        kabupaten = row.get("kabupaten") or "Unknown"
        category = row.get("category") or "Unknown"
        cnt = int(row.get("cnt") or 0)
        kab_map[kabupaten][category] = cnt
    return [
        StackedBarItem(cluster=kab, categories=cats)
        for kab, cats in sorted(kab_map.items())
    ]


# ---------- Endpoints ----------

@router.get("/status-options")
async def get_status_options(
    session: AsyncSession = Depends(get_session),
):
    """Return available status_site values for the filter dropdown."""
    result = await session.execute(text(STATUS_OPTIONS_QUERY))
    rows = result.mappings().all()
    return [row["status_site"] for row in rows]


@router.get("/filter-options", response_model=DataPotensiFilterOptions)
async def get_data_potensi_filter_options(
    nop: str | None = Query(None),
    status_site: str | None = Query(None),
    session: AsyncSession = Depends(get_session),
):
    """Return advanced filter options for the selected NOP and site status."""
    nop_filter = build_nop_filter(nop)
    status_filter = build_status_filter(status_site)
    params = {"nop": nop, "status_site": status_site}
    options: dict[str, list[str]] = {}

    for field_name, column in FILTER_OPTION_COLUMNS.items():
        result = await session.execute(
            text(FILTER_OPTIONS_QUERY.format(
                value_expression=normalized_category_expression(column),
                nop_filter=nop_filter,
                status_filter=status_filter,
            )),
            params,
        )
        options[field_name] = [
            row["value"]
            for row in result.mappings().all()
            if row.get("value")
        ]

    return DataPotensiFilterOptions(**options)


@router.get("/dashboard", response_model=DataPotensiResponse)
async def get_data_potensi_dashboard(
    nop: str | None = Query(None),
    status_site: str | None = Query("Active", description="Filter by Status Site"),
    cluster: str | None = Query(None),
    kabupaten: str | None = Query(None),
    site_class: str | None = Query(None),
    type_site: str | None = Query(None),
    transport_type: str | None = Query(None),
    type_battery: str | None = Query(None),
    tp: str | None = Query(None),
    session: AsyncSession = Depends(get_session),
    response: Response = None,
):
    """Return scorecard KPIs plus all chart breakdowns for the Data Potensi page."""
    advanced_filter, advanced_params = build_data_potensi_filters(
        cluster=cluster,
        kabupaten=kabupaten,
        site_class=site_class,
        type_site=type_site,
        transport_type=transport_type,
        type_battery=type_battery,
        tp=tp,
    )
    filter_params = {
        "nop": nop or "",
        "status_site": status_site or "",
        "cluster": cluster or "",
        "kabupaten": kabupaten or "",
        "site_class": site_class or "",
        "type_site": type_site or "",
        "transport_type": transport_type or "",
        "type_battery": type_battery or "",
        "tp": tp or "",
    }
    cache_key = redis_cache.make_key(
        "data-potensi",
        "dashboard",
        **filter_params,
    )
    cache_status, cached_value = await redis_cache.get_json(cache_key)
    if cache_status == "HIT":
        if response is not None:
            response.headers["X-Cache"] = cache_status
        return cached_value

    nop_filter = build_nop_filter(nop)
    status_filter = build_status_filter(status_site)
    params = {"nop": nop, "status_site": status_site, **advanced_params}
    query_context = {
        "nop_filter": nop_filter,
        "status_filter": status_filter,
        "advanced_filter": advanced_filter,
    }

    # Scorecard
    sc_result = await session.execute(
        text(SCORECARD_QUERY.format(**query_context)),
        params,
    )
    sc_row = sc_result.mappings().first() or {}
    total_sites = int(sc_row.get("total_sites") or 0)
    site_lithium = int(sc_row.get("site_lithium") or 0)
    site_vrla = int(sc_row.get("site_vrla") or 0)
    enva_validated = int(sc_row.get("enva_validated") or 0)
    radio_ip = int(sc_row.get("radio_ip") or 0)

    scorecard = DataPotensiScorecard(
        total_sites=total_sites,
        site_lithium=site_lithium,
        site_vrla=site_vrla,
        site_lithium_pct=_pct(site_lithium, total_sites),
        site_vrla_pct=_pct(site_vrla, total_sites),
        enva_validated=enva_validated,
        enva_validated_pct=_pct(enva_validated, total_sites),
        radio_ip=radio_ip,
        radio_ip_pct=_pct(radio_ip, total_sites),
        total_cluster=int(sc_row.get("total_cluster") or 0),
    )

    # Donut charts — first donut is now "by Kabupaten"
    kab_result = await session.execute(
        text(CLUSTER_BREAKDOWN_QUERY.format(**query_context)),
        params,
    )
    kabupaten_breakdown = _rows_to_donut(kab_result.mappings().all(), total_sites)

    transport_result = await session.execute(
        text(TRANSPORT_TYPE_BREAKDOWN_QUERY.format(**query_context)),
        params,
    )
    transport_type_breakdown = _rows_to_donut(transport_result.mappings().all())

    class_result = await session.execute(
        text(SITE_CLASS_BREAKDOWN_QUERY.format(**query_context)),
        params,
    )
    site_class_breakdown = _rows_to_donut(class_result.mappings().all(), total_sites)

    # Stacked bar charts — now by Kabupaten
    async def _load_stacked(query_template: str) -> list[StackedBarItem]:
        result = await session.execute(
            text(query_template.format(**query_context)),
            params,
        )
        return _rows_to_stacked_bar(result.mappings().all())

    battery_by_kab = await _load_stacked(BATTERY_BY_KAB_QUERY)
    rectifier_by_kab = await _load_stacked(RECTIFIER_BY_KAB_QUERY)
    belting_by_kab = await _load_stacked(BELTING_BY_KAB_QUERY)
    backup_time_by_kab = await _load_stacked(BACKUP_TIME_BY_KAB_QUERY)

    # TP Distribution
    tp_result = await session.execute(
        text(TP_DISTRIBUTION_QUERY.format(**query_context)),
        params,
    )
    tp_distribution = [
        TpDistributionItem(
            tp=row.get("tp") or "Unknown",
            count=int(row.get("count") or 0),
        )
        for row in tp_result.mappings().all()
    ]

    payload = DataPotensiResponse(
        scorecard=scorecard,
        cluster_breakdown=kabupaten_breakdown,
        transport_type_breakdown=transport_type_breakdown,
        site_class_breakdown=site_class_breakdown,
        battery_by_cluster=battery_by_kab,
        rectifier_by_cluster=rectifier_by_kab,
        belting_by_cluster=belting_by_kab,
        backup_time_by_cluster=backup_time_by_kab,
        tp_distribution=tp_distribution,
    )

    if cache_status == "MISS":
        await redis_cache.set_json(cache_key, payload)
    if response is not None:
        response.headers["X-Cache"] = cache_status
    return payload


@router.get("/sites", response_model=DataPotensiSitesResponse)
async def get_data_potensi_sites(
    nop: str | None = Query(None),
    status_site: str | None = Query("Active", description="Filter by Status Site"),
    cluster: str | None = Query(None),
    kabupaten: str | None = Query(None),
    site_class: str | None = Query(None),
    type_site: str | None = Query(None),
    transport_type: str | None = Query(None),
    type_battery: str | None = Query(None),
    tp: str | None = Query(None),
    q: str | None = Query(None, description="Search by Site ID or Site Name"),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    sort_by: Literal[
        "site_id",
        "site_name",
        "cluster",
        "kabupaten",
        "site_class",
        "type_site",
        "transport_type",
        "type_battery",
        "jenis_rectifier",
        "tp",
        "status_site",
    ] = Query("site_id"),
    sort_dir: Literal["asc", "desc"] = Query("asc"),
    session: AsyncSession = Depends(get_session),
    response: Response = None,
):
    """Return paginated site list from data_site_master."""
    nop_filter = build_nop_filter(nop)
    status_filter = build_status_filter(status_site)
    advanced_filter, advanced_params = build_data_potensi_filters(
        cluster=cluster,
        kabupaten=kabupaten,
        site_class=site_class,
        type_site=type_site,
        transport_type=transport_type,
        type_battery=type_battery,
        tp=tp,
    )
    search_filter = ""
    params: dict = {"nop": nop, "status_site": status_site, **advanced_params}

    if q and q.strip():
        search_filter = ' AND (d."Siteid" ILIKE :q OR d."Site Name" ILIKE :q)'
        params["q"] = f"%{q.strip()}%"

    # Count
    count_result = await session.execute(
        text(SITES_COUNT_QUERY.format(
            nop_filter=nop_filter,
            status_filter=status_filter,
            advanced_filter=advanced_filter,
            search_filter=search_filter,
        )),
        params,
    )
    total = int((count_result.scalar_one_or_none() or 0))
    total_pages = math.ceil(total / limit) if total else 0
    offset = (page - 1) * limit

    # Data
    result = await session.execute(
        text(SITES_QUERY.format(
            nop_filter=nop_filter,
            status_filter=status_filter,
            advanced_filter=advanced_filter,
            search_filter=search_filter,
            order_by=build_data_potensi_order_by(sort_by, sort_dir),
        )),
        {**params, "limit_val": limit, "offset_val": offset},
    )
    rows = result.mappings().all()

    sites = [
        DataPotensiSiteRow(
            site_id=row.get("Siteid") or "",
            site_name=row.get("Site Name"),
            cluster=row.get("New Cluster"),
            kabupaten=row.get("Kabupaten/KOTA"),
            site_class=row.get("Site Class"),
            type_site=row.get("Type Site"),
            transport_type=row.get("Transport Type"),
            type_battery=row.get("Type Battery"),
            jenis_rectifier=row.get("Jenis Rectifier"),
            backup_time_battery=row.get("Backup Time Battery"),
            belting_battery=row.get("Belting Battery"),
            tp=row.get("TP"),
            status_site=row.get("Status Site"),
            enva_status=row.get("ENVA STATUS"),
        )
        for row in rows
    ]

    return DataPotensiSitesResponse(
        data=sites,
        total=total,
        page=page,
        limit=limit,
        total_pages=total_pages,
    )

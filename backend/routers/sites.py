"""
Sites router — endpoints for site data, search, and filters.
GET /sites                  — Paginated site list with filters
GET /sites/{id}/detail      — Full detail (55+ columns)
GET /sites/search           — Search by name/ID
GET /sites/filters/options  — Dropdown filter options
"""
import math
from fastapi import APIRouter, Depends, Query, HTTPException
import runtime_compat  # noqa: F401
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text

from database import get_session
from queries.metrics_cache import ensure_site_month_metrics
from queries.sql_queries import (
    SITES_LIST_QUERY,
    SITES_COUNT_QUERY,
    SITES_SEARCH_QUERY,
    SITE_FULL_DETAIL_QUERY,
    POPUP_DETAIL_QUERY,
    FILTER_OPTIONS_QUERY_KABUPATEN,
    FILTER_OPTIONS_QUERY_CLUSTER,
    FILTER_OPTIONS_QUERY_KELAS,
    FILTER_OPTIONS_QUERY_NOP,
)
from models.site import (
    SiteListItem,
    SiteListResponse,
    SiteSearchResult,
    SiteFilterOptions,
)

router = APIRouter(prefix="/sites", tags=["Sites"])


def _build_filters(kabupaten=None, cluster=None, status=None, kelas=None, nop=None):
    """Build dynamic WHERE clause fragments."""
    filters = ""
    params = {}
    if kabupaten:
        filters += ' AND m."Kabupaten/KOTA" = :kabupaten'
        params["kabupaten"] = kabupaten
    if cluster:
        filters += ' AND m."New Cluster" = :cluster'
        params["cluster"] = cluster
    if status:
        filters += ' AND m."Status Site" = :status'
        params["status"] = status
    if kelas:
        filters += ' AND m."Site Class" = :kelas'
        params["kelas"] = kelas
    if nop:
        filters += ' AND m."NOP" = :nop'
        params["nop"] = nop
    return filters, params


def _build_search_filter(q=None):
    """Build search filter across table-visible identity/location columns."""
    if not q:
        return "", {}

    return (
        ' AND (m."Siteid" ILIKE :q'
        ' OR m."Site Name" ILIKE :q'
        ' OR m."Kabupaten/KOTA" ILIKE :q)',
        {"q": f"%{q}%"},
    )


@router.get("/filters/options", response_model=SiteFilterOptions)
async def get_filter_options(
    session: AsyncSession = Depends(get_session),
):
    """Get available values for dropdown filters."""
    kab_result = await session.execute(text(FILTER_OPTIONS_QUERY_KABUPATEN))
    cluster_result = await session.execute(text(FILTER_OPTIONS_QUERY_CLUSTER))
    kelas_result = await session.execute(text(FILTER_OPTIONS_QUERY_KELAS))
    nop_result = await session.execute(text(FILTER_OPTIONS_QUERY_NOP))

    return SiteFilterOptions(
        kabupaten=[r[0] for r in kab_result.all() if r[0]],
        cluster=[r[0] for r in cluster_result.all() if r[0]],
        kelas=[r[0] for r in kelas_result.all() if r[0]],
        nop=[r[0] for r in nop_result.all() if r[0]],
    )


@router.get("/search", response_model=list[SiteSearchResult])
async def search_sites(
    q: str = Query(..., min_length=1, description="Search by site name or ID"),
    session: AsyncSession = Depends(get_session),
):
    """Search sites by name or Site ID."""
    search_term = f"%{q}%"
    result = await session.execute(
        text(SITES_SEARCH_QUERY),
        {"q": search_term},
    )
    rows = result.mappings().all()

    return [
        SiteSearchResult(
            site_id=row["Siteid"],
            site_name=row.get("Site Name"),
            kabupaten=row.get("kabupaten"),
            site_class=row.get("Site Class"),
            status_site=row.get("Status Site"),
        )
        for row in rows
    ]


@router.get("/{site_id}/detail")
async def get_site_detail(
    site_id: str,
    bulan: int = Query(None, ge=1, le=12),
    tahun: int = Query(None, ge=2020),
    session: AsyncSession = Depends(get_session),
):
    """Get full detail for a single site (all 55+ columns)."""
    import datetime
    now = datetime.datetime.now()
    if bulan is None:
        bulan = now.month
    if tahun is None:
        tahun = now.year

    # Get popup detail (master + availability)
    result = await session.execute(
        text(POPUP_DETAIL_QUERY),
        {"site_id": site_id, "bulan": bulan, "tahun": tahun},
    )
    row = result.mappings().first()

    if not row:
        raise HTTPException(status_code=404, detail=f"Site {site_id} not found")

    data = dict(row)
    # Cast numeric fields
    for key in ["avg_availability", "total_outage_menit"]:
        if data.get(key) is not None:
            try:
                data[key] = float(data[key])
            except (ValueError, TypeError):
                data[key] = None

    return data


@router.get("", response_model=SiteListResponse)
async def list_sites(
    bulan: int = Query(None, ge=1, le=12),
    tahun: int = Query(None, ge=2020),
    kabupaten: str = Query(None),
    cluster: str = Query(None),
    status: str = Query(None),
    kelas: str = Query(None),
    nop: str = Query(None),
    q: str = Query(None, description="Search by Site ID, site name, or Kabupaten"),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    session: AsyncSession = Depends(get_session),
):
    """Paginated list of sites with optional filters."""
    import datetime
    now = datetime.datetime.now()
    if bulan is None:
        bulan = now.month
    if tahun is None:
        tahun = now.year

    await ensure_site_month_metrics(session, bulan, tahun)

    filters, filter_params = _build_filters(kabupaten, cluster, status, kelas, nop)
    search_filter, search_params = _build_search_filter(q)
    offset = (page - 1) * limit

    # Get total count
    count_query = SITES_COUNT_QUERY.format(filters=filters, search_filter=search_filter)
    count_result = await session.execute(
        text(count_query),
        {"bulan": bulan, "tahun": tahun, **filter_params, **search_params},
    )
    total = count_result.scalar() or 0

    # Get paginated data
    list_query = SITES_LIST_QUERY.format(filters=filters, search_filter=search_filter)
    params = {
        "bulan": bulan,
        "tahun": tahun,
        "limit_val": limit,
        "offset_val": offset,
        **filter_params,
        **search_params,
    }
    result = await session.execute(text(list_query), params)
    rows = result.mappings().all()

    items = [
        SiteListItem(
            site_id=row["Siteid"],
            site_name=row.get("Site Name"),
            latitude=float(row["latitude"]) if row.get("latitude") is not None else None,
            longitude=float(row["longitude"]) if row.get("longitude") is not None else None,
            kabupaten=row.get("kabupaten"),
            site_class=row.get("Site Class"),
            status_site=row.get("Status Site"),
            nop=row.get("NOP"),
            cluster=row.get("cluster"),
            type_site=row.get("Type Site"),
            avg_availability=float(row["avg_availability"]) if row.get("avg_availability") is not None else None,
            total_outage_menit=float(row["total_outage_menit"]) if row.get("total_outage_menit") is not None else None,
            jumlah_cell=int(row["jumlah_cell"]) if row.get("jumlah_cell") is not None else None,
            rca_dominan=row.get("rca_dominan"),
        )
        for row in rows
    ]

    return SiteListResponse(
        data=items,
        total=total,
        page=page,
        limit=limit,
        total_pages=math.ceil(total / limit) if total > 0 else 0,
    )

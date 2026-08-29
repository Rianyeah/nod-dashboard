"""
Map router — endpoints for map marker data.
GET /map/sites          — All sites with avg availability for markers
GET /map/sites/{id}/popup — Full popup detail for a single site
"""
from fastapi import APIRouter, Depends, Query, HTTPException
import runtime_compat  # noqa: F401
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text

from database import get_session
from map_sectors import (
    load_sector_feature_collection,
    load_sector_viewport_feature_collection,
    parse_viewport_bbox,
)
from queries.metrics_cache import ensure_site_month_metrics
from queries.sql_queries import MAP_SITES_QUERY, POPUP_DETAIL_QUERY
from models.site import SiteMapFeature, SiteDetail

router = APIRouter(prefix="/map", tags=["Map"])


@router.get("/sites", response_model=list[SiteMapFeature])
async def get_map_sites(
    bulan: int = Query(..., ge=1, le=12, description="Bulan (1-12)"),
    tahun: int = Query(..., ge=2020, description="Tahun"),
    nop: str = Query(None),
    session: AsyncSession = Depends(get_session),
):
    """Get all sites with avg availability for map markers."""
    await ensure_site_month_metrics(session, bulan, tahun)

    filters = ""
    params = {"bulan": bulan, "tahun": tahun}
    if nop:
        filters = ' AND m."NOP" = :nop'
        params["nop"] = nop

    result = await session.execute(
        text(MAP_SITES_QUERY.format(filters=filters)),
        params,
    )
    rows = result.mappings().all()

    sites = []
    for row in rows:
        try:
            sites.append(SiteMapFeature(
                site_id=row["Siteid"],
                site_name=row.get("Site Name"),
                latitude=row.get("latitude"),
                longitude=row.get("longitude"),
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
            ))
        except (ValueError, TypeError):
            # Skip rows with invalid data
            continue

    return sites


@router.get("/sectors")
async def get_map_sectors(
    site_id: str = Query(None),
    nop: str = Query(None),
    session: AsyncSession = Depends(get_session),
):
    """Get full-detail sector polygons for one selected site."""
    if not site_id:
        raise HTTPException(
            status_code=422,
            detail="site_id is required; use /map/sectors/viewport for bounded map sectors",
        )
    return await load_sector_feature_collection(session, site_id=site_id, nop=nop)


@router.get("/sectors/viewport")
async def get_map_sector_viewport(
    bbox: str = Query(..., description="WGS84 west,south,east,north"),
    zoom: float = Query(..., ge=0, le=24),
    nop: str = Query(None),
    session: AsyncSession = Depends(get_session),
):
    """Get spatially bounded sector polygons at a zoom-derived detail level."""
    try:
        parsed_bbox = parse_viewport_bbox(bbox)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    return await load_sector_viewport_feature_collection(
        session,
        bbox=parsed_bbox,
        zoom=zoom,
        nop=nop,
    )


@router.get("/sites/{site_id}/popup")
async def get_site_popup(
    site_id: str,
    bulan: int = Query(None, ge=1, le=12),
    tahun: int = Query(None, ge=2020),
    session: AsyncSession = Depends(get_session),
):
    """Get full detail for a site popup."""
    import datetime
    now = datetime.datetime.now()
    if bulan is None:
        bulan = now.month
    if tahun is None:
        tahun = now.year

    result = await session.execute(
        text(POPUP_DETAIL_QUERY),
        {"site_id": site_id, "bulan": bulan, "tahun": tahun},
    )
    row = result.mappings().first()

    if not row:
        raise HTTPException(status_code=404, detail=f"Site {site_id} not found")

    # Build response dict from all columns
    data = dict(row)
    # Ensure numeric fields are properly typed
    for key in ["avg_availability", "total_outage_menit"]:
        if data.get(key) is not None:
            try:
                data[key] = float(data[key])
            except (ValueError, TypeError):
                data[key] = None

    if data.get("jumlah_hari_data") is not None:
        try:
            data["jumlah_hari_data"] = int(data["jumlah_hari_data"])
        except (ValueError, TypeError):
            data["jumlah_hari_data"] = 0

    # Try to cast lat/long
    for key in ["Latitude", "latitude"]:
        if data.get(key):
            try:
                data["latitude"] = float(data[key])
            except (ValueError, TypeError):
                data["latitude"] = None
    for key in ["Longitude", "longitude"]:
        if data.get(key):
            try:
                data["longitude"] = float(data[key])
            except (ValueError, TypeError):
                data["longitude"] = None

    return data

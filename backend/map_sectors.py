"""Shared read-only sector GeoJSON loader for dashboard and machine integrations."""

from __future__ import annotations

import math
from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from queries.sql_queries import (
    MAP_SECTORS_QUERY,
    MAP_SECTORS_VIEWPORT_FULL_QUERY,
    MAP_SECTORS_VIEWPORT_GROUPED_QUERY,
)
from sector_geometry import (
    feature_limit_for_lod,
    sector_lod_for_zoom,
    sector_row_to_feature,
    sector_row_to_viewport_feature,
)
from site_query import build_site_filters, build_site_search_filter


def parse_viewport_bbox(value: str) -> tuple[float, float, float, float]:
    """Parse a WGS84 west,south,east,north box without unbounded fallbacks."""
    try:
        parts = [float(part.strip()) for part in value.split(",")]
    except (AttributeError, TypeError, ValueError) as exc:
        raise ValueError("bbox must contain west,south,east,north") from exc

    if len(parts) != 4 or not all(math.isfinite(part) for part in parts):
        raise ValueError("bbox must contain four finite coordinates")

    west, south, east, north = parts
    if not (-180 <= west <= 180 and -180 <= east <= 180):
        raise ValueError("bbox longitude must be between -180 and 180")
    if not (-90 <= south <= 90 and -90 <= north <= 90):
        raise ValueError("bbox latitude must be between -90 and 90")
    if west >= east or south >= north:
        raise ValueError("bbox must satisfy west < east and south < north")
    return west, south, east, north


def _viewport_metadata(
    *,
    lod: str,
    zoom: float,
    feature_count: int,
    feature_limit: int,
    limit_exceeded: bool = False,
    zoom_required: bool = False,
) -> dict[str, Any]:
    return {
        "lod": lod,
        "zoom": float(zoom),
        "feature_count": feature_count,
        "feature_limit": feature_limit,
        "limit_exceeded": limit_exceeded,
        "zoom_required": zoom_required,
    }


async def load_sector_feature_collection(
    session: AsyncSession,
    *,
    site_id: str | None = None,
    nop: str | None = None,
) -> dict[str, Any]:
    """Load filtered antenna-sector polygons in the public map response format."""
    filters = ""
    params: dict[str, str] = {}
    if site_id:
        filters += " AND site_id = :site_id"
        params["site_id"] = site_id
    if nop:
        filters += " AND nop = :nop"
        params["nop"] = nop

    result = await session.execute(
        text(MAP_SECTORS_QUERY.format(filters=filters)),
        params,
    )
    features = []
    for row in result.mappings().all():
        feature = sector_row_to_feature(row)
        if feature is not None:
            features.append(feature)

    return {
        "type": "FeatureCollection",
        "features": features,
    }


async def load_sector_viewport_feature_collection(
    session: AsyncSession,
    *,
    bbox: tuple[float, float, float, float],
    zoom: float,
    nop: str | None = None,
    kabupaten: str | None = None,
    cluster: str | None = None,
    kelas: str | None = None,
    q: str | None = None,
) -> dict[str, Any]:
    """Load a spatially bounded sector collection with server-owned LOD."""
    lod = sector_lod_for_zoom(zoom)
    if lod == "none":
        return {
            "type": "FeatureCollection",
            "features": [],
            "metadata": _viewport_metadata(
                lod=lod,
                zoom=zoom,
                feature_count=0,
                feature_limit=0,
                zoom_required=True,
            ),
        }

    feature_limit = feature_limit_for_lod(lod)
    west, south, east, north = bbox
    params: dict[str, Any] = {
        "west": west,
        "south": south,
        "east": east,
        "north": north,
        "row_limit": feature_limit + 1,
    }
    filters, filter_params = build_site_filters(
        nop=nop,
        kabupaten=kabupaten,
        cluster=cluster,
        kelas=kelas,
        alias="m",
    )
    search_filter, search_params = build_site_search_filter(q, alias="m")
    filters += search_filter
    params.update(filter_params)
    params.update(search_params)

    query = (
        MAP_SECTORS_VIEWPORT_GROUPED_QUERY
        if lod in {"lite", "medium"}
        else MAP_SECTORS_VIEWPORT_FULL_QUERY
    )
    result = await session.execute(text(query.format(filters=filters)), params)
    rows = result.mappings().all()

    if len(rows) > feature_limit:
        return {
            "type": "FeatureCollection",
            "features": [],
            "metadata": _viewport_metadata(
                lod=lod,
                zoom=zoom,
                feature_count=0,
                feature_limit=feature_limit,
                limit_exceeded=True,
                zoom_required=True,
            ),
        }

    features = []
    for row in rows:
        feature = sector_row_to_viewport_feature(row, lod=lod)
        if feature is not None:
            features.append(feature)

    return {
        "type": "FeatureCollection",
        "features": features,
        "metadata": _viewport_metadata(
            lod=lod,
            zoom=zoom,
            feature_count=len(features),
            feature_limit=feature_limit,
        ),
    }

"""Shared read-only sector GeoJSON loader for dashboard and machine integrations."""

from __future__ import annotations

from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from queries.sql_queries import MAP_SECTORS_QUERY
from sector_geometry import sector_row_to_feature


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

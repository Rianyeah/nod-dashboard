"""Read-only map data routes for N8N automations."""

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_session
from map_sectors import load_sector_feature_collection
from security import verify_n8n_map_key


router = APIRouter(prefix="/integrations/n8n", tags=["N8N Integrations"])


@router.get("/map/sectors", dependencies=[Depends(verify_n8n_map_key)])
async def get_n8n_map_sectors(
    site_id: str | None = Query(None),
    nop: str | None = Query(None),
    session: AsyncSession = Depends(get_session),
):
    """Return the same sector GeoJSON used by the authenticated dashboard map."""
    return await load_sector_feature_collection(
        session,
        site_id=site_id,
        nop=nop,
    )

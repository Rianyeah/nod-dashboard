"""Authenticated fiber route inventory and incident history."""

from datetime import date
from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_session
from map_sectors import parse_viewport_bbox
from services import epm_cables, epm_core as epm

router = APIRouter(prefix="/epm", tags=["Peta Jalur EPM"])
Session = Annotated[AsyncSession, Depends(get_session)]
Revision = Annotated[int, Query(ge=1)]


@router.get("/routes")
async def get_routes(session: Session):
    return await epm.list_routes(session)


@router.get("/site-master")
async def get_site_master(site_ids: Annotated[str, Query(min_length=1, max_length=300)], session: Session):
    return await epm.site_master_details(session, site_ids)


@router.get("/map-sites")
async def get_nearby_sites(bbox: Annotated[str, Query(min_length=7, max_length=110)], session: Session):
    try:
        bounds = parse_viewport_bbox(bbox)
    except ValueError:
        epm.fail(422, "Batas area peta tidak valid.")
    return await epm.nearby_map_sites(session, bounds)


@router.get("/sector-directions")
async def get_sector_directions(site_ids: Annotated[str, Query(min_length=1, max_length=40)], session: Session):
    return await epm.map_sector_directions(session, site_ids)


@router.post("/routes/preview")
async def preview_route(payload: dict):
    return epm.parse_route(payload)


@router.post("/routes", status_code=201)
async def add_route(payload: dict, session: Session):
    async with session.begin():
        return await epm.create_route(session, payload)


@router.get("/routes/{route_id}")
async def get_route(route_id: UUID, session: Session):
    return await epm.route_detail(session, route_id)


@router.put("/routes/{route_id}")
async def put_route(route_id: UUID, payload: dict, session: Session):
    async with session.begin():
        return await epm.update_route(session, route_id, payload)


@router.post("/routes/{route_id}/cable-replacements/preview")
async def preview_cable(route_id: UUID, payload: epm_cables.CableRequest, session: Session):
    return epm_cables.cable_section(await epm.route_detail(session, route_id), payload)


@router.post("/routes/{route_id}/cable-replacements", status_code=201)
async def record_cable(route_id: UUID, payload: epm_cables.CableSave, session: Session):
    async with session.begin():
        return await epm_cables.record_replacement(session, route_id, payload)


@router.delete("/routes/{route_id}", status_code=204)
async def archive_route(route_id: UUID, expected_revision: Revision, session: Session):
    async with session.begin():
        await epm.archive(session, "epm_routes", route_id, expected_revision)
    return Response(status_code=204)


@router.get("/reports/incidents")
@router.get("/incidents")
async def get_incidents(session: Session, route_id: UUID | None = None, point_id: UUID | None = None,
                        status: Literal["open","working","resolved","unknown"] | None = None,
                        date_from: date | None = None, date_to: date | None = None):
    return await epm.list_incidents(session, route_id=route_id, point_id=point_id, status=status,
                                    date_from=date_from, date_to=date_to)


@router.post("/incidents", status_code=201)
async def add_incident(payload: dict, session: Session):
    async with session.begin():
        return await epm.create_incident(session, payload)


@router.patch("/incidents/{incident_id}")
async def patch_incident(incident_id: UUID, payload: dict, session: Session):
    async with session.begin():
        return await epm.update_incident(session, incident_id, payload)


@router.delete("/incidents/{incident_id}", status_code=204)
async def archive_incident(incident_id: UUID, expected_revision: Revision, session: Session):
    async with session.begin():
        await epm.archive(session, "epm_route_incidents", incident_id, expected_revision)
    return Response(status_code=204)

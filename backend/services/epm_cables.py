"""Record a commissioned cable section and retire explicitly selected faults."""
import json
from bisect import bisect_right
from datetime import datetime, timedelta, timezone
from typing import Literal
from uuid import UUID, uuid4

from pydantic import AwareDatetime, BaseModel, ConfigDict, Field
from sqlalchemy import text

from services import epm_core
from services.epm_geometry import Geometry, stations


class CableRequest(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, allow_inf_nan=False)
    origin_point_id: UUID
    length_m: float = Field(gt=0)
    direction: Literal["forward", "backward"] = "forward"
    expected_revision: int = Field(strict=True, ge=1)


class CableSave(CableRequest):
    active_at: AwareDatetime
    incident_id: UUID | None = None
    note: str = Field(default="", max_length=1000)
    archive_point_ids: set[UUID] = Field(default_factory=set, max_length=1000)


class CableCandidate(BaseModel):
    id: UUID
    label: str = Field(max_length=150)
    station_m: float = Field(ge=0, allow_inf_nan=False)


class CableActivity(BaseModel):
    model_config = ConfigDict(allow_inf_nan=False)
    id: UUID
    origin_point_id: UUID
    origin_label: str = Field(max_length=150)
    incident_id: UUID | None = None
    active_at: AwareDatetime
    note: str = Field(default="", max_length=1000)
    start_m: float = Field(ge=0)
    end_m: float = Field(ge=0)
    length_m: float = Field(gt=0)
    direction: Literal["forward", "backward"]
    geometry: Geometry
    candidates: list[CableCandidate] = Field(max_length=1000)
    archived_point_ids: list[UUID] = Field(max_length=1000)


def point_at(line, chain, metre):
    i = bisect_right(chain, metre)
    if i >= len(line):
        return list(line[-1])
    a, b = line[i-1], line[i]
    ratio = (metre-chain[i-1])/(chain[i]-chain[i-1])
    return [a[0]+(b[0]-a[0])*ratio, a[1]+(b[1]-a[1])*ratio]


def cable_section(route, payload):
    epm_core.revision_check(payload.expected_revision, route["revision"])
    origin = next((p for p in route["points"] if str(p["id"]) == str(payload.origin_point_id)), None)
    if origin is None:
        epm_core.fail(422, "Pilih titik awal pada jalur aktif.")
    line = route["geometry"]["coordinates"]
    chain = stations(line)
    start = max(0, min(chain[-1], origin["station_m"]))
    delta = payload.length_m if payload.direction == "forward" else -payload.length_m
    finish = start + delta
    if finish < -0.01 or finish > chain[-1] + 0.01:
        epm_core.fail(422, "Panjang ruas melebihi sisa lintasan ke arah yang dipilih.")
    finish = max(0, min(chain[-1], finish))
    low, high = sorted((start, finish))
    if high-low < 0.01:
        epm_core.fail(422, "Panjang ruas terlalu pendek.")
    coords = [point_at(line, chain, low)]
    coords.extend(list(p) for p, metre in zip(line, chain) if low < metre < high)
    coords.append(point_at(line, chain, high))
    if payload.direction == "backward":
        coords.reverse()
    candidates = [{"id":str(p["id"]), "label":p["label"], "station_m":p["station_m"]}
                  for p in route["points"]
                  if p["type"] == "tipus" and low-0.001 <= p["station_m"] <= high+0.001]
    return {
        "origin_point_id": str(origin["id"]), "origin_label": origin["label"],
        "start_m": start, "end_m": finish, "length_m": high-low,
        "direction": payload.direction, "geometry": {"type":"LineString","coordinates":coords},
        "candidates": candidates,
    }


async def record_replacement(session, route_id, payload):
    if payload.active_at > datetime.now(timezone.utc) + timedelta(minutes=2):
        epm_core.fail(422, "Waktu kabel aktif belum tiba.")
    locked = await epm_core.existing(session, """
        SELECT revision FROM public.epm_routes WHERE id=:id AND archived_at IS NULL FOR UPDATE
    """, "Jalur tidak ditemukan.", id=route_id)
    epm_core.revision_check(payload.expected_revision, locked["revision"])
    route = await epm_core.route_detail(session, route_id)
    section = cable_section(route, payload)
    chosen = sorted(map(str, payload.archive_point_ids))
    if not set(chosen).issubset({p["id"] for p in section["candidates"]}):
        epm_core.fail(422, "Titik yang diarsipkan harus termasuk kandidat di ruas ini.")
    if payload.incident_id:
        await epm_core.existing(session, """
            SELECT id FROM public.epm_route_incidents WHERE id=:incident
            AND route_id=:route AND archived_at IS NULL FOR SHARE
        """, "Kejadian aktif tidak ditemukan pada jalur ini.", incident=payload.incident_id, route=route_id)
    activity = {
        **section, "id": str(uuid4()), "active_at": payload.active_at.isoformat(),
        "incident_id": str(payload.incident_id) if payload.incident_id else None,
        "note": payload.note, "archived_point_ids": chosen,
    }
    if chosen:
        await session.execute(text("""
            UPDATE public.epm_route_points SET archived_at=now()
            WHERE route_id=:route AND id=ANY(CAST(:selected AS uuid[]))
        """), {"route":route_id, "selected":chosen})
        await session.execute(text("""
            WITH ordered AS (
                SELECT id, station_m-lag(station_m, 1, 0::double precision)
                    OVER (ORDER BY position, id) AS metres
                FROM public.epm_route_points WHERE route_id=:route AND archived_at IS NULL
            )
            UPDATE public.epm_route_points p SET segment_m=ordered.metres
            FROM ordered WHERE p.id=ordered.id
        """), {"route":route_id})
    await session.execute(text("""
        UPDATE public.epm_routes SET cable_replacements=cable_replacements || CAST(:activity AS jsonb),
            revision=revision+1, updated_at=now() WHERE id=:route
    """), {"route":route_id, "activity":json.dumps([activity], allow_nan=False)})
    return activity

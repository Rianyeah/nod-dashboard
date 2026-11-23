"""Shared EPM queries and mutations. The caller owns the database transaction."""

import json
import re
from datetime import date, datetime, time, timedelta, timezone
from typing import Literal
from uuid import UUID, uuid4

from fastapi import HTTPException
from pydantic import AwareDatetime, BaseModel, ConfigDict, Field
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError

from services.epm_geometry import prepare_route

WIB = timezone(timedelta(hours=7))
ROUTE_FIELDS = ("name", "start_site", "end_site", "area", "pic", "asset_ref",
                "reference_distance", "verification", "source", "geometry", "anchors", "length_m")
POINT_FIELDS = ("position","label","type","lat","lng","from_anchor_id","to_anchor_id","station_m","offset_m","segment_m","note")
INCIDENT_FIELDS = ("status","started_at","recovered_at","ticket","cause","action")


class Incident(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)
    id: UUID = Field(default_factory=uuid4)
    point_id: UUID
    route_id: UUID
    status: Literal["open","working","resolved","unknown"]
    started_at: AwareDatetime | None = None
    recovered_at: AwareDatetime | None = None
    ticket: str = Field(default="", max_length=150)
    cause: str = Field(default="", max_length=1000)
    action: str = Field(default="", max_length=2000)


def fail(status, message):
    raise HTTPException(status, detail=message)


def parse_route(payload):
    try:
        return prepare_route(payload)
    except ValueError as exc:
        fail(422, str(exc))


def parse_incident(payload, *, legacy=False):
    try:
        item = Incident.model_validate(payload)
    except ValueError as exc:
        fail(422, str(exc))
    if not legacy and (item.status == "unknown" or item.started_at is None):
        fail(422, "Isi waktu mulai dan status kejadian.")
    if not legacy and item.status == "resolved" and item.recovered_at is None:
        fail(422, "Isi waktu pemulihan untuk status CLOSED.")
    if item.recovered_at and (item.status != "resolved" or (item.started_at and item.recovered_at < item.started_at)):
        fail(422, "Waktu pemulihan hanya untuk status CLOSED dan harus setelah waktu kejadian.")
    return item.model_dump()


async def records(session, sql, **params):
    result = await session.execute(text(sql), params)
    return [dict(row) for row in result.mappings()]


async def existing(session, sql, message, **params):
    rows = await records(session, sql, **params)
    if not rows:
        fail(404, message)
    return rows[0]


def revision_check(expected, actual):
    if type(expected) is not int or expected <= 0:
        fail(422, "Versi data diperlukan untuk menyimpan perubahan.")
    if expected != actual:
        fail(409, "Data telah berubah di perangkat lain. Muat versi terbaru dan periksa kembali draf.")


async def list_routes(session, *, include_archived=False):
    return await records(session, """
        SELECT r.id,r.name,r.start_site,r.end_site,r.area,r.pic,r.asset_ref,r.reference_distance,
               r.verification,r.source,r.length_m,r.revision,r.updated_at,r.archived_at,
               (SELECT count(*) FROM epm_route_points p WHERE p.route_id=r.id AND p.archived_at IS NULL) AS point_count
        FROM epm_routes r WHERE (:include_archived OR r.archived_at IS NULL)
        ORDER BY r.name,r.id
    """, include_archived=include_archived)


def parse_site_codes(codes, limit=20):
    site_ids = sorted({code.strip().upper() for code in codes.split(",")})
    if len(site_ids) > limit or any(not re.fullmatch(r"[A-Z]{2,6}[0-9]{1,7}", code) for code in site_ids):
        fail(422, f"Masukkan maksimal {limit} ID Site Master yang valid.")
    return site_ids


async def site_master_details(session, codes):
    site_ids = parse_site_codes(codes)
    return await records(session, """
        SELECT DISTINCT ON ("Siteid") "Siteid" AS site_id, "Site Name" AS site_name,
               "Type Site" AS type_site, "Status Site" AS status_site, "NOP" AS nop,
               "Site Class" AS site_class, "Kabupaten/KOTA" AS kabupaten
        FROM public.data_site_master
        WHERE "Siteid" = ANY(CAST(:site_ids AS text[]))
        ORDER BY "Siteid", NULLIF(BTRIM("Site Name"), '') NULLS LAST
    """, site_ids=site_ids)


async def nearby_map_sites(session, bounds):
    west, south, east, north = bounds
    if east - west > 2 or north - south > 2:
        fail(422, "Perbesar peta untuk menampilkan site sekitar.")
    limit = 250
    sites = await records(session, """
        WITH sites AS (
            SELECT "Siteid" AS site_id, "Site Name" AS site_name,
                CASE WHEN BTRIM("Latitude"::text) ~ '^[+-]?[0-9]+([.][0-9]+)?$'
                     THEN "Latitude"::double precision END AS latitude,
                CASE WHEN BTRIM("Longitude"::text) ~ '^[+-]?[0-9]+([.][0-9]+)?$'
                     THEN "Longitude"::double precision END AS longitude
            FROM public.data_site_master
            WHERE NULLIF(BTRIM("Siteid"), '') IS NOT NULL
        )
        SELECT DISTINCT ON (site_id) site_id, site_name, latitude, longitude
        FROM sites WHERE longitude BETWEEN :west AND :east AND latitude BETWEEN :south AND :north
        ORDER BY site_id, latitude, longitude, site_name
        LIMIT :limit
    """, west=west, south=south, east=east, north=north, limit=limit+1)
    return {"sites":sites[:limit], "truncated":len(sites)>limit}


async def map_sector_directions(session, codes):
    return await records(session, """
        SELECT DISTINCT site_id, CASE WHEN azimuth=360 THEN 0 ELSE azimuth END AS azimuth
        FROM public.ransys_gabungan
        WHERE site_id=ANY(CAST(:site_ids AS text[])) AND azimuth BETWEEN 0 AND 360
        ORDER BY site_id, azimuth
    """, site_ids=parse_site_codes(codes, limit=2))


async def route_detail(session, route_id, *, include_archived=False):
    route = await existing(session, """
        SELECT * FROM epm_routes WHERE id=:id AND (:include_archived OR archived_at IS NULL)
        FOR SHARE
    """, "Jalur tidak ditemukan.", id=route_id, include_archived=include_archived)
    route["points"] = await records(session, """
        SELECT p.*, (SELECT count(*) FROM epm_evidence_photos f
                     WHERE f.point_id=p.id AND f.archived_at IS NULL) AS photo_count
        FROM epm_route_points p WHERE p.route_id=:id AND (:include_archived OR p.archived_at IS NULL)
        ORDER BY p.position,p.id
    """, id=route_id, include_archived=include_archived)
    return route


def route_params(route):
    params = {key:route[key] for key in ("id", *ROUTE_FIELDS)}
    for key in ("geometry","anchors"):
        params[key] = json.dumps(params[key], allow_nan=False)
    return params


def bind(key):
    return f"CAST(:{key} AS jsonb)" if key in ("anchors", "geometry") else f":{key}"


async def write_route(session, payload, *, update=False):
    route = parse_route(payload)
    params = route_params(route)
    columns = ("id", *ROUTE_FIELDS)
    if update:
        old = await existing(session, """
            SELECT geometry,revision FROM epm_routes WHERE id=:id AND archived_at IS NULL FOR UPDATE
        """, "Jalur tidak ditemukan.", id=route["id"])
        revision_check(payload.get("expected_revision"), old["revision"])
        if old["geometry"] != route["geometry"]:
            params["verification"] = "pending"
        assignments = ", ".join(f"{k}={bind(k)}" for k in ROUTE_FIELDS)
        await session.execute(text(f"""
            UPDATE epm_routes SET {assignments},revision=revision+1,updated_at=now() WHERE id=:id
        """),params)
    else:
        await session.execute(text(f"""
            INSERT INTO epm_routes ({','.join(columns)}) VALUES ({','.join(bind(k) for k in columns)})
        """), params)

    current_rows = await records(session, """
        SELECT id,type FROM epm_route_points WHERE route_id=:id AND archived_at IS NULL FOR UPDATE
    """, id=route["id"])
    current = {str(row["id"]):row["type"] for row in current_rows}
    inserts, updates, retyped = [], [], []
    for point in route["points"]:
        item = {key:point[key] for key in ("id", *POINT_FIELDS)}
        item["route_id"] = route["id"]
        if item["id"] in current:
            if current[item["id"]] == "tipus" and item["type"] != "tipus":
                retyped.append(item["id"])
            updates.append(item)
        else:
            inserts.append(item)
    if retyped:
        protected = await records(session, """
            SELECT id FROM epm_route_incidents WHERE point_id=ANY(CAST(:ids AS uuid[]))
            LIMIT 1
        """, ids=retyped)
        if protected:
            fail(422, "Lokasi dengan riwayat gangguan harus tetap bertipe titik putus.")
    if updates:
        assignments = ",".join(f"{k}=:{k}" for k in POINT_FIELDS)
        await session.execute(text(f"UPDATE epm_route_points SET {assignments} WHERE id=:id AND route_id=:route_id"), updates)
    if inserts:
        cols = ("id","route_id", *POINT_FIELDS)
        await session.execute(text(f"INSERT INTO epm_route_points ({','.join(cols)}) VALUES ({','.join(':'+k for k in cols)})"), inserts)
    stale = set(current) - {p["id"] for p in route["points"]}
    if stale:
        await session.execute(text("""
            UPDATE epm_route_points SET archived_at=now() WHERE route_id=:id AND id=ANY(CAST(:stale AS uuid[]))
        """), {"id":route["id"], "stale":list(stale)})
    return await route_detail(session, route["id"])


async def create_route(session, payload):
    try:
        return await write_route(session, payload)
    except IntegrityError:
        fail(409, "ID jalur atau titik sudah dipakai.")


async def update_route(session, route_id, payload):
    try:
        return await write_route(session, {**payload, "id":str(route_id)}, update=True)
    except IntegrityError:
        fail(409, "ID titik sudah dipakai.")


async def archive(session, table, identifier, revision):
    if table not in ("epm_routes","epm_route_incidents"):
        raise ValueError("Unsupported archive target")
    entry = await existing(session, f"SELECT revision FROM {table} WHERE id=:id AND archived_at IS NULL FOR UPDATE",
                           "Data tidak ditemukan.", id=identifier)
    revision_check(revision, entry["revision"])
    await session.execute(text(f"UPDATE {table} SET archived_at=now(),updated_at=now(),revision=revision+1 WHERE id=:id"), {"id":identifier})


async def create_incident(session, payload, *, legacy=False):
    data = parse_incident(payload, legacy=legacy)
    await existing(session, """
        SELECT p.id FROM epm_route_points p JOIN epm_routes r ON r.id=p.route_id
        WHERE p.id=:point_id AND r.id=:route_id AND p.type='tipus'
        AND p.archived_at IS NULL AND r.archived_at IS NULL FOR SHARE OF p,r
    """, "Titik putus aktif tidak ditemukan pada jalur ini.", route_id=data["route_id"],point_id=data["point_id"])
    cols = ("id","route_id","point_id", *INCIDENT_FIELDS)
    try:
        rows = await records(session,f"INSERT INTO epm_route_incidents ({','.join(cols)}) VALUES ({','.join(':'+c for c in cols)}) RETURNING *",**data)
    except IntegrityError:
        fail(409, "ID kejadian sudah dipakai.")
    return rows[0]


async def update_incident(session, incident_id, payload):
    old = await existing(session, "SELECT * FROM epm_route_incidents WHERE id=:id AND archived_at IS NULL FOR UPDATE",
                         "Kejadian tidak ditemukan.", id=incident_id)
    revision_check(payload.get("expected_revision"),old["revision"])
    data = parse_incident({**old, **{k:v for k,v in payload.items() if k in INCIDENT_FIELDS}})
    assigns = ",".join(f"{k}=:{k}" for k in INCIDENT_FIELDS)
    rows = await records(session, f"UPDATE epm_route_incidents SET {assigns},revision=revision+1,updated_at=now() WHERE id=:id RETURNING *", **data)
    return rows[0]


def day_bounds(day: date, *, end=False):
    if end and day == date.max:
        return datetime.max.replace(tzinfo=WIB)
    return datetime.combine(day + timedelta(days=int(end)), time.min, tzinfo=WIB)


async def list_incidents(session, *, route_id=None, point_id=None, status=None,
                         date_from=None, date_to=None, include_archived=False):
    if date_from and date_to and date_from > date_to:
        fail(422, "Tanggal akhir mendahului tanggal awal.")
    clauses, params = ["(:include_archived OR i.archived_at IS NULL)"], {"include_archived":include_archived}
    for field, val in (("route_id",route_id),("point_id",point_id),("status",status)):
        if val is not None:
            clauses.append(f"i.{field}=:{field}")
            params[field] = val
    if date_from:
        clauses.append("i.started_at >= :start")
        params["start"] = day_bounds(date_from)
    if date_to:
        clauses.append("i.started_at < :end")
        params["end"] = day_bounds(date_to,end=True)
    return await records(session, f"""
        SELECT i.*,r.name AS route_name,p.label AS point_label,p.station_m,p.archived_at AS point_archived_at,
               extract(epoch FROM (i.recovered_at-i.started_at))/60 AS duration_minutes
        FROM epm_route_incidents i JOIN epm_routes r ON r.id=i.route_id
        JOIN epm_route_points p ON p.id=i.point_id
        WHERE {' AND '.join(clauses)} ORDER BY i.started_at DESC NULLS LAST,i.id
    """,**params)

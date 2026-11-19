"""Portable EPM collections. File contents are only included in ZIP archives."""
import csv
import hashlib
import io
import json
from bisect import bisect_right
from contextlib import nullcontext
from datetime import datetime
from uuid import UUID, uuid5, NAMESPACE_URL
from zipfile import BadZipFile, ZipFile

from fastapi import HTTPException
from fastapi.encoders import jsonable_encoder
from sqlalchemy import text

from services import epm_core, epm_photos
from services.epm_geometry import stations

WIB = epm_core.WIB
SEED_ID = "051e7738-a501-5112-974e-b57f16b05195"
MAX_JSON = 16 * 1024**2
MAX_ARCHIVE = 512 * 1024**2
SCHEMA = "epm-route-collection"


def invalid(message):
    raise HTTPException(422, message)


def key(value):
    return str(UUID(str(value)))


def stable(name):
    return str(uuid5(NAMESPACE_URL, "nod:epm:" + str(name)))


def wib(value):
    if not value:
        return ""
    return datetime.fromisoformat(str(value)).astimezone(WIB).isoformat(timespec="minutes")


async def rows(session, query, params=None):
    return [dict(row) for row in (await session.execute(text(query), params or {})).mappings()]


async def snapshot(session):
    # One transaction snapshot prevents mixed route and point revisions during export.
    await session.execute(text("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY"))
    routes = await rows(session, "SELECT * FROM public.epm_routes ORDER BY name, id")
    points = await rows(session, "SELECT * FROM public.epm_route_points ORDER BY route_id, position, id")
    incidents = await rows(session, "SELECT * FROM public.epm_route_incidents ORDER BY started_at DESC NULLS LAST,id")
    photos = await rows(session, """SELECT f.*,p.route_id FROM public.epm_evidence_photos f
        JOIN public.epm_route_points p ON f.point_id=p.id ORDER BY f.created_at,f.id""")
    lookup = {r["id"]: r for r in routes}
    for r in routes:
        r.update(points=[], incidents=[], photos=[])
    for name, items in (("points", points), ("incidents", incidents), ("photos", photos)):
        for item in items:
            lookup[item["route_id"]][name].append(item)
    return jsonable_encoder(dict(schema=SCHEMA, version=1, routes=routes))


def portable(collection):
    return {**collection, "routes": [{**r, "photos": [
        {k:v for k,v in p.items() if k not in {"object_prefix","storage_key"}}
        for p in r["photos"]]} for r in collection["routes"]]}


def legacy_route(data, default_id=None):
    pts = data["points"]
    if len(pts)<2 or len(pts)>1000:
        invalid("Jumlah titik dalam cadangan lama tidak valid.")
    source_id = data.get("id") or default_id
    if not source_id:
        invalid("ID jalur pada cadangan lama kosong.")
    route_id = SEED_ID if source_id in {"psn053-epm139", "original"} else stable(source_id)
    coords = [[v["lng"],v["lat"]] for v in data["geometry"]]
    if not 2 <= len(coords) <= 30000:
        invalid("Geometri cadangan lama tidak valid.")
    # Legacy files carry chainage along the saved road, including at crossings.
    # Carry this through as an interval restriction at each surrounding vertex.
    chain = stations(coords)
    def station_index(p):
        return max(0,min(len(coords)-2,bisect_right(chain,p["stationM"])-1))
    indices = sorted({0,len(coords)-1} | {j for p in pts for j in (station_index(p), station_index(p)+1)})
    anchor_ids = {i:stable(f"{route_id}/vertex/{i}") for i in indices}
    if len(indices) > 1000:
        invalid("Jumlah bagian trase cadangan lama melebihi batas.")
    anchors = [dict(id=anchor_ids[i],lng=coords[i][0],lat=coords[i][1],vertex_index=i,label=f"Titik trase {i+1}") for i in indices]
    points, events = [], []
    for p in pts:
        pid = stable(f"{route_id}/point/{p['id']}")
        j = station_index(p)
        points.append(dict(id=pid,label=p["label"],type=p["type"],lat=p["lat"],lng=p["lng"],note=p.get("note",""),
                           from_anchor_id=anchor_ids[j],to_anchor_id=anchor_ids[j+1],station_m=p["stationM"]))
        event = p.get("incident") or {}
        if event.get("status","unknown")!="unknown" or any(event.get(k) for k in ("ticket","start","end","cause","action")):
            def local_time(v):
                return datetime.fromisoformat(v).replace(tzinfo=WIB).isoformat() if v else None
            events.append(dict(id=stable(f"{pid}/legacy-event"),route_id=route_id,point_id=pid,status=event.get("status","unknown"),
                started_at=local_time(event.get("start")),recovered_at=local_time(event.get("end")),ticket=event.get("ticket",""),
                cause=event.get("cause",""),action=event.get("action","")))
    info=data.get("info") or {}
    return dict(id=route_id,name=data.get("name") or "PSN053 → EPM139", start_site=pts[0]["label"],end_site=pts[-1]["label"],
        reference_distance="4,7–4,8 km (acuan)" if route_id == SEED_ID else "",
        area=info.get("area",""),pic=info.get("pic",""),asset_ref=info.get("ref",""),verification=info.get("verify","pending"),
        source="imported",geometry=dict(type="LineString",coordinates=coords),anchors=anchors,points=points,incidents=events,photos=[])


def read_backup(file, zipped):
    file.seek(0)
    try:
        with (ZipFile(file) if zipped else nullcontext()) as z:
            if z:
                names = z.namelist()
                if len(names)!=len(set(names)) or len(names)>5000 or sum(i.file_size for i in z.infolist())>MAX_ARCHIVE:
                    invalid("Ukuran atau isi paket ZIP tidak valid.")
                if z.getinfo("collection.json").file_size>MAX_JSON:
                    invalid("Manifest cadangan terlalu besar.")
                data=json.loads(z.read("collection.json"))
            else:
                data=json.load(file)
            schema,version=data.get("schema"),data.get("version")
            if (schema,version)==("psn053-epm139-road-route",2):
                routes=[legacy_route(data,"psn053-epm139")]
            elif (schema,version)==("fo-route-collection",3):
                routes=[legacy_route(r) for r in data["routes"]]
            elif (schema,version)==(SCHEMA,1):
                routes=data["routes"]
            else:
                invalid("Format atau versi cadangan tidak dikenali.")
            if not isinstance(routes,list) or len(routes)>1000:
                invalid("Koleksi jalur tidak valid.")
            ids=set()
            child_ids = {"points": set(), "incidents": set(), "photos": set()}
            for r in routes:
                rid=key(r["id"])
                if rid in ids or not isinstance(r["name"],str):
                    invalid("Identitas jalur dalam cadangan tidak valid.")
                ids.add(rid)
                r["id"] = rid
                for field in ("points","incidents","photos"):
                    if not isinstance(r.get(field),list):
                        invalid("Daftar titik, kejadian, atau foto tidak valid.")
                    batch=[key(i["id"]) for i in r[field]]
                    if len(set(batch))!=len(batch) or child_ids[field].intersection(batch):
                        invalid("Cadangan berisi ID duplikat.")
                    child_ids[field].update(batch)
                epm_core.parse_route({**r, "points": [p for p in r["points"] if not p.get("archived_at")]})
                pts={key(p["id"]): p["type"] for p in r["points"]}
                for event in r["incidents"]:
                    epm_core.parse_incident({**event, "route_id": rid}, legacy=True)
                events={key(e["id"]):key(e["point_id"]) for e in r["incidents"]}
                if any(pts.get(pid) != "tipus" for pid in events.values()):
                    invalid("Kejadian merujuk titik di luar jalur.")
                for photo in r["photos"]:
                    pid=key(photo["point_id"])
                    if pts.get(pid) != "tipus" or (photo.get("incident_id") and events.get(key(photo["incident_id"]))!=pid):
                        invalid("Hubungan foto, titik, dan kejadian tidak valid.")
                    if z:
                        read_original(z,photo)
            return routes
    except (BadZipFile, ValueError, KeyError, IndexError, TypeError, AttributeError, RuntimeError, OSError, OverflowError) as exc:
        invalid("Isi cadangan rusak atau tidak sesuai format.")


def read_original(z, photo):
    name=f"originals/{key(photo['id'])}"
    size=z.getinfo(name).file_size
    if size!=photo["size_bytes"] or not 0<size<=10*1024**2:
        invalid("Ukuran foto dalam cadangan tidak sesuai.")
    data=z.read(name)
    if hashlib.sha256(data).hexdigest()!=photo["sha256"]:
        invalid("Checksum foto dalam cadangan tidak sesuai.")
    return data


async def preview(session,routes,zipped):
    existing={str(row["id"]) for row in await rows(session,"SELECT id FROM public.epm_routes")}
    return {"routes":[{"id":r["id"],"name":r["name"],"duplicate":r["id"] in existing,
        "points":len(r["points"]),"incidents":len(r["incidents"]),"photos":len(r["photos"]) if zipped else 0}
        for r in routes], "with_originals":zipped}


async def restore_timestamps(session, table, identifier, record):
    # Only the two internal call sites supply the table name.
    values = {field: datetime.fromisoformat(record[field]) if record.get(field) else None
              for field in ("created_at", "updated_at", "archived_at")}
    await session.execute(text(f"""
        UPDATE public.{table} SET
          created_at=COALESCE(CAST(:created_at AS timestamptz),created_at),
          updated_at=COALESCE(CAST(:updated_at AS timestamptz),updated_at),
          archived_at=:archived_at
        WHERE id=:id
    """), {"id": identifier, **values})


async def restore(session,routes,file,zipped,copy,operation,uploaded):
    # Serialize import checks across clients, including retries with the same idempotency key.
    await session.execute(text("SELECT pg_advisory_xact_lock(1836020781)"))
    existing={str(row["id"]) for row in await rows(session,"SELECT id FROM public.epm_routes")}
    created=skipped=0
    for r in routes:
        def remap(value):
            return stable(f"{operation}/{r['id']}/{value}") if copy else key(value)
        rid=remap(r["id"])
        if rid in existing:
            skipped+=1
            continue
        points=[{**p,"id":remap(p["id"])} for p in r["points"]]
        active=[p for p in points if not p.get("archived_at")]
        await epm_core.create_route(session,{**r,"id":rid,"points":active})
        for p in points:
            if p.get("archived_at"):
                await session.execute(text("""INSERT INTO public.epm_route_points
                    (id,route_id,label,type,position,lat,lng,from_anchor_id,to_anchor_id,station_m,segment_m,offset_m,note)
                    VALUES (:id,:route_id,:label,:type,:position,:lat,:lng,:from_anchor_id,:to_anchor_id,:station_m,:segment_m,:offset_m,:note)"""),
                    {**p,"route_id":rid})
        for e in r["incidents"]:
            eid=remap(e["id"])
            await epm_core.create_incident(session,{**e,"id":eid,"route_id":rid,"point_id":remap(e["point_id"])},legacy=True)
            await restore_timestamps(session, "epm_route_incidents", eid, e)
        if zipped:
            with ZipFile(file) as z:
                for p in r["photos"]:
                    pid=remap(p["id"])
                    await epm_photos.save_photo(session,photo_id=UUID(pid),point_id=UUID(remap(p["point_id"])),
                        incident_id=UUID(remap(p["incident_id"])) if p.get("incident_id") else None,
                        caption=p.get("caption",""),raw=read_original(z,p),created_at=datetime.fromisoformat(p["created_at"]),
                        uploaded_prefixes=uploaded,restoring=True)
                    if p.get("archived_at"):
                        await session.execute(text("UPDATE public.epm_evidence_photos SET archived_at=:value WHERE id=:id"),
                                              {"value":datetime.fromisoformat(p["archived_at"]),"id":pid})
        for p in points:
            if p.get("archived_at"):
                await session.execute(text("UPDATE public.epm_route_points SET archived_at=:value WHERE id=:id"),
                                      {"value":datetime.fromisoformat(p["archived_at"]),"id":p["id"]})
        await restore_timestamps(session, "epm_routes", rid, r)
        existing.add(rid)
        created+=1
    return {"created":created,"skipped":skipped}


def as_csv(headers, records):
    dest=io.StringIO(newline="")
    writer=csv.writer(dest)
    writer.writerow(headers)
    for record in records:
        writer.writerow(["'"+s if isinstance(s,str) and s.lstrip().startswith(("=","+","-","@")) else s for s in record])
    return dest.getvalue().encode("utf-8-sig")

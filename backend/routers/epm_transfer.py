"""Authenticated collection backup, validated import and field reports."""
import hashlib
import json
import os
import tempfile
from datetime import date
from typing import Annotated, Literal
from uuid import UUID
from zipfile import ZipFile, ZIP_STORED

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import FileResponse, Response
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.background import BackgroundTask
from starlette.concurrency import run_in_threadpool

from database import get_session
from services import epm_core, epm_photos
from services.epm_transfer import (
    MAX_ARCHIVE, MAX_JSON, as_csv, portable, preview, read_backup, restore, snapshot, wib,
)

router = APIRouter(prefix="/epm", tags=["Peta Jalur EPM"])
Session = Annotated[AsyncSession, Depends(get_session)]


def download(data, mime, filename):
    return Response(data, media_type=mime, headers={"Content-Disposition": f'attachment; filename="{filename}"'})


async def full_backup(collection):
    manifest = json.dumps(portable(collection),ensure_ascii=False).encode()
    if len(manifest)>MAX_JSON:
        raise HTTPException(413,"Manifest cadangan melebihi batas pemulihan 16 MiB.")
    photos = [p for r in collection["routes"] for p in r["photos"]]
    if len(photos)>=5000 or sum(p["size_bytes"] for p in photos)+len(manifest)+len(photos)*160+256>MAX_ARCHIVE:
        raise HTTPException(413,"Koleksi melebihi kapasitas satu paket ZIP (512 MiB).")
    with tempfile.NamedTemporaryFile(suffix=".zip",delete=False) as dest:
        path=dest.name
    try:
        with ZipFile(path,"w",ZIP_STORED) as archive:
            archive.writestr("collection.json",manifest)
            for p in photos:
                data=await epm_photos.get_original(p)
                if len(data) != p["size_bytes"] or hashlib.sha256(data).hexdigest() != p["sha256"]:
                    raise HTTPException(503,"Foto asli pada penyimpanan gagal diverifikasi.")
                await run_in_threadpool(archive.writestr,f"originals/{p['id']}",data)
        return FileResponse(path,media_type="application/zip",filename="cadangan-epm.zip",
                            background=BackgroundTask(os.unlink,path))
    except BaseException:
        os.unlink(path)
        raise


@router.get("/exports/{kind}")
async def export_data(kind:Literal["json","zip","routes","points","incidents","geojson"], session:Session,
                      route_id:UUID|None=None,status:str|None=None,date_from:date|None=None,date_to:date|None=None):
    if kind=="incidents":
        records=await epm_core.list_incidents(session,route_id=route_id,status=status,date_from=date_from,date_to=date_to)
        body=as_csv(["Jalur","Titik","Tiket","Status","Mulai WIB","Pulih WIB","Durasi (menit)","Penyebab","Tindakan"],
            [(r["route_name"],r["point_label"],r["ticket"],r["status"],wib(r["started_at"]),wib(r["recovered_at"]),
              (r["recovered_at"]-r["started_at"]).total_seconds()/60 if r["started_at"] and r["recovered_at"] else None,
              r["cause"],r["action"]) for r in records])
        return download(body,"text/csv","gangguan-epm.csv")
    collection=await snapshot(session)
    await session.commit()
    if kind=="zip":
        return await full_backup(collection)
    if kind=="json":
        return download(json.dumps(portable(collection),ensure_ascii=False),"application/json","koleksi-epm.json")
    routes=[r for r in collection["routes"] if not r["archived_at"]]
    points=[(r,p) for r in routes for p in r["points"] if not p["archived_at"]]
    if kind=="routes":
        return download(as_csv(["Jalur","Awal","Akhir","Area","PIC","Referensi","Verifikasi","Panjang (m)"],
            [(r["name"],r["start_site"],r["end_site"],r["area"],r["pic"],r["asset_ref"],r["verification"],r["length_m"]) for r in routes]),
            "text/csv","inventaris-epm.csv")
    if kind=="points":
        return download(as_csv(["Jalur","Titik","Jenis","Latitude","Longitude","Jarak kumulatif (m)","Jarak segmen (m)","Catatan"],
            [(r["name"],p["label"],p["type"],p["lat"],p["lng"],p["station_m"],p["segment_m"],p["note"]) for r,p in points]),
            "text/csv","titik-epm.csv")
    features=[dict(type="Feature",geometry=r["geometry"],properties={k:r[k] for k in ("id","name","source","verification","length_m")}) for r in routes]
    features.extend(dict(type="Feature",geometry=dict(type="Point",coordinates=[p["lng"],p["lat"]]),
        properties={k:p[k] for k in ("id","route_id","label","type","station_m","note")}) for _,p in points)
    return download(json.dumps(dict(type="FeatureCollection",features=features)),"application/geo+json","jalur-epm.geojson")


async def read_import(request):
    zipped=request.headers.get("content-type","").split(";")[0]=="application/zip"
    spool=tempfile.SpooledTemporaryFile(max_size=2*1024**2)
    try:
        size=0
        async for chunk in request.stream():
            size+=len(chunk)
            if size>(MAX_ARCHIVE if zipped else MAX_JSON):
                raise HTTPException(413,"Cadangan terlalu besar.")
            spool.write(chunk)
        routes=await run_in_threadpool(read_backup,spool,zipped)
        return spool,routes,zipped
    except BaseException:
        spool.close()
        raise


@router.post("/imports/preview")
async def preview_import(request:Request,session:Session):
    spool,routes,zipped=await read_import(request)
    try:
        return await preview(session,routes,zipped)
    finally:
        spool.close()


@router.post("/imports/commit")
async def commit_import(request:Request,session:Session,operation:UUID,copy:bool=False):
    spool,routes,zipped=await read_import(request)
    uploaded=[]
    try:
        async with session.begin():
            result=await restore(session,routes,spool,zipped,copy,operation,uploaded)
        return result
    except BaseException as exc:
        await epm_photos.cleanup_prefixes(uploaded)
        if isinstance(exc,IntegrityError):
            raise HTTPException(409,"Identitas dalam cadangan sudah digunakan. Periksa pratinjau atau impor sebagai salinan.") from exc
        if isinstance(exc,(KeyError,TypeError,ValueError)):
            raise HTTPException(422,"Data dalam cadangan tidak sesuai format.") from exc
        raise
    finally:
        spool.close()

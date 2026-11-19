"""Dashboard endpoints for private point and incident photo evidence."""
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_session
from services.epm_photos import MAX_BYTES, PUBLIC_FIELDS, cleanup_prefixes, get_photo_bytes, save_photo

router = APIRouter(prefix="/epm", tags=["Peta Jalur EPM"])


class CaptionUpdate(BaseModel):
    caption: str = Field(max_length=500)


@router.get("/points/{point_id}/photos")
async def list_photos(point_id: UUID, incident_id: UUID | None = None,
                      session: AsyncSession = Depends(get_session)):
    query = f"SELECT {PUBLIC_FIELDS} FROM epm_evidence_photos WHERE point_id=:point AND archived_at IS NULL"
    params = {"point": point_id}
    if incident_id is not None:
        query += " AND incident_id=:incident"
        params["incident"] = incident_id
    rows = await session.execute(text(query + " ORDER BY created_at DESC, id"), params)
    return [dict(row) for row in rows.mappings()]


@router.post("/points/{point_id}/photos", status_code=201)
async def upload_photo(point_id: UUID, upload_id: UUID, request: Request,
                       incident_id: UUID | None = None, caption: str = Query("", max_length=500),
                       session: AsyncSession = Depends(get_session)):
    data = bytearray()
    async for chunk in request.stream():
        if len(data) + len(chunk) > MAX_BYTES:
            raise HTTPException(413, "Ukuran foto maksimal 10 MiB.")
        data.extend(chunk)
    prefixes = []
    row = await save_photo(session, photo_id=upload_id, point_id=point_id, incident_id=incident_id,
                           caption=caption, raw=bytes(data), uploaded_prefixes=prefixes)
    try:
        await session.commit()
    except Exception:
        # A lost commit acknowledgement can still mean the database committed.
        await session.rollback()
        published = await session.scalar(text("SELECT object_prefix FROM epm_evidence_photos WHERE id=:id"),
                                         {"id": upload_id})
        await cleanup_prefixes(prefix for prefix in prefixes if prefix != published)
        raise
    return row


@router.get("/photos/{photo_id}/{variant}")
async def read_photo(photo_id: UUID, variant: Literal["thumbnail", "preview", "original"],
                     session: AsyncSession = Depends(get_session)):
    row = (await session.execute(text("""
        SELECT id, object_prefix, media_type FROM epm_evidence_photos
        WHERE id=:id AND archived_at IS NULL"""), {"id": photo_id})).mappings().first()
    if row is None:
        raise HTTPException(404, "Foto tidak ditemukan.")
    body = await get_photo_bytes(row, variant)
    return Response(content=body, media_type=row["media_type"] if variant == "original" else "image/jpeg")


@router.patch("/photos/{photo_id}")
async def update_caption(photo_id: UUID, value: CaptionUpdate, session: AsyncSession = Depends(get_session)):
    row = (await session.execute(text(f"""
        UPDATE epm_evidence_photos SET caption=:caption WHERE id=:id AND archived_at IS NULL
        RETURNING {PUBLIC_FIELDS}"""), {"id": photo_id, "caption": value.caption.strip()})).mappings().first()
    if row is None:
        raise HTTPException(404, "Foto tidak ditemukan.")
    await session.commit()
    return dict(row)


@router.delete("/photos/{photo_id}", status_code=204)
async def archive_photo(photo_id: UUID, session: AsyncSession = Depends(get_session)):
    found = await session.scalar(text("""
        UPDATE epm_evidence_photos SET archived_at=COALESCE(archived_at,now())
        WHERE id=:id RETURNING id"""), {"id": photo_id})
    if found is None:
        raise HTTPException(404, "Foto tidak ditemukan.")
    await session.commit()
    return Response(status_code=204)

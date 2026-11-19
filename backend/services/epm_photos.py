"""Photo processing, private object storage and transaction-scoped evidence metadata."""
from __future__ import annotations

import asyncio
import hashlib
import io
import logging
import os
from datetime import datetime
from functools import lru_cache
from uuid import UUID, uuid4

import boto3
from botocore.config import Config
from botocore.exceptions import BotoCoreError, ClientError
from fastapi import HTTPException
from PIL import Image, ImageOps, UnidentifiedImageError
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

log = logging.getLogger(__name__)
MAX_BYTES = 10 * 1024 * 1024
MAX_PIXELS = 50_000_000
FORMATS = {"JPEG": "image/jpeg", "PNG": "image/png", "WEBP": "image/webp"}
VARIANTS = ("original", "preview", "thumbnail")
PUBLIC_FIELDS = "id, point_id, incident_id, caption, media_type, size_bytes, width, height, sha256, created_at"
# Limit peak memory when several phones send high-resolution photos together.
image_workers = asyncio.Semaphore(2)


def decode_photo(raw: bytes):
    if len(raw) > MAX_BYTES:
        raise HTTPException(413, "Ukuran foto maksimal 10 MiB.")
    try:
        with Image.open(io.BytesIO(raw), formats=list(FORMATS)) as image:
            media_type = FORMATS[image.format]
            if image.width * image.height > MAX_PIXELS:
                raise HTTPException(422, "Resolusi foto maksimal 50 megapiksel.")
            image.verify()
        with Image.open(io.BytesIO(raw), formats=list(FORMATS)) as image:
            image.load()
            oriented = ImageOps.exif_transpose(image)
            width, height = oriented.size
            oriented.thumbnail((1600, 1600), Image.Resampling.LANCZOS)
            rgba = oriented.convert("RGBA")
            rgb = Image.new("RGB", rgba.size, "white")
            rgb.paste(rgba, mask=rgba.getchannel("A"))
            buffers = {}
            for variant, side, quality in (("preview", 1600, 86), ("thumbnail", 340, 78)):
                rgb.thumbnail((side, side), Image.Resampling.LANCZOS)
                buffer = io.BytesIO()
                rgb.save(buffer, "JPEG", quality=quality)
                buffers[variant] = buffer.getvalue()
        return media_type, width, height, buffers
    except (UnidentifiedImageError, OSError, ValueError, SyntaxError, Image.DecompressionBombError) as exc:
        raise HTTPException(422, "Foto tidak dapat dibaca. Gunakan JPEG, PNG, atau WebP yang valid.") from exc


@lru_cache(maxsize=1)
def storage_client():
    names = ("AWS_ENDPOINT_URL_S3", "AWS_REGION", "AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY")
    if not all(os.getenv(key) for key in names):
        raise HTTPException(503, "Penyimpanan foto belum dikonfigurasi.")
    return boto3.client("s3", endpoint_url=os.environ[names[0]], region_name=os.environ[names[1]],
                        aws_access_key_id=os.environ[names[2]], aws_secret_access_key=os.environ[names[3]],
                        config=Config(signature_version="s3v4", s3={"addressing_style": "path"},
                                      retries={"total_max_attempts": 3}, connect_timeout=8, read_timeout=35,
                                      request_checksum_calculation="when_required",
                                      response_checksum_validation="when_required"))


def bucket():
    return os.getenv("EPM_EVIDENCE_BUCKET", "uploads")


def _write_variants(prefix, raw, mime, variants):
    client = storage_client()
    for variant, data in {"original": raw, **variants}.items():
        client.put_object(Bucket=bucket(), Key=f"{prefix}/{variant}", Body=data,
                          ContentType=mime if variant == "original" else "image/jpeg")


def _delete_prefix(prefix):
    client = storage_client()
    for variant in VARIANTS:
        client.delete_object(Bucket=bucket(), Key=f"{prefix}/{variant}")


async def cleanup_prefixes(prefixes):
    for prefix in prefixes:
        try:
            await asyncio.to_thread(_delete_prefix, prefix)
        except (BotoCoreError, ClientError, HTTPException):
            log.exception("Could not clean evidence object prefix %s", prefix)


def _read_object(key):
    response = storage_client().get_object(Bucket=bucket(), Key=key)
    body = response["Body"]
    try:
        return body.read()
    finally:
        body.close()


async def get_photo_bytes(row, variant):
    if variant not in VARIANTS:
        raise HTTPException(404, "Jenis gambar tidak ditemukan.")
    try:
        return await asyncio.to_thread(_read_object, f"{row['object_prefix']}/{variant}")
    except (BotoCoreError, ClientError) as exc:
        log.warning("Reading evidence failed: %s", type(exc).__name__)
        raise HTTPException(503, "Foto belum bisa dimuat dari penyimpanan. Coba lagi.") from exc


async def get_original(row):
    return await get_photo_bytes(row, "original")


async def save_photo(session: AsyncSession, *, photo_id: UUID, point_id: UUID, incident_id: UUID | None,
                     caption: str, raw: bytes, created_at: datetime | None = None,
                     uploaded_prefixes: list[str] | None = None, restoring: bool = False):
    """Caller owns commit; roll back and clean collected prefixes on transaction failure."""
    if not isinstance(caption, str) or len(caption) > 500:
        raise HTTPException(422, "Keterangan maksimal 500 karakter.")
    if len(raw) > MAX_BYTES:
        raise HTTPException(413, "Ukuran foto maksimal 10 MiB.")
    digest = hashlib.sha256(raw).hexdigest()
    # Serialize retries of one upload before calling storage. Other uploads stay independent.
    await session.execute(text("SELECT pg_advisory_xact_lock(hashtextextended(:key, 0))"),
                          {"key": str(photo_id)})
    existing = (await session.execute(text(f"SELECT {PUBLIC_FIELDS}, archived_at FROM epm_evidence_photos WHERE id=:id"),
                                      {"id": photo_id})).mappings().first()
    if existing:
        if (str(existing["point_id"]) != str(point_id) or str(existing["incident_id"]) != str(incident_id)
                or existing["sha256"] != digest or existing["archived_at"] is not None):
            raise HTTPException(409, "ID unggahan ini telah digunakan untuk foto lain atau sudah diarsipkan.")
        return {k: v for k, v in existing.items() if k != "archived_at"}

    active = "" if restoring else " AND p.archived_at IS NULL AND r.archived_at IS NULL"
    point = await session.scalar(text(f"""
        SELECT p.id FROM epm_route_points p JOIN epm_routes r ON r.id=p.route_id
        WHERE p.id=:id AND p.type='tipus'{active} FOR SHARE OF p,r"""), {"id": point_id})
    if point is None:
        raise HTTPException(404, "Titik putus tidak ditemukan.")
    if incident_id is not None:
        active_incident = "" if restoring else " AND archived_at IS NULL"
        found = await session.scalar(text(f"""
            SELECT id FROM epm_route_incidents WHERE id=:incident AND point_id=:point
            {active_incident} FOR SHARE"""), {"incident": incident_id, "point": point_id})
        if found is None:
            raise HTTPException(422, "Kejadian harus berasal dari titik putus yang sama.")

    async with image_workers:
        mime, width, height, variants = await asyncio.to_thread(decode_photo, raw)
    # Each attempt gets a unique prefix so rollback cleanup cannot collide with a successful retry.
    prefix = f"photos/{photo_id}/{uuid4()}"
    try:
        await asyncio.to_thread(_write_variants, prefix, raw, mime, variants)
        row = (await session.execute(text(f"""
            INSERT INTO epm_evidence_photos
              (id, point_id, incident_id, caption, media_type, size_bytes, width, height, sha256, object_prefix, created_at)
            VALUES (:id,:point,:incident,:caption,:mime,:size,:width,:height,:digest,:prefix,
                    COALESCE(CAST(:created AS timestamptz), now()))
            RETURNING {PUBLIC_FIELDS}"""),
            {"id": photo_id, "point": point_id, "incident": incident_id, "caption": caption.strip(),
             "mime": mime, "size": len(raw), "width": width, "height": height, "digest": digest,
             "prefix": prefix, "created": created_at})).mappings().one()
    except BaseException as exc:
        await cleanup_prefixes([prefix])
        if isinstance(exc, (BotoCoreError, ClientError)):
            raise HTTPException(503, "Unggah foto ke penyimpanan gagal. Coba lagi.") from exc
        raise
    if uploaded_prefixes is not None:
        uploaded_prefixes.append(prefix)
    return dict(row)

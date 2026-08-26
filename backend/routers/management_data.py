"""Human-admin endpoints for allowlisted data imports, PIC aliases, and users."""

from __future__ import annotations

from uuid import uuid4

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Request, UploadFile, status
from pydantic import BaseModel, Field
from sqlalchemy import exc, text

from database import async_session
from security import require_permission
from services.management_imports import (
    TARGETS,
    commit_import,
    get_job,
    list_jobs,
    normalize_pic_key,
    normalize_text,
    validate_import,
)
from user_store import AppUser, ROLES


router = APIRouter(prefix="/management-data", tags=["Management Data"])


class AliasInput(BaseModel):
    alias: str = Field(min_length=1, max_length=160)
    canonical_pic: str = Field(min_length=1, max_length=160)


class UserCreateInput(BaseModel):
    username: str = Field(min_length=3, max_length=128, pattern=r"^[A-Za-z0-9._-]+$")
    password: str = Field(min_length=12, max_length=1024)
    role: str


class UserUpdateInput(BaseModel):
    role: str | None = None
    is_active: bool | None = None
    new_password: str | None = Field(default=None, min_length=12, max_length=1024)


@router.get("/targets")
async def get_targets(_: AppUser = Depends(require_permission("management_data:write"))):
    return [dict(key=key, **definition) for key, definition in TARGETS.items()]


@router.post("/imports/validate", status_code=status.HTTP_201_CREATED)
async def validate_files(
    target: str = Form(...),
    files: list[UploadFile] = File(...),
    actor: AppUser = Depends(require_permission("management_data:write")),
):
    return await validate_import(target, files, actor)


@router.post("/imports/{job_id}/commit")
async def commit_files(
    job_id: str,
    actor: AppUser = Depends(require_permission("management_data:write")),
):
    return await commit_import(job_id, actor)


@router.get("/imports")
async def import_history(
    limit: int = Query(30, ge=1, le=100),
    _: AppUser = Depends(require_permission("management_data:write")),
):
    return await list_jobs(limit)


@router.get("/imports/{job_id}")
async def import_detail(
    job_id: str,
    _: AppUser = Depends(require_permission("management_data:write")),
):
    return await get_job(job_id)


@router.get("/pic-aliases")
async def list_pic_aliases(_: AppUser = Depends(require_permission("management_data:write"))):
    async with async_session() as session:
        result = await session.execute(
            text(
                """
                SELECT id::text, alias_display AS alias, canonical_pic, created_by,
                       created_at, updated_at
                FROM ticketing_pic_aliases
                ORDER BY LOWER(canonical_pic), LOWER(alias_display)
                """
            )
        )
        return [dict(row) for row in result.mappings()]


@router.post("/pic-aliases", status_code=status.HTTP_201_CREATED)
async def save_pic_alias(
    payload: AliasInput,
    actor: AppUser = Depends(require_permission("management_data:write")),
):
    alias = normalize_text(payload.alias)
    canonical = normalize_text(payload.canonical_pic)
    alias_key = normalize_pic_key(alias)
    if not alias or not canonical or not alias_key:
        raise HTTPException(status_code=422, detail="Alias dan nama canonical wajib diisi")
    async with async_session() as session:
        result = await session.execute(
            text(
                """
                INSERT INTO ticketing_pic_aliases (
                    id, alias_key, alias_display, canonical_pic, created_by
                ) VALUES (
                    CAST(:id AS uuid), :alias_key, :alias, :canonical, :actor
                )
                ON CONFLICT (alias_key) DO UPDATE SET
                    alias_display = EXCLUDED.alias_display,
                    canonical_pic = EXCLUDED.canonical_pic,
                    updated_at = NOW()
                RETURNING id::text, alias_display AS alias, canonical_pic,
                          created_by, created_at, updated_at
                """
            ),
            {
                "id": str(uuid4()),
                "alias_key": alias_key,
                "alias": alias,
                "canonical": canonical,
                "actor": actor.username,
            },
        )
        await session.commit()
        return dict(result.mappings().one())


@router.delete("/pic-aliases/{alias_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_pic_alias(
    alias_id: str,
    _: AppUser = Depends(require_permission("management_data:write")),
):
    async with async_session() as session:
        result = await session.execute(
            text("DELETE FROM ticketing_pic_aliases WHERE id = CAST(:id AS uuid)"),
            {"id": alias_id},
        )
        if result.rowcount == 0:
            raise HTTPException(status_code=404, detail="Alias tidak ditemukan")
        await session.commit()


def _public_user(user: AppUser) -> dict[str, object]:
    return {
        "id": user.id,
        "username": user.username,
        "role": user.role,
        "is_active": user.is_active,
        "session_version": user.session_version,
    }


@router.get("/users")
async def list_dashboard_users(
    request: Request,
    _: AppUser = Depends(require_permission("users:manage")),
):
    return [_public_user(user) for user in await request.app.state.user_store.list_users()]


@router.post("/users", status_code=status.HTTP_201_CREATED)
async def create_dashboard_user(
    payload: UserCreateInput,
    request: Request,
    actor: AppUser = Depends(require_permission("users:manage")),
):
    if payload.role not in ROLES:
        raise HTTPException(status_code=422, detail="Role tidak valid")
    try:
        user = await request.app.state.user_store.create_user(
            username=payload.username,
            password=payload.password,
            role=payload.role,
            created_by=actor.username,
        )
    except (exc.IntegrityError, ValueError) as error:
        raise HTTPException(status_code=409, detail="Username sudah digunakan") from error
    return _public_user(user)


@router.patch("/users/{user_id}")
async def update_dashboard_user(
    user_id: str,
    payload: UserUpdateInput,
    request: Request,
    actor: AppUser = Depends(require_permission("users:manage")),
):
    if payload.role is None and payload.is_active is None and payload.new_password is None:
        raise HTTPException(status_code=422, detail="Tidak ada perubahan pengguna")
    if payload.role is not None and payload.role not in ROLES:
        raise HTTPException(status_code=422, detail="Role tidak valid")
    if user_id == actor.id and (
        payload.is_active is False or (payload.role is not None and payload.role != "sysadmin")
    ):
        raise HTTPException(status_code=409, detail="Sysadmin tidak dapat menonaktifkan atau menurunkan role dirinya sendiri")
    user = await request.app.state.user_store.update_user(
        user_id=user_id,
        role=payload.role,
        is_active=payload.is_active,
        new_password=payload.new_password,
    )
    if user is None:
        raise HTTPException(status_code=404, detail="Pengguna tidak ditemukan")
    return _public_user(user)

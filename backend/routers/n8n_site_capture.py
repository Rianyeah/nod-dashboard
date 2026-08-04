"""Dedicated N8N routes for secure full Site Detail captures."""

from __future__ import annotations

import hashlib
import secrets
from datetime import datetime, timezone
from urllib.parse import quote

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_session
from models.capture import (
    CaptureTokenRequest,
    CaptureTokenResponse,
    SiteDetailCaptureBundle,
)
from rate_limit import RateLimitExceeded
from security import require_capture_claims, verify_n8n_capture_key
from services.site_detail_capture import (
    CaptureBundleUnavailable,
    load_site_detail_capture_bundle,
    normalize_capture_site_id,
    site_exists_for_capture,
)


CAPTURE_TOKEN_LIMIT = 30
CAPTURE_TOKEN_WINDOW_SECONDS = 60
router = APIRouter(prefix="/integrations/n8n", tags=["N8N Integrations"])


def _normalized_site_id_or_422(value: str) -> str:
    try:
        return normalize_capture_site_id(value)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Invalid Site ID",
        ) from exc


def _capture_limiter_key(request: Request, api_key: str) -> str:
    fingerprint = hashlib.sha256(api_key.encode("utf-8")).hexdigest()
    client_address = request.client.host if request.client else "unknown"
    return f"{fingerprint}:{client_address}"


@router.post(
    "/site-detail-capture-token",
    response_model=CaptureTokenResponse,
)
async def issue_site_detail_capture_token(
    payload: CaptureTokenRequest,
    request: Request,
    api_key: str = Depends(verify_n8n_capture_key),
    session: AsyncSession = Depends(get_session),
):
    """Issue one short-lived URL-fragment token after validating the Site ID."""
    try:
        request.app.state.capture_token_limiter.consume(
            _capture_limiter_key(request, api_key),
            CAPTURE_TOKEN_LIMIT,
            CAPTURE_TOKEN_WINDOW_SECONDS,
        )
    except RateLimitExceeded as exc:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many capture token requests",
            headers={"Retry-After": str(exc.retry_after)},
        ) from exc

    site_id = _normalized_site_id_or_422(payload.site_id)
    if not await site_exists_for_capture(site_id, session):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Site {site_id} not found",
        )

    token, claims = request.app.state.capture_token_manager.issue(site_id, payload.theme)
    capture_url = (
        f"{request.app.state.security_settings.public_app_origin}"
        f"/capture/site-detail/{quote(site_id, safe='')}#token={token}"
    )
    return CaptureTokenResponse(
        site_id=site_id,
        capture_url=capture_url,
        expires_at=datetime.fromtimestamp(claims.exp, tz=timezone.utc),
    )


@router.get(
    "/site-detail-capture/{site_id}",
    response_model=SiteDetailCaptureBundle,
)
async def get_site_detail_capture_bundle(
    site_id: str,
    claims=Depends(require_capture_claims),
    session: AsyncSession = Depends(get_session),
):
    """Return a complete modal bundle only for the Site ID in the signed claim."""
    normalized_site_id = _normalized_site_id_or_422(site_id)
    if not secrets.compare_digest(normalized_site_id, claims.site_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Capture token is not authorized for this Site ID",
        )

    try:
        return await load_site_detail_capture_bundle(normalized_site_id, session)
    except CaptureBundleUnavailable as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Site detail capture data is temporarily unavailable",
            headers={"Retry-After": "1"},
        ) from exc

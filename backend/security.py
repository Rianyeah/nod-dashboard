"""Shared authentication and machine-key boundaries for the dashboard."""

from __future__ import annotations

import hashlib
import secrets
from dataclasses import dataclass
from typing import Callable

from argon2 import PasswordHasher
from argon2.exceptions import VerificationError
from fastapi import Depends, Header, HTTPException, Request, status
from itsdangerous import BadSignature, SignatureExpired, URLSafeTimedSerializer

from capture_tokens import CaptureClaims, CaptureTokenValidationError
from config import SecuritySettings
from user_store import AppUser, ROLE_PERMISSIONS


SESSION_COOKIE_NAME = "nod_session"
UNSAFE_METHODS = frozenset({"POST", "PUT", "PATCH", "DELETE"})
_password_hasher = PasswordHasher()


class SessionValidationError(ValueError):
    """Raised when a browser session is missing, expired, or forged."""


@dataclass(frozen=True)
class SessionClaims:
    subject: str
    session_version: int


class SessionManager:
    """Issue and validate minimal, signed browser-session payloads."""

    def __init__(self, settings: SecuritySettings):
        self._settings = settings
        self._serializer = URLSafeTimedSerializer(
            settings.dashboard_session_secret,
            salt="nod-dashboard-session-v1",
            signer_kwargs={"digest_method": hashlib.sha256},
        )

    def issue(self, subject: str, session_version: int = 1) -> str:
        return self._serializer.dumps({"sub": subject, "sv": session_version})

    def verify(self, token: str) -> str:
        return self.verify_claims(token).subject

    def verify_claims(self, token: str) -> SessionClaims:
        try:
            payload = self._serializer.loads(
                token,
                max_age=self._settings.dashboard_session_ttl_seconds,
            )
        except (BadSignature, SignatureExpired) as exc:
            raise SessionValidationError("Invalid session") from exc

        subject = payload.get("sub") if isinstance(payload, dict) else None
        session_version = payload.get("sv") if isinstance(payload, dict) else None
        if (
            not isinstance(subject, str)
            or not subject
            or not isinstance(session_version, int)
            or session_version < 1
        ):
            raise SessionValidationError("Invalid session")
        return SessionClaims(subject=subject, session_version=session_version)


def _settings_for(request: Request) -> SecuritySettings:
    return request.app.state.security_settings


def credentials_are_valid(
    settings: SecuritySettings,
    username: str,
    password: str,
) -> bool:
    """Verify both values on every attempt to avoid user-enumeration signals."""
    username_matches = secrets.compare_digest(username, settings.dashboard_user)
    try:
        password_matches = _password_hasher.verify(settings.dashboard_password_hash, password)
    except VerificationError:
        password_matches = False
    return bool(username_matches and password_matches)


def verify_browser_origin(request: Request) -> None:
    """Reject unsafe browser requests that do not originate from this dashboard."""
    if request.method not in UNSAFE_METHODS:
        return

    origin = request.headers.get("origin", "").rstrip("/")
    if not origin or not secrets.compare_digest(origin, _settings_for(request).public_app_origin):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Invalid request origin",
        )


async def require_dashboard_session(request: Request) -> AppUser:
    """FastAPI dependency for all browser-visible dashboard routers."""
    token = request.cookies.get(SESSION_COOKIE_NAME, "")
    try:
        claims = request.app.state.session_manager.verify_claims(token)
    except SessionValidationError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
        ) from exc

    user = await request.app.state.user_store.get_by_username(claims.subject)
    if (
        user is None
        or not user.is_active
        or user.session_version != claims.session_version
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
        )

    verify_browser_origin(request)
    request.state.dashboard_subject = user.username
    request.state.dashboard_user = user
    return user


def require_permission(permission: str) -> Callable[..., object]:
    """Build a dependency that enforces a server-side role permission."""

    async def dependency(user: AppUser = Depends(require_dashboard_session)) -> AppUser:
        if permission not in ROLE_PERMISSIONS.get(user.role, ()):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Insufficient permission",
            )
        return user

    return dependency


def verify_n8n_key(
    request: Request,
    x_n8n_api_key: str = Header(...),
) -> str:
    """Keep machine-only N8N and admin endpoints separate from browser sessions."""
    if not secrets.compare_digest(x_n8n_api_key, _settings_for(request).n8n_api_key):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid N8N API Key",
        )
    return x_n8n_api_key


def verify_n8n_map_key(
    request: Request,
    x_n8n_map_api_key: str | None = Header(default=None),
) -> str:
    """Authorize read-only N8N map exports without granting admin access."""
    if not x_n8n_map_api_key or not secrets.compare_digest(
        x_n8n_map_api_key,
        _settings_for(request).n8n_map_api_key,
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid N8N Map API Key",
        )
    return x_n8n_map_api_key


def verify_n8n_capture_key(
    request: Request,
    x_n8n_capture_api_key: str | None = Header(
        default=None,
        alias="X-N8N-Capture-API-Key",
    ),
) -> str:
    """Authorize only the dedicated N8N site-detail capture credential."""
    if not x_n8n_capture_api_key or not secrets.compare_digest(
        x_n8n_capture_api_key,
        _settings_for(request).n8n_capture_api_key,
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid N8N Capture API Key",
        )
    return x_n8n_capture_api_key


def require_capture_claims(
    request: Request,
    authorization: str | None = Header(default=None),
) -> CaptureClaims:
    """Authorize a capture bundle request with one signed Bearer credential."""
    scheme, separator, token = (authorization or "").partition(" ")
    if scheme != "Bearer" or not separator or not token or " " in token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid capture token",
        )

    try:
        return request.app.state.capture_token_manager.verify(token)
    except CaptureTokenValidationError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid capture token",
        ) from exc

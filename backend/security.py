"""Shared authentication and machine-key boundaries for the dashboard."""

from __future__ import annotations

import hashlib
import secrets

from argon2 import PasswordHasher
from argon2.exceptions import VerificationError
from fastapi import Header, HTTPException, Request, status
from itsdangerous import BadSignature, SignatureExpired, URLSafeTimedSerializer

from config import SecuritySettings


SESSION_COOKIE_NAME = "nod_session"
UNSAFE_METHODS = frozenset({"POST", "PUT", "PATCH", "DELETE"})
_password_hasher = PasswordHasher()


class SessionValidationError(ValueError):
    """Raised when a browser session is missing, expired, or forged."""


class SessionManager:
    """Issue and validate minimal, signed browser-session payloads."""

    def __init__(self, settings: SecuritySettings):
        self._settings = settings
        self._serializer = URLSafeTimedSerializer(
            settings.dashboard_session_secret,
            salt="nod-dashboard-session-v1",
            signer_kwargs={"digest_method": hashlib.sha256},
        )

    def issue(self, subject: str) -> str:
        return self._serializer.dumps({"sub": subject, "sv": 1})

    def verify(self, token: str) -> str:
        try:
            payload = self._serializer.loads(
                token,
                max_age=self._settings.dashboard_session_ttl_seconds,
            )
        except (BadSignature, SignatureExpired) as exc:
            raise SessionValidationError("Invalid session") from exc

        expected_payload = {"sub": self._settings.dashboard_user, "sv": 1}
        if payload != expected_payload:
            raise SessionValidationError("Invalid session")
        return self._settings.dashboard_user


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


async def require_dashboard_session(request: Request) -> str:
    """FastAPI dependency for all browser-visible dashboard routers."""
    token = request.cookies.get(SESSION_COOKIE_NAME, "")
    try:
        subject = request.app.state.session_manager.verify(token)
    except SessionValidationError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
        ) from exc

    verify_browser_origin(request)
    request.state.dashboard_subject = subject
    return subject


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

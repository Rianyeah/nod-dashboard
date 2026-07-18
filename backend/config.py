"""Validated security configuration for the dashboard backend."""

from __future__ import annotations

import base64
import os
from dataclasses import dataclass
from typing import Mapping
from urllib.parse import urlparse


class SecurityConfigurationError(RuntimeError):
    """Raised when a required security setting is absent or unsafe."""


def _required(env: Mapping[str, str], name: str) -> str:
    value = env.get(name, "").strip()
    if not value:
        raise SecurityConfigurationError(f"Missing required security variable: {name}")
    return value


def _parse_bool(env: Mapping[str, str], name: str) -> bool:
    value = _required(env, name).lower()
    if value not in {"true", "false"}:
        raise SecurityConfigurationError(f"{name} must be true or false")
    return value == "true"


def _decode_session_secret(value: str) -> bytes:
    try:
        return base64.urlsafe_b64decode(value + "=" * (-len(value) % 4))
    except Exception as exc:
        raise SecurityConfigurationError(
            "DASHBOARD_SESSION_SECRET must be URL-safe base64"
        ) from exc


@dataclass(frozen=True)
class SecuritySettings:
    app_env: str
    public_app_origin: str
    allowed_hosts: tuple[str, ...]
    dashboard_user: str
    dashboard_password_hash: str
    dashboard_session_secret: str
    dashboard_session_ttl_seconds: int
    session_cookie_secure: bool
    n8n_api_key: str
    redis_url: str

    @property
    def is_production(self) -> bool:
        return self.app_env == "production"

    @classmethod
    def from_env(cls, env: Mapping[str, str] | None = None) -> "SecuritySettings":
        source = os.environ if env is None else env
        app_env = source.get("APP_ENV", "development").strip().lower()
        if app_env not in {"development", "test", "production"}:
            raise SecurityConfigurationError("APP_ENV must be development, test, or production")

        origin = _required(source, "PUBLIC_APP_ORIGIN").rstrip("/")
        parsed_origin = urlparse(origin)
        if (
            parsed_origin.scheme not in {"http", "https"}
            or not parsed_origin.netloc
            or parsed_origin.path
            or parsed_origin.params
            or parsed_origin.query
            or parsed_origin.fragment
        ):
            raise SecurityConfigurationError(
                "PUBLIC_APP_ORIGIN must be an origin without a path, query, or fragment"
            )

        allowed_hosts = tuple(
            item.strip()
            for item in _required(source, "ALLOWED_HOSTS").split(",")
            if item.strip()
        )
        if not allowed_hosts:
            raise SecurityConfigurationError("ALLOWED_HOSTS must contain at least one host")

        password_hash = _required(source, "DASHBOARD_PASSWORD_HASH")
        if not password_hash.startswith("$argon2id$"):
            raise SecurityConfigurationError("DASHBOARD_PASSWORD_HASH must be an Argon2id hash")

        session_secret = _required(source, "DASHBOARD_SESSION_SECRET")
        if len(_decode_session_secret(session_secret)) < 32:
            raise SecurityConfigurationError(
                "DASHBOARD_SESSION_SECRET must decode to at least 32 bytes"
            )

        ttl_value = _required(source, "DASHBOARD_SESSION_TTL_SECONDS")
        try:
            ttl_seconds = int(ttl_value)
        except ValueError as exc:
            raise SecurityConfigurationError(
                "DASHBOARD_SESSION_TTL_SECONDS must be an integer"
            ) from exc
        if ttl_seconds != 28_800:
            raise SecurityConfigurationError(
                "DASHBOARD_SESSION_TTL_SECONDS must be 28800"
            )

        cookie_secure = _parse_bool(source, "SESSION_COOKIE_SECURE")
        if app_env == "production":
            if parsed_origin.scheme != "https":
                raise SecurityConfigurationError(
                    "Production requires PUBLIC_APP_ORIGIN to use HTTPS"
                )
            if not cookie_secure:
                raise SecurityConfigurationError(
                    "Production requires SESSION_COOKIE_SECURE=true"
                )
            if parsed_origin.hostname not in allowed_hosts:
                raise SecurityConfigurationError(
                    "ALLOWED_HOSTS must include the PUBLIC_APP_ORIGIN host"
                )

        return cls(
            app_env=app_env,
            public_app_origin=origin,
            allowed_hosts=allowed_hosts,
            dashboard_user=_required(source, "DASHBOARD_USER"),
            dashboard_password_hash=password_hash,
            dashboard_session_secret=session_secret,
            dashboard_session_ttl_seconds=ttl_seconds,
            session_cookie_secure=cookie_secure,
            n8n_api_key=_required(source, "N8N_API_KEY"),
            redis_url=source.get("REDIS_URL", "").strip(),
        )

"""Short-lived, site-scoped credentials for capture-only integrations."""

from __future__ import annotations

import hashlib
import time
from dataclasses import asdict, dataclass
from typing import Callable

from itsdangerous import BadSignature, SignatureExpired, URLSafeTimedSerializer

from config import SecuritySettings


CAPTURE_TOKEN_AUDIENCE = "nod-site-detail-capture"
CAPTURE_TOKEN_TTL_SECONDS = 60
CAPTURE_THEMES = frozenset({"dark"})
_CAPTURE_CLAIM_KEYS = frozenset({"aud", "site_id", "theme", "iat", "exp"})


class CaptureTokenValidationError(ValueError):
    """Raised when a capture credential is invalid, expired, or out of scope."""


@dataclass(frozen=True)
class CaptureClaims:
    aud: str
    site_id: str
    theme: str
    iat: int
    exp: int


class CaptureTokenManager:
    """Issue and verify fixed-lifetime credentials for one Site ID."""

    def __init__(
        self,
        settings: SecuritySettings,
        clock: Callable[[], float] = time.time,
    ) -> None:
        self._clock = clock
        self._serializer = URLSafeTimedSerializer(
            settings.n8n_capture_signing_secret,
            salt="nod-site-detail-capture-v1",
            signer_kwargs={"digest_method": hashlib.sha256},
        )

    def issue(self, site_id: str, theme: str) -> tuple[str, CaptureClaims]:
        if theme not in CAPTURE_THEMES:
            raise CaptureTokenValidationError("Invalid capture token")

        issued_at = int(self._clock())
        claims = CaptureClaims(
            aud=CAPTURE_TOKEN_AUDIENCE,
            site_id=site_id,
            theme=theme,
            iat=issued_at,
            exp=issued_at + CAPTURE_TOKEN_TTL_SECONDS,
        )
        return self._serializer.dumps(asdict(claims)), claims

    def verify(self, token: str) -> CaptureClaims:
        try:
            payload = self._serializer.loads(
                token,
                max_age=CAPTURE_TOKEN_TTL_SECONDS,
            )
            claims = self._claims_from_payload(payload)
        except (
            BadSignature,
            SignatureExpired,
            TypeError,
            ValueError,
        ) as exc:
            raise CaptureTokenValidationError("Invalid capture token") from exc

        now = int(self._clock())
        if (
            claims.aud != CAPTURE_TOKEN_AUDIENCE
            or claims.theme not in CAPTURE_THEMES
            or not isinstance(claims.site_id, str)
            or not claims.site_id
            or isinstance(claims.iat, bool)
            or isinstance(claims.exp, bool)
            or not isinstance(claims.iat, int)
            or not isinstance(claims.exp, int)
            or claims.exp - claims.iat != CAPTURE_TOKEN_TTL_SECONDS
            or not claims.iat <= now <= claims.exp
        ):
            raise CaptureTokenValidationError("Invalid capture token")

        return claims

    @staticmethod
    def _claims_from_payload(payload: object) -> CaptureClaims:
        if not isinstance(payload, dict) or set(payload) != _CAPTURE_CLAIM_KEYS:
            raise ValueError("Invalid capture claims")
        return CaptureClaims(**payload)

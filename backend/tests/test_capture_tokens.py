import hashlib
import importlib

import pytest
from itsdangerous import URLSafeTimedSerializer


def capture_tokens():
    """Load the capture-token boundary only inside tests to prove the RED state."""
    return importlib.import_module("capture_tokens")


def signed_payload(settings, payload):
    serializer = URLSafeTimedSerializer(
        settings.n8n_capture_signing_secret,
        salt="nod-site-detail-capture-v1",
        signer_kwargs={"digest_method": hashlib.sha256},
    )
    return serializer.dumps(payload)


def test_token_is_site_scoped_for_exactly_sixty_seconds(security_settings):
    module = capture_tokens()
    manager = module.CaptureTokenManager(security_settings, clock=lambda: 1_700_000_000)

    token, claims = manager.issue("BGL002", "dark")

    assert claims == module.CaptureClaims(
        aud="nod-site-detail-capture",
        site_id="BGL002",
        theme="dark",
        iat=1_700_000_000,
        exp=1_700_000_060,
    )
    assert manager.verify(token) == claims


def test_verification_rejects_expired_token(security_settings):
    module = capture_tokens()
    issued = module.CaptureTokenManager(security_settings, clock=lambda: 1_700_000_000)
    token, _ = issued.issue("BGL002", "dark")
    expired = module.CaptureTokenManager(security_settings, clock=lambda: 1_700_000_061)

    with pytest.raises(module.CaptureTokenValidationError, match="^Invalid capture token$"):
        expired.verify(token)


def test_verification_rejects_forged_or_wrong_claim_tokens(security_settings):
    module = capture_tokens()
    manager = module.CaptureTokenManager(security_settings, clock=lambda: 1_700_000_000)
    token, _ = manager.issue("BGL002", "dark")
    malformed = (
        token + "forged",
        signed_payload(
            security_settings,
            {
                "aud": "wrong-audience",
                "site_id": "BGL002",
                "theme": "dark",
                "iat": 1_700_000_000,
                "exp": 1_700_000_060,
            },
        ),
        signed_payload(
            security_settings,
            {
                "aud": "nod-site-detail-capture",
                "site_id": "BGL002",
                "theme": "light",
                "iat": 1_700_000_000,
                "exp": 1_700_000_060,
            },
        ),
        signed_payload(
            security_settings,
            {
                "aud": "nod-site-detail-capture",
                "site_id": "BGL002",
                "theme": "dark",
                "iat": 1_700_000_000,
            },
        ),
        signed_payload(
            security_settings,
            {
                "aud": "nod-site-detail-capture",
                "site_id": "BGL002",
                "theme": "dark",
                "iat": 1_700_000_000,
                "exp": 1_700_000_060,
                "unexpected": True,
            },
        ),
    )

    for candidate in malformed:
        with pytest.raises(module.CaptureTokenValidationError) as raised:
            manager.verify(candidate)
        assert str(raised.value) == "Invalid capture token"
        assert candidate not in str(raised.value)


def test_issuer_rejects_unsupported_theme(security_settings):
    module = capture_tokens()
    manager = module.CaptureTokenManager(security_settings, clock=lambda: 1_700_000_000)

    with pytest.raises(module.CaptureTokenValidationError, match="^Invalid capture token$"):
        manager.issue("BGL002", "light")

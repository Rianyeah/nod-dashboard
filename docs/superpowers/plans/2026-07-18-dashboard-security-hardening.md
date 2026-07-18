# Dashboard Security Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the public fixed-token dashboard with required Argon2id credentials, signed HttpOnly cookie sessions, consistently protected API routers, bounded expensive work, safe map DOM rendering, and production-safe deployment defaults.

**Architecture:** `backend/config.py` validates all security configuration before the FastAPI app is created. `backend/security.py` owns password verification, signed sessions, origin checks, and machine-key authentication; `backend/rate_limit.py` and `backend/middleware.py` own abuse controls and HTTP hardening. React obtains authentication state from `/api/v1/auth/session` through an `AuthProvider`; browser storage no longer carries authentication material.

**Tech Stack:** Python 3.12, FastAPI, Pydantic 2, argon2-cffi, itsdangerous, redis.asyncio, unittest/pytest, React 19, React Router 7, Axios, Node test runner, Playwright, Docker, Zeabur.

## Global Constraints

- Production uses `APP_ENV=production`, `PUBLIC_APP_ORIGIN=https://nod-dashboard.zeabur.app`, and `ALLOWED_HOSTS=nod-dashboard.zeabur.app`.
- `DASHBOARD_USER`, an Argon2id `DASHBOARD_PASSWORD_HASH`, `DASHBOARD_SESSION_SECRET` with at least 32 decoded random bytes, `DASHBOARD_SESSION_TTL_SECONDS=28800`, `SESSION_COOKIE_SECURE=true`, and `N8N_API_KEY` are mandatory and have no usable defaults.
- The session cookie is named `nod_session` and uses `HttpOnly`, production `Secure`, `SameSite=Strict`, `Path=/`, and eight-hour maximum age.
- All browser dashboard routers are protected at router registration; admin and N8N routes continue to require only `X-N8N-API-Key`.
- Cookie-authenticated unsafe methods require `Origin` to exactly match `PUBLIC_APP_ORIGIN`; production installs no CORS middleware.
- Login allows five failures per username/client in five minutes. RF analysis allows 10 requests per subject/client per minute and two concurrent analyses per process.
- RF inputs are limited to valid coordinates, 50,000 metres, 10-metre minimum sampling, 5,001 samples, and 200 clutter points; JSON bodies are limited to 1 MiB.
- Production disables `/docs`, `/redoc`, and `/openapi.json`; `/api/v1/health` returns only `{"status":"ok"}`.
- Dynamic API/database strings never enter `innerHTML` or Mapbox `setHTML`; use DOM nodes and `setDOMContent`.
- Preserve all unrelated dirty-worktree changes and stage only files named by the active task.

---

### Task 1: Validated security configuration and reproducible backend dependencies

**Files:**
- Create: `backend/config.py`
- Create: `backend/requirements.in`
- Create: `backend/requirements-dev.in`
- Create: `backend/requirements.lock`
- Create: `backend/requirements-dev.lock`
- Modify: `backend/requirements.txt`
- Test: `backend/tests/test_security_config.py`

**Interfaces:**
- Produces: `SecuritySettings.from_env(env: Mapping[str, str] | None = None) -> SecuritySettings`.
- Produces: immutable fields `app_env`, `public_app_origin`, `allowed_hosts`, `dashboard_user`, `dashboard_password_hash`, `dashboard_session_secret`, `dashboard_session_ttl_seconds`, `session_cookie_secure`, `n8n_api_key`, and `redis_url`.
- Produces: `SecurityConfigurationError`, whose message names invalid variables but never contains their values.

- [ ] **Step 1: Write failing configuration tests**

```python
# backend/tests/test_security_config.py
import base64
import unittest

from config import SecurityConfigurationError, SecuritySettings


def valid_env(**overrides):
    env = {
        "APP_ENV": "production",
        "PUBLIC_APP_ORIGIN": "https://nod-dashboard.zeabur.app",
        "ALLOWED_HOSTS": "nod-dashboard.zeabur.app",
        "DASHBOARD_USER": "operator",
        "DASHBOARD_PASSWORD_HASH": "$argon2id$v=19$m=65536,t=3,p=4$abc$def",
        "DASHBOARD_SESSION_SECRET": base64.urlsafe_b64encode(b"x" * 32).decode(),
        "DASHBOARD_SESSION_TTL_SECONDS": "28800",
        "SESSION_COOKIE_SECURE": "true",
        "N8N_API_KEY": "n" * 32,
        "REDIS_URL": "",
    }
    env.update(overrides)
    return env


class SecuritySettingsTest(unittest.TestCase):
    def test_valid_production_settings_are_parsed(self):
        settings = SecuritySettings.from_env(valid_env())
        self.assertTrue(settings.is_production)
        self.assertEqual(settings.allowed_hosts, ("nod-dashboard.zeabur.app",))
        self.assertEqual(settings.dashboard_session_ttl_seconds, 28800)

    def test_each_required_value_fails_without_echoing_the_value(self):
        for name in (
            "PUBLIC_APP_ORIGIN", "ALLOWED_HOSTS", "DASHBOARD_USER",
            "DASHBOARD_PASSWORD_HASH", "DASHBOARD_SESSION_SECRET", "N8N_API_KEY",
        ):
            with self.subTest(name=name):
                env = valid_env()
                secret_value = env[name]
                env[name] = ""
                with self.assertRaises(SecurityConfigurationError) as raised:
                    SecuritySettings.from_env(env)
                self.assertIn(name, str(raised.exception))
                self.assertNotIn(secret_value, str(raised.exception))

    def test_production_rejects_http_origin_insecure_cookie_and_short_secret(self):
        for override, name in (
            ({"PUBLIC_APP_ORIGIN": "http://example.com"}, "PUBLIC_APP_ORIGIN"),
            ({"SESSION_COOKIE_SECURE": "false"}, "SESSION_COOKIE_SECURE"),
            ({"DASHBOARD_SESSION_SECRET": "short"}, "DASHBOARD_SESSION_SECRET"),
        ):
            with self.subTest(name=name):
                with self.assertRaises(SecurityConfigurationError):
                    SecuritySettings.from_env(valid_env(**override))
```

- [ ] **Step 2: Run the test and verify RED**

Run: `cd backend && python -m unittest tests.test_security_config -v`

Expected: `ERROR` because `config.SecuritySettings` does not exist.

- [ ] **Step 3: Implement strict settings parsing**

```python
# backend/config.py
from __future__ import annotations

import base64
import os
from dataclasses import dataclass
from typing import Mapping
from urllib.parse import urlparse


class SecurityConfigurationError(RuntimeError):
    pass


def _required(env: Mapping[str, str], name: str) -> str:
    value = env.get(name, "").strip()
    if not value:
        raise SecurityConfigurationError(f"Missing required security variable: {name}")
    return value


def _bool(env: Mapping[str, str], name: str) -> bool:
    value = _required(env, name).lower()
    if value not in {"true", "false"}:
        raise SecurityConfigurationError(f"{name} must be true or false")
    return value == "true"


def _decode_secret(value: str) -> bytes:
    try:
        return base64.urlsafe_b64decode(value + "=" * (-len(value) % 4))
    except Exception as exc:
        raise SecurityConfigurationError("DASHBOARD_SESSION_SECRET must be URL-safe base64") from exc


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
        origin = _required(source, "PUBLIC_APP_ORIGIN").rstrip("/")
        parsed = urlparse(origin)
        if parsed.scheme not in {"http", "https"} or not parsed.netloc or parsed.path:
            raise SecurityConfigurationError("PUBLIC_APP_ORIGIN must be an origin without a path")
        hosts = tuple(item.strip() for item in _required(source, "ALLOWED_HOSTS").split(",") if item.strip())
        password_hash = _required(source, "DASHBOARD_PASSWORD_HASH")
        if not password_hash.startswith("$argon2id$"):
            raise SecurityConfigurationError("DASHBOARD_PASSWORD_HASH must be Argon2id")
        session_secret = _required(source, "DASHBOARD_SESSION_SECRET")
        if len(_decode_secret(session_secret)) < 32:
            raise SecurityConfigurationError("DASHBOARD_SESSION_SECRET must decode to at least 32 bytes")
        secure = _bool(source, "SESSION_COOKIE_SECURE")
        if app_env == "production" and (parsed.scheme != "https" or not secure):
            raise SecurityConfigurationError("Production requires HTTPS origin and SESSION_COOKIE_SECURE=true")
        ttl = int(source.get("DASHBOARD_SESSION_TTL_SECONDS", "28800"))
        if ttl != 28800:
            raise SecurityConfigurationError("DASHBOARD_SESSION_TTL_SECONDS must be 28800")
        return cls(
            app_env=app_env,
            public_app_origin=origin,
            allowed_hosts=hosts,
            dashboard_user=_required(source, "DASHBOARD_USER"),
            dashboard_password_hash=password_hash,
            dashboard_session_secret=session_secret,
            dashboard_session_ttl_seconds=ttl,
            session_cookie_secure=secure,
            n8n_api_key=_required(source, "N8N_API_KEY"),
            redis_url=source.get("REDIS_URL", "").strip(),
        )
```

Put direct runtime requirements in `requirements.in`, add `argon2-cffi` and `itsdangerous`, and put `pip-tools`, `pip-audit`, `pytest`, `pytest-asyncio`, and `pytest-mock` in `requirements-dev.in`. Keep `requirements.txt` as the valid one-line compatibility include `-r requirements.lock`; Docker and CI install `requirements.lock` directly with hashes enforced.

Generate locks with:

```powershell
cd backend
python -m pip install pip-tools
python -m piptools compile --resolver=backtracking --generate-hashes --output-file requirements.lock requirements.in
python -m piptools compile --resolver=backtracking --generate-hashes --output-file requirements-dev.lock requirements.in requirements-dev.in
```

- [ ] **Step 4: Run tests and audit the resolved lock**

Run: `cd backend && python -m unittest tests.test_security_config -v`

Expected: `OK` with three passing tests.

Run: `cd backend && python -m pip_audit -r requirements.lock`

Expected: no known vulnerabilities in the resolved runtime lock.

- [ ] **Step 5: Commit**

```powershell
git add backend/config.py backend/requirements.in backend/requirements-dev.in backend/requirements.txt backend/requirements.lock backend/requirements-dev.lock backend/tests/test_security_config.py
git commit -m "build: validate and lock security dependencies"
```

---

### Task 2: Signed cookie sessions and deny-by-default API routers

**Files:**
- Modify: `backend/security.py`
- Modify: `backend/main.py`
- Create: `backend/tests/conftest.py`
- Create: `backend/tests/test_auth_security.py`
- Create: `backend/tests/test_router_auth.py`

**Interfaces:**
- Consumes: `SecuritySettings` from Task 1.
- Produces: `SessionManager.issue(subject: str) -> str` and `SessionManager.verify(token: str) -> str`.
- Produces: FastAPI dependencies `require_dashboard_session(request: Request) -> str`, `verify_browser_origin(request: Request) -> None`, and `verify_n8n_key(x_n8n_api_key: str) -> str`.
- Produces: `create_app(settings: SecuritySettings | None = None) -> FastAPI`; production calls it without an override, while tests pass an explicit configuration.
- Produces: `POST /api/v1/auth/login`, `GET /api/v1/auth/session`, and `POST /api/v1/auth/logout`.

- [ ] **Step 1: Write failing session, login, and router-boundary tests**

```python
# backend/tests/conftest.py
import base64
import os

import pytest
from argon2 import PasswordHasher
from fastapi.testclient import TestClient

TEST_PASSWORD = "test-only-password"
TEST_ORIGIN = "https://nod-dashboard.zeabur.app"

os.environ.update({
    "APP_ENV": "production",
    "PUBLIC_APP_ORIGIN": TEST_ORIGIN,
    "ALLOWED_HOSTS": "nod-dashboard.zeabur.app,testserver",
    "DASHBOARD_USER": "operator",
    "DASHBOARD_PASSWORD_HASH": PasswordHasher().hash(TEST_PASSWORD),
    "DASHBOARD_SESSION_SECRET": base64.urlsafe_b64encode(b"test-only-session-material-32b!!").decode(),
    "DASHBOARD_SESSION_TTL_SECONDS": "28800",
    "SESSION_COOKIE_SECURE": "true",
    "N8N_API_KEY": "test-only-n8n-key-32-characters",
    "REDIS_URL": "",
})


@pytest.fixture
def security_settings():
    from config import SecuritySettings
    return SecuritySettings.from_env()


@pytest.fixture
def session_manager(security_settings):
    from security import SessionManager
    return SessionManager(security_settings)


@pytest.fixture
def client(security_settings):
    from main import create_app
    return TestClient(create_app(security_settings), base_url=TEST_ORIGIN)


@pytest.fixture
def credentials():
    return {"username": "operator", "password": TEST_PASSWORD}


@pytest.fixture
def authenticated_client(client, credentials):
    response = client.post(
        "/api/v1/auth/login",
        json=credentials,
        headers={"Origin": TEST_ORIGIN},
    )
    assert response.status_code == 200
    return client


@pytest.fixture
def valid_payload():
    return {
        "latitude": -7.25,
        "longitude": 112.75,
        "azimuth": 90,
        "antenna_height": 30,
        "mechanical_tilt": 2,
        "electrical_tilt": 2,
        "vertical_beamwidth": 6,
        "max_distance": 2000,
        "sample_interval": 30,
        "frequency_mhz": 1800,
        "clutter": [],
    }
```

```python
# backend/tests/test_auth_security.py
def test_valid_login_sets_hardened_cookie(client, credentials):
    response = client.post(
        "/api/v1/auth/login",
        json=credentials,
        headers={"Origin": "https://nod-dashboard.zeabur.app"},
    )
    assert response.status_code == 200
    cookie = response.headers["set-cookie"]
    assert "nod_session=" in cookie
    assert "HttpOnly" in cookie and "Secure" in cookie
    assert "SameSite=strict" in cookie and "Max-Age=28800" in cookie
    assert "token" not in response.json()


def test_invalid_credentials_are_generic(client):
    bad_user = client.post("/api/v1/auth/login", json={"username": "bad", "password": "bad"}, headers={"Origin": "https://nod-dashboard.zeabur.app"})
    bad_password = client.post("/api/v1/auth/login", json={"username": "operator", "password": "bad"}, headers={"Origin": "https://nod-dashboard.zeabur.app"})
    assert bad_user.status_code == bad_password.status_code == 401
    assert bad_user.json() == bad_password.json() == {"detail": "Invalid username or password"}


def test_modified_expired_and_wrong_secret_sessions_are_rejected(session_manager, security_settings):
    from dataclasses import replace
    from security import SessionManager, SessionValidationError

    token = session_manager.issue("operator")
    assert session_manager.verify(token) == "operator"
    with pytest.raises(SessionValidationError):
        session_manager.verify(token + "x")
    expired = SessionManager(replace(security_settings, dashboard_session_ttl_seconds=-1))
    with pytest.raises(SessionValidationError):
        expired.verify(token)
    wrong_secret = SessionManager(replace(
        security_settings,
        dashboard_session_secret=base64.urlsafe_b64encode(b"wrong-test-session-material-32b!").decode(),
    ))
    with pytest.raises(SessionValidationError):
        wrong_secret.verify(token)
```

```python
# backend/tests/test_router_auth.py
PROTECTED_PATHS = (
    "/api/v1/map/sites", "/api/v1/availability/latest-period", "/api/v1/sites",
    "/api/v1/reporting/available-months", "/api/v1/impact-service/filters",
    "/api/v1/transport-quality/filters", "/api/v1/ticketing/filters",
    "/api/v1/overview", "/api/v1/activity-enom/filters",
    "/api/v1/data-potensi/filters", "/api/v1/rf-tilt/sites/search?q=x",
)


@pytest.mark.parametrize("path", PROTECTED_PATHS)
def test_dashboard_routers_reject_anonymous_requests_before_handler(client, path):
    assert client.get(path).status_code == 401


def test_health_is_public_and_minimal(client):
    response = client.get("/api/v1/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_admin_and_n8n_routes_do_not_accept_dashboard_session(authenticated_client):
    headers = {"Origin": "https://nod-dashboard.zeabur.app"}
    assert authenticated_client.post("/api/v1/admin/cache/invalidate", headers=headers).status_code in {401, 422}
    assert authenticated_client.post("/api/v1/webhook/n8n/alert", json={
        "site_id": "S1", "event_type": "down", "timestamp": "2026-07-18T00:00:00Z",
    }, headers=headers).status_code in {401, 422}
```

- [ ] **Step 2: Run the tests and verify RED**

Run: `cd backend && python -m pytest tests/test_auth_security.py tests/test_router_auth.py -q`

Expected: failures showing the current JSON token response, missing cookie, and anonymous router access.

- [ ] **Step 3: Implement signed sessions and route integration**

Use `argon2.PasswordHasher` and `itsdangerous.URLSafeTimedSerializer` in `backend/security.py`. Always verify the submitted password hash and combine that result with `secrets.compare_digest` for the username, so incorrect usernames and passwords share the same response shape. The signed payload is exactly `{"sub": <dashboard user>, "sv": 1}`.

```python
class SessionManager:
    def __init__(self, settings: SecuritySettings):
        self.settings = settings
        self.serializer = URLSafeTimedSerializer(
            settings.dashboard_session_secret,
            salt="nod-dashboard-session-v1",
            signer_kwargs={"digest_method": hashlib.sha256},
        )

    def issue(self, subject: str) -> str:
        return self.serializer.dumps({"sub": subject, "sv": 1})

    def verify(self, token: str) -> str:
        try:
            payload = self.serializer.loads(
                token,
                max_age=self.settings.dashboard_session_ttl_seconds,
            )
        except (BadSignature, SignatureExpired) as exc:
            raise SessionValidationError from exc
        if payload != {"sub": self.settings.dashboard_user, "sv": 1}:
            raise SessionValidationError
        return payload["sub"]


async def require_dashboard_session(request: Request) -> str:
    token = request.cookies.get("nod_session", "")
    try:
        subject = request.app.state.session_manager.verify(token)
    except SessionValidationError as exc:
        raise HTTPException(status_code=401, detail="Authentication required") from exc
    if request.method in {"POST", "PUT", "PATCH", "DELETE"}:
        verify_browser_origin(request)
    request.state.dashboard_subject = subject
    return subject
```

Refactor app construction into `create_app(settings=None)`. Create the three auth routes inside that function, store the settings and session manager on `app.state`, and leave `app = create_app()` as the Uvicorn entry point. Set and delete `nod_session` using matching attributes. Register every dashboard router with `dependencies=[Depends(require_dashboard_session)]`; register `admin_router.router` without that dependency because its endpoints already require `verify_n8n_key`. Remove CORS middleware, `DASHBOARD_PASS`, `DASHBOARD_TOKEN`, `verify_dashboard_token`, and every fallback credential.

- [ ] **Step 4: Run focused and existing backend tests**

Run: `cd backend && python -m pytest tests/test_auth_security.py tests/test_router_auth.py -q`

Expected: all focused tests pass.

Run: `cd backend && python -m pytest tests -q`

Expected: existing contract tests pass after updating any assertions that intentionally referenced the old detailed health response.

- [ ] **Step 5: Commit**

```powershell
git add backend/security.py backend/main.py backend/tests/conftest.py backend/tests/test_auth_security.py backend/tests/test_router_auth.py backend/tests/test_redis_admin_contract.py
git commit -m "feat: enforce signed dashboard sessions"
```

---

### Task 3: Login throttling, request-size enforcement, trusted hosts, docs, and response headers

**Files:**
- Create: `backend/rate_limit.py`
- Create: `backend/middleware.py`
- Modify: `backend/main.py`
- Modify: `backend/security.py`
- Create: `backend/tests/test_rate_limits.py`
- Create: `backend/tests/test_http_hardening.py`

**Interfaces:**
- Produces: `InMemoryRateLimiter.consume(key: str, limit: int, window_seconds: int) -> None`, `reset(key: str) -> None`.
- Produces: `RedisRateLimiter` with the same async interface and atomic `INCR`/`EXPIRE` pipeline.
- Produces: `RateLimitExceeded(retry_after: int)` and `LimiterUnavailable`.
- Produces: ASGI `RequestBodyLimitMiddleware(app, max_bytes=1_048_576)` and `SecurityHeadersMiddleware(app, csp: str)`.

- [ ] **Step 1: Write failing abuse-control and HTTP-hardening tests**

```python
def test_sixth_failed_login_is_limited(client, credentials):
    headers = {"Origin": "https://nod-dashboard.zeabur.app"}
    for _ in range(5):
        assert client.post("/api/v1/auth/login", json={**credentials, "password": "wrong"}, headers=headers).status_code == 401
    blocked = client.post("/api/v1/auth/login", json={**credentials, "password": "wrong"}, headers=headers)
    assert blocked.status_code == 429
    assert int(blocked.headers["Retry-After"]) > 0


def test_unsafe_cookie_request_rejects_missing_or_attacker_origin(authenticated_client):
    for headers in ({}, {"Origin": "https://attacker.example"}):
        assert authenticated_client.post("/api/v1/auth/logout", headers=headers).status_code == 403


def test_security_headers_docs_host_and_body_limit(client):
    response = client.get("/login")
    assert response.headers["x-content-type-options"] == "nosniff"
    assert response.headers["x-frame-options"] == "DENY"
    assert "default-src 'self'" in response.headers["content-security-policy"]
    assert client.get("/docs").status_code == 404
    assert client.get("/api/v1/health", headers={"Host": "attacker.example"}).status_code == 400
    oversized = b"{" + b"x" * 1_048_576 + b"}"
    assert client.post("/api/v1/auth/login", content=oversized, headers={"content-type": "application/json"}).status_code == 413
```

- [ ] **Step 2: Run tests and verify RED**

Run: `cd backend && python -m pytest tests/test_rate_limits.py tests/test_http_hardening.py -q`

Expected: failures because throttling, body limit, host validation, production docs disabling, and headers are absent.

- [ ] **Step 3: Implement the controls**

Hash limiter identifiers with HMAC-SHA256 keyed by the session secret before storing them. The login key is `login:<normalized username>:<request.client.host>` and only failed logins increment it. A successful login resets it. Use Redis when `REDIS_URL` is non-empty; if that configured Redis call fails, map `LimiterUnavailable` to `503`. Otherwise use a bounded in-memory dictionary and prune expired entries on every consume.

`RequestBodyLimitMiddleware` must count actual ASGI `http.request` chunks as well as reject an excessive `Content-Length`; it must return `413` before FastAPI parses the body. `SecurityHeadersMiddleware` adds headers to every `http.response.start` event.

Create the app with production docs URLs set to `None`, add `TrustedHostMiddleware(allowed_hosts=settings.allowed_hosts)`, and use this CSP:

```text
default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' data: https://fonts.gstatic.com; img-src 'self' data: blob: https://api.mapbox.com https://*.tiles.mapbox.com; connect-src 'self' https://api.mapbox.com https://events.mapbox.com https://*.tiles.mapbox.com; worker-src 'self' blob:; child-src blob:; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'
```

Also add `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, and `Permissions-Policy: camera=(), microphone=(), geolocation=()`.

- [ ] **Step 4: Run focused and full backend tests**

Run: `cd backend && python -m pytest tests/test_rate_limits.py tests/test_http_hardening.py -q`

Expected: focused tests pass.

Run: `cd backend && python -m pytest tests -q`

Expected: full backend suite passes.

- [ ] **Step 5: Commit**

```powershell
git add backend/rate_limit.py backend/middleware.py backend/main.py backend/security.py backend/tests/test_rate_limits.py backend/tests/test_http_hardening.py
git commit -m "feat: harden dashboard HTTP boundaries"
```

---

### Task 4: Bound RF analysis cost before outbound elevation work

**Files:**
- Modify: `backend/models/rf_tilt.py`
- Modify: `backend/routers/rf_tilt.py`
- Create: `backend/tests/test_rf_tilt_security.py`
- Preserve and integrate: `backend/tests/test_antenna_spec.py`

**Interfaces:**
- Consumes: `request.state.dashboard_subject` and the RF limiter from Task 3.
- Produces: validated `TiltAnalysisRequest` limits and `run_bounded_analysis(request, req, session)` guarded by rate and concurrency limits.

- [ ] **Step 1: Write failing RF boundary tests**

```python
@pytest.mark.parametrize("field,value", [
    ("latitude", 91), ("longitude", 181), ("max_distance", 50001),
    ("sample_interval", 9.9),
])
def test_rf_request_rejects_out_of_bounds_values(valid_payload, field, value):
    with pytest.raises(ValidationError):
        TiltAnalysisRequest(**{**valid_payload, field: value})


def test_rf_request_rejects_more_than_200_clutter_points(valid_payload):
    with pytest.raises(ValidationError):
        TiltAnalysisRequest(**{**valid_payload, "clutter": [{"distance": 1, "height": 1}] * 201})


async def test_target_over_50km_fails_before_elevation_fetch(authenticated_client, mocker, valid_payload):
    fetch = mocker.patch("routers.rf_tilt.fetch_elevations_open_meteo")
    response = authenticated_client.post(
        "/api/v1/rf-tilt/analysis",
        json={**valid_payload, "target_latitude": -6.0, "target_longitude": 110.0},
        headers={"Origin": "https://nod-dashboard.zeabur.app"},
    )
    assert response.status_code == 422
    fetch.assert_not_called()
```

Add tests that the 11th request receives `429`, a third simultaneous request receives `429`, and the maximum legal `50000 / 10 + 1` path produces exactly 5,001 samples.

- [ ] **Step 2: Run tests and verify RED**

Run: `cd backend && python -m pytest tests/test_rf_tilt_security.py -q`

Expected: current unbounded fields and handler make the boundary tests fail.

- [ ] **Step 3: Add model and handler guards**

Use `Field(ge=-90, le=90)`, `Field(ge=-180, le=180)`, `Field(gt=0, le=50_000)`, `Field(ge=10)`, and `Field(max_length=200)`. Add a Pydantic `model_validator(mode="after")` requiring target latitude/longitude together. In the handler, compute target distance before any outbound call, reject distance above 50,000 metres, and assert `n_samples <= 5_001`.

Acquire a per-process `asyncio.Semaphore(2)` with a short non-blocking timeout; return `429` with `Retry-After: 1` when no slot is available. Consume the RF limiter before acquiring the slot. Release the semaphore in `finally` around every elevation and raster operation.

- [ ] **Step 4: Run RF and backend regression tests**

Run: `cd backend && python -m pytest tests/test_rf_tilt_security.py tests/test_antenna_spec.py -q`

Expected: RF security and existing antenna tests pass.

Run: `cd backend && python -m pytest tests -q`

Expected: full backend suite passes.

- [ ] **Step 5: Commit**

```powershell
git add backend/models/rf_tilt.py backend/routers/rf_tilt.py backend/tests/test_rf_tilt_security.py backend/tests/test_antenna_spec.py
git commit -m "feat: bound RF analysis resource usage"
```

---

### Task 5: React authentication state from the server session

**Files:**
- Create: `frontend/src/auth/AuthContext.jsx`
- Modify: `frontend/src/services/api.js`
- Modify: `frontend/src/App.jsx`
- Modify: `frontend/src/pages/LoginPage.jsx`
- Modify: `frontend/src/components/DashboardSidebar.jsx`
- Delete: `frontend/src/hooks/useSessionTimeout.js`
- Create: `frontend/src/__tests__/authSecurityContracts.test.js`

**Interfaces:**
- Produces: `AuthProvider`, `useAuth()`, and `{status, user, login, logout}` where status is `loading | authenticated | anonymous`.
- Produces: `authSession()`, cookie-based `authLogin(username, password)`, async `authLogout()`, and `setUnauthorizedHandler(handler)`.

- [ ] **Step 1: Write failing frontend auth contracts**

```javascript
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const src = (...parts) => readFileSync(resolve(process.cwd(), 'src', ...parts), 'utf8');

describe('cookie session authentication contracts', () => {
  it('never stores or sends a bearer token', () => {
    const api = src('services', 'api.js');
    const app = src('App.jsx');
    const auth = src('auth', 'AuthContext.jsx');
    for (const source of [api, app, auth]) {
      assert.doesNotMatch(source, /nod_auth_token|Authorization\s*=|Bearer /);
    }
    assert.match(api, /authSession/);
    assert.match(api, /authLogout/);
  });

  it('waits for the server session before routing', () => {
    const app = src('App.jsx');
    const auth = src('auth', 'AuthContext.jsx');
    assert.match(app, /status === 'loading'/);
    assert.match(app, /status === 'authenticated'/);
    assert.match(auth, /authSession\(\)/);
    assert.match(auth, /removeItem\('nod_auth_token'\)/);
    assert.match(auth, /removeItem\('nod_last_activity'\)/);
  });
});
```

- [ ] **Step 2: Run test and verify RED**

Run: `cd frontend && node --test src/__tests__/authSecurityContracts.test.js`

Expected: failure because `AuthContext.jsx` is absent and token storage remains.

- [ ] **Step 3: Implement cookie-session client flow**

Configure Axios with fixed same-origin `baseURL`, `withCredentials: true`, and a response interceptor that invokes the registered unauthorized handler on protected `401` responses. `authLogin` returns the backend user object without storing it. `authLogout` posts to `/auth/logout` and always clears frontend state.

`AuthProvider` removes both legacy auth keys once, calls `authSession()` at mount, exposes loading/authenticated/anonymous state, and registers the `401` handler. `PrivateRoute` renders a loading surface until the session request completes, wraps authenticated pages in `AppShell`, and redirects anonymous users to `/login` with only the current React path in router state. `LoginPage` uses `useAuth().login`; the sidebar awaits `useAuth().logout` before navigating.

- [ ] **Step 4: Run frontend contracts and lint**

Run: `cd frontend && node --test src/__tests__/*.test.js`

Expected: all frontend contract tests pass after updating old token-storage expectations.

Run: `cd frontend && npm run lint`

Expected: zero ESLint errors.

- [ ] **Step 5: Commit**

```powershell
git add frontend/src/auth/AuthContext.jsx frontend/src/services/api.js frontend/src/App.jsx frontend/src/pages/LoginPage.jsx frontend/src/components/DashboardSidebar.jsx frontend/src/hooks/useSessionTimeout.js frontend/src/__tests__/authSecurityContracts.test.js frontend/src/__tests__/homePageContracts.test.js
git commit -m "feat: migrate dashboard to cookie sessions"
```

---

### Task 6: Remove dynamic HTML injection from Mapbox and RF Tilt UI

**Files:**
- Create: `frontend/src/utils/safeMapDom.js`
- Modify: `frontend/src/components/MapboxMap.jsx`
- Modify: `frontend/src/features/rf-tilt/RfTiltMap.jsx`
- Create: `frontend/src/__tests__/mapDomSecurity.test.js`
- Preserve and integrate: `frontend/src/__tests__/rfTiltContracts.test.js`

**Interfaces:**
- Produces: `textElement(tag, text, options) -> HTMLElement`, `appendTextRow(parent, label, value)`, and `popupContent(rows, className) -> HTMLElement`.
- Consumes: Mapbox `Popup.setDOMContent(node)`.

- [ ] **Step 1: Write failing DOM-safety tests**

```javascript
import { JSDOM } from 'jsdom';
import { popupContent } from '../utils/safeMapDom.js';

it('renders hostile labels as text rather than executable markup', () => {
  const dom = new JSDOM('<!doctype html><body></body>');
  global.document = dom.window.document;
  const hostile = '<img src=x onerror="globalThis.pwned=true">';
  const node = popupContent([['Site', hostile]], 'site-popup');
  assert.equal(node.textContent.includes(hostile), true);
  assert.equal(node.querySelector('img'), null);
});

it('map components do not pass API strings to HTML parsing sinks', () => {
  const map = src('components', 'MapboxMap.jsx');
  const rf = src('features', 'rf-tilt', 'RfTiltMap.jsx');
  assert.doesNotMatch(map, /setHTML\(`/);
  assert.doesNotMatch(rf, /setHTML\(`/);
  assert.match(map, /setDOMContent/);
  assert.match(rf, /setDOMContent/);
});
```

Add `jsdom` as a development dependency only.

- [ ] **Step 2: Run test and verify RED**

Run: `cd frontend && node --test src/__tests__/mapDomSecurity.test.js`

Expected: failure because the utility is absent and both map files use string HTML sinks.

- [ ] **Step 3: Build structured popup DOM**

```javascript
export function textElement(tag, text, { className, style } = {}) {
  const element = document.createElement(tag);
  element.textContent = text == null ? '' : String(text);
  if (className) element.className = className;
  if (style) Object.assign(element.style, style);
  return element;
}

export function appendTextRow(parent, label, value) {
  const row = document.createElement('div');
  row.append(textElement('span', label), textElement('strong', value));
  parent.append(row);
  return row;
}

export function popupContent(rows, className = '') {
  const root = document.createElement('div');
  root.className = className;
  rows.forEach(([label, value]) => appendTextRow(root, label, value));
  return root;
}
```

Replace every popup containing site IDs, names, antenna types, or API response text with `setDOMContent(popupContent(...))`. Build marker labels with `textContent`, styles with `Object.assign`, and listeners with `addEventListener`. Static numeric-only SVG/sparkline fragments may remain isolated, but no API/database string may be interpolated into them.

- [ ] **Step 4: Run map contracts, full frontend suite, and lint**

Run: `cd frontend && node --test src/__tests__/mapDomSecurity.test.js src/__tests__/rfTiltContracts.test.js`

Expected: focused tests pass.

Run: `cd frontend && node --test src/__tests__/*.test.js && npm run lint`

Expected: all contracts pass and lint has zero errors.

- [ ] **Step 5: Commit**

```powershell
git add frontend/package.json frontend/package-lock.json frontend/src/utils/safeMapDom.js frontend/src/components/MapboxMap.jsx frontend/src/features/rf-tilt/RfTiltMap.jsx frontend/src/__tests__/mapDomSecurity.test.js frontend/src/__tests__/rfTiltContracts.test.js
git commit -m "fix: render map data without HTML injection"
```

---

### Task 7: Production configuration, dependency audit, and immutable build metadata

**Files:**
- Modify: `backend/.env.example`
- Modify: `Dockerfile`
- Modify: `zeabur.json`
- Modify: `.github/workflows/deploy.yml`
- Modify: `frontend/package.json`
- Modify: `frontend/package-lock.json`
- Create: `docs/security-deployment.md`
- Create: `backend/tests/test_deployment_security.py`

**Interfaces:**
- Consumes: environment contract from Task 1.
- Produces: Docker image built from `backend/requirements.lock`, SHA-tagged publishing, audited frontend lock, and an operator runbook.

- [ ] **Step 1: Write failing deployment contract tests**

```python
def test_deployment_files_have_no_fallback_secrets_and_use_locks():
    env_example = (ROOT / "backend" / ".env.example").read_text()
    dockerfile = (ROOT / "Dockerfile").read_text()
    zeabur = (ROOT / "zeabur.json").read_text()
    assert "DASHBOARD_PASS=" not in env_example
    assert "DASHBOARD_PASSWORD_HASH=" in env_example
    assert "DASHBOARD_SESSION_SECRET=" in env_example
    assert "requirements.lock" in dockerfile
    assert "nod-dashboard:latest" not in zeabur
    assert "DASHBOARD_PASSWORD_HASH" in zeabur
    assert "DASHBOARD_SESSION_SECRET" in zeabur
```

- [ ] **Step 2: Run test and verify RED**

Run: `cd backend && python -m pytest tests/test_deployment_security.py -q`

Expected: failures for plaintext password naming, unlocked Python install, moving image tag, and missing secret declarations.

- [ ] **Step 3: Harden build and deployment files**

Make `.env.example` contain variable names and safe empty values only. Include generation commands in `docs/security-deployment.md` that operators run locally; never add generated values to Git. Change Docker to Node 22 LTS, copy/install `requirements.lock` with `--require-hashes`, and add OCI revision/source labels from `ARG GIT_SHA`.

Change the GitHub workflow to current checkout, setup-node, and setup-python major versions; run backend tests and `pip-audit`, run `npm ci`, frontend contracts, lint, `npm audit --omit=dev --audit-level=high`, and build before deployment. Publish/tag the container with `${{ github.sha }}` and configure Zeabur to deploy that immutable SHA tag or digest rather than `latest`.

Declare every required runtime variable in `zeabur.json` with an empty default and a description. Do not put plaintext values, example passwords, or generated hashes in the template.

- [ ] **Step 4: Run audits, builds, and deployment contracts**

Run: `cd frontend && npm audit --omit=dev --audit-level=high`

Expected: zero high or critical production findings. Upgrade the smallest compatible dependency set and regenerate the lock until this command exits 0.

Run: `cd frontend && npm ci && node --test src/__tests__/*.test.js && npm run lint && npm run build`

Expected: install, tests, lint, and Vite production build all exit 0.

Run: `cd backend && python -m pip_audit -r requirements.lock && python -m pytest tests/test_deployment_security.py -q`

Expected: audit and deployment contracts exit 0.

- [ ] **Step 5: Commit**

```powershell
git add backend/.env.example Dockerfile zeabur.json .github/workflows/deploy.yml frontend/package.json frontend/package-lock.json docs/security-deployment.md backend/tests/test_deployment_security.py
git commit -m "build: enforce secure production deployment"
```

---

### Task 8: Browser security regression suite and final proof

**Files:**
- Modify: `e2e-playwright.spec.js`
- Create: `security-e2e.spec.js`
- Modify: `security_best_practices_report.md`

**Interfaces:**
- Consumes: local backend/frontend started with explicit test-only environment values supplied by the shell, never tracked.
- Produces: browser evidence for login, reload, logout, CSP, docs, cookie flags, protected APIs, and absence of Web Storage auth.

- [ ] **Step 1: Replace browser token seeding with real session setup and write failing security E2E tests**

```javascript
async function login(page) {
  await page.goto(`${E2E_BASE_URL}/login`);
  await page.getByLabel('Username').fill(process.env.E2E_DASHBOARD_USER);
  await page.getByLabel('Password').fill(process.env.E2E_DASHBOARD_PASSWORD);
  await page.getByRole('button', { name: 'Sign In' }).click();
  await page.waitForURL('**/home');
}

test('session is HttpOnly, survives reload, and never enters Web Storage', async ({ page, context }) => {
  await login(page);
  const cookie = (await context.cookies()).find((item) => item.name === 'nod_session');
  expect(cookie.httpOnly).toBe(true);
  expect(cookie.sameSite).toBe('Strict');
  await expect.poll(() => page.evaluate(() => localStorage.getItem('nod_auth_token'))).toBeNull();
  await page.reload();
  await expect(page).toHaveURL(/\/home$/);
});

test('logout invalidates browser access', async ({ page, request }) => {
  await login(page);
  await page.getByRole('button', { name: 'Logout' }).click();
  await expect(page).toHaveURL(/\/login$/);
  expect((await request.get(`${E2E_BASE_URL}/api/v1/overview`)).status()).toBe(401);
});
```

Also assert anonymous navigation redirects, attacker-origin preflight has no `Access-Control-Allow-Origin`, production docs return `404`, security headers exist, and browser console contains no CSP violations while Home, Site Map, and RF Tilt render.

- [ ] **Step 2: Run security E2E and verify RED before adapting the old suite**

Run: `npx playwright test security-e2e.spec.js --project=chromium`

Expected: the old token-based browser setup or missing server hardening causes at least one intentional failure before implementation is complete.

- [ ] **Step 3: Update existing Playwright authentication helper**

Remove all `nod_auth_token` and `nod_last_activity` writes from `e2e-playwright.spec.js`. Route all authenticated tests through the real `login(page)` helper. Read credentials only from `E2E_DASHBOARD_USER` and `E2E_DASHBOARD_PASSWORD`; throw a clear startup error naming missing variables without printing their values.

- [ ] **Step 4: Run the complete verification matrix**

Run: `cd backend && python -m pytest tests -q`

Run: `cd frontend && node --test src/__tests__/*.test.js && npm run lint && npm audit --omit=dev --audit-level=high && npm run build`

Run: `npx playwright test security-e2e.spec.js e2e-playwright.spec.js --project=chromium`

Run: `graphify update .`

Run: `git diff --check && git status --short`

Expected: every test/audit/build exits 0; Graphify updates successfully; `git diff --check` is empty; status contains only intentional security changes plus the user's pre-existing unrelated files.

- [ ] **Step 5: Update finding status and commit final evidence**

Mark SEC-001 through SEC-010 as remediated in `security_best_practices_report.md`, citing tests and remaining operational requirements. Do not mark production deployment verified until the hardened image is deployed and the live checks pass.

```powershell
git add e2e-playwright.spec.js security-e2e.spec.js security_best_practices_report.md graphify-out
git commit -m "test: prove dashboard security controls"
```

## Production rollout checkpoint

Before deploying, the operator must set all required Zeabur variables, including an Argon2id hash and random base64 session secret generated locally. Deploy the immutable SHA image to a preview service first. Run the security E2E suite with `E2E_BASE_URL` pointing at preview, then deploy production and repeat anonymous API, cookie, logout, docs, CORS, CSP, and header checks. Rotating `DASHBOARD_SESSION_SECRET` is the emergency session-revocation procedure.

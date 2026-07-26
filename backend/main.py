"""FastAPI application entry point for the Network Operation Dashboard."""

from __future__ import annotations

import os
import pathlib
import asyncio
import ipaddress
import socket
from contextlib import asynccontextmanager

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Request, Response, status
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
from starlette.middleware.trustedhost import TrustedHostMiddleware
from starlette.responses import FileResponse

from cache import redis_cache
from config import SecuritySettings
from middleware import RequestBodyLimitMiddleware, SecurityHeadersMiddleware
from rate_limit import InMemoryRateLimiter, RateLimitExceeded
from security import (
    SESSION_COOKIE_NAME,
    SessionManager,
    credentials_are_valid,
    require_dashboard_session,
    verify_browser_origin,
    verify_n8n_key,
)


load_dotenv()

API_PREFIX = os.getenv("API_PREFIX", "/api/v1")
FRONTEND_DIST = pathlib.Path(__file__).parent.parent / "frontend" / "dist"
LOGIN_FAILURE_LIMIT = 5
LOGIN_FAILURE_WINDOW_SECONDS = 5 * 60
CONTENT_SECURITY_POLICY = (
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' "
    "https://fonts.googleapis.com; font-src 'self' data: https://fonts.gstatic.com; "
    "img-src 'self' data: blob: https://api.mapbox.com https://*.tiles.mapbox.com; "
    "connect-src 'self' https://api.mapbox.com https://events.mapbox.com https://*.tiles.mapbox.com; "
    "worker-src 'self' blob:; child-src blob:; object-src 'none'; base-uri 'self'; "
    "form-action 'self'; frame-ancestors 'none'"
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Connect optional cache infrastructure and refresh the metrics cache."""
    print("[NOD] Backend starting up...")

    if await redis_cache.connect():
        print("[NOD] Redis cache connected.")
    elif redis_cache.enabled:
        print("[NOD] WARNING: Redis cache is unreachable; continuing without cache.")
    else:
        print("[NOD] Redis cache is disabled.")

    try:
        from database import engine as database_engine
        from queries.metrics_cache import (
            BOOTSTRAP_SITE_MONTH_METRICS_STATEMENTS,
            REFRESH_SITE_MONTH_DELETE_QUERY,
            REFRESH_SITE_MONTH_INSERT_QUERY,
        )
        from sqlalchemy import text
        from sqlalchemy.ext.asyncio import AsyncSession
        from sqlalchemy.orm import sessionmaker

        session_local = sessionmaker(
            database_engine,
            class_=AsyncSession,
            expire_on_commit=False,
        )
        async with session_local() as session:
            for statement in BOOTSTRAP_SITE_MONTH_METRICS_STATEMENTS:
                await session.execute(text(statement))
            await session.commit()

            missing_periods = await session.execute(
                text(
                    '''
                    SELECT DISTINCT a."Tahun"::INT AS tahun, a."Bulan"::INT AS bulan
                    FROM availability_logs_jatim a
                    WHERE a."Tahun" IS NOT NULL AND a."Bulan" IS NOT NULL
                      AND NOT EXISTS (
                          SELECT 1 FROM site_month_metrics m
                          WHERE m.tahun = a."Tahun"::INT AND m.bulan = a."Bulan"::INT
                      )
                    ORDER BY tahun, bulan
                    '''
                )
            )
            for period in missing_periods.fetchall():
                params = {"tahun": period.tahun, "bulan": period.bulan}
                await session.execute(text(REFRESH_SITE_MONTH_DELETE_QUERY), params)
                await session.execute(text(REFRESH_SITE_MONTH_INSERT_QUERY), params)
            await session.commit()
    except Exception as exc:
        print(f"[NOD] WARNING: Auto-refresh metrics cache failed: {exc}")

    try:
        yield
    finally:
        await redis_cache.close()
        print("[NOD] Backend shutting down...")


class LoginRequest(BaseModel):
    username: str = Field(min_length=1, max_length=128)
    password: str = Field(min_length=1, max_length=1024)


class AuthSessionResponse(BaseModel):
    authenticated: bool
    username: str | None = None


class N8NAlertPayload(BaseModel):
    site_id: str
    event_type: str
    timestamp: str
    detail: str | None = None


def _set_session_cookie(response: Response, settings: SecuritySettings, token: str) -> None:
    response.set_cookie(
        key=SESSION_COOKIE_NAME,
        value=token,
        max_age=settings.dashboard_session_ttl_seconds,
        httponly=True,
        secure=settings.session_cookie_secure,
        samesite="strict",
        path="/",
    )


def _clear_session_cookie(response: Response, settings: SecuritySettings) -> None:
    response.delete_cookie(
        key=SESSION_COOKIE_NAME,
        httponly=True,
        secure=settings.session_cookie_secure,
        samesite="strict",
        path="/",
    )


def _runtime_allowed_hosts(configured_hosts: tuple[str, ...]) -> list[str]:
    allowed_hosts = list(configured_hosts)
    try:
        runtime_ip = socket.gethostbyname(socket.gethostname())
        runtime_address = ipaddress.ip_address(runtime_ip)
    except (OSError, ValueError):
        return allowed_hosts

    if runtime_address.is_private and runtime_ip not in allowed_hosts:
        allowed_hosts.append(runtime_ip)
    return allowed_hosts


def create_app(settings: SecuritySettings | None = None) -> FastAPI:
    """Build the application with explicit security configuration for tests."""
    security_settings = settings or SecuritySettings.from_env()
    documentation_url = None if security_settings.is_production else "/docs"
    redoc_url = None if security_settings.is_production else "/redoc"
    openapi_url = None if security_settings.is_production else f"{API_PREFIX}/openapi.json"

    app = FastAPI(
        title="Network Operation Dashboard API",
        description="Backend API untuk monitoring availability site telekomunikasi Jawa Timur",
        version="1.0.0",
        lifespan=lifespan,
        docs_url=documentation_url,
        redoc_url=redoc_url,
        openapi_url=openapi_url,
    )
    app.state.security_settings = security_settings
    app.state.session_manager = SessionManager(security_settings)
    app.state.login_limiter = InMemoryRateLimiter()
    app.state.rf_limiter = InMemoryRateLimiter()
    app.state.rf_analysis_semaphore = asyncio.Semaphore(2)
    app.add_middleware(
        TrustedHostMiddleware,
        allowed_hosts=_runtime_allowed_hosts(security_settings.allowed_hosts),
    )
    app.add_middleware(RequestBodyLimitMiddleware, max_bytes=1_048_576)
    app.add_middleware(SecurityHeadersMiddleware, content_security_policy=CONTENT_SECURITY_POLICY)

    @app.get(f"{API_PREFIX}/health")
    async def health_check():
        return {"status": "ok"}

    @app.post(f"{API_PREFIX}/auth/login", response_model=AuthSessionResponse)
    async def login(credentials: LoginRequest, request: Request, response: Response):
        verify_browser_origin(request)
        client_address = request.client.host if request.client else "unknown"
        limiter_key = f"{credentials.username.strip().casefold()}:{client_address}"
        try:
            app.state.login_limiter.check(
                limiter_key,
                LOGIN_FAILURE_LIMIT,
                LOGIN_FAILURE_WINDOW_SECONDS,
            )
        except RateLimitExceeded as exc:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Too many failed login attempts",
                headers={"Retry-After": str(exc.retry_after)},
            ) from exc

        if not credentials_are_valid(
            security_settings,
            credentials.username,
            credentials.password,
        ):
            app.state.login_limiter.record_failure(
                limiter_key,
                LOGIN_FAILURE_WINDOW_SECONDS,
            )
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid username or password",
            )

        app.state.login_limiter.reset(limiter_key)

        _set_session_cookie(
            response,
            security_settings,
            app.state.session_manager.issue(security_settings.dashboard_user),
        )
        return AuthSessionResponse(
            authenticated=True,
            username=security_settings.dashboard_user,
        )

    @app.get(f"{API_PREFIX}/auth/session", response_model=AuthSessionResponse)
    async def auth_session(subject: str = Depends(require_dashboard_session)):
        return AuthSessionResponse(authenticated=True, username=subject)

    @app.post(f"{API_PREFIX}/auth/logout", response_model=AuthSessionResponse)
    async def logout(response: Response, _: str = Depends(require_dashboard_session)):
        _clear_session_cookie(response, security_settings)
        return AuthSessionResponse(authenticated=False)

    @app.post(f"{API_PREFIX}/webhook/n8n/alert", dependencies=[Depends(verify_n8n_key)])
    async def n8n_webhook(payload: N8NAlertPayload):
        print(f"[ALERT] N8N: {payload.event_type} on site {payload.site_id}")
        return {
            "received": True,
            "site_id": payload.site_id,
            "event_type": payload.event_type,
        }

    from routers import activity_enom as activity_enom_router
    from routers import admin as admin_router
    from routers import availability as availability_router
    from routers import data_potensi as data_potensi_router
    from routers import impact_service as impact_service_router
    from routers import map as map_router
    from routers import n8n_map as n8n_map_router
    from routers import overview as overview_router
    from routers import reporting as reporting_router
    from routers import rf_tilt as rf_tilt_router
    from routers import sites as sites_router
    from routers import ticketing as ticketing_router
    from routers import tower_plan as tower_plan_router
    from routers import transport_quality as transport_quality_router

    dashboard_dependency = [Depends(require_dashboard_session)]
    app.include_router(map_router.router, prefix=API_PREFIX, dependencies=dashboard_dependency)
    app.include_router(availability_router.router, prefix=API_PREFIX, dependencies=dashboard_dependency)
    app.include_router(sites_router.router, prefix=API_PREFIX, dependencies=dashboard_dependency)
    app.include_router(reporting_router.router, prefix=API_PREFIX, dependencies=dashboard_dependency)
    app.include_router(impact_service_router.router, prefix=API_PREFIX, dependencies=dashboard_dependency)
    app.include_router(transport_quality_router.router, prefix=API_PREFIX, dependencies=dashboard_dependency)
    app.include_router(ticketing_router.router, prefix=API_PREFIX, dependencies=dashboard_dependency)
    app.include_router(overview_router.router, prefix=API_PREFIX, dependencies=dashboard_dependency)
    app.include_router(activity_enom_router.router, prefix=API_PREFIX, dependencies=dashboard_dependency)
    app.include_router(data_potensi_router.router, prefix=API_PREFIX, dependencies=dashboard_dependency)
    app.include_router(rf_tilt_router.router, prefix=API_PREFIX, dependencies=dashboard_dependency)
    app.include_router(tower_plan_router.router, prefix=API_PREFIX, dependencies=dashboard_dependency)
    app.include_router(admin_router.router, prefix=API_PREFIX)
    app.include_router(n8n_map_router.router, prefix=API_PREFIX)

    if FRONTEND_DIST.exists():
        app.mount("/assets", StaticFiles(directory=str(FRONTEND_DIST / "assets")), name="assets")

        @app.get("/{full_path:path}")
        async def serve_spa(full_path: str):
            api_prefix_path = API_PREFIX.strip("/")
            disabled_docs_paths = {"docs", "redoc"}
            if (
                full_path in disabled_docs_paths
                or full_path == api_prefix_path
                or full_path.startswith(f"{api_prefix_path}/")
            ):
                raise HTTPException(status_code=404, detail="API route not found")

            file_path = FRONTEND_DIST / full_path
            if file_path.exists() and file_path.is_file():
                return FileResponse(str(file_path))
            return FileResponse(str(FRONTEND_DIST / "index.html"))

    return app


app = create_app()

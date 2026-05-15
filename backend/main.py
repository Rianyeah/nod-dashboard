"""
FastAPI application entry point.
Network Operation Dashboard — Backend API.
"""
import os
from contextlib import asynccontextmanager
from dotenv import load_dotenv
from fastapi import FastAPI, Depends, HTTPException, status, Header, Security
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel

load_dotenv()

API_PREFIX = os.getenv("API_PREFIX", "/api/v1")
ALLOWED_ORIGINS = os.getenv("ALLOWED_ORIGINS", "*").split(",")
N8N_API_KEY = os.getenv("N8N_API_KEY", "change-me-n8n-secret")
DASHBOARD_USER = os.getenv("DASHBOARD_USER", "admin")
DASHBOARD_PASS = os.getenv("DASHBOARD_PASS", "admin123")
DASHBOARD_TOKEN = "nod-dashboard-token-123"  # Simple fixed token for valid session


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan — startup & shutdown."""
    print("[NOD] Backend starting up...")
    yield
    print("[NOD] Backend shutting down...")


app = FastAPI(
    title="Network Operation Dashboard API",
    description="Backend API untuk monitoring availability site telekomunikasi Jawa Timur",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------- Health Check ----------

@app.get(f"{API_PREFIX}/health")
async def health_check():
    """Health check endpoint for UptimeRobot."""
    from database import check_db_connection
    db_ok = await check_db_connection()
    return {
        "status": "ok" if db_ok else "degraded",
        "database": "connected" if db_ok else "unreachable",
        "service": "nod-backend",
    }


# ---------- Authentication ----------

class LoginRequest(BaseModel):
    username: str
    password: str

@app.post(f"{API_PREFIX}/auth/login")
async def login(credentials: LoginRequest):
    if credentials.username == DASHBOARD_USER and credentials.password == DASHBOARD_PASS:
        return {"token": DASHBOARD_TOKEN}
    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Incorrect username or password",
    )

security = HTTPBearer()

def verify_token(credentials: HTTPAuthorizationCredentials = Security(security)):
    if credentials.credentials != DASHBOARD_TOKEN:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication credentials",
        )
    return credentials.credentials

def verify_n8n_key(x_n8n_api_key: str = Header(...)):
    if x_n8n_api_key != N8N_API_KEY:
        raise HTTPException(status_code=401, detail="Invalid N8N API Key")
    return x_n8n_api_key


# ---------- N8N Webhook ----------

class N8NAlertPayload(BaseModel):
    site_id: str
    event_type: str
    timestamp: str
    detail: str | None = None


@app.post(f"{API_PREFIX}/webhook/n8n/alert", dependencies=[Depends(verify_n8n_key)])
async def n8n_webhook(payload: N8NAlertPayload):
    """Webhook endpoint for N8N outage alerts."""
    # Log the alert (in production, this would trigger notifications)
    print(f"[ALERT] N8N: {payload.event_type} on site {payload.site_id}")
    return {"received": True, "site_id": payload.site_id, "event_type": payload.event_type}


# ---------- Register Routers ----------

from routers import map as map_router
from routers import availability as availability_router
from routers import sites as sites_router

# NOTE: Token auth removed for initial deployment — dashboard is internal
app.include_router(map_router.router, prefix=API_PREFIX)
app.include_router(availability_router.router, prefix=API_PREFIX)
app.include_router(sites_router.router, prefix=API_PREFIX)


# ---------- Serve Frontend Static Files (Production) ----------

import pathlib
from fastapi.staticfiles import StaticFiles
from starlette.responses import FileResponse

FRONTEND_DIST = pathlib.Path(__file__).parent.parent / "frontend" / "dist"

if FRONTEND_DIST.exists():
    # Serve static assets (JS, CSS, images)
    app.mount("/assets", StaticFiles(directory=str(FRONTEND_DIST / "assets")), name="assets")

    # SPA fallback — serve index.html for all non-API routes
    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        """Serve frontend SPA for any non-API route."""
        file_path = FRONTEND_DIST / full_path
        if file_path.exists() and file_path.is_file():
            return FileResponse(str(file_path))
        return FileResponse(str(FRONTEND_DIST / "index.html"))


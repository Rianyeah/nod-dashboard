"""
Shared lightweight API key dependencies.
"""
import os
from fastapi import Header, HTTPException, Security, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from dotenv import load_dotenv


load_dotenv()


N8N_API_KEY = os.getenv("N8N_API_KEY", "change-me-n8n-secret")
DASHBOARD_TOKEN = "nod-dashboard-token-123"  # Simple fixed token for valid session
dashboard_security = HTTPBearer()


def verify_n8n_key(x_n8n_api_key: str = Header(...)):
    if x_n8n_api_key != N8N_API_KEY:
        raise HTTPException(status_code=401, detail="Invalid N8N API Key")
    return x_n8n_api_key


def verify_dashboard_token(
    credentials: HTTPAuthorizationCredentials = Security(dashboard_security),
):
    if credentials.credentials != DASHBOARD_TOKEN:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication credentials",
        )
    return credentials.credentials

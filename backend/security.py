"""
Shared lightweight API key dependencies.
"""
import os
from fastapi import Header, HTTPException
from dotenv import load_dotenv


load_dotenv()


N8N_API_KEY = os.getenv("N8N_API_KEY", "change-me-n8n-secret")


def verify_n8n_key(x_n8n_api_key: str = Header(...)):
    if x_n8n_api_key != N8N_API_KEY:
        raise HTTPException(status_code=401, detail="Invalid N8N API Key")
    return x_n8n_api_key

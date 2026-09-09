"""Bounded server-side client for stopping an N8N execution."""

from __future__ import annotations

import asyncio
from dataclasses import dataclass
from urllib.parse import quote

import httpx

from config import DataSyncSettings


@dataclass(frozen=True)
class StopResult:
    confirmed: bool
    timed_out: bool = False


def _confirmed_stop(response: httpx.Response) -> bool:
    if not 200 <= response.status_code < 300 or len(response.content) > 16_384:
        return False
    if not response.headers.get("content-type", "").lower().startswith(
        "application/json"
    ):
        return False
    try:
        payload = response.json()
    except ValueError:
        return False
    if isinstance(payload, dict) and isinstance(payload.get("data"), dict):
        payload = payload["data"]
    if not isinstance(payload, dict):
        return False
    status = str(payload.get("status", "")).lower()
    return bool(payload.get("stoppedAt")) or status in {"canceled", "cancelled", "stopped"}


async def stop_n8n_execution(
    *,
    settings: DataSyncSettings,
    execution_id: str,
    transport: httpx.AsyncBaseTransport | None = None,
) -> StopResult:
    encoded_id = quote(execution_id, safe="")
    execution_url = f"{settings.base_url}/api/v1/executions/{encoded_id}"
    headers = {"X-N8N-API-KEY": settings.execution_api_key}
    try:
        async with asyncio.timeout(12):
            async with httpx.AsyncClient(
                timeout=httpx.Timeout(10, connect=3),
                follow_redirects=False,
                transport=transport,
            ) as client:
                response = await client.post(f"{execution_url}/stop", headers=headers)
                if _confirmed_stop(response):
                    return StopResult(confirmed=True)
                if response.status_code not in {404, 409}:
                    return StopResult(confirmed=False)
                current = await client.get(execution_url, headers=headers)
                return StopResult(confirmed=_confirmed_stop(current))
    except (TimeoutError, httpx.TimeoutException):
        return StopResult(confirmed=False, timed_out=True)
    except httpx.RequestError:
        return StopResult(confirmed=False)

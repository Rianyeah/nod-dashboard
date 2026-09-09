"""Single-attempt HTTP dispatch for dashboard-triggered n8n workflows."""

from __future__ import annotations

import asyncio
from dataclasses import dataclass
from enum import StrEnum
from uuid import UUID

import httpx

from config import DataSyncSettings


class DispatchOutcome(StrEnum):
    ACCEPTED = "accepted"
    REJECTED_4XX = "rejected_4xx"
    TIMEOUT_UNKNOWN = "timeout_unknown"
    NETWORK_UNKNOWN = "network_unknown"
    SERVER_UNKNOWN = "server_unknown"
    INVALID_ACK_UNKNOWN = "invalid_ack_unknown"


@dataclass(frozen=True)
class DispatchResult:
    outcome: DispatchOutcome


async def dispatch_n8n(
    *,
    settings: DataSyncSettings,
    dataset: str,
    job_id: UUID,
    requested_by: str,
    requested_at: str,
    public_app_origin: str,
    job_token: str,
    correlation_id: str,
    transport: httpx.AsyncBaseTransport | None = None,
) -> DispatchResult:
    """Attempt one authenticated dispatch and classify ambiguous outcomes."""
    job_id_text = str(job_id)
    integration_base = f"{public_app_origin}/api/v1/integrations/n8n/data-sync/{job_id_text}"
    payload = {
        "job_id": job_id_text,
        "dataset": dataset,
        "requested_by": requested_by,
        "requested_at": requested_at,
        "claim_url": f"{integration_base}/claim",
        "callback_url": f"{integration_base}/callback",
        "job_token": job_token,
        "correlation_id": correlation_id,
        "protocol_version": 1,
    }
    timeout = httpx.Timeout(connect=3.0, read=5.0, write=5.0, pool=3.0)
    try:
        async with asyncio.timeout(10.0):
            async with httpx.AsyncClient(
                timeout=timeout,
                follow_redirects=False,
                transport=transport,
            ) as client:
                response = await client.post(
                    settings.webhook_url_for(dataset),
                    headers={
                        "X-N8N-Sync-API-Key": settings.trigger_api_key,
                        "Idempotency-Key": job_id_text,
                    },
                    json=payload,
                )
    except (TimeoutError, httpx.TimeoutException):
        return DispatchResult(DispatchOutcome.TIMEOUT_UNKNOWN)
    except httpx.RequestError:
        return DispatchResult(DispatchOutcome.NETWORK_UNKNOWN)

    if 400 <= response.status_code < 500:
        return DispatchResult(DispatchOutcome.REJECTED_4XX)
    if response.status_code >= 500:
        return DispatchResult(DispatchOutcome.SERVER_UNKNOWN)
    if response.status_code != 202 or len(response.content) > 16_384:
        return DispatchResult(DispatchOutcome.INVALID_ACK_UNKNOWN)

    content_type = response.headers.get("content-type", "").lower()
    if not content_type.startswith("application/json"):
        return DispatchResult(DispatchOutcome.INVALID_ACK_UNKNOWN)
    try:
        acknowledgement = response.json()
    except ValueError:
        return DispatchResult(DispatchOutcome.INVALID_ACK_UNKNOWN)
    if acknowledgement != {"accepted": True, "job_id": job_id_text}:
        return DispatchResult(DispatchOutcome.INVALID_ACK_UNKNOWN)
    return DispatchResult(DispatchOutcome.ACCEPTED)

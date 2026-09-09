import json
from uuid import uuid4

import httpx
import pytest

from config import DataSyncSettings


def sync_settings():
    return DataSyncSettings(
        enabled=True,
        job_timeout_seconds=1800,
        base_url="https://n8n.example.com",
        webhook_urls={
            "impact_service": "https://n8n.example.com/webhook/impact-sync",
            "data_master": "https://n8n.example.com/webhook/master-sync",
            "activity_enom": "https://n8n.example.com/webhook/enom-sync",
        },
        trigger_api_key="sync-trigger-secret-value-1234567890",
    )


@pytest.mark.asyncio
async def test_dispatch_sends_exact_single_job_contract_and_accepts_matching_ack():
    from services.data_sync_dispatch import dispatch_n8n

    job_id = uuid4()
    requests = []

    def handler(request):
        requests.append(request)
        payload = json.loads(request.content)
        assert payload == {
            "job_id": str(job_id),
            "dataset": "data_master",
            "requested_by": "viewer.one",
            "requested_at": "2026-09-08T10:00:00Z",
            "claim_url": (
                "https://dashboard.example/api/v1/integrations/n8n/"
                f"data-sync/{job_id}/claim"
            ),
            "callback_url": (
                "https://dashboard.example/api/v1/integrations/n8n/"
                f"data-sync/{job_id}/callback"
            ),
            "job_token": "single-job-token",
            "correlation_id": "correlation-1",
            "protocol_version": 1,
        }
        return httpx.Response(
            202,
            headers={"Content-Type": "application/json"},
            json={"accepted": True, "job_id": str(job_id)},
        )

    result = await dispatch_n8n(
        settings=sync_settings(),
        dataset="data_master",
        job_id=job_id,
        requested_by="viewer.one",
        requested_at="2026-09-08T10:00:00Z",
        public_app_origin="https://dashboard.example",
        job_token="single-job-token",
        correlation_id="correlation-1",
        transport=httpx.MockTransport(handler),
    )

    assert result.outcome == "accepted"
    assert len(requests) == 1
    assert requests[0].headers["Idempotency-Key"] == str(job_id)
    assert requests[0].headers["X-N8N-Sync-API-Key"] == sync_settings().trigger_api_key


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("response", "expected"),
    [
        (httpx.Response(401), "rejected_4xx"),
        (httpx.Response(500), "server_unknown"),
        (httpx.Response(302, headers={"Location": "https://other.example"}), "invalid_ack_unknown"),
        (httpx.Response(200, json={"accepted": True}), "invalid_ack_unknown"),
        (httpx.Response(202, text="not-json"), "invalid_ack_unknown"),
        (httpx.Response(202, json={"accepted": True, "job_id": str(uuid4())}), "invalid_ack_unknown"),
    ],
)
async def test_dispatch_classifies_rejections_and_ambiguous_responses(response, expected):
    from services.data_sync_dispatch import dispatch_n8n

    calls = 0

    def handler(_request):
        nonlocal calls
        calls += 1
        return response

    result = await dispatch_n8n(
        settings=sync_settings(),
        dataset="impact_service",
        job_id=uuid4(),
        requested_by="viewer.one",
        requested_at="2026-09-08T10:00:00Z",
        public_app_origin="https://dashboard.example",
        job_token="single-job-token",
        correlation_id="correlation-1",
        transport=httpx.MockTransport(handler),
    )

    assert result.outcome == expected
    assert calls == 1


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("error", "expected"),
    [
        (httpx.ReadTimeout("slow n8n"), "timeout_unknown"),
        (httpx.ConnectError("connection reset"), "network_unknown"),
    ],
)
async def test_dispatch_never_retries_transport_errors(error, expected):
    from services.data_sync_dispatch import dispatch_n8n

    calls = 0

    def handler(request):
        nonlocal calls
        calls += 1
        error.request = request
        raise error

    result = await dispatch_n8n(
        settings=sync_settings(),
        dataset="activity_enom",
        job_id=uuid4(),
        requested_by="viewer.one",
        requested_at="2026-09-08T10:00:00Z",
        public_app_origin="https://dashboard.example",
        job_token="single-job-token",
        correlation_id="correlation-1",
        transport=httpx.MockTransport(handler),
    )

    assert result.outcome == expected
    assert calls == 1

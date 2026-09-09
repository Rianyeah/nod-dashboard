import json

import httpx
import pytest

from test_data_sync_dispatch import sync_settings


@pytest.mark.asyncio
async def test_stop_client_confirms_canceled_execution_without_leaking_identifier():
    from services.data_sync_cancel import stop_n8n_execution

    requests = []

    def handler(request):
        requests.append(request)
        return httpx.Response(
            200,
            headers={"Content-Type": "application/json"},
            json={
                "id": "execution-1",
                "status": "canceled",
                "stoppedAt": "2026-09-09T07:00:00Z",
            },
        )

    result = await stop_n8n_execution(
        settings=sync_settings(),
        execution_id="execution-1",
        transport=httpx.MockTransport(handler),
    )

    assert result.confirmed is True
    assert requests[0].method == "POST"
    assert requests[0].url.path == "/api/v1/executions/execution-1/stop"
    assert requests[0].headers["X-N8N-API-KEY"] == sync_settings().execution_api_key
    assert "execution-1" not in repr(result)


@pytest.mark.asyncio
async def test_stop_client_reconciles_already_stopped_execution():
    from services.data_sync_cancel import stop_n8n_execution

    methods = []

    def handler(request):
        methods.append(request.method)
        if request.method == "POST":
            return httpx.Response(409)
        return httpx.Response(
            200,
            headers={"Content-Type": "application/json"},
            json={"id": "execution-1", "status": "canceled"},
        )

    result = await stop_n8n_execution(
        settings=sync_settings(),
        execution_id="execution-1",
        transport=httpx.MockTransport(handler),
    )

    assert result.confirmed is True
    assert methods == ["POST", "GET"]


@pytest.mark.asyncio
async def test_stop_client_keeps_timeout_bounded_and_safe():
    from services.data_sync_cancel import stop_n8n_execution

    def handler(request):
        error = httpx.ReadTimeout("raw secret response")
        error.request = request
        raise error

    result = await stop_n8n_execution(
        settings=sync_settings(),
        execution_id="execution-sensitive",
        transport=httpx.MockTransport(handler),
    )

    assert result.confirmed is False
    assert result.timed_out is True
    assert "execution-sensitive" not in repr(result)
    assert "raw secret response" not in repr(result)


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "response",
    [
        httpx.Response(500, text="internal secret"),
        httpx.Response(200, text="not-json"),
        httpx.Response(
            200,
            headers={"Content-Type": "application/json"},
            content=json.dumps({"status": "running"}),
        ),
    ],
)
async def test_stop_client_does_not_confirm_unsafe_or_ambiguous_responses(response):
    from services.data_sync_cancel import stop_n8n_execution

    result = await stop_n8n_execution(
        settings=sync_settings(),
        execution_id="execution-1",
        transport=httpx.MockTransport(lambda _request: response),
    )

    assert result.confirmed is False

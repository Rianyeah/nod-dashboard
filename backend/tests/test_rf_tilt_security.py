import pytest
from fastapi import HTTPException
from pydantic import ValidationError
from unittest.mock import AsyncMock

from models.rf_tilt import TiltAnalysisRequest
from routers.rf_tilt import (
    MAX_RF_ANALYSIS_SAMPLES,
    analyze_tilt,
    resolve_analysis_parameters,
)
from tests.conftest import TEST_ORIGIN


@pytest.mark.parametrize(
    ("field", "value"),
    (
        ("latitude", 91),
        ("longitude", 181),
        ("max_distance", 50_001),
        ("sample_interval", 9.9),
    ),
)
def test_rf_request_rejects_out_of_bounds_values(valid_payload, field, value):
    with pytest.raises(ValidationError):
        TiltAnalysisRequest(**{**valid_payload, field: value})


def test_rf_request_rejects_more_than_200_clutter_points(valid_payload):
    with pytest.raises(ValidationError):
        TiltAnalysisRequest(
            **{**valid_payload, "clutter": [{"distance": 1, "height": 1}] * 201}
        )


def test_rf_target_coordinates_must_be_provided_together(valid_payload):
    with pytest.raises(ValidationError):
        TiltAnalysisRequest(**{**valid_payload, "target_latitude": -7.2})


def test_maximum_legal_rf_analysis_uses_5001_samples(valid_payload):
    request = TiltAnalysisRequest(
        **{**valid_payload, "max_distance": 50_000, "sample_interval": 10}
    )

    _, _, distance, samples = resolve_analysis_parameters(request)

    assert distance == 50_000
    assert samples == MAX_RF_ANALYSIS_SAMPLES == 5_001


def test_target_over_50km_fails_before_elevation_fetch(
    authenticated_client, mocker, valid_payload
):
    fetch = mocker.patch("routers.rf_tilt.fetch_elevations_open_meteo", new_callable=AsyncMock)

    response = authenticated_client.post(
        "/api/v1/rf-tilt/analysis",
        json={**valid_payload, "target_latitude": -6.0, "target_longitude": 110.0},
        headers={"Origin": TEST_ORIGIN},
    )

    assert response.status_code == 422
    fetch.assert_not_awaited()


def test_eleventh_rf_analysis_is_rate_limited(
    authenticated_client, mocker, valid_payload
):
    mocker.patch(
        "routers.rf_tilt.fetch_elevations_open_meteo",
        new_callable=AsyncMock,
        return_value=[100.0] * 68,
    )

    for _ in range(10):
        response = authenticated_client.post(
            "/api/v1/rf-tilt/analysis",
            json=valid_payload,
            headers={"Origin": TEST_ORIGIN},
        )
        assert response.status_code == 200

    blocked = authenticated_client.post(
        "/api/v1/rf-tilt/analysis",
        json=valid_payload,
        headers={"Origin": TEST_ORIGIN},
    )

    assert blocked.status_code == 429
    assert blocked.headers["Retry-After"] == "60"


@pytest.mark.asyncio
async def test_third_concurrent_rf_analysis_is_rejected(
    client, mocker, valid_payload
):
    import asyncio
    from starlette.requests import Request

    app = client.app
    request = Request(
        {
            "type": "http",
            "app": app,
            "client": ("127.0.0.1", 54321),
            "headers": [],
        }
    )
    request.state.dashboard_subject = "operator"
    analysis_request = TiltAnalysisRequest(**valid_payload)
    started = asyncio.Event()
    release = asyncio.Event()
    active = 0

    async def slow_elevation_fetch(_points):
        nonlocal active
        active += 1
        if active == 2:
            started.set()
        await release.wait()
        return [100.0] * 68

    mocker.patch(
        "routers.rf_tilt.fetch_elevations_open_meteo",
        side_effect=slow_elevation_fetch,
    )

    first = asyncio.create_task(analyze_tilt(analysis_request, request, AsyncMock()))
    second = asyncio.create_task(analyze_tilt(analysis_request, request, AsyncMock()))
    await asyncio.wait_for(started.wait(), timeout=1)

    with pytest.raises(HTTPException) as blocked:
        await analyze_tilt(analysis_request, request, AsyncMock())

    assert blocked.value.status_code == 429
    assert blocked.value.headers == {"Retry-After": "1"}

    release.set()
    await asyncio.gather(first, second)

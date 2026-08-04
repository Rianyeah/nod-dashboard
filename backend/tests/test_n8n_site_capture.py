import asyncio
import importlib

import pytest
from fastapi import HTTPException


CAPTURE_TOKEN_PATH = "/api/v1/integrations/n8n/site-detail-capture-token"
CAPTURE_BUNDLE_PATH = "/api/v1/integrations/n8n/site-detail-capture"
CAPTURE_KEY = "test-only-n8n-capture-key"


def capture_router():
    return importlib.import_module("routers.n8n_site_capture")


class ScalarResult:
    def __init__(self, value):
        self.value = value

    def scalar(self):
        return self.value


class ExistsSession:
    def __init__(self, exists=True):
        self.exists = exists
        self.calls = []

    async def execute(self, statement, params):
        self.calls.append((str(statement), params))
        return ScalarResult(self.exists)


def install_session_override(client, session):
    router = capture_router()

    async def override_get_session():
        yield session

    client.app.dependency_overrides[router.get_session] = override_get_session
    return router


def mint(client, site_id="BGL002"):
    return client.post(
        CAPTURE_TOKEN_PATH,
        headers={"X-N8N-Capture-API-Key": CAPTURE_KEY},
        json={"site_id": site_id, "theme": "dark"},
    )


def test_capture_token_issuer_requires_its_dedicated_key(client):
    for headers in (
        {},
        {"X-N8N-Capture-API-Key": "wrong"},
        {"X-N8N-API-Key": "test-only-n8n-key"},
        {"X-N8N-Map-API-Key": "test-only-n8n-map-key"},
    ):
        response = client.post(
            CAPTURE_TOKEN_PATH,
            headers=headers,
            json={"site_id": "BGL002", "theme": "dark"},
        )

        assert response.status_code == 401
        assert response.json() == {"detail": "Invalid N8N Capture API Key"}


def test_capture_token_issuer_normalizes_known_site_and_hides_token_from_query(client):
    router = install_session_override(client, ExistsSession(exists=True))
    try:
        response = mint(client, " bgl002 ")
    finally:
        client.app.dependency_overrides.pop(router.get_session, None)

    assert response.status_code == 200
    payload = response.json()
    assert payload["site_id"] == "BGL002"
    assert payload["capture_url"].startswith(
        "https://nod-dashboard.zeabur.app/capture/site-detail/BGL002#token="
    )
    assert "?token=" not in payload["capture_url"]
    assert "no-store" in response.headers["cache-control"]
    assert response.headers["referrer-policy"] == "no-referrer"


@pytest.mark.parametrize("site_id", ("", "B", "BGL 002", "BGL002/OTHER", "!" * 33))
def test_capture_token_issuer_rejects_invalid_site_id(client, site_id):
    router = install_session_override(client, ExistsSession(exists=True))
    try:
        response = mint(client, site_id)
    finally:
        client.app.dependency_overrides.pop(router.get_session, None)

    assert response.status_code == 422
    assert response.json() == {"detail": "Invalid Site ID"}


def test_capture_token_issuer_rejects_unknown_site_before_browser_capture(client):
    router = install_session_override(client, ExistsSession(exists=False))
    try:
        response = mint(client)
    finally:
        client.app.dependency_overrides.pop(router.get_session, None)

    assert response.status_code == 404
    assert response.json() == {"detail": "Site BGL002 not found"}


def test_capture_token_issuer_has_an_independent_rate_limit(client):
    router = install_session_override(client, ExistsSession(exists=True))
    try:
        for _ in range(30):
            assert mint(client).status_code == 200
        response = mint(client)
    finally:
        client.app.dependency_overrides.pop(router.get_session, None)

    assert response.status_code == 429
    assert response.headers["retry-after"].isdigit()


def test_capture_bundle_requires_matching_bearer_scope(client, monkeypatch):
    router = install_session_override(client, ExistsSession(exists=True))

    async def load_bundle(site_id, session):
        return {
            "site_id": site_id,
            "detail": {"site_id": site_id, "bulan": 6, "tahun": 2026},
            "trend_data": [],
            "performance_data": {"site_id": site_id},
        }

    monkeypatch.setattr(router, "load_site_detail_capture_bundle", load_bundle)
    try:
        minted = mint(client)
        token = minted.json()["capture_url"].split("#token=", 1)[1]
        absent = client.get(f"{CAPTURE_BUNDLE_PATH}/BGL002")
        wrong_scope = client.get(
            f"{CAPTURE_BUNDLE_PATH}/BGL003",
            headers={"Authorization": f"Bearer {token}"},
        )
        success = client.get(
            f"{CAPTURE_BUNDLE_PATH}/BGL002",
            headers={"Authorization": f"Bearer {token}"},
        )
    finally:
        client.app.dependency_overrides.pop(router.get_session, None)

    assert absent.status_code == 401
    assert wrong_scope.status_code == 403
    assert success.status_code == 200
    assert success.json()["site_id"] == "BGL002"
    assert "no-store" in success.headers["cache-control"]


def test_capture_bundle_rejects_forged_and_expired_bearers(client):
    router = install_session_override(client, ExistsSession(exists=True))
    try:
        forged = client.get(
            f"{CAPTURE_BUNDLE_PATH}/BGL002",
            headers={"Authorization": "Bearer forged"},
        )

        tokens = importlib.import_module("capture_tokens")
        expired_manager = tokens.CaptureTokenManager(
            client.app.state.security_settings,
            clock=lambda: 0,
        )
        expired_token, _ = expired_manager.issue("BGL002", "dark")
        expired = client.get(
            f"{CAPTURE_BUNDLE_PATH}/BGL002",
            headers={"Authorization": f"Bearer {expired_token}"},
        )
    finally:
        client.app.dependency_overrides.pop(router.get_session, None)

    assert forged.status_code == 401
    assert expired.status_code == 401


def test_capture_bundle_returns_retryable_error_without_partial_data(client, monkeypatch):
    router = install_session_override(client, ExistsSession(exists=True))

    async def unavailable(site_id, session):
        raise router.CaptureBundleUnavailable()

    monkeypatch.setattr(router, "load_site_detail_capture_bundle", unavailable)
    try:
        token = mint(client).json()["capture_url"].split("#token=", 1)[1]
        response = client.get(
            f"{CAPTURE_BUNDLE_PATH}/BGL002",
            headers={"Authorization": f"Bearer {token}"},
        )
    finally:
        client.app.dependency_overrides.pop(router.get_session, None)

    assert response.status_code == 503
    assert response.json() == {
        "detail": "Site detail capture data is temporarily unavailable"
    }
    assert response.headers["retry-after"] == "1"


def test_capture_bundle_loads_detail_before_parallel_optional_sources(monkeypatch):
    service = importlib.import_module("services.site_detail_capture")
    events = []
    trend_started = asyncio.Event()
    performance_started = asyncio.Event()

    async def detail(*, site_id, bulan, tahun, session):
        events.append("detail")
        return {"site_id": site_id, "bulan": 6, "tahun": 2026}

    async def trend(*, site_id, tahun, bulan, session):
        events.append("trend")
        trend_started.set()
        await performance_started.wait()
        return []

    async def performance(*, site_id, session):
        events.append("performance")
        performance_started.set()
        await trend_started.wait()
        return {"site_id": site_id}

    monkeypatch.setattr(service, "get_site_detail", detail)
    monkeypatch.setattr(service, "get_trend", trend)
    monkeypatch.setattr(service, "get_site_performance", performance)

    bundle = asyncio.run(service.load_site_detail_capture_bundle("BGL002", object()))

    assert events[0] == "detail"
    assert set(events[1:]) == {"trend", "performance"}
    assert bundle.site_id == "BGL002"
    assert bundle.trend_data == []
    assert bundle.performance_data.site_id == "BGL002"


def test_capture_bundle_distinguishes_empty_optional_data_from_loader_failure(monkeypatch):
    service = importlib.import_module("services.site_detail_capture")

    async def detail(*, site_id, bulan, tahun, session):
        return {"site_id": site_id, "bulan": 6, "tahun": 2026}

    async def empty_trend(*, site_id, tahun, bulan, session):
        return []

    async def empty_performance(*, site_id, session):
        return {"site_id": site_id}

    monkeypatch.setattr(service, "get_site_detail", detail)
    monkeypatch.setattr(service, "get_trend", empty_trend)
    monkeypatch.setattr(service, "get_site_performance", empty_performance)
    empty_bundle = asyncio.run(service.load_site_detail_capture_bundle("BGL002", object()))

    async def failed_trend(*, site_id, tahun, bulan, session):
        raise RuntimeError("database unavailable")

    monkeypatch.setattr(service, "get_trend", failed_trend)
    with pytest.raises(service.CaptureBundleUnavailable):
        asyncio.run(service.load_site_detail_capture_bundle("BGL002", object()))

    assert empty_bundle.trend_data == []
    assert empty_bundle.performance_data.site_id == "BGL002"

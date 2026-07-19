import pytest


class FakeMappings:
    def __init__(self, rows):
        self._rows = rows

    def all(self):
        return self._rows


class FakeResult:
    def __init__(self, rows):
        self._rows = rows

    def mappings(self):
        return FakeMappings(self._rows)


class FakeSession:
    def __init__(self, rows):
        self._rows = rows
        self.executed_sql = None
        self.executed_params = None

    async def execute(self, statement, params):
        self.executed_sql = str(statement)
        self.executed_params = params
        return FakeResult(self._rows)


@pytest.mark.usefixtures("authenticated_client")
def test_n8n_map_sector_endpoint_requires_dedicated_key(client):
    response = client.get("/api/v1/integrations/n8n/map/sectors")

    assert response.status_code == 401
    assert response.json() == {"detail": "Invalid N8N Map API Key"}


def test_n8n_map_sector_endpoint_returns_geojson_without_dashboard_cookie(client):
    from routers import n8n_map as n8n_map_router

    fake_session = FakeSession(
        [
            {
                "site_id": "BGL001",
                "cell_name": "BGL001_1",
                "sector_base": "1",
                "band": "L1800",
                "site_type": "MACRO",
                "latitude_fix": -7.445,
                "longitude_fix": 112.718,
                "azimuth": 90,
                "beamwidth": 65,
                "radius": 220,
            }
        ]
    )

    async def override_get_session():
        yield fake_session

    client.app.dependency_overrides[n8n_map_router.get_session] = override_get_session
    try:
        response = client.get(
            "/api/v1/integrations/n8n/map/sectors?site_id=BGL001&nop=SIDOARJO",
            headers={"X-N8N-Map-API-Key": "test-only-n8n-map-key"},
        )
    finally:
        client.app.dependency_overrides.pop(n8n_map_router.get_session, None)

    assert response.status_code == 200
    assert response.json()["type"] == "FeatureCollection"
    assert response.json()["features"][0]["properties"]["cell_name"] == "BGL001_1"
    assert "AND site_id = :site_id" in fake_session.executed_sql
    assert "AND nop = :nop" in fake_session.executed_sql
    assert fake_session.executed_params == {"site_id": "BGL001", "nop": "SIDOARJO"}

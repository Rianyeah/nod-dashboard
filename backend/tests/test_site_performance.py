from decimal import Decimal
from pathlib import Path
import sys

import pytest


sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from models.reporting import SitePerformance
from routers.reporting import (
    SITE_PERFORMANCE_QUERY,
    get_site_performance,
    relative_change,
    router,
)


class FakeMappings:
    def __init__(self, row):
        self._row = row

    def first(self):
        return self._row


class FakeResult:
    def __init__(self, row):
        self._row = row

    def mappings(self):
        return FakeMappings(self._row)


class FakeSession:
    def __init__(self, row):
        self._row = row
        self.statement = None
        self.params = None

    async def execute(self, statement, params=None):
        self.statement = str(statement)
        self.params = params
        return FakeResult(self._row)


def test_relative_change_preserves_positive_and_negative_direction():
    assert relative_change(120, 100) == pytest.approx(20.0)
    assert relative_change(80, 100) == pytest.approx(-20.0)


@pytest.mark.parametrize("previous", [None, 0, Decimal("0")])
def test_relative_change_returns_none_without_comparable_previous(previous):
    assert relative_change(120, previous) is None


def test_site_performance_model_allows_a_site_without_traktor_rows():
    payload = SitePerformance(site_id="PSN999")

    assert payload.trx_month is None
    assert payload.total_revenue is None
    assert payload.revenue_mom_pct is None
    assert payload.total_payload is None
    assert payload.payload_mom_pct is None


def test_site_performance_query_uses_exact_previous_calendar_month():
    normalized = " ".join(SITE_PERFORMANCE_QUERY.split()).upper()

    assert "WHERE SITE_ID = :SITE_ID" in normalized
    assert "INTERVAL '1 MONTH'" in normalized
    assert "TO_DATE" in normalized
    assert "TO_CHAR" in normalized


@pytest.mark.asyncio
async def test_site_performance_maps_latest_and_previous_metrics():
    session = FakeSession(
        {
            "trx_month": "2026-07",
            "previous_trx_month": "2026-06",
            "total_revenue": Decimal("165241234"),
            "previous_revenue": Decimal("141829528"),
            "total_payload": Decimal("42855652"),
            "previous_payload": Decimal("41688523"),
        }
    )

    payload = await get_site_performance("PSN003", session=session)

    assert payload.site_id == "PSN003"
    assert payload.trx_month == "2026-07"
    assert payload.previous_trx_month == "2026-06"
    assert payload.total_revenue == 165241234
    assert payload.revenue_mom_pct == pytest.approx(16.507, abs=0.001)
    assert payload.total_payload == 42855652
    assert payload.payload_mom_pct == pytest.approx(2.799, abs=0.001)
    assert session.params == {"site_id": "PSN003"}


@pytest.mark.asyncio
async def test_site_performance_returns_null_metrics_when_site_has_no_rows():
    payload = await get_site_performance("PSN999", session=FakeSession(None))

    assert payload == SitePerformance(site_id="PSN999")


def test_site_performance_route_is_registered_with_response_model():
    route = next(route for route in router.routes if route.path == "/reporting/site/{site_id}/performance")

    assert route.response_model is SitePerformance

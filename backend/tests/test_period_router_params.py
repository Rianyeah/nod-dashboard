from datetime import date

import pytest
from fastapi import HTTPException

from routers.activity_enom import base_params as activity_base_params, build_filter_clause as activity_filter_clause
from routers.ticketing import get_ticketing_dashboard, previous_month_bounds, shared_query_params


class DashboardRow:
    def __init__(self, values):
        self._mapping = values


class DashboardResult:
    def __init__(self, rows=None):
        self.rows = rows or []

    def first(self):
        return self.rows[0] if self.rows else None

    def fetchall(self):
        return self.rows

    def scalar(self):
        return None


class DashboardSession:
    def __init__(self):
        self.queries = []
        self.call_count = 0

    async def execute(self, statement, params=None):
        self.queries.append(str(statement))
        self.call_count += 1
        if self.call_count == 1:
            return DashboardResult([
                DashboardRow({
                    "total_tickets": 0,
                    "ticket_category": {"bps": 0, "ts": 0, "total": 0},
                })
            ])
        return DashboardResult()


def ticketing_params(**overrides):
    values = {
        "start_date": None,
        "end_date": None,
        "tahun": None,
        "bulan": None,
        "period_start": None,
        "period_end": None,
        "nop": None,
        "cluster_to": None,
        "kategori_tt": None,
        "takeover": None,
        "ticket_swfm_status": None,
        "backup_sukses": None,
        "rc_category": None,
        "is_escalate": None,
    }
    values.update(overrides)
    return shared_query_params(**values)


def test_ticketing_canonical_period_becomes_inclusive_date_filter():
    params = ticketing_params(period_start="2025-11", period_end="2026-02")
    assert params["start_date"] == date(2025, 11, 1)
    assert params["end_date"] == date(2026, 2, 28)
    assert params["_period"].active_months == ("2025-11", "2025-12", "2026-01", "2026-02")


def test_ticketing_comparison_has_identical_month_count():
    params = ticketing_params(period_start="2026-01", period_end="2026-06")
    previous = previous_month_bounds(params)
    assert previous["start_date"] == date(2025, 7, 1)
    assert previous["end_date"] == date(2025, 12, 31)


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "params",
    [
        ticketing_params(tahun=2026),
        ticketing_params(),
    ],
    ids=["legacy-year", "unbounded"],
)
async def test_ticketing_dashboard_uses_monthly_trend_for_wide_legacy_ranges(params):
    session = DashboardSession()

    response = await get_ticketing_dashboard(params=params, session=session)

    assert response.trend_granularity == "month"
    assert "date_trunc('month', created_at)" in session.queries[1]


@pytest.mark.parametrize(
    "overrides",
    [
        {"period_start": "2026-01", "period_end": "2026-06", "start_date": date(2026, 1, 1), "end_date": date(2026, 6, 30)},
        {"period_start": "2026-01", "period_end": "2026-06", "tahun": 2026, "bulan": 1},
    ],
)
def test_ticketing_rejects_mixed_period_modes(overrides):
    with pytest.raises(HTTPException) as exc_info:
        ticketing_params(**overrides)
    assert exc_info.value.status_code == 422


def test_activity_enom_cross_year_period_and_annual_anchor():
    params = activity_base_params(None, None, "NOP SIDOARJO", None, "2025-11", "2026-02")
    assert params["period_start_date"] == date(2025, 11, 1)
    assert params["period_end_exclusive"] == date(2026, 3, 1)
    assert params["annual_year"] == 2026
    clause = activity_filter_clause(params)
    assert "create_date >= :period_start_date" in clause
    assert "create_date < :period_end_exclusive" in clause


def test_activity_enom_legacy_month_remains_supported():
    params = activity_base_params(date(2026, 6, 1), 2026, None, None)
    assert params["_period"].active_months == ("2026-06",)


def test_activity_enom_rejects_mixed_contracts():
    with pytest.raises(HTTPException) as exc_info:
        activity_base_params(date(2026, 6, 1), None, None, None, "2026-01", "2026-06")
    assert exc_info.value.status_code == 422

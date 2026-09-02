from pathlib import Path
import sys

import pytest
from fastapi import Response


sys.path.insert(0, str(Path(__file__).resolve().parents[1]))


@pytest.mark.asyncio
async def test_overview_route_normalizes_scope_and_exposes_cache_header(monkeypatch):
    from routers import reporting

    captured = {}

    async def fake_loader(session, period, nop, *, session_factory=None):
        captured.update(
            session=session,
            session_factory=session_factory,
            period_start=period.period_start,
            period_end=period.period_end,
            nop=nop,
        )
        return {"scope_label": "SIDOARJO"}

    monkeypatch.setattr(reporting, "load_reporting_overview", fake_loader, raising=False)
    response = Response()
    session = object()

    result = await reporting.get_reporting_overview(
        response=response,
        session=session,
        trx_month=None,
        period_start="2026-06",
        period_end="2026-07",
        nop="NOP Sidoarjo",
    )

    assert result == {"scope_label": "SIDOARJO"}
    assert captured == {
        "session": session,
        "session_factory": reporting.async_session,
        "period_start": "2026-06",
        "period_end": "2026-07",
        "nop": "SIDOARJO",
    }
    assert response.headers["X-Cache"] == "BYPASS"


@pytest.mark.asyncio
async def test_areas_route_uses_regional_scope_when_nop_is_empty(monkeypatch):
    from routers import reporting

    captured = {}

    async def fake_loader(session, period, nop):
        captured["nop"] = nop
        return [{"kabupaten": "Belum Terpetakan"}]

    monkeypatch.setattr(reporting, "load_reporting_areas", fake_loader, raising=False)
    response = Response()

    result = await reporting.get_reporting_areas(
        response=response,
        session=object(),
        trx_month="2026-07",
        period_start=None,
        period_end=None,
        nop="Regional Jatim",
    )

    assert result == [{"kabupaten": "Belum Terpetakan"}]
    assert captured["nop"] is None
    assert response.headers["X-Cache"] == "BYPASS"


@pytest.mark.asyncio
async def test_site_drilldown_route_builds_validated_query(monkeypatch):
    from routers import reporting

    captured = {}

    async def fake_loader(session, *, period, nop, area_key, query):
        captured.update(nop=nop, area_key=area_key, query=query)
        return {"items": []}

    monkeypatch.setattr(reporting, "load_reporting_sites", fake_loader, raising=False)
    response = Response()

    result = await reporting.get_reporting_sites(
        area_key="sidoarjo",
        response=response,
        session=object(),
        trx_month="2026-07",
        period_start=None,
        period_end=None,
        nop="NOP Sidoarjo",
        page=2,
        page_size=20,
        sort_by="availability",
        sort_dir="asc",
        rank="bottom",
        rank_limit=5,
        rank_metric="payload",
        target_status="not_achieved",
        site_class="Gold",
        q="AAA",
    )

    assert result == {"items": []}
    assert captured["nop"] == "SIDOARJO"
    assert captured["area_key"] == "sidoarjo"
    assert captured["query"].rank == "bottom"
    assert captured["query"].rank_limit == 5
    assert captured["query"].target_status == "not_achieved"
    assert response.headers["X-Cache"] == "BYPASS"


@pytest.mark.asyncio
async def test_pivot_route_keeps_request_isolated_from_other_reporting_sections(monkeypatch):
    from models.reporting import ReportingPivotRequest
    from routers import reporting

    captured = {}

    async def fake_execute(session, request):
        captured["request"] = request
        return {"dataset": request.dataset, "rows": []}

    monkeypatch.setattr(reporting, "execute_reporting_pivot", fake_execute, raising=False)
    request = ReportingPivotRequest(
        dataset="performance",
        period_start="2026-07",
        period_end="2026-07",
        rows=["kabupaten"],
        values=[{"field": "revenue", "aggregation": "sum"}],
    )
    response = Response()

    result = await reporting.get_reporting_pivot(
        request=request,
        response=response,
        session=object(),
    )

    assert result == {"dataset": "performance", "rows": []}
    assert captured["request"] is request
    assert response.headers["X-Cache"] == "BYPASS"

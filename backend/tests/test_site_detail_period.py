from pathlib import Path
import sys

import pytest


sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from routers.sites import get_site_detail, resolve_site_detail_period


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
    def __init__(self, rows):
        self._rows = iter(rows)
        self.calls = []

    async def execute(self, statement, params=None):
        self.calls.append((str(statement), params))
        return FakeResult(next(self._rows))


@pytest.mark.asyncio
async def test_resolver_keeps_complete_explicit_period():
    session = FakeSession([])

    assert await resolve_site_detail_period(5, 2026, session) == (5, 2026)
    assert session.calls == []


@pytest.mark.asyncio
@pytest.mark.parametrize("bulan,tahun", [(None, None), (5, None), (None, 2026)])
async def test_resolver_uses_latest_database_period_when_any_part_is_missing(bulan, tahun):
    session = FakeSession([{"bulan": 6, "tahun": 2026}])

    assert await resolve_site_detail_period(bulan, tahun, session) == (6, 2026)
    assert len(session.calls) == 1


@pytest.mark.asyncio
async def test_site_detail_response_exposes_resolved_period():
    session = FakeSession(
        [
            {"bulan": 6, "tahun": 2026},
            {
                "Siteid": "PSN003",
                "avg_availability": "99.9407",
                "total_outage_menit": "640.0833",
            },
        ]
    )

    response = await get_site_detail("PSN003", bulan=None, tahun=None, session=session)

    assert response["bulan"] == 6
    assert response["tahun"] == 2026
    assert response["avg_availability"] == pytest.approx(99.9407)
    assert session.calls[1][1] == {"site_id": "PSN003", "bulan": 6, "tahun": 2026}

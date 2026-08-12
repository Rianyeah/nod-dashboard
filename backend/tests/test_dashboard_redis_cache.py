import unittest
from pathlib import Path
import sys
from unittest.mock import AsyncMock, patch

from fastapi import Response


BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))


class _NoSqlSession:
    async def execute(self, *_args, **_kwargs):
        raise AssertionError("SQL must not execute on a Redis cache hit")


class _LatestPeriodResult:
    def mappings(self):
        return self

    def first(self):
        return {"bulan": 6, "tahun": 2026, "row_count": 204090, "site_count": 6803}


class _LatestPeriodSession:
    def __init__(self):
        self.executions = 0

    async def execute(self, *_args, **_kwargs):
        self.executions += 1
        return _LatestPeriodResult()


class _FakeCache:
    def __init__(self, status="MISS", value=None):
        self.status = status
        self.value = value
        self.set_calls = []

    def make_key(self, namespace, resource, **params):
        return (namespace, resource, tuple(sorted(params.items())))

    async def get_json(self, _key):
        return self.status, self.value

    async def set_json(self, key, value, ttl_seconds=None):
        self.set_calls.append((key, value, ttl_seconds))
        return True


class DashboardRedisCacheTest(unittest.IsolatedAsyncioTestCase):
    async def test_latest_period_hit_skips_sql_and_uses_filter_ttl_namespace(self):
        from routers import availability

        cache = _FakeCache(
            status="HIT",
            value={"bulan": 6, "tahun": 2026, "row_count": 204090, "site_count": 6803},
        )
        response = Response()
        with patch.object(availability, "redis_cache", cache):
            result = await availability.get_latest_period(
                session=_NoSqlSession(),
                response=response,
            )

        self.assertEqual(result.bulan, 6)
        self.assertEqual(response.headers["X-Cache"], "HIT")

    async def test_latest_period_miss_stores_filter_ttl_and_bypass_uses_postgres(self):
        from routers import availability

        for status, expected_writes in (("MISS", 1), ("BYPASS", 0)):
            cache = _FakeCache(status=status)
            session = _LatestPeriodSession()
            response = Response()
            with patch.object(availability, "redis_cache", cache):
                result = await availability.get_latest_period(session=session, response=response)

            with self.subTest(status=status):
                self.assertEqual(result.site_count, 6803)
                self.assertEqual(session.executions, 1)
                self.assertEqual(response.headers["X-Cache"], status)
                self.assertEqual(len(cache.set_calls), expected_writes)
                if cache.set_calls:
                    self.assertEqual(cache.set_calls[0][2], 300)

    async def test_overview_hit_skips_loader_and_sql(self):
        from routers import overview

        cache = _FakeCache(status="HIT", value={"period": {"bulan": 6, "tahun": 2026}})
        response = Response()
        with (
            patch.object(overview, "redis_cache", cache),
            patch.object(overview, "load_overview_response", new=AsyncMock(side_effect=AssertionError("loader must not run"))),
        ):
            result = await overview.get_overview(
                bulan=6,
                tahun=2026,
                nop=" SIDOARJO ",
                session=_NoSqlSession(),
                response=response,
            )

        self.assertEqual(result.period.bulan, 6)
        self.assertEqual(response.headers["X-Cache"], "HIT")

    async def test_partial_overview_is_not_cached(self):
        from models.overview import OverviewResponse
        from routers import overview

        cache = _FakeCache(status="MISS")
        response = Response()
        partial = OverviewResponse(errors={"ticketing": "database timeout"})
        with (
            patch.object(overview, "redis_cache", cache),
            patch.object(overview, "load_overview_response", new=AsyncMock(return_value=partial)),
        ):
            result = await overview.get_overview(
                bulan=6,
                tahun=2026,
                nop="SIDOARJO",
                session=_NoSqlSession(),
                response=response,
            )

        self.assertEqual(result.errors, {"ticketing": "database timeout"})
        self.assertEqual(cache.set_calls, [])
        self.assertEqual(response.headers["X-Cache"], "MISS")

    def test_all_home_filter_endpoints_use_filters_namespace_and_ttl(self):
        routes = {
            "availability.py": "latest-period",
            "sites.py": "options",
            "impact_service.py": "impact-service",
            "transport_quality.py": "transport-quality",
            "ticketing.py": "ticketing-v2",
        }
        router_dir = BACKEND_DIR / "routers"
        for filename, resource in routes.items():
            source = (router_dir / filename).read_text(encoding="utf-8")
            with self.subTest(filename=filename):
                self.assertIn(f'"filters", "{resource}"', source)
                self.assertIn("FILTER_CACHE_TTL_SECONDS", source)
                self.assertIn('response.headers["X-Cache"]', source)


if __name__ == "__main__":
    unittest.main()

import unittest
from pathlib import Path
import sys
from unittest.mock import patch

from fastapi import Response


BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))
REPORTING_ROUTER = BACKEND_DIR / "routers" / "reporting.py"


class _NoSqlSession:
    async def execute(self, *_args, **_kwargs):
        raise AssertionError("SQL must not execute on a Redis cache hit")


class _AvailableMonthsSession:
    def __init__(self):
        self.executions = 0

    async def execute(self, *_args, **_kwargs):
        self.executions += 1
        return self

    def mappings(self):
        return self

    def all(self):
        return [{"trx_month": "2026-05"}, {"trx_month": "2026-04"}]


class _FakeReportingCache:
    def __init__(self, cached_value=None, cache_status="MISS"):
        self.cached_value = cached_value
        self.cache_status = cache_status
        self.keys = []

    def make_key(self, namespace, resource, **params):
        key = (namespace, resource, tuple(sorted(params.items())))
        self.keys.append(key)
        return str(key)

    async def get_json(self, _key):
        if self.cache_status == "HIT":
            return "HIT", self.cached_value
        return self.cache_status, None

    async def set_json(self, _key, value):
        self.cached_value = value
        return True


class ReportingRedisCacheTest(unittest.IsolatedAsyncioTestCase):
    async def test_available_months_cache_hit_skips_sql_and_sets_header(self):
        from routers import reporting

        fake_cache = _FakeReportingCache(
            cached_value=["2026-05", "2026-04"],
            cache_status="HIT",
        )
        response = Response()

        with patch.object(reporting, "redis_cache", fake_cache):
            result = await reporting.get_available_months(
                response=response,
                session=_NoSqlSession(),
            )

        self.assertEqual(result, ["2026-05", "2026-04"])
        self.assertEqual(response.headers["X-Cache"], "HIT")

    async def test_available_months_cache_miss_executes_sql_and_sets_header(self):
        from routers import reporting

        fake_cache = _FakeReportingCache(cache_status="MISS")
        session = _AvailableMonthsSession()
        response = Response()

        with patch.object(reporting, "redis_cache", fake_cache):
            result = await reporting.get_available_months(
                response=response,
                session=session,
            )

        self.assertEqual(result, ["2026-05", "2026-04"])
        self.assertEqual(session.executions, 1)
        self.assertEqual(response.headers["X-Cache"], "MISS")

    def test_all_reporting_endpoints_use_shared_cache_and_x_cache_header(self):
        source = REPORTING_ROUTER.read_text(encoding="utf-8")

        self.assertIn("from cache import redis_cache", source)
        self.assertGreaterEqual(source.count("redis_cache.make_key("), 6)
        self.assertGreaterEqual(source.count("redis_cache.get_json("), 6)
        self.assertGreaterEqual(source.count("redis_cache.set_json("), 6)
        self.assertGreaterEqual(source.count('response.headers["X-Cache"]'), 6)


if __name__ == "__main__":
    unittest.main()

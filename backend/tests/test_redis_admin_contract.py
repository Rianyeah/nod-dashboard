import unittest
from pathlib import Path
import sys
from unittest.mock import patch

from fastapi import HTTPException


BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))


class _FakeCache:
    def __init__(self, deleted=0, error=None):
        self.deleted = deleted
        self.error = error
        self.namespaces = []

    async def invalidate_namespace(self, namespace):
        self.namespaces.append(namespace)
        if self.error:
            raise self.error
        return self.deleted

    async def status(self):
        return "connected"


class _RefreshResult:
    def scalars(self):
        return self

    def all(self):
        return ["SITE-1", "SITE-2"]


class _RefreshSession:
    def __init__(self):
        self.commits = 0
        self.rollbacks = 0

    async def execute(self, *_args, **_kwargs):
        return _RefreshResult()

    async def commit(self):
        self.commits += 1

    async def rollback(self):
        self.rollbacks += 1


class RedisAdminContractTest(unittest.IsolatedAsyncioTestCase):
    async def test_reporting_invalidation_returns_deleted_count(self):
        from routers import admin

        fake_cache = _FakeCache(deleted=7)
        with patch.object(admin, "redis_cache", fake_cache):
            response = await admin.invalidate_cache(scope="reporting")

        self.assertEqual(response.scope, "reporting")
        self.assertEqual(response.deleted_keys, 7)
        self.assertEqual(response.status, "invalidated")
        self.assertEqual(fake_cache.namespaces, ["reporting"])

    async def test_all_invalidation_clears_every_supported_namespace(self):
        from routers import admin

        fake_cache = _FakeCache(deleted=2)
        with patch.object(admin, "redis_cache", fake_cache):
            response = await admin.invalidate_cache(scope="all")

        self.assertEqual(response.scope, "all")
        self.assertEqual(response.deleted_keys, 6)
        self.assertEqual(fake_cache.namespaces, ["reporting", "overview", "filters"])

    async def test_invalidation_returns_503_when_redis_is_unavailable(self):
        from cache import CacheUnavailableError
        from routers import admin

        fake_cache = _FakeCache(error=CacheUnavailableError("offline"))
        with patch.object(admin, "redis_cache", fake_cache):
            with self.assertRaises(HTTPException) as raised:
                await admin.invalidate_cache(scope="reporting")

        self.assertEqual(raised.exception.status_code, 503)

    async def test_metrics_refresh_invalidates_all_namespaces_after_postgres_commit(self):
        from routers import admin

        fake_cache = _FakeCache(deleted=1)
        session = _RefreshSession()
        with patch.object(admin, "redis_cache", fake_cache):
            response = await admin.refresh_site_month_metrics(
                bulan=6,
                tahun=2026,
                session=session,
            )

        self.assertEqual(response.refreshed_sites, 2)
        self.assertEqual(session.commits, 1)
        self.assertEqual(session.rollbacks, 0)
        self.assertEqual(fake_cache.namespaces, ["reporting", "overview", "filters"])

    async def test_redis_failure_never_rolls_back_successful_metrics_refresh(self):
        from cache import CacheUnavailableError
        from routers import admin

        fake_cache = _FakeCache(error=CacheUnavailableError("offline"))
        session = _RefreshSession()
        with patch.object(admin, "redis_cache", fake_cache):
            await admin.refresh_site_month_metrics(bulan=6, tahun=2026, session=session)

        self.assertEqual(session.commits, 1)
        self.assertEqual(session.rollbacks, 0)
        self.assertEqual(fake_cache.namespaces, ["reporting", "overview", "filters"])

    def test_health_is_minimal_while_admin_routes_keep_machine_authentication(self):
        main_source = (BACKEND_DIR / "main.py").read_text(encoding="utf-8")
        admin_source = (BACKEND_DIR / "routers" / "admin.py").read_text(encoding="utf-8")

        self.assertIn('return {"status": "ok"}', main_source)
        self.assertNotIn('"redis": redis_status', main_source)
        self.assertIn('"/cache/invalidate"', admin_source)
        self.assertIn("dependencies=[Depends(verify_n8n_key)]", admin_source)
        self.assertIn('scope: str = Query("reporting"', admin_source)
        self.assertIn('"overview"', admin_source)
        self.assertIn('"filters"', admin_source)
        self.assertIn('"all"', admin_source)
        self.assertIn("invalidate_cache_namespaces", admin_source)


if __name__ == "__main__":
    unittest.main()

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

    async def test_invalidation_returns_503_when_redis_is_unavailable(self):
        from cache import CacheUnavailableError
        from routers import admin

        fake_cache = _FakeCache(error=CacheUnavailableError("offline"))
        with patch.object(admin, "redis_cache", fake_cache):
            with self.assertRaises(HTTPException) as raised:
                await admin.invalidate_cache(scope="reporting")

        self.assertEqual(raised.exception.status_code, 503)

    def test_health_and_admin_routes_expose_redis_contracts(self):
        main_source = (BACKEND_DIR / "main.py").read_text(encoding="utf-8")
        admin_source = (BACKEND_DIR / "routers" / "admin.py").read_text(encoding="utf-8")

        self.assertIn('"redis": redis_status', main_source)
        self.assertIn('"/cache/invalidate"', admin_source)
        self.assertIn("dependencies=[Depends(verify_n8n_key)]", admin_source)
        self.assertIn('scope: str = Query("reporting"', admin_source)
        self.assertIn("await redis_cache.invalidate_namespace(scope)", admin_source)
        self.assertIn('await redis_cache.invalidate_namespace("reporting")', admin_source)


if __name__ == "__main__":
    unittest.main()

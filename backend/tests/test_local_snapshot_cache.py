import asyncio
import unittest

from local_snapshot_cache import (
    LOCAL_CACHE_HIT,
    LOCAL_CACHE_MISS,
    LOCAL_CACHE_STALE,
    LocalSnapshotCache,
)


class LocalSnapshotCacheTest(unittest.IsolatedAsyncioTestCase):
    async def test_returns_fresh_value_without_reloading(self):
        now = [100.0]
        cache = LocalSnapshotCache(clock=lambda: now[0])
        loads = 0

        async def loader():
            nonlocal loads
            loads += 1
            return {"version": loads}

        first, first_status = await cache.get_or_load("filters", loader, ttl_seconds=30)
        second, second_status = await cache.get_or_load("filters", loader, ttl_seconds=30)

        self.assertEqual(first, {"version": 1})
        self.assertEqual(second, {"version": 1})
        self.assertEqual(first_status, LOCAL_CACHE_MISS)
        self.assertEqual(second_status, LOCAL_CACHE_HIT)
        self.assertEqual(loads, 1)

    async def test_returns_stale_snapshot_when_refresh_fails_after_ttl(self):
        now = [100.0]
        cache = LocalSnapshotCache(clock=lambda: now[0])

        async def initial_loader():
            return {"periods": ["W27"]}

        await cache.get_or_load("filters", initial_loader, ttl_seconds=30)
        now[0] = 131.0

        async def failing_loader():
            raise TimeoutError("database timeout")

        value, status = await cache.get_or_load("filters", failing_loader, ttl_seconds=30)

        self.assertEqual(value, {"periods": ["W27"]})
        self.assertEqual(status, LOCAL_CACHE_STALE)

    async def test_raises_loader_error_when_no_snapshot_exists(self):
        cache = LocalSnapshotCache(clock=lambda: 100.0)
        error = TimeoutError("database timeout")

        async def failing_loader():
            raise error

        with self.assertRaises(TimeoutError) as caught:
            await cache.get_or_load("missing", failing_loader, ttl_seconds=30)

        self.assertIs(caught.exception, error)

    async def test_coalesces_concurrent_loads_for_the_same_key(self):
        cache = LocalSnapshotCache(clock=lambda: 100.0)
        loads = 0

        async def loader():
            nonlocal loads
            loads += 1
            await asyncio.sleep(0)
            return {"ready": True}

        results = await asyncio.gather(*[
            cache.get_or_load("filters", loader, ttl_seconds=30)
            for _ in range(5)
        ])

        self.assertEqual(loads, 1)
        self.assertEqual([value for value, _status in results], [{"ready": True}] * 5)
        self.assertEqual(results[0][1], LOCAL_CACHE_MISS)
        self.assertTrue(all(status == LOCAL_CACHE_HIT for _value, status in results[1:]))


if __name__ == "__main__":
    unittest.main()

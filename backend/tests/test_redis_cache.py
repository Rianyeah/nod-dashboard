import asyncio
import json
from pathlib import Path
import sys
import unittest
from unittest.mock import patch


sys.path.insert(0, str(Path(__file__).resolve().parents[1]))


class _FakeRedis:
    def __init__(self):
        self.values = {}
        self.set_calls = []
        self.deleted = []
        self.unlinked = []
        self.scan_patterns = []
        self.ping_error = None
        self.get_error = None
        self.set_error = None
        self.closed = False

    async def ping(self):
        if self.ping_error:
            raise self.ping_error
        return True

    async def get(self, key):
        if self.get_error:
            raise self.get_error
        return self.values.get(key)

    async def set(self, key, value, ex=None):
        if self.set_error:
            raise self.set_error
        self.values[key] = value
        self.set_calls.append((key, value, ex))
        return True

    async def delete(self, key):
        self.deleted.append(key)
        self.values.pop(key, None)
        return 1

    async def scan_iter(self, match=None, count=None):
        self.scan_patterns.append((match, count))
        prefix = (match or "").removesuffix("*")
        for key in list(self.values):
            if key.startswith(prefix):
                yield key

    async def unlink(self, *keys):
        self.unlinked.extend(keys)
        for key in keys:
            self.values.pop(key, None)
        return len(keys)

    async def aclose(self):
        self.closed = True


class RedisCacheTest(unittest.IsolatedAsyncioTestCase):
    async def test_invalid_ttl_environment_uses_safe_default(self):
        from cache import RedisCache

        with patch.dict("os.environ", {"REDIS_CACHE_TTL_SECONDS": "invalid"}):
            cache = RedisCache(url="")

        self.assertEqual(cache.ttl_seconds, 300)

    async def test_disabled_cache_bypasses_without_creating_client(self):
        from cache import RedisCache

        cache = RedisCache(url="")

        self.assertFalse(await cache.connect())
        status, value = await cache.get_json("nod:v1:reporting:test")

        self.assertEqual(status, "BYPASS")
        self.assertIsNone(value)
        self.assertEqual(await cache.status(), "disabled")

    async def test_cache_hit_deserializes_json(self):
        from cache import RedisCache

        client = _FakeRedis()
        client.values["key"] = json.dumps({"total": 17})
        cache = RedisCache(url="redis://redis:6379/0", client_factory=lambda **_: client)
        await cache.connect()

        status, value = await cache.get_json("key")

        self.assertEqual(status, "HIT")
        self.assertEqual(value, {"total": 17})

    async def test_cache_miss_and_set_use_ttl_jitter(self):
        from cache import RedisCache

        client = _FakeRedis()
        cache = RedisCache(
            url="redis://redis:6379/0",
            ttl_seconds=300,
            client_factory=lambda **_: client,
        )
        await cache.connect()

        status, value = await cache.get_json("key")
        with patch("cache.random.randint", return_value=30):
            stored = await cache.set_json("key", {"items": [1, 2]})

        self.assertEqual(status, "MISS")
        self.assertIsNone(value)
        self.assertTrue(stored)
        self.assertEqual(client.set_calls[0][2], 270)

    async def test_malformed_json_is_removed_and_treated_as_miss(self):
        from cache import RedisCache

        client = _FakeRedis()
        client.values["bad-key"] = "{not-json"
        cache = RedisCache(url="redis://redis:6379/0", client_factory=lambda **_: client)
        await cache.connect()

        status, value = await cache.get_json("bad-key")

        self.assertEqual(status, "MISS")
        self.assertIsNone(value)
        self.assertEqual(client.deleted, ["bad-key"])

    async def test_redis_read_failure_bypasses_cache(self):
        from cache import RedisCache

        client = _FakeRedis()
        client.get_error = TimeoutError("redis timeout")
        cache = RedisCache(url="redis://redis:6379/0", client_factory=lambda **_: client)
        await cache.connect()

        status, value = await cache.get_json("key")

        self.assertEqual(status, "BYPASS")
        self.assertIsNone(value)

    async def test_get_or_load_does_not_call_loader_on_hit(self):
        from cache import RedisCache

        client = _FakeRedis()
        client.values["key"] = json.dumps(["cached"])
        cache = RedisCache(url="redis://redis:6379/0", client_factory=lambda **_: client)
        await cache.connect()
        loader_called = False

        async def loader():
            nonlocal loader_called
            loader_called = True
            return ["database"]

        value, status = await cache.get_or_load("key", loader)

        self.assertEqual(value, ["cached"])
        self.assertEqual(status, "HIT")
        self.assertFalse(loader_called)

    async def test_keys_are_separated_by_period_and_nop(self):
        from cache import RedisCache

        cache = RedisCache(url="", key_prefix="nod:v1")

        may_sidoarjo = cache.make_key(
            "reporting",
            "scorecards",
            trx_month="2026-05",
            nop="SIDOARJO",
        )
        april_sidoarjo = cache.make_key(
            "reporting",
            "scorecards",
            trx_month="2026-04",
            nop="SIDOARJO",
        )
        may_surabaya = cache.make_key(
            "reporting",
            "scorecards",
            trx_month="2026-05",
            nop="SURABAYA",
        )

        self.assertTrue(may_sidoarjo.startswith("nod:v1:reporting:scorecards:"))
        self.assertEqual(len({may_sidoarjo, april_sidoarjo, may_surabaya}), 3)

    async def test_invalidate_namespace_scans_and_unlinks_only_matching_keys(self):
        from cache import RedisCache

        client = _FakeRedis()
        client.values = {
            "nod:v1:reporting:scorecards:a": "{}",
            "nod:v1:reporting:trend:b": "[]",
            "nod:v1:overview:home:c": "{}",
        }
        cache = RedisCache(
            url="redis://redis:6379/0",
            key_prefix="nod:v1",
            client_factory=lambda **_: client,
        )
        await cache.connect()

        deleted = await cache.invalidate_namespace("reporting")

        self.assertEqual(deleted, 2)
        self.assertEqual(client.scan_patterns, [("nod:v1:reporting:*", 100)])
        self.assertEqual(
            set(client.unlinked),
            {
                "nod:v1:reporting:scorecards:a",
                "nod:v1:reporting:trend:b",
            },
        )
        self.assertIn("nod:v1:overview:home:c", client.values)

    async def test_close_releases_client(self):
        from cache import RedisCache

        client = _FakeRedis()
        cache = RedisCache(url="redis://redis:6379/0", client_factory=lambda **_: client)
        await cache.connect()

        await cache.close()

        self.assertTrue(client.closed)


if __name__ == "__main__":
    unittest.main()

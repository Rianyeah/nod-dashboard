"""Optional Redis cache used by read-heavy dashboard endpoints."""

from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
import hashlib
import json
import logging
import os
import random
from typing import Any, Awaitable, Callable

from dotenv import load_dotenv
from redis.asyncio import from_url


load_dotenv()

logger = logging.getLogger(__name__)

CACHE_HIT = "HIT"
CACHE_MISS = "MISS"
CACHE_BYPASS = "BYPASS"


class CacheUnavailableError(RuntimeError):
    """Raised when an operation explicitly requires Redis to be available."""


def _positive_int(value: Any, default: int) -> int:
    try:
        return max(1, int(value))
    except (TypeError, ValueError):
        return default


def _json_default(value: Any) -> Any:
    if hasattr(value, "model_dump"):
        return value.model_dump(mode="json")
    if isinstance(value, (date, datetime)):
        return value.isoformat()
    if isinstance(value, Decimal):
        return float(value)
    raise TypeError(f"Object of type {type(value).__name__} is not JSON serializable")


class RedisCache:
    """Small cache-aside wrapper with fail-open reads and writes."""

    def __init__(
        self,
        url: str | None = None,
        ttl_seconds: int | None = None,
        key_prefix: str | None = None,
        client_factory: Callable[..., Any] | None = None,
    ):
        self.url = (url if url is not None else os.getenv("REDIS_URL", "")).strip()
        self.ttl_seconds = _positive_int(
            ttl_seconds
            if ttl_seconds is not None
            else os.getenv("REDIS_CACHE_TTL_SECONDS", "300"),
            300,
        )
        self.key_prefix = (
            key_prefix if key_prefix is not None else os.getenv("REDIS_KEY_PREFIX", "nod:v1")
        ).strip().rstrip(":")
        self._client_factory = client_factory or from_url
        self._client = None

    @property
    def enabled(self) -> bool:
        return bool(self.url)

    async def connect(self) -> bool:
        if not self.enabled:
            return False

        if self._client is None:
            self._client = self._client_factory(
                url=self.url,
                decode_responses=True,
                socket_connect_timeout=2,
                socket_timeout=2,
                health_check_interval=30,
            )

        try:
            await self._client.ping()
            return True
        except Exception as exc:
            logger.warning("Redis startup check failed: %s", exc)
            return False

    async def close(self) -> None:
        if self._client is not None:
            await self._client.aclose()
            self._client = None

    async def status(self) -> str:
        if not self.enabled:
            return "disabled"

        if self._client is None and not await self.connect():
            return "unreachable"

        try:
            await self._client.ping()
            return "connected"
        except Exception:
            return "unreachable"

    def make_key(self, namespace: str, resource: str, **params: Any) -> str:
        normalized = json.dumps(
            params,
            sort_keys=True,
            separators=(",", ":"),
            default=_json_default,
        )
        digest = hashlib.sha256(normalized.encode("utf-8")).hexdigest()[:20]
        return f"{self.key_prefix}:{namespace}:{resource}:{digest}"

    async def get_json(self, key: str) -> tuple[str, Any]:
        if not self.enabled:
            return CACHE_BYPASS, None

        if self._client is None and not await self.connect():
            return CACHE_BYPASS, None

        try:
            raw_value = await self._client.get(key)
        except Exception as exc:
            logger.warning("Redis GET failed for %s: %s", key, exc)
            return CACHE_BYPASS, None

        if raw_value is None:
            return CACHE_MISS, None

        try:
            return CACHE_HIT, json.loads(raw_value)
        except (TypeError, json.JSONDecodeError):
            try:
                await self._client.delete(key)
            except Exception:
                pass
            return CACHE_MISS, None

    async def set_json(self, key: str, value: Any, ttl_seconds: int | None = None) -> bool:
        if not self.enabled:
            return False

        if self._client is None and not await self.connect():
            return False

        ttl = max(1, int(ttl_seconds or self.ttl_seconds))
        max_jitter = min(30, max(0, ttl - 1))
        effective_ttl = ttl - random.randint(0, max_jitter)

        try:
            payload = json.dumps(
                value,
                ensure_ascii=False,
                separators=(",", ":"),
                default=_json_default,
            )
            await self._client.set(key, payload, ex=effective_ttl)
            return True
        except Exception as exc:
            logger.warning("Redis SET failed for %s: %s", key, exc)
            return False

    async def get_or_load(
        self,
        key: str,
        loader: Callable[[], Awaitable[Any]],
    ) -> tuple[Any, str]:
        cache_status, cached_value = await self.get_json(key)
        if cache_status == CACHE_HIT:
            return cached_value, CACHE_HIT

        value = await loader()
        if cache_status == CACHE_MISS:
            await self.set_json(key, value)
        return value, cache_status

    async def invalidate_namespace(self, namespace: str) -> int:
        if not self.enabled:
            raise CacheUnavailableError("Redis cache is disabled")

        if self._client is None and not await self.connect():
            raise CacheUnavailableError("Redis cache is unreachable")

        pattern = f"{self.key_prefix}:{namespace}:*"
        deleted = 0
        batch: list[str] = []

        try:
            async for key in self._client.scan_iter(match=pattern, count=100):
                batch.append(key)
                if len(batch) >= 100:
                    deleted += int(await self._client.unlink(*batch))
                    batch.clear()

            if batch:
                deleted += int(await self._client.unlink(*batch))
        except Exception as exc:
            raise CacheUnavailableError("Redis cache invalidation failed") from exc

        return deleted


redis_cache = RedisCache()

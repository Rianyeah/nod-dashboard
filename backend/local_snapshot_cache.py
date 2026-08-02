"""Small process-local snapshot cache with stale-on-error fallback."""

from __future__ import annotations

import asyncio
from dataclasses import dataclass
from time import monotonic
from typing import Any, Awaitable, Callable


LOCAL_CACHE_HIT = "LOCAL-HIT"
LOCAL_CACHE_MISS = "LOCAL-MISS"
LOCAL_CACHE_STALE = "LOCAL-STALE"


@dataclass
class _Snapshot:
    value: Any
    expires_at: float


class LocalSnapshotCache:
    """Coalesce refreshes and keep the last good value after its fresh TTL."""

    def __init__(self, clock: Callable[[], float] = monotonic):
        self._clock = clock
        self._snapshots: dict[Any, _Snapshot] = {}
        self._locks: dict[Any, asyncio.Lock] = {}

    def _fresh_value(self, key: Any) -> Any | None:
        snapshot = self._snapshots.get(key)
        if snapshot is None or snapshot.expires_at <= self._clock():
            return None
        return snapshot.value

    async def get_or_load(
        self,
        key: Any,
        loader: Callable[[], Awaitable[Any]],
        ttl_seconds: int,
    ) -> tuple[Any, str]:
        fresh_value = self._fresh_value(key)
        if fresh_value is not None:
            return fresh_value, LOCAL_CACHE_HIT

        lock = self._locks.setdefault(key, asyncio.Lock())
        async with lock:
            fresh_value = self._fresh_value(key)
            if fresh_value is not None:
                return fresh_value, LOCAL_CACHE_HIT

            stale_snapshot = self._snapshots.get(key)
            try:
                value = await loader()
            except Exception:
                if stale_snapshot is not None:
                    return stale_snapshot.value, LOCAL_CACHE_STALE
                raise

            self._snapshots[key] = _Snapshot(
                value=value,
                expires_at=self._clock() + max(1, int(ttl_seconds)),
            )
            return value, LOCAL_CACHE_MISS


transport_filter_snapshot = LocalSnapshotCache()

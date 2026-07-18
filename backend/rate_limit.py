"""Small bounded in-memory limiter for browser-facing abuse controls."""

from __future__ import annotations

import math
import time
from collections import deque


class RateLimitExceeded(RuntimeError):
    def __init__(self, retry_after: int):
        self.retry_after = retry_after
        super().__init__("Rate limit exceeded")


class InMemoryRateLimiter:
    def __init__(self) -> None:
        self._events: dict[str, deque[float]] = {}

    def check(self, key: str, limit: int, window_seconds: int) -> None:
        now = time.monotonic()
        events = self._events.get(key)
        if events is None:
            return
        self._prune(events, now, window_seconds)
        if len(events) >= limit:
            raise RateLimitExceeded(max(1, math.ceil(window_seconds - (now - events[0]))))

    def record_failure(self, key: str, window_seconds: int) -> None:
        now = time.monotonic()
        events = self._events.setdefault(key, deque())
        self._prune(events, now, window_seconds)
        events.append(now)

    def reset(self, key: str) -> None:
        self._events.pop(key, None)

    @staticmethod
    def _prune(events: deque[float], now: float, window_seconds: int) -> None:
        while events and now - events[0] >= window_seconds:
            events.popleft()

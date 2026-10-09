from __future__ import annotations

import asyncio
import time
from typing import ClassVar, final

from pydantic_settings import BaseSettings, SettingsConfigDict


class RateLimiterSettings(BaseSettings):
    intervals_rate_limit_refill_rate: float = 5.0
    intervals_rate_limit_capacity: int = 10

    model_config: ClassVar[SettingsConfigDict] = SettingsConfigDict(env_file=".env", extra="ignore")


@final
class AsyncTokenBucket:
    def __init__(self, refill_rate: float = 5.0, capacity: int = 10) -> None:
        self._refill_rate: float = refill_rate
        self._capacity: float = float(capacity)
        self._tokens: float = float(capacity)
        self._updated_at: float = time.monotonic()
        self._lock: asyncio.Lock = asyncio.Lock()

    async def acquire(self) -> None:
        while True:
            async with self._lock:
                wait_for = self._consume_or_delay()
            if wait_for <= 0:
                return
            await asyncio.sleep(wait_for)

    def _consume_or_delay(self) -> float:
        now = time.monotonic()
        elapsed = now - self._updated_at
        self._tokens = min(self._capacity, self._tokens + elapsed * self._refill_rate)
        self._updated_at = now
        if self._tokens >= 1:
            self._tokens -= 1
            return 0.0
        return (1 - self._tokens) / self._refill_rate


def rate_limiter_from_env() -> AsyncTokenBucket:
    settings = RateLimiterSettings()
    return AsyncTokenBucket(
        refill_rate=settings.intervals_rate_limit_refill_rate,
        capacity=settings.intervals_rate_limit_capacity,
    )


def retry_delay(attempt: int, retry_after: str | None) -> float:
    if retry_after:
        try:
            return max(0.0, float(retry_after))
        except ValueError:
            pass
    return min(30.0, 2.0**attempt)

from collections.abc import Awaitable, Callable, Hashable
from time import monotonic
from typing import Generic, TypeVar

T = TypeVar("T")


class TtlCache(Generic[T]):
    def __init__(self, ttl_seconds: float) -> None:
        self.ttl_seconds = ttl_seconds
        self._values: dict[Hashable, tuple[float, T]] = {}

    async def get(self, key: Hashable, factory: Callable[[], Awaitable[T]]) -> T:
        now = monotonic()
        cached = self._values.get(key)
        if cached is not None and now - cached[0] < self.ttl_seconds:
            return cached[1]
        value = await factory()
        self._values[key] = (now, value)
        return value

    def clear(self) -> None:
        self._values.clear()

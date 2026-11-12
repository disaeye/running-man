"""Shared result and client types for Intervals.icu synchronization."""

from __future__ import annotations

from collections.abc import Callable, Mapping, Sequence
from dataclasses import dataclass
from datetime import date
from typing import Protocol, runtime_checkable

from infrastructure.repositories.activity import ActivitySyncStats


@dataclass(frozen=True, slots=True)
class StreamSyncError:
    activity_id: str
    message: str


@dataclass(frozen=True, slots=True)
class StreamSyncResult:
    inserted: int = 0
    errors: tuple[StreamSyncError, ...] = ()


@dataclass(frozen=True, slots=True)
class IncrementalSyncResult:
    activity_stats: ActivitySyncStats
    stream_result: StreamSyncResult = StreamSyncResult()
    ghosts_deleted: int = 0

    @property
    def upserted(self) -> int:
        return self.activity_stats.upserted

    @property
    def deduplicated(self) -> int:
        return self.activity_stats.deduplicated

    @property
    def total_processed(self) -> int:
        return self.activity_stats.total_processed


WindowProgress = Callable[[date, date, ActivitySyncStats], None]
StreamProgress = Callable[[str, int], None]


class ActivitiesClient(Protocol):
    async def get_activities(
        self, athlete_id: int | str, oldest: str, newest: str
    ) -> Sequence[Mapping[str, object]]: ...


@runtime_checkable
class ActivityFitClient(Protocol):
    async def download_fit(self, activity_id: str) -> bytes: ...


@runtime_checkable
class ActivityIntervalsClient(Protocol):
    async def get_activity(
        self, activity_id: str, *, intervals: bool = False
    ) -> Mapping[str, object]: ...


@dataclass(frozen=True, slots=True)
class IntervalSyncError:
    activity_id: str
    message: str


@dataclass(frozen=True, slots=True)
class IntervalSyncResult:
    fetched: int = 0
    errors: tuple[IntervalSyncError, ...] = ()


IntervalProgress = Callable[[str, int], None]


__all__ = [
    "ActivitiesClient",
    "ActivityFitClient",
    "ActivityIntervalsClient",
    "IncrementalSyncResult",
    "IntervalProgress",
    "IntervalSyncError",
    "IntervalSyncResult",
    "StreamProgress",
    "StreamSyncError",
    "StreamSyncResult",
    "WindowProgress",
]

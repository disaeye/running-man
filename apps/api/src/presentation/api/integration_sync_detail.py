from dataclasses import dataclass
from time import monotonic

from infrastructure.repositories.activity import ActivitySyncStats


@dataclass(frozen=True, slots=True)
class IntegrationSyncResult:
    activity_stats: ActivitySyncStats
    wellness_count: int = 0
    streams_inserted: int = 0
    ghosts_deleted: int = 0
    errors: tuple[dict[str, object], ...] = ()

    @property
    def upserted(self) -> int:
        return self.activity_stats.upserted

    @property
    def deduplicated(self) -> int:
        return self.activity_stats.deduplicated

    @property
    def total_processed(self) -> int:
        return self.activity_stats.total_processed


def sync_detail(
    result: IntegrationSyncResult,
    started_at: float,
    stage_status: str,
    stage_error: str | None,
) -> dict[str, object]:
    stage: dict[str, object] = {"name": "sync", "status": stage_status}
    if stage_error is not None:
        stage["error"] = stage_error
    return {
        "counts": {
            "activities_upserted": result.upserted,
            "activities_deduped": result.deduplicated,
            "wellness_days": result.wellness_count,
            "streams_inserted": result.streams_inserted,
            "ghosts_deleted": result.ghosts_deleted,
        },
        "duration_ms": int((monotonic() - started_at) * 1000),
        "stages": [stage],
        "errors": list(result.errors),
    }


def empty_sync_result() -> IntegrationSyncResult:
    return IntegrationSyncResult(activity_stats=ActivitySyncStats())

from __future__ import annotations

from uuid import UUID

from infrastructure.db.pool import get_pool
from infrastructure.repositories.activity import ActivityRepo
from infrastructure.repositories.integrations import UserIntegrationRepo

# Wellness has no source column; for this product it is written only by Intervals.icu.
_INTERVALS_OWNED_WELLNESS = frozenset({"intervals_icu"})


def bulk_delete_sources(source: str) -> list[str]:
    key = source.strip()
    if key == "upload":
        return ["fit", "gpx", "tcx"]
    try:
        from domain.ingestion import canonical_source

        return [canonical_source(key)]
    except Exception:
        return [key]


async def clear_activities(
    athlete_id: UUID,
    repo: ActivityRepo,
    integrations: UserIntegrationRepo,
    source: str | None,
) -> int:
    """Delete raw activity data and cascade source-owned wellness + derived load facts.

    Layering:
      raw (activity_summary / streams / wellness from Intervals)
        → derived (activity TSS facts, daily PMC ctl/atl/tsb/acwr)
    Clearing a source must not leave orphan derived rows that still paint the UI.
    """
    if source:
        for canonical in bulk_delete_sources(source):
            await repo.delete_by_source(athlete_id, canonical)
            if canonical in _INTERVALS_OWNED_WELLNESS:
                await _delete_wellness(athlete_id)
            if canonical == "intervals_icu":
                await integrations.clear_sync_state(athlete_id, canonical)
        return await refresh_derived_after_raw_change(athlete_id)

    await repo.delete_all(athlete_id)
    await _delete_wellness(athlete_id)
    await integrations.clear_sync_state(athlete_id)
    return await refresh_derived_after_raw_change(athlete_id, "clear:all")


async def _delete_wellness(athlete_id: UUID) -> None:
    async with get_pool().connection() as conn, conn.cursor() as cur:
        _ = await cur.execute(
            "DELETE FROM health_wellness WHERE athlete_id = %s",
            (athlete_id,),
        )


async def refresh_derived_after_raw_change(
    athlete_id: UUID,
    trigger: str = "clear:source",
) -> int:
    """Queue load and PMC refresh after raw activity changes.

    The worker also clears activity and day facts when the athlete has no
    remaining activities.
    """
    from application.computation.orchestration import enqueue_activity_recompute

    return await enqueue_activity_recompute(athlete_id, trigger)

"""Writing an estimated threshold step and stamping the physiology run.

Split from `facts.py` so that module stays within the 250-line limit: this is the
only place that touches `athlete_thresholds`, and keeping the SQL together makes
the manual-value guard and the effective date reviewable in one screen.
"""

from __future__ import annotations

from collections.abc import Mapping
from datetime import date
from typing import Protocol
from uuid import UUID


class CursorLike(Protocol):
    async def execute(self, query: str, params: tuple[object, ...]) -> object: ...


async def record_threshold_step(
    cur: CursorLike,
    athlete_id: UUID,
    version: str,
    values: Mapping[str, object],
    effective_from: date,
) -> dict[str, object]:
    """Write today's estimate as a dated step, unless a manual row owns the day.

    Thresholds are time-versioned so a re-estimate cannot retroactively rescore
    past sessions. That only works if the step lands on the athlete's calendar
    day: stamped on the host's date, an evening reading applies to the previous
    day's sessions for anyone east of Greenwich.

    An estimate never lands on a row the athlete wrote by hand; the two used to
    share one upsert, so a manual threshold silently became `estimated` with an
    algorithm's value. Returns the values written, empty when the guard won.
    """
    if not values:
        return {}
    columns = ", ".join(values)
    placeholders = ", ".join(["%s"] * len(values))
    updates = ", ".join(f"{column} = EXCLUDED.{column}" for column in values)
    await cur.execute(
        f"""
        INSERT INTO athlete_thresholds (
            athlete_id, effective_from, {columns}, source, algorithm_version
        )
        SELECT %s, %s, {placeholders}, 'estimated', %s
        WHERE NOT EXISTS (
            SELECT 1 FROM athlete_thresholds
            WHERE athlete_id = %s AND effective_from = %s
              AND source = 'manual'
        )
        ON CONFLICT (athlete_id, effective_from) DO UPDATE SET {updates},
            source = 'estimated', algorithm_version = EXCLUDED.algorithm_version
        """,
        (athlete_id, effective_from, *values.values(), version, athlete_id, effective_from),
    )
    return dict(values)


async def stamp_physiology_run(
    cur: CursorLike,
    athlete_id: UUID,
    version: str,
    run_id: UUID,
) -> None:
    """Mark the athlete's physiology as freshly computed under ``version``.

    `cached_physiology` reads all three fields; without them it reports stale and
    every request recomputes.
    """
    await cur.execute(
        """
        UPDATE athletes
        SET physiology_updated_at = now(),
            physiology_computation_run_id = %s,
            physiology_algorithm_version = %s
        WHERE id = %s
        """,
        (run_id, version, athlete_id),
    )

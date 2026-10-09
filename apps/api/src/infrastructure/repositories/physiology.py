from __future__ import annotations

from datetime import datetime
from uuid import UUID

from infrastructure.db.pool import ConnectionContext, get_pool


def _connect() -> ConnectionContext:
    return get_pool().connection()


class PhysiologyRepo:
    async def cached(self, athlete_id: UUID) -> dict[str, object] | None:
        """Fields the physiology cache check needs, or None when nothing is cached.

        The thresholds are read from `athlete_thresholds`, not from `athletes`.
        They moved to a time-versioned table (see the `a7b8c9d0e1f2` migration),
        which dropped the `hr_max` and `lthr` columns from `athletes`, and this
        query kept selecting them. Postgres rejected it with
        `column "hr_max" does not exist` for every athlete, so the cached path
        never returned a hit — silently, because the caller treats a failure to
        hit the cache as "recompute", which is a correct thing to do for the
        wrong reason.

        A LEFT JOIN keeps the cache metadata readable when no threshold row
        exists yet; the values are then NULL and the caller's freshness check
        still governs.
        """
        query = """
        SELECT t.hr_max, t.lthr, t.threshold_pace,
               a.physiology_updated_at, a.physiology_algorithm_version,
               a.physiology_computation_run_id
        FROM athletes a
        LEFT JOIN LATERAL (
            SELECT hr_max, lthr, threshold_pace
            FROM athlete_thresholds
            WHERE athlete_id = a.id
            ORDER BY effective_from DESC
            LIMIT 1
        ) t ON TRUE
        WHERE a.id = %s
        """
        async with _connect() as conn:
            cur = conn.cursor()
            _ = await cur.execute(query, (athlete_id,))
            row = await cur.fetchone()
        return dict(row) if row else None

    async def activities(
        self, athlete_id: UUID, start: datetime, end: datetime
    ) -> list[dict[str, object]]:
        query = """
        SELECT activity_id, sport, distance_m, duration_s, avg_hr, max_hr, avg_power
        FROM activity_compute WHERE athlete_id = %s AND start_time >= %s AND start_time <= %s
        ORDER BY start_time DESC
        """
        async with _connect() as conn:
            cur = conn.cursor()
            _ = await cur.execute(query, (athlete_id, start, end))
            return [dict(row) for row in await cur.fetchall()]

    async def heart_rate_window(
        self, athlete_id: UUID, start: datetime, end: datetime
    ) -> list[dict[str, object]]:
        query = """
        SELECT DISTINCT a.activity_id, a.avg_hr, (
          SELECT MAX(hr_val) FROM (
            SELECT AVG(s.value) OVER (
              ORDER BY s.sample_time ROWS BETWEEN 119 PRECEDING AND CURRENT ROW
            ) AS hr_val
            FROM activity_streams s
            WHERE s.athlete_id = a.athlete_id AND s.activity_id = a.activity_id
              AND s.metric_type = 'heart_rate' AND s.sample_time IS NOT NULL
          ) sub
        ) AS best_20min_hr
        FROM activity_compute a
        WHERE a.athlete_id = %s AND a.start_time >= %s AND a.start_time <= %s
          AND a.avg_hr IS NOT NULL
        """
        async with _connect() as conn:
            cur = conn.cursor()
            _ = await cur.execute(query, (athlete_id, start, end))
            rows = await cur.fetchall()
        return [self._heart_rate_row(dict(row)) for row in rows]

    @staticmethod
    def _heart_rate_row(row: dict[str, object]) -> dict[str, object]:
        average = row.get("avg_hr")
        best = row.get("best_20min_hr")
        value = best if best is not None else average
        return {"best_20min_hr": value, "best_60min_hr": average} if value is not None else {}

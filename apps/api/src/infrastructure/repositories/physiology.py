from __future__ import annotations

from datetime import date, datetime
from uuid import UUID

from domain.time import local_day_sql
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

    async def timezone(self, athlete_id: UUID) -> str | None:
        """The athlete's zone name, for stamping threshold steps on their day."""
        query = "SELECT timezone FROM athletes WHERE id = %s"
        async with _connect() as conn:
            cur = conn.cursor()
            _ = await cur.execute(query, (athlete_id,))
            row = await cur.fetchone()
        if not row:
            return None
        value = dict(row).get("timezone")
        return str(value) if value else None

    async def earliest_activity_day(self, athlete_id: UUID, timezone: str) -> date | None:
        """Athlete-local date of the earliest activity, or None when there is none.

        The first threshold step is anchored here, not on today: threshold
        history resolves per activity date, so a step stamped today leaves every
        session before it without a threshold and therefore without load.
        """
        query = f"""
        SELECT min({local_day_sql()}) AS first_day
        FROM activity_compute
        WHERE athlete_id = %s
        """
        async with _connect() as conn:
            cur = conn.cursor()
            _ = await cur.execute(query, (timezone, athlete_id))
            row = await cur.fetchone()
        if not row:
            return None
        value = dict(row).get("first_day")
        return value if isinstance(value, date) else None

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
        """Best 20-minute and 60-minute average HR per activity.

        The rolling windows are expressed as time ranges, not row counts: streams
        are recorded at 1 s, 3 s or 5 s depending on the device, so
        `ROWS BETWEEN 119 PRECEDING` covered 2 minutes of a 5 s stream and 20
        minutes of a 1 s one.

        A window is only reported when the activity's HR stream actually spans
        it. Without that check an 8-minute run still produced a "best 20-minute"
        value from its partial windows, and the value fed straight into the LTHR
        estimate.
        """
        query = """
        WITH hr AS (
          SELECT activity_id, sample_time, value,
                 EXTRACT(EPOCH FROM MAX(sample_time) OVER (PARTITION BY activity_id)
                         - MIN(sample_time) OVER (PARTITION BY activity_id)) AS span_s
          FROM activity_streams
          WHERE athlete_id = %s AND metric_type = 'heart_rate'
            AND sample_time IS NOT NULL AND value IS NOT NULL
        ), rolling AS (
          SELECT activity_id, span_s,
                 AVG(value) OVER (
                   PARTITION BY activity_id ORDER BY sample_time
                   RANGE BETWEEN INTERVAL '1199 seconds' PRECEDING AND CURRENT ROW
                 ) AS avg_20min,
                 AVG(value) OVER (
                   PARTITION BY activity_id ORDER BY sample_time
                   RANGE BETWEEN INTERVAL '3599 seconds' PRECEDING AND CURRENT ROW
                 ) AS avg_60min
          FROM hr
        )
        SELECT a.activity_id,
               CASE WHEN MAX(r.span_s) >= 1199 THEN MAX(r.avg_20min) END AS best_20min_hr,
               CASE WHEN MAX(r.span_s) >= 3599 THEN MAX(r.avg_60min) END AS best_60min_hr
        FROM activity_compute a
        JOIN rolling r ON r.activity_id = a.activity_id
        WHERE a.athlete_id = %s AND a.start_time >= %s AND a.start_time <= %s
        GROUP BY a.activity_id
        """
        async with _connect() as conn:
            cur = conn.cursor()
            _ = await cur.execute(query, (athlete_id, athlete_id, start, end))
            rows = await cur.fetchall()
        return [
            row
            for row in (self._heart_rate_row(dict(raw)) for raw in rows)
            if row
        ]

    @staticmethod
    def _heart_rate_row(row: dict[str, object]) -> dict[str, object]:
        best_20 = row.get("best_20min_hr")
        best_60 = row.get("best_60min_hr")
        if best_20 is None and best_60 is None:
            return {}
        # `best_60min_hr` used to be the activity's average HR. That is not a
        # 60-minute best, and `estimate_lthr` takes max(0.98 x best_20, best_60),
        # so LTHR was in practice set by the highest activity average HR - a
        # value from races, higher than LT2 - which in turn moved every hrTSS
        # zone boundary.
        return {"best_20min_hr": best_20, "best_60min_hr": best_60}

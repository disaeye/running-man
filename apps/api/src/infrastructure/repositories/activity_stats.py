"""Read-only aggregate stats over activity_summary — kept separate from
ActivityRepo to respect the 250 LOC module cap."""

from datetime import date
from uuid import UUID

from infrastructure.db.pool import ConnectionContext, get_pool


def _connect() -> ConnectionContext:
    return get_pool().connection()


class ActivityStatsRepo:
    async def aggregate_by_sport(
        self,
        athlete_id: UUID,
        start: date | None,
        end: date | None,
        sport: str | None,
    ) -> list[dict[str, object]]:
        """Per-sport aggregate: {sport, total_distance_m, total_duration_s,
        total_tss, activity_count}."""
        conditions = ["athlete_id = %s"]
        params: list[object] = [athlete_id]
        if start is not None:
            conditions.append("start_time::date >= %s")
            params.append(start)
        if end is not None:
            conditions.append("start_time::date <= %s")
            params.append(end)
        if sport is not None:
            conditions.append("sport = %s")
            params.append(sport)
        query = f"""
        SELECT a.sport,
               COALESCE(SUM(a.distance_m), 0) AS total_distance_m,
               COALESCE(SUM(a.duration_s), 0) AS total_duration_s,
               COALESCE(SUM(tss.value), 0) AS total_tss,
               COUNT(*) AS activity_count
        FROM activity_compute AS a
        LEFT JOIN current_activity_facts AS tss
          ON tss.athlete_id = a.athlete_id AND tss.subject_key = a.activity_id
         AND tss.metric_key = 'tss'
        WHERE {" AND ".join(f'a.{condition}' for condition in conditions)}
        GROUP BY a.sport
        ORDER BY a.sport
        """
        async with _connect() as conn, conn.cursor() as cur:
            _ = await cur.execute(query, tuple(params))
            return [dict(row) for row in await cur.fetchall()]

from __future__ import annotations

from datetime import date, datetime, time, timedelta
from uuid import UUID

from infrastructure.db.pool import ConnectionContext, get_pool


def _connect() -> ConnectionContext:
    return get_pool().connection()


class AnalyticsRepo:
    async def activity_streams(self, athlete_id: UUID, activity_id: str) -> list[dict[str, object]]:
        query = """
        SELECT sample_time, metric_type, value, lat, lon, alt FROM activity_streams
        WHERE athlete_id = %s AND activity_id = %s ORDER BY sample_time, metric_type LIMIT 100000
        """
        return await self._rows(query, (athlete_id, activity_id))

    async def running_activities(self, athlete_id: UUID) -> list[dict[str, object]]:
        query = """
        SELECT activity_id, sport, distance_m, duration_s FROM activity_compute
        WHERE athlete_id = %s AND start_time > NOW() - INTERVAL '730 days' ORDER BY start_time DESC
        """
        return await self._rows(query, (athlete_id,))

    async def activities_for_range(
        self, athlete_id: UUID, start: date, end: date
    ) -> list[dict[str, object]]:
        return await self._rows(
            self._activity_statement("a.start_time::date BETWEEN %s AND %s"),
            (athlete_id, start, end),
        )

    async def all_activities(self, athlete_id: UUID, sport: str | None) -> list[dict[str, object]]:
        condition = "a.sport = %s" if sport else "TRUE"
        params: tuple[object, ...] = (athlete_id, sport) if sport else (athlete_id,)
        return await self._rows(self._activity_statement(condition), params)

    async def streams_for_range(
        self, athlete_id: UUID, start: date, end: date, metric_types: list[str]
    ) -> dict[str, list[dict[str, object]]]:
        start_time = datetime.combine(start, time.min)
        end_time = datetime.combine(end + timedelta(days=1), time.min)
        query = """
        SELECT s.activity_id, s.sample_time, s.metric_type, s.value, s.lat, s.lon, s.alt
        FROM activity_streams s JOIN activity_compute a
          ON a.athlete_id = s.athlete_id AND a.activity_id = s.activity_id
        WHERE s.athlete_id = %s AND a.start_time >= %s AND a.start_time < %s
          AND s.metric_type = ANY(%s) ORDER BY s.activity_id, s.sample_time, s.metric_type
        """
        return _group(await self._rows(query, (athlete_id, start_time, end_time, metric_types)))

    async def streams_for_activities(
        self, athlete_id: UUID, activity_ids: list[str], metric_types: list[str] | None = None
    ) -> dict[str, list[dict[str, object]]]:
        if not activity_ids:
            return {}
        filter_sql = "AND metric_type = ANY(%s)" if metric_types else ""
        params: tuple[object, ...] = (
            (athlete_id, activity_ids, metric_types) if metric_types else (athlete_id, activity_ids)
        )
        query = f"""
        SELECT activity_id, sample_time, metric_type, value, lat, lon, alt FROM activity_streams
        WHERE athlete_id = %s AND activity_id = ANY(%s) {filter_sql}
        ORDER BY sample_time, metric_type
        """
        return _group(await self._rows(query, params))

    async def _rows(self, query: str, params: tuple[object, ...]) -> list[dict[str, object]]:
        async with _connect() as conn, conn.cursor() as cur:
            _ = await cur.execute(query, params)
            return [dict(row) for row in await cur.fetchall()]

    @staticmethod
    def _activity_statement(condition: str) -> str:
        return f"""
        SELECT a.activity_id, a.start_time, a.sport, a.distance_m, a.duration_s, a.avg_hr,
               a.max_hr, a.avg_power, np.value AS np, intensity.value AS intensity_factor,
               tss.value AS tss, a.avg_cadence, a.avg_speed, a.elevation_gain_m, a.calories,
               a.external_id, a.source, a.file_type, a.device_name
        FROM activity_compute a
        LEFT JOIN current_activity_facts np
          ON np.athlete_id = a.athlete_id AND np.subject_key = a.activity_id
         AND np.metric_key = 'normalized_power'
        LEFT JOIN current_activity_facts intensity
          ON intensity.athlete_id = a.athlete_id AND intensity.subject_key = a.activity_id
         AND intensity.metric_key = 'intensity_factor'
        LEFT JOIN current_activity_facts tss
          ON tss.athlete_id = a.athlete_id AND tss.subject_key = a.activity_id
         AND tss.metric_key = 'tss'
        WHERE a.athlete_id = %s AND {condition} ORDER BY a.start_time
        """


def _group(rows: list[dict[str, object]]) -> dict[str, list[dict[str, object]]]:
    grouped: dict[str, list[dict[str, object]]] = {}
    for row in rows:
        grouped.setdefault(str(row["activity_id"]), []).append(row)
    return grouped

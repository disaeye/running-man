from datetime import date
from uuid import UUID

from infrastructure.db.pool import ConnectionContext, get_pool


def _connect() -> ConnectionContext:
    return get_pool().connection()


class ActivityReadRepo:
    async def list_by_range(
        self, athlete_id: UUID, start: date, end: date
    ) -> list[dict[str, object]]:
        query = """
        SELECT a.activity_id, a.start_time, a.sport, a.distance_m, a.duration_s,
               a.avg_hr, a.max_hr, a.avg_power, np.value AS np, a.icu_ctl,
               intensity.value AS intensity_factor, tss.value AS tss,
               a.avg_cadence, a.avg_speed, a.elevation_gain_m, a.calories,
               a.external_id, a.source, a.file_type, a.device_name, a.summary_polyline,
               a.has_gps
        FROM activity_summary AS a
        JOIN athletes AS athlete ON athlete.id = a.athlete_id
        LEFT JOIN current_activity_facts AS np
          ON np.athlete_id = a.athlete_id AND np.subject_key = a.activity_id
         AND np.metric_key = 'normalized_power'
        LEFT JOIN current_activity_facts AS intensity
          ON intensity.athlete_id = a.athlete_id AND intensity.subject_key = a.activity_id
         AND intensity.metric_key = 'intensity_factor'
        LEFT JOIN current_activity_facts AS tss
          ON tss.athlete_id = a.athlete_id AND tss.subject_key = a.activity_id
         AND tss.metric_key = 'tss'
        WHERE a.athlete_id = %s
          AND (a.start_time AT TIME ZONE athlete.timezone)::date BETWEEN %s AND %s
        ORDER BY a.start_time DESC
        """
        async with _connect() as conn, conn.cursor() as cur:
            _ = await cur.execute(query, (athlete_id, start, end))
            return [dict(row) for row in await cur.fetchall()]

    async def get_by_id(self, athlete_id: UUID, activity_id: str) -> dict[str, object] | None:
        query = """
        SELECT a.activity_id, a.start_time, a.sport, a.distance_m, a.duration_s,
               a.avg_hr, a.max_hr, a.avg_power, np.value AS np, a.icu_ctl,
               intensity.value AS intensity_factor, tss.value AS tss,
               a.avg_cadence, a.avg_speed, a.elevation_gain_m, a.calories,
               a.external_id, a.source, a.file_type, a.device_name, a.has_gps,
               a.has_hr, a.has_power, a.has_cadence, a.raw_data, a.summary_polyline,
               a.weather_avg_temp, a.weather_min_temp, a.weather_max_temp,
               a.weather_feels_like, a.weather_wind_speed, a.weather_wind_gust,
               a.weather_wind_deg, a.weather_headwind_pct, a.weather_tailwind_pct,
               a.weather_clouds_pct, a.weather_max_rain, a.weather_max_snow
        FROM activity_summary AS a
        JOIN athletes AS athlete ON athlete.id = a.athlete_id
        LEFT JOIN current_activity_facts AS np
          ON np.athlete_id = a.athlete_id AND np.subject_key = a.activity_id
         AND np.metric_key = 'normalized_power'
        LEFT JOIN current_activity_facts AS intensity
          ON intensity.athlete_id = a.athlete_id AND intensity.subject_key = a.activity_id
         AND intensity.metric_key = 'intensity_factor'
        LEFT JOIN current_activity_facts AS tss
          ON tss.athlete_id = a.athlete_id AND tss.subject_key = a.activity_id
         AND tss.metric_key = 'tss'
        WHERE a.athlete_id = %s AND a.activity_id = %s
        LIMIT 1
        """
        async with _connect() as conn, conn.cursor() as cur:
            _ = await cur.execute(query, (athlete_id, activity_id))
            row = await cur.fetchone()
            return dict(row) if row else None

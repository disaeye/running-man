from __future__ import annotations

from datetime import date, timedelta
from uuid import UUID

from domain.time import local_day_sql
from infrastructure.db.pool import ConnectionContext, get_pool


def _connect() -> ConnectionContext:
    return get_pool().connection()


# Day-keyed filters resolve against the athlete's calendar day. The zone is
# read from the athlete's own profile in the same statement, so the filter and
# the day key can never disagree about which athlete the day belongs to.
_CALENDAR_DAY = local_day_sql(
    "SELECT timezone FROM athletes WHERE id = %s", column="start_time"
)
_ACTIVITY_DAY = local_day_sql(
    "SELECT timezone FROM athletes WHERE id = %s", column="start_time"
)


class InsightReadRepo:
    async def events_for_day(self, athlete_id: UUID, target_day: date) -> list[dict[str, object]]:
        return await self.planned_events(athlete_id, target_day, target_day)

    async def planned_events(
        self, athlete_id: UUID, start: date, end: date
    ) -> list[dict[str, object]]:
        query = f"""
        SELECT event_id, start_time, category, sport_type, name, predicted_tss, status, done,
               plan_goal_id, plan_source, training_type, workout_prescription, athlete_edited,
               linked_activity_id, completed_distance_m, completed_duration_s,
               completed_avg_hr, completed_rpe, actual_logged_at
        FROM training_calendar WHERE athlete_id = %s AND {_CALENDAR_DAY} BETWEEN %s AND %s
          AND status <> 'deleted' ORDER BY start_time
        """
        async with _connect() as conn, conn.cursor() as cur:
            _ = await cur.execute(query, (athlete_id, athlete_id, start, end))
            return [dict(row) for row in await cur.fetchall()]

    async def week_context(
        self, athlete_id: UUID, start: date, end: date, target_day: date
    ) -> tuple[float, int]:
        planned_query = f"""
        SELECT COALESCE(SUM(predicted_tss), 0) AS value FROM training_calendar
        WHERE athlete_id = %s AND {_CALENDAR_DAY} BETWEEN %s AND %s AND status <> 'deleted'
        """
        recent_query = f"""
        SELECT COUNT(DISTINCT {_ACTIVITY_DAY}) AS value FROM activity_compute
        WHERE athlete_id = %s AND {_ACTIVITY_DAY} BETWEEN %s AND %s
        """
        async with _connect() as conn, conn.cursor() as cur:
            _ = await cur.execute(planned_query, (athlete_id, athlete_id, start, end))
            planned_row = await cur.fetchone()
            _ = await cur.execute(
                recent_query,
                (
                    athlete_id,
                    athlete_id,
                    target_day - timedelta(days=6),
                    target_day,
                ),
            )
            recent_row = await cur.fetchone()
        return float(planned_row["value"] if planned_row else 0), int(
            recent_row["value"] if recent_row else 0
        )

    async def streams(
        self, athlete_id: UUID, activity_ids: list[str]
    ) -> dict[str, list[dict[str, object]]]:
        if not activity_ids:
            return {}
        query = """
        SELECT activity_id, sample_time, metric_type, value, lat, lon, alt FROM activity_streams
        WHERE athlete_id = %s AND activity_id = ANY(%s) ORDER BY sample_time, metric_type
        """
        async with _connect() as conn, conn.cursor() as cur:
            _ = await cur.execute(query, (athlete_id, activity_ids))
            rows = [dict(row) for row in await cur.fetchall()]
        grouped: dict[str, list[dict[str, object]]] = {}
        for row in rows:
            grouped.setdefault(str(row["activity_id"]), []).append(row)
        return grouped

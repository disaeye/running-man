from __future__ import annotations

from datetime import date
from uuid import UUID

from infrastructure.repositories.strength_repository_helpers import connect, row_dict


class StrengthAnalyticsRepo:
    async def muscle_volume(
        self, athlete_id: UUID, from_date: date | None, to_date: date | None
    ) -> list[dict[str, object]]:
        query = """
        SELECT el.category AS muscle_group, SUM(ws.weight_kg * ws.reps)::float AS volume_kg
        FROM workout_sets ws JOIN workout_exercises we ON we.id = ws.workout_exercise_id
        JOIN exercise_library el ON el.id = we.exercise_id
        WHERE ws.athlete_id = %s AND ws.set_type = 'working' AND ws.completed = true
          AND (%s::date IS NULL OR ws.created_at::date >= %s::date)
          AND (%s::date IS NULL OR ws.created_at::date <= %s::date)
        GROUP BY el.category ORDER BY el.category
        """
        async with connect() as conn, conn.cursor() as cur:
            _ = await cur.execute(query, (athlete_id, from_date, from_date, to_date, to_date))
            return [row_dict(row) for row in await cur.fetchall()]

    async def e1rm_trend(
        self, athlete_id: UUID, from_date: date | None, to_date: date | None
    ) -> list[dict[str, object]]:
        query = """
        SELECT DISTINCT ON (we.exercise_id) we.exercise_id, el.name_cn,
               ws.estimated_1rm_kg::float AS max_estimated_1rm_kg, ws.created_at::date AS date
        FROM workout_sets ws JOIN workout_exercises we ON we.id = ws.workout_exercise_id
        JOIN exercise_library el ON el.id = we.exercise_id
        WHERE ws.athlete_id = %s AND ws.set_type = 'working' AND ws.completed = true
          AND ws.reps BETWEEN 1 AND 10 AND ws.estimated_1rm_kg IS NOT NULL
          AND (%s::date IS NULL OR ws.created_at::date >= %s::date)
          AND (%s::date IS NULL OR ws.created_at::date <= %s::date)
        ORDER BY we.exercise_id, ws.estimated_1rm_kg DESC, ws.created_at::date DESC
        """
        async with connect() as conn, conn.cursor() as cur:
            _ = await cur.execute(query, (athlete_id, from_date, from_date, to_date, to_date))
            return [row_dict(row) for row in await cur.fetchall()]

    async def muscle_distribution(
        self, athlete_id: UUID, from_date: date | None, to_date: date | None
    ) -> list[dict[str, object]]:
        query = """
        SELECT el.category AS category, COUNT(*)::int AS set_count,
               SUM(ws.weight_kg * ws.reps)::float AS volume_kg
        FROM workout_sets ws JOIN workout_exercises we ON we.id = ws.workout_exercise_id
        JOIN exercise_library el ON el.id = we.exercise_id
        WHERE ws.athlete_id = %s AND ws.set_type = 'working' AND ws.completed = true
          AND (%s::date IS NULL OR ws.created_at::date >= %s::date)
          AND (%s::date IS NULL OR ws.created_at::date <= %s::date)
        GROUP BY el.category ORDER BY el.category
        """
        async with connect() as conn, conn.cursor() as cur:
            _ = await cur.execute(query, (athlete_id, from_date, from_date, to_date, to_date))
            return [row_dict(row) for row in await cur.fetchall()]

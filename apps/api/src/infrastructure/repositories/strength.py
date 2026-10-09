from __future__ import annotations

import json
from collections.abc import Mapping
from datetime import date
from typing import cast
from uuid import UUID, uuid4

from infrastructure.db.pool import ConnectionContext, get_pool


def _connect() -> ConnectionContext:
    return get_pool().connection()


def _row(row: object) -> dict[str, object]:
    return dict(cast(Mapping[str, object], row))


def _e1rm(weight_kg: float | None, reps: int | None) -> float | None:
    if weight_kg is None or reps is None or not 1 <= reps <= 10:
        return None
    return round(float(weight_kg) * (1 + reps / 30), 2)

_EXERCISE_FIELDS = """id, name_cn, name_en, category, primary_muscles,
secondary_muscles, equipment, movement_pattern, instructions, common_mistakes, difficulty"""
_SET_FIELDS = """id, workout_exercise_id, athlete_id, set_number, weight_kg, reps,
rpe, set_type, rest_seconds, completed, estimated_1rm_kg, created_at"""


class StrengthRepo:
    async def list_exercises(
        self, category: str | None = None, query: str | None = None
    ) -> list[dict[str, object]]:
        sql = f"SELECT {_EXERCISE_FIELDS} FROM exercise_library WHERE TRUE"
        params: list[object] = []
        if category:
            sql += " AND category = %s"
            params.append(category)
        if query:
            sql += " AND (name_cn ILIKE %s OR name_en ILIKE %s)"
            params.extend([f"%{query}%", f"%{query}%"])
        sql += " ORDER BY category, id"
        async with _connect() as conn, conn.cursor() as cur:
            _ = await cur.execute(sql, params)
            return [_row(row) for row in await cur.fetchall()]

    async def get_exercise(self, exercise_id: int) -> dict[str, object] | None:
        async with _connect() as conn, conn.cursor() as cur:
            _ = await cur.execute(
                f"SELECT {_EXERCISE_FIELDS} FROM exercise_library WHERE id = %s",
                (exercise_id,),
            )
            row = await cur.fetchone()
            return _row(row) if row else None

    async def create_workout(self, athlete_id: UUID, day: date, name: str | None) -> str:
        activity_id = f"strength-{uuid4()}"
        raw_data = {"name": name or "Strength Workout"}
        query = """
        INSERT INTO activity_summary (activity_id, athlete_id, start_time, sport, source, raw_data)
        VALUES (%s, %s, %s::date, 'weight_training', 'manual', %s::jsonb)
        RETURNING activity_id
        """
        async with _connect() as conn, conn.cursor() as cur:
            _ = await cur.execute(query, (activity_id, athlete_id, day, json.dumps(raw_data)))
            row = await cur.fetchone()
        assert row is not None
        return cast(str, row["activity_id"])

    async def add_exercise(
        self,
        activity_id: str,
        athlete_id: UUID,
        exercise_id: int,
        order_index: int | None,
        notes: str | None,
    ) -> dict[str, object] | None:
        query = """
        INSERT INTO workout_exercises (activity_id, athlete_id, exercise_id, order_index, notes)
        SELECT %s, %s, %s, COALESCE(%s, 0), %s
        WHERE EXISTS (SELECT 1 FROM activity_summary WHERE activity_id = %s AND athlete_id = %s)
        RETURNING id, activity_id, athlete_id, exercise_id, order_index, notes, created_at
        """
        vals = (activity_id, athlete_id, exercise_id, order_index, notes, activity_id, athlete_id)
        async with _connect() as conn, conn.cursor() as cur:
            _ = await cur.execute(query, vals)
            return _row(row) if (row := await cur.fetchone()) else None

    async def update_exercise(
        self, workout_exercise_id: int, athlete_id: UUID, notes: str | None, order_index: int | None
    ) -> dict[str, object] | None:
        query = """
        UPDATE workout_exercises SET notes = COALESCE(%s, notes), order_index = COALESCE(%s, order_index)
        WHERE id = %s AND athlete_id = %s
        RETURNING id, activity_id, athlete_id, exercise_id, order_index, notes, created_at
        """
        async with _connect() as conn, conn.cursor() as cur:
            _ = await cur.execute(query, (notes, order_index, workout_exercise_id, athlete_id))
            row = await cur.fetchone()
            return _row(row) if row else None

    async def list_exercises_in_workout(self, activity_id: str) -> list[dict[str, object]]:
        query = """
        SELECT we.id, we.activity_id, we.athlete_id, we.exercise_id, we.order_index, we.notes,
               we.created_at, el.name_cn, el.name_en, el.category, el.primary_muscles,
               el.secondary_muscles, el.equipment, el.movement_pattern
        FROM workout_exercises we JOIN exercise_library el ON el.id = we.exercise_id
        WHERE we.activity_id = %s ORDER BY we.order_index, we.id
        """
        async with _connect() as conn, conn.cursor() as cur:
            _ = await cur.execute(query, (activity_id,))
            return [_row(row) for row in await cur.fetchall()]

    async def add_set(
        self,
        workout_exercise_id: int,
        athlete_id: UUID,
        weight_kg: float,
        reps: int,
        rpe: float | None,
        set_type: str | None,
        rest_seconds: int | None,
    ) -> dict[str, object] | None:
        query = f"""
        INSERT INTO workout_sets (workout_exercise_id, athlete_id, set_number, weight_kg, reps,
                                  rpe, set_type, rest_seconds, estimated_1rm_kg)
        SELECT %s, %s, COALESCE(MAX(ws.set_number), 0) + 1, %s, %s, %s, COALESCE(%s, 'working'), %s, %s
        FROM workout_exercises we LEFT JOIN workout_sets ws ON ws.workout_exercise_id = we.id
        WHERE we.id = %s AND we.athlete_id = %s GROUP BY we.id
        RETURNING {_SET_FIELDS}
        """
        vals = (
            workout_exercise_id,
            athlete_id,
            weight_kg,
            reps,
            rpe,
            set_type,
            rest_seconds,
            _e1rm(weight_kg, reps),
            workout_exercise_id,
            athlete_id,
        )
        async with _connect() as conn, conn.cursor() as cur:
            # Serialize concurrent add_set calls per exercise: the
            # MAX(set_number)+1 selection below is otherwise racy and would
            # silently produce duplicate set numbers (no unique constraint
            # guards (workout_exercise_id, set_number)).
            _ = await cur.execute(
                "SELECT pg_advisory_xact_lock(hashtextextended('workout_sets:' || %s::text, 0))",
                (workout_exercise_id,),
            )
            _ = await cur.execute(query, vals)
            row = await cur.fetchone()
            return _row(row) if row else None

    async def update_set(
        self, set_id: int, athlete_id: UUID, data: dict[str, object]
    ) -> dict[str, object] | None:
        current = await self._get_set(set_id, athlete_id)
        if current is None:
            return None
        weight = data.get("weight_kg", current["weight_kg"])
        reps = data.get("reps", current["reps"])
        query = f"""
        UPDATE workout_sets SET weight_kg = COALESCE(%s, weight_kg), reps = COALESCE(%s, reps),
        rpe = COALESCE(%s, rpe), set_type = COALESCE(%s, set_type),
        rest_seconds = COALESCE(%s, rest_seconds), completed = COALESCE(%s, completed),
        estimated_1rm_kg = %s WHERE id = %s AND athlete_id = %s RETURNING {_SET_FIELDS}
        """
        vals = (
            data.get("weight_kg"),
            data.get("reps"),
            data.get("rpe"),
            data.get("set_type"),
            data.get("rest_seconds"),
            data.get("completed"),
            _e1rm(cast(float, weight), cast(int, reps)),
            set_id,
            athlete_id,
        )
        async with _connect() as conn, conn.cursor() as cur:
            _ = await cur.execute(query, vals)
            row = await cur.fetchone()
            return _row(row) if row else None

    async def list_sets(self, workout_exercise_id: int) -> list[dict[str, object]]:
        async with _connect() as conn, conn.cursor() as cur:
            _ = await cur.execute(
                f"SELECT {_SET_FIELDS} FROM workout_sets WHERE workout_exercise_id = %s ORDER BY set_number, id",
                (workout_exercise_id,),
            )
            return [_row(row) for row in await cur.fetchall()]

    async def delete_set(self, set_id: int, athlete_id: UUID) -> bool:
        async with _connect() as conn, conn.cursor() as cur:
            _ = await cur.execute(
                "DELETE FROM workout_sets WHERE id = %s AND athlete_id = %s", (set_id, athlete_id)
            )
            return cur.rowcount > 0

    async def delete_workout(self, activity_id: str, athlete_id: UUID) -> bool:
        async with _connect() as conn, conn.cursor() as cur:
            _ = await cur.execute(
                "DELETE FROM workout_exercises WHERE activity_id = %s AND athlete_id = %s",
                (activity_id, athlete_id),
            )
            _ = await cur.execute(
                "DELETE FROM activity_summary WHERE activity_id = %s AND athlete_id = %s",
                (activity_id, athlete_id),
            )
            return cur.rowcount > 0

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
        async with _connect() as conn, conn.cursor() as cur:
            _ = await cur.execute(query, (athlete_id, from_date, from_date, to_date, to_date))
            return [_row(row) for row in await cur.fetchall()]

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
        async with _connect() as conn, conn.cursor() as cur:
            _ = await cur.execute(query, (athlete_id, from_date, from_date, to_date, to_date))
            return [_row(row) for row in await cur.fetchall()]

    async def muscle_distribution(
        self, athlete_id: UUID, from_date: date | None, to_date: date | None
    ) -> list[dict[str, object]]:
        query = """
        SELECT el.category AS category, COUNT(*)::int AS set_count, SUM(ws.weight_kg * ws.reps)::float AS volume_kg
        FROM workout_sets ws JOIN workout_exercises we ON we.id = ws.workout_exercise_id
        JOIN exercise_library el ON el.id = we.exercise_id
        WHERE ws.athlete_id = %s AND ws.set_type = 'working' AND ws.completed = true
          AND (%s::date IS NULL OR ws.created_at::date >= %s::date)
          AND (%s::date IS NULL OR ws.created_at::date <= %s::date)
        GROUP BY el.category ORDER BY el.category
        """
        async with _connect() as conn, conn.cursor() as cur:
            _ = await cur.execute(query, (athlete_id, from_date, from_date, to_date, to_date))
            return [_row(row) for row in await cur.fetchall()]

    async def owns_workout_exercise(self, workout_exercise_id: int, athlete_id: UUID) -> bool:
        async with _connect() as conn, conn.cursor() as cur:
            _ = await cur.execute(
                "SELECT 1 FROM workout_exercises WHERE id = %s AND athlete_id = %s",
                (workout_exercise_id, athlete_id),
            )
            return await cur.fetchone() is not None

    async def _get_set(self, set_id: int, athlete_id: UUID) -> dict[str, object] | None:
        async with _connect() as conn, conn.cursor() as cur:
            _ = await cur.execute(
                f"SELECT {_SET_FIELDS} FROM workout_sets WHERE id = %s AND athlete_id = %s",
                (set_id, athlete_id),
            )
            row = await cur.fetchone()
            return _row(row) if row else None

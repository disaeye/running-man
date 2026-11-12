"""里程碑与训练阶段的仓库方法。"""

from __future__ import annotations

from uuid import UUID

from infrastructure.repositories.goals import GoalList, _connect, _row

_MILESTONE_FIELDS = """
milestone_id, goal_id, phase_id, title, target_date, target_value, unit, result_text,
achieved, achieved_at
"""
_PHASE_FIELDS = """
phase_id, goal_id, name, start_date, end_date, target_weekly_tss, target_weekly_distance_m
"""


class GoalMilestoneRepo:
    async def list_milestones(self, goal_id: UUID) -> GoalList:
        query = f"""
        SELECT {_MILESTONE_FIELDS} FROM milestones
        WHERE goal_id = %s ORDER BY target_date NULLS LAST
        """
        async with _connect() as conn, conn.cursor() as cur:
            _ = await cur.execute(query, (goal_id,))
            return [_row(row) for row in await cur.fetchall()]

    async def create_milestone(self, goal_id: UUID, data: dict[str, object]) -> dict[str, object]:
        query = f"""
        INSERT INTO milestones (
            goal_id, phase_id, title, target_date, target_value, unit, result_text,
            achieved, achieved_at
        )
        VALUES (%s, %s, %s, %s, %s, %s, %s, COALESCE(%s, false), %s)
        RETURNING {_MILESTONE_FIELDS}
        """
        values = (
            goal_id,
            data.get("phase_id"),
            data["title"],
            data.get("target_date"),
            data.get("target_value"),
            data.get("unit"),
            data.get("result_text"),
            data.get("achieved"),
            data.get("achieved_at"),
        )
        async with _connect() as conn, conn.cursor() as cur:
            _ = await cur.execute(query, values)
            row = await cur.fetchone()
        assert row is not None
        return _row(row)

    async def update_milestone(
        self, goal_id: UUID, milestone_id: UUID, data: dict[str, object]
    ) -> dict[str, object] | None:
        query = f"""
        UPDATE milestones SET title = COALESCE(%s::text, title),
        phase_id = CASE WHEN %s::boolean THEN %s::uuid ELSE phase_id END,
        target_date = COALESCE(%s::date, target_date),
        target_value = COALESCE(%s::double precision, target_value),
        unit = COALESCE(%s::text, unit), result_text = COALESCE(%s::text, result_text),
        achieved = COALESCE(%s::boolean, achieved),
        achieved_at = COALESCE(%s::timestamptz, achieved_at)
        WHERE goal_id = %s AND milestone_id = %s RETURNING {_MILESTONE_FIELDS}
        """
        values = (
            data.get("title"),
            "phase_id" in data,
            data.get("phase_id"),
            data.get("target_date"),
            data.get("target_value"),
            data.get("unit"),
            data.get("result_text"),
            data.get("achieved"),
            data.get("achieved_at"),
            goal_id,
            milestone_id,
        )
        async with _connect() as conn, conn.cursor() as cur:
            _ = await cur.execute(query, values)
            row = await cur.fetchone()
            return _row(row) if row else None

    async def list_training_phases(self, athlete_id: UUID, goal_id: UUID) -> GoalList:
        query = f"""
        SELECT {_PHASE_FIELDS} FROM training_phases
        WHERE athlete_id = %s AND goal_id = %s ORDER BY start_date
        """
        async with _connect() as conn, conn.cursor() as cur:
            _ = await cur.execute(query, (athlete_id, goal_id))
            return [_row(row) for row in await cur.fetchall()]

    async def create_training_phase(
        self, athlete_id: UUID, goal_id: UUID, data: dict[str, object]
    ) -> dict[str, object]:
        query = f"""
        INSERT INTO training_phases (
            athlete_id, goal_id, name, start_date, end_date, target_weekly_tss,
            target_weekly_distance_m
        ) VALUES (%s, %s, %s, %s, %s, %s, %s) RETURNING {_PHASE_FIELDS}
        """
        values = (
            athlete_id,
            goal_id,
            data["name"],
            data["start_date"],
            data["end_date"],
            data.get("target_weekly_tss"),
            data.get("target_weekly_distance_m"),
        )
        async with _connect() as conn, conn.cursor() as cur:
            _ = await cur.execute(query, values)
            row = await cur.fetchone()
        assert row is not None
        return _row(row)

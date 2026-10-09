from collections.abc import Mapping
from typing import cast
from uuid import UUID

from psycopg.types.json import Jsonb

from infrastructure.db.pool import ConnectionContext, get_pool


def _connect() -> ConnectionContext:
    return get_pool().connection()


def _row(row: object) -> dict[str, object]:
    return dict(cast(Mapping[str, object], row))


def _jsonb(value: object) -> Jsonb | None:
    return Jsonb(value) if value is not None else None


_FIELDS = """
template_id, athlete_id, name, sport::text AS sport, goal_type::text AS goal_type,
segments, predicted_tss, source::text AS source, created_at
"""


class WorkoutTemplateRepo:
    async def list_templates(
        self, athlete_id: UUID, sport: str | None = None, goal_type: str | None = None
    ) -> list[dict[str, object]]:
        query = f"""
        SELECT {_FIELDS} FROM workout_templates
        WHERE (source = 'builtin' OR (source = 'user' AND athlete_id = %s))
        AND (%s::varchar IS NULL OR sport = %s)
        AND (%s::varchar IS NULL OR goal_type = %s)
        ORDER BY source, goal_type NULLS LAST, created_at, name
        """
        values = (athlete_id, sport, sport, goal_type, goal_type)
        async with _connect() as conn, conn.cursor() as cur:
            _ = await cur.execute(query, values)
            return [_row(row) for row in await cur.fetchall()]

    async def create_template(self, athlete_id: UUID, data: dict[str, object]) -> dict[str, object]:
        query = f"""
        INSERT INTO workout_templates
        (athlete_id, name, sport, goal_type, segments, predicted_tss, source)
        VALUES (%s, %s, COALESCE(%s, 'Run'), %s, %s, %s, 'user')
        RETURNING {_FIELDS}
        """
        values = (
            athlete_id,
            data["name"],
            data.get("sport"),
            data.get("goal_type"),
            _jsonb(data.get("segments")),
            data.get("predicted_tss"),
        )
        async with _connect() as conn, conn.cursor() as cur:
            _ = await cur.execute(query, values)
            row = await cur.fetchone()
        assert row is not None
        return _row(row)

    async def update_template(
        self, athlete_id: UUID, template_id: UUID, data: dict[str, object]
    ) -> dict[str, object] | None:
        query = f"""
        UPDATE workout_templates SET
        name = COALESCE(%s::text, name), sport = COALESCE(%s::varchar, sport),
        goal_type = COALESCE(%s::varchar, goal_type), segments = COALESCE(%s::jsonb, segments),
        predicted_tss = COALESCE(%s::double precision, predicted_tss)
        WHERE athlete_id = %s AND template_id = %s AND source = 'user'
        RETURNING {_FIELDS}
        """
        values = (
            data.get("name"),
            data.get("sport"),
            data.get("goal_type"),
            _jsonb(data.get("segments")),
            data.get("predicted_tss"),
            athlete_id,
            template_id,
        )
        async with _connect() as conn, conn.cursor() as cur:
            _ = await cur.execute(query, values)
            row = await cur.fetchone()
            return _row(row) if row else None

    async def delete_template(self, athlete_id: UUID, template_id: UUID) -> bool:
        query = """
        DELETE FROM workout_templates
        WHERE athlete_id = %s AND template_id = %s AND source = 'user'
        """
        async with _connect() as conn, conn.cursor() as cur:
            _ = await cur.execute(query, (athlete_id, template_id))
            return cur.rowcount > 0

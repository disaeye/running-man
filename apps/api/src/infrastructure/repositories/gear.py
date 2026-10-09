from __future__ import annotations

from collections.abc import Mapping
from datetime import date
from typing import cast
from uuid import UUID

from infrastructure.db.pool import ConnectionContext, get_pool


def _connect() -> ConnectionContext:
    return get_pool().connection()


def _row(row: object) -> dict[str, object]:
    return dict(cast(Mapping[str, object], row))


_SHOE_FIELDS = """
id, athlete_id, name, brand, model, purchase_date, current_mileage_m,
retired_at, notes, created_at
"""

_RUN_SPORTS = ("Run", "TrailRun", "VirtualRun")


class GearRepo:
    async def list_shoes(self, athlete_id: UUID) -> list[dict[str, object]]:
        query = f"""
        SELECT {_SHOE_FIELDS}
        FROM gear_shoes
        WHERE athlete_id = %s
        ORDER BY retired_at NULLS FIRST, created_at DESC
        """
        async with _connect() as conn, conn.cursor() as cur:
            _ = await cur.execute(query, (athlete_id,))
            return [_row(row) for row in await cur.fetchall()]

    async def get_shoe(self, athlete_id: UUID, shoe_id: UUID) -> dict[str, object] | None:
        query = f"SELECT {_SHOE_FIELDS} FROM gear_shoes WHERE id = %s AND athlete_id = %s"
        async with _connect() as conn, conn.cursor() as cur:
            _ = await cur.execute(query, (shoe_id, athlete_id))
            row = await cur.fetchone()
            return _row(row) if row else None

    async def create_shoe(
        self,
        athlete_id: UUID,
        name: str,
        brand: str | None,
        model: str | None,
        purchase_date: date | None,
        notes: str | None,
    ) -> dict[str, object]:
        query = f"""
        INSERT INTO gear_shoes (athlete_id, name, brand, model, purchase_date, notes)
        VALUES (%s, %s, %s, %s, %s, %s)
        RETURNING {_SHOE_FIELDS}
        """
        values = (athlete_id, name, brand, model, purchase_date, notes)
        async with _connect() as conn, conn.cursor() as cur:
            _ = await cur.execute(query, values)
            row = await cur.fetchone()
        assert row is not None
        return _row(row)

    async def update_shoe(
        self, athlete_id: UUID, shoe_id: UUID, data: dict[str, object]
    ) -> dict[str, object] | None:
        query = f"""
        UPDATE gear_shoes SET
            name = COALESCE(%s, name), brand = COALESCE(%s, brand),
            model = COALESCE(%s, model), purchase_date = COALESCE(%s, purchase_date),
            notes = COALESCE(%s, notes)
        WHERE id = %s AND athlete_id = %s
        RETURNING {_SHOE_FIELDS}
        """
        values = (
            data.get("name"),
            data.get("brand"),
            data.get("model"),
            data.get("purchase_date"),
            data.get("notes"),
            shoe_id,
            athlete_id,
        )
        async with _connect() as conn, conn.cursor() as cur:
            _ = await cur.execute(query, values)
            row = await cur.fetchone()
            return _row(row) if row else None

    async def retire_shoe(self, athlete_id: UUID, shoe_id: UUID) -> bool:
        query = "UPDATE gear_shoes SET retired_at = NOW() WHERE id = %s AND athlete_id = %s"
        async with _connect() as conn, conn.cursor() as cur:
            _ = await cur.execute(query, (shoe_id, athlete_id))
            return cur.rowcount > 0

    async def assign_shoe(
        self, athlete_id: UUID, shoe_id: UUID, activity_id: str
    ) -> dict[str, object] | None:
        query = """
        INSERT INTO gear_assignments (activity_id, shoe_id)
        SELECT %s, %s
        WHERE EXISTS (
            SELECT 1 FROM gear_shoes
            WHERE id = %s AND athlete_id = %s AND retired_at IS NULL
        ) AND EXISTS (
            SELECT 1 FROM activity_compute
            WHERE activity_id = %s AND athlete_id = %s AND sport = ANY(%s)
        )
        RETURNING id, activity_id, shoe_id, assigned_at
        """
        values = (
            activity_id,
            shoe_id,
            shoe_id,
            athlete_id,
            activity_id,
            athlete_id,
            list(_RUN_SPORTS),
        )
        async with _connect() as conn, conn.cursor() as cur:
            _ = await cur.execute(query, values)
            row = await cur.fetchone()
            if row is not None:
                return _row(row)
            return None

    async def unassign_shoe(self, athlete_id: UUID, shoe_id: UUID, activity_id: str) -> bool:
        query = """
        DELETE FROM gear_assignments ga
        USING gear_shoes gs
        WHERE ga.shoe_id = gs.id AND gs.athlete_id = %s
          AND ga.shoe_id = %s AND ga.activity_id = %s
        """
        async with _connect() as conn, conn.cursor() as cur:
            _ = await cur.execute(query, (athlete_id, shoe_id, activity_id))
            return cur.rowcount > 0

    async def list_assignments(self, shoe_id: UUID) -> list[dict[str, object]]:
        query = """
        SELECT ga.id, ga.activity_id, ga.shoe_id, ga.assigned_at, a.distance_m, a.sport
        FROM gear_assignments ga
        LEFT JOIN activity_summary a ON a.activity_id = ga.activity_id
        WHERE ga.shoe_id = %s
        ORDER BY ga.assigned_at DESC
        """
        async with _connect() as conn, conn.cursor() as cur:
            _ = await cur.execute(query, (shoe_id,))
            return [_row(row) for row in await cur.fetchall()]

    async def compute_shoe_mileage(self, shoe_id: UUID) -> float:
        query = """
        SELECT COALESCE(SUM(a.distance_m), 0)::float AS mileage_m
        FROM gear_assignments ga
        JOIN activity_summary a ON a.activity_id = ga.activity_id
        WHERE ga.shoe_id = %s
        """
        async with _connect() as conn, conn.cursor() as cur:
            _ = await cur.execute(query, (shoe_id,))
            row = await cur.fetchone()
            value = row["mileage_m"] if row else 0.0
            return float(value) if isinstance(value, int | float | str) else 0.0

    async def get_activity(self, athlete_id: UUID, activity_id: str) -> dict[str, object] | None:
        query = """
        SELECT activity_id, athlete_id, sport, distance_m
        FROM activity_summary
        WHERE athlete_id = %s AND activity_id = %s
        LIMIT 1
        """
        async with _connect() as conn, conn.cursor() as cur:
            _ = await cur.execute(query, (athlete_id, activity_id))
            row = await cur.fetchone()
            return _row(row) if row else None

from collections.abc import Mapping
from typing import cast
from uuid import UUID

from infrastructure.db.pool import ConnectionContext, get_pool


def _connect() -> ConnectionContext:
    return get_pool().connection()


def _row(row: object) -> dict[str, object]:
    return dict(cast(Mapping[str, object], row))


async def list_overrides(athlete_id: UUID) -> list[dict[str, object]]:
    query = """
    SELECT metric, zone, min_pct, max_pct, updated_at
    FROM zone_overrides
    WHERE athlete_id = %s
    ORDER BY metric, zone
    """
    async with _connect() as conn, conn.cursor() as cur:
        _ = await cur.execute(query, (athlete_id,))
        return [_row(row) for row in await cur.fetchall()]


async def upsert_override(
    athlete_id: UUID, metric: str, zone: int, min_pct: float, max_pct: float
) -> dict[str, object]:
    query = """
    INSERT INTO zone_overrides (athlete_id, metric, zone, min_pct, max_pct)
    VALUES (%s, %s, %s, %s, %s)
    ON CONFLICT (athlete_id, metric, zone) DO UPDATE
    SET min_pct = EXCLUDED.min_pct, max_pct = EXCLUDED.max_pct, updated_at = now()
    RETURNING metric, zone, min_pct, max_pct, updated_at
    """
    async with _connect() as conn, conn.cursor() as cur:
        _ = await cur.execute(query, (athlete_id, metric, zone, min_pct, max_pct))
        row = await cur.fetchone()
    assert row is not None
    return _row(row)


async def delete_overrides(athlete_id: UUID) -> bool:
    query = "DELETE FROM zone_overrides WHERE athlete_id = %s"
    async with _connect() as conn, conn.cursor() as cur:
        _ = await cur.execute(query, (athlete_id,))
        return cur.rowcount > 0

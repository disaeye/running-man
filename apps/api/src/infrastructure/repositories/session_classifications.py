"""Read persisted session classifications for derived insight views."""

from __future__ import annotations

import json
from datetime import date
from uuid import UUID

from infrastructure.db.pool import ConnectionContext, get_pool


def _connect() -> ConnectionContext:
    return get_pool().connection()


async def classifications_for_range(
    athlete_id: UUID, start: date, end: date
) -> list[dict[str, object]]:
    """Five-object session results within an inclusive local-day range."""
    async with _connect() as conn, conn.cursor() as cur:
        await cur.execute(
            """
            SELECT activity_id, local_day, classification
            FROM session_classifications
            WHERE athlete_id = %s AND local_day BETWEEN %s AND %s
            ORDER BY local_day, activity_id
            """,
            (athlete_id, start, end),
        )
        rows = await cur.fetchall()
    result: list[dict[str, object]] = []
    for row in rows:
        payload = row["classification"]
        if isinstance(payload, str):
            value = json.loads(payload)
        elif isinstance(payload, dict):
            value = payload
        else:
            continue
        if not isinstance(value, dict):
            continue
        result.append(
            {
                **value,
                "activity_id": str(row["activity_id"]),
                "local_day": row["local_day"],
            }
        )
    return result

"""Attach a freshly compared five-object session result to a linked plan event."""

from __future__ import annotations

import json
from uuid import UUID

from application.run_classification.persistence import persist_classifications
from application.run_classification.service import classify_activities
from infrastructure.db.pool import get_pool, open_pool


async def link_plan_to_activity(athlete_id: UUID, event_id: str, activity_id: str) -> bool:
    """Link an event, classify against its prescription, and store the result.

    The link is written before classification so ``compare_quality`` sees the
    same ``training_calendar.workout_prescription`` the event will serve. All
    work shares one connection, keeping the link and its derived payloads in
    one transaction.
    """
    await open_pool()
    async with get_pool().connection() as conn:
        async with conn.cursor() as cur:
            await cur.execute(
                """
                UPDATE training_calendar
                SET linked_activity_id = %s
                WHERE athlete_id = %s AND event_id = %s AND status <> 'deleted'
                RETURNING event_id
                """,
                (activity_id, athlete_id, event_id),
            )
            linked = await cur.fetchone()
        if linked is None:
            return False
        results = await classify_activities(conn, athlete_id, activity_id)
        if not results:
            return False
        await persist_classifications(conn, athlete_id, results, linked_only=True)
        item = results[0]
        async with conn.cursor() as cur:
            await cur.execute(
                """
                UPDATE training_calendar
                SET done = true,
                    status = 'completed',
                    actual_logged_at = COALESCE(actual_logged_at, now()),
                    session_classification = %s::jsonb
                WHERE athlete_id = %s AND event_id = %s
                """,
                (json.dumps(item, ensure_ascii=True), athlete_id, event_id),
            )
        await conn.commit()
    return True

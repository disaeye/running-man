from __future__ import annotations

from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from psycopg import AsyncConnection
from psycopg.rows import DictRow

# Threshold constants to avoid magic values
LOW_READINESS_THRESHOLD = 40.0
LOW_TSB_THRESHOLD = -25.0
HIGH_READINESS_THRESHOLD = 85.0
HIGH_TSB_THRESHOLD = 15.0
FATIGUE_LOAD_FACTOR = 0.7
FRESHNESS_LOAD_FACTOR = 1.1


def adapt_plan_for_recovery(
    events: list[dict[str, Any]],
    readiness_score: float,
    current_tsb: float,
) -> tuple[list[dict[str, Any]], str]:
    """Calculate load factor and scaled TSS for upcoming events given current recovery status."""
    factor = 1.0
    reason = "Normal training load maintained."
    if readiness_score < LOW_READINESS_THRESHOLD or current_tsb < LOW_TSB_THRESHOLD:
        factor = FATIGUE_LOAD_FACTOR
        reason = (
            f"Fatigue detected (Readiness: {readiness_score:.1f}, TSB: {current_tsb:.1f}). "
            "Reduced upcoming load by 30%."
        )
    elif readiness_score > HIGH_READINESS_THRESHOLD and current_tsb > HIGH_TSB_THRESHOLD:
        factor = FRESHNESS_LOAD_FACTOR
        reason = (
            f"High freshness (Readiness: {readiness_score:.1f}, TSB: {current_tsb:.1f}). "
            "Slightly enhanced aerobic stimulus."
        )

    adjusted_events: list[dict[str, Any]] = []
    for ev in events:
        cloned = dict(ev)
        tss = cloned.get("predicted_tss")
        if tss is not None and isinstance(tss, (int, float)) and factor != 1.0:
            cloned["predicted_tss"] = round(float(tss) * factor, 1)
        adjusted_events.append(cloned)

    return adjusted_events, reason


async def adapt_athlete_calendar(
    conn: AsyncConnection[DictRow],
    athlete_id: UUID,
    readiness_score: float,
    current_tsb: float,
) -> tuple[int, str]:
    """Fetch uncompleted planned events for the athlete and adjust their TSS."""
    now = datetime.now(UTC)
    async with conn.cursor() as cur:
        _ = await cur.execute(
            """
            SELECT event_id, start_time, category, sport_type, name, predicted_tss, status, done
            FROM training_calendar
            WHERE athlete_id = %s AND start_time >= %s AND done = false AND status = 'planned'
            ORDER BY start_time ASC
            """,
            (athlete_id, now),
        )
        rows = await cur.fetchall()

    if not rows:
        return 0, "No pending future planned events found."

    events = [dict(row) for row in rows]
    adjusted, reason = adapt_plan_for_recovery(events, readiness_score, current_tsb)

    updated_count = 0
    async with conn.cursor() as cur:
        for ev in adjusted:
            _ = await cur.execute(
                """
                UPDATE training_calendar
                SET predicted_tss = %s
                WHERE event_id = %s AND athlete_id = %s
                """,
                (ev.get("predicted_tss"), ev["event_id"], athlete_id),
            )
            updated_count += 1

    return updated_count, reason

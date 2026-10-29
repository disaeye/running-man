"""Writing the device's training-effect pair onto an activity row.

A watch that computes a training effect writes it into the FIT ``session``
message. The values arrive with the FIT file during a sync, so they are
stored on the activity row and read back by the activity detail endpoint.

Only the device's own figures are stored. When the session frame carries no
training effect, nothing is written and the page shows "未记录".
"""

from __future__ import annotations

import psycopg

from domain.insights.training_effect import training_effects_from_session


def persist_training_effects(
    conn: psycopg.Connection,
    athlete_id: int | str,
    activity_id: str,
    session: dict[str, object] | None,
) -> bool:
    """Write the training effects of one activity. Returns whether it wrote.

    The write is skipped when the session frame carries no training effect:
    overwriting an existing value with NULL would erase a figure the device
    had reported for an earlier sync of the same activity.
    """
    aerobic, anaerobic = training_effects_from_session(session)
    if aerobic is None and anaerobic is None:
        return False
    with conn.cursor() as cur:
        _ = cur.execute(
            "UPDATE activity_summary SET aerobic_te = %s, anaerobic_te = %s "
            "WHERE athlete_id = %s AND activity_id = %s",
            (aerobic, anaerobic, athlete_id, activity_id),
        )
        return cur.rowcount > 0

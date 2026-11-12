"""Athlete profile reads and writes.

Threshold values (HRmax / resting HR / LTHR / threshold pace) are *not* here:
they live in ``athlete_thresholds`` so they can be time-versioned, and are read
through ``ThresholdRepo``. This repository owns only the stable profile fields
and the measured values used to supply a threshold the athlete has not recorded.
"""

from __future__ import annotations

from collections.abc import Mapping
from contextlib import nullcontext
from datetime import UTC, datetime, timedelta
from typing import cast
from uuid import UUID

from psycopg import AsyncConnection, sql
from psycopg.rows import DictRow

from infrastructure.db.pool import ConnectionContext, get_pool

ProfileConnection = AsyncConnection[DictRow]

_PROFILE_COLUMNS = (
    "name",
    "timezone",
    "dob",
    "sex",
    "weight_goal",
    "weekly_training_days",
    "max_session_duration_min",
    "preferred_sport",
    "height_cm",
)
# The profile columns are a fixed list, so the statement lists them verbatim
# instead of building the SQL by interpolation.
_PROFILE_COLUMNS_SQL = (
    "name, timezone, dob, sex, weight_goal, weekly_training_days, "
    "max_session_duration_min, preferred_sport, height_cm"
)
_PROFILE_QUERY = """
SELECT id, email, name, timezone, dob, sex, weight_goal, weekly_training_days,
       max_session_duration_min, preferred_sport, height_cm, notification_prefs
FROM athletes WHERE id = %s
"""


def _scope(conn: ProfileConnection | None) -> ConnectionContext:
    if conn is not None:
        return cast(ConnectionContext, nullcontext(conn))
    return get_pool().connection()


def _row(row: object) -> dict[str, object]:
    return dict(cast(Mapping[str, object], row))


def _fallback_upper_bounds() -> tuple[object, datetime]:
    now = datetime.now(UTC)
    return now.date() + timedelta(days=2), now + timedelta(days=1)


class AthleteProfileRepo:
    async def get(
        self, athlete_id: UUID, conn: ProfileConnection | None = None
    ) -> dict[str, object] | None:
        """Stable profile fields, read by primary key."""
        async with _scope(conn) as connection, connection.cursor() as cur:
            _ = await cur.execute(_PROFILE_QUERY, (athlete_id,))
            row = await cur.fetchone()
        return _row(row) if row else None

    async def measured_fallbacks(
        self,
        athlete_id: UUID,
        *,
        wellness: bool,
        observed_hr: bool,
        conn: ProfileConnection | None = None,
    ) -> tuple[dict[str, object] | None, dict[str, object] | None]:
        """Latest measured fallback and maximum observed HR, only when requested.

        Wellness rows arrive a column at a time, so each column is resolved from
        its own most recent non-null day. Taking every field from the newest row
        blanks any value that row happens not to carry. A recorded threshold makes
        the matching fallback useless; callers decide which branches are needed.
        """
        if not wellness and not observed_hr:
            return None, None
        day_upper, time_upper = _fallback_upper_bounds()
        wellness_row: dict[str, object] | None = None
        activity_row: dict[str, object] | None = None
        async with _scope(conn) as connection, connection.cursor() as cur:
            if wellness:
                _ = await cur.execute(
                    """
                    SELECT
                      (SELECT resting_hr FROM health_wellness
                       WHERE athlete_id = %s AND day <= %s
                         AND resting_hr IS NOT NULL
                       ORDER BY day DESC LIMIT 1) AS resting_hr,
                      (SELECT weight FROM health_wellness
                       WHERE athlete_id = %s AND day <= %s
                         AND weight IS NOT NULL
                       ORDER BY day DESC LIMIT 1) AS weight
                    """,
                    (athlete_id, day_upper, athlete_id, day_upper),
                )
                row = await cur.fetchone()
                wellness_row = _row(row) if row else None
            if observed_hr:
                _ = await cur.execute(
                    """
                    SELECT MAX(max_hr) AS hr_max FROM activity_summary
                    WHERE athlete_id = %s AND start_time < %s
                    """,
                    (athlete_id, time_upper),
                )
                row = await cur.fetchone()
                activity_row = _row(row) if row else None
        return wellness_row, activity_row

    async def update(
        self, athlete_id: UUID, values: Mapping[str, object]
    ) -> dict[str, object] | None:
        """Update only the columns present in ``values``.

        A partial update must not blank omitted columns: ``name`` is NOT NULL,
        so sending a payload that only carried ``dob`` used to fail with a
        constraint violation rather than leaving the name alone.
        """
        if not values:
            return None
        assignments = sql.SQL(", ").join(
            sql.SQL("{column} = %s").format(column=sql.Identifier(column)) for column in values
        )
        query = sql.SQL(
            """
            UPDATE athletes SET {assignments}
            WHERE id = %s
            RETURNING id, email, name, timezone, dob, sex, weight_goal,
                      weekly_training_days, max_session_duration_min,
                      preferred_sport, height_cm, notification_prefs
            """
        ).format(assignments=assignments)
        async with _scope(None) as connection, connection.cursor() as cur:
            _ = await cur.execute(query, (*values.values(), athlete_id))
            row = await cur.fetchone()
        return _row(row) if row else None

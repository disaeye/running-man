"""Athlete profile reads and writes.

Threshold values (HRmax / resting HR / LTHR / threshold pace) are *not* here:
they live in ``athlete_thresholds`` so they can be time-versioned, and are read
through ``ThresholdRepo``. This repository owns only the stable profile fields.
"""

from __future__ import annotations

from collections.abc import Mapping
from typing import cast
from uuid import UUID

from infrastructure.db.pool import ConnectionContext, get_pool

_PROFILE_COLUMNS = (
    "name",
    "timezone",
    "dob",
    "sex",
    "weight_goal",
    "weekly_training_days",
    "max_session_duration_min",
    "preferred_sport",
)
_PROFILE_COLUMNS_SQL = ", ".join(_PROFILE_COLUMNS)


def _connect() -> ConnectionContext:
    return get_pool().connection()


def _row(row: object) -> dict[str, object]:
    return dict(cast(Mapping[str, object], row))


class AthleteProfileRepo:
    async def get_me(
        self, athlete_id: UUID
    ) -> tuple[dict[str, object] | None, dict[str, object] | None, dict[str, object] | None]:
        """Profile row, latest wellness row, and latest activity HR summary.

        The second and third elements are fallbacks for thresholds the athlete
        has not entered: a measured resting HR from a wellness upload, or a
        maximum observed HR from an activity, both beat showing nothing.
        """
        profile_query = f"""
        SELECT id, email, name, timezone, {_PROFILE_COLUMNS_SQL}, notification_prefs
        FROM athletes WHERE id = %s
        """
        wellness_query = """
        SELECT resting_hr, weight FROM health_wellness
        WHERE athlete_id = %s ORDER BY day DESC LIMIT 1
        """
        activity_query = "SELECT MAX(max_hr) AS hr_max FROM activity_summary WHERE athlete_id = %s"
        async with _connect() as conn, conn.cursor() as cur:
            _ = await cur.execute(profile_query, (athlete_id,))
            profile = await cur.fetchone()
            _ = await cur.execute(wellness_query, (athlete_id,))
            wellness = await cur.fetchone()
            _ = await cur.execute(activity_query, (athlete_id,))
            activity = await cur.fetchone()
        return (
            _row(profile) if profile else None,
            _row(wellness) if wellness else None,
            _row(activity) if activity else None,
        )

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
        assignments = ", ".join(f"{column} = %s" for column in values)
        query = f"""
        UPDATE athletes SET {assignments}
        WHERE id = %s
        RETURNING id, email, name, timezone, {_PROFILE_COLUMNS_SQL}, notification_prefs
        """
        async with _connect() as conn, conn.cursor() as cur:
            _ = await cur.execute(query, (*values.values(), athlete_id))
            row = await cur.fetchone()
        return _row(row) if row else None

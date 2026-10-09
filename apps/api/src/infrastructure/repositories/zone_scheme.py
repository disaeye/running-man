"""The athlete's chosen heart rate zone scheme.

Stored separately from ``athlete_thresholds`` because it is a display
preference, not a measurement: it has no effective date and does not change how
past activities were executed. Thresholds answer "how hard was that?", the
scheme answers "which boundaries do we draw the answer with?".
"""

from __future__ import annotations

from typing import cast
from uuid import UUID

from domain.insights.zone_schemes import DEFAULT_SCHEME, HR_SCHEMES, SchemeKey
from infrastructure.db.pool import ConnectionContext, get_pool


def _connect() -> ConnectionContext:
    return get_pool().connection()


async def get_hr_scheme(athlete_id: UUID) -> SchemeKey:
    """The athlete's scheme, or the default when unset or unrecognised."""
    query = "SELECT hr_scheme FROM athlete_zone_scheme WHERE athlete_id = %s"
    async with _connect() as conn, conn.cursor() as cur:
        _ = await cur.execute(query, (athlete_id,))
        row = await cur.fetchone()
    if not row:
        return DEFAULT_SCHEME
    value = cast(dict[str, object], row).get("hr_scheme") if isinstance(row, dict) else row[0]
    return value if value in HR_SCHEMES else DEFAULT_SCHEME  # type: ignore[return-value]


async def set_hr_scheme(athlete_id: UUID, scheme: str) -> SchemeKey:
    if scheme not in HR_SCHEMES:
        raise ValueError(f"unknown zone scheme: {scheme}")
    query = """
    INSERT INTO athlete_zone_scheme (athlete_id, hr_scheme, updated_at)
    VALUES (%s, %s, now())
    ON CONFLICT (athlete_id) DO UPDATE
    SET hr_scheme = EXCLUDED.hr_scheme, updated_at = now()
    RETURNING hr_scheme
    """
    async with _connect() as conn, conn.cursor() as cur:
        _ = await cur.execute(query, (athlete_id, scheme))
        row = await cur.fetchone()
    assert row is not None
    value = cast(dict[str, object], row)["hr_scheme"] if isinstance(row, dict) else row[0]
    return value  # type: ignore[return-value]

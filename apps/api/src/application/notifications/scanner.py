from collections.abc import Mapping
from datetime import date, datetime
from typing import cast
from uuid import UUID

from application.notifications.rules import RULE_CHECKS, AsyncDbConnection
from domain.time import today_in_zone


async def scan_all_athletes(
    conn: AsyncDbConnection,
    target_day: date | None = None,
    now: datetime | None = None,
) -> dict[str, int]:
    """Run every notification rule for every athlete.

    ``now`` exists so a test can pin the instant. Without it the per-athlete day
    depends on the wall clock, and a test asserting that two zones resolve to
    different dates only holds for half of the day.
    """
    # The zone comes along with the id on purpose. Resolving "today" once for
    # the whole scan would hand every athlete the host's date, so a rule
    # addressed to that day reads the wrong facts for anyone not on UTC — and
    # its once-per-day guard would then fire on the wrong day too.
    async with conn.cursor() as cur:
        _ = await cur.execute("SELECT id, timezone FROM athletes ORDER BY id")
        rows = await cur.fetchall()

    scanned = 0
    generated = 0
    for row in rows:
        athlete_id = cast("UUID", row["id"])
        day = target_day or today_in_zone(_timezone_of(row), now)
        scanned += 1
        for check in RULE_CHECKS:
            result = await check(athlete_id, conn, day)
            if result is not None:
                generated += 1

    return {"athletes_scanned": scanned, "notifications_generated": generated}


def _timezone_of(row: Mapping[str, object]) -> str | None:
    value = row.get("timezone")
    return value if isinstance(value, str) else None

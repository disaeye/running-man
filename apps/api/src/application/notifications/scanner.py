from datetime import date
from typing import cast
from uuid import UUID

from application.notifications.rules import RULE_CHECKS, AsyncDbConnection


async def scan_all_athletes(
    conn: AsyncDbConnection, target_day: date | None = None
) -> dict[str, int]:
    async with conn.cursor() as cur:
        _ = await cur.execute("SELECT id FROM athletes ORDER BY id")
        rows = await cur.fetchall()

    scanned = 0
    generated = 0
    for row in rows:
        athlete_id = cast("UUID", row["id"])
        scanned += 1
        for check in RULE_CHECKS:
            result = await check(athlete_id, conn, target_day)
            if result is not None:
                generated += 1

    return {"athletes_scanned": scanned, "notifications_generated": generated}

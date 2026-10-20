"""Resolve the upstream athlete id a webhook carries to the athlete's row.

Intervals.icu addresses an athlete by its own account id (`i123456`), which is
not the UUID this system assigns. The mapping lives in
`user_integrations.credentials`, stored encrypted, so resolving it means
decrypting the connected rows.

A webhook for an id that matches nothing used to be written to
`webhook_events` anyway. `event_key` is that table's primary key, so one such
row permanently blocked the legitimate event of the same type, timestamp and
activity for every later delivery.
"""

from __future__ import annotations

from uuid import UUID

from domain.integrations.crypto import decrypt
from infrastructure.repositories.integrations import UserIntegrationRepo

SOURCE = "intervals_icu"


async def resolve_athlete(external_id: str) -> UUID | None:
    """The athlete whose stored credentials name `external_id`, or None."""
    for row in await UserIntegrationRepo().list_connected(SOURCE):
        credentials = _credentials(row)
        if credentials is None:
            continue
        if str(credentials.get("athlete_id") or "").strip() == external_id.strip():
            athlete_id = row.get("athlete_id")
            return athlete_id if isinstance(athlete_id, UUID) else None
    return None


def _credentials(row: dict[str, object]) -> dict[str, object] | None:
    raw = row.get("credentials")
    if isinstance(raw, dict):
        ciphertext = raw.get("ciphertext")
        if isinstance(ciphertext, str):
            return decrypt(ciphertext)
    return None

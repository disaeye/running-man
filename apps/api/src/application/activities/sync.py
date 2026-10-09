"""Webhook-driven activity sync use case.

Bridges the ``ACTIVITY_UPLOADED`` webhook event to the existing
``intervals.sync.sync_activities_incremental`` pipeline by looking up the
athlete's ``intervals_icu`` integration, decrypting credentials, and
delegating to the existing sync implementation.

Idempotency rests on the underlying ``activity_summary`` upsert, which
deduplicates rows by ``source_hash`` — so repeated webhook deliveries for
the same activity are no-ops at the data layer.
"""

from __future__ import annotations

from uuid import UUID

import anyio
from anyio.to_thread import run_sync as run_sync_in_worker_thread
from psycopg import Connection

from domain.integrations.crypto import decrypt
from infrastructure.db.pool import get_sync_pool
from infrastructure.integrations.intervals.client import IntervalsClient
from infrastructure.integrations.intervals.sync import (
    sync_activities_incremental as _run_window_sync,
)
from infrastructure.repositories.integrations import UserIntegrationRepo

_INTEGRATION_SOURCE = "intervals_icu"


async def sync_activities_incremental(athlete_id: str | None, activity_id: str | None) -> None:
    """Sync an athlete's recent intervals.icu activities.

    ``activity_id`` is currently unused — the underlying sync operates on a
    date window and dedupes via ``source_hash``. It is kept in the signature
    to satisfy :data:`application.webhooks.handler.SyncFn`.

    Returns silently when the athlete has no connected ``intervals_icu``
    integration or when ``athlete_id`` is missing / not a UUID, making this
    safe to call from webhook fan-out where any individual athlete may not
    be wired up.
    """
    _ = activity_id
    athlete_uuid = _parse_uuid(athlete_id)
    if athlete_uuid is None:
        return

    repo = UserIntegrationRepo()
    credentials = await _load_credentials(repo, athlete_uuid)
    if not credentials:
        return

    try:
        await run_sync_in_worker_thread(_sync_with_connection, athlete_uuid, credentials)
    except Exception as error:
        _ = await repo.update_sync_status(athlete_uuid, _INTEGRATION_SOURCE, "failed", str(error))
        raise
    _ = await repo.update_sync_status(athlete_uuid, _INTEGRATION_SOURCE, "success", None)


def _sync_with_connection(athlete_uuid: UUID, credentials: dict[str, object]) -> None:
    with get_sync_pool().connection() as conn:
        anyio.run(_sync_with_connection_async, athlete_uuid, credentials, conn)


async def _sync_with_connection_async(
    athlete_uuid: UUID, credentials: dict[str, object], conn: Connection
) -> None:
    try:
        async with IntervalsClient(
            api_key=str(credentials["api_key"]),
            athlete_id=str(credentials["athlete_id"]),
        ) as client:
            _ = await _run_window_sync(str(athlete_uuid), client, conn)
        conn.commit()
    except Exception:
        conn.rollback()
        raise


async def _load_credentials(
    repo: UserIntegrationRepo, athlete_uuid: UUID | None
) -> dict[str, object]:
    """Return decrypted intervals_icu credentials for the athlete, or ``{}``.

    An empty dict signals "not wired up" — the caller treats it as a no-op.
    """
    if athlete_uuid is None:
        return {}

    row = await repo.get(athlete_uuid, _INTEGRATION_SOURCE)
    connected = bool(row and row.get("connected"))
    stored = row.get("credentials") if row else None
    if not connected or not isinstance(stored, dict):
        return {}

    blob: object = stored.get("ciphertext")
    return decrypt(blob) if isinstance(blob, str) else {}


def _parse_uuid(value: str | None) -> UUID | None:
    if not value:
        return None
    try:
        return UUID(value)
    except ValueError:
        return None

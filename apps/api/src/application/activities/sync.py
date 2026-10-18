"""Webhook-driven activity sync use case.

Bridges the ``ACTIVITY_UPLOADED`` webhook event to the durable sync job the
manual button and the scheduler also use: look up the athlete's
``intervals_icu`` integration, decrypt credentials, queue a job and run it.

Idempotency rests on two layers: an active job makes the insert fail on the
partial unique index (so a burst of upload events cannot stack concurrent
syncs), and the underlying ``activity_summary`` upsert deduplicates rows by
``source_hash``.
"""

from __future__ import annotations

import logging
from uuid import UUID

import psycopg

from application.integrations.sync_jobs import create_sync_job, run_sync_job
from domain.integrations.crypto import decrypt
from infrastructure.repositories.integrations import UserIntegrationRepo

logger = logging.getLogger(__name__)

_INTEGRATION_SOURCE = "intervals_icu"


async def sync_activities_incremental(athlete_id: str | None, activity_id: str | None) -> None:
    """Sync an athlete's recent intervals.icu activities through the job path.

    ``activity_id`` is currently unused — the underlying sync operates on a
    date window and dedupes via ``source_hash``. It is kept in the signature
    to satisfy :data:`application.webhooks.handler.SyncFn`.

    Returns silently when the athlete has no connected ``intervals_icu``
    integration, when ``athlete_id`` is missing / not a UUID, or when another
    sync for the same athlete is already queued or running.
    """
    _ = activity_id
    athlete_uuid = _parse_uuid(athlete_id)
    if athlete_uuid is None:
        return

    credentials = await _load_credentials(athlete_uuid)
    if not credentials:
        return

    try:
        job = await create_sync_job(
            athlete_uuid, _INTEGRATION_SOURCE, "incremental", "webhook"
        )
    except psycopg.errors.UniqueViolation:
        logger.info("同步任务已在运行，跳过 webhook 触发 athlete=%s", athlete_uuid)
        return
    _ = await run_sync_job(
        UUID(str(job["id"])), athlete_uuid, _INTEGRATION_SOURCE, credentials
    )


async def _load_credentials(athlete_uuid: UUID) -> dict[str, object]:
    """Return decrypted intervals_icu credentials for the athlete, or ``{}``.

    An empty dict signals "not wired up" — the caller treats it as a no-op.
    """
    row = await UserIntegrationRepo().get(athlete_uuid, _INTEGRATION_SOURCE)
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

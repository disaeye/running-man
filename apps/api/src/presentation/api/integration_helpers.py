from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from typing import cast
from uuid import UUID

import anyio
from anyio.to_thread import run_sync as run_sync_in_worker_thread
from fastapi import HTTPException, status

from domain.integrations.crypto import decrypt
from infrastructure.db.pool import get_sync_pool
from infrastructure.integrations.intervals.client import IntervalsClient
from infrastructure.integrations.intervals.sync import sync_activities_incremental
from infrastructure.integrations.intervals.wellness_sync import sync_wellness
from presentation.api.integration_sync_detail import IntegrationSyncResult

_HTTP_BAD_REQUEST = 400


async def credentials(source: str, payload: object) -> dict[str, object]:
    athlete_id = getattr(payload, "athlete_id")
    api_key = getattr(payload, "api_key")
    if source != "intervals_icu":
        # Only Intervals.icu is supported: Strava was never used by any athlete
        # here and has been removed, so an unknown source is a client error
        # rather than an invitation to configure OAuth.
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="unsupported source"
        )
    if not athlete_id or not api_key:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="missing credentials"
        )
    return {"athlete_id": athlete_id.strip(), "api_key": api_key.strip()}


async def sync(
    source: str, athlete_id: UUID, credentials_data: dict[str, object]
) -> IntegrationSyncResult:
    if source != "intervals_icu":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="unsupported source"
        )
    return await sync_intervals_icu(athlete_id, credentials_data)

async def sync_intervals_icu(
    athlete_id: UUID, credentials_data: dict[str, object]
) -> IntegrationSyncResult:
    return await run_sync_in_worker_thread(
        _run_intervals_sync_in_thread,
        str(athlete_id),
        str(credentials_data["api_key"]),
        str(credentials_data["athlete_id"]),
    )


def decrypt_credentials(row: dict[str, object]) -> dict[str, object]:
    encrypted_credentials = row.get("credentials")
    if not isinstance(encrypted_credentials, dict):
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="credentials missing"
        )
    typed_credentials = cast(dict[str, object], encrypted_credentials)
    ciphertext = typed_credentials.get("ciphertext")
    if not isinstance(ciphertext, str):
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="credentials missing"
        )
    return decrypt(ciphertext)



def public_integration(
    row: dict[str, object], data_health: dict[str, object] | None = None
) -> dict[str, object]:
    data_as_of = activity_data_as_of(data_health)
    return {
        key: value
        for key, value in row.items()
        if key != "credentials"
    } | {"data_as_of": data_as_of, "staleness_bucket": staleness_bucket(data_as_of)}


def staleness_bucket(data_as_of: datetime | None) -> str:
    if data_as_of is None:
        return "missing"
    age = datetime.now(timezone.utc) - data_as_of
    if age < timedelta(hours=24):
        return "fresh"
    if age < timedelta(hours=72):
        return "stale"
    return "missing"


def activity_data_as_of(data_health: dict[str, object] | None) -> datetime | None:
    if data_health is None:
        return None
    activities = data_health.get("activities")
    if not isinstance(activities, dict):
        return None
    data_as_of = activities.get("data_as_of")
    return data_as_of if isinstance(data_as_of, datetime) else None


def _run_intervals_sync_in_thread(
    athlete_id: str, api_key: str, intervals_athlete_id: str
) -> IntegrationSyncResult:
    return anyio.run(_sync_intervals_with_client, athlete_id, api_key, intervals_athlete_id)


async def _sync_intervals_with_client(
    athlete_id: str, api_key: str, intervals_athlete_id: str
) -> IntegrationSyncResult:
    async with IntervalsClient(api_key=api_key, athlete_id=intervals_athlete_id) as client:
        with get_sync_pool().connection() as conn:
            try:
                result = await sync_activities_incremental(athlete_id, client, conn)
                oldest = (date.today() - timedelta(days=90)).isoformat()
                newest = date.today().isoformat()
                wellness_count = await sync_wellness(athlete_id, client, conn, oldest, newest)
                conn.commit()
            except Exception:
                conn.rollback()
                raise
    return IntegrationSyncResult(
        activity_stats=result.activity_stats,
        wellness_count=wellness_count,
        streams_inserted=result.stream_result.inserted,
        errors=tuple(
            {"activity_id": error.activity_id, "message": error.message}
            for error in result.stream_result.errors
        ),
    )

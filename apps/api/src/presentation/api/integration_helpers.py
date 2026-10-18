from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import cast

from fastapi import HTTPException, status

from domain.integrations.crypto import decrypt


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
    return {key: value for key, value in row.items() if key != "credentials"} | {
        "data_as_of": data_as_of,
        "staleness_bucket": staleness_bucket(data_as_of),
    }


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

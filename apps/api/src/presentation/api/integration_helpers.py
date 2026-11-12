from __future__ import annotations

from datetime import datetime, timezone
from typing import cast

from fastapi import HTTPException, status

from domain.integrations.crypto import decrypt
from presentation.api.staleness import staleness_bucket


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
    row: dict[str, object], data_as_of: datetime | None = None
) -> dict[str, object]:
    return {key: value for key, value in row.items() if key != "credentials"} | {
        "data_as_of": data_as_of,
        "staleness_bucket": staleness_bucket(data_as_of, datetime.now(timezone.utc).date()),
    }

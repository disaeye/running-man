"""Integration settings update endpoint."""

from __future__ import annotations

from typing import cast
from uuid import UUID

from fastapi import HTTPException, status

from infrastructure.repositories.integrations import UserIntegrationRepo
from presentation.api.integration_contracts import (
    IntegrationResponse,
    IntegrationSettingsUpdate,
)
from presentation.api.integration_helpers import public_integration


async def update_settings(
    source: str,
    payload: IntegrationSettingsUpdate,
    athlete_id: UUID,
    repo: UserIntegrationRepo,
) -> IntegrationResponse:
    row = await repo.get(athlete_id, source)
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="integration not found")
    raw_settings = row.get("settings")
    stored_settings = (
        cast(dict[str, object], raw_settings) if isinstance(raw_settings, dict) else {}
    )
    next_settings: dict[str, object] = stored_settings | payload.model_dump(exclude_none=True)
    updated = await repo.upsert(
        athlete_id,
        source,
        {
            "connected": row.get("connected", False),
            "credentials": row.get("credentials"),
            "settings": next_settings,
        },
    )
    return IntegrationResponse.model_validate(public_integration(updated))

"""Shared entry point for the four ACSM/ESSA domains in insight views."""

from __future__ import annotations

from datetime import date
from uuid import UUID

from infrastructure.repositories.session_classifications import (
    classifications_for_range as _classifications_for_range,
)

__all__ = ["classifications_for_range"]


async def classifications_for_range(
    athlete_id: UUID, start: date, end: date
) -> list[dict[str, object]]:
    return await _classifications_for_range(athlete_id, start, end)

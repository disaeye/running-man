from __future__ import annotations

from unittest.mock import AsyncMock, patch
from uuid import uuid4

import pytest
from httpx import ASGITransport, AsyncClient, Response

from infrastructure.auth.models import Athlete
from main import app
from presentation.auth.deps import get_current_athlete

ATHLETE = Athlete(uuid4(), "insights@example.com", "hash")


@pytest.mark.no_db
async def test_ability_returns_empty_series_when_no_projection_source_exists() -> None:
    _use_athlete()

    response = await _get("/api/v1/insights/ability")

    assert response.status_code == 200
    assert response.json() == []


@pytest.mark.no_db
async def test_zones_reports_missing_thresholds_instead_of_inventing_boundaries() -> None:
    """A scheme whose inputs are absent names them rather than fabricating zones.

    The HRmax scheme may fall back to an age estimate, so with no birth date on
    file there is nothing to derive from and the athlete should be told which
    field to fill in.
    """
    _use_athlete()
    with (
        patch(
            "presentation.api.zones.resolve_effective_thresholds",
            new=AsyncMock(return_value=_empty_thresholds()),
        ),
        patch(
            "presentation.api.zones.get_hr_scheme",
            new=AsyncMock(return_value="hrmax"),
        ),
        patch(
            "presentation.api.zones.list_overrides",
            new=AsyncMock(return_value=[]),
        ),
    ):
        response = await _get("/api/v1/insights/zones")

    assert response.status_code == 200
    body = response.json()
    assert body["hr_zones"] == []
    assert body["hr_scheme"] == "hrmax"
    assert "hr_max" in body["unavailable_requirements"]
    assert body["hr_max_estimated"] is False


def _empty_thresholds() -> object:
    from application.thresholds.effective import (
        EffectiveThreshold,
        EffectiveThresholds,
    )

    blank = EffectiveThreshold(value=None, source=None)
    return EffectiveThresholds(
        hr_max=blank, resting_hr=blank, lthr=blank, threshold_pace=blank
    )


def _use_athlete() -> None:
    app.dependency_overrides.clear()
    app.dependency_overrides[get_current_athlete] = lambda: ATHLETE


async def _get(path: str) -> Response:
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        return await client.get(path)

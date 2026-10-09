from __future__ import annotations

from collections.abc import Callable
from datetime import date
from uuid import UUID

import pytest

from application.recommendations import service

ATHLETE_ID = UUID("00000000-0000-0000-0000-000000000001")


@pytest.mark.no_db
async def test_recommendations_service_combines_readiness_load_and_calendar_inputs(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    target_day = date(2026, 7, 16)

    async def readiness_inputs(
        athlete_id: UUID, requested_day: date
    ) -> tuple[list[dict[str, object]], list[dict[str, object]]]:
        assert athlete_id == ATHLETE_ID
        assert requested_day == target_day
        return [], [{"day": target_day, "tsb": -24.0, "acwr": 1.6}]

    async def events_for_day(athlete_id: UUID, requested_day: date) -> list[dict[str, object]]:
        assert athlete_id == ATHLETE_ID
        assert requested_day == date(2026, 7, 17)
        return []

    monkeypatch.setattr(service, "readiness_inputs", readiness_inputs)
    monkeypatch.setattr(service, "events_for_day", events_for_day)
    monkeypatch.setattr(service, "_training_paces", _make_training_paces(None))

    recommendations = await service.recommendations_for_day(ATHLETE_ID, target_day)

    assert [item["type"] for item in recommendations] == ["rule_high_acwr", "rule_low_tsb", "rule_plan_ahead"]


def _make_training_paces(
    result: dict[str, dict[str, float]] | None,
) -> Callable:
    async def _tp(_athlete_id: UUID) -> dict[str, dict[str, float]] | None:
        return result
    return _tp

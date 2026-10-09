from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID

import pytest

from application.physiology import service
from infrastructure.repositories.physiology import PhysiologyRepo

ATHLETE_ID = UUID("00000000-0000-0000-0000-000000000001")


@pytest.mark.no_db
async def test_calculate_physiology_uses_metric_specific_windows(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    activity_windows: list[int] = []
    hr_windows: list[int] = []

    async def activities(
        _repository: PhysiologyRepo,
        athlete_id: UUID, start: datetime, end: datetime
    ) -> list[dict[str, object]]:
        assert athlete_id == ATHLETE_ID
        activity_windows.append((end - start).days)
        return [{"sport": "Run", "distance_m": 5000, "duration_s": 1500, "max_hr": 190}]

    async def heart_rate_window(
        _repository: PhysiologyRepo,
        athlete_id: UUID, start: datetime, end: datetime
    ) -> list[dict[str, object]]:
        assert athlete_id == ATHLETE_ID
        hr_windows.append((end - start).days)
        return [{"best_20min_hr": 180.0, "best_60min_hr": 175.0}]

    async def persist(*_args: object) -> None:
        return None

    monkeypatch.setattr(service.PhysiologyRepo, "activities", activities)
    monkeypatch.setattr(service.PhysiologyRepo, "heart_rate_window", heart_rate_window)
    monkeypatch.setattr(service, "persist_physiology_facts", persist)
    monkeypatch.setattr(service, "estimate_hrmax", lambda _values: {"hr_max": 190})
    monkeypatch.setattr(service, "estimate_lthr", lambda _a, _b: {"lthr": 176})
    monkeypatch.setattr(
        service, "estimate_threshold_pace", lambda _efforts: {"threshold_pace_s_per_km": 270}
    )

    result = await service.calculate_physiology(ATHLETE_ID, datetime(2026, 7, 16, tzinfo=UTC))

    assert activity_windows == [730, 365]
    assert hr_windows == [365]
    assert result.hr_max["hr_max"] == 190

from __future__ import annotations

from datetime import date, datetime
from uuid import UUID, uuid4

import pytest

from application.computation.runs import ComputationRunResult
from application.physiology import service
from application.physiology.facts import ComputationWindow, PhysiologyResults
from infrastructure.repositories.physiology import PhysiologyRepo

pytestmark = pytest.mark.no_db

ATHLETE_ID = UUID("00000000-0000-0000-0000-000000000001")


async def test_contract_window_routes_each_algorithm_to_owned_window(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    seen_activity_windows: list[int] = []
    seen_hr_windows: list[int] = []

    async def fetch_activities(_athlete_id: object, window: ComputationWindow) -> list[dict[str, object]]:
        seen_activity_windows.append((window.end - window.start).days)
        return [{"sport": "Run", "distance_m": 5000, "duration_s": 1500, "max_hr": 190}]

    async def fetch_hr(_athlete_id: object, window: ComputationWindow) -> list[dict[str, object]]:
        seen_hr_windows.append((window.end - window.start).days)
        return [{"best_20min_hr": 180.0, "best_60min_hr": 175.0}]

    async def persist(
        _athlete_id: UUID,
        _results: PhysiologyResults,
        _input_payload: object,
        _window: ComputationWindow,
        effective_from: date,
    ) -> dict[str, object]:
        assert effective_from == date(2026, 7, 15)
        return {"hr_max": 190}

    async def timezone(_repository: PhysiologyRepo, _athlete_id: UUID) -> str:
        return "UTC"

    async def earliest_activity_day(
        _repository: PhysiologyRepo, _athlete_id: UUID, _timezone: str
    ) -> date:
        return date(2026, 7, 15)

    async def earliest_step(_repository: object, _athlete_id: UUID) -> None:
        return None

    async def backfill(
        _repository: object, _athlete_id: UUID, _effective_from: date, _values: object
    ) -> int:
        return 0

    async def activities(
        _repository: PhysiologyRepo, athlete_id: UUID, window_start: datetime, window_end: datetime
    ) -> list[dict[str, object]]:
        return await fetch_activities(athlete_id, ComputationWindow(window_start, window_end))

    async def heart_rate_window(
        _repository: PhysiologyRepo, athlete_id: UUID, window_start: datetime, window_end: datetime
    ) -> list[dict[str, object]]:
        return await fetch_hr(athlete_id, ComputationWindow(window_start, window_end))

    monkeypatch.setattr(service.PhysiologyRepo, "activities", activities)
    monkeypatch.setattr(service.PhysiologyRepo, "heart_rate_window", heart_rate_window)
    monkeypatch.setattr(service.PhysiologyRepo, "timezone", timezone)
    monkeypatch.setattr(
        service.PhysiologyRepo, "earliest_activity_day", earliest_activity_day
    )
    monkeypatch.setattr(service.ThresholdRepo, "earliest", earliest_step)
    monkeypatch.setattr(service.ThresholdRepo, "backfill_earlier_gaps", backfill)
    monkeypatch.setattr(service, "persist_physiology_facts", persist)

    async def rebuild_load(_athlete_id: object, **_kwargs: object) -> ComputationRunResult:
        return ComputationRunResult(uuid4(), "success", 0)

    async def rebuild_pmc(_athlete_id: object, **_kwargs: object) -> object:
        return object()

    monkeypatch.setattr(service, "recompute_activity_load_facts", rebuild_load)
    monkeypatch.setattr(service, "recompute_pmc_facts", rebuild_pmc)
    monkeypatch.setattr(service, "estimate_hrmax", lambda _values: {"hr_max": 190})
    monkeypatch.setattr(service, "estimate_lthr", lambda _a, _b, _hr_max=None: {"lthr": 176})
    monkeypatch.setattr(
        service,
        "extract_efforts_from_activities",
        lambda *_args, **_kwargs: [],
    )
    monkeypatch.setattr(service, "vdot_from_efforts", lambda _efforts: 50.0)
    monkeypatch.setattr(
        service,
        "estimate_critical_speed",
        lambda _efforts: {
            "critical_speed_s_per_km": 268,
            "critical_speed_ms": 3.73,
            "confidence": "medium",
            "data_sufficient": True,
            "effort_count": 3,
        },
    )

    await service.calculate_physiology(ATHLETE_ID)

    assert seen_activity_windows == [730, 365]
    assert seen_hr_windows == [365]


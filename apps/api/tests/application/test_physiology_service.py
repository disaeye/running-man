from __future__ import annotations

from datetime import UTC, date, datetime
from typing import cast
from uuid import UUID, uuid4

import pytest

from application.computation.runs import ComputationRunResult
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

    persisted_windows: list[int] = []
    step_dates: list[date] = []

    async def persist(*args: object, **kwargs: object) -> dict[str, object]:
        persisted_windows.append(1)
        step_dates.append(kwargs["effective_from"])
        return {"hr_max": 190}

    backfilled: list[date] = []

    async def backfill(
        _repository: object, _athlete_id: UUID, effective_from: date, _values: object
    ) -> int:
        backfilled.append(effective_from)
        return 0

    async def timezone(_repository: PhysiologyRepo, _athlete_id: UUID) -> str:
        return "UTC"

    async def earliest_activity_day(
        _repository: PhysiologyRepo, _athlete_id: UUID, _timezone: str
    ) -> date:
        return date(2026, 6, 1)

    async def earliest_step(_repository: object, _athlete_id: UUID) -> None:
        return None

    monkeypatch.setattr(service.PhysiologyRepo, "activities", activities)
    monkeypatch.setattr(service.PhysiologyRepo, "heart_rate_window", heart_rate_window)
    monkeypatch.setattr(service.PhysiologyRepo, "timezone", timezone)
    monkeypatch.setattr(
        service.PhysiologyRepo, "earliest_activity_day", earliest_activity_day
    )
    monkeypatch.setattr(service.ThresholdRepo, "earliest", earliest_step)
    monkeypatch.setattr(service.ThresholdRepo, "backfill_earlier_gaps", backfill)
    monkeypatch.setattr(service, "persist_physiology_facts", persist)
    recomputed: list[str] = []

    async def rebuild_load(_athlete_id: object, **_kwargs: object) -> ComputationRunResult:
        recomputed.append("activity_load")
        return ComputationRunResult(uuid4(), "success", 0)

    async def rebuild_pmc(_athlete_id: object, **_kwargs: object) -> object:
        recomputed.append("pmc")
        return object()

    monkeypatch.setattr(service, "recompute_activity_load_facts", rebuild_load)
    monkeypatch.setattr(service, "recompute_pmc_facts", rebuild_pmc)
    monkeypatch.setattr(service, "estimate_hrmax", lambda _values: {"hr_max": 190})
    monkeypatch.setattr(service, "estimate_lthr", lambda _a, _b: {"lthr": 176})
    monkeypatch.setattr(
        service,
        "extract_efforts_from_activities",
        lambda *_args, **_kwargs: [],
    )
    monkeypatch.setattr(
        service,
        "vdot_from_efforts",
        lambda _efforts: 50.0,
    )
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

    result = await service.calculate_physiology(ATHLETE_ID, datetime(2026, 7, 16, tzinfo=UTC))

    assert activity_windows == [730, 365]
    assert hr_windows == [365]
    assert result.hr_max["hr_max"] == 190
    # No threshold row existed, so the first step is anchored on the earliest
    # activity and covers the whole history; the backfill still looks before
    # today for rows written by other paths.
    assert step_dates == [date(2026, 6, 1)]
    assert backfilled == [date(2026, 7, 16)]
    assert recomputed == ["activity_load", "pmc"]
    # Threshold pace is the VDOT (LT2) result, not the critical-speed asymptote.
    assert result.threshold_pace["threshold_pace_s_per_km"] == 255
    assert result.threshold_pace["critical_speed_s_per_km"] == 268
    assert result.threshold_pace["method"] == "daniels_vdot_threshold"


@pytest.mark.no_db
async def test_first_threshold_step_is_anchored_on_the_earliest_activity(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """An empty threshold table needs a row that reaches back, not one dated today."""
    monkeypatch.setattr(service.ThresholdRepo, "earliest", _no_step)

    effective = await service._threshold_step_date(
        ATHLETE_ID, _repo_with_first_day(date(2026, 3, 2)), "UTC", date(2026, 7, 16)
    )

    assert effective == date(2026, 3, 2)


@pytest.mark.no_db
async def test_an_activity_after_today_does_not_move_the_step_forward(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(service.ThresholdRepo, "earliest", _no_step)

    effective = await service._threshold_step_date(
        ATHLETE_ID, _repo_with_first_day(date(2026, 8, 1)), "UTC", date(2026, 7, 16)
    )

    assert effective == date(2026, 7, 16)


@pytest.mark.no_db
async def test_a_later_estimate_stays_on_today(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Once a step exists the table keeps its time-versioned shape."""

    async def has_step(_repository: object, _athlete_id: UUID) -> object:
        return object()

    monkeypatch.setattr(service.ThresholdRepo, "earliest", has_step)

    effective = await service._threshold_step_date(
        ATHLETE_ID, _repo_with_first_day(date(2026, 3, 2)), "UTC", date(2026, 7, 16)
    )

    assert effective == date(2026, 7, 16)


@pytest.mark.no_db
async def test_no_activity_still_stamps_today(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(service.ThresholdRepo, "earliest", _no_step)

    effective = await service._threshold_step_date(
        ATHLETE_ID, _repo_with_first_day(None), "UTC", date(2026, 7, 16)
    )

    assert effective == date(2026, 7, 16)


async def _no_step(_repository: object, _athlete_id: UUID) -> None:
    return None


def _repo_with_first_day(first_day: date | None) -> PhysiologyRepo:
    class _Repo:
        async def earliest_activity_day(self, _id: UUID, _timezone: str) -> date | None:
            return first_day

    return cast(PhysiologyRepo, _Repo())

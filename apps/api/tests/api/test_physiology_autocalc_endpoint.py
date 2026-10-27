"""The auto-calculate endpoint: one nested payload, and when it was computed."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import cast
from uuid import uuid4

import pytest

from application.computation.runs import ComputationRunResult
from domain.algorithms import algorithm_contract
from domain.generated.algorithms import Algorithm
from domain.physiology.threshold_pace import EffortPoint
from infrastructure.auth.models import Athlete
from main import app
from tests.api.physiology_endpoint_helpers import FakePool as _FakePool
from tests.api.physiology_endpoint_helpers import post as _post
from tests.api.physiology_endpoint_helpers import use_pool

ATHLETE = Athlete(uuid4(), "physiology@example.com", "hash")

PHYSIOLOGY_VERSION = algorithm_contract(Algorithm.PHYSIOLOGY).version


@pytest.fixture(autouse=True)
def _clean_overrides() -> None:
    app.dependency_overrides.clear()


@pytest.mark.no_db
async def test_post_auto_calculate_persists_results_without_changing_response(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Given computed physiology, When auto-calculate runs, Then values persist and response stays nested."""
    pool = _FakePool(rows=[[], [], []])
    persisted: list[tuple[object, object, object, object]] = []
    use_pool(monkeypatch, pool, ATHLETE)
    monkeypatch.setattr(
        "application.physiology.service.estimate_hrmax",
        lambda _values: {
            "hr_max": 195,
            "method": "tangent",
            "confidence": "high",
            "data_sufficient": True,
            "near_max_count": 1,
            "session_count": 1,
        },
    )
    monkeypatch.setattr(
        "application.physiology.service.estimate_lthr",
        lambda _best_20, _best_60, _hr_max=None: {
            "lthr": 175,
            "method": "best_effort_window",
            "confidence": "medium",
            "data_sufficient": True,
            "near_threshold_count": 1,
            "source_20min": 175,
            "source_60min": None,
        },
    )
    monkeypatch.setattr(
        "application.physiology.service.estimate_critical_speed",
        lambda _efforts: {
            "critical_speed_s_per_km": 268,
            "critical_speed_ms": 3.7,
            "method": "critical_speed_model",
            "confidence": "low",
            "data_sufficient": True,
            "effort_count": 4,
        },
    )
    monkeypatch.setattr(
        "application.physiology.service.vdot_from_efforts",
        lambda _efforts: 50.0,
    )
    # Three hard efforts: the threshold-pace estimate needs enough of them to
    # describe the athlete rather than one afternoon.
    monkeypatch.setattr(
        "application.physiology.service.extract_efforts_from_activities",
        lambda *_args, **_kwargs: [
            EffortPoint(5000.0, 1200.0),
            EffortPoint(10000.0, 2550.0),
            EffortPoint(21097.0, 5700.0),
        ],
    )

    async def persist(
        athlete_id: object,
        results: object,
        input_payload: object,
        window: object,
        effective_from: object,
    ) -> dict[str, object]:
        persisted.append((athlete_id, results, input_payload, window))
        return {"hr_max": 195}

    async def backfill(
        _repository: object, _athlete_id: object, _effective_from: object, _values: object
    ) -> int:
        return 0

    async def earliest_step(_repository: object, _athlete_id: object) -> None:
        return None

    async def earliest_activity_day(
        _repository: object, _athlete_id: object, _timezone: object
    ) -> None:
        return None

    monkeypatch.setattr(
        "infrastructure.repositories.thresholds.ThresholdRepo.backfill_earlier_gaps",
        backfill,
    )
    monkeypatch.setattr(
        "infrastructure.repositories.thresholds.ThresholdRepo.earliest", earliest_step
    )
    monkeypatch.setattr(
        "infrastructure.repositories.physiology.PhysiologyRepo.earliest_activity_day",
        earliest_activity_day,
    )
    monkeypatch.setattr("application.physiology.service.persist_physiology_facts", persist)

    computed_at = datetime(2026, 10, 22, 9, 41, tzinfo=UTC)

    async def cached(_repository: object, _athlete_id: object) -> dict[str, object]:
        return {
            "hr_max": 195,
            "lthr": 175,
            "threshold_pace": 270.0,
            "physiology_updated_at": computed_at,
            "physiology_algorithm_version": PHYSIOLOGY_VERSION,
            "physiology_computation_run_id": None,
        }

    monkeypatch.setattr("infrastructure.repositories.physiology.PhysiologyRepo.cached", cached)

    async def rebuild_load(_athlete_id: object, **_kwargs: object) -> ComputationRunResult:
        return ComputationRunResult(uuid4(), "success", 0)

    async def rebuild_pmc(_athlete_id: object, **_kwargs: object) -> object:
        return object()

    monkeypatch.setattr(
        "application.physiology.service.recompute_activity_load_facts", rebuild_load
    )
    monkeypatch.setattr("application.physiology.service.recompute_pmc_facts", rebuild_pmc)

    response = await _post("/api/v1/athletes/me/auto-calculate")

    assert response.status_code == 200
    assert response.json() == {
        "hr_max": {
            "hr_max": 195,
            "method": "tangent",
            "confidence": "high",
            "data_sufficient": True,
            "near_max_count": 1,
            "session_count": 1,
            "required_sessions": 5,
            "input_window_days": 730,
            "algorithm_version": PHYSIOLOGY_VERSION,
        },
        "lthr": {
            "lthr": 175,
            "method": "best_effort_window",
            "confidence": "medium",
            "data_sufficient": True,
            "near_threshold_count": 1,
            "source_20min": 175,
            "source_60min": None,
            "required_efforts": 5,
            "input_window_days": 365,
            "algorithm_version": PHYSIOLOGY_VERSION,
        },
        "threshold_pace": {
            "threshold_pace_s_per_km": 255,
            "critical_speed_ms": 3.7,
            "critical_speed_s_per_km": 268,
            "method": "daniels_vdot_threshold",
            "confidence": "low",
            "data_sufficient": True,
            "effort_count": 3,
            "required_efforts": 3,
            "input_window_days": 365,
            "algorithm_version": PHYSIOLOGY_VERSION,
        },
        "computed_at": "2026-10-22T09:41:00Z",
    }
    assert len(persisted) == 1
    assert persisted[0][0] == ATHLETE.id
    assert cast(object, persisted[0][1]) is not None

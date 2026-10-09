from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime
from uuid import UUID, uuid4

import pytest

from application.physiology import service
from application.physiology.facts import (
    ComputationWindow,
    PhysiologyResults,
    persist_physiology_facts,
)
from infrastructure.repositories.physiology import PhysiologyRepo

pytestmark = pytest.mark.no_db

ATHLETE_ID = UUID("00000000-0000-0000-0000-000000000001")


@dataclass(frozen=True, slots=True)
class _ExecutedQuery:
    query: str
    params: tuple[object, ...]


class _FakePool:
    def __init__(self, rows: list[dict[str, object]] | None = None) -> None:
        self.rows = rows or []
        self.executed: list[_ExecutedQuery] = []

    def connection(self) -> _ConnectionContext:
        return _ConnectionContext(_FakeConnection(self))


class _ConnectionContext:
    def __init__(self, conn: _FakeConnection) -> None:
        self.conn = conn

    async def __aenter__(self) -> _FakeConnection:
        return self.conn

    async def __aexit__(self, *_args: object) -> None:
        return None


class _FakeTransaction:
    async def __aenter__(self) -> None:
        return None

    async def __aexit__(self, *_args: object) -> None:
        return None


class _FakeConnection:
    def __init__(self, pool: _FakePool) -> None:
        self.pool = pool

    def cursor(self) -> _FakeCursor:
        return _FakeCursor(self.pool)

    def transaction(self) -> _FakeTransaction:
        return _FakeTransaction()


class _FakeCursor:
    def __init__(self, pool: _FakePool) -> None:
        self.pool = pool

    async def execute(self, query: str, params: tuple[object, ...]) -> None:
        self.pool.executed.append(_ExecutedQuery(query, params))

    async def fetchone(self) -> dict[str, object] | None:
        return self.pool.rows.pop(0) if self.pool.rows else {"id": uuid4()}


async def test_insufficient_data_writes_run_without_fabricated_facts(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    pool = _FakePool()
    monkeypatch.setattr("application.physiology.facts.get_pool", lambda: pool)

    await persist_physiology_facts(
        ATHLETE_ID,
        PhysiologyResults(
            hr_max={"hr_max": None, "method": None, "confidence": None},
            lthr={"lthr": None, "method": None, "confidence": None},
            threshold_pace={
                "threshold_pace_s_per_km": None,
                "method": None,
                "confidence": None,
            },
        ),
        {"empty": True},
        ComputationWindow(
            start=datetime(2024, 7, 15, tzinfo=UTC),
            end=datetime(2026, 7, 15, tzinfo=UTC),
        ),
    )

    queries = [row.query for row in pool.executed]
    assert sum("INSERT INTO computation_runs" in query for query in queries) == 1
    assert sum("INSERT INTO derived_metric_facts" in query for query in queries) == 0
    assert sum("UPDATE athletes" in query for query in queries) == 0
    assert pool.executed[-1].params[0] == 0


async def test_physiology_facts_store_units_methods_confidence_and_run_version(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    run_id = uuid4()
    pool = _FakePool(rows=[{"id": run_id}])
    monkeypatch.setattr("application.physiology.facts.get_pool", lambda: pool)

    await persist_physiology_facts(
        ATHLETE_ID,
        PhysiologyResults(
            hr_max={"hr_max": 195, "method": "tangent", "confidence": "high"},
            lthr={"lthr": 175, "method": "best_effort_window", "confidence": "medium"},
            threshold_pace={
                "threshold_pace_s_per_km": 270,
                "method": "critical_speed_model",
                "confidence": "low",
            },
        ),
        {"samples": [1, 2, 3]},
        ComputationWindow(
            start=datetime(2024, 7, 15, tzinfo=UTC),
            end=datetime(2026, 7, 15, tzinfo=UTC),
        ),
    )

    fact_params = [row.params for row in pool.executed if "INSERT INTO derived_metric_facts" in row.query]
    assert [(params[2], params[3], params[7], params[8], params[9]) for params in fact_params] == [
        ("hr_max", "bpm", run_id, "tangent", 0.9),
        ("lthr", "bpm", run_id, "best_effort_window", 0.6),
        ("threshold_pace", "s_km", run_id, "critical_speed_model", 0.3),
    ]
    assert all(params[6] == "1.0.0" for params in fact_params)

    # Thresholds are recorded as a dated step rather than written to columns on
    # `athletes` — those were removed when thresholds became time-versioned, so
    # the previous assertions on the final statement's parameters indexed into a
    # query shape that no longer exists.
    threshold_writes = [
        row for row in pool.executed if "INSERT INTO athlete_thresholds" in row.query
    ]
    assert len(threshold_writes) == 1
    params = threshold_writes[0].params
    assert params[0] == ATHLETE_ID
    assert params[-1] == "1.0.0"  # algorithm_version
    assert "source','estimated" not in threshold_writes[0].query  # sanity: literal in SQL
    assert "estimated" in threshold_writes[0].query

    # The run is still stamped on the athlete row.
    run_stamps = [row for row in pool.executed if "physiology_updated_at" in row.query]
    assert len(run_stamps) == 1
    assert run_id in run_stamps[0].params


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
    ) -> None:
        return None

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
    monkeypatch.setattr(service, "persist_physiology_facts", persist)
    monkeypatch.setattr(service, "estimate_hrmax", lambda _values: {"hr_max": 190})
    monkeypatch.setattr(service, "estimate_lthr", lambda _a, _b: {"lthr": 176})
    monkeypatch.setattr(
        service,
        "estimate_threshold_pace",
        lambda _efforts: {"threshold_pace_s_per_km": 270},
    )

    await service.calculate_physiology(ATHLETE_ID)

    assert seen_activity_windows == [730, 365]
    assert seen_hr_windows == [365]


from __future__ import annotations

from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import cast
from uuid import uuid4

import pytest
from httpx import ASGITransport, AsyncClient, Response

from infrastructure.auth.models import Athlete
from main import app
from presentation.auth.deps import get_current_athlete

ATHLETE = Athlete(uuid4(), "physiology@example.com", "hash")


@pytest.fixture(autouse=True)
def _clean_overrides() -> None:
    app.dependency_overrides.clear()


@pytest.mark.no_db
async def test_get_physiology_returns_cached_values_when_recent(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Given recent cached values, When physiology is requested, Then cached shape returns."""
    recent = datetime.now(UTC) - timedelta(hours=3)
    pool = _FakePool(
        rows=[
            {
                "hr_max": 195,
                "lthr": 175,
                "threshold_pace": 270.0,
                "physiology_updated_at": recent,
                "physiology_algorithm_version": "1.0.0",
                "physiology_computation_run_id": None,
            }
        ]
    )
    _use_pool(monkeypatch, pool)

    response = await _get("/api/v1/athletes/me/physiology")

    assert response.status_code == 200
    assert response.json() == {
        "hr_max": 195,
        "lthr": 175,
        "threshold_pace": 270.0,
        "data_sufficient": True,
        "confidence": "cached",
        "algorithm_version": "1.0.0",
        "computation_run_id": None,
        "freshness": "fresh",
        "source": "derived_metric_facts",
    }


@pytest.mark.no_db
async def test_get_physiology_returns_insufficient_when_timestamp_is_null(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Given null cache timestamp, When physiology is requested, Then stale shape returns."""
    pool = _FakePool(
        rows=[
            {
                "hr_max": 195,
                "lthr": 175,
                "threshold_pace": 270.0,
                "physiology_updated_at": None,
                "physiology_algorithm_version": None,
                "physiology_computation_run_id": None,
            }
        ]
    )
    _use_pool(monkeypatch, pool)

    response = await _get("/api/v1/athletes/me/physiology")

    assert response.status_code == 200
    assert response.json() == _STALE_RESPONSE


@pytest.mark.no_db
async def test_get_physiology_returns_insufficient_when_timestamp_is_old(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Given cache older than seven days, When physiology is requested, Then stale shape returns."""
    pool = _FakePool(
        rows=[
            {
                "hr_max": 195,
                "lthr": 175,
                "threshold_pace": 270.0,
                "physiology_updated_at": datetime.now(UTC) - timedelta(days=8),
                "physiology_algorithm_version": None,
                "physiology_computation_run_id": None,
            }
        ]
    )
    _use_pool(monkeypatch, pool)

    response = await _get("/api/v1/athletes/me/physiology")

    assert response.status_code == 200
    assert response.json() == _STALE_RESPONSE


@pytest.mark.no_db
async def test_post_auto_calculate_persists_results_without_changing_response(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Given computed physiology, When auto-calculate runs, Then values persist and response stays nested."""
    pool = _FakePool(rows=[[], [], []])
    persisted: list[tuple[object, object, object, object]] = []
    _use_pool(monkeypatch, pool)
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
        lambda _best_20, _best_60: {
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
        "application.physiology.service.estimate_threshold_pace",
        lambda _efforts: {
            "threshold_pace_s_per_km": 270,
            "critical_speed_ms": 3.7,
            "method": "critical_speed_model",
            "confidence": "low",
            "data_sufficient": True,
            "effort_count": 4,
        },
    )

    async def persist(
        athlete_id: object,
        results: object,
        input_payload: object,
        window: object,
    ) -> None:
        persisted.append((athlete_id, results, input_payload, window))

    monkeypatch.setattr("application.physiology.service.persist_physiology_facts", persist)

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
            "input_window_days": 730,
            "algorithm_version": "1.0.0",
        },
        "lthr": {
            "lthr": 175,
            "method": "best_effort_window",
            "confidence": "medium",
            "data_sufficient": True,
            "near_threshold_count": 1,
            "source_20min": 175,
            "source_60min": None,
            "input_window_days": 365,
            "algorithm_version": "1.0.0",
        },
        "threshold_pace": {
            "threshold_pace_s_per_km": 270,
            "critical_speed_ms": 3.7,
            "method": "critical_speed_model",
            "confidence": "low",
            "data_sufficient": True,
            "effort_count": 4,
            "input_window_days": 365,
            "algorithm_version": "1.0.0",
        },
    }
    assert len(persisted) == 1
    assert persisted[0][0] == ATHLETE.id
    assert cast(object, persisted[0][1]) is not None


_STALE_RESPONSE = {
    "hr_max": None,
    "lthr": None,
    "threshold_pace": None,
    "data_sufficient": False,
    "confidence": "stale",
    "algorithm_version": None,
    "computation_run_id": None,
    "freshness": "stale",
    "source": "derived_metric_facts",
}


@dataclass(frozen=True)
class _ExecutedQuery:
    query: str
    params: tuple[object, ...]


class _FakePool:
    def __init__(self, rows: Sequence[object]) -> None:
        self.rows = list(rows)
        self.executed: list[_ExecutedQuery] = []

    def connection(self) -> _ConnectionContext:
        return _ConnectionContext(_FakeConnection(self))


class _ConnectionContext:
    def __init__(self, conn: _FakeConnection) -> None:
        self.conn = conn

    async def __aenter__(self) -> _FakeConnection:
        return self.conn

    async def __aexit__(self, _exc_type: object, _exc: object, _tb: object) -> None:
        return None


class _FakeConnection:
    def __init__(self, pool: _FakePool) -> None:
        self.pool = pool

    def cursor(self) -> _FakeCursor:
        return _FakeCursor(self.pool)


class _FakeCursor:
    def __init__(self, pool: _FakePool) -> None:
        self.pool = pool

    async def execute(self, query: str, params: tuple[object, ...]) -> None:
        self.pool.executed.append(_ExecutedQuery(query, params))

    async def fetchone(self) -> Mapping[str, object] | None:
        if not self.pool.rows:
            return None
        row = self.pool.rows.pop(0)
        return row if isinstance(row, Mapping) else None

    async def fetchall(self) -> list[Mapping[str, object]]:
        if not self.pool.rows:
            return []
        row = self.pool.rows.pop(0)
        return list(row) if isinstance(row, list) else []


def _use_pool(monkeypatch: pytest.MonkeyPatch, pool: _FakePool) -> None:
    app.dependency_overrides[get_current_athlete] = lambda: ATHLETE
    monkeypatch.setattr("infrastructure.repositories.physiology.get_pool", lambda: pool)


async def _get(path: str) -> Response:
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        return await client.get(path)


async def _post(path: str) -> Response:
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        return await client.post(path)

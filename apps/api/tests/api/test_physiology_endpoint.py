"""GET /athletes/me/physiology: the cached estimate and when it was written."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from uuid import uuid4

import pytest

from domain.algorithms import algorithm_contract
from domain.generated.algorithms import Algorithm
from infrastructure.auth.models import Athlete
from main import app
from tests.api.physiology_endpoint_helpers import FakePool as _FakePool
from tests.api.physiology_endpoint_helpers import get as _get
from tests.api.physiology_endpoint_helpers import use_pool

ATHLETE = Athlete(uuid4(), "physiology@example.com", "hash")

# Read from the contract so a version bump does not turn a cache-hit fixture into
# a cache miss.
PHYSIOLOGY_VERSION = algorithm_contract(Algorithm.PHYSIOLOGY).version


def _use_pool(monkeypatch: pytest.MonkeyPatch, pool: _FakePool) -> None:
    use_pool(monkeypatch, pool, ATHLETE)


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
                "physiology_algorithm_version": PHYSIOLOGY_VERSION,
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
        "algorithm_version": PHYSIOLOGY_VERSION,
        "computation_run_id": None,
        "freshness": "fresh",
        "source": "derived_metric_facts",
        "computed_at": recent.isoformat().replace("+00:00", "Z"),
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
    """Given cache older than seven days, When physiology is requested, Then stale shape returns.

    The timestamp survives the staleness check: thresholds computed ten days ago
    are still in force, so the response must say when they were written instead
    of claiming nothing was ever estimated.
    """
    last_computed = datetime.now(UTC) - timedelta(days=8)
    pool = _FakePool(
        rows=[
            {
                "hr_max": 195,
                "lthr": 175,
                "threshold_pace": 270.0,
                "physiology_updated_at": last_computed,
                "physiology_algorithm_version": None,
                "physiology_computation_run_id": None,
            }
        ]
    )
    _use_pool(monkeypatch, pool)

    response = await _get("/api/v1/athletes/me/physiology")

    assert response.status_code == 200
    assert response.json() == {
        **_STALE_RESPONSE,
        "computed_at": last_computed.isoformat().replace("+00:00", "Z"),
    }


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
    "computed_at": None,
}

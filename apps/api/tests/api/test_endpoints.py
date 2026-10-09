from dataclasses import dataclass
from datetime import UTC, date, datetime
from uuid import UUID, uuid4

import pytest
from httpx import ASGITransport, AsyncClient, Response

from application.insights.service import ReadinessAssessment
from domain.insights.readiness import compute_readiness
from infrastructure.auth.models import Athlete
from main import app
from presentation.api.activities import get_activity_repo
from presentation.api.pmc import get_pmc_repo
from presentation.auth.deps import get_current_athlete

ATHLETE_A = Athlete(uuid4(), "a@example.com", "hash")
ATHLETE_B = Athlete(uuid4(), "b@example.com", "hash")


@pytest.mark.no_db
async def test_get_pmc() -> None:
    _use_athlete(ATHLETE_A)
    app.dependency_overrides[get_pmc_repo] = FakePmcRepo

    response = await _get("/api/v1/pmc?from=2026-01-01&to=2026-06-01")

    assert response.status_code == 200
    assert response.json() == [
        {
            "day": "2026-01-01",
            "ctl": 10.0,
            "atl": 12.0,
            "tsb": -2.0,
            "tss": 50.0,
            "acwr": None,
            # One day of history: CTL has not converged from its zero seed, so
            # the client is told not to quote the figure as a measurement.
            "ctl_warming_up": True,
            "mode": "authoritative_all_sports",
            "algorithm_version": "1.0.0",
        }
    ]


@pytest.mark.no_db
async def test_get_activities() -> None:
    _use_athlete(ATHLETE_A)
    app.dependency_overrides[get_activity_repo] = FakeActivityRepo

    response = await _get("/api/v1/activities?from=2026-01-01&to=2026-06-01")

    assert response.status_code == 200
    assert response.json()[0]["activity_id"] == "a-1"
    # The list carries has_gps so the "GPS only" filter can work. It used to be
    # absent from the list payload, which is why that filter keyed off a source
    # name that never occurs and always returned nothing.
    assert "has_gps" in response.json()[0]


@pytest.mark.no_db
async def test_get_activity_includes_capability_flags() -> None:
    _use_athlete(ATHLETE_A)
    app.dependency_overrides[get_activity_repo] = FakeActivityRepo

    response = await _get("/api/v1/activities/a-1")

    assert response.status_code == 200
    payload = response.json()
    assert payload["has_gps"] is True
    assert payload["has_hr"] is True
    assert payload["has_power"] is False
    assert payload["has_cadence"] is True


@pytest.mark.no_db
async def test_get_activity_serializes_false_capability_flags() -> None:
    _use_athlete(ATHLETE_A)
    app.dependency_overrides[get_activity_repo] = FakeActivityRepo

    response = await _get("/api/v1/activities/no-gps")

    assert response.status_code == 200
    payload = response.json()
    assert payload["has_gps"] is False
    assert payload["has_hr"] is False
    assert payload["has_power"] is False
    assert payload["has_cadence"] is False


@pytest.mark.no_db
async def test_get_activity_serializes_null_capability_flags_as_false() -> None:
    _use_athlete(ATHLETE_A)
    app.dependency_overrides[get_activity_repo] = FakeActivityRepo

    response = await _get("/api/v1/activities/null-flags")

    assert response.status_code == 200
    payload = response.json()
    assert payload["has_gps"] is False
    assert payload["has_hr"] is False
    assert payload["has_power"] is False
    assert payload["has_cadence"] is False


@pytest.mark.no_db
async def test_isolation() -> None:
    _use_athlete(ATHLETE_A)
    app.dependency_overrides[get_activity_repo] = FakeActivityRepo

    response = await _get("/api/v1/activities/b-1")

    assert response.status_code == 403


@pytest.mark.no_db
async def test_get_insights_readiness(monkeypatch: pytest.MonkeyPatch) -> None:
    _use_athlete(ATHLETE_A)
    monkeypatch.setattr(
        "application.insights.service.readiness_assessment", _fake_readiness_assessment
    )

    response = await _get("/api/v1/insights/readiness?date=2026-06-17")

    assert response.status_code == 200
    payload = response.json()
    assert set(payload) == {"local_readiness", "source_readiness"}
    assert 0 <= payload["local_readiness"]["score"] <= 100
    assert 1 <= len(payload["local_readiness"]["factors"]) <= 5
    assert payload["local_readiness"]["provenance"]["pmc_as_of"] == "2026-06-17"
    assert payload["source_readiness"] == {
        "score": 93,
        "source": "intervals_icu",
        "observed_on": "2026-06-17",
    }


@pytest.mark.no_db
async def test_get_insights_recommendation(monkeypatch: pytest.MonkeyPatch) -> None:
    _use_athlete(ATHLETE_A)
    monkeypatch.setattr(
        "application.insights.service.training_recommendation", _fake_training_recommendation
    )

    response = await _get("/api/v1/insights/recommendation?date=2026-06-17")

    assert response.status_code == 200
    payload = response.json()
    assert payload["action"] == "follow_plan"
    assert payload["workout_type"] == "Run"
    assert payload["next_workout"]["name"] == "Tempo"


async def _get(path: str) -> Response:
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        return await client.get(path)


def _use_athlete(athlete: Athlete) -> None:
    app.dependency_overrides.clear()
    app.dependency_overrides[get_current_athlete] = lambda: athlete


async def _fake_readiness_assessment(
    _athlete_id: UUID, target: date
) -> ReadinessAssessment:
    wellness: list[dict[str, object]] = [
        {"day": target, "sleep_secs": 28_800, "resting_hr": 50, "readiness": 93}
    ]
    loads: list[dict[str, object]] = [
        {"day": target, "ctl": 45.0, "atl": 35.0, "tsb": 10.0, "tss": 60.0}
    ]
    return ReadinessAssessment(
        wellness=wellness,
        loads=loads,
        readiness=compute_readiness(target, wellness, loads),
    )


async def _fake_training_recommendation(
    _athlete_id: UUID, _target: date
) -> dict[str, object]:
    return {
        "action": "follow_plan",
        "workout_type": "Run",
        "duration_min": 60,
        "target_tss": 65,
        "intensity": "moderate",
        "reason": "按计划完成训练",
        "risks": [],
        "next_workout": {"name": "Tempo", "sport_type": "Run", "predicted_tss": 65.0},
    }


@dataclass
class FakePmcRepo:
    async def get_daily_load_range(
        self, athlete_id: UUID, start: date, end: date
    ) -> list[dict[str, object]]:
        assert athlete_id == ATHLETE_A.id
        return [{"day": start, "ctl": 10.0, "atl": 12.0, "tsb": -2.0, "tss": 50.0}]


class FakeActivityRepo:
    async def list_by_range(
        self, athlete_id: UUID, _start: date, _end: date
    ) -> list[dict[str, object]]:
        assert athlete_id == ATHLETE_A.id
        return [_activity("a-1")]

    async def get_by_id(self, athlete_id: UUID, activity_id: str) -> dict[str, object] | None:
        if athlete_id == ATHLETE_A.id and activity_id == "a-1":
            gps_raw_data: dict[str, object] = {"latlng": [[31.1, 121.1]]}
            return _activity("a-1") | {
                "raw_data": gps_raw_data,
                "has_gps": True,
                "has_hr": True,
                "has_power": False,
                "has_cadence": True,
            }
        if athlete_id == ATHLETE_A.id and activity_id == "no-gps":
            empty_raw_data: dict[str, object] = {}
            return _activity("no-gps") | {
                "raw_data": empty_raw_data,
                "has_gps": False,
                "has_hr": False,
                "has_power": False,
                "has_cadence": False,
            }
        if athlete_id == ATHLETE_A.id and activity_id == "null-flags":
            null_raw_data: dict[str, object] = {}
            return _activity("null-flags") | {
                "raw_data": null_raw_data,
                "has_gps": None,
                "has_hr": None,
                "has_power": None,
                "has_cadence": None,
            }
        return None

    async def exists(self, activity_id: str) -> bool:
        return activity_id in {"a-1", "b-1", "no-gps", "null-flags"}

    async def get_streams(self, _athlete_id: UUID, _activity_id: str) -> list[dict[str, object]]:
        return []


def _activity(activity_id: str) -> dict[str, object]:
    return {
        "activity_id": activity_id,
        "start_time": datetime(2026, 1, 1, tzinfo=UTC),
        "sport": "run",
        "distance_m": 1000.0,
        "duration_s": 300,
        "avg_cadence": 85.0,
        "avg_speed": 3.5,
        "elevation_gain_m": 50.0,
        "calories": 300,
        "device_name": "Test Device",
    }

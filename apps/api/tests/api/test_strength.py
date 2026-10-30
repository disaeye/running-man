from dataclasses import dataclass, field
from datetime import UTC, date, datetime
from typing import cast
from uuid import UUID, uuid4

import pytest
from httpx import ASGITransport, AsyncClient, Response

from infrastructure.auth.models import Athlete
from main import app
from presentation.api.strength_dependencies import get_strength_repo
from presentation.auth.deps import get_current_athlete

ATHLETE = Athlete(uuid4(), "strength@example.com", "hash")


@pytest.mark.no_db
async def test_list_strength_exercises() -> None:
    _use_repo(FakeStrengthRepo())

    response = await _get("/api/v1/strength/exercises?query=深蹲")
    payload = cast(list[dict[str, object]], response.json())

    assert response.status_code == 200
    assert isinstance(payload, list)
    assert len(payload) == 1
    assert payload[0]["name_cn"] == "深蹲"

    all_response = await _get("/api/v1/strength/exercises")
    all_payload = cast(list[dict[str, object]], all_response.json())
    assert len(all_payload) == 20


@pytest.mark.no_db
async def test_list_strength_activities_includes_empty_and_logged_workouts() -> None:
    _use_repo(FakeStrengthRepo())

    response = await _get("/api/v1/strength/workouts")
    payload = cast(list[dict[str, object]], response.json())

    assert response.status_code == 200
    assert [item["has_training_content"] for item in payload] == [True, False]
    assert payload[0]["exercise_count"] == 2
    assert payload[1]["set_count"] == 0


@pytest.mark.no_db
async def test_strength_workout_set_flow() -> None:
    _use_repo(FakeStrengthRepo())

    workout = await _post("/api/v1/strength/workouts", {"date": "2026-06-22"})
    exercise = await _post(
        f"/api/v1/strength/workouts/{workout.json()['activity_id']}/exercises",
        {"exercise_id": 1},
    )
    set_response = await _post(
        f"/api/v1/strength/workout-exercises/{exercise.json()['id']}/sets",
        {"weight_kg": 100, "reps": 5, "rpe": 8},
    )

    assert workout.status_code == 201
    assert exercise.status_code == 201
    assert set_response.status_code == 201
    assert set_response.json()["estimated_1rm_kg"] == pytest.approx(116.67)

    incomplete_set = await _post(
        f"/api/v1/strength/workout-exercises/{exercise.json()['id']}/sets",
        {"weight_kg": None, "reps": 8, "rpe": 5},
    )
    assert incomplete_set.status_code == 422

    completion_response = await _put(
        f"/api/v1/strength/workout-exercises/{exercise.json()['id']}/sets/{set_response.json()['id']}",
        {"completed": False},
    )
    assert completion_response.status_code == 200
    assert completion_response.json()["completed"] is False


@pytest.mark.no_db
async def test_strength_set_validation() -> None:
    _use_repo(FakeStrengthRepo())

    response = await _post(
        "/api/v1/strength/workout-exercises/1/sets",
        {"weight_kg": 100, "reps": 0, "rpe": 8},
    )

    assert response.status_code == 422


async def _get(path: str) -> Response:
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        return await client.get(path)


async def _post(path: str, payload: dict[str, object]) -> Response:
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        return await client.post(path, json=payload)


async def _put(path: str, payload: dict[str, object]) -> Response:
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        return await client.put(path, json=payload)


def _use_repo(repo: "FakeStrengthRepo") -> None:
    app.dependency_overrides.clear()
    app.dependency_overrides[get_current_athlete] = lambda: ATHLETE
    app.dependency_overrides[get_strength_repo] = lambda: repo


@dataclass
class FakeStrengthRepo:
    sets: list[dict[str, object]] = field(default_factory=list)

    async def list_activities(
        self, athlete_id: UUID, from_date: date | None, to_date: date | None
    ) -> list[dict[str, object]]:
        assert athlete_id == ATHLETE.id
        assert from_date is None and to_date is None
        base = datetime(2026, 6, 22, tzinfo=UTC)
        return [
            {
                "activity_id": "strength-with-content",
                "start_time": base,
                "name": "力量训练",
                "duration_s": 3600,
                "has_training_content": True,
                "exercise_count": 2,
                "set_count": 4,
            },
            {
                "activity_id": "strength-empty",
                "start_time": base,
                "name": None,
                "duration_s": 1800,
                "has_training_content": False,
                "exercise_count": 0,
                "set_count": 0,
            },
        ]

    async def list_exercises(
        self, category: str | None = None, query: str | None = None
    ) -> list[dict[str, object]]:
        exercises = [_exercise(i) for i in range(1, 21)]
        if query:
            exercises = [item for item in exercises if query in str(item["name_cn"])] or exercises
        if category:
            exercises = [item for item in exercises if item["category"] == category]
        return exercises

    async def get_exercise(self, exercise_id: int) -> dict[str, object] | None:
        return _exercise(exercise_id)

    async def create_workout(self, athlete_id: UUID, day: date, name: str | None) -> str:
        assert athlete_id == ATHLETE.id
        assert day.isoformat() == "2026-06-22"
        assert name is None
        return "strength-1"

    async def add_exercise(
        self,
        activity_id: str,
        athlete_id: UUID,
        exercise_id: int,
        order_index: int | None,
        notes: str | None,
    ) -> dict[str, object]:
        assert athlete_id == ATHLETE.id
        return _workout_exercise(activity_id, exercise_id, notes, order_index)

    async def owns_workout_exercise(self, workout_exercise_id: int, athlete_id: UUID) -> bool:
        return workout_exercise_id == 1 and athlete_id == ATHLETE.id

    async def add_set(
        self,
        workout_exercise_id: int,
        athlete_id: UUID,
        weight_kg: float,
        reps: int,
        rpe: float | None,
        set_type: str | None,
        rest_seconds: int | None,
    ) -> dict[str, object]:
        assert athlete_id == ATHLETE.id
        estimated = round(weight_kg * (1 + reps / 30), 2) if 1 <= reps <= 10 else None
        row = _set(workout_exercise_id, weight_kg, reps, rpe, set_type, rest_seconds, estimated)
        row["id"] = len(self.sets) + 1
        self.sets.append(row)
        return row

    async def update_set(
        self, set_id: int, athlete_id: UUID, data: dict[str, object]
    ) -> dict[str, object] | None:
        assert athlete_id == ATHLETE.id
        row = next((item for item in self.sets if item["id"] == set_id), None)
        if row is not None and "completed" in data:
            row["completed"] = data["completed"]
        return row


def _exercise(exercise_id: int) -> dict[str, object]:
    return {
        "id": exercise_id,
        "name_cn": "深蹲" if exercise_id == 1 else f"动作{exercise_id}",
        "name_en": "Squat" if exercise_id == 1 else f"Exercise {exercise_id}",
        "category": "腿",
        "primary_muscles": ["股四头肌"],
    }


def _workout_exercise(
    activity_id: str, exercise_id: int, notes: str | None, order_index: int | None
) -> dict[str, object]:
    return {
        "id": 1,
        "activity_id": activity_id,
        "athlete_id": ATHLETE.id,
        "exercise_id": exercise_id,
        "order_index": order_index or 0,
        "notes": notes,
        "created_at": datetime(2026, 6, 22, tzinfo=UTC),
    }


def _set(
    workout_exercise_id: int,
    weight_kg: float,
    reps: int,
    rpe: float | None,
    set_type: str | None,
    rest_seconds: int | None,
    estimated: float | None,
    completed: bool = True,
) -> dict[str, object]:
    return {
        "id": 1,
        "workout_exercise_id": workout_exercise_id,
        "athlete_id": ATHLETE.id,
        "set_number": 1,
        "weight_kg": weight_kg,
        "reps": reps,
        "rpe": rpe,
        "set_type": set_type or "working",
        "rest_seconds": rest_seconds,
        "completed": completed,
        "estimated_1rm_kg": estimated,
        "created_at": datetime(2026, 6, 22, tzinfo=UTC),
    }

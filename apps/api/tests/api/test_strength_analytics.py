from dataclasses import dataclass, field
from datetime import UTC, date, datetime
from typing import cast
from uuid import UUID, uuid4

import pytest
from httpx import ASGITransport, AsyncClient, Response

from infrastructure.auth.models import Athlete
from main import app
from presentation.api.strength import get_strength_repo
from presentation.auth.deps import get_current_athlete

ATHLETE = Athlete(uuid4(), "strength-analytics@example.com", "hash")


@pytest.mark.no_db
async def test_strength_analytics_filters_completed_working_sets() -> None:
    _use_repo(FakeStrengthAnalyticsRepo())

    volume = await _get("/api/v1/strength/analytics/muscle-volume?from=2026-06-01&to=2026-06-30")
    e1rm = await _get("/api/v1/strength/analytics/e1rm?from=2026-06-01&to=2026-06-30")
    distribution = await _get("/api/v1/strength/analytics/distribution?from=2026-06-01&to=2026-06-30")

    assert volume.status_code == 200
    assert volume.json() == [{"muscle_group": "腿", "volume_kg": 1340.0}]
    assert e1rm.json() == [
        {"exercise_id": 1, "name_cn": "深蹲", "max_estimated_1rm_kg": 116.67, "date": "2026-06-22"}
    ]
    assert distribution.json() == [{"category": "腿", "set_count": 2, "volume_kg": 1340.0}]


@pytest.mark.no_db
async def test_strength_analytics_empty_data_returns_empty_arrays() -> None:
    _use_repo(FakeStrengthAnalyticsRepo(sets=[]))

    assert (await _get("/api/v1/strength/analytics/muscle-volume")).json() == []
    assert (await _get("/api/v1/strength/analytics/e1rm")).json() == []
    assert (await _get("/api/v1/strength/analytics/distribution")).json() == []


async def _get(path: str) -> Response:
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        return await client.get(path)


def _use_repo(repo: "FakeStrengthAnalyticsRepo") -> None:
    app.dependency_overrides.clear()
    app.dependency_overrides[get_current_athlete] = lambda: ATHLETE
    app.dependency_overrides[get_strength_repo] = lambda: repo


@dataclass
class FakeStrengthAnalyticsRepo:
    sets: list[dict[str, object]] = field(
        default_factory=lambda: [
            _set(1, "深蹲", "腿", 100, 5, "working", True, 116.67, "2026-06-22"),
            _set(1, "深蹲", "腿", 80, 5, "warmup", True, 93.33, "2026-06-22"),
            _set(1, "深蹲", "腿", 120, 3, "working", False, 132.0, "2026-06-22"),
            _set(1, "深蹲", "腿", 70, 12, "working", True, None, "2026-06-22"),
            _set(2, "卧推", "胸", 60, 5, "working", True, 70.0, "2026-05-22"),
        ]
    )

    async def muscle_volume(
        self, athlete_id: UUID, from_date: date | None, to_date: date | None
    ) -> list[dict[str, object]]:
        assert athlete_id == ATHLETE.id
        totals: dict[str, float] = {}
        for item in self._working_sets(from_date, to_date):
            totals[str(item["category"])] = totals.get(str(item["category"]), 0.0) + _volume(item)
        return [
            {"muscle_group": category, "volume_kg": volume}
            for category, volume in sorted(totals.items())
        ]

    async def e1rm_trend(
        self, athlete_id: UUID, from_date: date | None, to_date: date | None
    ) -> list[dict[str, object]]:
        assert athlete_id == ATHLETE.id
        best: dict[int, dict[str, object]] = {}
        for item in self._working_sets(from_date, to_date):
            if cast(int, item["reps"]) > 10 or item["estimated_1rm_kg"] is None:
                continue
            exercise_id = cast(int, item["exercise_id"])
            if exercise_id not in best or cast(float, item["estimated_1rm_kg"]) > cast(
                float, best[exercise_id]["max_estimated_1rm_kg"]
            ):
                best[exercise_id] = {
                    "exercise_id": exercise_id,
                    "name_cn": item["name_cn"],
                    "max_estimated_1rm_kg": item["estimated_1rm_kg"],
                    "date": cast(datetime, item["created_at"]).date(),
                }
        return [best[key] for key in sorted(best)]

    async def muscle_distribution(
        self, athlete_id: UUID, from_date: date | None, to_date: date | None
    ) -> list[dict[str, object]]:
        assert athlete_id == ATHLETE.id
        rows: dict[str, dict[str, object]] = {}
        for item in self._working_sets(from_date, to_date):
            category = str(item["category"])
            row = rows.setdefault(
                category, {"category": category, "set_count": 0, "volume_kg": 0.0}
            )
            row["set_count"] = cast(int, row["set_count"]) + 1
            row["volume_kg"] = cast(float, row["volume_kg"]) + _volume(item)
        return [rows[key] for key in sorted(rows)]

    def _working_sets(
        self, from_date: date | None, to_date: date | None
    ) -> list[dict[str, object]]:
        return [item for item in self.sets if _is_included(item, from_date, to_date)]


def _set(
    exercise_id: int,
    name_cn: str,
    category: str,
    weight: float,
    reps: int,
    set_type: str,
    completed: bool,
    e1rm: float | None,
    day: str,
) -> dict[str, object]:
    return {
        "exercise_id": exercise_id,
        "name_cn": name_cn,
        "category": category,
        "weight_kg": weight,
        "reps": reps,
        "set_type": set_type,
        "completed": completed,
        "estimated_1rm_kg": e1rm,
        "created_at": datetime.fromisoformat(day).replace(tzinfo=UTC),
    }


def _is_included(item: dict[str, object], from_date: date | None, to_date: date | None) -> bool:
    day = cast(datetime, item["created_at"]).date()
    return (
        item["set_type"] == "working"
        and item["completed"] is True
        and (from_date is None or day >= from_date)
        and (to_date is None or day <= to_date)
    )


def _volume(item: dict[str, object]) -> float:
    return cast(float, item["weight_kg"]) * cast(int, item["reps"])

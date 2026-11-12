"""调整闭环：缩放修复、检测端点返回、自动检测、计划版本。"""

from __future__ import annotations

from collections.abc import AsyncIterator, Iterator
from datetime import UTC, datetime, timedelta
from typing import Any
from uuid import UUID, uuid4

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient

from application.plan.adjustment_pipeline import maybe_detect_adjustments
from infrastructure.db.pool import get_pool
from infrastructure.repositories.plan_adjustments import PlanAdjustmentRepo
from main import app
from presentation.api.plan_adjustment_rules import scaled_prescription
from presentation.auth.deps import get_current_athlete

pytestmark = [pytest.mark.asyncio(loop_scope="session"), pytest.mark.no_db]


def _prescription() -> dict[str, object]:
    return {
        "type": "long",
        "duration_min": 90,
        "pace_min_s_km": 340,
        "pace_max_s_km": 390,
        "segments": [
            {
                "type": "long",
                "role": "work",
                "duration_min": 90.0,
                "duration_s": 5400.0,
                "distance_m": 15000.0,
                "pace_min_s_km": 340,
                "pace_max_s_km": 390,
                "quality_target": {"work_distance_m": 15000.0, "work_duration_s": 5400.0},
            },
        ],
        "quality_target": {"work_distance_m": 15000.0, "work_duration_s": 5400.0},
    }


def test_scaled_prescription_shrinks_float_segments_and_recomputes() -> None:
    scaled = scaled_prescription(_prescription(), 20.0)

    assert scaled is not None
    assert scaled["duration_min"] == pytest.approx(72.0)
    raw_segments = scaled["segments"]
    assert isinstance(raw_segments, list) and isinstance(raw_segments[0], dict)
    segment = raw_segments[0]
    # 分段的 duration_min 是 float（round(x, 2) 的产物），必须同样被缩减。
    assert segment["duration_min"] == pytest.approx(72.0)
    assert segment["duration_s"] == pytest.approx(4320.0)
    assert segment["distance_m"] == pytest.approx(12000.0)
    assert scaled["predicted_distance_m"] == pytest.approx(12000.0)
    quality = scaled["quality_target"]
    assert isinstance(quality, dict)
    assert quality["work_distance_m"] == pytest.approx(12000.0)
    assert quality["work_duration_s"] == pytest.approx(4320.0)


def test_scaled_prescription_keeps_pace_targets() -> None:
    scaled = scaled_prescription(_prescription(), 30.0)

    assert scaled is not None
    assert scaled["pace_min_s_km"] == 340
    assert scaled["pace_max_s_km"] == 390


@pytest.fixture
def _athlete_overrides() -> Iterator[None]:
    athlete_id = uuid4()
    app.dependency_overrides[get_current_athlete] = lambda: _fake_athlete(athlete_id)
    yield
    app.dependency_overrides.pop(get_current_athlete, None)


def _fake_athlete(athlete_id: UUID) -> Any:
    from infrastructure.auth.models import Athlete

    return Athlete(athlete_id, f"adj-{athlete_id}@example.test", "hash", timezone="UTC")


@pytest_asyncio.fixture(loop_scope="session")
async def seeded() -> AsyncIterator[dict[str, object]]:
    """一名运动员：HRV 下降 + 未来一节跑步课 + 一次长距离心率漂移。"""
    athlete_id = uuid4()
    today = datetime.now(UTC).date()
    async with get_pool().connection() as conn, conn.cursor() as cur:
        await cur.execute(
            "INSERT INTO athletes (id, email, password_hash, timezone) "
            "VALUES (%s, %s, 'hash', 'UTC')",
            (athlete_id, f"adj-{athlete_id}@example.test"),
        )
        # 七日基线（60ms × 6 天）+ 今日 50ms：均值 58.6，降幅 14.7% 过阈值。
        for offset in range(1, 7):
            await cur.execute(
                "INSERT INTO health_wellness (athlete_id, day, hrv) VALUES (%s, %s, 60)",
                (athlete_id, today - timedelta(days=offset)),
            )
        await cur.execute(
            "INSERT INTO health_wellness (athlete_id, day, hrv) VALUES (%s, %s, 50)",
            (athlete_id, today),
        )
        await cur.execute(
            "INSERT INTO training_calendar (event_id, athlete_id, start_time, category, "
            "status, done, training_type, workout_prescription) "
            "VALUES (%s, %s, %s, 'workout', 'planned', false, 'long', %s::jsonb)",
            (
                f"adj-test-{athlete_id}",
                athlete_id,
                datetime.now(UTC) + timedelta(hours=24),
                __import__("json").dumps(_prescription(), ensure_ascii=True),
            ),
        )
    yield {"athlete_id": athlete_id, "event_id": f"adj-test-{athlete_id}"}
    async with get_pool().connection() as conn, conn.cursor() as cur:
        await cur.execute("DELETE FROM athletes WHERE id = %s", (athlete_id,))


async def test_maybe_detect_creates_pending_proposal(
    seeded: dict[str, object],
) -> None:
    athlete_id = cast_uuid(seeded["athlete_id"])
    created = await maybe_detect_adjustments(athlete_id)

    assert created == 1
    repo = PlanAdjustmentRepo()
    pending = await repo.latest_pending_for_event(athlete_id, str(seeded["event_id"]))
    assert pending is not None
    assert "hrv_drop" in str(pending["trigger_type"])
    adjusted = pending["adjusted_prescription"]
    assert isinstance(adjusted, dict)
    segment = adjusted["segments"][0]
    assert isinstance(segment, dict)
    assert segment["duration_min"] == pytest.approx(81.0)


async def test_maybe_detect_is_idempotent_per_event(
    seeded: dict[str, object],
) -> None:
    athlete_id = cast_uuid(seeded["athlete_id"])
    await maybe_detect_adjustments(athlete_id)
    created_again = await maybe_detect_adjustments(athlete_id)

    assert created_again == 0


async def test_detect_endpoint_returns_not_found_for_unknown_event(
    seeded: dict[str, object],
    _athlete_overrides: None,
) -> None:
    """不存在的课：404，不再是 200 状态码的异常。"""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/api/v1/plan/adjustments/detect",
            json={"event_id": "no-such-event"},
        )
    assert response.status_code == 404


def cast_uuid(value: object) -> UUID:
    assert isinstance(value, UUID)
    return value

"""目标进度引擎：单位换算、窗口、方向判定、里程碑自动核验。"""

from __future__ import annotations

from collections.abc import AsyncIterator
from datetime import UTC, date, datetime, timedelta
from typing import Any
from uuid import UUID, uuid4

import pytest
import pytest_asyncio

from application.goals.milestone_check import check_phase_milestones
from application.goals.progress import refresh_goal_progress
from infrastructure.db.pool import get_pool

pytestmark = [pytest.mark.asyncio(loop_scope="session"), pytest.mark.no_db]


class _Case:
    def __init__(self, athlete_id: UUID, day: date) -> None:
        self.athlete_id = athlete_id
        self.day = day


@pytest_asyncio.fixture(loop_scope="session")
async def case() -> AsyncIterator[_Case]:
    """每个测试独占一名运动员，结束时连同数据一起清理。"""
    athlete_id = uuid4()
    async with get_pool().connection() as conn, conn.cursor() as cur:
        await cur.execute(
            "INSERT INTO athletes (id, email, password_hash) VALUES (%s, %s, 'hash')",
            (athlete_id, f"progress-{athlete_id}@example.test"),
        )
    yield _Case(athlete_id, datetime.now(UTC).date())
    await _cleanup(athlete_id)


async def test_distance_goal_converts_meters_to_km(case: _Case) -> None:
    await _seed_goal(case, {"type": "distance", "unit": "km", "target_value": 50})
    await _seed_activity(case, "run", 30_000, 3600, case.day)
    await _seed_activity(case, "run", 21_000, 2500, case.day)
    goal = await _refresh(case)
    assert goal["current_value"] == pytest.approx(51.0)
    assert goal["status"] == "achieved"


async def test_distance_goal_in_meters_keeps_raw_unit(case: _Case) -> None:
    await _seed_goal(case, {"type": "distance", "unit": "m", "target_value": 50_000})
    await _seed_activity(case, "run", 30_000, 3600, case.day)
    goal = await _refresh(case)
    assert goal["current_value"] == pytest.approx(30_000.0)
    assert goal["status"] == "active"


async def test_time_goal_converts_seconds_to_minutes(case: _Case) -> None:
    await _seed_goal(case, {"type": "time", "unit": "min", "target_value": 120})
    await _seed_activity(case, "run", 10_000, 3600, case.day)
    await _seed_activity(case, "run", 10_000, 1800, case.day)
    goal = await _refresh(case)
    assert goal["current_value"] == pytest.approx(90.0)
    assert goal["status"] == "active"


async def test_consistency_goal_counts_distinct_local_days(case: _Case) -> None:
    await _seed_goal(case, {"type": "consistency", "unit": "天", "target_value": 3})
    await _seed_activity(case, "run", 5_000, 1800, case.day)
    await _seed_activity(case, "run", 5_000, 1800, case.day)
    await _seed_activity(case, "run", 5_000, 1800, case.day - timedelta(days=1))
    goal = await _refresh(case)
    assert goal["current_value"] == 2.0


async def test_sport_family_filter_excludes_other_sports(case: _Case) -> None:
    await _seed_goal(case, {"type": "distance", "unit": "km", "target_value": 50})
    await _seed_activity(case, "ride", 100_000, 7200, case.day)
    await _seed_activity(case, "run", 10_000, 1800, case.day)
    goal = await _refresh(case)
    assert goal["current_value"] == pytest.approx(10.0)


async def test_window_respects_start_date_and_open_end(case: _Case) -> None:
    """没有目标日期时窗口到今天，起算日之前的活动不计入。"""
    await _seed_goal(
        case,
        {
            "type": "distance",
            "unit": "km",
            "target_value": 100,
            "start_date": case.day - timedelta(days=2),
            "target_date": None,
        },
    )
    await _seed_activity(case, "run", 30_000, 3600, case.day - timedelta(days=10))
    await _seed_activity(case, "run", 25_000, 3000, case.day - timedelta(days=1))
    goal = await _refresh(case)
    assert goal["current_value"] == pytest.approx(25.0)


async def test_weight_goal_reads_latest_record_and_closes_on_target(case: _Case) -> None:
    await _seed_goal(
        case,
        {
            "type": "weight",
            "unit": "kg",
            "target_value": 68.0,
            "baseline_value": 75.0,
            "direction": "decrease",
        },
    )
    await _seed_weight(case, case.day - timedelta(days=3), 70.2)
    await _seed_weight(case, case.day - timedelta(days=1), 67.4)
    goal = await _refresh(case)
    assert goal["current_value"] == pytest.approx(67.4)
    assert goal["status"] == "achieved"


async def test_weight_goal_without_records_keeps_current_value(case: _Case) -> None:
    goal_id = await _seed_goal(
        case,
        {
            "type": "weight",
            "unit": "kg",
            "target_value": 68.0,
            "baseline_value": 75.0,
            "direction": "decrease",
            "current_value": 73.0,
        },
    )
    async with get_pool().connection() as conn:
        goal = await refresh_goal_progress(case.athlete_id, goal_id, conn)
    assert goal["current_value"] == pytest.approx(73.0)
    assert goal["status"] == "active"


async def test_phase_milestone_auto_check_achieves_on_distance(case: _Case) -> None:
    goal_id = await _seed_goal(case, {"type": "event", "target_value": None})
    start = case.day - timedelta(days=28)
    end = case.day - timedelta(days=1)
    async with get_pool().connection() as conn, conn.cursor() as cur:
        await cur.execute(
            "INSERT INTO training_phases (athlete_id, goal_id, name, start_date, end_date) "
            "VALUES (%s, %s, 'base', %s, %s) RETURNING phase_id",
            (case.athlete_id, goal_id, start, end),
        )
        phase_id = (await cur.fetchone())["phase_id"]
        await cur.execute(
            "INSERT INTO milestones (goal_id, phase_id, title, target_value, unit) "
            "VALUES (%s, %s, '阶段跑量', %s, 'km') RETURNING milestone_id",
            (goal_id, phase_id, 40),
        )
        milestone_id = (await cur.fetchone())["milestone_id"]
    await _seed_activity(case, "run", 30_000, 3600, case.day - timedelta(days=14))
    await _seed_activity(case, "run", 15_000, 1800, case.day - timedelta(days=7))
    async with get_pool().connection() as conn:
        await check_phase_milestones(conn, case.athlete_id)
    async with get_pool().connection() as conn, conn.cursor() as cur:
        await cur.execute(
            "SELECT achieved FROM milestones WHERE milestone_id = %s", (milestone_id,)
        )
        assert (await cur.fetchone())["achieved"] is True


def _activity_time(day: date) -> datetime:
    return datetime(day.year, day.month, day.day, 6, tzinfo=UTC)


async def _seed_activity(
    case: _Case, sport: str, distance_m: int, duration_s: int, day: date
) -> None:
    async with get_pool().connection() as conn, conn.cursor() as cur:
        await cur.execute(
            "INSERT INTO activity_summary (athlete_id, activity_id, start_time, sport, "
            "distance_m, duration_s) VALUES (%s, %s, %s, %s, %s, %s)",
            (case.athlete_id, str(uuid4()), _activity_time(day), sport, distance_m, duration_s),
        )


async def _seed_weight(case: _Case, day: date, weight_kg: float) -> None:
    async with get_pool().connection() as conn, conn.cursor() as cur:
        await cur.execute(
            "INSERT INTO health_wellness (athlete_id, day, weight) VALUES (%s, %s, %s)",
            (case.athlete_id, day, weight_kg),
        )


async def _seed_goal(case: _Case, overrides: dict[str, object]) -> UUID:
    data: dict[str, object] = {
        "type": "distance",
        "title": "进度测试",
        "target_value": 100,
        "unit": "km",
        "sport_key": "run",
        "start_date": case.day - timedelta(days=30),
        "target_date": case.day + timedelta(days=30),
    }
    data.update(overrides)
    async with get_pool().connection() as conn, conn.cursor() as cur:
        await cur.execute(
            "INSERT INTO goals (athlete_id, type, title, target_value, current_value, unit, "
            "direction, start_date, sport_key, baseline_value, target_date, status) "
            "VALUES (%s, %s, %s, %s, COALESCE(%s, 0), %s, "
            "CASE WHEN %s = 'weight' THEN 'decrease' ELSE 'increase' END, "
            "%s, %s, %s, %s, 'active') RETURNING goal_id",
            (
                case.athlete_id,
                data["type"],
                data["title"],
                data["target_value"],
                data.get("current_value"),
                data["unit"],
                data["type"],
                data["start_date"],
                data["sport_key"],
                data.get("baseline_value"),
                data.get("target_date"),
            ),
        )
        return (await cur.fetchone())["goal_id"]


async def _refresh(case: _Case) -> dict[str, Any]:
    async with get_pool().connection() as conn, conn.cursor() as cur:
        await cur.execute(
            "SELECT goal_id FROM goals WHERE athlete_id = %s ORDER BY created_at",
            (case.athlete_id,),
        )
        goal_id = (await cur.fetchone())["goal_id"]
        goal = await refresh_goal_progress(case.athlete_id, goal_id, conn)
    return goal


async def _cleanup(athlete_id: UUID) -> None:
    async with get_pool().connection() as conn, conn.cursor() as cur:
        await cur.execute("DELETE FROM athletes WHERE id = %s", (athlete_id,))

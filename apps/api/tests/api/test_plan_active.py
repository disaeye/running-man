"""HTTP-level tests for ``/api/plan/active``.

Covers: a plan with phases and a scheduled week, an athlete with no plan at
all, and the case where the goal has a race target so the pace table can be
derived from it.
"""

from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from uuid import UUID, uuid4

import pytest
from httpx import ASGITransport, AsyncClient, Response

from domain.time import today_in_zone
from infrastructure.auth.models import Athlete
from infrastructure.db.pool import get_pool
from main import app
from presentation.auth.deps import get_current_athlete

pytestmark = [pytest.mark.asyncio(loop_scope="session"), pytest.mark.no_db]

# 端点用的是运动员自己的「今天」，所以测试的日期也按今天算，不能写死一个
# 已经过去的日期——那样查出来的这一周是空的。
TARGET_DAY = today_in_zone("UTC")


async def test_active_plan_reports_phases_and_the_week() -> None:
    """A generated plan yields its phases, this week's sessions and the pace table."""
    athlete = Athlete(uuid4(), "plan-active@example.com", "hash")
    _override_auth(athlete)
    try:
        await _seed_athlete(athlete.id)
        goal_id = await _seed_goal(athlete.id, TARGET_DAY + timedelta(days=60))
        await _seed_phase(
            athlete.id,
            goal_id,
            TARGET_DAY - timedelta(days=7),
            TARGET_DAY + timedelta(days=56),
        )
        await _seed_session(athlete.id, TARGET_DAY, "长距离跑", 24.0, 21000.0)

        response = await _get("/api/v1/plan/active")
        assert response.status_code == 200
        body = response.json()

        assert body["goal_id"] == str(goal_id)
        assert body["current_phase"] is not None
        assert body["current_phase"]["is_current"] is True
        assert len(body["week_sessions"]) == 1
        assert body["week_sessions"][0]["predicted_distance_m"] == 21000.0
        assert body["week_planned_tss"] == 24.0
        # 比赛目标算出的 VDOT：半马 1 小时 45 分。
        assert body["vdot"] is not None
        assert body["vdot"] > 40
        # 五个训练配速区间。
        assert {pace["key"] for pace in body["training_paces"]} == {
            "easy",
            "marathon",
            "threshold",
            "interval",
            "repetition",
        }
    finally:
        await _cleanup(athlete.id)


async def test_active_plan_without_a_goal_is_empty_not_an_error() -> None:
    """An athlete who never created a goal gets an empty plan, not an error."""
    athlete = Athlete(uuid4(), "plan-empty@example.com", "hash")
    _override_auth(athlete)
    try:
        await _seed_athlete(athlete.id)

        response = await _get("/api/v1/plan/active")
        assert response.status_code == 200
        body = response.json()

        assert body["goal_id"] is None
        assert body["phases"] == []
        assert body["week_sessions"] == []
        assert body["vdot"] is None
    finally:
        await _cleanup(athlete.id)


async def test_active_plan_reports_missing_distance_as_null() -> None:
    """A session without a distance target reports null, never a zero."""
    athlete = Athlete(uuid4(), "plan-nodistance@example.com", "hash")
    _override_auth(athlete)
    try:
        await _seed_athlete(athlete.id)
        goal_id = await _seed_goal(athlete.id, TARGET_DAY + timedelta(days=60))
        await _seed_phase(
            athlete.id,
            goal_id,
            TARGET_DAY - timedelta(days=7),
            TARGET_DAY + timedelta(days=56),
        )
        await _seed_session(athlete.id, TARGET_DAY, "轻松跑", 40.0, None)

        response = await _get("/api/v1/plan/active")
        assert response.status_code == 200
        body = response.json()

        assert body["week_sessions"][0]["predicted_distance_m"] is None
        assert body["week_planned_distance_m"] == 0.0
    finally:
        await _cleanup(athlete.id)


async def test_active_plan_prefers_threshold_pace_over_goal_target() -> None:
    """Recorded threshold pace takes priority over goal race target for VDOT & paces."""
    athlete = Athlete(uuid4(), "plan-threshold@example.com", "hash")
    _override_auth(athlete)
    try:
        await _seed_athlete(athlete.id)
        # Goal target ~1:45 half (VDOT ~42), while recorded threshold pace 4:00/km -> VDOT > 50.
        await _seed_goal(athlete.id, TARGET_DAY + timedelta(days=60))
        async with get_pool().connection() as conn, conn.cursor() as cur:
            await cur.execute(
                "INSERT INTO athlete_thresholds (athlete_id, effective_from, threshold_pace) "
                "VALUES (%s, %s, %s)",
                (athlete.id, TARGET_DAY - timedelta(days=1), 240.0),
            )

        response = await _get("/api/v1/plan/active")
        assert response.status_code == 200
        body = response.json()

        assert body["vdot"] is not None
        assert body["vdot"] > 50
    finally:
        await _cleanup(athlete.id)


# ---------------------------------------------------------------------------
# helpers
# ---------------------------------------------------------------------------


def _override_auth(athlete: Athlete) -> None:
    app.dependency_overrides.clear()
    app.dependency_overrides[get_current_athlete] = lambda: athlete


async def _get(path: str) -> Response:
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        return await client.get(path)


async def _seed_athlete(athlete_id: UUID) -> None:
    async with get_pool().connection() as conn, conn.cursor() as cur:
        await cur.execute(
            "INSERT INTO athletes (id, email, password_hash) VALUES (%s, %s, 'hash')",
            (athlete_id, f"{athlete_id}@example.com"),
        )


async def _seed_goal(athlete_id: UUID, target_date: date) -> UUID:
    goal_id = uuid4()
    async with get_pool().connection() as conn, conn.cursor() as cur:
        await cur.execute(
            "INSERT INTO goals (goal_id, athlete_id, type, title, target_date,"
            " race_distance_m, race_target_time_s, status, created_at) "
            "VALUES (%s, %s, 'event', '半马破 105', %s, %s, %s, 'active', %s)",
            (
                goal_id,
                athlete_id,
                target_date,
                21097.0,
                6300,
                datetime(target_date.year, target_date.month, target_date.day, tzinfo=timezone.utc),
            ),
        )
    return goal_id


async def _seed_phase(athlete_id: UUID, goal_id: UUID, start: date, end: date) -> None:
    async with get_pool().connection() as conn, conn.cursor() as cur:
        await cur.execute(
            "INSERT INTO training_phases (athlete_id, goal_id, name, start_date, end_date,"
            " target_weekly_tss) VALUES (%s, %s, 'build', %s, %s, %s)",
            (athlete_id, goal_id, start, end, 320.0),
        )


async def _seed_session(
    athlete_id: UUID,
    day: date,
    name: str,
    predicted_tss: float,
    predicted_distance_m: float | None,
) -> None:
    start = datetime(day.year, day.month, day.day, 8, 0, tzinfo=timezone.utc)
    async with get_pool().connection() as conn, conn.cursor() as cur:
        await cur.execute(
            "INSERT INTO training_calendar (event_id, athlete_id, start_time, category,"
            " sport_type, name, predicted_tss, predicted_distance_m, status, done,"
            " training_type, workout_prescription) "
            "VALUES (%s, %s, %s, 'workout', 'Run', %s, %s, %s, 'planned', false,"
            " 'long', %s::jsonb)",
            (
                str(uuid4()),
                athlete_id,
                start,
                name,
                predicted_tss,
                predicted_distance_m,
                '{"version": 1, "type": "long", "duration_min": 120,'
                ' "pace_min_s_km": 290, "pace_max_s_km": 320, "segments": []}',
            ),
        )


async def _cleanup(athlete_id: UUID) -> None:
    async with get_pool().connection() as conn, conn.cursor() as cur:
        await cur.execute("DELETE FROM athletes WHERE id = %s", (athlete_id,))

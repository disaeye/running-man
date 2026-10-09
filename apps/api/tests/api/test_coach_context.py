"""HTTP-level tests for ``/api/insights/coach-context``.

Covers full payload with seeded data, empty athlete (graceful nulls),
and missing-data caveats (sparse wellness yields HRV caveat).
"""

from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from uuid import UUID, uuid4

import pytest
from httpx import ASGITransport, AsyncClient, Response

from infrastructure.auth.models import Athlete
from infrastructure.db.pool import get_pool
from infrastructure.repositories.pmc import PmcRepo
from main import app
from presentation.api.coach_context import (
    get_coach_pmc_repo,
)
from presentation.auth.deps import get_current_athlete

pytestmark = [pytest.mark.asyncio(loop_scope="session"), pytest.mark.no_db]

TARGET_DAY = date(2026, 6, 29)


class _DirectPmcRepo(PmcRepo):
    def __init__(self, loads: list[dict[str, object]]) -> None:
        self._loads = loads

    async def get_daily_load_range(
        self, athlete_id: UUID, start: date, end: date
    ) -> list[dict[str, object]]:
        return [row for row in self._loads if start <= row["day"] <= end]


TARGET_DAY = date(2026, 6, 29)


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


async def test_coach_context_full_payload() -> None:
    """GET /insights/coach-context with complete seeded data returns all
    sections non-null with reasonable computed values."""
    athlete = Athlete(uuid4(), "cc-full@example.com", "hash")
    _override_auth(athlete)
    try:
        await _seed_athlete(athlete.id)
        _override_auth(athlete, _pmc_loads(days=90))
        await _seed_wellness(athlete.id, days=7)
        await _seed_planned_event(athlete.id, TARGET_DAY)
        await _seed_activity(athlete.id, TARGET_DAY - timedelta(days=1))

        response = await _get(f"/api/v1/insights/coach-context?date={TARGET_DAY.isoformat()}")
        assert response.status_code == 200
        body = response.json()

        assert set(body.keys()) == {
            "data_freshness",
            "recent_load",
            "recovery_signals",
            "plan_adherence",
            "missing_data_caveats",
            "recommendation",
            "readiness",
        }

        assert "activities" in body["data_freshness"]
        assert "wellness" in body["data_freshness"]

        assert body["recent_load"]["d7_tss"] > 0
        assert body["recent_load"]["d28_tss"] > 0
        assert body["recent_load"]["current_ctl"] >= 0
        assert body["recent_load"]["current_atl"] >= 0
        assert isinstance(body["recent_load"]["current_tsb"], (int, float))

        assert body["recovery_signals"]["hrv_trend_direction"] in ("up", "down", "stable")
        assert body["recovery_signals"]["rhr_trend_direction"] in ("up", "down", "stable")
        assert body["recovery_signals"]["sleep_avg_7d"] > 0
        assert isinstance(body["recovery_signals"]["readiness_score"], int)

        assert body["plan_adherence"]["completed_tss_7d"] >= 0
        assert body["plan_adherence"]["planned_tss_7d"] >= 0
        assert isinstance(body["plan_adherence"]["adherence_pct"], float)

        # HRV / resting_hr caveats should NOT appear (7 days of wellness)
        caveat_fields = {c["field"] for c in body["missing_data_caveats"]}
        assert "hrv" not in caveat_fields
        assert "resting_hr" not in caveat_fields

        assert isinstance(body["recommendation"]["action"], str)
        assert isinstance(body["recommendation"]["target_tss"], int)

        assert 0 <= body["readiness"]["score"] <= 100
    finally:
        await _cleanup(athlete.id)


async def test_coach_context_empty_athlete() -> None:
    """Athlete with no wellness, load, events, or activities yields graceful
    nulls — no crash, every section present with zero / fallback values."""
    athlete = Athlete(uuid4(), "cc-empty@example.com", "hash")
    _override_auth(athlete)
    try:
        await _seed_athlete(athlete.id)

        response = await _get(f"/api/v1/insights/coach-context?date={TARGET_DAY.isoformat()}")
        assert response.status_code == 200
        body = response.json()

        assert set(body.keys()) == {
            "data_freshness",
            "recent_load",
            "recovery_signals",
            "plan_adherence",
            "missing_data_caveats",
            "recommendation",
            "readiness",
        }

        assert body["recent_load"]["d7_tss"] == 0.0
        assert body["recent_load"]["d28_tss"] == 0.0

        assert body["recovery_signals"]["sleep_avg_7d"] == 0.0
        assert isinstance(body["recovery_signals"]["readiness_score"], int)

        assert body["plan_adherence"]["completed_tss_7d"] == 0.0
        assert body["plan_adherence"]["planned_tss_7d"] == 0.0

        assert 0 <= body["readiness"]["score"] <= 100
    finally:
        await _cleanup(athlete.id)


async def test_coach_context_missing_data_caveats() -> None:
    """Sparse wellness (fewer than 7 days with HRV) produces an HRV caveat."""
    athlete = Athlete(uuid4(), "cc-sparse@example.com", "hash")
    _override_auth(athlete)
    try:
        await _seed_athlete(athlete.id)
        _override_auth(athlete, _pmc_loads(days=90))
        await _seed_sparse_wellness(athlete.id)

        response = await _get(f"/api/v1/insights/coach-context?date={TARGET_DAY.isoformat()}")
        assert response.status_code == 200
        body = response.json()

        caveat_fields = {c["field"] for c in body["missing_data_caveats"]}
        assert "hrv" in caveat_fields, f"expected HRV caveat, got fields: {caveat_fields}"
        hrv_caveat = next(c for c in body["missing_data_caveats"] if c["field"] == "hrv")
        assert "缺少" in hrv_caveat["issue"]
        assert hrv_caveat["impact"]
    finally:
        await _cleanup(athlete.id)


# ---------------------------------------------------------------------------
# helpers
# ---------------------------------------------------------------------------


def _override_auth(athlete: Athlete, pmc_loads: list[dict[str, object]] | None = None) -> None:
    app.dependency_overrides.clear()
    app.dependency_overrides[get_current_athlete] = lambda: athlete
    app.dependency_overrides[get_coach_pmc_repo] = lambda: _DirectPmcRepo(pmc_loads or [])


async def _seed_athlete(athlete_id: UUID) -> None:
    async with get_pool().connection() as conn, conn.cursor() as cur:
        await cur.execute(
            "INSERT INTO athletes (id, email, password_hash) VALUES (%s, %s, 'hash')",
            (athlete_id, f"{athlete_id}@example.com"),
        )


def _pmc_loads(days: int) -> list[dict[str, object]]:
    return [
        {
            "day": TARGET_DAY - timedelta(days=days - 1 - index),
            "tss": float(50 + (index % 10) * 5),
            "ctl": 40.0,
            "atl": 35.0,
            "tsb": 5.0,
            "acwr": 1.0,
        }
        for index in range(days)
    ]


async def _seed_wellness(athlete_id: UUID, days: int) -> None:
    async with get_pool().connection() as conn, conn.cursor() as cur:
        for i in range(days):
            day = TARGET_DAY - timedelta(days=days - 1 - i)
            await cur.execute(
                "INSERT INTO health_wellness (athlete_id, day, resting_hr, hrv,"
                " sleep_secs) VALUES (%s, %s, %s, %s, %s)",
                (athlete_id, day, 58 + i % 3, 65.0 + i * 2.0, 25200 + i * 300),
            )


async def _seed_sparse_wellness(athlete_id: UUID) -> None:
    """Insert only 2 days of wellness — no HRV column populated."""
    async with get_pool().connection() as conn, conn.cursor() as cur:
        for i in range(2):
            day = TARGET_DAY - timedelta(days=1 - i)
            await cur.execute(
                "INSERT INTO health_wellness (athlete_id, day, resting_hr,"
                " sleep_secs) VALUES (%s, %s, %s, %s)",
                (athlete_id, day, 60, 25200),
            )


async def _seed_planned_event(athlete_id: UUID, event_day: date) -> None:
    event_id = str(uuid4())
    start = datetime(event_day.year, event_day.month, event_day.day, 8, 0, tzinfo=timezone.utc)
    async with get_pool().connection() as conn, conn.cursor() as cur:
        await cur.execute(
            "INSERT INTO training_calendar "
            "(event_id, athlete_id, start_time, category, sport_type, name,"
            " predicted_tss, status, done) "
            "VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)",
            (
                event_id,
                athlete_id,
                start,
                "workout",
                "Run",
                "Threshold",
                80.0,
                "planned",
                False,
            ),
        )


async def _seed_activity(athlete_id: UUID, activity_day: date) -> None:
    start = datetime(
        activity_day.year,
        activity_day.month,
        activity_day.day,
        7,
        0,
        tzinfo=timezone.utc,
    )
    async with get_pool().connection() as conn, conn.cursor() as cur:
        await cur.execute(
            "INSERT INTO activity_summary "
            "(activity_id, athlete_id, start_time, sport, distance_m,"
            " duration_s, avg_hr) "
            "VALUES (%s, %s, %s, %s, %s, %s, %s)",
            (str(uuid4()), athlete_id, start, "run", 10000.0, 3600, 150),
        )


async def _cleanup(athlete_id: UUID) -> None:
    async with get_pool().connection() as conn, conn.cursor() as cur:
        await cur.execute("DELETE FROM activity_summary WHERE athlete_id = %s", (athlete_id,))
        await cur.execute("DELETE FROM training_calendar WHERE athlete_id = %s", (athlete_id,))
        await cur.execute("DELETE FROM health_wellness WHERE athlete_id = %s", (athlete_id,))
        await cur.execute("DELETE FROM athletes WHERE id = %s", (athlete_id,))


async def _get(path: str) -> Response:
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        return await client.get(path)


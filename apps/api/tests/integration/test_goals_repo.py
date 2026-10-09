from datetime import date
from typing import Any
from uuid import UUID, uuid4

import pytest

from conftest import TEST_DSN
from infrastructure.auth.settings import settings
from infrastructure.db.pool import close_pool, get_pool, open_pool
from infrastructure.repositories.goals import GoalsRepo

pytestmark = [pytest.mark.asyncio(loop_scope="session"), pytest.mark.no_db]


async def test_goals_repo_crud_is_athlete_scoped() -> None:
    await _use_pool()
    athlete_id = uuid4()
    other_id = uuid4()
    await _seed(athlete_id, other_id)
    repo = GoalsRepo()

    created = await repo.create(athlete_id, _goal("10K", target_value=45, unit="min"))
    goal_id = _uuid(created["goal_id"])
    assert created["current_value"] == 0
    assert await repo.get(other_id, goal_id) is None

    updated = await repo.update(athlete_id, goal_id, {"current_value": 20, "status": "achieved"})
    assert updated is not None
    assert updated["current_value"] == 20
    assert updated["status"] == "achieved"
    assert [row["goal_id"] for row in await repo.list(athlete_id)] == [goal_id]

    assert await repo.delete(athlete_id, goal_id) is True
    assert await repo.get(athlete_id, goal_id) is None
    await _cleanup(athlete_id, other_id)


async def test_goals_repo_milestones_and_training_phases() -> None:
    await _use_pool()
    athlete_id = uuid4()
    other_athlete_id = uuid4()
    await _seed(athlete_id, other_athlete_id)
    repo = GoalsRepo()
    goal_id = _uuid((await repo.create(athlete_id, _goal("Marathon")))["goal_id"])

    milestone = await repo.create_milestone(
        goal_id, {"title": "Half", "target_date": date(2026, 4, 1), "target_value": 21.1}
    )
    phase = await repo.create_training_phase(
        athlete_id,
        goal_id,
        {
            "name": "base",
            "start_date": date(2026, 1, 1),
            "end_date": date(2026, 2, 1),
            "target_weekly_tss": 300,
        },
    )

    assert milestone["achieved"] is False
    assert [row["milestone_id"] for row in await repo.list_milestones(goal_id)] == [
        milestone["milestone_id"]
    ]
    assert [row["phase_id"] for row in await repo.list_training_phases(athlete_id, goal_id)] == [
        phase["phase_id"]
    ]
    assert await repo.list_training_phases(other_athlete_id, goal_id) == []
    await _cleanup(athlete_id, other_athlete_id)


async def _use_pool() -> None:
    await close_pool()
    settings.database_url = TEST_DSN
    await open_pool()


async def _seed(athlete_id: UUID, other_id: UUID | None = None) -> None:
    async with get_pool().connection() as conn, conn.cursor() as cur:
        await _ensure_schema(cur)
        await cur.execute(
            "INSERT INTO athletes (id, email, password_hash) VALUES (%s, %s, 'hash')",
            (athlete_id, f"{athlete_id}@example.com"),
        )
        if other_id:
            await cur.execute(
                "INSERT INTO athletes (id, email, password_hash) VALUES (%s, %s, 'hash')",
                (other_id, f"{other_id}@example.com"),
            )


async def _cleanup(athlete_id: UUID, other_id: UUID | None = None) -> None:
    athlete_ids = (athlete_id,) if other_id is None else (athlete_id, other_id)
    async with get_pool().connection() as conn, conn.cursor() as cur:
        await cur.execute("DELETE FROM goals WHERE athlete_id = ANY(%s)", (list(athlete_ids),))
        await cur.execute("DELETE FROM athletes WHERE id = ANY(%s)", (list(athlete_ids),))
    # 不关闭全局连接池：会话级 fixture 负责它的生命周期，
    # 提前关闭会让后续使用连接池的测试拿到未打开的池对象。


def _goal(title: str, target_value: float = 10000, unit: str = "m") -> dict[str, object]:
    return {
        "type": "distance",
        "title": title,
        "target_value": target_value,
        "unit": unit,
        "target_date": date(2026, 6, 1),
    }


async def _ensure_schema(cur: Any) -> None:
    await cur.execute("""
    CREATE TABLE IF NOT EXISTS goals (
        goal_id UUID PRIMARY KEY DEFAULT gen_random_uuid(), athlete_id UUID NOT NULL REFERENCES athletes(id),
        type VARCHAR NOT NULL, title TEXT NOT NULL, target_value DOUBLE PRECISION,
        current_value DOUBLE PRECISION NOT NULL DEFAULT 0, unit VARCHAR, target_date DATE,
        race_distance_m DOUBLE PRECISION, race_target_time_s INTEGER,
        status VARCHAR NOT NULL DEFAULT 'active', created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now())
    """)
    await cur.execute("""
    CREATE TABLE IF NOT EXISTS milestones (
        milestone_id UUID PRIMARY KEY DEFAULT gen_random_uuid(), goal_id UUID NOT NULL REFERENCES goals(goal_id) ON DELETE CASCADE,
        title TEXT NOT NULL, target_date DATE, target_value DOUBLE PRECISION,
        achieved BOOLEAN NOT NULL DEFAULT false, achieved_at TIMESTAMPTZ)
    """)
    await cur.execute("""
    CREATE TABLE IF NOT EXISTS training_phases (
        phase_id UUID PRIMARY KEY DEFAULT gen_random_uuid(), goal_id UUID NOT NULL REFERENCES goals(goal_id) ON DELETE CASCADE,
        athlete_id UUID NOT NULL REFERENCES athletes(id) ON DELETE CASCADE,
        name VARCHAR NOT NULL, start_date DATE NOT NULL, end_date DATE NOT NULL, target_weekly_tss DOUBLE PRECISION)
    """)


def _uuid(value: object) -> str:
    """Repo contract returns UUID columns as JSON-safe strings."""
    assert isinstance(value, str)
    return value

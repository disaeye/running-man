from __future__ import annotations

from collections.abc import Iterator
from datetime import date
from uuid import uuid4

import pytest
from httpx import ASGITransport, AsyncClient

from infrastructure.auth.models import Athlete
from infrastructure.db.pool import get_pool
from main import app
from presentation.auth.deps import get_current_athlete

pytestmark = [pytest.mark.asyncio(loop_scope="session"), pytest.mark.no_db]

ATHLETE_ID = uuid4()
ATHLETE_EMAIL = f"{ATHLETE_ID}@example.test"


@pytest.fixture(autouse=True)
def _clean_overrides() -> Iterator[None]:
    app.dependency_overrides.clear()
    yield
    app.dependency_overrides.clear()


async def test_threshold_history_serializes_recorded_steps() -> None:
    async with get_pool().connection() as conn, conn.cursor() as cur:
        await cur.execute(
            """
            INSERT INTO athletes (id, email, password_hash, name, timezone)
            VALUES (%s, %s, 'hash', 'Threshold Test', 'Asia/Shanghai')
            ON CONFLICT (id) DO NOTHING
            """,
            (ATHLETE_ID, ATHLETE_EMAIL),
        )
        await cur.execute(
            """
            INSERT INTO athlete_thresholds (
                athlete_id, effective_from, hr_max, resting_hr, lthr, threshold_pace
            ) VALUES (%s, %s, %s, %s, %s, %s)
            """,
            (ATHLETE_ID, date(2026, 1, 2), 190, 50, 170, 280),
        )

    app.dependency_overrides[get_current_athlete] = lambda: Athlete(
        ATHLETE_ID, ATHLETE_EMAIL, "hash"
    )
    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get("/api/v1/athletes/me/thresholds")

        assert response.status_code == 200
        assert response.json() == [
            {
                "effective_from": "2026-01-02",
                "hr_max": 190,
                "resting_hr": 50,
                "lthr": 170,
                "threshold_pace": 280.0,
                "source": "manual",
            }
        ]
    finally:
        async with get_pool().connection() as conn, conn.cursor() as cur:
            await cur.execute("DELETE FROM athletes WHERE id = %s", (ATHLETE_ID,))

"""PUT /athletes/me — the one write the settings form depends on.

The failure this pins: saving the form answered 500
``value too long for type character varying(1)`` because the sex select sends
``male`` / ``female`` into a one-character column. Every save from that form
carries the sex field, so one narrow column made the whole card unsaveable —
thresholds included.
"""

from __future__ import annotations

from collections.abc import Iterator
from uuid import UUID

import psycopg
import pytest
from httpx import ASGITransport, AsyncClient

from infrastructure.auth.models import Athlete
from main import app
from presentation.auth.deps import get_current_athlete

pytestmark = [pytest.mark.asyncio(loop_scope="session"), pytest.mark.no_db]

ATHLETE_ID = UUID("00000000-0000-0000-0000-000000000041")


@pytest.fixture(autouse=True)
def _clean_overrides() -> Iterator[None]:
    app.dependency_overrides.clear()
    yield
    app.dependency_overrides.clear()


def _seed_athlete(db_conn: psycopg.Connection) -> None:
    with db_conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO athletes (id, email, password_hash, name, timezone)
            VALUES (%s, %s, 'hash', 'Test', 'Asia/Shanghai')
            ON CONFLICT (id) DO UPDATE SET sex = NULL
            """,
            (ATHLETE_ID, f"profile-{ATHLETE_ID}@example.test"),
        )
    db_conn.commit()


async def _put(payload: dict[str, object]):
    app.dependency_overrides[get_current_athlete] = lambda: Athlete(
        ATHLETE_ID, f"profile-{ATHLETE_ID}@example.test", "hash"
    )
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        return await client.put("/api/v1/athletes/me", json=payload)


async def test_saving_the_form_stores_sex_and_the_thresholds(
    db_conn: psycopg.Connection,
) -> None:
    _seed_athlete(db_conn)

    response = await _put(
        {
            "hr_max": 186,
            "resting_hr": 52,
            "lthr": 167,
            "threshold_pace": 294,
            "weight_goal": 68.5,
            "dob": "1994-03-02",
            "sex": "female",
        }
    )

    assert response.status_code == 200
    body = response.json()
    assert body["sex"] == "female"
    assert body["hr_max"] == 186
    assert body["lthr"] == 167
    assert body["threshold_pace"] == 294
    assert body["weight_goal"] == 68.5

    with db_conn.cursor() as cur:
        cur.execute("SELECT sex, weight_goal FROM athletes WHERE id = %s", (ATHLETE_ID,))
        assert cur.fetchone() == ("female", 68.5)


async def test_a_single_letter_sex_is_rejected_before_the_write(
    db_conn: psycopg.Connection,
) -> None:
    """The column used to take 'M'; the API now answers 422 instead of writing it."""
    _seed_athlete(db_conn)

    response = await _put({"sex": "M"})

    assert response.status_code == 422

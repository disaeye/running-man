from __future__ import annotations

import json
from collections.abc import Iterator
from datetime import UTC, date, datetime
from uuid import uuid4

import pytest
from httpx import ASGITransport, AsyncClient

from infrastructure.auth.models import Athlete
from infrastructure.db.pool import get_pool
from main import app
from presentation.auth.deps import get_current_athlete
from tests.domain.run_classification_fixtures import classified, evidence

pytestmark = [pytest.mark.no_db]

ATHLETE_ID = uuid4()
ATHLETE_EMAIL = f"classifications-{ATHLETE_ID}@example.test"


@pytest.fixture(autouse=True)
def _clean_overrides() -> Iterator[None]:
    app.dependency_overrides.clear()
    app.dependency_overrides[get_current_athlete] = lambda: Athlete(
        ATHLETE_ID, ATHLETE_EMAIL, "hash"
    )
    yield
    app.dependency_overrides.clear()


def _payload(activity_id: str, local_day: date) -> dict[str, object]:
    result = classified(
        evidence(
            activity_id=activity_id,
            local_day=local_day.isoformat(),
        )
    )
    summary = result["session_classification"]
    assert isinstance(summary, dict)
    summary["activity_id"] = activity_id
    summary["local_day"] = local_day.isoformat()
    return result


async def _seed_athlete() -> None:
    async with get_pool().connection() as conn, conn.cursor() as cur:
        await cur.execute(
            """
            INSERT INTO athletes (id, email, password_hash, name, timezone)
            VALUES (%s, %s, 'hash', 'Classification Test', 'Asia/Shanghai')
            ON CONFLICT (id) DO NOTHING
            """,
            (ATHLETE_ID, ATHLETE_EMAIL),
        )
        await conn.commit()


async def _seed_classification(activity_id: str, local_day: date) -> None:
    payload = _payload(activity_id, local_day)
    summary = payload["session_classification"]
    assert isinstance(summary, dict)
    async with get_pool().connection() as conn, conn.cursor() as cur:
        await cur.execute(
            """
            INSERT INTO session_classifications (
                athlete_id, activity_id, local_day, structure, session_type,
                primary_stimulus, pacing_pattern, display_name, display_line,
                evidence_grade, confidence, classification, algorithm_version
            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s::jsonb, %s)
            ON CONFLICT (athlete_id, activity_id) DO UPDATE SET
                local_day = EXCLUDED.local_day,
                classification = EXCLUDED.classification,
                algorithm_version = EXCLUDED.algorithm_version
            """,
            (
                ATHLETE_ID,
                activity_id,
                local_day,
                str(summary["structure"]),
                str(summary["session_type"]),
                str(summary["primary_stimulus"]),
                str(summary["pacing_pattern"]),
                str(summary["display_name"]),
                str(summary["display_line"]),
                str(summary["evidence_grade"]),
                float(summary["confidence"]),
                json.dumps(payload, ensure_ascii=True),
                "1.0.0",
            ),
        )
        await conn.commit()


async def _seed_activity(activity_id: str) -> None:
    async with get_pool().connection() as conn, conn.cursor() as cur:
        await cur.execute(
            """
            INSERT INTO activity_summary (
                activity_id, athlete_id, start_time, sport, distance_m,
                duration_s, avg_hr, raw_data
            ) VALUES (%s, %s, %s, 'run', 6000, 1800, 145, '{}'::jsonb)
            ON CONFLICT (activity_id, start_time) DO NOTHING
            """,
            (activity_id, ATHLETE_ID, datetime(2026, 2, 2, 1, 0, tzinfo=UTC)),
        )
        await conn.commit()


async def _cleanup() -> None:
    async with get_pool().connection() as conn, conn.cursor() as cur:
        await cur.execute("DELETE FROM athletes WHERE id = %s", (ATHLETE_ID,))
        await conn.commit()


async def _get(path: str) -> object:
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        return await client.get(path)


async def test_list_reads_persisted_rows_and_honors_date_range() -> None:
    await _seed_athlete()
    try:
        for activity_id, day in (
            ("run-jan", date(2026, 1, 5)),
            ("run-feb", date(2026, 2, 5)),
            ("run-mar", date(2026, 3, 5)),
        ):
            await _seed_classification(activity_id, day)
        response = await _get("/api/v1/activities/classifications")
        assert response.status_code == 200  # type: ignore[attr-defined]
        body = response.json()  # type: ignore[attr-defined]
        assert body["activity_count"] == 3
        ids = {row["session_classification"]["activity_id"] for row in body["results"]}
        assert ids == {"run-jan", "run-feb", "run-mar"}
        assert body["results"][0]["session_classification"]["activity_id"] == "run-mar"

        filtered = await _get("/api/v1/activities/classifications?from=2026-02-01&to=2026-02-28")
        assert filtered.status_code == 200  # type: ignore[attr-defined]
        filtered_body = filtered.json()  # type: ignore[attr-defined]
        assert filtered_body["activity_count"] == 1
        assert filtered_body["results"][0]["session_classification"]["activity_id"] == "run-feb"

        invalid = await _get("/api/v1/activities/classifications?from=not-a-date")
        assert invalid.status_code == 422  # type: ignore[attr-defined]
    finally:
        await _cleanup()


async def test_get_classification_reads_one_persisted_row() -> None:
    await _seed_athlete()
    try:
        await _seed_classification("run-one", date(2026, 4, 8))
        response = await _get("/api/v1/activities/run-one/classification")
        assert response.status_code == 200  # type: ignore[attr-defined]
        body = response.json()  # type: ignore[attr-defined]
        assert body["session_classification"]["activity_id"] == "run-one"
        assert set(body) == {
            "session_classification",
            "prescription",
            "execution",
            "quality",
            "evidence",
        }
        missing = await _get("/api/v1/activities/missing/classification")
        assert missing.status_code == 404  # type: ignore[attr-defined]
    finally:
        await _cleanup()


async def test_recompute_persists_classification_for_a_running_activity() -> None:
    await _seed_athlete()
    try:
        await _seed_activity("run-recompute")
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post("/api/v1/activities/classifications/recompute")
        assert response.status_code == 200
        body = response.json()
        assert body["activity_count"] == 1
        assert body["persisted_count"] == 1
        assert body["algorithm_version"] == "1.0.0"

        listed = await _get("/api/v1/activities/classifications")
        assert listed.status_code == 200  # type: ignore[attr-defined]
        rows = listed.json()["results"]  # type: ignore[attr-defined]
        assert len(rows) == 1
        assert rows[0]["session_classification"]["activity_id"] == "run-recompute"
        assert rows[0]["session_classification"]["structure"] == "unclear"
        assert rows[0]["session_classification"]["evidence_grade"] == "D"
        async with get_pool().connection() as conn, conn.cursor() as cur:
            await cur.execute(
                "SELECT count(*) FROM session_classifications WHERE athlete_id = %s",
                (ATHLETE_ID,),
            )
            row = await cur.fetchone()
            assert row is not None and row["count"] == 1
    finally:
        await _cleanup()

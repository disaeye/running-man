from __future__ import annotations

import json
from collections.abc import Iterator
from datetime import date
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
ATHLETE_EMAIL = f"domain-integration-{ATHLETE_ID}@example.test"
LOCAL_DAY = date(2026, 2, 2)
ACTIVITY_ID = "domain-run"

REQUIRED = {"session_classification", "prescription", "execution", "quality", "evidence"}


@pytest.fixture(autouse=True)
def _clean_overrides() -> Iterator[None]:
    app.dependency_overrides.clear()
    app.dependency_overrides[get_current_athlete] = lambda: Athlete(
        ATHLETE_ID, ATHLETE_EMAIL, "hash", timezone="Asia/Shanghai"
    )
    yield
    app.dependency_overrides.clear()


async def _seed() -> None:
    payload = classified(evidence(activity_id=ACTIVITY_ID, local_day=LOCAL_DAY.isoformat()))
    summary = payload["session_classification"]
    assert isinstance(summary, dict)
    summary["activity_id"] = ACTIVITY_ID
    summary["local_day"] = LOCAL_DAY.isoformat()
    quality = payload["quality"]
    assert isinstance(quality, dict)
    quality["work_domain_residence_s"] = {
        "below_mt1": 3600.0,
        "mt1_mt2": 300.0,
        "mt2_wmax": 600.0,
        "above_wmax": 0.0,
        "low_unspecified": 0.0,
    }
    async with get_pool().connection() as conn, conn.cursor() as cur:
        await cur.execute(
            """
            INSERT INTO athletes (id, email, password_hash, name, timezone)
            VALUES (%s, %s, 'hash', 'Domain Integration', 'Asia/Shanghai')
            ON CONFLICT (id) DO NOTHING
            """,
            (ATHLETE_ID, ATHLETE_EMAIL),
        )
        await cur.execute(
            """
            INSERT INTO session_classifications (
                athlete_id, activity_id, local_day, structure, session_type,
                primary_stimulus, pacing_pattern, display_name, display_line,
                evidence_grade, confidence, classification, algorithm_version
            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s::jsonb, %s)
            ON CONFLICT (athlete_id, activity_id) DO UPDATE SET
                local_day = EXCLUDED.local_day,
                classification = EXCLUDED.classification
            """,
            (
                ATHLETE_ID,
                ACTIVITY_ID,
                LOCAL_DAY,
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


async def _cleanup() -> None:
    async with get_pool().connection() as conn, conn.cursor() as cur:
        await cur.execute("DELETE FROM athletes WHERE id = %s", (ATHLETE_ID,))
        await conn.commit()


async def test_weekly_progress_and_plan_quality_expose_four_domains() -> None:
    await _seed()
    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            weekly = await client.get(
                "/api/v1/insights/weekly-progress?from=2026-02-01&to=2026-02-28"
            )
            assert weekly.status_code == 200
            weeks = weekly.json()
            active = [row for row in weeks if row["work_domain_seconds"]["below_mt1"] > 0]
            assert len(active) == 1
            row = active[0]
            assert row["week"] == "2026-W06"
            seconds = row["work_domain_seconds"]
            assert seconds["below_mt1"] == 3600.0
            assert seconds["mt1_mt2"] == 300.0
            assert seconds["mt2_wmax"] == 600.0
            share = row["work_domain_share"]
            assert share["below_mt1"] == pytest.approx(0.8, abs=0.001)
            # The repository must return the full five-object payload so the
            # week's load comes from execution.segments, not only from zone
            # seconds or a TSS proxy.
            assert row["classification_count"] == 1
            assert row["work_bouts"] == 1
            assert row["work_distance_m"] == pytest.approx(6000.0, abs=100.0)
            assert row["work_duration_s"] == pytest.approx(1800.0, abs=1.0)

            quality = await client.get(
                "/api/v1/insights/plan-quality?from=2026-02-01&to=2026-02-28"
            )
            assert quality.status_code == 200
            body = quality.json()
            assert body["work_domain_seconds"]["below_mt1"] == 3600.0
            assert body["work_domain_share"]["mt2_wmax"] == pytest.approx(0.1333, abs=0.001)
    finally:
        await _cleanup()

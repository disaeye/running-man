from __future__ import annotations

import json
from collections.abc import Iterator
from datetime import UTC, datetime, timedelta
from typing import Any, cast
from uuid import uuid4

import pytest
from httpx import ASGITransport, AsyncClient
from pytest import approx

from domain.workout.plan_generator import WeekPlanOptions, generate_weekly_plan
from infrastructure.auth.models import Athlete
from infrastructure.db.pool import get_pool
from main import app
from presentation.auth.deps import get_current_athlete

pytestmark = [pytest.mark.no_db]

ATHLETE_ID = uuid4()
ATHLETE_EMAIL = f"calendar-link-{ATHLETE_ID}@example.test"
START = datetime(2026, 9, 7, 1, 0, tzinfo=UTC)
ACTIVITY_ID = "linked-run"
EVENT_ID = "planned-intervals"

TRAINING_PACES = {
    "easy": {"min": 340.0, "max": 390.0},
    "threshold": {"min": 270.0, "max": 285.0},
    "interval": {"min": 245.0, "max": 260.0},
}


@pytest.fixture(autouse=True)
def _clean_overrides() -> Iterator[None]:
    app.dependency_overrides.clear()
    app.dependency_overrides[get_current_athlete] = lambda: Athlete(
        ATHLETE_ID, ATHLETE_EMAIL, "hash", timezone="Asia/Shanghai"
    )
    yield
    app.dependency_overrides.clear()


def _prescription() -> tuple[dict[str, object], list[dict[str, object]], float]:
    plan = generate_weekly_plan(
        42000.0,
        WeekPlanOptions(training_paces=TRAINING_PACES, pace_effective_from="2026-09-07"),
    )
    day = next(item for item in plan if item.workout_type == "intervals")
    segments = [dict(item) for item in day.workout_segments]
    return (
        {
            "version": 1,
            "type": "intervals",
            "duration_min": day.duration_min,
            "segments": segments,
            "source_refs": day.science.source_refs if day.science else [],
            "rationale": day.science.rationale if day.science else "",
            "target_adaptation": day.science.target_adaptation if day.science else "",
            "intensity_anchor": day.science.intensity_anchor if day.science else {},
            "target_domain": day.science.target_domain if day.science else "mt2_wmax",
            "quality_target": day.science.quality_target if day.science else {},
        },
        segments,
        float(day.duration_min * 60),
    )


def _json_object(value: object) -> dict[str, object]:
    if isinstance(value, str):
        decoded = json.loads(value)
    elif isinstance(value, dict):
        decoded = value
    else:
        raise TypeError(f"expected a JSON object, got {type(value).__name__}")
    if not isinstance(decoded, dict):
        raise TypeError("expected a JSON object")
    return decoded


def _number(value: object) -> float:
    if isinstance(value, bool) or not isinstance(value, int | float):
        return 0.0
    return float(value)


async def _seed() -> tuple[dict[str, object], list[dict[str, object]], float]:
    prescription, segments, duration_s = _prescription()
    async with get_pool().connection() as conn, conn.cursor() as cur:
        await cur.execute(
            """
            INSERT INTO athletes (id, email, password_hash, name, timezone)
            VALUES (%s, %s, 'hash', 'Calendar Link', 'Asia/Shanghai')
            ON CONFLICT (id) DO NOTHING
            """,
            (ATHLETE_ID, ATHLETE_EMAIL),
        )
        await cur.execute(
            """
            INSERT INTO training_calendar (
                event_id, athlete_id, start_time, category, sport_type,
                status, done, training_type, workout_prescription
            ) VALUES (%s, %s, %s, 'workout', 'Run', 'planned', false, 'intervals', %s::jsonb)
            """,
            (EVENT_ID, ATHLETE_ID, START, json.dumps(prescription, ensure_ascii=True)),
        )
        await cur.execute(
            """
            INSERT INTO activity_summary (
                activity_id, athlete_id, start_time, sport, distance_m,
                duration_s, avg_hr, raw_data
            ) VALUES (%s, %s, %s, 'run', %s, %s, 165, %s::jsonb)
            """,
            (
                ACTIVITY_ID,
                ATHLETE_ID,
                START,
                sum(_number(item["distance_m"]) for item in segments),
                round(duration_s),
                json.dumps(
                    {
                        "threshold_pace": 3.7,
                        "pace_zones": [72.0, 91.0, 97.0, 102.0, 999.0],
                        "icu_hr_zones": [142, 160, 174, 186, 192],
                        "icu_hr_zone_times": [0, 0, 0, 3600, 0],
                        "pace_zone_times": [0, 0, 0, 0, 3600],
                        "gap_zone_times": [0, 0, 0, 0, 3600],
                        "use_gap_zone_times": True,
                        "race": False,
                    },
                    ensure_ascii=True,
                ),
            ),
        )
        exact_intervals: list[dict[str, object]] = []
        cursor = 0
        for index, segment in enumerate(segments):
            duration = _number(segment["duration_s"])
            distance = max(_number(segment["distance_m"]), 1.0)
            speed = distance / duration if duration else 0.0
            role = str(segment["role"])
            exact_intervals.append(
                {
                    "start_index": index,
                    "start_time": cursor,
                    "end_time": cursor + duration,
                    "moving_time": duration,
                    "elapsed_time": duration,
                    "distance": distance,
                    "average_speed": speed,
                    "average_heartrate": 165.0,
                    "type": role.upper(),
                    "group_id": "planned_work" if role == "work" else None,
                }
            )
            for second in range(int(duration)):
                await cur.execute(
                    """
                    INSERT INTO activity_streams (
                        sample_time, activity_id, athlete_id, metric_type, value
                    ) VALUES (%s, %s, %s, 'speed', %s)
                    """,
                    (
                        START + timedelta(seconds=cursor + second),
                        ACTIVITY_ID,
                        ATHLETE_ID,
                        speed,
                    ),
                )
            cursor += int(duration)
        await cur.execute(
            """
            INSERT INTO activity_intervals (athlete_id, activity_id, payload)
            VALUES (%s, %s, %s::jsonb)
            ON CONFLICT (athlete_id, activity_id) DO UPDATE SET payload = EXCLUDED.payload
            """,
            (
                ATHLETE_ID,
                ACTIVITY_ID,
                json.dumps({"icu_intervals": exact_intervals}, ensure_ascii=True),
            ),
        )
        await conn.commit()
    return prescription, segments, duration_s


async def _cleanup() -> None:
    async with get_pool().connection() as conn, conn.cursor() as cur:
        await cur.execute("DELETE FROM athletes WHERE id = %s", (ATHLETE_ID,))
        await conn.commit()


async def test_link_writes_execution_quality_and_classification() -> None:
    await _seed()
    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post(
                f"/api/v1/calendar/{EVENT_ID}/link?activity_id={ACTIVITY_ID}"
            )
        assert response.status_code == 200
        body = response.json()
        assert body["linked_activity_id"] == ACTIVITY_ID
        assert body["done"] is True
        assert body["status"] == "completed"

        async with get_pool().connection() as conn, conn.cursor() as cur:
            await cur.execute(
                """
                SELECT execution, quality, session_classification
                FROM training_calendar WHERE athlete_id = %s AND event_id = %s
                """,
                (ATHLETE_ID, EVENT_ID),
            )
            row = await cur.fetchone()
        assert row is not None
        values = dict(row)
        execution, quality, classification = (
            _json_object(values["execution"]),
            _json_object(values["quality"]),
            _json_object(values["session_classification"]),
        )
        segments = cast(list[Any], execution["segments"])
        prescription = cast(dict[str, Any], classification["prescription"])
        plan_segments = cast(list[Any], prescription["segments"])
        differences = cast(list[Any], quality["per_segment_differences"])
        assert len(segments) == 13
        assert len(plan_segments) == 13
        assert all(isinstance(s, dict) and "target" in s and "measured" in s for s in segments)
        assert quality["repetition_match"] == 1.0
        assert quality["work_distance_match"] == approx(1.0, abs=0.01)
        assert quality["work_duration_match"] == approx(1.0, abs=0.01)
        assert quality["structure_match"] == 1.0
        assert quality["paired_segment_count"] == 13
        assert len(differences) == 13
        assert set(classification) == {
            "session_classification",
            "prescription",
            "execution",
            "quality",
            "evidence",
        }
        summary = _json_object(classification["session_classification"])
        assert summary["activity_id"] == ACTIVITY_ID
        assert summary["structure"] == "interval"
    finally:
        await _cleanup()

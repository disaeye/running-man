"""Replay the recorded Intervals.icu response through load computation.

The cassette holds 20 activities recorded from the live API plus one activity's
five streams, so this is the only place the load pipeline sees data shapes it did
not invent. The synthetic seeds elsewhere use a constant 3 m/s, where a wrong
fourth-power domain is invisible because NGP and GAP coincide.

The two equalities hold by construction. The inequality holds by Jensen: a
fourth-power mean of speed is never below the arithmetic mean, so in the pace
form it is never above it. That is the assertion which fails when the power is
applied to pace instead of speed.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any
from uuid import UUID

import psycopg
import pytest
import vcr

from application.load.recompute import recompute_activity_load_facts
from conftest import TEST_DSN
from domain.ingestion import canonical_stream_metric
from infrastructure.integrations.intervals.client import IntervalsClient
from tests.application.load.activity_fact_schema import ensure_activity_fact_schema
from tests.integration.recompute_verifier_helpers import seed_metric_definitions

pytestmark = [pytest.mark.asyncio(loop_scope="session"), pytest.mark.no_db]

CASSETTE = Path(__file__).parents[1] / "cassettes" / "intervals_api_validation.yaml"
ATHLETE_ID = UUID("00000000-0000-0000-0000-000000000018")
ACTIVITY_ID = "i156878360"
THRESHOLD_PACE = 270.0
LTHR = 180
STREAM_TYPES = ("watts", "heartrate", "cadence", "velocity_smooth", "altitude")


class NoopLimiter:
    async def acquire(self) -> None:
        return None


def _replay_vcr() -> vcr.VCR:
    return vcr.VCR(record_mode="none", match_on=["method", "scheme", "host", "path"])


async def _replay() -> tuple[dict[str, Any], list[dict[str, Any]]]:
    """Pull one activity and its streams out of the recorded response."""
    async with IntervalsClient(
        api_key="API_KEY_PLACEHOLDER", athlete_id=0, rate_limiter=NoopLimiter()
    ) as client:
        with _replay_vcr().use_cassette(str(CASSETTE), allow_playback_repeats=True):
            activities = await client.get_activities(0, "2026-05-17", "2026-06-16")
            activity = next(item for item in activities if str(item["id"]) == ACTIVITY_ID)
            streams = await client.get_streams(ACTIVITY_ID, STREAM_TYPES)
    return activity, streams


def _samples(data: list[object] | None) -> list[float | None]:
    """Intervals.icu pads a stream with nulls where the device had no sample."""
    return [float(value) if isinstance(value, int | float) else None for value in data or []]


def _seed(activity: dict[str, Any], streams: list[dict[str, Any]]) -> int:
    """Write the replayed activity, its streams and a threshold row."""
    start = datetime.fromisoformat(str(activity["start_date"]).replace("Z", "+00:00"))
    if start.tzinfo is None:
        start = start.replace(tzinfo=UTC)
    duration_s = int(activity["moving_time"])
    ensure_activity_fact_schema(ATHLETE_ID)
    with psycopg.connect(TEST_DSN) as conn:
        seed_metric_definitions(conn)
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO athlete_thresholds (athlete_id, effective_from, threshold_pace, lthr)
                VALUES (%s, '2026-01-01', %s, %s)
                ON CONFLICT (athlete_id, effective_from)
                DO UPDATE SET threshold_pace = EXCLUDED.threshold_pace, lthr = EXCLUDED.lthr
                """,
                (ATHLETE_ID, THRESHOLD_PACE, LTHR),
            )
            cur.execute(
                """
                INSERT INTO activity_summary (activity_id, athlete_id, start_time, sport,
                                              duration_s, distance_m)
                VALUES (%s, %s, %s, 'run', %s, %s)
                ON CONFLICT (activity_id, start_time) DO NOTHING
                """,
                (ACTIVITY_ID, ATHLETE_ID, start, duration_s, activity.get("distance")),
            )
            rows = [
                (start + timedelta(seconds=index), ACTIVITY_ID, ATHLETE_ID, metric_type, value)
                for stream in streams
                for metric_type in [canonical_stream_metric(stream["type"])]
                for index, value in enumerate(_samples(stream["data"]))
                if value is not None
            ]
            with cur.copy(
                "COPY activity_streams (sample_time, activity_id, athlete_id, "
                "metric_type, value) FROM STDIN"
            ) as copy:
                for row in rows:
                    copy.write_row(row)
        conn.commit()
    return duration_s


def _facts() -> dict[str, float]:
    with psycopg.connect(TEST_DSN) as conn, conn.cursor() as cur:
        cur.execute(
            "SELECT metric_key, value FROM current_activity_facts "
            "WHERE athlete_id = %s AND subject_key = %s",
            (ATHLETE_ID, ACTIVITY_ID),
        )
        return {str(key): float(value) for key, value in cur.fetchall()}


def _stream_flags() -> tuple[bool, int]:
    with psycopg.connect(TEST_DSN) as conn, conn.cursor() as cur:
        cur.execute(
            "SELECT has_streams, stream_sample_count FROM activity_summary "
            "WHERE athlete_id = %s AND activity_id = %s",
            (ATHLETE_ID, ACTIVITY_ID),
        )
        row = cur.fetchone()
    assert row is not None
    return bool(row[0]), int(row[1])


async def test_replayed_activity_produces_self_consistent_load() -> None:
    activity, streams = await _replay()
    duration_s = _seed(activity, streams)

    result = await recompute_activity_load_facts(ATHLETE_ID, "cassette")

    assert result.status == "success"
    facts = _facts()
    assert {"normalized_graded_pace", "gap_avg", "intensity_factor", "tss"} <= facts.keys()

    ngp = facts["normalized_graded_pace"]
    gap_avg = facts["gap_avg"]
    intensity_factor = facts["intensity_factor"]
    tss = facts["tss"]

    # Threshold pace resolves to the seeded row for this activity's local day.
    assert intensity_factor == pytest.approx(THRESHOLD_PACE / ngp, rel=1e-9)
    assert tss == pytest.approx(duration_s * intensity_factor**2 / 3600 * 100, rel=1e-9)
    assert tss > 0

    # Jensen. The 2% margin absorbs the difference between distance weighting and
    # fourth-power weighting over the same samples.
    assert ngp <= gap_avg * 1.02, f"NGP {ngp:.1f} exceeds GAP {gap_avg:.1f}"


async def test_stream_insert_updates_the_summary_flags() -> None:
    """The statement-level trigger keeps the denormalised flags in step."""
    activity, streams = await _replay()
    _seed(activity, streams)

    has_streams, sample_count = _stream_flags()

    assert has_streams is True
    assert sample_count == sum(1 for stream in streams for value in _samples(stream["data"]) if value is not None)

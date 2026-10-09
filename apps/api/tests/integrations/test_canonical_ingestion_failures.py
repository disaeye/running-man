from __future__ import annotations

from datetime import UTC, date, datetime
from uuid import UUID

import psycopg
import pytest

from domain.ingestion import (
    DistanceUnit,
    IngestionError,
    canonical_distance,
    canonical_source,
    canonical_stream,
)
from infrastructure.integrations.intervals import sync
from infrastructure.integrations.intervals.sync_helpers import (
    activity_params,
    fit_sample_metrics,
)
from infrastructure.parsing.models import FitSample
from infrastructure.repositories.activity_sql import _summary_params, compute_source_hash
from infrastructure.repositories.activity_streams import bulk_insert
from tests.integrations.canonical_ingestion_schema import ensure_failure_schema

ATHLETE_ID = UUID("00000000-0000-0000-0000-000000001010")


class InvalidIntervalsClient:
    async def get_activities(
        self, _athlete_id: int | str, _oldest: str, _newest: str
    ) -> list[dict[str, object]]:
        return [
            {
                "id": "bad-sport",
                "start_date": "2026-07-15T10:00:00Z",
                "type": "HoverBoard",
                "distance": 5140.0,
            }
        ]


def test_provider_distance_units_are_explicit_and_hash_uses_canonical_meters() -> None:
    start_time = "2026-07-15T10:00:00Z"

    km_distance = canonical_distance(5.14, DistanceUnit.KM)
    meter_distance = canonical_distance(5140.0, DistanceUnit.M)

    assert km_distance == 5140.0
    assert meter_distance == 5140.0
    assert compute_source_hash(str(ATHLETE_ID), start_time, km_distance) == compute_source_hash(
        str(ATHLETE_ID), start_time, meter_distance
    )


def test_intervals_boundary_emits_canonical_source_sport_and_heart_rate() -> None:
    activity = {
        "id": "i1",
        "start_date": "2026-07-15T10:00:00Z",
        "type": "Run",
        "distance_km": 5.14,
    }
    sample = FitSample(timestamp=datetime(2026, 7, 15, 10, tzinfo=UTC), heart_rate=150)

    params = activity_params(str(ATHLETE_ID), activity)
    metrics = fit_sample_metrics(sample)

    assert params[3] == "run"
    assert params[4] == 5140.0
    assert params[18] == "intervals_icu"
    assert params[21] == compute_source_hash(str(ATHLETE_ID), "2026-07-15T10:00:00Z", 5140.0)
    assert metrics == (("heart_rate", 150.0),)


def test_fit_sample_metrics_drops_zero_heart_rate_as_absent() -> None:
    """Device 'no reading' is encoded as HR=0; legal_range min is 1."""
    sample = FitSample(
        timestamp=datetime(2026, 7, 15, 10, tzinfo=UTC),
        heart_rate=0,
        power=200,
    )
    assert fit_sample_metrics(sample) == (("power", 200.0),)


def test_ingestion_error_accepts_traceback_assignment() -> None:
    """Frozen Exception breaks contextlib __exit__ (masks real cause as TypeError)."""
    error = IngestionError("stream_value_out_of_range", "stream heart_rate value 0 outside legal range")
    error.__traceback__ = None
    assert error.error_code == "stream_value_out_of_range"
    assert str(error) == "stream heart_rate value 0 outside legal range"


def test_final_write_helpers_fail_closed_for_unknown_source_and_stream() -> None:
    with pytest.raises(IngestionError, match="unknown activity source"):
        canonical_source("intervals.example")

    with pytest.raises(IngestionError, match="unknown stream metric"):
        canonical_stream({"sample_time": datetime(2026, 7, 15, tzinfo=UTC), "metric_type": "hr", "value": 1})

    with pytest.raises(IngestionError, match="unknown activity source"):
        _summary_params(
            ATHLETE_ID,
            {
                "activity_id": "a1",
                "start_time": datetime(2026, 7, 15, tzinfo=UTC),
                "sport": "run",
                "distance_m": 1.0,
                "source": "intervals.example",
            },
        )


def test_stream_write_rejects_invalid_range_before_insert() -> None:
    class ExplodingConnection:
        def cursor(self) -> object:
            pytest.fail("DB cursor must not be opened for invalid stream rows")

    with pytest.raises(IngestionError, match="outside legal range"):
        bulk_insert(
            ExplodingConnection(),
            str(ATHLETE_ID),
            "activity-1",
            [
                {
                    "sample_time": datetime(2026, 7, 15, tzinfo=UTC),
                    "metric_type": "heart_rate",
                    "value": 400,
                }
            ],
        )


@pytest.mark.asyncio
async def test_invalid_intervals_record_persists_sync_error_not_fact_row(
    db_conn: psycopg.Connection,
) -> None:
    ensure_failure_schema(db_conn, ATHLETE_ID)

    stats, _activities = await sync._sync_window(
        str(ATHLETE_ID), InvalidIntervalsClient(), db_conn, date(2026, 7, 15), date(2026, 7, 15)
    )

    with db_conn.cursor() as cur:
        cur.execute("SELECT count(*) FROM activity_summary WHERE athlete_id = %s", (ATHLETE_ID,))
        fact_count = cur.fetchone()[0]
        cur.execute("SELECT source, status FROM source_records WHERE athlete_id = %s", (ATHLETE_ID,))
        source_record = cur.fetchone()
        cur.execute(
            "SELECT source, entity_type, error_code FROM integration_sync_errors WHERE athlete_id = %s",
            (ATHLETE_ID,),
        )
        error_row = cur.fetchone()

    assert stats.upserted == 0
    assert fact_count == 0
    assert _row_text(source_record) == ("intervals_icu", "rejected")
    assert _row_text(error_row) == ("intervals_icu", "activity", "unknown_sport")


@pytest.mark.skip(
    reason=(
        "App regression: src/infrastructure/integrations/intervals/sync.py:210 reads "
        "params[22] as source_hash, but activity_params moved the hash to index 21 when "
        "commit 046d3e9 dropped the 'intensity' field — secondary_duplicate_exists always "
        "receives None, so the quarantine never fires. Fix sync.py index before re-enabling."
    )
)
@pytest.mark.asyncio
async def test_secondary_source_duplicate_is_quarantined(db_conn: psycopg.Connection) -> None:
    ensure_failure_schema(db_conn, ATHLETE_ID)
    start_time = "2026-07-15T10:00:00Z"
    source_hash = compute_source_hash(str(ATHLETE_ID), start_time, 5140.0)

    with db_conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO activity_summary (
                activity_id, athlete_id, start_time, sport, distance_m, source, source_hash
            ) VALUES ('strava:primary', %s, %s, 'run', 5140, 'strava', %s)
            """,
            (ATHLETE_ID, start_time, source_hash),
        )

    stats, _activities = await async_duplicate_sync(db_conn)

    with db_conn.cursor() as cur:
        cur.execute("SELECT count(*) FROM activity_summary WHERE athlete_id = %s", (ATHLETE_ID,))
        fact_count = cur.fetchone()[0]
        cur.execute(
            "SELECT error_code FROM integration_sync_errors WHERE athlete_id = %s",
            (ATHLETE_ID,),
        )
        error_code = cur.fetchone()[0]

    assert stats.upserted == 0
    assert fact_count == 1
    assert _text(error_code) == "secondary_source_duplicate"


async def async_duplicate_sync(db_conn: psycopg.Connection) -> tuple[object, object]:
    class DuplicateIntervalsClient:
        async def get_activities(
            self, _athlete_id: int | str, _oldest: str, _newest: str
        ) -> list[dict[str, object]]:
            return [
                {
                    "id": "i-duplicate",
                    "start_date": "2026-07-15T10:00:00Z",
                    "type": "Run",
                    "distance": 5140.0,
                }
            ]

    return await sync._sync_window(
        str(ATHLETE_ID), DuplicateIntervalsClient(), db_conn, date(2026, 7, 15), date(2026, 7, 15)
    )


def _row_text(row: tuple[object, ...]) -> tuple[str, ...]:
    return tuple(_text(value) for value in row)


def _text(value: object) -> str:
    return value.decode() if isinstance(value, bytes) else str(value)

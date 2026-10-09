from datetime import UTC, datetime, timedelta

# pyright: reportMissingTypeStubs=false
import pytest

from infrastructure.parsing.mapper import StreamRow, map_samples_to_streams, map_to_summary
from infrastructure.parsing.models import FitSample

pytestmark = pytest.mark.no_db


def test_map_hr() -> None:
    sample = FitSample(timestamp=datetime(2026, 1, 1, tzinfo=UTC), heart_rate=150)

    rows = map_samples_to_streams([sample], activity_id="activity-1", athlete_id="athlete-1")

    assert rows == [
        StreamRow(
            sample_time=sample.timestamp,
            activity_id="activity-1",
            athlete_id="athlete-1",
            metric_type="heart_rate",
            value=150.0,
        )
    ]


def test_map_power() -> None:
    sample = FitSample(timestamp=datetime(2026, 1, 1, tzinfo=UTC), power=200)

    rows = map_samples_to_streams([sample], activity_id="activity-1", athlete_id="athlete-1")

    assert rows == [
        StreamRow(
            sample_time=sample.timestamp,
            activity_id="activity-1",
            athlete_id="athlete-1",
            metric_type="power",
            value=200.0,
        )
    ]


def test_skip_none() -> None:
    sample = FitSample(timestamp=datetime(2026, 1, 1, tzinfo=UTC), heart_rate=None)

    rows = map_samples_to_streams([sample], activity_id="activity-1", athlete_id="athlete-1")

    assert all(row.metric_type != "heart_rate" for row in rows)


def test_summary_aggregation() -> None:
    start = datetime(2026, 1, 1, tzinfo=UTC)
    samples = [
        FitSample(timestamp=start + timedelta(seconds=second), power=200) for second in range(3600)
    ]

    summary = map_to_summary(
        samples, activity_id="activity-1", athlete_id="athlete-1", sport="ride"
    )

    assert summary["duration_s"] == 3600
    assert summary["avg_power"] == 200

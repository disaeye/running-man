"""Tests for the biomechanics aggregation and the cadence unit conversion."""

from __future__ import annotations

import pytest

from domain.insights.biomechanics import (
    cadence_to_spm,
    summarize_biomechanics,
)

pytestmark = pytest.mark.no_db


def test_running_cadence_is_doubled_to_steps_per_minute() -> None:
    """A running cadence of 93 rpm is 186 spm."""
    assert cadence_to_spm(93.0, is_running=True) == pytest.approx(186.0)


def test_walking_cadence_keeps_its_raw_value() -> None:
    """A walk records 59.7 rpm; doubling it would claim 119 spm for a walk."""
    assert cadence_to_spm(59.7, is_running=False) == pytest.approx(59.7)


def test_cadence_above_the_per_foot_ceiling_is_kept() -> None:
    """A device that already reports steps per minute is not doubled again."""
    assert cadence_to_spm(180.0, is_running=True) == pytest.approx(180.0)


def test_missing_cadence_stays_missing() -> None:
    """A missing cadence is not zero."""
    assert cadence_to_spm(None, is_running=True) is None
    assert cadence_to_spm(0.0, is_running=True) is None


def test_summary_reports_missing_channels_as_none() -> None:
    """A watch without running dynamics reports no figure, not a zero."""
    summary = summarize_biomechanics(
        {"cadence": [93.0, 94.0]}, is_running=True, source_avg_cadence=93.5
    )
    assert summary.avg_cadence_spm == pytest.approx(187.0)
    assert summary.avg_stride_length_m is None
    assert summary.avg_vertical_oscillation_cm is None
    assert summary.avg_ground_contact_time_ms is None
    assert summary.avg_lr_balance_pct is None
    assert summary.has_any is True


def test_summary_averages_the_stream_channels() -> None:
    """Vertical oscillation and contact time come from the stored stream."""
    summary = summarize_biomechanics(
        {
            "vertical_oscillation": [7.0, 7.4],
            "ground_contact_time": [210.0, 226.0],
            "left_right_balance": [49.0, 51.0],
        },
        is_running=True,
    )
    assert summary.avg_vertical_oscillation_cm == pytest.approx(7.2)
    assert summary.avg_ground_contact_time_ms == pytest.approx(218.0)
    assert summary.avg_lr_balance_pct == pytest.approx(50.0)


def test_summary_counts_the_samples_behind_each_figure() -> None:
    """The sample count is what tells a measured average from a single sample."""
    summary = summarize_biomechanics({"vertical_oscillation": [7.0, 7.4, 7.2]}, is_running=True)
    assert summary.sample_counts["vertical_oscillation"] == 3
    assert summary.sample_counts["ground_contact_time"] == 0


def test_source_average_wins_over_a_short_stream() -> None:
    """The device's own average is used when the stream is too short to average."""
    summary = summarize_biomechanics({"cadence": [93.0]}, is_running=True, source_avg_cadence=95.0)
    assert summary.avg_cadence_spm == pytest.approx(190.0)


def test_empty_streams_report_nothing_measured() -> None:
    """An activity without any of these channels has no biomechanics."""
    summary = summarize_biomechanics({}, is_running=True)
    assert summary.has_any is False

"""Plan quality: intensity balance.

Two defects are pinned here.

Classification used to be by absolute TSS, which is duration × IF²: a 30-minute
interval session (IF ≈ 1.0) totals about 50 and read as low intensity, a
150-minute long run (IF ≈ 0.7) totals about 122 and read as high.

The share was then computed by session count, so a 30-minute interval and a
150-minute long run were equal votes. That made the generator's own default week
— 29.7% of its minutes at high intensity — fail the check, and the check is 25 of
the 100 points.
"""

from datetime import date, datetime, timedelta

from domain.insights.plan_intensity import (
    INTENSITY_DISTRIBUTION_WEIGHT,
    MAX_HIGH_INTENSITY_TIME_SHARE,
)
from domain.insights.plan_intensity import intensity_score as _intensity_score
from domain.workout.plan_generator import WeekPlanOptions, generate_weekly_plan
from domain.workout.prescription import (
    EASY,
    INTERVALS,
    LONG,
    REST,
    TEMPO,
)


def test_interval_session_counts_as_high_intensity() -> None:
    """A 30-minute interval session totals ~50 TSS and is still hard."""
    score = _intensity_score([INTERVALS], [30.0], [50.0])
    assert score < INTENSITY_DISTRIBUTION_WEIGHT


def test_long_run_counts_as_low_intensity() -> None:
    """A 150-minute long run totals ~122 TSS and is still aerobic volume."""
    score = _intensity_score([LONG], [150.0], [122.0])
    assert score == INTENSITY_DISTRIBUTION_WEIGHT


def test_the_share_is_weighted_by_minutes_not_sessions() -> None:
    # Two 30-minute interval sessions among four short easy runs is 50% of the
    # sessions but 2 of 5 hours — the count-based check rejected it.
    types = [INTERVALS, INTERVALS, EASY, EASY, EASY, EASY]
    minutes = [30.0, 30.0, 60.0, 60.0, 60.0, 60.0]

    score = _intensity_score(types, minutes, [50.0] * 6)

    assert score == INTENSITY_DISTRIBUTION_WEIGHT


def test_two_hours_of_intervals_is_still_flagged() -> None:
    types = [INTERVALS, INTERVALS, EASY, EASY]
    minutes = [60.0, 60.0, 30.0, 30.0]

    score = _intensity_score(types, minutes, [50.0] * 4)

    assert score < INTENSITY_DISTRIBUTION_WEIGHT


def test_generator_week_has_a_distance_for_each_running_session() -> None:
    """Every generated running session carries a distance derived from pace."""
    days = generate_weekly_plan(
        target_weekly_distance_m=42000.0,
        options=WeekPlanOptions(
            rest_days=1,
            training_paces={
                "easy": {"min": 340.0, "max": 390.0},
                "threshold": {"min": 270.0, "max": 285.0},
                "interval": {"min": 245.0, "max": 260.0},
            },
        ),
    )
    trained = [day for day in days if day.workout_type != REST]
    types = [day.workout_type for day in trained]
    minutes = [float(day.duration_min) for day in trained]
    distance_m = [float(day.target_distance_m or 0) for day in trained]

    high_minutes = sum(
        minute for workout_type, minute in zip(types, minutes) if workout_type in (INTERVALS, TEMPO)
    )
    assert high_minutes / sum(minutes) < MAX_HIGH_INTENSITY_TIME_SHARE

    assert len(distance_m) == len(trained)
    assert all(distance > 0 for distance in distance_m)


def test_mostly_hard_week_scores_worse_than_mostly_easy() -> None:
    easy_week = _intensity_score([LONG, EASY, EASY, EASY], [150, 45, 45, 45], [120, 45, 45, 45])
    hard_week = _intensity_score(
        [INTERVALS, TEMPO, INTERVALS, TEMPO], [60, 60, 60, 60], [50, 70, 50, 70]
    )
    assert hard_week < easy_week


def test_missing_durations_fall_back_to_session_counts() -> None:
    # A plan whose prescriptions carry no durations still scores.
    score = _intensity_score([LONG, EASY, EASY, EASY], [0.0, 0.0, 0.0, 0.0], [120.0, 45, 45, 45])
    assert score == INTENSITY_DISTRIBUTION_WEIGHT


def test_events_without_a_type_fall_back_to_tss_buckets() -> None:
    from domain.insights.plan_quality import compute_plan_quality

    start = date(2026, 10, 12)
    events = [
        {
            "start_time": datetime(2026, 10, 12 + offset, 6, 0),
            "predicted_tss": tss,
        }
        for offset, tss in enumerate([120.0, 45.0, 45.0, 45.0])
    ]

    quality = compute_plan_quality(events, [], start, start + timedelta(days=6))

    assert 0 <= quality["score"] <= 100

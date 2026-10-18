"""Consecutive hard days.

A hard day is defined relative to the athlete's own chronic load. The rule used
to be a flat 100 TSS, which is an ordinary Tuesday at CTL 100 and impossible at
CTL 25 — so it marked every session hard for one athlete and none for another.
"""

from domain.insights.hard_days import (
    MIN_HARD_TSS,
    detect_consecutive_hard_days,
)


def test_relative_rule_flags_days_well_above_chronic_load() -> None:
    # CTL 80 → hard above 120.
    daily_tss = [60.0, 130.0, 140.0, 70.0]
    daily_ctl = [80.0, 80.0, 80.0, 80.0]

    runs = detect_consecutive_hard_days(daily_tss, daily_ctl)

    assert runs == [(1, 2)]


def test_relative_rule_does_not_flag_a_novice_week() -> None:
    # CTL 20 → the floor applies, so 60 TSS is not hard.
    daily_tss = [45.0, 50.0, 55.0]
    daily_ctl = [20.0, 20.0, 20.0]

    assert detect_consecutive_hard_days(daily_tss, daily_ctl) == []


def test_relative_rule_flags_two_big_days_for_a_trained_athlete() -> None:
    daily_tss = [120.0, 300.0, 320.0]
    daily_ctl = [120.0, 120.0, 120.0]

    assert detect_consecutive_hard_days(daily_tss, daily_ctl) == [(1, 2)]


def test_ignores_single_hard_days() -> None:
    daily_tss = [120.0, 50.0, 130.0]

    assert detect_consecutive_hard_days(daily_tss, [50.0, 50.0, 50.0]) == []


def test_floor_applies_without_history() -> None:
    daily_tss = [MIN_HARD_TSS - 5, MIN_HARD_TSS + 5, MIN_HARD_TSS + 10]

    assert detect_consecutive_hard_days(daily_tss) == [(1, 2)]


def test_explicit_threshold_is_strictly_greater_than() -> None:
    daily_tss = [100.0, 101.0, 102.0]

    assert detect_consecutive_hard_days(daily_tss, threshold=100.0) == [(1, 2)]


def test_custom_threshold() -> None:
    daily_tss = [75.0, 81.0, 90.0, 70.0]

    assert detect_consecutive_hard_days(daily_tss, threshold=80.0) == [(1, 2)]

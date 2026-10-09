from domain.insights.hard_days import detect_consecutive_hard_days


def test_detects_single_consecutive_hard_day_run() -> None:
    daily_tss = [40.0, 110.0, 120.0, 80.0]

    runs = detect_consecutive_hard_days(daily_tss)

    assert runs == [(1, 2)]


def test_detects_multiple_runs_and_inclusive_end_indexes() -> None:
    daily_tss = [120.0, 130.0, 90.0, 101.0, 105.0, 115.0]

    runs = detect_consecutive_hard_days(daily_tss)

    assert runs == [(0, 1), (3, 5)]


def test_ignores_single_hard_days() -> None:
    daily_tss = [120.0, 50.0, 130.0]

    assert detect_consecutive_hard_days(daily_tss) == []


def test_threshold_is_strictly_greater_than() -> None:
    daily_tss = [100.0, 101.0, 102.0]

    assert detect_consecutive_hard_days(daily_tss) == [(1, 2)]


def test_custom_threshold() -> None:
    daily_tss = [75.0, 81.0, 90.0, 70.0]

    assert detect_consecutive_hard_days(daily_tss, threshold=80.0) == [(1, 2)]

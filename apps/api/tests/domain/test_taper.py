from datetime import date, timedelta

from domain.insights.taper import assess_taper


def test_detects_taper_in_race_window_with_week_over_week_drop() -> None:
    start = date(2026, 6, 1)
    daily_loads = [
        *[_load(start + timedelta(days=day), 100.0, -5.0) for day in range(7)],
        *[_load(start + timedelta(days=7 + day), 70.0, 12.0) for day in range(7)],
    ]

    result = assess_taper(daily_loads, date(2026, 6, 28))

    assert result.is_tapering is True
    assert result.freshness_ok is True
    assert result.recommended_reduction_pct == 15.0
    assert result.days_to_race == 14


def test_requires_more_than_fifteen_percent_weekly_drop() -> None:
    start = date(2026, 6, 1)
    daily_loads = [
        *[_load(start + timedelta(days=day), 100.0, 8.0) for day in range(7)],
        *[_load(start + timedelta(days=7 + day), 90.0, 8.0) for day in range(7)],
    ]

    result = assess_taper(daily_loads, date(2026, 6, 28))

    assert result.is_tapering is False
    assert result.freshness_ok is False
    assert result.recommended_reduction_pct == 15.0


def test_requires_some_current_week_intensity() -> None:
    start = date(2026, 6, 1)
    daily_loads = [
        *[_load(start + timedelta(days=day), 100.0, 11.0) for day in range(7)],
        *[_load(start + timedelta(days=7 + day), 0.0, 11.0) for day in range(7)],
    ]

    result = assess_taper(daily_loads, date(2026, 6, 28))

    assert result.is_tapering is False
    assert result.freshness_ok is True


def test_race_outside_window_does_not_recommend_taper() -> None:
    start = date(2026, 6, 1)
    daily_loads = [_load(start + timedelta(days=day), 80.0, 15.0) for day in range(14)]

    result = assess_taper(daily_loads, date(2026, 7, 14))

    assert result.is_tapering is False
    assert result.recommended_reduction_pct == 0.0
    assert result.days_to_race == 30


def test_missing_race_date_has_unknown_days_to_race() -> None:
    result = assess_taper([], None)

    assert result.is_tapering is False
    assert result.freshness_ok is False
    assert result.recommended_reduction_pct == 0.0
    assert result.days_to_race is None


def _load(day: date, tss: float, tsb: float) -> dict[str, object]:
    return {"day": day, "tss": tss, "tsb": tsb}

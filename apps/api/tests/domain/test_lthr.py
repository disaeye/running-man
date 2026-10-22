import pytest

from domain.physiology.lthr import (
    MIN_GAP_BELOW_HRMAX,
    WINDOW_20MIN_TO_LTHR,
    best_window_average,
    estimate_lthr,
)


def test_lthr_converts_a_twenty_minute_max_by_its_five_percent_offset() -> None:
    """A 20-minute maximal window sits above threshold; the estimate corrects for it.

    Applying no correction (or 0.98) reads the peak of a hard effort as the
    threshold itself, and every zone built on LTHR then sits a few bpm high.
    """
    result = estimate_lthr([166, 170, 174, 180, 185], [])

    assert result["data_sufficient"] is True
    assert result["method"] == "best_effort_window"
    assert result["lthr"] == round(185 * WINDOW_20MIN_TO_LTHR)
    assert result["source_20min"] == round(185 * WINDOW_20MIN_TO_LTHR)
    assert result["source_60min"] is None
    # The threshold is below every hard window it was derived from.
    assert result["lthr"] < min([166, 170, 174, 180, 185]) + 20


def test_lthr_keeps_a_sixty_minute_rate_as_a_lower_bound() -> None:
    """A rate sustained for an hour proves threshold is at least that high."""
    result = estimate_lthr([168, 172, 176, 180, 184], [170, 176, 183])

    assert result["lthr"] == pytest.approx(183, abs=2)
    assert result["source_20min"] == round(184 * WINDOW_20MIN_TO_LTHR)
    assert result["source_60min"] == 183


def test_lthr_never_reaches_maximal_heart_rate() -> None:
    """A threshold at the ceiling is impossible, so it is clamped below it."""
    result = estimate_lthr([188, 190, 192, 194, 196], [196], hr_max=195)

    assert result["lthr"] == 195 - MIN_GAP_BELOW_HRMAX
    assert result["confidence"] == "low"


def test_lthr_uses_the_higher_of_the_two_windows_without_exceeding_max() -> None:
    result = estimate_lthr([180, 182, 184, 186, 188], [185], hr_max=190)

    assert result["lthr"] == 185
    assert result["lthr"] < 190


def test_lthr_insufficient_hard_efforts_returns_none() -> None:
    result = estimate_lthr([175, 178, 181, 184], [182])

    assert result == {
        "lthr": None,
        "method": None,
        "confidence": None,
        "data_sufficient": False,
        "near_threshold_count": 0,
    }


def test_lthr_non_running_or_unqualified_inputs_have_no_windows() -> None:
    result = estimate_lthr([], [])

    assert result["lthr"] is None
    assert result["data_sufficient"] is False


def test_lthr_ignores_invalid_zero_and_negative_windows() -> None:
    result = estimate_lthr([0, -10, 168, 174, 179, 183, 186], [0, -20, 180])

    assert result["data_sufficient"] is True
    # 186 x 0.95 is below the 180 that was actually held for an hour.
    assert result["lthr"] == 180
    assert result["source_20min"] == round(186 * WINDOW_20MIN_TO_LTHR)


def test_lthr_best_window_average_finds_peak_sustained_segment() -> None:
    samples = [140, 142, 145, 180, 182, 184, 186, 150]

    result = best_window_average(samples, sample_interval_s=300, window_s=1200)

    assert result == pytest.approx(183, abs=0.1)


def test_lthr_best_window_average_returns_none_for_short_activity() -> None:
    result = best_window_average([170, 172, 174], sample_interval_s=300, window_s=1200)

    assert result is None

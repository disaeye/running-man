import pytest

from domain.physiology.lthr import best_window_average, estimate_lthr


def test_lthr_uses_98_percent_of_best_20_minute_effort() -> None:
    result = estimate_lthr([166, 170, 174, 180, 185], [])

    assert result["data_sufficient"] is True
    assert result["method"] == "best_effort_window"
    assert result["lthr"] == pytest.approx(181, abs=2)
    assert result["source_20min"] == 181
    assert result["source_60min"] is None


def test_lthr_prefers_higher_60_minute_effort_over_20_minute_estimate() -> None:
    result = estimate_lthr([168, 172, 176, 180, 184], [170, 176, 183])

    assert result["lthr"] == pytest.approx(183, abs=2)
    assert result["source_20min"] == 180
    assert result["source_60min"] == 183


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
    assert result["lthr"] == pytest.approx(182, abs=2)
    assert result["source_20min"] == 182


def test_lthr_best_window_average_finds_peak_sustained_segment() -> None:
    samples = [140, 142, 145, 180, 182, 184, 186, 150]

    result = best_window_average(samples, sample_interval_s=300, window_s=1200)

    assert result == pytest.approx(183, abs=0.1)


def test_lthr_best_window_average_returns_none_for_short_activity() -> None:
    result = best_window_average([170, 172, 174], sample_interval_s=300, window_s=1200)

    assert result is None

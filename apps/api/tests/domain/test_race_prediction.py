"""Tests for race prediction domain — Riegel formula + critical-speed cross-check."""

import pytest

from domain.physiology.threshold_pace import EffortPoint
from domain.race.prediction import (
    RIEGEL_EXPONENT,
    critical_speed_predict,
    critical_speed_time,
    predict_distances,
    predict_race,
    riegel_predict,
    select_basis_from_prs,
)


def _effort(distance_m: float, duration_s: float) -> EffortPoint:
    return EffortPoint(distance_m=distance_m, duration_s=duration_s)


def _four_efforts() -> list[EffortPoint]:
    # Same dataset as test_threshold_pace.py → CS ≈ 3.704 m/s, W' ≈ 200 m.
    return [
        _effort(1311.11, 300),
        _effort(2422.22, 600),
        _effort(4644.44, 1200),
        _effort(9088.89, 2400),
    ]


# --- Riegel formula ---------------------------------------------------------


def test_riegel_predict_5k_to_10k_doubles_time_with_exponent() -> None:
    predicted = riegel_predict(1200, 5000, 10000)
    assert predicted == pytest.approx(1200 * 2**RIEGEL_EXPONENT, rel=1e-6)


def test_riegel_predict_marathon_from_5k_matches_reference() -> None:
    assert riegel_predict(1200, 5000, 42195) == pytest.approx(11509, abs=2)


def test_riegel_predict_same_distance_returns_input() -> None:
    assert riegel_predict(1200, 5000, 5000) == pytest.approx(1200)


def test_riegel_predict_rejects_non_positive_inputs() -> None:
    with pytest.raises(ValueError):
        riegel_predict(0, 5000, 10000)
    with pytest.raises(ValueError):
        riegel_predict(1200, 0, 10000)
    with pytest.raises(ValueError):
        riegel_predict(1200, 5000, 0)


# --- predict_distances ------------------------------------------------------


def test_predict_distances_returns_four_standard_distances() -> None:
    preds = predict_distances(1200, 5000)
    assert [p["label"] for p in preds] == ["5K", "10K", "half_marathon", "marathon"]
    assert [p["distance_m"] for p in preds] == [5000, 10000, 21097, 42195]
    for p in preds:
        assert p["time_s"] > 0
        assert p["pace_s_per_km"] == pytest.approx(p["time_s"] / p["distance_m"] * 1000, rel=1e-3)


def test_predict_distances_5k_input_passes_through_unchanged() -> None:
    preds = predict_distances(1200, 5000)
    assert preds[0]["time_s"] == pytest.approx(1200, abs=0.5)


# --- critical-speed cross-check --------------------------------------------


def test_critical_speed_predict_sufficient_efforts_returns_fit() -> None:
    fit = critical_speed_predict(_four_efforts())
    assert fit["data_sufficient"] is True
    assert fit["method"] == "critical_speed_model"
    assert fit["critical_speed_ms"] == pytest.approx(3.704, abs=0.01)
    assert fit["w_prime_m"] == pytest.approx(200, abs=5)


def test_critical_speed_predict_insufficient_efforts_is_empty() -> None:
    fit = critical_speed_predict([_effort(5000, 1300), _effort(8000, 2200)])
    assert fit["data_sufficient"] is False
    assert fit["critical_speed_ms"] is None
    assert fit["w_prime_m"] is None


def test_critical_speed_time_uses_curvature_model() -> None:
    assert critical_speed_time(3.704, 200, 10000) == pytest.approx((10000 - 200) / 3.704, rel=1e-3)


def test_critical_speed_time_below_wprime_falls_back_to_threshold_ceiling() -> None:
    # Distance shorter than W' → use the D/CS ceiling (sustainable pace).
    assert critical_speed_time(4.0, 2000, 1000) == pytest.approx(1000 / 4.0)


def test_critical_speed_time_zero_speed_returns_none() -> None:
    assert critical_speed_time(0.0, 200, 5000) is None


# --- select_basis_from_prs --------------------------------------------------


def test_select_basis_prefers_longest_up_to_half_marathon() -> None:
    prs = [
        {"distance_m": 1000, "best_value": 200},
        {"distance_m": 5000, "best_value": 1200},
        {"distance_m": 10000, "best_value": 2700},
    ]
    basis = select_basis_from_prs(prs)
    assert basis is not None
    assert basis["distance_m"] == 10000
    assert basis["time_s"] == 2700


def test_select_basis_falls_back_to_marathon_only() -> None:
    prs = [{"distance_m": 42195, "best_value": 11000}]
    basis = select_basis_from_prs(prs)
    assert basis is not None
    assert basis["distance_m"] == 42195


def test_select_basis_returns_none_when_empty() -> None:
    assert select_basis_from_prs([]) is None


# --- predict_race orchestrator ----------------------------------------------


def test_predict_race_with_cross_check_is_high_confidence_when_models_agree() -> None:
    # Basis ~4.64K @ 20:00 sits on the fitted CS line → 5K (nearest) agrees < 5%.
    result = predict_race(1200, 4644.44, _four_efforts())
    assert result["data_sufficient"] is True
    assert len(result["predictions"]) == 4
    assert result["confidence"] == "high"
    five_k = result["predictions"][0]
    assert five_k["method"] == "riegel"
    assert "cross_check" in five_k
    assert abs(five_k["cross_check"]["delta_pct"]) < 5  # type: ignore[index]
    assert result["basis"]["exponent"] == 1.06  # type: ignore[index]


def test_predict_race_without_efforts_is_single_method_medium_confidence() -> None:
    result = predict_race(1200, 5000, [])
    assert result["data_sufficient"] is True
    assert all("cross_check" not in p for p in result["predictions"])
    assert result["confidence"] == "medium"
    assert result["basis"]["cross_check"]["data_sufficient"] is False  # type: ignore[index]


def test_predict_race_short_basis_without_cross_check_is_low_confidence() -> None:
    assert predict_race(180, 1000, [])["confidence"] == "low"


def test_predict_race_invalid_basis_returns_empty_bundle() -> None:
    result = predict_race(0, 5000, [])
    assert result["data_sufficient"] is False
    assert result["predictions"] == []
    assert result["basis"] is None


def test_predict_race_records_recent_effort_and_exponent() -> None:
    basis = predict_race(1200, 5000, [])["basis"]
    assert basis is not None
    assert basis["recent_time_s"] == 1200  # type: ignore[index]
    assert basis["recent_distance_m"] == 5000  # type: ignore[index]
    assert basis["method"] == "riegel"  # type: ignore[index]


def test_predict_race_divergent_models_yield_low_confidence() -> None:
    # Very fast short-distance efforts → CS implies much faster than Riegel at long distance.
    fast_efforts = [_effort(1500, 240), _effort(1600, 260), _effort(1700, 280), _effort(1800, 300)]
    result = predict_race(3000, 10000, fast_efforts)
    # Nearest target to 10K basis is 10K; CS sprint-bias should diverge strongly.
    assert result["confidence"] in {"medium", "low"}

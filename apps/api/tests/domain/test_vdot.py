"""VDOT and the training paces derived from it.

Every assertion here is pinned against Daniels' published tables rather than a
direction, because a direction holds for any monotone formula: the model read
VDOT 60 for a 5K in 20:00 (published: 49.8) while every ordering assertion
passed.
"""

import pytest

from domain.physiology.vdot import (
    _fraction_vo2max_utilized,
    _vo2_from_velocity,
    training_paces,
    vdot_from_efforts,
    vdot_from_performance,
    vdot_to_threshold_pace,
)

# Daniels' table for VDOT 50, in s/km: the fast and slow end of each range.
# Single-pace rows in the table (interval 3:55, repetition 3:38) sit inside the
# computed range.
DANIELS_VDOT_50 = {
    "easy": (334, 373),        # 5:34–6:13
    "marathon": (278, 287),    # 4:38–4:47
    "threshold": (255, 268),   # 4:15–4:28
    "interval": (234, 240),    # 3:54–4:00
    "repetition": (213, 221),  # 3:33–3:41
}


def test_oxygen_cost_matches_daniels_quadratic() -> None:
    # 250 m/min is 20:00 for 5 km.
    assert _vo2_from_velocity(250) == pytest.approx(47.46, abs=0.02)
    # Standing still still costs the intercept.
    assert _vo2_from_velocity(0) == pytest.approx(-4.60, abs=0.001)


def test_fraction_curve_matches_daniels_values() -> None:
    # 20 minutes → 95.3%; 60 minutes → 89.0%.
    assert _fraction_vo2max_utilized(1200) == pytest.approx(0.953, abs=0.002)
    assert _fraction_vo2max_utilized(3600) == pytest.approx(0.890, abs=0.005)
    assert _fraction_vo2max_utilized(180) == 1.0


def test_vdot_from_5k_20min_matches_the_published_table() -> None:
    assert vdot_from_performance(5000, 1200) == pytest.approx(49.8, abs=0.2)


def test_one_runner_scores_consistently_across_distances() -> None:
    # 5K 20:00, 10K 41:20 and a half in 1:31:34 are the same athlete.
    scores = [
        vdot_from_performance(5000, 1200),
        vdot_from_performance(10000, 2480),
        vdot_from_performance(21097.5, 5494),
    ]
    assert all(score is not None for score in scores)
    rounded = [score for score in scores if score is not None]
    assert max(rounded) - min(rounded) <= 0.5


def test_marathon_3h_returns_higher_than_5k_slower() -> None:
    fast = vdot_from_performance(42195, 10800)
    slow_5k = vdot_from_performance(5000, 1500)
    assert fast is not None
    assert slow_5k is not None
    assert fast > slow_5k


def test_vdot_rejects_short_efforts() -> None:
    assert vdot_from_performance(800, 150) is None


def test_vdot_rejects_invalid_inputs() -> None:
    assert vdot_from_performance(0, 1200) is None
    assert vdot_from_performance(5000, 0) is None
    assert vdot_from_performance(-100, 1200) is None


def test_vdot_from_efforts_takes_best() -> None:
    efforts = [(5000, 1500), (10000, 3000), (42195, 12600)]
    best = vdot_from_efforts(efforts)
    individual = [vdot_from_performance(d, t) for d, t in efforts]
    assert best is not None
    assert best == max(v for v in individual if v is not None)


def test_vdot_from_efforts_skips_short_distances() -> None:
    assert vdot_from_efforts([(400, 60)]) is None


def test_training_paces_reproduce_daniels_table_for_vdot_50() -> None:
    paces = training_paces(50.0)
    for intensity, (low, high) in DANIELS_VDOT_50.items():
        assert paces[intensity]["min"] == pytest.approx(low, abs=4), intensity
        assert paces[intensity]["max"] == pytest.approx(high, abs=4), intensity


def test_easy_pace_is_not_threshold_pace() -> None:
    # The failure mode this guards: easy running prescribed at 4:45/km for a
    # VDOT 50 runner, which is a little slower than their half-marathon pace.
    paces = training_paces(50.0)
    assert paces["easy"]["min"] >= 330, "easy pace must be slower than 5:30/km"
    assert paces["easy"]["min"] > paces["threshold"]["max"]


def test_training_paces_ordered_easy_slowest_to_repetition_fastest() -> None:
    paces = training_paces(55.0)
    assert paces["easy"]["max"] > paces["threshold"]["max"]
    assert paces["interval"]["min"] < paces["threshold"]["max"]
    assert paces["repetition"]["min"] < paces["interval"]["min"]


def test_vdot_to_threshold_pace_matches_daniels() -> None:
    # Threshold at 88% of VDOT 50 → 4:15/km.
    assert vdot_to_threshold_pace(50.0) == pytest.approx(256, abs=3)


def test_vdot_to_threshold_pace_decreases_as_vdot_increases() -> None:
    assert vdot_to_threshold_pace(70.0) < vdot_to_threshold_pace(40.0)


def test_training_paces_invalid_vdot_returns_empty() -> None:
    assert training_paces(0.0) == {}


def test_fraction_curve_monotonic_and_bounded() -> None:
    assert _fraction_vo2max_utilized(300) > _fraction_vo2max_utilized(3600)
    assert _fraction_vo2max_utilized(3600) > _fraction_vo2max_utilized(72000)
    assert _fraction_vo2max_utilized(120) == 1.0
    assert 0.0 < _fraction_vo2max_utilized(72000) <= 1.0

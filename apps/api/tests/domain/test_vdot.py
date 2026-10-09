
from domain.physiology.vdot import (
    training_paces,
    vdot_from_efforts,
    vdot_from_performance,
    vdot_to_threshold_pace,
)


def test_vdot_from_5k_20min_returns_positive_value() -> None:
    # 5K in 20:00 — a sub-elite recreational effort.
    vdot = vdot_from_performance(5000, 1200)
    assert vdot is not None
    assert 45 < vdot < 70


def test_vdot_from_marathon_3h_returns_higher_than_5k_slower() -> None:
    # A 3:00 marathon demands more aerobic power than a 25:00 5K.
    fast = vdot_from_performance(42195, 10800)
    slow_5k = vdot_from_performance(5000, 1500)
    assert fast is not None
    assert slow_5k is not None
    assert fast > slow_5k


def test_vdot_rejects_short_efforts() -> None:
    # Efforts under 3 minutes are too anaerobic for the model.
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
    # Only a 400m effort — below the 1500m minimum.
    assert vdot_from_efforts([(400, 60)]) is None


def test_training_paces_ordered_easy_slowest_to_repetition_fastest() -> None:
    vdot = 55.0
    paces = training_paces(vdot)
    easy = paces["easy"]["max"]  # slowest easy pace
    threshold = paces["threshold"]["max"]
    interval = paces["interval"]["min"]  # fastest interval pace
    # Easy is slower (larger s/km) than threshold; interval is faster (smaller).
    assert easy > threshold
    assert interval < threshold


def test_vdot_to_threshold_pace_decreases_as_vdot_increases() -> None:
    # Higher ability → faster (smaller s/km) threshold pace.
    slow_runner = vdot_to_threshold_pace(40.0)
    fast_runner = vdot_to_threshold_pace(70.0)
    assert fast_runner < slow_runner


def test_training_paces_invalid_vdot_returns_empty() -> None:
    assert training_paces(0.0) == {}


def test_fraction_curve_clamped_and_monotonic() -> None:
    from domain.physiology.vdot import _fraction_vo2max_utilized

    # Fraction decreases as duration increases (longer = lower % utilization).
    frac_5min = _fraction_vo2max_utilized(300)
    frac_60min = _fraction_vo2max_utilized(3600)
    frac_ultra = _fraction_vo2max_utilized(72000)
    assert frac_5min > frac_60min > frac_ultra
    # Never exceeds 1.0 or drops below the 0.60 floor.
    assert _fraction_vo2max_utilized(120) == 1.0
    assert frac_ultra >= 0.60

"""TDD golden tests for aerobic decoupling (EF drift between halves)."""

import pytest

from domain.load.constants import MIN_DURATION_SECONDS
from domain.load.decoupling import aerobic_decoupling


def test_stable_effort_low_decoupling() -> None:
    # Steady 30 min at 200W, HR 150 bpm -> decoupling ≈ 0% (<5%)
    duration = MIN_DURATION_SECONDS + 600  # 30 min
    power = [200.0] * duration
    hr = [150.0] * duration

    decoupling = aerobic_decoupling(power, hr)

    assert decoupling is not None
    assert decoupling == pytest.approx(0.0, abs=5.0)


def test_fatigue_drift_high_decoupling() -> None:
    # Constant power, HR drifts up in second half -> EF drops -> high decoupling
    half = MIN_DURATION_SECONDS // 2  # 10 min per half (20 min total)
    power = [200.0] * (2 * half)
    hr = [140.0] * half + [170.0] * half  # HR climbs 30 bpm

    decoupling = aerobic_decoupling(power, hr)

    assert decoupling is not None
    assert decoupling > 5.0


def test_too_short_returns_none() -> None:
    # 19 min only -> below 20 min minimum
    short = MIN_DURATION_SECONDS - 60
    power = [200.0] * short
    hr = [150.0] * short

    assert aerobic_decoupling(power, hr) is None


def test_high_variability_returns_none() -> None:
    # Alternating intervals -> VI > 1.05 -> None
    duration = MIN_DURATION_SECONDS + 600  # 30 min
    # Alternate 60s at 300W and 60s at 100W (very high variability)
    power = []
    for i in range(duration // 60):
        power.extend([300.0] * 30 + [100.0] * 30)
    power = power[:duration]
    hr = [150.0] * duration

    assert aerobic_decoupling(power, hr) is None


def test_length_mismatch_returns_none() -> None:
    power = [200.0] * MIN_DURATION_SECONDS
    hr = [150.0] * (MIN_DURATION_SECONDS - 1)

    assert aerobic_decoupling(power, hr) is None

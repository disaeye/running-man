"""Aerobic decoupling: EF drift between the first and second half.

The duration guard used to compare the sample count against a 1200-second
minimum, which is only a duration for 1 Hz streams. A 20-minute effort recorded
at 5-second intervals has 240 samples and was rejected outright; a 30-minute
effort at 3-second intervals has 600 samples and passed. The tests below pin
both directions.
"""

import pytest

from domain.load.constants import MIN_DURATION_SECONDS
from domain.load.decoupling import aerobic_decoupling


def test_stable_effort_low_decoupling() -> None:
    duration = MIN_DURATION_SECONDS + 600  # 30 min at 1 Hz
    power = [200.0] * duration
    hr = [150.0] * duration

    decoupling = aerobic_decoupling(power, hr, duration_s=float(duration))

    assert decoupling is not None
    assert decoupling == pytest.approx(0.0, abs=5.0)


def test_fatigue_drift_high_decoupling() -> None:
    half = MIN_DURATION_SECONDS // 2  # 10 min per half
    power = [200.0] * (2 * half)
    hr = [140.0] * half + [170.0] * half

    decoupling = aerobic_decoupling(power, hr, duration_s=float(2 * half))

    assert decoupling is not None
    assert decoupling > 5.0


def test_too_short_returns_none() -> None:
    short = MIN_DURATION_SECONDS - 60
    power = [200.0] * short
    hr = [150.0] * short

    assert aerobic_decoupling(power, hr, duration_s=float(short)) is None


def test_five_second_stream_over_twenty_minutes_is_accepted() -> None:
    # 20 minutes at 5 s intervals is 240 samples — far below 1200, but the
    # elapsed time is what the steady-state window is about.
    duration = MIN_DURATION_SECONDS + 600
    samples = duration // 5
    power = [200.0] * samples
    hr = [140.0] * (samples // 2) + [170.0] * (samples - samples // 2)

    decoupling = aerobic_decoupling(power, hr, duration_s=float(duration))

    assert decoupling is not None
    assert decoupling > 5.0


def test_high_sample_count_without_duration_is_rejected() -> None:
    # 600 samples at 1 Hz is 10 minutes, not 20.
    power = [200.0] * 600
    hr = [150.0] * 600

    assert aerobic_decoupling(power, hr, duration_s=600.0) is None


def test_high_variability_returns_none() -> None:
    duration = MIN_DURATION_SECONDS + 600
    power: list[float] = []
    for _ in range(duration // 60):
        power.extend([300.0] * 30 + [100.0] * 30)
    power = power[:duration]
    hr = [150.0] * duration

    assert aerobic_decoupling(power, hr, duration_s=float(duration)) is None


def test_length_mismatch_returns_none() -> None:
    power = [200.0] * MIN_DURATION_SECONDS
    hr = [150.0] * (MIN_DURATION_SECONDS - 1)

    assert aerobic_decoupling(
        power, hr, duration_s=float(MIN_DURATION_SECONDS)
    ) is None


def test_pair_by_time_aligns_streams_with_different_rates() -> None:
    from domain.load.decoupling import pair_by_time

    # Pace at 5 s intervals, HR at 1 s intervals, both starting at t=0.
    pace_times = [0.0, 5.0, 10.0, 15.0, 20.0]
    pace_values = [3.0, 3.1, 3.2, 3.3, 3.4]
    hr_times = [0.0, 1.0, 2.0, 3.0, 4.0, 5.0, 6.0]
    hr_values = [140.0, 141.0, 142.0, 143.0, 144.0, 145.0, 146.0]

    effort, cardio = pair_by_time(pace_times, pace_values, hr_times, hr_values)

    assert len(effort) == len(cardio) == 7
    # Each HR sample takes the nearest pace sample, so 0-2 s map to 0 s,
    # 3-5 s to 5 s, and 6 s (1 s from 5 s) also to 5 s.
    assert list(zip(effort, cardio)) == [
        (3.0, 140.0),
        (3.0, 141.0),
        (3.0, 142.0),
        (3.1, 143.0),
        (3.1, 144.0),
        (3.1, 145.0),
        (3.1, 146.0),
    ]


def test_pair_by_time_drops_samples_outside_the_tolerance() -> None:
    from domain.load.decoupling import pair_by_time

    effort, cardio = pair_by_time([0.0], [3.0], [601.0], [150.0])

    assert effort == ()
    assert cardio == ()

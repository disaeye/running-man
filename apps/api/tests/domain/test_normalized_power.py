import pytest

from domain.load.normalized_power import normalized_power


def test_np_constant_200w_for_1hour() -> None:
    watts = [200.0] * 3600

    power = normalized_power(watts)

    assert power == pytest.approx(200.0, abs=0.1)


def test_np_too_short_returns_none() -> None:
    assert normalized_power([200.0] * 29) is None


def test_np_intervals_higher_than_avg() -> None:
    watts = [300.0] * 60 + [0.0] * 60 + [300.0] * 60 + [0.0] * 60

    power = normalized_power(watts)

    average_power = sum(watts) / len(watts)

    assert power is not None
    assert power > average_power

"""ACWR (acute:chronic workload ratio) behaviour.

The ratio is only meaningful once a chronic window of history exists. Before
that the denominator is a partial window or zero, and returning a number for it
produced a finding out of nothing: ``0.0`` is labelled "减量风险" (detraining
risk) by the contract, so a brand-new athlete — or anyone whose first activity
arrived after a break — was told their load had dropped sharply.

``None`` is the honest answer and the contract's ``insufficient_load_history``
null semantics describe exactly it. These tests pin when a number is reported
and when it is not.
"""

import pytest

from domain.load.acwr import MIN_HISTORY_DAYS, compute_acwr
from domain.load.constants import ACUTE_WINDOW_DAYS, CHRONIC_WINDOW_DAYS


def test_steady_state_load_yields_unity_acwr() -> None:
    # Constant daily load for longer than a chronic window: acute and chronic
    # converge on the same value, so the ratio approaches 1.0.
    daily = [100.0] * (CHRONIC_WINDOW_DAYS + ACUTE_WINDOW_DAYS + 20)

    ratios = compute_acwr(daily)

    assert ratios[-1] == pytest.approx(1.0, abs=0.02)


def test_high_risk_sudden_spike_exceeds_threshold() -> None:
    # 30 days at 100, then a week at 300.
    daily = [100.0] * 30 + [300.0] * ACUTE_WINDOW_DAYS

    ratios = compute_acwr(daily)

    assert ratios[-1] is not None
    assert ratios[-1] > 1.5


class TestInsufficientHistory:
    def test_the_first_days_report_none_not_zero(self) -> None:
        # The regression: these used to be 0.0, which the UI labels as a
        # detraining risk.
        daily = [100.0] * 10

        ratios = compute_acwr(daily)

        assert all(ratio is None for ratio in ratios)

    def test_a_number_appears_once_the_window_is_full(self) -> None:
        daily = [100.0] * MIN_HISTORY_DAYS

        ratios = compute_acwr(daily)

        assert ratios[MIN_HISTORY_DAYS - 2] is None
        assert ratios[MIN_HISTORY_DAYS - 1] is not None

    def test_all_zero_load_reports_none_not_zero(self) -> None:
        # Zero load means the ratio is undefined, not that the athlete is in
        # detraining risk.
        daily = [0.0] * 60

        ratios = compute_acwr(daily)

        assert all(ratio is None for ratio in ratios)

    def test_a_negligible_chronic_load_does_not_produce_a_huge_ratio(self) -> None:
        # Coming back from a long break: a few minutes of walking is not a
        # baseline, and dividing by it would report an enormous spike.
        daily = [0.0] * (MIN_HISTORY_DAYS - 1) + [0.2] * 10

        ratios = compute_acwr(daily)

        assert all(ratio is None or ratio < 100 for ratio in ratios)

    def test_history_shorter_than_the_window_is_entirely_none(self) -> None:
        daily = [50.0] * (MIN_HISTORY_DAYS - 1)

        assert all(ratio is None for ratio in compute_acwr(daily))


def test_ratios_length_matches_input() -> None:
    daily = [100.0] * 40

    assert len(compute_acwr(daily)) == len(daily)


def test_empty_input_returns_empty() -> None:
    assert compute_acwr([]) == []


def test_none_is_distinguishable_from_a_real_reading() -> None:
    """A caller must be able to tell "unknown" from any computed value."""
    insufficient = compute_acwr([0.0] * 60)
    sufficient = compute_acwr([100.0] * (MIN_HISTORY_DAYS + 10))

    assert all(ratio is None for ratio in insufficient)
    assert sufficient[-1] is not None

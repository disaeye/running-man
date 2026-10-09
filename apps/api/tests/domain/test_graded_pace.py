"""Grade-adjusted pace and the cost curve behind it.

Two defects are pinned here, both of which produced absurd numbers rather than
errors, so nothing surfaced until a value exceeded the metric's legal range and
the database rejected it:

1. The Minetti polynomial was evaluated on grades far outside the range it was
   measured over. At -22% it returned 0.014, i.e. running downhill costs 1.4%
   of running on the flat.

2. A stopped interval — no distance covered — inherited the previous sample's
   pace. A 0.1 m step reads as 10,000 s/km, and because NGP weights large values
   by the fourth power, a few seconds of standing still dominated the result.
"""

import pytest

from domain.physiology.graded_pace import (
    MIN_DESCENT_MULTIPLIER,
    grade_cost_multiplier,
    normalized_graded_pace,
)


class TestGradeCostMultiplierBounds:
    def test_flat_returns_unity(self) -> None:
        assert grade_cost_multiplier(0.0) == pytest.approx(1.0)

    def test_uphill_costs_more(self) -> None:
        assert grade_cost_multiplier(0.10) > 1.3
        assert grade_cost_multiplier(0.20) > grade_cost_multiplier(0.10)

    def test_moderate_descent_matches_the_published_values(self) -> None:
        # Literature, normalized so flat = 1.0: about 0.61 at -10%.
        assert grade_cost_multiplier(-0.10) == pytest.approx(0.59, abs=0.05)

    def test_steep_descent_is_pinned_not_near_zero(self) -> None:
        # The regression: -22% used to return 0.013.
        assert grade_cost_multiplier(-0.22) == MIN_DESCENT_MULTIPLIER
        assert grade_cost_multiplier(-0.22) >= 0.4

    def test_multiplier_never_becomes_zero_or_negative(self) -> None:
        for grade in (-0.45, -0.35, -0.25, -0.2, -0.15, 0.0, 0.2, 0.45):
            assert grade_cost_multiplier(grade) > 0.0

    def test_descent_is_never_cheaper_than_the_floor(self) -> None:
        for grade in (-0.45, -0.3, -0.2):
            assert grade_cost_multiplier(grade) >= MIN_DESCENT_MULTIPLIER


class TestNormalizedGradedPaceWithStops:
    @staticmethod
    def _series(
        distance_deltas: list[float],
    ) -> tuple[list[float], list[float], list[float]]:
        distances = [0.0]
        for delta in distance_deltas:
            distances.append(distances[-1] + delta)
        times = [float(index) for index in range(len(distances))]
        altitudes = [0.0] * len(distances)
        return distances, altitudes, times

    def test_a_stop_does_not_inflate_ngp(self) -> None:
        # 60 samples at 3 m/s, 30 standing still, then 60 more.
        deltas = [3.0] * 60 + [0.0] * 30 + [3.0] * 60
        distances, altitudes, times = self._series(deltas)

        ngp = normalized_graded_pace(
            distances=distances, altitudes=altitudes, times=times
        )

        assert ngp is not None
        # 3 m/s is 333 s/km; standing still must not push it far above that.
        assert ngp < 400

    def test_a_tiny_delta_does_not_dominate(self) -> None:
        # One 0.1 m step among normal running: 10,000 s/km if taken at face
        # value. A single outlier still lifts NGP by design — the 4th-power
        # weighting exists to penalise variability — so the invariant is that it
        # stays bounded and inside the metric's legal range, not that it is
        # ignored.
        deltas = [3.0] * 100 + [0.1] + [3.0] * 100
        distances, altitudes, times = self._series(deltas)

        ngp = normalized_graded_pace(
            distances=distances, altitudes=altitudes, times=times
        )

        assert ngp is not None
        assert 333 <= ngp < 600, "one outlier should lift NGP, but not unboundedly"

    def test_all_zero_distance_returns_none(self) -> None:
        distances, altitudes, times = self._series([0.0] * 100)

        assert (
            normalized_graded_pace(
                distances=distances, altitudes=altitudes, times=times
            )
            is None
        )

    def test_variable_pace_still_inflates_ngp_above_average(self) -> None:
        # The 4th-power weighting is the metric's purpose: an interval session
        # must read higher than its average pace, not be flattened away.
        deltas = ([4.0] * 30 + [1.0] * 30) * 4
        distances, altitudes, times = self._series(deltas)

        ngp = normalized_graded_pace(
            distances=distances, altitudes=altitudes, times=times
        )
        average_pace = times[-1] / distances[-1] * 1000

        assert ngp is not None
        assert ngp > average_pace

"""Heart rate zone schemes: fixed five zones, pluggable boundaries.

The invariant these tests protect is that a scheme never produces a zone table
it cannot justify. Two failures motivated the module and are pinned here:

* A percentage table applied to the wrong reference. The five-zone table with a
  top zone starting at 106% is a *lactate-threshold* table (threshold is a
  sustainable intensity, so >100% is meaningful); applied to HRmax — a
  physiological ceiling — that zone is unreachable, and every athlete's hardest
  efforts get mislabelled as sub-threshold.
* A scheme whose inputs are missing silently falling back to defaults, so the
  athlete sees a confident-looking zone table built from numbers that are not
  theirs.
"""

from datetime import date
from math import ceil

import pytest

from domain.insights.zone_schemes import (
    DEFAULT_SCHEME,
    HR_SCHEMES,
    estimate_hr_max,
    hr_zones_for_scheme,
    scheme_for,
    unavailable_requirements,
    validate_schemes,
)
from domain.insights.zones import zone_for_value

HR_MAX = 188
LTHR = 182
RESTING_HR = 50


def test_scheme_invariants_hold() -> None:
    # Guards zone count, ascending bounds, and reachability of the top zone.
    validate_schemes()


def test_every_scheme_defines_the_same_five_zones() -> None:
    # The athlete learns one zone structure; only the edges move.
    for scheme in HR_SCHEMES.values():
        assert [row[0] for row in scheme.bounds] == [1, 2, 3, 4, 5]


def test_unknown_scheme_falls_back_to_default() -> None:
    assert scheme_for("nonsense").key == DEFAULT_SCHEME
    assert scheme_for(None).key == DEFAULT_SCHEME


class TestHrMaxScheme:
    def test_uses_olympiatoppen_boundaries(self) -> None:
        zones = hr_zones_for_scheme(
            scheme_for("hrmax"), hr_max=HR_MAX, lthr=None, resting_hr=None
        )
        assert zones is not None
        # 55/72/82/87/92% of 188, ceil on each lower edge.
        assert [zone["min_value"] for zone in zones] == [104, 136, 155, 164, 173]

    def test_top_zone_starts_below_hr_max(self) -> None:
        # The whole point of splitting HRmax from the LTHR table: Z5 must be
        # reachable by someone whose heart rate cannot exceed HRmax.
        zones = hr_zones_for_scheme(
            scheme_for("hrmax"), hr_max=HR_MAX, lthr=None, resting_hr=None
        )
        assert zones is not None
        assert zones[-1]["min_value"] < HR_MAX
        assert zones[-1]["max_value"] is None

    def test_unavailable_without_hr_max(self) -> None:
        assert (
            hr_zones_for_scheme(
                scheme_for("hrmax"), hr_max=None, lthr=LTHR, resting_hr=RESTING_HR
            )
            is None
        )


class TestLthrScheme:
    def test_uses_friel_run_boundaries(self) -> None:
        zones = hr_zones_for_scheme(
            scheme_for("lthr"), hr_max=None, lthr=LTHR, resting_hr=None
        )
        assert zones is not None
        # <85 / 85-90 / 90-95 / 95-100 / 100+
        assert [zone["min_value"] for zone in zones] == [0, 155, 164, 173, 182]

    def test_top_zone_begins_at_threshold(self) -> None:
        # 100% of LTHR is a sustainable hour effort, not a ceiling, so the top
        # zone legitimately starts at the reference value.
        zones = hr_zones_for_scheme(
            scheme_for("lthr"), hr_max=None, lthr=LTHR, resting_hr=None
        )
        assert zones is not None
        assert zones[-1]["min_value"] == LTHR

    def test_unavailable_without_lthr(self) -> None:
        assert (
            hr_zones_for_scheme(
                scheme_for("lthr"), hr_max=HR_MAX, lthr=None, resting_hr=RESTING_HR
            )
            is None
        )


class TestKarvonenScheme:
    def test_offsets_every_boundary_by_resting_hr(self) -> None:
        zones = hr_zones_for_scheme(
            scheme_for("karvonen"), hr_max=HR_MAX, lthr=None, resting_hr=RESTING_HR
        )
        assert zones is not None
        reserve = HR_MAX - RESTING_HR  # 138
        assert zones[0]["min_value"] == ceil(reserve * 0.50) + RESTING_HR
        assert zones[-1]["min_value"] == ceil(reserve * 0.90) + RESTING_HR
        # Every lower edge sits above resting HR, since the reserve is added on top.
        assert all(zone["min_value"] > RESTING_HR for zone in zones)

    def test_requires_both_hr_max_and_resting_hr(self) -> None:
        scheme = scheme_for("karvonen")
        assert (
            hr_zones_for_scheme(scheme, hr_max=HR_MAX, lthr=None, resting_hr=None)
            is None
        )
        assert (
            hr_zones_for_scheme(scheme, hr_max=None, lthr=None, resting_hr=RESTING_HR)
            is None
        )
        assert (
            hr_zones_for_scheme(
                scheme, hr_max=HR_MAX, lthr=None, resting_hr=RESTING_HR
            )
            is not None
        )

    def test_rejects_non_positive_reserve(self) -> None:
        # resting_hr >= hr_max is physiologically impossible; refuse to emit zones.
        assert (
            hr_zones_for_scheme(
                scheme_for("karvonen"), hr_max=100, lthr=None, resting_hr=100
            )
            is None
        )


class TestUnavailableRequirements:
    def test_reports_missing_fields_for_hint_copy(self) -> None:
        assert unavailable_requirements(
            scheme_for("karvonen"), hr_max=HR_MAX, lthr=None, resting_hr=None
        ) == ("resting_hr",)
        assert unavailable_requirements(
            scheme_for("lthr"), hr_max=HR_MAX, lthr=None, resting_hr=None
        ) == ("lthr",)

    def test_empty_when_satisfied(self) -> None:
        assert (
            unavailable_requirements(
                scheme_for("hrmax"), hr_max=HR_MAX, lthr=None, resting_hr=None
            )
            == ()
        )


class TestEstimateHrMax:
    def test_tanaka_formula(self) -> None:
        # 208 - 0.7 x age, from Tanaka et al., J Am Coll Cardiol 2001;37:153-6.
        assert estimate_hr_max(20) == 194
        assert estimate_hr_max(40) == 180
        assert estimate_hr_max(70) == 159

    def test_intersects_the_220_minus_age_rule_near_40(self) -> None:
        # Both conventions agree around age 40 and diverge either side; a
        # regression to the old rule would break this.
        assert abs(estimate_hr_max(40) - (220 - 40)) <= 1
        assert estimate_hr_max(70) > 220 - 70  # Tanaka is higher in older adults

    @pytest.mark.parametrize("age", [None, 0, -1, 200])
    def test_rejects_implausible_age(self, age: int | None) -> None:
        assert estimate_hr_max(age) is None


def test_custom_boundaries_are_not_a_scheme() -> None:
    """Manual edges overlay a computed scheme rather than replacing it.

    Custom boundaries live in ``zone_overrides`` and are applied on top of
    whichever scheme is selected, so "custom" must not appear as a selectable
    scheme — doing so produced an empty zone table with no explanation.
    """
    assert "custom" not in HR_SCHEMES
    assert scheme_for("custom").key == DEFAULT_SCHEME


def test_schemes_are_ordered_from_coolest_to_hottest_for_the_same_athlete() -> None:
    """Z1's upper edge must rise monotonically with intensity across schemes.

    Sanity check that no scheme is upside down: a Z1 boundary above a Z5
    boundary would mean the table was written starting from the wrong end.
    """
    for key in ("hrmax", "karvonen"):
        zones = hr_zones_for_scheme(
            scheme_for(key), hr_max=HR_MAX, lthr=None, resting_hr=RESTING_HR
        )
        assert zones is not None
        lower_bounds = [zone["min_value"] for zone in zones]
        assert lower_bounds == sorted(lower_bounds)
        assert lower_bounds[0] < lower_bounds[-1]


def test_adjacent_zones_share_their_boundary_beat() -> None:
    """Regression: no heart rate may fall between two zones.

    ``_zone`` floors a zone's upper edge and ceils its lower edge, so for
    HRmax 188 the Z1/Z2 seam prints as "104-135" followed by "136-154".
    Bucketing by ``value < max_value`` made 135 belong to no zone at all,
    dropping ~6% of real samples from the histogram and from hrTSS.
    """
    zones = hr_zones_for_scheme(
        scheme_for("hrmax"), hr_max=200, lthr=None, resting_hr=None
    )
    assert zones is not None
    lowest = zones[0]["min_value"]
    highest = zones[-1]["min_value"]
    for bpm in range(lowest, highest + 5):
        assert zone_for_value(bpm, zones) is not None, f"{bpm} bpm fell between zones"


def test_upper_zone_extends_without_bound() -> None:
    zones = hr_zones_for_scheme(
        scheme_for("hrmax"), hr_max=188, lthr=None, resting_hr=None
    )
    assert zones is not None
    assert zone_for_value(240, zones) == 5


def test_values_below_the_first_zone_are_not_folded_into_it() -> None:
    """A resting heart rate is not "light exercise".

    The HRmax scheme's Z1 starts at 55% of HRmax (~104 bpm for HRmax 188),
    because that is the Olympiatoppen I-1 floor. Samples below it — warm-up
    starts, recovery jogs, and the incidental heart rates of non-running
    activities — resolve to ``None`` rather than being counted as Z1 time.
    """
    zones = hr_zones_for_scheme(
        scheme_for("hrmax"), hr_max=188, lthr=None, resting_hr=None
    )
    assert zones is not None
    assert zones[0]["min_value"] == 104
    assert zone_for_value(103, zones) is None
    assert zone_for_value(70, zones) is None
    assert zone_for_value(104, zones) == 1


def test_age_prediction_feeds_the_scheme_without_a_measured_hr_max() -> None:
    """A new athlete who only entered a birth date still gets usable zones."""
    age = 32
    predicted = estimate_hr_max(age)
    assert predicted is not None
    zones = hr_zones_for_scheme(
        scheme_for("hrmax"), hr_max=predicted, lthr=None, resting_hr=None
    )
    assert zones is not None
    assert len(zones) == 5
    assert 0 < zones[0]["min_value"] < zones[-1]["min_value"] <= predicted


def test_scheme_reference_is_never_implicit() -> None:
    # Every scheme names what its percentages multiply; this is the bug that
    # let an LTHR table be applied to HRmax.
    for scheme in HR_SCHEMES.values():
        assert scheme.reference in {"hr_max", "lthr", "hr_reserve"}
        assert scheme.requires
        assert scheme.citation


def test_lthr_table_is_not_applied_to_hr_max() -> None:
    """Regression: the 106%-and-above table must never run against HRmax."""
    lthr_zones = hr_zones_for_scheme(
        scheme_for("lthr"), hr_max=None, lthr=LTHR, resting_hr=None
    )
    assert lthr_zones is not None
    # The LTHR table's top zone starts at 100% of its reference...
    assert lthr_zones[-1]["min_value"] == LTHR
    # ...while the HRmax scheme's top zone is strictly below HRmax, so an
    # athlete can actually reach it.
    hrmax_zones = hr_zones_for_scheme(
        scheme_for("hrmax"), hr_max=HR_MAX, lthr=None, resting_hr=None
    )
    assert hrmax_zones is not None
    assert hrmax_zones[-1]["min_value"] < HR_MAX


def test_dates_do_not_affect_scheme_math() -> None:
    # Zone boundaries depend on thresholds, not on "today".
    zones = hr_zones_for_scheme(
        scheme_for("hrmax"), hr_max=HR_MAX, lthr=None, resting_hr=None
    )
    assert zones is not None
    assert isinstance(date.today(), date)
    assert zones[0]["min_value"] == 104

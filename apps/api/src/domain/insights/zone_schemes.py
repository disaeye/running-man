"""Heart rate zone boundaries, with the reference each scheme is measured against.

Why this module exists
----------------------
"Z4 = 95%–105%" is meaningless on its own: a percentage only means something
relative to a reference, and the reference is not stated in the number. The
previous implementation had one table of percentages and two callers passing
different quantities into it (HRmax in the API router, LTHR in the load
kernel), so the same "Z4" denoted two different heart rates depending on which
code path produced it.

Every scheme here therefore declares three things explicitly:

* ``reference`` — the quantity the percentages multiply.
* ``bounds`` — the zone edges as percentages of that reference.
* ``requires`` — the athlete fields that must be present, so a scheme whose
  inputs are missing reports "unavailable" instead of emitting a plausible
  looking zone table built from defaults.

Custom boundaries are deliberately not a scheme here. They are stored as
``zone_overrides`` rows and applied *on top of* whichever scheme is selected
(see ``domain.insights.zones.apply_overrides``), so choosing a scheme and
overriding its edges are orthogonal. Making "custom" a peer of the computed
schemes produced an empty zone table with no explanation of why.

Zone count is fixed at five for every scheme. The five aerobic zones are the
structure the athlete learns once; only the arithmetic behind the edges
changes. The literature supports five as the aerobic structure: lactate
thresholds LT1 and LT2 split intensity into three domains, and each side is
subdivided once, giving five zones used for aerobic endurance training
(Olympiatoppen's scale — used by Norwegian national teams — uses exactly
I-1..I-5 for aerobic work and reserves higher zones for anaerobic efforts
that have no heart-rate anchor). Z5 here is therefore the single open-ended
top zone; there is no Z6/Z7 subdivision.

Citations
---------
HRmax, age-predicted
    Tanaka H, Monahan KD, Seals DR. "Age-predicted maximal heart rate
    revisited." J Am Coll Cardiol 2001;37(1):153-6.
    Meta-analysis of 351 studies / 492 groups / 18,712 subjects, cross-validated
    in 514 subjects: HRmax = 208 - 0.7 x age. Age alone explained ~80% of the
    variance; the relation did not differ by sex or training status. Residual SD
    is 7-11 bpm, so a single athlete's true HRmax can sit ~10 bpm either side of
    the prediction — this is why the estimate is labelled as an estimate and a
    measured value always overrides it.
    (The older 220 - age rule is the Fox/Haskell convention, derived
    "arbitrarily" from 10 studies with almost no subjects over 65; Tanaka
    et al. show it overestimates in the young and underestimates after ~40.)

HRmax zones
    Olympiatoppen (Norwegian Olympic and Paralympic Committee and Confederation
    of Sports) intensity scale, "I-skala" 2024: I-1 ~55-72%, I-2 ~72-82%,
    I-3 ~82-87%, I-4 ~87-92%, I-5 ~92-100% of HRmax, with LT1 at the I-2/I-3
    boundary and LT2 at the I-3/I-4 boundary.
    https://olt-skala.nif.no/

LTHR zones
    Friel J. "A Quick Guide to Setting Zones" — run zones as a percentage of
    lactate threshold heart rate: Z1 <85%, Z2 85-89%, Z3 90-94%, Z4 95-99%,
    Z5a 100-102%, Z5b 103-106%, Z5c >106%.
    The 5a/5b/5c split is collapsed into the single open-ended Z5 used
    throughout this module, giving Z1..Z4 at <85/85/90/95 and Z5 at 100%+.
    Running zones differ from cycling zones in Friel's own tables (cycling Z1
    is <81%); this product is running-only, so the running boundaries are used
    and the cycling model is deliberately not implemented.

Karvonen
    Karvonen MJ, Kentala E, Mustala O. "The effects of training on heart rate; a
    longitudinal study." Ann Med Exp Biol Fenn 1957;35(3):307-15.
    Target HR = (HRmax - resting HR) x intensity% + resting HR. Expressed in the
    (anchor, range) form used here: anchor = resting HR, range = HRmax - resting
    HR. Percentage bands follow the common five-zone convention (50/60/70/80/90)
    since Karvonen's paper defines the method, not a zone table.
"""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass
from typing import Final, Literal

from domain.insights.zones import HR_ZONE_COUNT, Zone, _zone

SchemeKey = Literal["hrmax", "lthr", "karvonen"]
ZoneReference = Literal["hr_max", "lthr", "hr_reserve"]

# The upper edge of every scheme's final zone is open (None). Because the top
# zone must stay reachable, its lower bound is what matters: a scheme whose
# percentages exceed its own reference at the top would define a zone no
# athlete can ever enter — the failure mode of applying a LTHR table (whose Z5
# starts above 100%) to HRmax (where nothing exceeds 100%).
_OPEN: Final = None


@dataclass(frozen=True, slots=True)
class ZoneScheme:
    """One way of turning an athlete's thresholds into five heart rate zones."""

    key: SchemeKey
    label: str
    reference: ZoneReference
    bounds: tuple[tuple[int, float, float | None], ...]
    requires: tuple[str, ...]
    citation: str | None

    def resolve_reference(
        self,
        *,
        hr_max: int | None,
        lthr: int | None,
        resting_hr: int | None,
    ) -> int | None:
        """The anchor value the percentages multiply, or ``None`` if unavailable."""
        match self.reference:
            case "hr_max":
                candidate = hr_max
            case "lthr":
                candidate = lthr
            case "hr_reserve":
                if hr_max is None or resting_hr is None:
                    return None
                reserve = hr_max - resting_hr
                return reserve if reserve > 0 else None
        return candidate if candidate is not None and candidate > 0 else None


HRMAX_BOUNDS: Final = (
    (1, 55.0, 72.0),
    (2, 72.0, 82.0),
    (3, 82.0, 87.0),
    (4, 87.0, 92.0),
    (5, 92.0, _OPEN),
)
# Friel's run zones are published as seven bands (Z1..Z5c); the Z5a/Z5b/Z5c
# split is collapsed into this module's single open-ended Z5, so the top zone
# starts at the Z5a boundary (100% of LTHR).
LTHR_BOUNDS: Final = (
    (1, 0.0, 85.0),
    (2, 85.0, 90.0),
    (3, 90.0, 95.0),
    (4, 95.0, 100.0),
    (5, 100.0, _OPEN),
)
HRR_BOUNDS: Final = (
    (1, 50.0, 60.0),
    (2, 60.0, 70.0),
    (3, 70.0, 80.0),
    (4, 80.0, 90.0),
    (5, 90.0, _OPEN),
)

HR_SCHEMES: Final[Mapping[SchemeKey, ZoneScheme]] = {
    "hrmax": ZoneScheme(
        key="hrmax",
        label="最大心率百分比",
        reference="hr_max",
        bounds=HRMAX_BOUNDS,
        requires=("hr_max",),
        citation="Olympiatoppen I-skala 2024 (I-1..I-5); HRmax from Tanaka et al. 2001",
    ),
    "lthr": ZoneScheme(
        key="lthr",
        label="乳酸阈心率百分比",
        reference="lthr",
        bounds=LTHR_BOUNDS,
        requires=("lthr",),
        citation="Friel, A Quick Guide to Setting Zones (run zones)",
    ),
    "karvonen": ZoneScheme(
        key="karvonen",
        label="储备心率法",
        reference="hr_reserve",
        bounds=HRR_BOUNDS,
        requires=("hr_max", "resting_hr"),
        citation="Karvonen et al. 1957 (heart rate reserve method)",
    ),
}

DEFAULT_SCHEME: Final[SchemeKey] = "hrmax"


def estimate_hr_max(age: int | None) -> int | None:
    """Age-predicted HRmax (Tanaka et al. 2001): ``208 - 0.7 x age``.

    Returns ``None`` without an age. Callers must present the result as an
    estimate: the study's residual SD is 7-11 bpm, so this is a population
    midpoint rather than a measurement.
    """
    if age is None or age <= 0 or age > 120:
        return None
    return round(208.0 - 0.7 * age)


def scheme_for(key: str | None) -> ZoneScheme:
    """Look up a scheme, falling back to the default for unknown keys."""
    if key in HR_SCHEMES:
        return HR_SCHEMES[key]  # type: ignore[index]
    return HR_SCHEMES[DEFAULT_SCHEME]


def unavailable_requirements(
    scheme: ZoneScheme,
    *,
    hr_max: int | None,
    lthr: int | None,
    resting_hr: int | None,
) -> tuple[str, ...]:
    """Which of ``scheme.requires`` are missing — drives the UI's "fill this in" hint."""
    available = {"hr_max": hr_max, "lthr": lthr, "resting_hr": resting_hr}
    return tuple(field for field in scheme.requires if available.get(field) is None)


def hr_zones_for_scheme(
    scheme: ZoneScheme,
    *,
    hr_max: int | None,
    lthr: int | None,
    resting_hr: int | None,
) -> list[Zone] | None:
    """Five HR zones for ``scheme``, or ``None`` when its inputs are missing.

    ``None`` rather than ``[]`` is deliberate: an empty list reads as "this
    athlete has no zones", while ``None`` lets the caller say "the Karvonen
    scheme needs a resting heart rate first". For the reserve-based scheme the
    zone values are shifted by the resting heart rate, so the percentages are
    applied to the reserve and then offset back onto the heart rate scale.
    """
    if unavailable_requirements(
        scheme, hr_max=hr_max, lthr=lthr, resting_hr=resting_hr
    ):
        return None
    reference = scheme.resolve_reference(
        hr_max=hr_max, lthr=lthr, resting_hr=resting_hr
    )
    if reference is None:
        return None
    anchor = resting_hr if scheme.reference == "hr_reserve" else 0
    assert anchor is not None
    return [
        _zone_with_anchor(bounds, reference, anchor) for bounds in scheme.bounds
    ]


def _zone_with_anchor(
    bounds: tuple[int, float, float | None], reference: int, anchor: int
) -> Zone:
    """Build one zone, offsetting by ``anchor`` (0 for plain percentage schemes).

    ``_zone`` in ``domain.insights.zones`` computes ``pct x reference``; adding
    the anchor afterwards turns that into the heart-rate-reserve form without
    duplicating the rounding rules.
    """
    zone = _zone(bounds, reference)
    if anchor:
        zone = Zone(
            zone=zone["zone"],
            name=zone["name"],
            min_pct=zone["min_pct"],
            max_pct=zone["max_pct"],
            min_value=zone["min_value"] + anchor,
            max_value=None if zone["max_value"] is None else zone["max_value"] + anchor,
        )
    return zone


def validate_schemes() -> None:
    """Guard the invariants every scheme must satisfy.

    Called from tests rather than at import time so a violation surfaces as a
    test failure with context instead of an import error.
    """
    for scheme in HR_SCHEMES.values():
        assert len(scheme.bounds) == HR_ZONE_COUNT, (
            f"{scheme.key} must define exactly {HR_ZONE_COUNT} zones"
        )
        assert [row[0] for row in scheme.bounds] == list(
            range(1, HR_ZONE_COUNT + 1)
        ), f"{scheme.key} zone numbers must be 1..{HR_ZONE_COUNT}"
        for _, minimum, maximum in scheme.bounds:
            if maximum is not None:
                assert minimum < maximum, f"{scheme.key} zone bounds must ascend"
        # The top zone must be reachable: its lower bound has to be the highest
        # boundary, and no boundary may exceed 100% for a reference the athlete
        # cannot exceed (HRmax), or the zone would be unreachable in practice.
        assert scheme.bounds[-1][2] is None, f"{scheme.key} top zone must be open"
        if scheme.reference == "hr_max":
            top_lower = scheme.bounds[-1][1]
            assert top_lower <= 100.0, (
                f"{scheme.key} top zone starts at {top_lower}% of HRmax, "
                "which an athlete can never reach"
            )

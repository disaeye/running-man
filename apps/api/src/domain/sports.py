"""Canonical sport-family classification.

The database stores sport in two spellings: ``run``/``virtual_run``/``trail_run``
as written by the Intervals.icu sync, and ``Run``/``VirtualRun``/``TrailRun`` as
written by the FIT/GPX upload path. Four modules had independently maintained
their own ``RUN_SPORTS`` set to cope with that, and two of them listed only the
capitalised spelling — so a synced ``run`` was treated as running by the load
kernel but not by the personal-record code.

Classification here is case-insensitive and handles both spellings, so callers
ask "is this a run?" instead of comparing against a spelling they happened to
know about.
"""

from __future__ import annotations

from typing import Final

RUN_SPORTS: Final[frozenset[str]] = frozenset(
    {"run", "virtualrun", "trailrun", "treadmillrun", "indoorrun"}
)
RIDE_SPORTS: Final[frozenset[str]] = frozenset(
    {"ride", "virtualride", "bike", "ebikeride", "gravelride", "mountainbikeride"}
)
STRENGTH_SPORTS: Final[frozenset[str]] = frozenset(
    {"workout", "weighttraining", "strength", "strengthtraining"}
)
WALK_SPORTS: Final[frozenset[str]] = frozenset({"walk", "hike", "hiking"})
SWIM_SPORTS: Final[frozenset[str]] = frozenset({"swim", "openwaterswim"})


def _normalise(sport: str) -> str:
    """Lower-case and strip separators so ``virtual_run`` == ``VirtualRun``."""
    return sport.replace("_", "").replace("-", "").replace(" ", "").lower()


def is_running(sport: str | None) -> bool:
    """Whether ``sport`` is a running discipline.

    Running is the only family whose pace-based load and heart rate zones this
    product computes, so this predicate gates those code paths.
    """
    return bool(sport) and _normalise(sport) in RUN_SPORTS  # type: ignore[arg-type]


def is_riding(sport: str | None) -> bool:
    return bool(sport) and _normalise(sport) in RIDE_SPORTS  # type: ignore[arg-type]


def is_strength(sport: str | None) -> bool:
    return bool(sport) and _normalise(sport) in STRENGTH_SPORTS  # type: ignore[arg-type]


def is_walking(sport: str | None) -> bool:
    return bool(sport) and _normalise(sport) in WALK_SPORTS  # type: ignore[arg-type]


def is_swimming(sport: str | None) -> bool:
    return bool(sport) and _normalise(sport) in SWIM_SPORTS  # type: ignore[arg-type]


def canonical_sport(sport: str | None) -> str:
    """Map a sport to a stable family name used for filtering and grouping."""
    if is_running(sport):
        return "running"
    if is_riding(sport):
        return "riding"
    if is_strength(sport):
        return "strength"
    if is_walking(sport):
        return "walking"
    if is_swimming(sport):
        return "swimming"
    return "other"

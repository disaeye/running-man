from dataclasses import dataclass
from datetime import date, timedelta

ONE_DAY = timedelta(days=1)
BASE = "base"
BUILD = "build"
PEAK = "peak"
TAPER = "taper"
RACE = "race"

# Weekly load as a multiple of the athlete's current chronic load (CTL x 7).
#
# The ladder has to climb. It previously ran BASE 0.8 / BUILD 1.0 / PEAK 0.9 of
# the current weekly load, so no week in the plan ever exceeded what the athlete
# was already doing and the peak fell below the build. A generated plan could
# not increase fitness, and because the baseline is CTL-derived, an athlete who
# stopped training watched the plan follow them down.
#
# (phase start multiple, phase end multiple). Each phase interpolates across its
# own weeks, so load rises through the phase instead of jumping at boundaries.
_LADDER: dict[str, tuple[float, float]] = {
    BASE: (0.95, 1.05),
    BUILD: (1.05, 1.25),
    PEAK: (1.25, 1.30),
    TAPER: (0.75, 0.55),
}

# Absolute fallback for an athlete with no load history: a beginner's week.
_BEGINNER_WEEK_TSS = 210.0


@dataclass(frozen=True)
class Phase:
    """A training phase with a load range, not a single number.

    ``target_weekly_tss`` is the phase's week-level ceiling (persisted on the
    row); ``start_weekly_tss`` is where the phase begins. Walls of constant load
    across a six-week block are not a plan, so the generator interpolates.
    """

    name: str
    start_date: date
    end_date: date
    target_weekly_tss: float
    start_weekly_tss: float = 0.0

    def weekly_tss_for(self, week_start: date) -> float:
        """Weekly target for the week beginning ``week_start``."""
        span = (self.end_date - self.start_date).days + 1
        if span <= 1:
            return self.target_weekly_tss
        offset = min(max((week_start - self.start_date).days, 0), span - 1)
        ratio = offset / (span - 1)
        return self.start_weekly_tss + (
            self.target_weekly_tss - self.start_weekly_tss
        ) * ratio


def generate_phases(
    race_date: date,
    current_ctl: float,
    today: date,
    weekly_tss_override: float | None = None,
) -> list[Phase]:
    """Lay out the phases leading up to ``race_date``.

    ``today`` is required rather than defaulted. Phases are laid out from the day
    the plan actually starts, so falling back to ``date.today()`` would have
    silently produced a plan for the *host's* calendar — and for a UTC host an
    athlete east of Greenwich that is a different day for part of every evening.
    Making it mandatory means a caller that forgets is a type error instead of a
    plan that quietly starts a day off.
    """
    start = today
    ctl = max(current_ctl, 0.0)
    baseline = ctl * 7 if ctl > 0 else _BEGINNER_WEEK_TSS
    if weekly_tss_override is not None:
        # An explicit ceiling scales the ladder rather than replacing it, so the
        # shape (build → peak → taper) survives.
        baseline = max(weekly_tss_override, 0.0)
    ranges = {
        name: (baseline * low, baseline * high) for name, (low, high) in _LADDER.items()
    }
    ranges[RACE] = (0.0, 0.0)

    runway_days = (race_date - start).days
    if runway_days <= 0:
        return [Phase(RACE, race_date, race_date, 0.0, 0.0)]
    if runway_days <= 14:
        taper_start, taper_end = ranges[TAPER]
        return [
            Phase(TAPER, start, race_date - ONE_DAY, taper_end, taper_start),
            Phase(RACE, race_date, race_date, 0.0, 0.0),
        ]

    phases: list[Phase] = []
    cursor = start
    for name, days in _phase_lengths(runway_days):
        if days <= 0:
            continue
        end = cursor + timedelta(days=days - 1)
        phase_start, phase_end = ranges[name]
        # Monday week boundaries mean a phase can be a partial first week; the
        # interpolation uses the phase's own dates, so the first week lands near
        # `phase_start` whatever day it begins on.
        phases.append(Phase(name, cursor, end, phase_end, phase_start))
        cursor = end + ONE_DAY
    return phases


def _phase_lengths(runway_days: int) -> list[tuple[str, int]]:
    if runway_days < 21:
        taper_days = min(14, runway_days - 1)
        return [(PEAK, runway_days - taper_days), (TAPER, taper_days)]
    if runway_days < 42:
        taper_days = 10
        peak_days = min(14, runway_days - taper_days)
        return [
            (BUILD, runway_days - peak_days - taper_days),
            (PEAK, peak_days),
            (TAPER, taper_days),
        ]
    if runway_days < 84:
        taper_days = 14
        peak_days = 14
        return [
            (BUILD, runway_days - peak_days - taper_days),
            (PEAK, peak_days),
            (TAPER, taper_days),
        ]
    taper_days = 14
    peak_days = 21 if runway_days >= 91 else 14
    remaining = runway_days - taper_days - peak_days
    build_days = max(28, min(56, remaining - 28))
    base_days = remaining - build_days
    return [(BASE, base_days), (BUILD, build_days), (PEAK, peak_days), (TAPER, taper_days)]

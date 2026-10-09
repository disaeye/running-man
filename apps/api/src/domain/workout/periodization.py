from dataclasses import dataclass
from datetime import date, timedelta

ONE_DAY = timedelta(days=1)
BASE = "base"
BUILD = "build"
PEAK = "peak"
TAPER = "taper"
RACE = "race"


@dataclass(frozen=True)
class Phase:
    name: str
    start_date: date
    end_date: date
    target_weekly_tss: float


def generate_phases(
    race_date: date,
    current_ctl: float,
    today: date | None = None,
    weekly_tss_override: float | None = None,
) -> list[Phase]:
    start = today or date.today()
    ctl = max(current_ctl, 0.0)
    baseline = ctl * 7
    targets = {
        BASE: baseline * 0.8,
        BUILD: baseline,
        PEAK: baseline * 0.9,
        TAPER: baseline * 0.5,
        RACE: 0.0,
    }
    if weekly_tss_override is not None:
        targets.update(
            {
                BASE: weekly_tss_override * 0.8,
                BUILD: weekly_tss_override,
                PEAK: weekly_tss_override * 0.9,
                TAPER: weekly_tss_override * 0.5,
            }
        )
    elif baseline <= 0:
        targets.update({BASE: 210.0, BUILD: 210.0, PEAK: 189.0, TAPER: 105.0})

    runway_days = (race_date - start).days
    if runway_days <= 0:
        return [Phase(RACE, race_date, race_date, targets[RACE])]
    if runway_days < 7:
        return [
            Phase(TAPER, start, race_date - ONE_DAY, targets[TAPER]),
            Phase(RACE, race_date, race_date, targets[RACE]),
        ]
    if runway_days <= 14:
        return [
            Phase(TAPER, start, race_date - ONE_DAY, targets[TAPER]),
            Phase(RACE, race_date, race_date, targets[RACE]),
        ]

    phase_lengths = _phase_lengths(runway_days)
    phases: list[Phase] = []
    cursor = start
    for name, days in phase_lengths:
        if days <= 0:
            continue
        end = cursor + timedelta(days=days - 1)
        phases.append(Phase(name, cursor, end, targets[name]))
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

from dataclasses import dataclass
from datetime import date, timedelta

ONE_DAY = timedelta(days=1)
BASE = "base"
BUILD = "build"
PEAK = "peak"
TAPER = "taper"
RACE = "race"

# 各阶段周跑量相对最近六个完整周平均值的比例。
_LADDER: dict[str, tuple[float, float]] = {
    BASE: (0.95, 1.05),
    BUILD: (1.05, 1.25),
    PEAK: (1.25, 1.30),
    TAPER: (0.75, 0.55),
}


@dataclass(frozen=True)
class Phase:
    """一个阶段内的周跑量范围。"""

    name: str
    start_date: date
    end_date: date
    target_weekly_distance_m: float
    start_weekly_distance_m: float = 0.0

    def weekly_distance_for(self, week_start: date) -> float:
        """返回指定周的目标跑量，单位为米。"""
        span = (self.end_date - self.start_date).days + 1
        if span <= 1:
            return self.target_weekly_distance_m
        offset = min(max((week_start - self.start_date).days, 0), span - 1)
        ratio = offset / (span - 1)
        return self.start_weekly_distance_m + (
            self.target_weekly_distance_m - self.start_weekly_distance_m
        ) * ratio


def generate_phases(
    race_date: date,
    baseline_weekly_distance_m: float,
    today: date,
) -> list[Phase]:
    """按比赛日期与近期真实周跑量安排训练阶段。"""
    if baseline_weekly_distance_m <= 0:
        raise ValueError("最近跑步周跑量必须大于零")

    baseline = baseline_weekly_distance_m
    ranges = {
        name: (baseline * low, baseline * high) for name, (low, high) in _LADDER.items()
    }
    ranges[RACE] = (0.0, 0.0)

    runway_days = (race_date - today).days
    if runway_days <= 0:
        return [Phase(RACE, race_date, race_date, 0.0, 0.0)]
    if runway_days <= 14:
        taper_start, taper_end = ranges[TAPER]
        return [
            Phase(TAPER, today, race_date - ONE_DAY, taper_end, taper_start),
            Phase(RACE, race_date, race_date, 0.0, 0.0),
        ]

    phases: list[Phase] = []
    cursor = today
    for name, days in _phase_lengths(runway_days):
        if days <= 0:
            continue
        end = cursor + timedelta(days=days - 1)
        phase_start, phase_end = ranges[name]
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

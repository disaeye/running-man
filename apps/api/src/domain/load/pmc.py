from datetime import date, timedelta
from typing import TypedDict

from .acwr import compute_acwr
from .constants import ATL_DECAY_DAYS, CTL_DECAY_DAYS

ONE_DAY = timedelta(days=1)

# Days of history before CTL is treated as describing the athlete rather than
# the seed. The EWMA starts at zero, so early values are an artifact: with a
# 42-day time constant it takes about three constants (126 days) to converge,
# and at 42 days the value is still only ~63% of the way there. Reporting a
# number earlier than this is why a new athlete saw "CTL 12, 新手" — a reading
# about the warm-up, not about their fitness.
#
# 84 days (two time constants, ~86% converged) is the reported threshold: past
# it the remaining error is within the noise of the metric itself.
CTL_WARMUP_DAYS = 2 * CTL_DECAY_DAYS


class PmcSeries(TypedDict):
    dates: list[date]
    ctl: list[float]
    atl: list[float]
    tsb: list[float]


# ``acwr`` is None until there is enough history to compute it; see
# domain.load.acwr. Other fields are always present once a day is emitted.
PmcPoint = dict[str, date | float | None]


def compute_ctl_atl_tsb(
    daily_tss: dict[date, float],
    *,
    seed_ctl: float = 0.0,
    seed_atl: float = 0.0,
    end_day: date | None = None,
) -> PmcSeries:
    if not daily_tss:
        return {"dates": [], "ctl": [], "atl": [], "tsb": []}

    ctl = seed_ctl
    atl = seed_atl
    dates: list[date] = []
    ctl_values: list[float] = []
    atl_values: list[float] = []
    tsb_values: list[float] = []

    current_day = min(daily_tss)
    final_day = max((*daily_tss, end_day)) if end_day is not None else max(daily_tss)

    while current_day <= final_day:
        tss = daily_tss.get(current_day, 0.0)
        ctl += (tss - ctl) / CTL_DECAY_DAYS
        atl += (tss - atl) / ATL_DECAY_DAYS

        dates.append(current_day)
        ctl_values.append(ctl)
        atl_values.append(atl)
        tsb_values.append(ctl - atl)
        current_day += ONE_DAY

    return {"dates": dates, "ctl": ctl_values, "atl": atl_values, "tsb": tsb_values}


def warmup_days(history_days: int) -> int:
    """How many more days of history are needed before CTL is trustworthy.

    Zero once the series is long enough. Callers surface this so the UI can say
    "still accumulating" instead of presenting a converging value as a
    measurement.
    """
    return max(0, CTL_WARMUP_DAYS - history_days)


def build_pmc_series(
    daily_tss: dict[date, float],
    *,
    end_day: date | None = None,
    seed_ctl: float = 0.0,
    seed_atl: float = 0.0,
) -> list[PmcPoint]:
    """Assemble ready-to-serialize PMC points (day, ctl, atl, tsb, tss, acwr).

    Used for on-the-fly PMC computation outside stored all-sports facts
    (e.g. per-sport filter). The series spans min(daily_tss)..max(daily_tss);
    days without activity decay normally via compute_ctl_atl_tsb.
    """
    if not daily_tss:
        return []

    pmc = compute_ctl_atl_tsb(daily_tss, end_day=end_day, seed_ctl=seed_ctl, seed_atl=seed_atl)
    dates = pmc["dates"]
    ctl_values = pmc["ctl"]
    atl_values = pmc["atl"]
    tsb_values = pmc["tsb"]
    tss_values = [daily_tss.get(day_value, 0.0) for day_value in dates]
    acwr_values = compute_acwr(tss_values)

    return [
        {
            "day": dates[i],
            "ctl": ctl_values[i],
            "atl": atl_values[i],
            "tsb": tsb_values[i],
            "tss": tss_values[i],
            "acwr": acwr_values[i],
            # True while CTL is still dominated by its zero seed. The value is
            # emitted either way so the chart can draw it, but a consumer that
            # quotes a number must check this first.
            "ctl_warming_up": i + 1 < CTL_WARMUP_DAYS,
        }
        for i in range(len(dates))
    ]

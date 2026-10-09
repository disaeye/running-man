from collections.abc import Sequence
from datetime import date, datetime, time, timedelta
from typing import Annotated, Any, Literal

from fastapi import APIRouter, Depends, Query

from application.data_health import compute_data_health
from domain.insights.readiness import compute_readiness, compute_recommendation
from domain.load.pmc import warmup_days
from infrastructure.auth.models import Athlete
from infrastructure.db.pool import get_pool
from infrastructure.repositories.calendar import CalendarRepo
from infrastructure.repositories.pmc import PmcRepo
from presentation.api.analytics_analysis_contracts import CoachContextResponse
from presentation.api.insights_helpers import _readiness_inputs
from presentation.auth.deps import get_current_athlete

router = APIRouter(prefix="/insights", tags=["insights"])

StalenessBucket = Literal["fresh", "stale", "missing"]
TrendDirection = Literal["up", "down", "stable"]
WEEK_DAYS = 7
TREND_MIN_POINTS = 2


def get_coach_pmc_repo() -> PmcRepo:
    return PmcRepo()


def get_calendar_repo() -> CalendarRepo:
    return CalendarRepo()


def get_data_health_pool() -> Any:
    return get_pool()


@router.get("/coach-context", response_model=CoachContextResponse)
async def get_coach_context(
    target_day: Annotated[date, Query(alias="date")],
    athlete: Annotated[Athlete, Depends(get_current_athlete)],
    pmc_repo: Annotated[PmcRepo, Depends(get_coach_pmc_repo)],
    calendar_repo: Annotated[CalendarRepo, Depends(get_calendar_repo)],
    db_pool: Annotated[Any, Depends(get_data_health_pool)],
) -> CoachContextResponse:
    wellness, readiness_loads = await _readiness_inputs(athlete.id, target_day)
    pmc_loads = await pmc_repo.get_daily_load_range(
        athlete.id, target_day - timedelta(days=89), target_day
    )
    events = await calendar_repo.list(
        athlete.id,
        datetime.combine(target_day - timedelta(days=6), time.min),
        datetime.combine(target_day, time.max),
    )
    data_health = await compute_data_health(athlete.id, db_pool)
    readiness = compute_readiness(target_day, wellness, readiness_loads)
    completed_tss = _sum_tss(pmc_loads[-7:])
    planned_tss = _sum_planned_tss(events)
    return CoachContextResponse.model_validate({
        "data_freshness": _data_freshness(data_health, target_day),
        "recent_load": _recent_load(pmc_loads),
        "recovery_signals": _recovery_signals(wellness, readiness, target_day),
        "plan_adherence": _plan_adherence(completed_tss, planned_tss),
        "missing_data_caveats": _missing_data_caveats(data_health, wellness, target_day),
        "recommendation": compute_recommendation(
            readiness,
            _events_for_target_day(events, target_day),
            completed_tss,
            planned_tss,
            len(pmc_loads[-WEEK_DAYS:]),
        ),
        "readiness": readiness,
    })


def _data_freshness(data_health: dict[str, object], target_day: date) -> dict[str, object]:
    return {
        "activities": _freshness_entry(_section(data_health, "activities"), target_day),
        "wellness": _freshness_entry(_section(data_health, "wellness"), target_day),
    }


def _freshness_entry(section: dict[str, object], target_day: date) -> dict[str, object]:
    data_as_of = section.get("data_as_of")
    return {
        "data_as_of": data_as_of.date() if isinstance(data_as_of, datetime) else data_as_of,
        "staleness_bucket": _staleness_bucket(data_as_of, target_day),
    }


def _recent_load(loads: Sequence[dict[str, object]]) -> dict[str, object]:
    """Recent load totals plus whether CTL can be quoted yet.

    ``ctl_warming_up`` lets the UI say "still accumulating" rather than showing
    a converging number as a measurement. The EWMA starts at zero, so the first
    weeks describe the seed, not the athlete: with a 42-day constant a new
    athlete sees a CTL far below their true fitness, which reads as "you are
    unfit" rather than "not enough data yet".

    The window is counted from the earliest day present, so an athlete with
    years of history is never flagged.
    """
    current = loads[-1] if loads else {}
    return {
        "d7_tss": _sum_tss(loads[-WEEK_DAYS:]),
        "d28_tss": _sum_tss(loads[-28:]),
        "d90_tss": _sum_tss(loads[-90:]),
        "current_ctl": _num(current.get("ctl")),
        "current_atl": _num(current.get("atl")),
        "current_tsb": _num(current.get("tsb")),
        "ctl_warming_up": _ctl_warming_up(loads),
        "ctl_history_days": len(loads),
    }


def _ctl_warming_up(loads: Sequence[dict[str, object]]) -> bool:
    return warmup_days(len(loads)) > 0


def _recovery_signals(
    wellness: Sequence[dict[str, object]], readiness: dict[str, object], target_day: date
) -> dict[str, object]:
    """Recovery trends and the 7-day sleep average.

    The average used to be `sum(values) / len(values)` over `ordered[-7:]`, and
    both halves of that were wrong in a way that made the number systematically
    low:

    - `ordered[-7:]` is the last seven *rows*, not the last seven days. Wellness
      rows are sparse — rest days often have none — so the window drifted onto
      whatever happened to be recorded, and one of the seven slots was usually
      consumed by today's row with no sleep value yet.
    - Dividing by the count including rows whose value is null charged those
      rows a zero. For the athlete this was found on, the real average was
      4.48 h and the reported figure was 3.8 h: 26.86 / 7 instead of 26.86 / 6.

    A missing night is unknown, not zero hours of sleep. Only measured nights
    count toward the divisor, and only nights inside the window count at all.
    """
    ordered = sorted(wellness, key=_row_day)
    window_start = target_day - timedelta(days=WEEK_DAYS - 1)
    measured = [
        _num(row.get("sleep_secs")) / 3600
        for row in ordered
        if row.get("sleep_secs") is not None
        and window_start <= _row_day(row) <= target_day
    ]
    return {
        "hrv_trend_direction": _trend(ordered, "hrv", target_day),
        "rhr_trend_direction": _trend(ordered, "resting_hr", target_day),
        "sleep_avg_7d": round(sum(measured) / len(measured), 1) if measured else 0.0,
        "readiness_score": readiness["score"],
    }


def _plan_adherence(completed_tss: float, planned_tss: float) -> dict[str, float]:
    return {
        "completed_tss_7d": completed_tss,
        "planned_tss_7d": planned_tss,
        "adherence_pct": round(completed_tss / planned_tss * 100, 1) if planned_tss > 0 else 0.0,
    }


def _missing_data_caveats(
    data_health: dict[str, object], wellness: Sequence[dict[str, object]], target_day: date
) -> list[dict[str, str]]:
    caveats: list[dict[str, str]] = []
    if _field_count(wellness, "hrv") < WEEK_DAYS:
        caveats.append(_caveat("hrv", "缺少 7 天数据", "HRV 趋势和恢复评分会偏保守"))
    if _field_count(wellness, "resting_hr") < WEEK_DAYS:
        caveats.append(_caveat("resting_hr", "缺少 7 天数据", "静息心率趋势可信度下降"))
    wellness_staleness = _staleness_bucket(
        _section(data_health, "wellness").get("data_as_of"), target_day
    )
    if wellness_staleness != "fresh":
        caveats.append(_caveat("wellness", "健康数据不是当天", "恢复建议可能滞后"))
    gaps = data_health.get("gaps")
    if isinstance(gaps, list) and gaps:
        caveats.append(_caveat("data_gaps", "近 90 天存在数据缺口", "长期负荷统计可能低估"))
    return caveats


def _events_for_target_day(
    events: Sequence[dict[str, object]], target_day: date
) -> list[dict[str, object]]:
    return [event for event in events if _event_day(event) == target_day]


def _trend(
    rows: Sequence[dict[str, object]], field: str, target_day: date
) -> TrendDirection:
    """Direction of a metric over the last week, or `stable` when unsure.

    Two faults lived in the `rows[-WEEK_DAYS:]` slice this used to take, the
    same pair as the sleep average above it:

    - It selected the last seven *rows*, not the last seven days. Wellness rows
      are sparse, so a quiet fortnight left the window spanning months — the
      direction then compared a reading from June against one from September and
      reported it as this week's trend.
    - `TREND_MIN_POINTS` exists to say "too few readings to call a direction",
      but the slice had already reached back arbitrarily far to fill itself, so
      the guard rarely fired. It now counts points that are genuinely inside the
      window, and a sparse week correctly reads as `stable`.
    """
    window_start = target_day - timedelta(days=WEEK_DAYS - 1)
    values = [
        _num(row.get(field))
        for row in sorted(rows, key=_row_day)
        if row.get(field) is not None and window_start <= _row_day(row) <= target_day
    ]
    if len(values) < TREND_MIN_POINTS:
        return "stable"
    delta = values[-1] - values[0]
    if delta > 1:
        return "up"
    if delta < -1:
        return "down"
    return "stable"


def _staleness_bucket(value: object, target_day: date) -> StalenessBucket:
    if value is None:
        return "missing"
    as_day = value.date() if isinstance(value, datetime) else value
    if isinstance(as_day, date) and (target_day - as_day).days <= 1:
        return "fresh"
    return "stale"


def _event_day(event: dict[str, object]) -> date | None:
    value = event.get("start_time")
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    return None


def _row_day(row: dict[str, object]) -> date:
    value = row["day"]
    if isinstance(value, date):
        return value
    return date.min


def _section(data_health: dict[str, object], key: str) -> dict[str, object]:
    value = data_health[key]
    return value if isinstance(value, dict) else {}


def _sum_tss(rows: Sequence[dict[str, object]]) -> float:
    return round(sum(_num(row.get("tss")) for row in rows), 1)


def _sum_planned_tss(events: Sequence[dict[str, object]]) -> float:
    return round(sum(_num(event.get("predicted_tss")) for event in events), 1)


def _field_count(rows: Sequence[dict[str, object]], field: str) -> int:
    return sum(1 for row in rows[-WEEK_DAYS:] if row.get(field) is not None)


def _caveat(field: str, issue: str, impact: str) -> dict[str, str]:
    return {"field": field, "issue": issue, "impact": impact}


def _num(value: object) -> float:
    if isinstance(value, int | float):
        return float(value)
    if value is None:
        return 0.0
    return float(str(value))

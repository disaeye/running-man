import asyncio
from collections.abc import Sequence
from datetime import date, datetime, time, timedelta
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Query

from application.data_health import compute_data_freshness
from domain.insights.readiness import compute_readiness
from domain.insights.recommendation import TrainingContext, compute_recommendation
from domain.insights.session_domains import aggregate_domain_seconds, domain_share
from domain.insights.session_quality import quality_matches
from domain.load.pmc import warmup_days
from domain.time import local_day, resolve_zone
from infrastructure.auth.models import Athlete
from infrastructure.db.pool import get_pool
from infrastructure.repositories.calendar import CalendarRepo
from infrastructure.repositories.pmc import PmcRepo
from presentation.api.analytics_analysis_contracts import CoachContextResponse
from presentation.api.coach_context_paces import latest_acwr, training_paces_for
from presentation.api.coach_context_recovery import (
    recovery_signals as _recovery_signals,
)
from presentation.api.coach_context_recovery import (
    trend as _trend,
)
from presentation.api.insights_helpers import _readiness_inputs
from presentation.api.session_domain_queries import classifications_for_range
from presentation.api.staleness import staleness_bucket
from presentation.auth.deps import get_current_athlete

router = APIRouter(prefix="/insights", tags=["insights"])

__all__ = ["_recovery_signals", "_trend"]

WEEK_DAYS = 7


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
    zone = resolve_zone(athlete.timezone)
    # 五路都是独立读：并发拉取，串行时每次往返的池检出与查询延迟叠加
    # 在一起，首页每次加载都要为此多等 100ms 以上。
    (
        (wellness, readiness_loads),
        pmc_loads,
        events,
        freshness,
        training_paces,
        classifications,
    ) = await asyncio.gather(
        _readiness_inputs(athlete.id, target_day),
        pmc_repo.get_daily_load_range(athlete.id, target_day - timedelta(days=89), target_day),
        calendar_repo.list(
            athlete.id,
            datetime.combine(target_day - timedelta(days=6), time.min, tzinfo=zone),
            datetime.combine(target_day + timedelta(days=1), time.max, tzinfo=zone),
        ),
        compute_data_freshness(athlete.id, db_pool),
        training_paces_for(athlete.id),
        classifications_for_range(
            athlete.id, target_day - timedelta(days=WEEK_DAYS - 1), target_day
        ),
    )
    readiness = compute_readiness(target_day, wellness, readiness_loads)
    completed_tss = _sum_tss(pmc_loads[-7:])
    week_events = [
        event
        for event in events
        if (day := _event_day(event, athlete.timezone)) is not None and day <= target_day
    ]
    planned_tss = _sum_planned_tss(week_events)
    return CoachContextResponse.model_validate(
        {
            "data_freshness": _data_freshness(freshness, target_day),
            "recent_load": _recent_load(pmc_loads, classifications),
            "recovery_signals": _recovery_signals(wellness, readiness, target_day, pmc_loads),
            "plan_adherence": _plan_adherence(completed_tss, planned_tss, classifications),
            "missing_data_caveats": _missing_data_caveats(freshness, wellness, target_day),
            "recommendation": compute_recommendation(
                readiness,
                _events_for_target_day(events, target_day, athlete.timezone),
                completed_tss,
                planned_tss,
                # Days with actual training, not days with a load row. The PMC series
                # is emitted for every calendar day including rest days, so its row
                # count is 7 for anyone with a week of history and the
                # `insufficient_rest_days` risk fired for everybody.
                _training_days(pmc_loads[-WEEK_DAYS:]),
                TrainingContext(
                    chronic_ctl=_chronic_ctl(pmc_loads),
                    training_paces=training_paces,
                    acwr=latest_acwr(pmc_loads),
                    has_plan_tomorrow=bool(
                        _events_for_target_day(
                            events, target_day + timedelta(days=1), athlete.timezone
                        )
                    ),
                ),
            ),
            "readiness": readiness,
        }
    )


def _training_days(loads: Sequence[dict[str, object]]) -> int:
    return sum(1 for row in loads if _positive(row.get("tss")))


def _chronic_ctl(loads: Sequence[dict[str, object]]) -> float | None:
    for row in reversed(loads):
        ctl = row.get("ctl")
        if isinstance(ctl, int | float) and ctl > 0:
            return float(ctl)
    return None


def _positive(value: object) -> bool:
    return isinstance(value, int | float) and value > 0


def _data_freshness(data_health: dict[str, object], target_day: date) -> dict[str, object]:
    return {
        "activities": _freshness_entry(_section(data_health, "activities"), target_day),
        "wellness": _freshness_entry(_section(data_health, "wellness"), target_day),
    }


def _freshness_entry(section: dict[str, object], target_day: date) -> dict[str, object]:
    data_as_of = section.get("data_as_of")
    return {
        "data_as_of": data_as_of.date() if isinstance(data_as_of, datetime) else data_as_of,
        "staleness_bucket": staleness_bucket(data_as_of, target_day),
    }


def _recent_load(
    loads: Sequence[dict[str, object]],
    classifications: Sequence[dict[str, object]] | None = None,
) -> dict[str, object]:
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
    seconds = aggregate_domain_seconds(classifications or [])
    return {
        "d7_tss": _sum_tss(loads[-WEEK_DAYS:]),
        "d28_tss": _sum_tss(loads[-28:]),
        "d90_tss": _sum_tss(loads[-90:]),
        "current_ctl": _num(current.get("ctl")),
        "current_atl": _num(current.get("atl")),
        "current_tsb": _num(current.get("tsb")),
        "ctl_warming_up": _ctl_warming_up(loads),
        "ctl_history_days": len(loads),
        "work_domain_seconds": seconds,
        "work_domain_share": domain_share(seconds),
    }


def _ctl_warming_up(loads: Sequence[dict[str, object]]) -> bool:
    return warmup_days(len(loads)) > 0


def _plan_adherence(
    completed_tss: float,
    planned_tss: float,
    classifications: Sequence[dict[str, object]] | None = None,
) -> dict[str, object]:
    """TSS adherence plus per-segment quality from stored classifications."""
    return {
        "completed_tss_7d": completed_tss,
        "planned_tss_7d": planned_tss,
        "adherence_pct": round(completed_tss / planned_tss * 100, 1) if planned_tss > 0 else 0.0,
        **quality_matches(classifications or []),
    }


def _missing_data_caveats(
    data_health: dict[str, object], wellness: Sequence[dict[str, object]], target_day: date
) -> list[dict[str, str]]:
    caveats: list[dict[str, str]] = []
    if _field_count(wellness, "hrv") < WEEK_DAYS:
        caveats.append(_caveat("hrv", "缺少 7 天数据", "HRV 趋势和恢复评分会偏保守"))
    if _field_count(wellness, "resting_hr") < WEEK_DAYS:
        caveats.append(_caveat("resting_hr", "缺少 7 天数据", "静息心率趋势可信度下降"))
    wellness_staleness = staleness_bucket(
        _section(data_health, "wellness").get("data_as_of"), target_day
    )
    if wellness_staleness != "fresh":
        caveats.append(_caveat("wellness", "健康数据不是当天", "恢复建议可能滞后"))
    gaps = data_health.get("gaps")
    if isinstance(gaps, list) and gaps:
        caveats.append(_caveat("data_gaps", "近 90 天存在数据缺口", "长期负荷统计可能低估"))
    return caveats


def _events_for_target_day(
    events: Sequence[dict[str, object]],
    target_day: date,
    timezone: str | None = None,
) -> list[dict[str, object]]:
    return [event for event in events if _event_day(event, timezone) == target_day]


def _event_day(event: dict[str, object], timezone: str | None = None) -> date | None:
    value = event.get("start_time")
    if isinstance(value, datetime):
        if value.tzinfo is not None and timezone is not None:
            return local_day(value, timezone)
        return value.date()
    if isinstance(value, date):
        return value
    return None


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

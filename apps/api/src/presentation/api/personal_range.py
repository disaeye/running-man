"""Personal-range figures for the ability card.

The demo page shows the athlete's ability as a set of percentages. There is no
population reference in this product, so the reference is the athlete's own
history: each figure says where today's value sits inside the range that
athlete's own values occupied over the window.

Every figure carries its own window, its own observation count and its own
value, so the reader can check the arithmetic rather than trust a score.
"""

from __future__ import annotations

from datetime import date, timedelta
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, ConfigDict

from application.thresholds.effective import resolve_effective_thresholds
from domain.insights.personal_range import range_position
from domain.time import today_in_zone
from infrastructure.auth.models import Athlete
from infrastructure.db.pool import get_pool, open_pool
from infrastructure.repositories.personal_range import (
    activity_series,
    latest_running_cadence,
    latest_value,
    load_series,
    numeric_values,
    running_cadence_values,
    wellness_series,
)
from presentation.auth.deps import get_current_athlete

router = APIRouter(prefix="/insights", tags=["insights"])

# The window the reference range is built from. Ninety days covers a training
# block: long enough that a single illness week does not define the range,
# short enough that the athlete's current form still sits inside it.
DEFAULT_WINDOW_DAYS = 90

# The metric keys the card shows. Each one names where its values come from.
METRICS: tuple[tuple[str, str, str], ...] = (
    ("ctl", "体能 CTL", "points"),
    ("hrv", "心率变异性 HRV", "ms"),
    ("resting_hr", "静息心率 RHR", "bpm"),
    ("sleep_secs", "睡眠时长", "h"),
    ("cadence", "平均步频", "spm"),
)


class PersonalRangeFigureResponse(BaseModel):
    """One figure and the range it sits in.

    ``percent`` is the position inside the athlete's own range over the window:
    0% is the window's lowest observation, 100% its highest. It is ``None``
    when there is no range to be in — too few observations, or no current
    value — and the page shows "样本不足" for those.
    """

    model_config = ConfigDict(extra="forbid", frozen=True)

    key: str
    label: str
    unit: str
    value: float | None = None
    minimum: float | None = None
    maximum: float | None = None
    median: float | None = None
    observations: int = 0
    percent: float | None = None
    insufficient: bool = False


class PersonalRangeResponse(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    window_start: date
    window_end: date
    window_days: int
    figures: list[PersonalRangeFigureResponse]


@router.get("/personal-range", response_model=PersonalRangeResponse)
async def get_personal_range(
    athlete: Annotated[Athlete, Depends(get_current_athlete)],
    window_days: Annotated[int, Query(ge=14, le=365)] = DEFAULT_WINDOW_DAYS,
) -> PersonalRangeResponse:
    """Where today's values sit inside the athlete's own recent range.

    The window ends today on the athlete's calendar, so "recent" means recent
    for them rather than for the server.
    """
    end = today_in_zone(athlete.timezone)
    start = end - timedelta(days=window_days - 1)

    await open_pool()
    async with get_pool().connection() as conn:
        wellness = await wellness_series(conn, athlete.id, start, end)
        loads = await load_series(conn, athlete.id, start, end)
        activities = await activity_series(conn, athlete.id, start, end)

    thresholds = await resolve_effective_thresholds(athlete.id)

    figures: list[PersonalRangeFigureResponse] = []
    for key, label, unit in METRICS:
        if key == "ctl":
            observations = numeric_values(loads, "ctl")
            current = latest_value(loads, "ctl")
        elif key == "hrv":
            observations = numeric_values(wellness, "hrv")
            current = latest_value(wellness, "hrv")
        elif key == "resting_hr":
            observations = numeric_values(wellness, "resting_hr")
            current = latest_value(wellness, "resting_hr")
        elif key == "sleep_secs":
            observations = [value / 3600 for value in numeric_values(wellness, "sleep_secs")]
            latest = latest_value(wellness, "sleep_secs")
            current = latest / 3600 if latest is not None else None
        else:
            observations = running_cadence_values(activities)
            current = latest_running_cadence(activities)

        position = range_position(key, label, unit, observations, current)
        figures.append(
            PersonalRangeFigureResponse(
                key=position.key,
                label=position.label,
                unit=position.unit,
                value=_round(position.value, unit),
                minimum=_round(position.minimum, unit),
                maximum=_round(position.maximum, unit),
                median=_round(position.median, unit),
                observations=position.observations,
                percent=position.percent,
                insufficient=position.insufficient,
            )
        )

    figures.append(_threshold_figure(thresholds))
    return PersonalRangeResponse(
        window_start=start,
        window_end=end,
        window_days=window_days,
        figures=figures,
    )


def _threshold_figure(thresholds: object) -> PersonalRangeFigureResponse:
    """The threshold pace, as a figure with no range.

    A threshold is a configured value, not something with a history to sit in,
    so it reports its value and no position.
    """
    value = getattr(thresholds, "threshold_pace", None)
    pace = getattr(value, "value", None)
    return PersonalRangeFigureResponse(
        key="threshold_pace",
        label="阈值配速",
        unit="s/km",
        value=round(float(pace), 1) if isinstance(pace, int | float) and pace else None,
        observations=0,
        insufficient=True,
    )


def _round(value: float | None, unit: str) -> float | None:
    """Round a figure for display.

    Sleep is in hours here, so one decimal; the rest keep their own precision.
    """
    if value is None:
        return None
    if unit == "h":
        return round(value, 1)
    if unit == "s/km":
        return round(value, 1)
    return round(value, 1)

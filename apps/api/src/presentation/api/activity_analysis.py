"""Per-activity analysis: laps, HR zone times, and summary metrics.

Heart-rate zone statistics are restricted to running, because the zones are
built from running thresholds. A cycling or strength session recorded on the
same watch has a different threshold heart rate, so bucketing its samples with
running zones would file ordinary work under the wrong intensities and inflate
the totals. Non-running activities therefore report no zone times at all rather
than a misleading breakdown.
"""

from __future__ import annotations

from datetime import datetime
from typing import Annotated, cast
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status

from domain.insights.activity_analysis import (
    compute_hr_zone_times,
    compute_laps,
    compute_power_curve,
    compute_summary,
    streams_by_metric,
)
from domain.insights.zone_schemes import (
    ZoneScheme,
    hr_zones_for_scheme,
    scheme_for,
)
from domain.insights.zones import Zone, ZoneOverrideLike, apply_overrides
from domain.thresholds.resolver import resolve_all
from infrastructure.auth.models import Athlete
from infrastructure.repositories.activity import ActivityRepo
from infrastructure.repositories.analytics import AnalyticsRepo
from infrastructure.repositories.thresholds import ThresholdRepo
from infrastructure.repositories.zone_overrides import list_overrides
from infrastructure.repositories.zone_scheme import get_hr_scheme
from presentation.api.analytics_analysis_contracts import (
    ActivityAnalysisLapResponse,
    ActivityAnalysisResponse,
    ActivityAnalysisSummaryResponse,
    HrZoneTimesResponse,
    PowerCurvePointResponse,
)
from presentation.api.sport_family import is_running
from presentation.auth.deps import get_current_athlete

router = APIRouter(prefix="/activities", tags=["activities"])


@router.get("/{activity_id}/analysis", response_model=ActivityAnalysisResponse)
async def get_activity_analysis(
    activity_id: str,
    athlete: Annotated[Athlete, Depends(get_current_athlete)],
) -> ActivityAnalysisResponse:
    repo = ActivityRepo()
    activity = await repo.get_by_id(athlete.id, activity_id)
    if activity is None:
        if await repo.exists(activity_id):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="activity belongs to another athlete",
            )
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="activity not found")

    stream_rows = await _activity_streams(athlete.id, activity_id)
    streams = streams_by_metric(stream_rows)
    duration_s = _duration(activity, streams)
    hr_zone_rows = await _hr_zones_for_activity(athlete, activity)
    return ActivityAnalysisResponse(
        laps=[ActivityAnalysisLapResponse.model_validate(lap) for lap in compute_laps(streams)],
        hr_zones=HrZoneTimesResponse.model_validate(
            compute_hr_zone_times(streams.get("heart_rate", []), duration_s, hr_zone_rows)
        ),
        power_curve=[
            PowerCurvePointResponse.model_validate(point)
            for point in compute_power_curve(streams.get("power", []))
        ],
        summary=ActivityAnalysisSummaryResponse.model_validate(
            compute_summary(streams, duration_s, None), by_name=True
        ),
    )


async def _activity_streams(athlete_id: UUID, activity_id: str) -> list[dict[str, object]]:
    return await AnalyticsRepo().activity_streams(athlete_id, activity_id)


async def _hr_zones_for_activity(
    athlete: Athlete, activity: dict[str, object]
) -> list[Zone]:
    """Zones for this activity, or ``[]`` when running zones do not apply.

    Thresholds are resolved for the activity's own date, so an activity keeps
    the zone boundaries that were in force when it was run.
    """
    sport = activity.get("sport")
    if not isinstance(sport, str) or not is_running(sport):
        return []
    start_time = activity.get("start_time")
    target_date = start_time.date() if isinstance(start_time, datetime) else None
    thresholds = await ThresholdRepo().history(athlete.id)
    resolved = resolve_all(thresholds, target_date)
    hr_max = _int_or_none(resolved["hr_max"])
    lthr = _int_or_none(resolved["lthr"])
    resting_hr = _int_or_none(resolved["resting_hr"])
    scheme = scheme_for(await _hr_scheme_key(athlete.id))
    base = hr_zones_for_scheme(
        scheme, hr_max=hr_max, lthr=lthr, resting_hr=resting_hr
    )
    if base is None:
        return []
    overrides = cast(
        list[ZoneOverrideLike], cast(object, await list_overrides(athlete.id))
    )
    updated, _ = apply_overrides(base, None, overrides)
    return updated


async def _hr_scheme_key(athlete_id: UUID) -> str | None:
    return await get_hr_scheme(athlete_id)


def _scheme_label(scheme: ZoneScheme) -> str:
    return scheme.label


def _duration(activity: dict[str, object], streams: dict[str, list[float]]) -> int:
    value = activity.get("duration_s")
    if isinstance(value, int | float) and value > 0:
        return round(value)
    return max((len(samples) for samples in streams.values()), default=0)


def _int_or_none(value: object) -> int | None:
    return int(value) if isinstance(value, int | float) and value > 0 else None

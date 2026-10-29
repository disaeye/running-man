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
    compute_biomechanics,
    compute_hr_zone_residence,
    compute_hr_zone_times,
    compute_laps,
    compute_power_curve,
    compute_summary,
    dominant_zone,
    pace_variation_s,
    stream_times_by_metric,
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
    BiomechanicsResponse,
    HrZoneResidenceResponse,
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
    stream_times = stream_times_by_metric(stream_rows)
    duration_s = _duration(activity, streams)
    hr_zone_rows = await _hr_zones_for_activity(athlete, activity)
    laps = compute_laps(streams, stream_times=stream_times)
    residence = compute_hr_zone_residence(
        streams.get("heart_rate", []),
        stream_times.get("heart_rate", []),
        hr_zone_rows,
    )
    biomechanics = compute_biomechanics(
        streams,
        sport=_text(activity.get("sport")),
        source_avg_cadence=_float_or_none(activity.get("avg_cadence")),
        source_avg_stride_length_m=_float_or_none(activity.get("avg_stride_length_m")),
        source_avg_lr_balance_pct=_float_or_none(activity.get("avg_lr_balance_pct")),
    )
    return ActivityAnalysisResponse(
        laps=[ActivityAnalysisLapResponse.model_validate(lap) for lap in laps],
        hr_zones=HrZoneTimesResponse.model_validate(
            compute_hr_zone_times(streams.get("heart_rate", []), duration_s, hr_zone_rows)
        ),
        power_curve=[
            PowerCurvePointResponse.model_validate(point)
            for point in compute_power_curve(streams.get("power", []))
        ],
        summary=ActivityAnalysisSummaryResponse.model_validate(
            compute_summary(streams, duration_s, None, stream_times=stream_times), by_name=True
        ),
        pace_variation_s=pace_variation_s(streams.get("speed", []), duration_s),
        fastest_lap_index=_fastest_lap(laps),
        zone_residence=[HrZoneResidenceResponse.model_validate(row) for row in residence],
        dominant_zone=dominant_zone(residence),
        biomechanics=BiomechanicsResponse.model_validate(
            {
                "avg_cadence_spm": biomechanics.avg_cadence_spm,
                "avg_stride_length_m": biomechanics.avg_stride_length_m,
                "avg_vertical_oscillation_cm": biomechanics.avg_vertical_oscillation_cm,
                "avg_ground_contact_time_ms": biomechanics.avg_ground_contact_time_ms,
                "avg_lr_balance_pct": biomechanics.avg_lr_balance_pct,
                "sample_counts": biomechanics.sample_counts,
            }
        ),
    )


def _fastest_lap(laps: list[dict[str, float | int | None]]) -> int | None:
    """The lap with the quickest pace, or ``None`` when no lap has a pace.

    A lap without a duration has no pace, so it cannot be the fastest; a
    session with no timed lap reports no fastest split rather than a guess.
    """
    best_index: int | None = None
    best_pace: float | None = None
    for lap in laps:
        distance = lap.get("distance_m")
        duration = lap.get("duration_s")
        if not isinstance(distance, int | float) or not isinstance(duration, int | float):
            continue
        if distance <= 0 or duration <= 0:
            continue
        pace = duration / (distance / 1000.0)
        if best_pace is None or pace < best_pace:
            best_pace = pace
            index = lap.get("lap_index")
            best_index = int(index) if isinstance(index, int) else None
    return best_index


def _text(value: object) -> str | None:
    if isinstance(value, str):
        return value
    return None


def _float_or_none(value: object) -> float | None:
    if isinstance(value, int | float):
        return float(value)
    return None


async def _activity_streams(athlete_id: UUID, activity_id: str) -> list[dict[str, object]]:
    return await AnalyticsRepo().activity_streams(athlete_id, activity_id)


async def _hr_zones_for_activity(athlete: Athlete, activity: dict[str, object]) -> list[Zone]:
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
    base = hr_zones_for_scheme(scheme, hr_max=hr_max, lthr=lthr, resting_hr=resting_hr)
    if base is None:
        return []
    overrides = cast(list[ZoneOverrideLike], cast(object, await list_overrides(athlete.id)))
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

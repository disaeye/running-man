from datetime import date, datetime, timedelta
from typing import Annotated, cast

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, ConfigDict

from application.computation.orchestration import enqueue_activity_recompute
from application.insights import service as insights_service
from domain.insights.hard_days import detect_consecutive_hard_days
from domain.insights.plan_quality import compute_plan_quality
from domain.insights.prs import (
    compute_ride_prs,
    compute_run_prs,
    is_ride_sport,
    is_run_sport,
)
from domain.insights.taper import assess_taper
from domain.insights.weekly_progress import compute_weekly_progress
from domain.insights.zone_schemes import ZoneScheme, hr_zones_for_scheme, scheme_for
from domain.insights.zones import (
    ActivityLike,
    Zone,
    activity_distribution,
    weekly_breakdown,
)
from domain.thresholds.resolver import ThresholdStep, resolve_all
from infrastructure.auth.models import Athlete
from infrastructure.repositories.thresholds import ThresholdRepo
from infrastructure.repositories.zone_scheme import get_hr_scheme
from presentation.api.analytics_insight_contracts import (
    HardDayRangeResponse,
    IntensityDistributionResponse,
    PlanQualityResponse,
    RecomputeResponse,
    RidePersonalRecordResponse,
    RunPersonalRecordResponse,
    TaperResponse,
    TrainingRecommendationResponse,
    WeeklyProgressResponse,
)
from presentation.api.insights_activity_queries import _activities_for_range, _all_activities
from presentation.api.insights_contracts import intensity_distribution_item
from presentation.api.insights_helpers import (
    _activities_with_power,
    _daily_loads_for_range,
    _date_range,
    _planned_events,
    _power_streams_for_activities,
    _quality_message,
    _ride_record,
    _run_record,
    _streams_for_activities,
    _tss_value,
    _zone_seconds,
)
from presentation.api.readiness_contract import ReadinessResponse, build_readiness_response
from presentation.auth.deps import get_current_athlete

router = APIRouter(prefix="/insights", tags=["insights"])

RECOMPUTE_MAX_DAYS = 365


def _zones_at(
    thresholds: list[ThresholdStep], scheme: ZoneScheme, start_time: object
) -> list[Zone]:
    """Zone boundaries in force when this activity happened.

    Resolving per activity date keeps a July session bucketed by July's
    thresholds after the athlete re-tests in September.
    """
    target = start_time.date() if isinstance(start_time, datetime) else None
    resolved = resolve_all(thresholds, target)
    zones = hr_zones_for_scheme(
        scheme,
        hr_max=_positive_int(resolved["hr_max"]),
        lthr=_positive_int(resolved["lthr"]),
        resting_hr=_positive_int(resolved["resting_hr"]),
    )
    return zones or []


def _positive_int(value: object) -> int | None:
    return int(value) if isinstance(value, int | float) and value > 0 else None


class RecomputeRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    from_date: date | None = None
    to_date: date | None = None


@router.get("/intensity-distribution", response_model=list[IntensityDistributionResponse])
async def get_intensity_distribution(
    athlete: Annotated[Athlete, Depends(get_current_athlete)],
    start: Annotated[date | None, Query(alias="from")] = None,
    end: Annotated[date | None, Query(alias="to")] = None,
) -> list[IntensityDistributionResponse]:
    """Weekly time-in-zone for running activities.

    Running only: the zone boundaries come from running thresholds, so a ride
    or a strength session bucketed with them would report intensities it never
    reached. Non-running activities are excluded rather than mis-bucketed.
    """
    range_start, range_end = _date_range(start, end)
    activities = [
        row
        for row in await _activities_for_range(athlete.id, range_start, range_end)
        if is_run_sport(str(row.get("sport")))
    ]
    activity_ids = [str(row["activity_id"]) for row in activities]
    streams = await _streams_for_activities(athlete.id, activity_ids)
    thresholds = await ThresholdRepo().history(athlete.id)
    scheme = scheme_for(await get_hr_scheme(athlete.id))
    distributions = [
        activity_distribution(
            cast(ActivityLike, cast(object, row)),
            streams.get(str(row["activity_id"]), []),
            _zones_at(thresholds, scheme, row.get("start_time")),
        )
        for row in activities
    ]
    return [
        intensity_distribution_item(
            row,
            _zone_seconds(cast(dict[str, float], row["by_zone"])),
        )
        for row in weekly_breakdown(distributions)
    ]


@router.get(
    "/personal-records",
    response_model=list[RunPersonalRecordResponse | RidePersonalRecordResponse],
)
async def get_personal_records(
    athlete: Annotated[Athlete, Depends(get_current_athlete)],
    sport: str | None = Query(default=None),
) -> list[RunPersonalRecordResponse | RidePersonalRecordResponse]:
    activities = await _all_activities(athlete.id, sport)
    records: list[RunPersonalRecordResponse | RidePersonalRecordResponse] = []
    run_activities = [row for row in activities if is_run_sport(str(row.get("sport")))]
    ride_activities = [row for row in activities if is_ride_sport(str(row.get("sport")))]
    if sport is None or any(is_run_sport(str(row.get("sport"))) for row in activities):
        records.extend(
            RunPersonalRecordResponse.model_validate(_run_record(row))
            for row in compute_run_prs(run_activities)
        )
    if sport is None or any(is_ride_sport(str(row.get("sport"))) for row in activities):
        ride_ids = [str(row["activity_id"]) for row in ride_activities]
        powers = await _power_streams_for_activities(athlete.id, ride_ids)
        ride_prs = compute_ride_prs(_activities_with_power(ride_activities, powers))
        records.extend(
            RidePersonalRecordResponse.model_validate(_ride_record(row)) for row in ride_prs
        )
    return records


@router.get("/weekly-progress", response_model=list[WeeklyProgressResponse])
async def get_weekly_progress(
    athlete: Annotated[Athlete, Depends(get_current_athlete)],
    start: Annotated[date | None, Query(alias="from")] = None,
    end: Annotated[date | None, Query(alias="to")] = None,
) -> list[WeeklyProgressResponse]:
    range_start, range_end = _date_range(start, end)
    events = await _planned_events(athlete.id, range_start, range_end)
    activities = await _activities_for_range(athlete.id, range_start, range_end)
    weekly_progress = compute_weekly_progress(events, activities, range_start, range_end)
    return [WeeklyProgressResponse.model_validate(row) for row in weekly_progress]


@router.get("/plan-quality", response_model=PlanQualityResponse)
async def get_plan_quality(
    athlete: Annotated[Athlete, Depends(get_current_athlete)],
    start: Annotated[date | None, Query(alias="from")] = None,
    end: Annotated[date | None, Query(alias="to")] = None,
) -> PlanQualityResponse:
    range_start, range_end = _date_range(start, end)
    events = await _planned_events(athlete.id, range_start, range_end)
    activities = await _activities_for_range(athlete.id, range_start, range_end)
    quality = compute_plan_quality(events, activities, range_start, range_end)
    planned_tss = sum(_number(row.get("predicted_tss")) for row in events)
    actual_tss = sum(_number(row.get("tss")) for row in activities)
    planned_sessions = len(events)
    actual_sessions = len(activities)
    return PlanQualityResponse.model_validate(
        {
            **quality,
            "message": _quality_message(quality),
            "weekly_tss": actual_tss,
            "target_tss": planned_tss,
            "key_sessions_completed": actual_sessions,
            "key_sessions_total": planned_sessions,
            "concerns": quality["risks"] or quality["recommendations"],
        }
    )


@router.get("/taper", response_model=TaperResponse)
async def get_taper(
    athlete: Annotated[Athlete, Depends(get_current_athlete)],
    start: Annotated[date | None, Query(alias="from")] = None,
    end: Annotated[date | None, Query(alias="to")] = None,
    race_date: Annotated[date | None, Query(alias="race_date")] = None,
) -> TaperResponse:
    range_start, range_end = _date_range(start, end)
    loads = await _daily_loads_for_range(athlete.id, range_start, range_end)
    assessment = assess_taper(loads, race_date)
    return TaperResponse(
        is_tapering=assessment.is_tapering,
        freshness_ok=assessment.freshness_ok,
        recommended_reduction_pct=assessment.recommended_reduction_pct,
        days_to_race=assessment.days_to_race,
    )


@router.get("/hard-days", response_model=list[HardDayRangeResponse])
async def get_hard_days(
    athlete: Annotated[Athlete, Depends(get_current_athlete)],
    start: Annotated[date | None, Query(alias="from")] = None,
    end: Annotated[date | None, Query(alias="to")] = None,
) -> list[HardDayRangeResponse]:
    range_start, range_end = _date_range(start, end)
    loads = await _daily_loads_for_range(athlete.id, range_start, range_end)
    tss_values = [_tss_value(row) for row in loads]
    runs = detect_consecutive_hard_days(tss_values)
    return [
        HardDayRangeResponse(start_index=start_idx, end_index=end_idx)
        for start_idx, end_idx in runs
    ]


@router.get("/readiness", response_model=ReadinessResponse)
async def get_readiness(
    target_day: Annotated[date, Query(alias="date")],
    athlete: Annotated[Athlete, Depends(get_current_athlete)],
) -> ReadinessResponse:
    assessment = await insights_service.readiness_assessment(athlete.id, target_day)
    return build_readiness_response(
        target_day,
        assessment.readiness,
        assessment.wellness,
        assessment.loads,
    )


@router.get("/recommendation", response_model=TrainingRecommendationResponse)
async def get_recommendation(
    target_day: Annotated[date, Query(alias="date")],
    athlete: Annotated[Athlete, Depends(get_current_athlete)],
) -> TrainingRecommendationResponse:
    recommendation = await insights_service.training_recommendation(athlete.id, target_day)
    return TrainingRecommendationResponse.model_validate(recommendation)


@router.post("/recompute", response_model=RecomputeResponse)
async def recompute_insights(
    athlete: Annotated[Athlete, Depends(get_current_athlete)],
    body: RecomputeRequest | None = None,
) -> RecomputeResponse:
    now = date.today()
    from_date = body.from_date if body and body.from_date else now - timedelta(days=90)
    to_date = body.to_date if body and body.to_date else now

    if (to_date - from_date).days > RECOMPUTE_MAX_DAYS:
        raise HTTPException(status_code=400, detail="Date range cannot exceed 365 days")

    generation = await enqueue_activity_recompute(athlete.id, "manual")
    return RecomputeResponse(
        recompute_status="queued",
        recompute_generation=generation,
    )


def _number(value: object) -> float:
    return float(value) if isinstance(value, int | float) else 0.0

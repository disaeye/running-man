from __future__ import annotations

from datetime import date, datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from presentation.api.json_contracts import JsonDocument
from presentation.api.schemas_core import RunWorkoutPrescription


class NotificationPrefs(BaseModel):
    today_reminder: bool = True
    recovery_risk_alert: bool = True
    sync_failure_alert: bool = True
    plan_deviation_alert: bool = False


class AthleteMe(BaseModel):
    id: str
    email: str
    name: str = ""
    timezone: str = "UTC"
    hr_max: int | None = None
    resting_hr: int | None = None
    lthr: int | None = None
    threshold_pace: float | None = None
    dob: date | None = None
    sex: str | None = None
    weight_goal: float | None = None
    weekly_training_days: int | None = 5
    max_session_duration_min: int | None = 120
    preferred_sport: str | None = "Run"
    notification_prefs: NotificationPrefs | None = None


class PmcPoint(BaseModel):
    day: date
    ctl: float
    atl: float
    tsb: float
    tss: float
    acwr: float | None = None


class SportStatsBucket(BaseModel):
    sport: str
    total_distance_m: float
    total_duration_s: int
    total_tss: float
    activity_count: int
    avg_tss: float


class ActivityStatsResponse(BaseModel):
    total_distance_m: float
    total_duration_s: int
    total_tss: float
    activity_count: int
    avg_tss: float
    by_sport: list[SportStatsBucket]


class ActivitySummary(BaseModel):
    activity_id: str
    start_time: datetime
    sport: str
    distance_m: float | None = None
    duration_s: int | None = None
    avg_hr: int | None = None
    max_hr: int | None = None
    avg_power: int | None = None
    np: float | None = None
    intensity_factor: float | None = None
    tss: float | None = None
    icu_ctl: float | None = None
    avg_cadence: float | None = None
    avg_speed: float | None = None
    elevation_gain_m: float | None = None
    calories: int | None = None
    external_id: str | None = None
    source: str | None = None
    file_type: str | None = None
    device_name: str | None = None
    summary_polyline: str | None = None
    # Whether the activity carries GPS. The list view filters on this, and
    # previously tried to infer it from ``source == "garmin"`` — a source value
    # that never occurs (this deployment syncs from Intervals.icu), so the
    # "GPS" filter always returned nothing.
    has_gps: bool = False


class ActivityUploadResponse(ActivitySummary):
    recompute_status: Literal["queued"]
    recompute_generation: int


class ActivityWeather(BaseModel):
    avg_temp: float | None = None
    min_temp: float | None = None
    max_temp: float | None = None
    feels_like: float | None = None
    wind_speed: float | None = None
    wind_gust: float | None = None
    wind_deg: float | None = None
    headwind_pct: float | None = None
    tailwind_pct: float | None = None
    clouds_pct: float | None = None
    max_rain: float | None = None
    max_snow: float | None = None


class ActivityDetail(ActivitySummary):
    has_hr: bool = False
    has_power: bool = False
    has_cadence: bool = False
    raw_data: JsonDocument | None = None
    weather: ActivityWeather | None = None

    @field_validator("has_gps", "has_hr", "has_power", "has_cadence", mode="before")
    @classmethod
    def _none_capability_as_false(cls, value: bool | None) -> bool:
        return False if value is None else value


class CalendarEvent(BaseModel):
    event_id: str
    start_time: datetime
    category: str
    sport_type: str | None = None
    name: str | None = None
    workout_xml: str | None = None
    predicted_tss: float | None = None
    status: str | None = None
    done: bool | None = None
    plan_goal_id: UUID | None = None
    plan_source: str | None = None
    training_type: str | None = None
    workout_prescription: RunWorkoutPrescription | None = None
    athlete_edited: bool = False
    linked_activity_id: str | None = None
    completed_distance_m: float | None = None
    completed_duration_s: int | None = None
    completed_avg_hr: int | None = None
    completed_rpe: int | None = None
    actual_logged_at: datetime | None = None


class GoalCreate(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    type: str
    title: str
    target_value: float | None = None
    current_value: float | None = None
    unit: str | None = None
    target_date: date | None = None
    race_distance_m: float | None = Field(default=None, ge=1500, le=1_000_000)
    race_target_time_s: int | None = Field(default=None, ge=180, le=172_800)
    status: str | None = None

    @model_validator(mode="after")
    def _race_fields_require_event(self) -> GoalCreate:
        has_race_data = self.race_distance_m is not None or self.race_target_time_s is not None
        if has_race_data and self.type != "event":
            raise ValueError("比赛距离与目标用时仅适用于比赛目标")
        if self.race_target_time_s is not None and self.race_distance_m is None:
            raise ValueError("设置比赛目标用时前必须填写比赛距离")
        return self


class GoalUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    type: str | None = None
    title: str | None = None
    target_value: float | None = None
    current_value: float | None = None
    unit: str | None = None
    target_date: date | None = None
    race_distance_m: float | None = Field(default=None, ge=1500, le=1_000_000)
    race_target_time_s: int | None = Field(default=None, ge=180, le=172_800)
    status: str | None = None

    @model_validator(mode="after")
    def _validate_race_update(self) -> GoalUpdate:
        if self.type is not None and self.type != "event":
            if self.race_distance_m is not None or self.race_target_time_s is not None:
                raise ValueError("比赛距离与目标用时仅适用于比赛目标")
        if self.race_target_time_s is not None and self.race_distance_m is None:
            raise ValueError("设置比赛目标用时前必须填写比赛距离")
        if self.race_distance_m is None and self.race_target_time_s is not None:
            raise ValueError("设置比赛目标用时前必须填写比赛距离")
        return self


class GoalResponse(BaseModel):
    goal_id: str
    athlete_id: str
    type: str
    title: str
    target_value: float | None = None
    current_value: float
    unit: str | None = None
    target_date: date | None = None
    race_distance_m: float | None = None
    race_target_time_s: int | None = None
    status: str
    created_at: datetime
    updated_at: datetime

    @field_validator("goal_id", "athlete_id", mode="before")
    @classmethod
    def _uuid_as_string(cls, value: object) -> str:
        return str(value)


class MilestoneCreate(BaseModel):
    title: str
    target_date: date | None = None
    target_value: float | None = None
    achieved: bool | None = None
    achieved_at: datetime | None = None


class MilestoneResponse(BaseModel):
    milestone_id: str
    goal_id: str
    title: str
    target_date: date | None = None
    target_value: float | None = None
    achieved: bool
    achieved_at: datetime | None = None


class LapResponse(BaseModel):
    lap_index: int
    start_time: datetime | None = None
    duration_s: int | None = None
    distance_m: float | None = None
    avg_hr: int | None = None
    max_hr: int | None = None
    avg_pace: float | None = None
    avg_power: int | None = None

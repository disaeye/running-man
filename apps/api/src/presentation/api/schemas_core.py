from __future__ import annotations

from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator


class CoreResponseModel(BaseModel):
    model_config = ConfigDict(extra="ignore", frozen=True)


class RecomputeQueuedResponse(CoreResponseModel):
    recompute_status: Literal["queued"] | None = None
    recompute_generation: int | None = None


class RecomputeJobStatusResponse(CoreResponseModel):
    status: Literal["pending", "running", "failed", "succeeded"] | None = None
    requested_at: datetime | None = None
    finished_at: datetime | None = None
    attempts: int = 0
    generation: int | None = None
    last_error: str | None = None
    trigger: str | None = None


class AthleteProfileUpdate(BaseModel):
    """Partial profile update.

    Threshold fields (``hr_max``, ``resting_hr``, ``lthr``, ``threshold_pace``)
    are written as a new ``athlete_thresholds`` step dated today, so editing a
    threshold does not retroactively change how past activities are scored.

    ``lthr`` is accepted here because it is the reference for heart rate zones
    and for hrTSS; without a write path the value could only ever come from a
    seeded row, and the UI input for it silently discarded what the athlete
    typed.
    """

    model_config = ConfigDict(extra="forbid", frozen=True)

    name: str | None = None
    timezone: str | None = None
    hr_max: int | None = Field(default=None, gt=0, le=260)
    resting_hr: int | None = Field(default=None, gt=0, le=120)
    lthr: int | None = Field(default=None, gt=0, le=240)
    threshold_pace: float | None = Field(default=None, gt=0)
    dob: date | None = None
    sex: str | None = None
    weight_goal: float | None = Field(default=None, gt=0)
    weekly_training_days: int | None = Field(default=None, ge=1, le=7)
    max_session_duration_min: int | None = Field(default=None, gt=0)
    preferred_sport: str | None = None
    notification_prefs: NotificationPrefsUpdate | None = None


class NotificationPrefsUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    today_reminder: bool | None = None
    recovery_risk_alert: bool | None = None
    sync_failure_alert: bool | None = None
    plan_deviation_alert: bool | None = None


class RunWorkoutSegment(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    type: Literal[
        "easy", "recovery", "long", "tempo", "intervals", "threshold", "warmup", "cooldown"
    ]
    duration_min: int = Field(gt=0, le=600)
    pace_min_s_km: int | None = Field(default=None, gt=0, le=1800)
    pace_max_s_km: int | None = Field(default=None, gt=0, le=1800)
    repetitions: int | None = Field(default=None, ge=1, le=100)
    recovery_min: int | None = Field(default=None, gt=0, le=120)
    rpe_min: int | None = Field(default=None, ge=1, le=10)
    rpe_max: int | None = Field(default=None, ge=1, le=10)

    @field_validator("pace_max_s_km")
    @classmethod
    def _pace_order(cls, value: int | None, info: object) -> int | None:
        pace_min = info.data.get("pace_min_s_km")  # type: ignore[attr-defined]
        if value is not None and pace_min is not None and pace_min > value:
            raise ValueError("slower pace bound must not be faster than the minimum pace")
        return value

    @field_validator("pace_min_s_km")
    @classmethod
    def _pace_minimum_not_faster_than_maximum(cls, value: int | None, info: object) -> int | None:
        pace_max = info.data.get("pace_max_s_km")  # type: ignore[attr-defined]
        if value is not None and pace_max is not None and value > pace_max:
            raise ValueError("slower pace bound must not be faster than the minimum pace")
        return value

    @field_validator("rpe_max")
    @classmethod
    def _rpe_order(cls, value: int | None, info: object) -> int | None:
        rpe_min = info.data.get("rpe_min")  # type: ignore[attr-defined]
        if value is not None and rpe_min is not None and rpe_min > value:
            raise ValueError("minimum RPE must not exceed maximum RPE")
        return value


class RunWorkoutPrescription(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    version: Literal[1]
    type: Literal["easy", "recovery", "long", "tempo", "intervals"]
    duration_min: int = Field(ge=0, le=600)
    pace_min_s_km: int | None = Field(default=None, gt=0, le=1800)
    pace_max_s_km: int | None = Field(default=None, gt=0, le=1800)
    segments: list[RunWorkoutSegment]
    phase: str | None = None


class CalendarEventCreate(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    event_id: str = Field(min_length=1)
    start_time: datetime
    category: str = Field(min_length=1)
    sport_type: str | None = None
    name: str | None = None
    workout_xml: str | None = None
    predicted_tss: float | None = Field(default=None, ge=0)
    status: str | None = None
    done: bool | None = None
    plan_goal_id: str | None = None
    plan_source: str | None = None
    training_type: str | None = None
    workout_prescription: RunWorkoutPrescription | None = None


class CalendarEventUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    start_time: datetime | None = None
    category: str | None = Field(default=None, min_length=1)
    sport_type: str | None = None
    name: str | None = None
    workout_xml: str | None = None
    predicted_tss: float | None = Field(default=None, ge=0)
    status: str | None = None
    done: bool | None = None
    workout_prescription: RunWorkoutPrescription | None = None
    completed_distance_m: float | None = Field(default=None, gt=0)
    completed_duration_s: int | None = Field(default=None, gt=0)
    completed_avg_hr: int | None = Field(default=None, ge=25, le=260)
    completed_rpe: int | None = Field(default=None, ge=1, le=10)
    actual_logged_at: datetime | None = None
    linked_activity_id: str | None = None


class MilestoneUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    title: str | None = Field(default=None, min_length=1)
    target_date: date | None = None
    target_value: float | None = None
    achieved: bool | None = None
    achieved_at: datetime | None = None


class BatchUploadItem(CoreResponseModel):
    filename: str
    status: str
    activity_id: str | None = None
    error: str | None = None


class BatchUploadResponse(RecomputeQueuedResponse):
    results: list[BatchUploadItem]


class BulkDeleteResponse(RecomputeQueuedResponse):
    status: str


class IgnoreResult(RecomputeQueuedResponse):
    """Outcome of ignoring or un-ignoring one activity."""

    activity_id: str
    ignored: bool


class RestoreResult(RecomputeQueuedResponse):
    """Outcome of undoing a soft delete."""

    activity_id: str
    deleted: bool


class BulkIgnoreRequest(BaseModel):
    """Activities to ignore, and which way to set the flag."""

    model_config = ConfigDict(frozen=True)

    activity_ids: list[str]
    ignored: bool = True


class BulkIgnoreResult(RecomputeQueuedResponse):
    """Outcome of ignoring or un-ignoring several activities at once."""

    updated: list[str]
    ignored: bool


class FlaggedActivity(BaseModel):
    """An activity that is ignored or in the trash.

    Carries enough for a list row; the full activity payload is available from
    the ordinary detail endpoint.
    """

    model_config = ConfigDict(frozen=True)

    activity_id: str
    start_time: datetime
    sport: str
    distance_m: float | None = None
    duration_s: int | None = None
    ignored_at: datetime | None = None
    deleted_at: datetime | None = None

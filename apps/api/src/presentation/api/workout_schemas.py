"""Request/response models for workouts and strength training.

Split out of ``presentation.api.schemas`` to keep each module within the
repository's file-size limit. These models cover workout templates, planned
workout prediction, the exercise library, and logged strength sets.
"""

from datetime import date, datetime
from uuid import UUID

from pydantic import BaseModel, Field


class WorkoutPredictionRequest(BaseModel):
    historical_daily_tss: dict[date, float]
    planned_workouts: dict[date, float]
    current_ctl: float
    current_atl: float
    horizon_days: int = 28


class WorkoutPredictionPoint(BaseModel):
    day: date
    projected_tss: float
    projected_ctl: float
    projected_atl: float
    projected_tsb: float
    projected_acwr: float | None
    is_overtraining_risk: bool
    is_high_load_risk: bool
    is_fresh: bool


class WorkoutTemplateSegment(BaseModel):
    segment_type: str
    duration_s: int
    power_low: float
    power_high: float


class WorkoutTemplateCreate(BaseModel):
    name: str
    sport: str | None = "Run"
    goal_type: str | None = None
    segments: list[WorkoutTemplateSegment]
    predicted_tss: float | None = None


class WorkoutTemplateUpdate(BaseModel):
    name: str | None = None
    sport: str | None = None
    goal_type: str | None = None
    segments: list[WorkoutTemplateSegment] | None = None
    predicted_tss: float | None = None


class WorkoutTemplateResponse(BaseModel):
    template_id: UUID
    athlete_id: UUID | None = None
    name: str
    sport: str
    goal_type: str | None = None
    segments: list[WorkoutTemplateSegment] | None = None
    predicted_tss: float | None = None
    source: str
    created_at: datetime


class ExerciseLibraryItem(BaseModel):
    id: int
    name_cn: str
    name_en: str
    category: str
    primary_muscles: list[str]
    secondary_muscles: list[str] | None = None
    equipment: str | None = None
    movement_pattern: str | None = None
    instructions: str | None = None
    common_mistakes: str | None = None
    difficulty: str | None = None


class WorkoutCreate(BaseModel):
    date: date
    name: str | None = None


class WorkoutCreateResponse(BaseModel):
    activity_id: str


class WorkoutExerciseCreate(BaseModel):
    exercise_id: int
    order_index: int | None = None
    notes: str | None = None


class WorkoutExerciseUpdate(BaseModel):
    notes: str | None = None
    order_index: int | None = None


class WorkoutExerciseResponse(BaseModel):
    id: int
    activity_id: str
    athlete_id: UUID
    exercise_id: int
    order_index: int
    notes: str | None = None
    created_at: datetime
    name_cn: str | None = None
    name_en: str | None = None
    category: str | None = None
    primary_muscles: list[str] | None = None
    secondary_muscles: list[str] | None = None
    equipment: str | None = None
    movement_pattern: str | None = None


class SetCreate(BaseModel):
    weight_kg: float = Field(ge=0)
    reps: int = Field(gt=0)
    rpe: float | None = Field(default=None, ge=1, le=10)
    set_type: str | None = None
    rest_seconds: int | None = None


class SetUpdate(BaseModel):
    weight_kg: float | None = Field(default=None, ge=0)
    reps: int | None = Field(default=None, gt=0)
    rpe: float | None = Field(default=None, ge=1, le=10)
    set_type: str | None = None
    rest_seconds: int | None = None
    completed: bool | None = None


class SetResponse(BaseModel):
    id: int
    workout_exercise_id: int
    athlete_id: UUID
    set_number: int
    weight_kg: float | None = None
    reps: int
    rpe: float | None = None
    set_type: str | None = None
    rest_seconds: int | None = None
    completed: bool
    estimated_1rm_kg: float | None = None
    created_at: datetime

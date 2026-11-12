from __future__ import annotations

from pydantic import BaseModel, Field, ValidationInfo, field_validator

from presentation.api.session_parts import (
    MODEL_CONFIG,
    IntensityAnchor,
    PlanEvidencePayload,
    QualityTarget,
    SessionMeasured,
    SessionQualityPayload,
    SessionTarget,
    WorkGroupPayload,
)

__all__ = [
    "IntensityAnchor",
    "PlanEvidencePayload",
    "QualityTarget",
    "RunWorkoutPrescription",
    "RunWorkoutSegment",
    "SessionClassificationResponse",
    "SessionClassificationSummary",
    "SessionExecutionPayload",
    "SessionMeasured",
    "SessionQualityPayload",
    "SessionTarget",
    "WorkGroupPayload",
    "WorkoutTemplateSegment",
]


class RunWorkoutSegment(BaseModel):
    model_config = MODEL_CONFIG

    type: str | None = None
    duration_min: float | None = None
    pace_min_s_km: float | None = None
    pace_max_s_km: float | None = None
    repetitions: int | None = None
    recovery_min: float | None = None
    rpe_min: float | None = None
    rpe_max: float | None = None
    role: str | None = None
    order: int | None = None
    start_s: float | None = None
    end_s: float | None = None
    duration_s: float | None = None
    distance_m: float | None = None
    pace_s_km: float | None = None
    avg_hr: float | None = None
    domain: str | None = None
    evidence_source: str | None = None
    source_group: str | None = None
    sets: int | None = None
    recovery_duration_s: float | None = None
    recovery_distance_m: float | None = None
    intensity_domain: str | None = None
    source_refs: list[str] = Field(default_factory=list)
    rationale: str | None = None
    target_adaptation: str | None = None
    quality_target: QualityTarget | None = None
    target: SessionTarget | None = None
    measured: SessionMeasured | None = None

    @field_validator("pace_max_s_km")
    @classmethod
    def _pace_order(cls, value: float | None, info: ValidationInfo) -> float | None:
        pace_min = info.data.get("pace_min_s_km")
        if value is not None and isinstance(pace_min, int | float) and pace_min > value:
            raise ValueError("slower pace bound must not be faster than the minimum pace")
        return value

    @field_validator("rpe_max")
    @classmethod
    def _rpe_order(cls, value: float | None, info: ValidationInfo) -> float | None:
        rpe_min = info.data.get("rpe_min")
        if value is not None and isinstance(rpe_min, int | float) and rpe_min > value:
            raise ValueError("minimum RPE must not exceed maximum RPE")
        return value


class RunWorkoutPrescription(BaseModel):
    model_config = MODEL_CONFIG

    version: int | None = None
    type: str | None = None
    duration_min: float | None = None
    pace_min_s_km: float | None = None
    pace_max_s_km: float | None = None
    segments: list[RunWorkoutSegment] = Field(default_factory=list)
    phase: str | None = None
    status: str | None = None
    structure: str | None = None
    session_type: str | None = None
    primary_stimulus: str | None = None
    pacing_pattern: str | None = None
    display_line: str | None = None
    target_domain: str | None = None
    source_refs: list[str] = Field(default_factory=list)
    rationale: str | None = None
    target_adaptation: str | None = None
    intensity_anchor: IntensityAnchor | None = None
    quality_target: QualityTarget | None = None
    evidence: PlanEvidencePayload | None = None


class SessionExecutionPayload(BaseModel):
    model_config = MODEL_CONFIG

    activity_distance_m: float | None = None
    work_distance_m: float | None = None
    recovery_distance_m: float | None = None
    warmup_distance_m: float | None = None
    cooldown_distance_m: float | None = None
    segments_distance_m: float | None = None
    segments: list[RunWorkoutSegment] = Field(default_factory=list)
    work_groups: list[WorkGroupPayload] = Field(default_factory=list)


class SessionClassificationSummary(BaseModel):
    model_config = MODEL_CONFIG

    activity_id: str
    local_day: str
    context: str
    structure: str
    session_type: str | None = None
    primary_stimulus: str
    secondary_stimuli: list[str] = Field(default_factory=list)
    pacing_pattern: str | None = None
    modifiers: list[str] = Field(default_factory=list)
    display_name: str
    display_line: str
    evidence_grade: str
    confidence: float


class SessionClassificationResponse(BaseModel):
    model_config = MODEL_CONFIG

    session_classification: SessionClassificationSummary
    prescription: RunWorkoutPrescription
    execution: SessionExecutionPayload
    quality: SessionQualityPayload
    evidence: PlanEvidencePayload


class WorkoutTemplateSegment(BaseModel):
    model_config = MODEL_CONFIG

    segment_type: str
    duration_s: float
    distance_m: float | None = None
    pace_key: str | None = None
    pace_min_s_km: float | None = None
    pace_max_s_km: float | None = None
    repetitions: int | None = None
    recovery_s: float | None = None
    recovery_distance_m: float | None = None
    role: str | None = None
    sets: int | None = None
    target_domain: str | None = None
    anchor: str | None = None
    primary_stimulus: str | None = None
    source_refs: list[str] = Field(default_factory=list)
    rationale: str | None = None
    target_adaptation: str | None = None
    quality_target: QualityTarget | None = None
    evidence: PlanEvidencePayload | None = None
    target: SessionTarget | None = None
    measured: SessionMeasured | None = None

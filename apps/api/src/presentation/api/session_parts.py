from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field

from presentation.api.segment_difference_contracts import SegmentDifferencePayload
from presentation.api.theory_contracts import TheoryPayload

MODEL_CONFIG = ConfigDict(extra="ignore", frozen=True)


class SessionTarget(BaseModel):
    model_config = MODEL_CONFIG

    distance_m: float | None = None
    duration_s: float | None = None
    pace_key: str | None = None
    anchor_model: str | None = None
    pace_s_km: float | None = None
    pace_min_s_km: float | None = None
    pace_max_s_km: float | None = None
    hr_bpm: float | None = None
    hr_min_bpm: float | None = None
    hr_max_bpm: float | None = None
    rpe_min: float | None = None
    rpe_max: float | None = None
    domain: str | None = None


class SessionMeasured(BaseModel):
    model_config = MODEL_CONFIG

    distance_m: float | None = None
    duration_s: float | None = None
    pace_s_km: float | None = None
    avg_hr: float | None = None
    speed_m_s: float | None = None
    rpe: float | None = None


class IntensityAnchor(BaseModel):
    model_config = MODEL_CONFIG

    model: str
    effective_from: str | None = None
    pace_key: str | None = None
    threshold_pace_s_km: float | None = None
    pace_min_s_km: float | None = None
    pace_max_s_km: float | None = None
    algorithm_version: str | None = None
    source_refs: list[str] = Field(default_factory=list)


class QualityTarget(BaseModel):
    model_config = MODEL_CONFIG

    work_distance_m: float | None = None
    work_duration_s: float | None = None
    time_in_domain_s: float | None = None
    target_repetitions: int | None = None


class ThresholdSnapshotPayload(BaseModel):
    model_config = MODEL_CONFIG

    effective_from: str | None = None
    hr_max: float | None = None
    resting_hr: float | None = None
    lthr: float | None = None
    threshold_pace_s_km: float | None = None
    intensity_anchor: str | None = None
    source_refs: list[str] = Field(default_factory=list)
    backfill_from: str | None = None
    limitations: list[str] = Field(default_factory=list)


class SourceDetailPayload(BaseModel):
    model_config = MODEL_CONFIG

    key: str = ""
    title: str = ""
    url: str = ""
    doi: str = ""


class SubjectiveEvidencePayload(BaseModel):
    model_config = MODEL_CONFIG

    rpe: float | None = None
    rpe_scale: str | None = None
    talk_test: str | None = None


class PlanEvidencePayload(BaseModel):
    model_config = MODEL_CONFIG

    source_refs: list[str] = Field(default_factory=list)
    source_details: list[SourceDetailPayload] = Field(default_factory=list)
    theory: TheoryPayload | None = None
    measurement_sources: list[str] = Field(default_factory=list)
    limitations: list[str] = Field(default_factory=list)
    rationale: str | None = None
    interval_summary: list[str] | None = None
    threshold_snapshot: ThresholdSnapshotPayload | None = None
    subjective: SubjectiveEvidencePayload | None = None
    race_marker_present: bool | None = None
    direct_metabolic_thresholds: bool | None = None
    schema_version: str | None = None
    algorithm_version: str | None = None


class WorkGroupPayload(BaseModel):
    model_config = MODEL_CONFIG

    source_group: str
    sets: int
    repetitions: int | None = None
    distance_range_m: list[float] = Field(default_factory=list)
    duration_range_s: list[float] = Field(default_factory=list)
    pace_range_s_km: list[float] = Field(default_factory=list)
    recovery_duration_s: float | None = None
    recovery_distance_m: float | None = None
    target_pace_s_km: list[float] | None = None


class DomainResidence(BaseModel):
    model_config = MODEL_CONFIG

    below_mt1: float | None = None
    mt1_mt2: float | None = None
    mt2_wmax: float | None = None
    above_wmax: float | None = None
    low_unspecified: float | None = None


class SessionQualityPayload(BaseModel):
    model_config = MODEL_CONFIG

    repetition_match: float | None = None
    work_distance_match: float | None = None
    work_duration_match: float | None = None
    pace_attainment: float | None = None
    hr_attainment: float | None = None
    rpe_match: float | None = None
    structure_match: float | None = None
    domain_residence_s: DomainResidence | None = None
    work_domain_residence_s: DomainResidence | None = None
    work_pace_cv: float | None = None
    distance_consistency: float | None = None
    fade_pct: float | None = None
    recovery_ratio: float | None = None
    tss: float | None = None
    trimp: float | None = None
    aerobic_decoupling_pct: float | None = None
    low_domain_share: float | None = None
    time_in_domain_s: float | None = None
    peak_speed_attainment: float | None = None
    stride_consistency: float | None = None
    monotonicity: float | None = None
    speed_increase_pct: float | None = None
    last_domain_match: float | None = None
    per_segment_differences: list[SegmentDifferencePayload] = Field(default_factory=list)
    paired_segment_count: int | None = None
    unpaired_segment_count: int | None = None
    confidence: float | None = None
    evidence_grade: str | None = None

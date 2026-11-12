from dataclasses import dataclass
from typing import Literal, TypedDict

ThresholdSnapshot = TypedDict(
    "ThresholdSnapshot",
    {
        "effective_from": str,
        "hr_max": float | None,
        "resting_hr": float | None,
        "lthr": float | None,
        "threshold_pace_s_km": float | None,
        "intensity_anchor": str,
        "source_refs": list[str],
        "backfill_from": str | None,
        "limitations": list[str],
    },
)

SessionSegment = dict[str, object]


@dataclass(frozen=True, slots=True)
class WorkGroup:
    source_group: str
    sets: int
    repetitions: int | None
    distance_range_m: list[float]
    duration_range_s: list[float]
    pace_range_s_km: list[float]
    recovery_duration_s: float
    recovery_distance_m: float
    target_pace_s_km: list[float] | None


@dataclass(frozen=True, slots=True)
class ActivityEvidence:
    activity_id: str
    local_day: str
    context: Literal["completed"]
    sport: str
    duration_s: int
    distance_m: float
    raw_data: dict[str, object]
    streams: dict[str, list[tuple[float, float]]]
    laps: list[dict[str, object]]
    exact_intervals: list[dict[str, object]]
    threshold: ThresholdSnapshot
    metrics: dict[str, float]
    linked_activity_id: str | None
    is_race: bool
    race_marker_present: bool
    rpe: float | None
    direct_metabolic_thresholds: bool
    linked_prescription: dict[str, object] | None


@dataclass(frozen=True, slots=True)
class SegmentBuild:
    segments: list[SessionSegment]
    work_groups: list[WorkGroup]
    measurement_sources: list[str]
    exact_source: bool
    limitations: list[str]

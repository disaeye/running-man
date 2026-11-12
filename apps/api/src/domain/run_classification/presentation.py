from domain.run_classification.analysis import domain_residence_s
from domain.run_classification.models import ActivityEvidence, WorkGroup
from domain.run_classification.schema import STIMULUS_CATALOG
from domain.run_classification.shared_segments import (
    build_execution_segments,
    build_plan_segments,
)
from domain.run_classification.utils import coefficient, distance, duration, fade_pct, pace


def build_presentation(
    evidence: ActivityEvidence,
    segments: list[dict[str, object]],
    work_groups: list[WorkGroup],
    structure: str,
    stimulus: str,
    grade: str,
    confidence: float,
) -> dict[str, object]:
    plan_segments = (
        build_plan_segments(evidence, evidence.linked_prescription)
        if evidence.linked_prescription is not None
        else None
    )
    execution_segments = build_execution_segments(segments)
    prescription_segments = plan_segments or execution_segments
    work = [item for item in execution_segments if item.get("role") == "work"]
    recovery = [item for item in execution_segments if item.get("role") == "recovery"]
    return {
        "prescription": _prescription(evidence, work, prescription_segments, stimulus, structure),
        "execution": _execution(evidence, execution_segments, work_groups),
        "quality": _quality(evidence, work, recovery, execution_segments, grade, confidence),
    }


def _prescription(
    evidence: ActivityEvidence,
    work: list[dict[str, object]],
    segments: list[dict[str, object]],
    stimulus: str,
    structure: str,
) -> dict[str, object]:
    if evidence.linked_prescription is not None:
        linked = dict(evidence.linked_prescription)
        linked["segments"] = segments
        return linked
    spec = STIMULUS_CATALOG[stimulus]
    return {
        "version": 1,
        "type": structure,
        "status": "unplanned",
        "source_refs": list(spec.source_refs),
        "rationale": spec.target_adaptation,
        "target_adaptation": spec.target_adaptation,
        "intensity_anchor": {"model": "athlete_thresholds", **dict(evidence.threshold)},
        "target_domain": spec.target_domain,
        "segments": segments,
        "quality_target": {
            "work_distance_m": round(sum(distance(item) for item in work), 1),
            "work_duration_s": round(sum(duration(item) for item in work), 1),
        },
    }


def _execution(
    evidence: ActivityEvidence,
    segments: list[dict[str, object]],
    groups: list[WorkGroup],
) -> dict[str, object]:
    by_role = {
        role: round(sum(distance(item) for item in segments if item.get("role") == role), 1)
        for role in ("work", "recovery", "warmup", "cooldown", "transition")
    }
    return {
        "activity_distance_m": round(evidence.distance_m, 1),
        "work_distance_m": by_role["work"],
        "recovery_distance_m": by_role["recovery"],
        "warmup_distance_m": by_role["warmup"],
        "cooldown_distance_m": by_role["cooldown"],
        "segments_distance_m": round(sum(by_role.values()), 1),
        "segments": segments,
        "work_groups": [
            {
                "source_group": group.source_group,
                "sets": group.sets,
                "repetitions": group.repetitions,
                "distance_range_m": group.distance_range_m,
                "duration_range_s": group.duration_range_s,
                "pace_range_s_km": group.pace_range_s_km,
                "recovery_duration_s": group.recovery_duration_s,
                "recovery_distance_m": group.recovery_distance_m,
                "target_pace_s_km": group.target_pace_s_km,
            }
            for group in groups
        ],
    }


def _quality(
    evidence: ActivityEvidence,
    work: list[dict[str, object]],
    recovery: list[dict[str, object]],
    segments: list[dict[str, object]],
    grade: str,
    confidence: float,
) -> dict[str, object]:
    paces = [pace(item) for item in work if pace(item) > 0]
    recovery_s = sum(duration(item) for item in recovery)
    work_s = sum(duration(item) for item in work)
    segments_distance = sum(distance(item) for item in segments)
    consistency = (
        round(segments_distance / evidence.distance_m, 4) if evidence.distance_m > 0 else None
    )
    return {
        "repetition_match": None,
        "work_distance_match": None,
        "work_duration_match": None,
        "pace_attainment": None,
        "hr_attainment": None,
        "rpe_match": evidence.rpe,
        "structure_match": None,
        "domain_residence_s": domain_residence_s(evidence.raw_data),
        "work_pace_cv": coefficient(paces),
        "fade_pct": fade_pct(paces),
        "recovery_ratio": round(recovery_s / max(1.0, work_s), 3),
        "distance_consistency": consistency,
        "tss": evidence.metrics.get("tss"),
        "trimp": evidence.metrics.get("trimp"),
        "aerobic_decoupling_pct": evidence.metrics.get("aerobic_decoupling_pct"),
        "confidence": confidence,
        "evidence_grade": grade,
    }

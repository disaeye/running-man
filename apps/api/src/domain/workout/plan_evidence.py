from dataclasses import dataclass
from typing import Final

from domain.physiology.vdot import VDOT_ALGORITHM_VERSION
from domain.run_classification.schema import (
    DOMAIN_MAPPING,
    SOURCE_REFS,
    STIMULUS_CATALOG,
)
from domain.workout.plan_expression import (
    format_plan_expression as _render_plan_expression,
)
from domain.workout.plan_expression import (
    work_quality_target as _work_quality_target,
)

PLAN_SOURCE_REFS: Final[tuple[str, ...]] = SOURCE_REFS

_WORKOUT_SPEC: Final[dict[str, tuple[str, str, str]]] = {
    "easy": ("aerobic_base", "below_mt1", "easy"),
    "recovery": ("recovery", "below_mt1", "easy"),
    "long": ("aerobic_endurance", "below_mt1", "easy"),
    "tempo": ("lactate_threshold", "mt1_mt2", "threshold"),
    "intervals": ("vo2max", "mt2_wmax", "interval"),
}

_STRUCTURE: Final[dict[str, str]] = {
    "easy": "continuous",
    "recovery": "continuous",
    "long": "continuous",
    "tempo": "continuous",
    "intervals": "interval",
}


@dataclass(frozen=True, slots=True)
class PlanScience:
    structure: str
    session_type: str
    primary_stimulus: str
    target_domain: str
    pacing_pattern: str
    status: str
    source_refs: list[str]
    rationale: str
    target_adaptation: str
    intensity_anchor: dict[str, object]
    quality_target: dict[str, object]
    evidence: dict[str, object]


def session_science(
    workout_type: str,
    duration_min: int,
    training_paces: dict[str, dict[str, float]] | None,
    *,
    pace_effective_from: str | None = None,
    pace_source_refs: tuple[str, ...] = (),
    pace_anchor_model: str = "Daniels-VDOT",
    pace_anchors: dict[str, object] | None = None,
) -> PlanScience:
    if workout_type not in _WORKOUT_SPEC:
        raise ValueError(f"unsupported workout type: {workout_type}")
    stimulus, domain, pace_key = _WORKOUT_SPEC[workout_type]
    spec = STIMULUS_CATALOG[stimulus]
    pace = (training_paces or {}).get(pace_key)
    pace_min = pace["min"] if pace else None
    pace_max = pace["max"] if pace else None
    descriptor = DOMAIN_MAPPING[domain]["descriptor"]
    acsm = DOMAIN_MAPPING[domain]["acsm_essa"]
    rationale = (
        f"{spec.target_adaptation}；ACSM/ESSA 强度域为 {domain}，"
        f"对应 {acsm} 与 {descriptor}；配速锚点来自 {pace_anchor_model} 的 {pace_key} 配速。"
    )
    refs = list(dict.fromkeys((*spec.source_refs, *pace_source_refs, *PLAN_SOURCE_REFS)))
    threshold = (training_paces or {}).get("threshold")
    anchor: dict[str, object] = {
        "model": pace_anchor_model,
        "intensity_anchor": pace_anchor_model,
        "effective_from": pace_effective_from,
        "pace_key": pace_key,
        "threshold_pace_s_km": threshold["min"] if threshold else None,
        "pace_min_s_km": pace_min,
        "pace_max_s_km": pace_max,
        "algorithm_version": VDOT_ALGORITHM_VERSION,
        "source_refs": refs,
    }
    if pace_anchors is not None:
        anchor.update(pace_anchors)
        anchor.setdefault("model", pace_anchor_model)
        anchor.setdefault("intensity_anchor", pace_anchor_model)
    quality_target = _quality_target(workout_type, duration_min, pace_min, pace_max)
    return PlanScience(
        structure=_STRUCTURE[workout_type],
        session_type=workout_type,
        primary_stimulus=stimulus,
        target_domain=domain,
        pacing_pattern="steady" if workout_type != "intervals" else "intermittent",
        status="planned",
        source_refs=refs,
        rationale=rationale,
        target_adaptation=spec.target_adaptation,
        intensity_anchor=anchor,
        quality_target=quality_target,
        evidence={
            "source_refs": refs,
            "measurement_sources": ["athlete_thresholds", "Daniels-VDOT"],
            "limitations": [] if pace else ["缺少有效配速锚点"],
            "rationale": rationale,
        },
    )


def plan_science_payload(science: PlanScience) -> dict[str, object]:
    return {
        "structure": science.structure,
        "session_type": science.session_type,
        "primary_stimulus": science.primary_stimulus,
        "target_domain": science.target_domain,
        "pacing_pattern": science.pacing_pattern,
        "status": science.status,
        "source_refs": science.source_refs,
        "rationale": science.rationale,
        "target_adaptation": science.target_adaptation,
        "intensity_anchor": science.intensity_anchor,
        "quality_target": science.quality_target,
        "evidence": science.evidence,
    }


def segment_science_payload(science: PlanScience, role: str) -> dict[str, object]:
    return {
        "role": role,
        "intensity_domain": science.target_domain,
        "source_refs": science.source_refs,
        "rationale": science.rationale,
        "target_adaptation": science.target_adaptation,
        "quality_target": science.quality_target,
        "target": {"domain": science.target_domain},
        "measured": {},
    }


def format_plan_expression(
    science: PlanScience,
    segments: tuple[dict[str, object], ...] | list[dict[str, object]],
) -> str:
    return _render_plan_expression(science, segments)


def work_quality_target(
    segments: tuple[dict[str, object], ...] | list[dict[str, object]],
) -> dict[str, object]:
    return _work_quality_target(segments)


def _quality_target(
    workout_type: str,
    duration_min: int,
    pace_min: float | None,
    pace_max: float | None,
) -> dict[str, object]:
    if pace_min is None or pace_max is None:
        return {}
    mean_pace = (pace_min + pace_max) / 2.0
    target_distance = duration_min * 60.0 / mean_pace * 1000.0
    return {
        "work_distance_m": round(target_distance, 1),
        "work_duration_s": duration_min * 60,
        "time_in_domain_s": duration_min * 60,
        "target_repetitions": 6 if workout_type == "intervals" else 1,
    }

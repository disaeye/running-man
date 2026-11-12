from dataclasses import replace
from typing import Final

from domain.run_classification.analysis import StreamFeatures
from domain.run_classification.display import (
    CourseExpressionInput,
    course_expression,
    display_name,
)
from domain.run_classification.models import ActivityEvidence, WorkGroup
from domain.run_classification.presentation import build_presentation
from domain.run_classification.quality import compare_quality
from domain.run_classification.rules import (
    detect_modifiers,
    detect_pacing_pattern,
    detect_session_type,
    detect_stimulus,
    detect_structure,
    secondary_stimuli,
)
from domain.run_classification.schema import (
    ALGORITHM_VERSION,
    DOMAIN_NAMES,
    SCHEMA_VERSION,
    SOURCE_DETAILS,
    SOURCE_REFS,
)
from domain.run_classification.stimulus_metrics import bind_stimulus_metrics
from domain.run_classification.theory import theory_payload
from domain.run_classification.utils import duration

MAX_GRADE_B_CONFIDENCE: Final = 0.85


def classify_session(
    evidence: ActivityEvidence,
    segments: list[dict[str, object]],
    work_groups: list[WorkGroup],
    features: StreamFeatures,
    *,
    exact_source: bool,
    limitations: list[str],
    measurement_sources: list[str] | None = None,
) -> dict[str, object]:
    work = [item for item in segments if item.get("role") == "work"]
    recovery = [item for item in segments if item.get("role") == "recovery"]
    insufficient = not work or not evidence.streams.get("speed")
    structure = "unclear" if insufficient else detect_structure(work, recovery, features, segments)
    session_type = (
        "unclear" if insufficient else detect_session_type(work, recovery, structure, features)
    )
    pacing_pattern = "unclear" if insufficient else detect_pacing_pattern(structure, features)
    if session_type == "interval_unspecified":
        work_groups = [_unspecified_group(group) for group in work_groups]
    stimulus = "unclear" if insufficient else detect_stimulus(work, structure, session_type)
    modifiers = [] if insufficient else detect_modifiers(evidence, features)
    grade, confidence = evidence_grade(
        evidence,
        exact_source,
        structure,
        measurement_sources=measurement_sources,
        session_type=session_type,
    )
    presentation = build_presentation(
        evidence,
        segments,
        work_groups,
        structure,
        stimulus,
        grade,
        confidence,
    )
    quality = presentation["quality"]
    assert isinstance(quality, dict)
    if evidence.linked_prescription is not None:
        quality = compare_quality(
            quality,
            _as_object(presentation["prescription"]),
            _as_object(presentation["execution"]),
        )
    quality["work_domain_residence_s"] = _work_domain_seconds(work)
    quality = bind_stimulus_metrics(quality, evidence, work, features, stimulus)
    name = display_name(session_type, structure, stimulus, modifiers)
    expression = CourseExpressionInput(
        evidence=evidence,
        structure=structure,
        session_type=session_type,
        groups=work_groups,
        segments=segments,
        stimulus=stimulus,
        modifiers=modifiers,
        features=features,
        grade=grade,
        confidence=confidence,
        quality=quality,
    )
    return {
        "session_classification": {
            "activity_id": evidence.activity_id,
            "local_day": evidence.local_day,
            "context": evidence.context,
            "structure": structure,
            "session_type": session_type,
            "primary_stimulus": stimulus,
            "secondary_stimuli": secondary_stimuli(work, stimulus, modifiers),
            "pacing_pattern": pacing_pattern,
            "modifiers": modifiers,
            "display_name": name,
            "display_line": course_expression(expression),
            "evidence_grade": grade,
            "confidence": confidence,
        },
        "prescription": presentation["prescription"],
        "execution": presentation["execution"],
        "quality": quality,
        "evidence": _evidence_payload(evidence, limitations, measurement_sources),
    }


def evidence_grade(
    evidence: ActivityEvidence,
    exact_source: bool,
    structure: str = "continuous",
    *,
    measurement_sources: list[str] | None = None,
    session_type: str = "continuous",
) -> tuple[str, float]:
    """Grade from the evidence that actually supplied segment boundaries."""
    _ = structure
    zone_seconds = evidence.raw_data.get("icu_hr_zone_times")
    sources = set(measurement_sources or [])
    has_zone_seconds = isinstance(zone_seconds, list) and len(zone_seconds) == 5
    has_thresholds = bool(evidence.threshold["effective_from"])
    has_streams = bool(evidence.streams)
    has_summary = evidence.distance_m > 0
    decisive = (
        evidence.direct_metabolic_thresholds,
        exact_source,
        evidence.linked_prescription is not None,
        evidence.rpe is not None,
        evidence.race_marker_present,
        has_streams,
        has_zone_seconds,
        has_thresholds,
    )
    coverage = sum(decisive) / len(decisive)
    if all(decisive[:5]) and exact_source and has_streams:
        return "A", round(0.90 + 0.09 * coverage, 2)
    if exact_source and has_streams and has_zone_seconds and has_thresholds:
        confidence = min(MAX_GRADE_B_CONFIDENCE, round(0.55 + 0.35 * coverage, 2))
        if session_type == "interval_unspecified":
            return "C", min(confidence, 0.65)
        return "B", confidence
    if "activity_laps" in sources and has_streams and has_summary:
        return "C", round(0.45 + 0.25 * coverage, 2)
    return "D", round(0.35 + 0.15 * coverage, 2)


def _work_domain_seconds(work: list[dict[str, object]]) -> dict[str, float]:
    result = {name: 0.0 for name in DOMAIN_NAMES}
    for item in work:
        domain = str(item.get("domain") or "low_unspecified")
        if domain not in result:
            domain = "low_unspecified"
        result[domain] += duration(item)
    return {key: round(value, 1) for key, value in result.items()}


def _evidence_payload(
    evidence: ActivityEvidence,
    limitations: list[str],
    measurement_sources: list[str] | None,
) -> dict[str, object]:
    source_details = [dict(SOURCE_DETAILS[key]) for key in SOURCE_REFS]
    extra_limitations = list(limitations)
    extra_limitations.extend(str(item) for item in evidence.threshold["limitations"])
    if evidence.rpe is None:
        extra_limitations.append("缺少 RPE，感知强度只作为辅助证据")
    if not evidence.race_marker_present:
        extra_limitations.append("缺少比赛标记")
    if not evidence.direct_metabolic_thresholds:
        extra_limitations.append("缺少直接 MT1/MT2/Wmax 测量")
    return {
        "source_refs": list(SOURCE_REFS),
        "source_details": source_details,
        "theory": theory_payload(),
        "measurement_sources": sorted(
            {
                "activity_summary",
                "athlete_thresholds",
                *(measurement_sources or []),
                *_stream_sources(evidence),
            }
        ),
        "limitations": sorted(set(extra_limitations)),
        "interval_summary": evidence.raw_data.get("interval_summary"),
        "threshold_snapshot": dict(evidence.threshold),
        "subjective": {
            "rpe": evidence.rpe,
            "rpe_scale": "CR10" if evidence.rpe is not None else None,
            "talk_test": _talk_test(evidence.rpe),
        },
        "race_marker_present": evidence.race_marker_present,
        "direct_metabolic_thresholds": evidence.direct_metabolic_thresholds,
        "schema_version": SCHEMA_VERSION,
        "algorithm_version": ALGORITHM_VERSION,
    }


def _talk_test(rpe: float | None) -> str | None:
    """Map CR10 to the ACSM/ESSA effort descriptor used as adjunct evidence."""
    if rpe is None:
        return None
    if rpe < 2:
        return "very easy"
    if rpe < 4:
        return "easy"
    if rpe < 6:
        return "somewhat hard"
    if rpe < 8:
        return "hard"
    return "very hard"


def _stream_sources(evidence: ActivityEvidence) -> list[str]:
    return [f"activity_streams:{key}" for key in sorted(evidence.streams)]


def _unspecified_group(group: WorkGroup) -> WorkGroup:
    return replace(group, repetitions=None, distance_range_m=[])


def _as_object(value: object) -> dict[str, object]:
    if not isinstance(value, dict):
        raise TypeError("presentation object must be a dict")
    return value

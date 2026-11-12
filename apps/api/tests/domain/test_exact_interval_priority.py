from dataclasses import replace
from typing import Any, cast

from application.run_classification.service import classify_evidence
from tests.domain.run_classification_fixtures import interval_evidence


def test_exact_intervals_win_over_linked_plan_boundaries() -> None:
    plan: dict[str, object] = {
        "version": 1,
        "type": "intervals",
        "segments": [
            {
                "order": 1,
                "role": "warmup",
                "start_s": 0,
                "end_s": 300,
                "duration_s": 300,
                "distance_m": 800.0,
                "target": {"distance_m": 800.0, "duration_s": 300},
            },
            {
                "order": 2,
                "role": "work",
                "start_s": 300,
                "end_s": 900,
                "duration_s": 600,
                "distance_m": 2000.0,
                "target": {"distance_m": 2000.0, "duration_s": 600},
            },
            {
                "order": 3,
                "role": "cooldown",
                "start_s": 900,
                "end_s": 1380,
                "duration_s": 480,
                "distance_m": 1000.0,
                "target": {"distance_m": 1000.0, "duration_s": 480},
            },
        ],
        "source_refs": ["Daniels-VDOT"],
        "rationale": "计划处方",
        "target_adaptation": "计划目标",
        "target_domain": "mt2_wmax",
        "intensity_anchor": {"model": "Daniels-VDOT"},
        "quality_target": {"work_distance_m": 2000.0, "work_duration_s": 600},
    }
    item = replace(
        interval_evidence(),
        linked_prescription=plan,
        linked_activity_id="i-interval",
    )

    result = classify_evidence(item)

    execution = cast(dict[str, Any], result["execution"])
    prescription = cast(dict[str, Any], result["prescription"])
    segments = cast(list[dict[str, Any]], execution["segments"])
    plan_segments = cast(list[dict[str, Any]], prescription["segments"])
    summary = cast(dict[str, Any], result["session_classification"])
    quality = cast(dict[str, Any], result["quality"])
    assert len(segments) == 11
    assert {segment["evidence_source"] for segment in segments} == {"icu_intervals"}
    assert len(plan_segments) == 3
    assert summary["structure"] == "interval"
    assert prescription["source_refs"] == ["Daniels-VDOT"]
    shared = ("pace_s_km", "avg_hr", "domain", "evidence_source")
    assert all(
        "target" in segment and "measured" in segment and all(field in segment for field in shared)
        for segment in plan_segments
    )
    assert all(
        "target" in segment and "measured" in segment and all(field in segment for field in shared)
        for segment in segments
    )
    assert quality["repetition_match"] == 6.0
    assert quality["structure_match"] != 1.0
    differences = cast(list[dict[str, Any]], quality["per_segment_differences"])
    paired = [row for row in differences if row["paired"]]
    assert quality["paired_segment_count"] == len(paired)
    assert all(row["target_role"] == row["measured_role"] for row in paired)
    assert all(row["overlap_s"] is not None for row in paired)
    assert len(differences) >= len(segments)
    assert quality["unpaired_segment_count"] == sum(1 for row in differences if not row["paired"])

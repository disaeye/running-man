from typing import Any, cast

from domain.run_classification.analysis import stream_features
from domain.run_classification.classifier import classify_session
from domain.run_classification.models import ActivityEvidence, ThresholdSnapshot
from domain.run_classification.segments import build_segments

TRAINING_PACES = {
    "easy": {"min": 340.0, "max": 390.0},
    "threshold": {"min": 270.0, "max": 285.0},
    "interval": {"min": 245.0, "max": 260.0},
}


def threshold() -> ThresholdSnapshot:
    return ThresholdSnapshot(
        effective_from="2026-09-07",
        hr_max=187.0,
        resting_hr=49.0,
        lthr=172.0,
        threshold_pace_s_km=286.0,
        intensity_anchor="athlete_thresholds:threshold_pace",
        source_refs=["ACSM-ESSA-2025-intensity-terminology", "Daniels-VDOT"],
        backfill_from=None,
        limitations=[],
    )


def raw_data(**overrides: object) -> dict[str, object]:
    values: dict[str, object] = {
        "threshold_pace": 3.4965036,
        "pace_zones": [72.0, 91.0, 97.0, 102.0, 999.0],
        "icu_hr_zones": [142, 160, 174, 186, 192],
        "icu_hr_zone_times": [600, 300, 300, 300, 300],
        "pace_zone_times": [600, 300, 300, 300, 300],
        "gap_zone_times": [600, 300, 300, 300, 300],
        "use_gap_zone_times": True,
        "total_elevation_gain": 3.0,
        "interval_summary": ["4x 4m 165bpm"],
        "race": False,
    }
    values.update(overrides)
    return values


def evidence(**overrides: object) -> ActivityEvidence:
    values: dict[str, object] = {
        "activity_id": "i-test",
        "local_day": "2026-09-07",
        "context": "completed",
        "sport": "run",
        "duration_s": 1800,
        "distance_m": 6000.0,
        "raw_data": raw_data(),
        "streams": {
            "speed": [(float(second), 3.3) for second in range(1800)],
            "heart_rate": [(float(second), 150.0) for second in range(1800)],
        },
        "laps": [],
        "exact_intervals": [],
        "threshold": threshold(),
        "metrics": {"tss": 60.0, "trimp": 65.0},
        "linked_activity_id": None,
        "is_race": False,
        "race_marker_present": True,
        "rpe": None,
        "direct_metabolic_thresholds": False,
        "linked_prescription": None,
    }
    values.update(overrides)
    return ActivityEvidence(**values)  # type: ignore[arg-type]


def interval_evidence() -> ActivityEvidence:
    exact: list[dict[str, object]] = []
    start = 0
    for index in range(6):
        exact.append(
            {
                "start_index": start,
                "end_index": start + 180,
                "type": "WORK",
                "group_id": "180s@170bpm",
                "moving_time": 180,
                "distance": 1000.0,
                "average_speed": 5.55,
                "average_heartrate": 170,
            }
        )
        start += 180
        if index < 5:
            exact.append(
                {
                    "start_index": start,
                    "end_index": start + 60,
                    "type": "RECOVERY",
                    "group_id": None,
                    "moving_time": 60,
                    "distance": 200.0,
                    "average_speed": 3.33,
                    "average_heartrate": 140,
                }
            )
            start += 60
    return evidence(
        activity_id="i-interval",
        duration_s=1380,
        distance_m=7000.0,
        exact_intervals=exact,
        streams={
            "speed": [(float(second), 5.0) for second in range(1380)],
            "heart_rate": [(float(second), 165.0) for second in range(1380)],
        },
    )


def classified(item: ActivityEvidence) -> dict[str, Any]:
    build = build_segments(item)
    result = classify_session(
        item,
        build.segments,
        build.work_groups,
        stream_features(item),
        exact_source=build.exact_source,
        limitations=build.limitations,
        measurement_sources=build.measurement_sources,
    )
    return cast(dict[str, Any], result)

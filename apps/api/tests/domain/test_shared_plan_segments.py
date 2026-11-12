from datetime import date, timedelta

from domain.insights.plan_quality import compute_plan_quality
from domain.insights.plan_segments import (
    aggregate_execution_segment_facts,
    aggregate_plan_segment_facts,
    work_from_segments,
)
from domain.insights.weekly_progress import compute_weekly_progress


def _work_segment(distance_m: float, duration_s: float) -> dict[str, object]:
    return {
        "role": "work",
        "distance_m": distance_m,
        "duration_s": duration_s,
        "domain": "below_mt1",
        "target": {"distance_m": distance_m, "duration_s": duration_s},
        "measured": {"distance_m": distance_m, "duration_s": duration_s},
    }


def _recovery_segment() -> dict[str, object]:
    return {
        "role": "recovery",
        "distance_m": 200.0,
        "duration_s": 60.0,
        "domain": "below_mt1",
        "target": {"distance_m": 200.0, "duration_s": 60.0},
        "measured": {"distance_m": 200.0, "duration_s": 60.0},
    }


def test_plan_and_execution_segments_share_one_work_definition() -> None:
    segments = [_work_segment(1000.0, 300.0), _recovery_segment(), _work_segment(1200.0, 360.0)]
    facts = work_from_segments(segments)
    assert facts["work_bouts"] == 2
    assert facts["work_distance_m"] == 2200.0
    assert facts["work_duration_s"] == 660.0
    assert facts["domain_seconds"]["below_mt1"] == 660.0

    events = [{"workout_prescription": {"segments": segments}}]
    classifications = [{"execution": {"segments": segments}}]
    assert aggregate_plan_segment_facts(events)["work_distance_m"] == 2200.0
    assert aggregate_execution_segment_facts(classifications)["work_distance_m"] == 2200.0


def test_weekly_progress_reads_planned_work_segments() -> None:
    start = date(2026, 2, 2)
    event = {
        "start_time": start,
        "predicted_tss": 100.0,
        "predicted_distance_m": 10000.0,
        "workout_prescription": {"segments": [_work_segment(1000.0, 300.0), _recovery_segment()]},
    }
    week = compute_weekly_progress([event], [], start, start + timedelta(days=6))[0]
    assert week["planned_distance_m"] == 1000.0


def test_plan_quality_compares_execution_and_plan_segment_work() -> None:
    start = date(2026, 2, 2)
    event = {
        "start_time": start,
        "predicted_tss": 100.0,
        "training_type": "intervals",
        "predicted_distance_m": 10000.0,
        "workout_prescription": {"segments": [_work_segment(1000.0, 300.0), _recovery_segment()]},
    }
    classification = {
        "local_day": start,
        "execution": {"segments": [_work_segment(900.0, 270.0), _recovery_segment()]},
        "quality": {
            "work_domain_residence_s": {
                "below_mt1": 270.0,
                "mt1_mt2": 0.0,
                "mt2_wmax": 0.0,
                "above_wmax": 0.0,
                "low_unspecified": 0.0,
            }
        },
    }
    faithful = compute_plan_quality([event], [], start, start, [classification])
    missing = compute_plan_quality([event], [], start, start)
    assert faithful["score"] > missing["score"]

from datetime import date

from domain.insights.session_load import (
    aggregate_session_load,
    session_load_facts,
    weekly_session_load,
)
from domain.insights.weekly_progress import compute_weekly_progress


def _classification(activity_id: str, local_day: date) -> dict[str, object]:
    return {
        "activity_id": activity_id,
        "local_day": local_day,
        "execution": {
            "segments": [
                {
                    "role": "warmup",
                    "distance_m": 1000.0,
                    "duration_s": 400.0,
                    "measured": {"distance_m": 1000.0, "duration_s": 400.0},
                },
                {
                    "role": "work",
                    "distance_m": 2000.0,
                    "duration_s": 600.0,
                    "measured": {"distance_m": 2000.0, "duration_s": 600.0},
                },
                {
                    "role": "recovery",
                    "distance_m": 400.0,
                    "duration_s": 180.0,
                    "measured": {"distance_m": 400.0, "duration_s": 180.0},
                },
                {
                    "role": "work",
                    "distance_m": 3000.0,
                    "duration_s": 900.0,
                    "measured": {"distance_m": 3000.0, "duration_s": 900.0},
                },
            ]
        },
        "quality": {
            "repetition_match": 1.0,
            "structure_match": 0.8,
            "work_distance_match": 0.9,
            "work_domain_residence_s": {
                "below_mt1": 1200.0,
                "mt1_mt2": 300.0,
                "mt2_wmax": 0.0,
                "above_wmax": 0.0,
                "low_unspecified": 0.0,
            },
        },
    }


def test_session_load_facts_count_only_work_segments() -> None:
    facts = session_load_facts(_classification("a1", date(2026, 2, 2)))
    assert facts["work_bouts"] == 2
    assert facts["work_distance_m"] == 5000.0
    assert facts["work_duration_s"] == 1500.0
    assert facts["domain_seconds"]["below_mt1"] == 1200.0
    assert facts["quality_matches"] == {
        "type_match": 1.0,
        "structure_match": 0.8,
        "domain_match": 0.9,
    }


def test_weekly_progress_uses_shared_segment_load() -> None:
    rows = [
        _classification("a1", date(2026, 2, 2)),
        _classification("a2", date(2026, 2, 4)),
    ]
    total = aggregate_session_load(rows)
    assert total["work_bouts"] == 4
    assert total["work_distance_m"] == 10000.0
    assert total["domain_seconds"]["below_mt1"] == 2400.0
    assert "2026-W06" in weekly_session_load(rows)

    progress = compute_weekly_progress(
        [
            {
                "start_time": date(2026, 2, 2),
                "predicted_tss": 100.0,
                "predicted_distance_m": 10000.0,
            }
        ],
        [],
        date(2026, 2, 1),
        date(2026, 2, 28),
        rows,
    )
    week = next(row for row in progress if row["week"] == "2026-W06")
    assert week["work_bouts"] == 4
    assert week["work_distance_m"] == 10000.0
    assert week["work_duration_s"] == 3000.0
    assert week["completion_pct"] == 100
    assert week["quality_matches"]["domain_match"] == 0.9

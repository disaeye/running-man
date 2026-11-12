from typing import Any, cast

import pytest

from domain.run_classification.display import display_name
from domain.run_classification.quality import compare_quality
from domain.workout.plan_evidence import format_plan_expression, session_science
from domain.workout.plan_generator import WeekPlanOptions, generate_weekly_plan
from domain.workout.plan_segments import enrich_plan_segments
from domain.workout.prescription import workout_segments
from presentation.api.schemas_run import SessionClassificationResponse
from tests.domain.run_classification_fixtures import (
    TRAINING_PACES,
    classified,
    evidence,
    interval_evidence,
    raw_data,
)


def test_display_name_uses_structure_and_stimulus_only() -> None:
    name = display_name(
        session_type="repetition",
        structure="interval",
        stimulus="speed_economy",
        modifiers=["long", "hill"],
    )
    assert name == "间歇跑 · 跑步经济 · 长距离 · 坡跑"
    for banned in ("重复跑", "短间歇", "高强度跑", "混合强度跑", "稳态跑"):
        assert banned not in name


def test_interval_uses_work_distance_only_and_exact_rounds() -> None:
    result = classified(interval_evidence())
    summary = result["session_classification"]
    execution = result["execution"]
    quality = result["quality"]
    groups = execution["work_groups"]
    assert summary["structure"] == "interval"
    assert execution["work_distance_m"] == 6000.0
    assert execution["recovery_distance_m"] == 1000.0
    assert execution["activity_distance_m"] == 7000.0
    assert quality["distance_consistency"] == 1.0
    assert len(groups) == 1
    assert groups[0]["repetitions"] == 6
    assert groups[0]["distance_range_m"] == [1000.0, 1000.0]
    assert "6 轮" in summary["display_line"]
    assert "1.00 km" in summary["display_line"]
    assert "恢复" in summary["display_line"]
    assert result["evidence"]["interval_summary"] == ["4x 4m 165bpm"]
    SessionClassificationResponse.model_validate(result)


def test_continuous_run_never_gets_hill_modifier_from_flat_noise() -> None:
    item = evidence(
        raw_data=raw_data(
            total_elevation_gain=0.5,
            icu_hr_zone_times=[900, 300, 300, 200, 100],
            pace_zone_times=[900, 300, 300, 200, 100],
            gap_zone_times=[900, 300, 300, 200, 100],
        )
    )
    summary = classified(item)["session_classification"]
    assert summary["structure"] == "continuous"
    assert "hill" not in summary["modifiers"]
    assert "坡跑" not in summary["display_name"]


def test_interval_unspecified_leaves_rounds_empty() -> None:
    item = evidence(
        exact_intervals=[
            {
                "start_index": 0,
                "moving_time": 300,
                "distance": 1500.0,
                "average_speed": 5.0,
                "type": "WORK",
                "group_id": "g1",
            },
            {
                "start_index": 400,
                "moving_time": 300,
                "distance": 1500.0,
                "average_speed": 5.0,
                "type": "WORK",
                "group_id": "g1",
            },
        ],
    )
    result = classified(item)
    summary = result["session_classification"]
    execution = result["execution"]
    assert summary["structure"] == "unclear"
    assert summary["session_type"] == "interval_unspecified"
    assert summary["primary_stimulus"] == "unclear"
    assert summary["evidence_grade"] == "C"
    assert execution["work_groups"][0]["repetitions"] is None
    assert "轮数待确认" in summary["display_line"]


def test_quality_compares_plan_and_execution_segments() -> None:
    plan: dict[str, object] = {
        "segments": [
            {
                "role": "work",
                "repetitions": 2,
                "target": {
                    "distance_m": 1000.0,
                    "duration_s": 300.0,
                    "pace_s_km": 300.0,
                    "hr_bpm": 165.0,
                },
            }
        ]
    }
    execution: dict[str, object] = {
        "segments": [
            {
                "role": "work",
                "distance_m": 1000.0,
                "duration_s": 300.0,
                "pace_s_km": 300.0,
                "avg_hr": 165.0,
            },
            {
                "role": "work",
                "distance_m": 900.0,
                "duration_s": 280.0,
                "pace_s_km": 311.0,
                "avg_hr": 158.0,
            },
        ]
    }
    quality = compare_quality({}, plan, execution)
    pace_attainment = cast(float, quality["pace_attainment"])
    assert quality["repetition_match"] == 1.0
    assert quality["work_distance_match"] == 0.95
    assert quality["work_duration_match"] is not None
    assert 0.9 < pace_attainment < 1.0


def test_plan_science_has_required_fields_and_iaaf_expression() -> None:
    science = session_science("intervals", 50, TRAINING_PACES, pace_effective_from="2026-09-07")
    anchor = science.intensity_anchor
    work_distance = cast(float, science.quality_target["work_distance_m"])
    assert science.source_refs
    assert science.rationale and science.target_adaptation
    assert anchor["effective_from"] == "2026-09-07"
    assert work_distance > 0
    segments = enrich_plan_segments(workout_segments("intervals", 50, 245, 260), science, 245, 260)
    expression = format_plan_expression(science, segments)
    assert "间歇跑" in expression
    assert "轮" in expression
    assert "km" in expression
    assert "恢复" in expression
    work = [item for item in segments if item.get("role") == "work"]
    assert work
    assert cast(float, work[0]["distance_m"]) > 0
    target = cast(dict[str, Any], work[0]["target"])
    assert cast(float, target["pace_s_km"]) > 0
    for segment in segments:
        if segment.get("role") in {"warmup", "cooldown"}:
            assert segment["intensity_domain"] == "below_mt1"
            assert cast(dict[str, Any], segment["target"])["pace_key"] == "easy"
            assert segment.get("pace_min_s_km") is None


def test_generated_week_plan_carries_science_and_distance() -> None:
    plan = generate_weekly_plan(
        42000.0,
        WeekPlanOptions(training_paces=TRAINING_PACES, pace_effective_from="2026-09-07"),
    )
    trained = [day for day in plan if day.workout_type != "rest"]
    assert trained
    for day in trained:
        assert day.science is not None
        assert day.science.source_refs
        assert day.science.rationale
        assert day.science.target_adaptation
        assert day.science.quality_target
        assert day.display_line
        assert day.target_distance_m and day.target_distance_m > 0
        for segment in day.workout_segments:
            role = segment["role"]
            assert role in {"warmup", "work", "recovery", "cooldown"}
            assert cast(float, segment["duration_s"]) > 0
            distance_m = cast(float, segment["distance_m"])
            assert distance_m >= 0
            if role == "work":
                assert distance_m > 0
            assert segment["source_refs"]
            assert segment["rationale"]


def test_account_classification_results_are_valid_and_unique() -> None:
    import json
    from pathlib import Path

    path = (
        Path(__file__).resolve().parents[4]
        / ".analysis"
        / "run-types"
        / "classification_v6_report.json"
    )
    if not path.exists():
        pytest.skip("account classification report is a local analysis artifact")
    report = json.loads(path.read_text())
    assert report["activity_count"] == 110
    assert report["classified_count"] == 110
    assert report["errors"] == []
    assert report["validation_errors"] == []
    assert report["max_rss_kb"] < 1_000_000


def test_builtin_template_migration_has_vdot_distance_and_evidence() -> None:
    import importlib.util
    from pathlib import Path

    path = (
        Path(__file__).resolve().parents[2]
        / "alembic"
        / "versions"
        / "o1p2q3r4s5t6_reseed_builtin_templates.py"
    )
    spec = importlib.util.spec_from_file_location("reseed_builtin_templates", path)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    segments = cast(Any, module)._segments("vo2max")
    work = [item for item in segments if item["role"] == "work"]
    assert work
    assert cast(float, work[0]["distance_m"]) > 0
    assert work[0]["pace_key"] == "interval"
    assert work[0]["anchor"].startswith("Daniels-VDOT")
    assert work[0]["source_refs"]
    target = cast(dict[str, Any], work[0]["target"])
    assert cast(float, target["distance_m"]) > 0

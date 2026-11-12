from pathlib import Path

import pytest

from domain.workout.plan_evidence import format_plan_expression, session_science
from domain.workout.plan_generator import WeekPlanOptions, generate_weekly_plan
from tests.domain.run_classification_fixtures import TRAINING_PACES

REPO_ROOT = Path(__file__).resolve().parents[4]
EXAMPLES = REPO_ROOT / "docs" / "run-session-examples.md"
EXPECTED_PLAN = (
    "间歇跑 · VO₂max：1 组 × 6 轮 × 1.00 km（4:05–4:20/km）"
    "[2 min 00 s 恢复]；热身 7 min / 1.20 km；放松 7 min / 1.00 km；"
    "工作里程 6.00 km；靶域 mt2_wmax 累计 18.0 min；"
    "依据 ACSM/ESSA 2025、World Athletics 2022、Daniels VDOT；"
    "训练目标 提高最大摄氧量以及摄氧动力学；质量目标 6 轮 / 6.00 km"
)


def test_confirmed_source_ledger_is_machine_checked() -> None:
    import json
    import subprocess

    script = REPO_ROOT / "scripts" / "verify_confirmed_source.py"
    completed = subprocess.run(
        ["python3", str(script)],
        cwd=REPO_ROOT,
        capture_output=True,
        text=True,
        check=True,
    )
    report = json.loads(completed.stdout)
    assert report["status"] == "ok"
    assert report["design_message"] == "a5c99ce1"
    assert report["confirmation_message"] == "daa4e78e"
    assert report["source_examples"] == 5
    assert (REPO_ROOT / "docs" / "confirmed-source-design.txt").is_file()
    assert (REPO_ROOT / "docs" / "confirmed-source-confirmation.txt").read_text(
        encoding="utf-8"
    ) == "按这个方案生成goal，然后落地代码"


def test_examples_document_pins_the_exact_plan_expression() -> None:
    text = EXAMPLES.read_text(encoding="utf-8")
    assert f"```\n{EXPECTED_PLAN}\n```" in text


def test_generated_plan_expression_matches_the_document() -> None:
    science = session_science("intervals", 50, TRAINING_PACES, pace_effective_from="2026-09-07")
    work = [
        {
            "role": "work",
            "start_s": index * 300.0,
            "end_s": index * 300.0 + 180.0,
            "duration_s": 180.0,
            "distance_m": 1000.0,
            "pace_min_s_km": 245,
            "pace_max_s_km": 260,
            "recovery_duration_s": 120.0,
            "target": {},
        }
        for index in range(6)
    ]
    segments = [
        {
            "role": "warmup",
            "start_s": 0.0,
            "end_s": 420.0,
            "duration_s": 420.0,
            "distance_m": 1200.0,
            "target": {},
        },
        *work,
        {
            "role": "cooldown",
            "start_s": 1800.0,
            "end_s": 2220.0,
            "duration_s": 420.0,
            "distance_m": 1000.0,
            "target": {},
        },
    ]
    assert format_plan_expression(science, segments) == EXPECTED_PLAN


def test_examples_document_pins_real_account_expressions() -> None:
    text = EXAMPLES.read_text(encoding="utf-8")
    assert "渐加速跑 · 配速控制：连续 6.07 km" in text
    assert "低强度域占比 100%" in text
    assert "复杂课 · 有氧基础 + 速度动作：连续 6.00 km（4:47/km）" in text
    assert "间歇跑 · 乳酸阈值 · 后段加速：1 组 × 8 轮 × 0.93–1.00 km" in text
    assert "间歇跑 · 跑步经济：1 组 × 1 轮 × 0.40 km（实测配速 3:44/km）" in text


def test_account_generated_examples_match_persisted_results() -> None:
    import json

    path = REPO_ROOT / ".analysis" / "run-types" / "classification_v6.json"
    if not path.exists():
        pytest.skip("account classification results are a local analysis artifact")
    results = json.loads(path.read_text(encoding="utf-8"))["results"]
    by_id = {str(item["session_classification"]["activity_id"]): item for item in results}
    text = EXAMPLES.read_text(encoding="utf-8")
    for aid in ("i184245195", "i204032054", "i205063889", "i155952328"):
        line = str(by_id[aid]["session_classification"]["display_line"])
        assert f"`{aid}`" in text
        assert f"```\n{line}\n```" in text


def test_weekly_plan_generation_also_produces_iaaf_form() -> None:
    day = next(
        item
        for item in generate_weekly_plan(
            42000.0,
            WeekPlanOptions(training_paces=TRAINING_PACES, pace_effective_from="2026-09-07"),
        )
        if item.workout_type == "intervals"
    )
    assert day.display_line is not None
    for fragment in ("组", "轮", "km", "恢复"):
        assert fragment in day.display_line

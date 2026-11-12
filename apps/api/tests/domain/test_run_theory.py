from domain.run_classification.classifier import _talk_test
from domain.run_classification.theory import (
    EFFORT_DESCRIPTORS,
    FITT_VP,
    HAUGEN_PROTOCOLS,
    IAAF_NOTATION,
    PHYSIOLOGICAL_DOMAINS,
    WORLD_ATHLETICS_EXAMPLES,
    theory_payload,
)
from tests.domain.run_classification_fixtures import classified, evidence


def test_fitt_vp_and_five_effort_descriptors_are_complete() -> None:
    assert FITT_VP == ("Frequency", "Intensity", "Time", "Type", "Volume", "Progression")
    assert len(EFFORT_DESCRIPTORS) == 5
    assert [row["term"] for row in EFFORT_DESCRIPTORS] == [
        "very low",
        "low",
        "moderate",
        "high",
        "very high",
    ]
    assert [row["domain"] for row in EFFORT_DESCRIPTORS] == [
        "low_unspecified",
        *PHYSIOLOGICAL_DOMAINS,
    ]


def test_haugen_protocols_and_world_athletics_examples_are_pinned() -> None:
    assert [row["key"] for row in HAUGEN_PROTOCOLS] == [
        "threshold_intervals",
        "vo2max_intervals",
        "short_sprint_intervals",
    ]
    assert "3-4 × 500 m（1500 m 目标配速）[2-3 min 恢复]" in WORLD_ATHLETICS_EXAMPLES
    assert IAAF_NOTATION["pattern"] == "sets × reps × distance (pace) [recovery]"


def test_every_classification_carries_theory_and_talk_test() -> None:
    item = evidence(rpe=7)
    result = classified(item)
    payload = result["evidence"]["theory"]
    assert isinstance(payload, dict)
    assert payload["fitt_vp"] == list(FITT_VP)
    assert len(payload["effort_descriptors"]) == 5
    assert "40 倍" in str(payload["fixed_percent_caveat"])
    assert "RPE" in str(payload["rpe_caveat"])
    assert payload["iaaf_notation"] == IAAF_NOTATION
    assert result["evidence"]["subjective"]["rpe"] == 7
    assert result["evidence"]["subjective"]["talk_test"] == "hard"
    assert result["quality"]["rpe_match"] == 7


def test_talk_test_descriptors_follow_rpe_bands() -> None:
    assert [_talk_test(value) for value in (1, 3, 5, 7, 9)] == [
        "very easy",
        "easy",
        "somewhat hard",
        "hard",
        "very hard",
    ]
    assert _talk_test(None) is None


def test_race_marker_and_subjective_evidence_have_write_paths() -> None:
    item = evidence(rpe=8, is_race=True, race_marker_present=True)
    result = classified(item)
    assert result["session_classification"]["primary_stimulus"] == "aerobic_base"
    assert result["session_classification"]["modifiers"] == ["race"]
    assert result["evidence"]["race_marker_present"] is True
    assert result["evidence"]["subjective"] == {
        "rpe": 8,
        "rpe_scale": "CR10",
        "talk_test": "very hard",
    }
    assert result["quality"]["rpe_match"] == 8


def test_theory_payload_is_json_serializable() -> None:
    import json

    payload = theory_payload()
    encoded = json.dumps(payload, ensure_ascii=False)
    notation = payload["iaaf_notation"]
    protocols = payload["haugen_protocols"]
    assert isinstance(notation, dict) and isinstance(protocols, list)
    assert notation["pattern"] in encoded
    assert "500 m" in encoded
    assert len(protocols) == 3


def test_original_source_examples_are_preserved() -> None:
    import json
    from pathlib import Path

    root = Path(__file__).resolve().parents[4]
    ledger = json.loads(
        (root / "docs" / "confirmed-source-ledger.json").read_text(encoding="utf-8")
    )
    assert ledger["version"] == 2
    assert ledger["design"]["message_id"] == "a5c99ce1"
    assert ledger["confirmation"]["message_id"] == "daa4e78e"
    assert ledger["confirmation"]["parent_id"] == ledger["design"]["message_id"]
    assert len(ledger["source_examples"]) == 5
    doc = root / "docs" / "run-session-examples.md"
    text = doc.read_text(encoding="utf-8")
    assert "会话设计记录 `#730`；YG 在 `#731`" in text
    assert "docs/confirmed-source-ledger.json" in text
    assert "scripts/verify_confirmed_source.py" in text
    assert (
        "间歇跑 · VO₂max：8 × 1000 m（4:35–4:45/km，Daniels I 配速）"
        "[2 min 慢跑恢复]；热身 15 min；放松 10 min；工作里程 8.00 km；"
        "靶域 severe 累计 20–25 min；依据 ACSM/ESSA 2025、"
        "World Athletics 2022、Daniels VDOT。"
    ) in text
    assert (
        "复杂课 · 有氧基础 + 速度动作：连续 6.00 km（4:47/km）；"
        "4 × 150–165 m（2:44–3:23/km）[2 min 恢复]；加速段 0.64 km；"
        "恢复段大约 0.58 km；整场 7.68 km；另有 11 s 短段，缺少距离数据。"
    ) in text
    assert (
        "重复跑 · 跑步经济：12 × 200 m（35–38 s）[3 min 全恢复]；"
        "工作里程 2.40 km；热身 2.00 km；放松 1.50 km；整场 5.90 km。"
    ) in text
    assert (
        "渐加速跑 · 有氧：连续 10.00 km；分段配速 "
        "6:10 → 5:45 → 5:20/km；低强度域占比 78%；后段进入中等强度域；"
        "刺激有氧耐力与配速控制。"
    ) in text

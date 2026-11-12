from pathlib import Path
from typing import Any, cast

from application.run_classification.service import classify_evidence
from tests.domain.run_classification_fixtures import evidence

REPO_ROOT = Path(__file__).resolve().parents[4]
EXAMPLES = REPO_ROOT / "docs" / "run-session-examples.md"
EXPECTED_LINE = (
    "间歇跑 · 跑步经济：1 组 × 8 轮 × 0.58 km（实测配速 2:33/km）"
    "[7 min 00 s / 1.05 km 恢复]；靶域 above_wmax 累计 12.0 min；"
    "依据 ACSM/ESSA 2025、World Athletics 2022、Daniels VDOT；"
    "训练目标 提高跑步经济以及动作协调；质量目标 12.0 min 靶域时间；"
    "工作里程 4.68 km；恢复里程 1.05 km；"
    "整场 5.88 km（一致性校验）；工作配速波动 0.000；"
    "恢复/工作时长 0.583；证据等级 B；置信度 0.77"
)


def _repetition_evidence():
    exact: list[dict[str, object]] = []
    speed_stream: list[tuple[float, float]] = []
    hr_stream: list[tuple[float, float]] = []
    cursor = 0.0
    for index in range(8):
        exact.append(
            {
                "start_time": cursor,
                "end_time": cursor + 90,
                "moving_time": 90,
                "distance": 585.0,
                "average_speed": 6.5,
                "average_heartrate": 180.0,
                "type": "WORK",
                "group_id": "sprint",
            }
        )
        for second in range(90):
            speed_stream.append((cursor + second, 6.5))
            hr_stream.append((cursor + second, 180.0))
        cursor += 90
        if index == 7:
            break
        exact.append(
            {
                "start_time": cursor,
                "end_time": cursor + 60,
                "moving_time": 60,
                "distance": 150.0,
                "average_speed": 2.5,
                "average_heartrate": 140.0,
                "type": "RECOVERY",
                "group_id": None,
            }
        )
        for second in range(60):
            speed_stream.append((cursor + second, 2.5))
            hr_stream.append((cursor + second, 140.0))
        cursor += 60
    return evidence(
        activity_id="i-repetition-example",
        duration_s=int(cursor) + 60,
        distance_m=5880.0,
        exact_intervals=exact,
        streams={"speed": speed_stream, "heart_rate": hr_stream},
    )


def test_repetition_example_matches_classifier_and_document() -> None:
    result = classify_evidence(_repetition_evidence())
    summary = cast(dict[str, Any], result["session_classification"])
    assert summary["structure"] == "interval"
    assert summary["session_type"] == "repetition"
    assert summary["primary_stimulus"] == "speed_economy"
    assert summary["display_name"] == "间歇跑 · 跑步经济"
    assert summary["display_line"] == EXPECTED_LINE
    assert f"```\n{EXPECTED_LINE}\n```" in EXAMPLES.read_text(encoding="utf-8")

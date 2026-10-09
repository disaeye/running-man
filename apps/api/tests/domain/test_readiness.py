from datetime import date, timedelta

from domain.insights.readiness import compute_readiness, compute_recommendation
from domain.insights.recommendation import _reason


def test_readiness_returns_score_and_factors() -> None:
    target = date(2026, 6, 17)
    wellness = [_wellness(target - timedelta(days=day), 28_000, 50) for day in range(0, 8)]
    loads = [_load(target - timedelta(days=day), 40, 30, 10) for day in range(0, 9)]

    result = compute_readiness(target, wellness, loads)

    assert 0 <= result["score"] <= 100
    assert result["level"] == "high"
    assert 1 <= len(result["factors"]) <= 5
    assert result["max_intensity"] == "high"


def test_readiness_handles_missing_data() -> None:
    result = compute_readiness(date(2026, 6, 17), [], [])

    assert result["score"] == 50
    assert any("数据不足" in factor["detail"] for factor in result["factors"])


def test_source_score_does_not_change_local() -> None:
    target = date(2026, 6, 17)
    loads = [_load(target - timedelta(days=day), 40, 30, 10) for day in range(0, 9)]
    without_source = [_wellness(target - timedelta(days=day), 28_000, 50) for day in range(0, 8)]
    with_extreme_source = [row | {"readiness": 0} for row in without_source]

    local_without_source = compute_readiness(target, without_source, loads)
    local_with_extreme_source = compute_readiness(target, with_extreme_source, loads)

    assert local_with_extreme_source == local_without_source


def test_recommendation_uses_planned_workout() -> None:
    readiness = {
        "score": 82,
        "level": "high",
        "factors": [],
        "recommendation": "ok",
        "max_intensity": "high",
    }
    events = [{"name": "Tempo", "sport_type": "Run", "predicted_tss": 70.0}]

    result = compute_recommendation(readiness, events, 120.0, 300.0, 3)

    assert result["action"] == "follow_plan"
    assert result["workout_type"] == "Run"
    assert result["target_tss"] == 70
    assert result["next_workout"] == {"name": "Tempo", "sport_type": "Run", "predicted_tss": 70.0}


def _wellness(day: date, sleep_secs: int, resting_hr: int) -> dict[str, object]:
    return {"day": day, "sleep_secs": sleep_secs, "resting_hr": resting_hr}


def _load(day: date, ctl: float, atl: float, tsb: float) -> dict[str, object]:
    return {"day": day, "ctl": ctl, "atl": atl, "tsb": tsb, "tss": 50.0}


class TestRecommendationReason:
    """The reason string is shown to the athlete, so it must read as language.

    It used to be built by interpolating internal field names:
    ``f"readiness {score}，{plan_text}，{progress}"`` produced
    "readiness 57，无计划训练，周TSS 176" — field names and bare numbers where an
    explanation belongs. The band already carries a human label, so the reason
    names the state instead of restating the inputs.
    """

    def test_does_not_leak_field_names(self) -> None:
        reason = _reason(66, None, 176.0, 300.0)

        assert "readiness" not in reason
        assert "TSS" not in reason or "本周已完成" in reason
        assert not reason.startswith("readiness")

    def test_names_the_state_rather_than_the_score(self) -> None:
        reason = _reason(85, None, 0.0, 0.0)

        # The band label for a high score, not the number.
        assert "状态良好" in reason
        assert "85" not in reason

    def test_follows_the_plan_when_one_is_scheduled(self) -> None:
        reason = _reason(85, {"name": "节奏跑 5×1km"}, 100.0, 200.0)

        assert "节奏跑 5×1km" in reason
        assert "按计划执行" in reason

    def test_suggests_reducing_a_plan_when_recovery_is_needed(self) -> None:
        reason = _reason(45, {"name": "间歇 8×400m"}, 100.0, 200.0)

        assert "间歇 8×400m" in reason
        assert "减量" in reason or "轻松" in reason

    def test_distinguishes_no_plan_from_no_training(self) -> None:
        # An athlete with 176 TSS this week but nothing scheduled must not be
        # told "本周还没有安排", which reads as "you have not trained".
        trained = _reason(50, None, 176.0, 0.0)
        untrained = _reason(50, None, 0.0, 0.0)

        assert "已完成" in trained
        assert "还没有训练" in untrained
        assert trained != untrained

    def test_reports_progress_against_a_weekly_target(self) -> None:
        reason = _reason(66, None, 176.0, 300.0)

        assert "176" in reason
        assert "300" in reason

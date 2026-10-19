from datetime import date, timedelta

from domain.insights.readiness import compute_readiness
from domain.insights.recommendation import TrainingContext, _reason, compute_recommendation


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


_PACES = {
    "easy": {"min": 353, "max": 393},
    "threshold": {"min": 270, "max": 283},
    "interval": {"min": 247, "max": 254},
}


def _readiness(score: int, intensity: str) -> dict[str, object]:
    return {
        "score": score,
        "level": "high",
        "factors": [],
        "recommendation": "ok",
        "max_intensity": intensity,
    }


def test_recommendation_carries_a_pace_band_for_the_session_it_chose() -> None:
    result = compute_recommendation(
        _readiness(82, "high"), [], 0.0, 0.0, 1, TrainingContext(training_paces=_PACES)
    )

    assert result["intensity"] == "high"
    assert result["pace_targets"] == {
        "intensity": "interval",
        "min_s_per_km": 247,
        "max_s_per_km": 254,
    }


def test_planned_workout_type_decides_the_pace_band() -> None:
    events = [{"name": "Tempo", "sport_type": "Run", "predicted_tss": 70.0, "training_type": "threshold"}]

    result = compute_recommendation(
        _readiness(82, "high"), events, 0.0, 100.0, 1, TrainingContext(training_paces=_PACES)
    )

    assert result["pace_targets"]["intensity"] == "threshold"


def test_rest_day_has_no_pace_band() -> None:
    rest = {"score": 20, "level": "rest", "factors": [], "recommendation": "rest", "max_intensity": "none"}

    result = compute_recommendation(rest, [], 0.0, 0.0, 1, TrainingContext(training_paces=_PACES))

    assert result["action"] == "rest"
    assert result["pace_targets"] is None


def test_without_threshold_paces_the_prescription_has_no_band() -> None:
    result = compute_recommendation(_readiness(82, "high"), [], 0.0, 0.0, 1)

    assert result["pace_targets"] is None


def test_acwr_spike_and_missing_plan_are_named_as_risks() -> None:
    result = compute_recommendation(
        _readiness(82, "high"),
        [],
        0.0,
        0.0,
        1,
        TrainingContext(acwr=1.8, has_plan_tomorrow=False),
    )

    assert "acwr_high" in result["risks"]
    assert "no_plan_tomorrow" in result["risks"]


def test_risks_are_absent_when_nothing_is_wrong() -> None:
    result = compute_recommendation(
        _readiness(82, "high"),
        [],
        0.0,
        0.0,
        1,
        TrainingContext(acwr=1.1, has_plan_tomorrow=True),
    )

    assert result["risks"] == []


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


def test_a_missing_factor_does_not_pull_the_score_towards_fifty() -> None:
    """Only load data is available; the score must keep the load signal's range."""
    target = date(2026, 10, 17)
    prev = target - timedelta(days=1)
    far = prev - timedelta(days=7)

    def score_for(tsb: float) -> int:
        loads = [
            {"day": far, "tsb": tsb, "atl": 40.0},
            {"day": prev, "tsb": tsb, "atl": 40.0},
        ]
        return compute_readiness(target, [], loads)["score"]

    # Weighting missing sleep/RHR/HRV at a synthetic 50 used to compress every
    # outcome into 41-65, so the "rest" band was unreachable.
    assert score_for(-30) < 40
    assert score_for(20) > 90
    assert score_for(20) - score_for(-30) > 50


def test_readiness_uses_the_day_before_not_the_session_just_run() -> None:
    target = date(2026, 10, 17)
    prev = target - timedelta(days=1)
    # Yesterday closed at TSB +10; today's completed session dropped it to -3.
    loads = [
        {"day": prev, "tsb": 10.0, "atl": 30.0},
        {"day": target, "tsb": -3.0, "atl": 52.0},
    ]

    result = compute_readiness(target, [], loads)

    tsb_detail = next(f["detail"] for f in result["factors"] if f["name"] == "tsb")
    assert "+10.0" in tsb_detail


def test_missing_inputs_are_reported_as_unmeasured() -> None:
    result = compute_readiness(date(2026, 10, 17), [], [])

    assert result["data_sufficient"] is False

from application.recommendations.engine import build_recommendations


def _types(recommendations: list[dict[str, object]]) -> list[object]:
    return [rec["type"] for rec in recommendations]


def test_high_tsb_suggests_harder_workout() -> None:
    recommendations = build_recommendations(
        tsb=21.0,
        acwr=1.0,
        readiness=80,
        has_planned_workout_tomorrow=True,
    )

    assert _types(recommendations) == ["rule_high_tsb"]
    assert recommendations[0] == {
        "type": "rule_high_tsb",
        "title": "状态新鲜，可安排关键训练",
        "body": "当前 TSB +21.0，高于 +20，身体负荷较轻。",
        "priority": "medium",
        "actionable": True,
        "action_hint": "安排一次节奏跑、间歇或较高质量训练",
    }


def test_low_tsb_suggests_rest() -> None:
    recommendations = build_recommendations(
        tsb=-21.0,
        acwr=1.0,
        readiness=80,
        has_planned_workout_tomorrow=True,
    )

    assert recommendations[0]["type"] == "rule_low_tsb"
    assert recommendations[0]["priority"] == "high"
    assert recommendations[0]["action_hint"] == "今天休息或只做轻松恢复跑"


def test_high_acwr_warns_injury_risk() -> None:
    recommendations = build_recommendations(
        tsb=0.0,
        acwr=1.51,
        readiness=80,
        has_planned_workout_tomorrow=True,
    )

    assert recommendations[0]["type"] == "rule_high_acwr"
    assert recommendations[0]["actionable"] is False
    assert "伤病风险" in str(recommendations[0]["title"])


def test_no_planned_workout_tomorrow_suggests_planning() -> None:
    recommendations = build_recommendations(
        tsb=0.0,
        acwr=1.0,
        readiness=80,
        has_planned_workout_tomorrow=False,
    )

    assert _types(recommendations) == ["rule_plan_ahead"]
    assert recommendations[0]["priority"] == "low"


def test_low_readiness_suggests_easy_recovery() -> None:
    recommendations = build_recommendations(
        tsb=0.0,
        acwr=1.0,
        readiness=29,
        has_planned_workout_tomorrow=True,
    )

    assert recommendations[0]["type"] == "rule_recovery"
    assert recommendations[0]["action_hint"] == "选择休息、散步或低强度恢复训练"


def test_thresholds_are_exclusive_and_missing_values_are_ignored() -> None:
    recommendations = build_recommendations(
        tsb=20.0,
        acwr=1.5,
        readiness=30,
        has_planned_workout_tomorrow=True,
    )

    assert recommendations == []
    assert (
        build_recommendations(
            tsb=None,
            acwr=None,
            readiness=None,
            has_planned_workout_tomorrow=True,
        )
        == []
    )


def test_recommendations_are_sorted_by_priority_and_capped_at_five() -> None:
    recommendations = build_recommendations(
        tsb=-25.0,
        acwr=1.7,
        readiness=10,
        has_planned_workout_tomorrow=False,
    )

    assert _types(recommendations) == [
        "rule_recovery",
        "rule_high_acwr",
        "rule_low_tsb",
        "rule_plan_ahead",
    ]
    assert len(recommendations) <= 5

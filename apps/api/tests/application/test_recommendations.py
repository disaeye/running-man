"""Pace prescriptions and load advisories.

The session decision — rest, recover, or train, and at what intensity — belongs
to `domain.insights.recommendation.compute_recommendation`, which is what the
Today page reads. This module answers a different question: given the ability
vector, what paces should today's session target, and are there load problems
worth naming.
"""

from application.recommendations.engine import build_recommendations


def _types(recommendations: list[dict[str, object]]) -> list[object]:
    return [rec["type"] for rec in recommendations]


def test_high_acwr_warns_about_load_growth() -> None:
    recommendations = build_recommendations(
        tsb=0.0,
        acwr=1.51,
        readiness=80,
        has_planned_workout_tomorrow=True,
    )

    assert recommendations[0]["type"] == "rule_high_acwr"
    assert recommendations[0]["actionable"] is False
    assert "ACWR" in str(recommendations[0]["body"])


def test_no_planned_workout_tomorrow_suggests_planning() -> None:
    recommendations = build_recommendations(
        tsb=0.0,
        acwr=1.0,
        readiness=80,
        has_planned_workout_tomorrow=False,
    )

    assert _types(recommendations) == ["rule_plan_ahead"]
    assert recommendations[0]["priority"] == "low"


def test_readiness_alone_does_not_produce_a_session_decision() -> None:
    """A low readiness score is not this engine's call to make."""
    recommendations = build_recommendations(
        tsb=-30.0,
        acwr=1.0,
        readiness=10,
        has_planned_workout_tomorrow=True,
    )

    assert recommendations == []


def test_thresholds_are_exclusive_and_missing_values_are_ignored() -> None:
    assert (
        build_recommendations(
            tsb=20.0,
            acwr=1.5,
            readiness=30,
            has_planned_workout_tomorrow=True,
        )
        == []
    )
    assert (
        build_recommendations(
            tsb=None,
            acwr=None,
            readiness=None,
            has_planned_workout_tomorrow=True,
        )
        == []
    )


def test_missing_inputs_never_reach_the_copy() -> None:
    paces = {
        "threshold": {"min": 250.0, "max": 265.0},
        "easy": {"min": 330.0, "max": 360.0},
    }
    recommendations = build_recommendations(
        tsb=None,
        acwr=None,
        readiness=75,
        has_planned_workout_tomorrow=True,
        training_paces=paces,
    )

    body = str(recommendations[0]["body"])
    assert "None" not in body
    assert "恢复评分 75" in body


def test_pace_prescription_uses_the_ability_vector() -> None:
    paces = {"threshold": {"min": 250.0, "max": 265.0}}
    recommendations = build_recommendations(
        tsb=0.0,
        acwr=1.0,
        readiness=80,
        has_planned_workout_tomorrow=True,
        training_paces=paces,
    )

    assert recommendations[0]["type"] == "rule_ability_threshold"
    assert "4:10" in str(recommendations[0]["body"])


def test_recommendations_are_sorted_by_priority() -> None:
    recommendations = build_recommendations(
        tsb=-25.0,
        acwr=1.7,
        readiness=10,
        has_planned_workout_tomorrow=False,
    )

    assert _types(recommendations) == ["rule_high_acwr", "rule_plan_ahead"]

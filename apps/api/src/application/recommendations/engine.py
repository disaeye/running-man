from __future__ import annotations

import math
from dataclasses import dataclass

HIGH_ACWR_THRESHOLD = 1.5
LOW_TSB_THRESHOLD = -20.0
MIN_READY_READINESS = 60
SUFFICIENT_ADHERENCE_PCT = 80
MAX_RECOMMENDATIONS = 5

Priority = str

_PRIORITY_RANK: dict[Priority, int] = {"high": 0, "medium": 1, "low": 2}


@dataclass(frozen=True)
class Recommendation:
    type: str
    title: str
    body: str
    priority: Priority
    actionable: bool
    action_hint: str | None

    def to_dict(self) -> dict[str, object]:
        return {
            "type": self.type,
            "title": self.title,
            "body": self.body,
            "priority": self.priority,
            "actionable": self.actionable,
            "action_hint": self.action_hint,
        }


def build_recommendations(
    *,
    tsb: float | None,
    acwr: float | None,
    readiness: int | None,
    has_planned_workout_tomorrow: bool,
    training_paces: dict[str, dict[str, float]] | None = None,
    weekly_adherence: float | None = None,
) -> list[dict[str, object]]:
    """Pace prescriptions and load advisories for a training day.

    This engine does not decide what kind of session the athlete should do.
    `domain.insights.recommendation.compute_recommendation` owns that decision —
    it is the one the Today page reads — and this module used to carry its own
    rest/recover rules that restated it with different thresholds. Two engines
    answering one question is how a product ends up explaining today two ways.

    What lives here is what nothing else provides: turning the ability vector
    into concrete target paces, plus load advisories that are not a session
    choice (ACWR growth, a missing plan for tomorrow).
    """
    recommendations = [
        rec
        for rec in [
            _rule_high_acwr(acwr),
            _rule_plan_ahead(has_planned_workout_tomorrow),
            _rule_ability_prescription(readiness, tsb, acwr, training_paces, weekly_adherence),
        ]
        if rec is not None
    ]
    recommendations.sort(key=lambda rec: _PRIORITY_RANK[rec.priority])
    return [rec.to_dict() for rec in recommendations[:MAX_RECOMMENDATIONS]]


def _rule_high_acwr(acwr: float | None) -> Recommendation | None:
    if acwr is None or acwr <= HIGH_ACWR_THRESHOLD:
        return None
    return Recommendation(
        type="rule_high_acwr",
        title="ACWR 偏高，注意伤病风险",
        body=f"当前 ACWR {acwr:.2f}，高于 {HIGH_ACWR_THRESHOLD:.1f}，近期负荷增长过快。",
        priority="high",
        actionable=False,
        action_hint="降低接下来几天的训练量并观察疲劳信号",
    )


def _rule_plan_ahead(has_planned_workout_tomorrow: bool) -> Recommendation | None:
    if has_planned_workout_tomorrow:
        return None
    return Recommendation(
        type="rule_plan_ahead",
        title="明天还没有训练安排",
        body="日历中未找到明天的计划训练，建议提前安排训练或恢复日。",
        priority="low",
        actionable=True,
        action_hint="打开训练日历，为明天添加计划",
    )


def _rule_ability_prescription(
    readiness: int | None,
    tsb: float | None,
    acwr: float | None,
    training_paces: dict[str, dict[str, float]] | None,
    weekly_adherence: float | None,
) -> Recommendation | None:
    """Prescribe a specific session with pace targets from the ability vector.

    Fires only when the athlete is ready (score ≥ 60), not in a high-risk load
    state (TSB > -20, ACWR < 1.5), and has VDOT-derived training paces. The
    session type adapts to the weekly adherence gap: under-training → quality
    (threshold/interval), over-training or no data → easy/endurance.
    """
    if not training_paces:
        return None
    if readiness is not None and readiness < MIN_READY_READINESS:
        return None
    if tsb is not None and tsb < LOW_TSB_THRESHOLD:
        return None
    if acwr is not None and acwr > HIGH_ACWR_THRESHOLD:
        return None

    # Choose session type from the adherence gap.
    under_training = (
        weekly_adherence is not None and weekly_adherence < SUFFICIENT_ADHERENCE_PCT
    )
    if under_training and "interval" in training_paces:
        pace = training_paces["interval"]
        return Recommendation(
            type="rule_ability_interval",
            title="本周负荷落后于计划，安排一组间歇",
            body=f"{_state_sentence(readiness, tsb)}。按间歇配速 "
            f"{_fmt_pace(pace['min'])}–{_fmt_pace(pace['max'])} 进行。",
            priority="medium",
            actionable=True,
            action_hint=f"热身后 6×800m @ {_fmt_pace(pace['min'])}/km，组间慢跑 400m",
        )
    if "threshold" in training_paces:
        pace = training_paces["threshold"]
        return Recommendation(
            type="rule_ability_threshold",
            title="今日适合阈值跑",
            body=f"{_state_sentence(readiness, tsb)}。按阈值配速 "
            f"{_fmt_pace(pace['min'])}–{_fmt_pace(pace['max'])} 完成 20–40 分钟连续跑。",
            priority="medium",
            actionable=True,
            action_hint=f"20 分钟连续跑 @ {_fmt_pace(pace['min'])}/km",
        )
    if "easy" in training_paces:
        pace = training_paces["easy"]
        return Recommendation(
            type="rule_ability_easy",
            title="今日适合轻松跑",
            body=(
                f"按轻松跑配速 {_fmt_pace(pace['min'])}–{_fmt_pace(pace['max'])} "
                "完成 30–60 分钟。"
            ),
            priority="low",
            actionable=True,
            action_hint=f"45 分钟轻松跑 @ {_fmt_pace(pace['max'])}/km",
        )
    return None


def _fmt_pace(s_per_km: float) -> str:
    """Format s/km as m:ss."""
    minutes = math.floor(s_per_km / 60)
    seconds = round(s_per_km % 60)
    return f"{minutes}:{seconds:02d}"


def _state_sentence(readiness: int | None, tsb: float | None) -> str:
    """The numbers that exist, in the athlete's language.

    Interpolating the raw variables put "readiness None，TSB None" into a
    sentence whenever an input was absent.
    """
    parts: list[str] = []
    if readiness is not None:
        parts.append(f"恢复评分 {readiness}")
    if tsb is not None:
        parts.append(f"TSB {tsb:+.1f}")
    return "，".join(parts) if parts else "当前状态适合训练"

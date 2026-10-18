"""Training recommendation derived from readiness and the week's plan.

Split from ``readiness.py``: that module answers "how recovered is the athlete",
this one answers "what should they do about it". The recommendations engine
imports only the readiness score, so the two are also consumed separately.
"""

from __future__ import annotations

from typing import cast

from domain.generated.readiness_bands import READINESS_BANDS
from domain.insights.readiness import Readiness, _num

Row = dict[str, object]
Recommendation = dict[str, object]


def compute_recommendation(
    readiness: Readiness,
    events: list[Row],
    week_completed_tss: float,
    week_planned_tss: float,
    recent_activity_days: int,
    chronic_ctl: float | None = None,
) -> Recommendation:
    score = cast(int, readiness["score"])
    planned = _next_event(events)
    risks = _risks(score, week_completed_tss, week_planned_tss, recent_activity_days)
    action, workout_type, intensity = _workout_choice(score, planned)
    target_tss = _target_tss(
        score, planned, week_completed_tss, week_planned_tss, chronic_ctl
    )
    return {
        "action": action,
        "workout_type": workout_type,
        "duration_min": _duration(score, target_tss),
        "target_tss": target_tss,
        "intensity": intensity,
        "reason": _reason(score, planned, week_completed_tss, week_planned_tss),
        "risks": risks,
        "next_workout": _event_summary(planned),
    }

def band_for_score(score: int) -> dict[str, object]:
    """Return the readiness band dict for the given score, highest-threshold first."""
    for band in sorted(READINESS_BANDS, key=lambda b: cast(int, b["min_score"]), reverse=True):
        if score >= cast(int, band["min_score"]):
            return band
    return READINESS_BANDS[0]

def _workout_choice(score: int, planned: Row | None) -> tuple[str, str, str]:
    band = band_for_score(score)
    if band["level"] == "rest":
        return "rest", "rest", "none"
    if planned:
        return (
            "follow_plan",
            str(planned.get("sport_type") or planned.get("category") or "workout"),
            _intensity(score),
        )
    if band["level"] == "high":
        return "train", "quality", "high"
    if band["level"] == "moderate":
        return "train", "endurance", "moderate"
    return "recover", "recovery", "low"

def _target_tss(
    score: int,
    planned: Row | None,
    completed: float,
    planned_week: float,
    chronic_ctl: float | None = None,
) -> int:
    """Load for today's session.

    The unconditional 80 / 55 / 30 targets were the same for every athlete: a
    beginner with a chronic load of 210 TSS a week was told to do 80 in a day,
    and an athlete at 700 a week got the same 80, under a fifth of a normal day.
    When the chronic load is known the target becomes a share of it.
    """
    planned_tss = _num(planned, "predicted_tss")
    level = str(band_for_score(score)["level"])
    if planned_tss is not None:
        return _clamp_tss(planned_tss if level in ("high", "moderate") else planned_tss * 0.6)
    remaining = max(planned_week - completed, 0)
    base = _daily_share(level, chronic_ctl)
    return _clamp_tss(min(base, remaining) if remaining > 0 else base)


# Share of a normal training day, relative to chronic load / 7.
_DAILY_SHARE: dict[str, float] = {
    "high": 1.6,
    "moderate": 1.0,
    "recovery": 0.5,
    "rest": 0.0,
}


def _daily_share(level: str, chronic_ctl: float | None) -> int:
    """A day's load at ``level``, as a multiple of the daily chronic load.

    CTL is itself a daily average, so CTL 60 means a normal day is about 60.
    """
    if chronic_ctl is not None and chronic_ctl > 0:
        return round(chronic_ctl * _DAILY_SHARE.get(level, 0.0))
    fallback = {"high": 80, "moderate": 55, "recovery": 30}
    return fallback.get(level, 0)

def _risks(score: int, completed: float, planned: float, recent_days: int) -> list[str]:
    risks: list[str] = []
    if band_for_score(score)["level"] == "rest":
        risks.append("readiness_low")
    if planned and completed / planned > 0.85:
        risks.append("weekly_tss_near_limit")
    if recent_days >= 6:
        risks.append("insufficient_rest_days")
    return risks

def _reason(score: int, planned: Row | None, completed: float, planned_week: float) -> str:
    """Why this session was chosen, in the athlete's language.

    This used to read ``f"readiness {score}，{plan_text}，{progress}"``, i.e. the
    internal field names and raw numbers dumped into a sentence: an athlete saw
    "readiness 57，无计划训练，周TSS 176" as the explanation for today's training.
    The band already carries a human label ("状态稳定"), so the reason names the
    state and the plan situation rather than restating the inputs.
    """
    band = band_for_score(score)
    state = str(band["label"])
    level = str(band["level"])

    if planned is not None:
        name = planned.get("name") or planned.get("sport_type") or "已安排的训练"
        if level in ("high", "moderate"):
            return f"今天{state}，按计划执行「{name}」。"
        return f"今天{state}，计划中的「{name}」建议减量或改为轻松进行。"

    if planned_week:
        return (
            f"今天{state}；本周已完成 {completed:.0f} / {planned_week:.0f} TSS，"
            "没有具体课表，按状态自行安排即可。"
        )
    if completed:
        # Distinguish "no plan" from "no training": an athlete who has run 176
        # TSS this week but scheduled nothing should not read "本周还没有安排"
        # as "you have not trained".
        return (
            f"今天{state}；本周已完成 {completed:.0f} TSS，但没有排定课表，"
            "按状态自行安排即可。"
        )
    return f"今天{state}；本周还没有训练，也没有排定课表。"

def _duration(score: int, target_tss: int) -> int:
    """Minutes that produce ``target_tss`` at this session's intensity.

    TSS = hours × IF² × 100, so minutes = TSS × 60 / (100 × IF²). Dividing the
    target by 1.2/1.0/0.7 treated one TSS as one minute, which is only true at
    IF ≈ 1: an easy session came out about twice as long as it should be, and
    that figure is displayed as today's training time on the home page.
    """
    if target_tss == 0:
        return 0
    level = band_for_score(score)["level"]
    intensity = _SESSION_IF.get(str(level), 0.7)
    minutes = target_tss * 60.0 / (100.0 * intensity * intensity)
    return max(15, min(180, round(minutes)))


# Typical intensity factor of a session at each readiness level.
_SESSION_IF: dict[str, float] = {
    "high": 0.90,
    "moderate": 0.78,
    "recovery": 0.65,
    "rest": 0.0,
}

def _next_event(events: list[Row]) -> Row | None:
    return events[0] if events else None

def _event_summary(event: Row | None) -> dict[str, object] | None:
    if event is None:
        return None
    return {
        "name": event.get("name"),
        "sport_type": event.get("sport_type"),
        "predicted_tss": event.get("predicted_tss"),
    }

def _intensity(score: int) -> str:
    return str(band_for_score(score)["max_intensity"])

def _clamp_tss(value: float) -> int:
    return max(0, min(180, round(value)))

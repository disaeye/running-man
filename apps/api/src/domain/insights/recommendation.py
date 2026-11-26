"""Training recommendation derived from readiness and the week's plan.

Split from ``readiness.py``: that module answers "how recovered is the athlete",
this one answers "what should they do about it". The recommendations engine
imports only the readiness score, so the two are also consumed separately.
"""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass
from typing import cast

from domain.generated.readiness_bands import READINESS_BANDS
from domain.insights.readiness import Readiness, _num

Row = dict[str, object]
Recommendation = dict[str, object]


@dataclass(frozen=True, slots=True)
class TrainingContext:
    """Optional inputs the caller may or may not have.

    Bundled rather than passed as four more parameters: a call site that has
    only readiness and the plan should not have to spell out three Nones.
    """

    chronic_ctl: float | None = None
    training_paces: dict[str, dict[str, float]] | None = None
    acwr: float | None = None
    has_plan_tomorrow: bool = True


def compute_recommendation(
    readiness: Readiness,
    events: list[Row],
    week_completed_tss: float,
    week_planned_tss: float,
    recent_activity_days: int,
    context: TrainingContext | None = None,
) -> Recommendation:
    """Today's session, its target load and, when the athlete has paces, its pace band.

    This is the only engine that answers "what should I do today". A second one
    (`application/recommendations`) produced a parallel set of advisories and a
    pace prescription from the same inputs; the two disagreed whenever a
    threshold moved. The pace prescription and the load advisories that were
    worth keeping live here now.
    """
    inputs = context or TrainingContext()
    score = cast(int, readiness["score"])
    planned = _next_event(events)
    risks = _risks(
        score,
        week_completed_tss,
        week_planned_tss,
        recent_activity_days,
        inputs.acwr,
        inputs.has_plan_tomorrow,
    )
    action, workout_type, intensity = _workout_choice(score, planned)
    target_tss = _target_tss(
        score, planned, week_completed_tss, week_planned_tss, inputs.chronic_ctl
    )
    return {
        "action": action,
        "workout_type": workout_type,
        "duration_min": _duration(score, target_tss, planned),
        "target_tss": target_tss,
        "intensity": intensity,
        "pace_targets": _pace_targets(action, intensity, planned, inputs.training_paces),
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
        wtype = planned.get("training_type") or planned.get("sport_type") or planned.get("category")
        return "follow_plan", str(wtype or "workout"), _intensity(score)
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

# An ACWR above this is a load spike: injury risk rises faster than fitness.
HIGH_ACWR_THRESHOLD: float = 1.5

# The pace band to quote, keyed by what decided the session.
_PACE_KEY_BY_INTENSITY: dict[str, str] = {
    "high": "interval",
    "moderate": "threshold",
    "low": "easy",
    "none": "easy",
}
_PACE_KEY_BY_TRAINING_TYPE: dict[str, str] = {
    "interval": "interval",
    "repetition": "repetition",
    "threshold": "threshold",
    "tempo": "threshold",
    "marathon": "marathon",
    "long": "easy",
    "easy": "easy",
    "recovery": "easy",
}


def _daily_share(level: str, chronic_ctl: float | None) -> int:
    """A day's load at ``level``, as a multiple of the daily chronic load.

    CTL is itself a daily average, so CTL 60 means a normal day is about 60.
    """
    if chronic_ctl is not None and chronic_ctl > 0:
        return round(chronic_ctl * _DAILY_SHARE.get(level, 0.0))
    fallback = {"high": 80, "moderate": 55, "recovery": 30}
    return fallback.get(level, 0)

def _risks(
    score: int,
    completed: float,
    planned: float,
    recent_days: int,
    acwr: float | None = None,
    has_plan_tomorrow: bool = True,
) -> list[str]:
    risks: list[str] = []
    if band_for_score(score)["level"] == "rest":
        risks.append("readiness_low")
    if planned and completed / planned > 0.85:
        risks.append("weekly_tss_near_limit")
    if recent_days >= 6:
        risks.append("insufficient_rest_days")
    if acwr is not None and acwr > HIGH_ACWR_THRESHOLD:
        risks.append("acwr_high")
    if not has_plan_tomorrow:
        risks.append("no_plan_tomorrow")
    return risks


def _pace_targets(
    action: str,
    intensity: str,
    planned: Row | None,
    paces: dict[str, dict[str, float]] | None,
) -> dict[str, object] | None:
    """The pace band for the session this engine just chose.

    A pace range is only meaningful for a session that is run at a prescribed
    effort. A rest day has none, and a planned workout carries its own type, so
    readiness decides only when nothing is scheduled.
    """
    if not paces or action == "rest":
        return None
    planned_type = str(planned.get("training_type") or "").lower() if planned else ""
    key = _PACE_KEY_BY_TRAINING_TYPE.get(planned_type)
    if key is None:
        key = _PACE_KEY_BY_INTENSITY.get(intensity)
    band = paces.get(key) if key else None
    if not band:
        return None
    return {
        "intensity": key,
        "min_s_per_km": band["min"],
        "max_s_per_km": band["max"],
    }

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

def _duration(score: int, target_tss: int, planned: Row | None = None) -> int:
    """Minutes producing ``target_tss`` at this session's intensity, or the plan's prescription."""
    if target_tss == 0:
        return 0
    level = str(band_for_score(score)["level"])
    prescription = planned.get("workout_prescription") if planned else None
    prescribed_min = prescription.get("duration_min") if isinstance(prescription, Mapping) else None
    if isinstance(prescribed_min, int | float) and not isinstance(prescribed_min, bool):
        if prescribed_min > 0:
            scaled = float(prescribed_min) * (1.0 if level in ("high", "moderate") else 0.6)
            return max(1, min(180, round(scaled)))
    intensity = _SESSION_IF.get(level, 0.7)
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
    pending = [e for e in events if not e.get("done") and e.get("status") != "deleted"]
    return next((e for e in pending if e.get("linked_activity_id") is None), None)

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

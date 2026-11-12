from typing import Final

from domain.workout.plan_evidence import PlanScience

SECONDS_PER_MINUTE: Final = 60.0


def enrich_plan_segments(
    segments: tuple[dict[str, object], ...] | list[dict[str, object]],
    science: PlanScience,
    pace_min: int | None,
    pace_max: int | None,
) -> tuple[dict[str, object], ...]:
    """Attach science and per-bout targets to one expanded segment per bout."""
    anchor = science.intensity_anchor
    low = pace_min or _number(anchor.get("pace_min_s_km")) or 0.0
    high = pace_max or _number(anchor.get("pace_max_s_km")) or low
    mean_pace = (low + high) / 2.0
    result: list[dict[str, object]] = []
    for index, raw in enumerate(segments):
        segment = dict(raw)
        role = str(segment.get("role") or "work")
        duration_s = _number(segment.get("duration_s")) or 0.0
        distance_m = _number(segment.get("distance_m")) or 0.0
        domain = "below_mt1" if role != "work" else science.target_domain
        science_fields = _science_fields(science, role, duration_s, distance_m)
        target = science_fields["target"]
        assert isinstance(target, dict)
        target.update(
            {
                "distance_m": round(distance_m, 1),
                "duration_s": round(duration_s, 1),
                "pace_s_km": round(mean_pace, 1) if role == "work" else None,
                "pace_min_s_km": low if role == "work" else None,
                "pace_max_s_km": high if role == "work" else None,
                "pace_key": anchor.get("pace_key") if role == "work" else "easy",
                "anchor_model": anchor.get("model"),
                "rpe_min": segment.get("rpe_min"),
                "rpe_max": segment.get("rpe_max"),
                "domain": domain,
            }
        )
        segment.update(
            {
                **science_fields,
                "order": index + 1,
                "start_s": sum(_number(item.get("duration_s")) or 0.0 for item in segments[:index]),
                "end_s": sum(
                    _number(item.get("duration_s")) or 0.0 for item in segments[: index + 1]
                ),
                "role": role,
                "duration_s": round(duration_s, 1),
                "distance_m": round(distance_m, 1),
                "sets": 1,
                "repetitions": 1,
                "intensity_domain": domain,
                "pace_min_s_km": low if role == "work" else segment.get("pace_min_s_km"),
                "pace_max_s_km": high if role == "work" else segment.get("pace_max_s_km"),
                "target": target,
                "measured": {},
            }
        )
        result.append(segment)
    return tuple(result)


def _science_fields(
    science: PlanScience, role: str, duration_s: float, distance_m: float
) -> dict[str, object]:
    is_work = role == "work"
    domain = science.target_domain if is_work else "below_mt1"
    rationale = science.rationale if is_work else "维持低强度活动；ACSM/ESSA 强度域为 below_mt1。"
    adaptation = science.target_adaptation if is_work else "维持低负荷活动并且促进恢复"
    quality_target = dict(science.quality_target)
    quality_target["work_distance_m"] = round(distance_m if is_work else 0.0, 1)
    quality_target["work_duration_s"] = round(duration_s if is_work else 0.0, 1)
    quality_target["target_repetitions"] = 1
    return {
        "source_refs": list(science.source_refs),
        "rationale": rationale,
        "target_adaptation": adaptation,
        "intensity_domain": domain,
        "quality_target": quality_target,
        "target": {"domain": domain},
        "measured": {},
    }


def _number(value: object) -> float | None:
    if isinstance(value, bool) or not isinstance(value, int | float):
        return None
    return float(value)

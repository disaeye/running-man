"""Private DB query and formatting helpers extracted from insights.py.

Split out to keep insights.py under the 250 LOC cap (clean-code.md).
"""

from __future__ import annotations

from collections.abc import Mapping
from datetime import date, timedelta
from typing import Any
from uuid import UUID

from application.insights.service import events_for_day, readiness_inputs, week_context
from domain.insights.plan_quality import PlanQuality
from domain.insights.prs import PersonalRecord
from infrastructure.repositories.insight_reads import InsightReadRepo
from infrastructure.repositories.pmc import PmcRepo


async def _readiness_inputs(
    athlete_id: UUID, target_day: date
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    return await readiness_inputs(athlete_id, target_day)


async def _events_for_day(athlete_id: UUID, target_day: date) -> list[dict[str, Any]]:
    return await events_for_day(athlete_id, target_day)


async def _week_context(athlete_id: UUID, target_day: date) -> tuple[float, float, int]:
    return await week_context(athlete_id, target_day)


def _date_range(start: date | None, end: date | None) -> tuple[date, date]:
    range_end = end or date.today()
    range_start = start or range_end - timedelta(days=55)
    return range_start, range_end


async def _planned_events(athlete_id: UUID, start: date, end: date) -> list[dict[str, Any]]:
    return await InsightReadRepo().planned_events(athlete_id, start, end)


async def _daily_loads_for_range(athlete_id: UUID, start: date, end: date) -> list[dict[str, Any]]:
    return await PmcRepo().get_daily_load_range(athlete_id, start, end)


async def _streams_for_activities(
    athlete_id: UUID, activity_ids: list[str]
) -> dict[str, list[dict[str, object]]]:
    return await InsightReadRepo().streams(athlete_id, activity_ids)


async def _power_streams_for_activities(
    athlete_id: UUID, activity_ids: list[str]
) -> dict[str, list[float]]:
    streams = await _streams_for_activities(athlete_id, activity_ids)
    return {
        activity_id: [
            _float_value(row["value"]) for row in rows if row.get("metric_type") == "power"
        ]
        for activity_id, rows in streams.items()
    }


def _activities_with_power(
    activities: list[dict[str, Any]], powers: dict[str, list[float]]
) -> dict[str, tuple[dict[str, Any], list[float]]]:
    return {
        str(row["activity_id"]): (row, powers.get(str(row["activity_id"]), []))
        for row in activities
    }


def _run_record(row: PersonalRecord) -> dict[str, object]:
    distance = row["distance_m"] or 0
    duration = row["best_value"]
    return {
        "type": f"fastest_{distance}m",
        "label": _distance_label(distance),
        "sport": "Run",
        "date": row["date"],
        "activity_id": row["activity_id"],
        "value_seconds": duration,
        "value_formatted": _format_duration_value(duration),
    }


def _ride_record(row: PersonalRecord) -> dict[str, object]:
    duration = row["duration_s"] or 0
    watts = round(float(row["best_value"]))
    return {
        "type": f"best_power_{duration}s",
        "label": _duration_label(duration),
        "sport": "Ride",
        "date": row["date"],
        "activity_id": row["activity_id"],
        "value_watts": watts,
        "value_formatted": f"{watts}W",
    }


def _distance_label(distance_m: int) -> str:
    labels = {
        1000: "最快1公里",
        5000: "最快5公里",
        10000: "最快10公里",
        21097: "最快半马",
        42195: "最快全马",
    }
    return labels.get(distance_m, f"最快{distance_m}米")


def _duration_label(duration_s: int) -> str:
    labels = {
        60: "最佳1分钟功率",
        300: "最佳5分钟功率",
        1200: "最佳20分钟功率",
        3600: "最佳60分钟功率",
    }
    return labels.get(duration_s, f"最佳{duration_s}秒功率")


def _format_duration_value(seconds: float) -> str:
    rounded = round(seconds)
    minutes, secs = divmod(rounded, 60)
    hours, minutes = divmod(minutes, 60)
    if hours:
        return f"{hours}:{minutes:02d}:{secs:02d}"
    return f"{minutes}:{secs:02d}"


def _zone_seconds(by_zone: Mapping[str, float]) -> list[int]:
    return [round(by_zone.get(f"z{zone}", 0.0) * 60) for zone in range(1, 6)]


def _quality_message(quality: PlanQuality) -> str:
    if quality["risks"]:
        return "训练计划存在可优化风险"
    if quality["strengths"]:
        return "训练计划结构良好"
    return "训练计划评分已生成"


def _float_value(value: object) -> float:
    return float(value) if isinstance(value, int | float) else 0.0


def _tss_value(row: dict[str, object]) -> float:
    tss = row.get("tss")
    return float(tss) if isinstance(tss, int | float) else 0.0


def _int_value(value: object) -> int:
    return int(value) if isinstance(value, int | float) else 0

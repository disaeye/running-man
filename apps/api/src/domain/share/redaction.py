from datetime import date, datetime
from typing import cast


def redact_for_public(activity: dict[str, object]) -> dict[str, object]:
    return {
        "sport": activity.get("sport"),
        "date": _activity_date(activity.get("start_time")),
        "duration_s": activity.get("duration_s"),
        "distance_m": activity.get("distance_m"),
        "name": _activity_name(activity),
    }


def _activity_date(value: object) -> date | str | None:
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    if isinstance(value, str):
        return value[:10]
    return None


def _activity_name(activity: dict[str, object]) -> object:
    name = activity.get("name")
    if name is not None:
        return name
    raw_data = activity.get("raw_data")
    if isinstance(raw_data, dict):
        public_name = cast(dict[str, object], raw_data).get("name")
        return public_name or cast(dict[str, object], raw_data).get("title")
    return None

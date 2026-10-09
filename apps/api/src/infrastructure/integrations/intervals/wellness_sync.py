"""Wellness sync: fetch daily wellness from Intervals.icu and upsert to health_wellness."""

from __future__ import annotations

from collections.abc import Callable, Mapping
from typing import cast

import psycopg

from infrastructure.integrations.intervals.client import IntervalsClient, JsonObject


def _to_int(value: object) -> object:
    if isinstance(value, int | float | str):
        return int(float(value))
    return value


# 每个健康列的取值方式：API 字段名（含回退顺序）与写入前的类型转换。
# carbs / fat 在不同版本的 Intervals.icu API 中存在 carbohydrates / fatTotal
# 与 carbs / fat 两种字段名，按顺序取第一个非空值。
_WELLNESS_FIELDS: tuple[tuple[str, tuple[str, ...], Callable[[object], object] | None], ...] = (
    ("weight", ("weight",), None),
    ("resting_hr", ("restingHR",), _to_int),
    ("hrv", ("hrv",), None),
    ("hrv_sdnn", ("hrvSDNN",), None),
    ("vo2max", ("vo2max",), None),
    ("steps", ("steps",), _to_int),
    ("sleep_secs", ("sleepSecs",), _to_int),
    ("sleep_score", ("sleepScore",), _to_int),
    ("sleep_quality", ("sleepQuality",), _to_int),
    ("avg_sleeping_hr", ("avgSleepingHR",), _to_int),
    ("spo2", ("spO2",), _to_int),
    ("respiration_rate", ("respiration",), None),
    ("systolic_bp", ("systolic",), _to_int),
    ("diastolic_bp", ("diastolic",), _to_int),
    ("kcal_consumed", ("kcalConsumed",), _to_int),
    ("carbs_g", ("carbs", "carbohydrates"), None),
    ("protein_g", ("protein",), None),
    ("fat_g", ("fat", "fatTotal"), None),
    ("hydration", ("hydration",), _to_int),
    ("body_fat_pct", ("bodyFat",), None),
    ("menstrual_phase", ("menstrualPhase",), _to_int),
    ("menstrual_phase_predicted", ("menstrualPhasePredicted",), _to_int),
    ("fatigue", ("fatigue",), _to_int),
    ("soreness", ("soreness",), _to_int),
    ("stress", ("stress",), _to_int),
    ("mood", ("mood",), _to_int),
    ("motivation", ("motivation",), _to_int),
    ("injury_status", ("injury",), _to_int),
    ("readiness", ("readiness",), _to_int),
)


def _field_value(
    record: Mapping[str, object],
    api_keys: tuple[str, ...],
    cast_value: Callable[[object], object] | None,
) -> object:
    for key in api_keys:
        value = record.get(key)
        if value is not None:
            return cast_value(value) if cast_value is not None else value
    return None


def _wellness_params(athlete_id: int | str, record: JsonObject) -> list[object]:
    params: list[object] = [cast(str, record["id"]), athlete_id]
    for _column, api_keys, cast_value in _WELLNESS_FIELDS:
        params.append(_field_value(record, api_keys, cast_value))
    return params


def _upsert_sql() -> str:
    columns = ["day", "athlete_id", *(column for column, _keys, _cast in _WELLNESS_FIELDS)]
    column_list = ", ".join(columns)
    placeholders = ", ".join(["%s"] * len(columns))
    updates = ", ".join(f"{column} = EXCLUDED.{column}" for column in columns[2:])
    return (
        f"INSERT INTO health_wellness ({column_list})\n"
        f"VALUES ({placeholders})\n"
        f"ON CONFLICT (day, athlete_id) DO UPDATE SET\n{updates}"
    )


_UPSERT_SQL = _upsert_sql()


async def sync_wellness(
    athlete_id: int | str,
    client: IntervalsClient,
    db: psycopg.Connection,
    oldest: str,
    newest: str,
) -> int:
    """Fetch wellness records for *athlete_id* between *oldest* … *newest* (inclusive,
    ISO date strings) and upsert them into the ``health_wellness`` table.

    Returns the number of rows inserted or updated.
    """
    records = await client.get_wellness(athlete_id, oldest, newest)
    if not records:
        return 0

    upserted = 0
    with db.cursor() as cur:
        for record in records:
            _ = cur.execute(_UPSERT_SQL, _wellness_params(athlete_id, record))
            upserted += cur.rowcount
    return upserted

from __future__ import annotations

from collections.abc import Iterator
from contextlib import contextmanager

import pytest

from infrastructure.integrations.intervals.wellness_sync import sync_wellness

pytestmark = pytest.mark.no_db


class FakeIntervalsClient:
    async def get_wellness(
        self, athlete_id: str, oldest: str, newest: str
    ) -> list[dict[str, object]]:
        assert (athlete_id, oldest, newest) == ("athlete-1", "2026-06-17", "2026-06-17")
        return [
            {
                "id": "2026-06-17",
                "readiness": 93,
                "restingHR": 44,
                "hrv": 61.5,
                "hrvSDNN": 70.2,
                "vo2max": 52.1,
                "steps": 11234,
                "sleepSecs": 26100,
                "sleepScore": 81,
                "sleepQuality": 3,
                "avgSleepingHR": 43,
                "spO2": 97,
                "respiration": 14.5,
                "systolic": 118,
                "diastolic": 74,
                "kcalConsumed": 2250,
                "carbs": 300.5,
                "protein": 105.2,
                "fat": 78.4,
                "hydration": 2,
                "bodyFat": 17.1,
                "fatigue": 2,
                "soreness": 1,
                "stress": 2,
                "mood": 3,
                "motivation": 3,
                "injury": 1,
            }
        ]


class FakeCursor:
    query: str
    params: tuple[object, ...]
    rowcount = 1

    def execute(self, query: str, params: tuple[object, ...]) -> None:
        self.query = query
        self.params = params


class FakeConnection:
    def __init__(self) -> None:
        self.cursor_instance = FakeCursor()

    @contextmanager
    def cursor(self) -> Iterator[FakeCursor]:
        yield self.cursor_instance


async def test_sync_wellness_persists_source_readiness() -> None:
    connection = FakeConnection()

    upserted = await sync_wellness(
        "athlete-1", FakeIntervalsClient(), connection, "2026-06-17", "2026-06-17"
    )

    assert upserted == 1
    query = connection.cursor_instance.query
    params = connection.cursor_instance.params
    assert "readiness" in query
    assert params[-1] == 93
    columns = [
        column.strip()
        for column in query.split("(", 2)[1].split(")")[0].split(",")
    ]
    # 新增字段全部进入 UPSERT 列与参数
    for column in (
        "hrv_sdnn",
        "sleep_quality",
        "avg_sleeping_hr",
        "spo2",
        "respiration_rate",
        "systolic_bp",
        "diastolic_bp",
        "kcal_consumed",
        "carbs_g",
        "protein_g",
        "fat_g",
        "hydration",
        "body_fat_pct",
        "injury_status",
        "menstrual_phase",
    ):
        assert column in columns
    assert params[columns.index("spo2")] == 97
    assert params[columns.index("injury_status")] == 1
    assert params[columns.index("hydration")] == 2
    assert params[columns.index("carbs_g")] == 300.5
    assert params[columns.index("hrv_sdnn")] == 70.2
    assert params[columns.index("sleep_quality")] == 3

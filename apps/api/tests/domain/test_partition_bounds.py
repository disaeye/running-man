"""分区键粗边界必须包住所有时区的本地日，且不能改变结果集。"""

from __future__ import annotations

from datetime import UTC, date, datetime, timedelta
from zoneinfo import ZoneInfo

import pytest

from domain.time.partition_bounds import (
    coarse_utc_bounds,
    coarse_utc_bounds_for_activities,
    coarse_utc_bounds_for_instant,
)

pytestmark = pytest.mark.no_db

WESTMOST = ZoneInfo("Etc/GMT+12")
EASTMOST = ZoneInfo("Pacific/Kiritimati")
START = date(2026, 6, 1)
END = date(2026, 6, 26)


def _instants_for_local_days() -> list[datetime]:
    """每个本地日的两个极端瞬间：东十四区零点、西十二区日末。"""
    instants = []
    for offset in range((END - START).days + 1):
        day = START + timedelta(days=offset)
        midnight = datetime(day.year, day.month, day.day, tzinfo=UTC)
        instants.append(midnight - timedelta(hours=14))
        instants.append(midnight + timedelta(days=1, hours=12) - timedelta(microseconds=1))
    return instants


def test_bounds_cover_every_timezone_extreme() -> None:
    lower, upper = coarse_utc_bounds(START, END)
    for instant in _instants_for_local_days():
        assert lower <= instant < upper
    assert lower == datetime(2026, 5, 31, tzinfo=UTC)
    assert upper == datetime(2026, 6, 28, tzinfo=UTC)


def test_bounds_are_fixed_utc_instants_regardless_of_session_zone() -> None:
    """边界由 Python 生成带时区的 datetime，会话时区不能把它解释窄。"""
    lower, upper = coarse_utc_bounds(START, END)
    assert lower.tzinfo is UTC and upper.tzinfo is UTC
    assert lower.astimezone(WESTMOST).date() == date(2026, 5, 30)
    assert upper.astimezone(EASTMOST).date() == date(2026, 6, 28)


def test_local_day_expression_never_escapes_bounds() -> None:
    """在极端时区里逐分钟检查：落在本地日区间内的瞬间全部被边界包住。"""
    lower, upper = coarse_utc_bounds(START, START)
    instant = datetime(2026, 5, 30, tzinfo=UTC)
    end = datetime(2026, 6, 3, tzinfo=UTC)
    for zone in (WESTMOST, EASTMOST, ZoneInfo("Asia/Shanghai"), ZoneInfo("UTC")):
        while instant < end:
            local_day = instant.astimezone(zone).date()
            if local_day == START:
                assert lower <= instant < upper, (zone, instant)
            instant += timedelta(minutes=1)


def test_bounds_for_instant_cover_stream_tail() -> None:
    start = datetime(2026, 11, 4, 3, 53, 16, tzinfo=UTC)
    lower, upper = coarse_utc_bounds_for_instant(start)
    assert lower == start - timedelta(days=1)
    assert upper == start + timedelta(days=2)
    assert lower <= start + timedelta(seconds=8576) < upper


def test_bounds_for_activities_span_all_start_times() -> None:
    rows = [
        {"activity_id": "a", "start_time": datetime(2025, 1, 1, tzinfo=UTC)},
        {"activity_id": "b", "start_time": datetime(2026, 11, 4, tzinfo=UTC)},
        {"activity_id": "c", "start_time": datetime(2025, 6, 1, tzinfo=UTC)},
    ]
    lower, upper = coarse_utc_bounds_for_activities(rows)
    assert lower == datetime(2024, 12, 31, tzinfo=UTC)
    assert upper == datetime(2026, 11, 6, tzinfo=UTC)


def test_bounds_reject_invalid_inputs() -> None:
    with pytest.raises(ValueError, match="start <= end"):
        coarse_utc_bounds(END, START)
    with pytest.raises(ValueError, match="timezone-aware"):
        coarse_utc_bounds_for_instant(datetime(2026, 6, 1))
    with pytest.raises(ValueError, match="timezone-aware start_time"):
        coarse_utc_bounds_for_activities([{"activity_id": "a", "start_time": datetime(2026, 6, 1)}])
    with pytest.raises(ValueError, match="must not be empty"):
        coarse_utc_bounds_for_activities([])

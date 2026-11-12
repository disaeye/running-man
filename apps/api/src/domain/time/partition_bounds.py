"""分区键的粗边界。

`activity_summary` 按 `start_time`、`activity_streams` 按 `sample_time` 做
RANGE 分区。查询结果由运动员本地日决定，表达式
`(start_time AT TIME ZONE athlete_tz)::date BETWEEN ...` 是分区键的函数，
PostgreSQL 无法据此裁剪分区，每个请求都要打开全部几十个分区。

给分区键补一条更宽的 UTC 边界，让规划器只保留相关分区；本地日条件保持
不变，结果集完全一致。IANA 时区偏移最大 +14 小时、最小 -12 小时，本地日
落在 [start, end] 的瞬间一定处于 UTC 的
`[start 00:00 - 14h, end+1 00:00 + 12h]` 内。此处各取 1 天 / 2 天余量，
并固定按 UTC 计算，会话时区不会让边界变窄。
"""

from __future__ import annotations

from datetime import date, datetime, time, timedelta, timezone

_UTC_TZ = timezone.utc
_LOWER_MARGIN = timedelta(days=1)
_UPPER_MARGIN = timedelta(days=2)


def coarse_utc_bounds(start: date, end: date) -> tuple[datetime, datetime]:
    """返回包住 [start, end] 全部本地日的 UTC 时刻区间 [下界, 上界)。"""
    if end < start:
        raise ValueError("coarse_utc_bounds requires start <= end")
    return (
        datetime.combine(start, time.min, tzinfo=_UTC_TZ) - _LOWER_MARGIN,
        datetime.combine(end, time.min, tzinfo=_UTC_TZ) + _UPPER_MARGIN,
    )


def coarse_utc_bounds_for_instant(instant: datetime) -> tuple[datetime, datetime]:
    """返回包住某个活动全部流样本的 UTC 时刻区间 [下界, 上界)。

    流样本可能越过 `start_time + duration_s`（同步源会补尾段），单活动场景
    没有日期区间可借用，因此按活动开始时刻展开同样的余量。
    """
    if instant.tzinfo is None:
        raise ValueError("coarse_utc_bounds_for_instant requires a timezone-aware datetime")
    moment = instant.astimezone(_UTC_TZ)
    return (moment - _LOWER_MARGIN, moment + _UPPER_MARGIN)


def coarse_utc_bounds_for_activities(
    rows: list[dict[str, object]],
) -> tuple[datetime, datetime]:
    """按一组活动的 `start_time` 求覆盖全部样本的 UTC 区间。

    个人纪录这类读者拿到的是全历史活动列表，日期区间无从借用；用列表里
    最早和最晚的开始时刻即可排除所有空白分区。
    """
    starts: list[datetime] = []
    for row in rows:
        value = row.get("start_time")
        if not isinstance(value, datetime) or value.tzinfo is None:
            raise ValueError("activity rows must carry timezone-aware start_time values")
        starts.append(value)
    if not starts:
        raise ValueError("activity rows must not be empty")
    first = min(starts).astimezone(_UTC_TZ)
    last = max(starts).astimezone(_UTC_TZ)
    return (first - _LOWER_MARGIN, last + _UPPER_MARGIN)

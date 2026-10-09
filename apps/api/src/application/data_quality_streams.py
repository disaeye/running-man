"""时序流脏数据检查：心率跳变、GPS 漂移、速度异常。

独立模块，被 data_quality 调用；全部基于 activity_streams 近 30 天数据。
阈值含义：
- 心率相邻采样跳变超过 40 bpm 视为可疑（心率带信号脱落典型特征）；
- 相邻 GPS 点推算位移速度超过 25 m/s（90 km/h）视为漂移；
- 速度流出现负值或超过 25 m/s 视为异常。
"""

from __future__ import annotations

from datetime import timedelta
from typing import Any
from uuid import UUID

STREAM_LOOKBACK = timedelta(days=30)
HR_JUMP_BPM = 40.0
HR_JUMP_MIN_EVENTS = 3
GPS_DRIFT_MPS = 25.0
GPS_DRIFT_MIN_EVENTS = 3
SPEED_OUTLIER_MPS = 25.0

_HR_JUMP_SQL = """
WITH hr AS (
    SELECT s.activity_id, s.value,
           lag(s.value) OVER w AS prev_value
    FROM activity_streams AS s
    JOIN activity_compute AS a
      ON a.athlete_id = s.athlete_id AND a.activity_id = s.activity_id
    WHERE s.athlete_id = %s
      AND s.metric_type = 'heart_rate'
      AND a.start_time >= now() - interval '30 days'
    WINDOW w AS (PARTITION BY s.activity_id ORDER BY s.sample_time)
)
SELECT activity_id, count(*) AS jumps
FROM hr
WHERE prev_value IS NOT NULL AND abs(value - prev_value) > %s
GROUP BY activity_id
HAVING count(*) >= %s
"""

_GPS_DRIFT_SQL = """
WITH gps AS (
    SELECT s.activity_id, s.sample_time, s.lat, s.lon,
           lag(s.lat) OVER w AS prev_lat,
           lag(s.lon) OVER w AS prev_lon,
           lag(s.sample_time) OVER w AS prev_time
    FROM activity_streams AS s
    JOIN activity_compute AS a
      ON a.athlete_id = s.athlete_id AND a.activity_id = s.activity_id
    WHERE s.athlete_id = %s
      AND s.lat IS NOT NULL AND s.lon IS NOT NULL
      AND a.start_time >= now() - interval '30 days'
    WINDOW w AS (PARTITION BY s.activity_id ORDER BY s.sample_time)
)
SELECT activity_id, count(*) AS drift_points
FROM gps
WHERE prev_time IS NOT NULL
  AND sample_time > prev_time
  AND sqrt(
        power((lon - prev_lon) * 111320.0 * cos(radians(lat)), 2)
        + power((lat - prev_lat) * 111320.0, 2)
      ) / extract(epoch FROM (sample_time - prev_time)) > %s
GROUP BY activity_id
HAVING count(*) >= %s
"""

_SPEED_OUTLIER_SQL = """
SELECT count(DISTINCT s.activity_id) AS activities
FROM activity_streams AS s
JOIN activity_compute AS a
  ON a.athlete_id = s.athlete_id AND a.activity_id = s.activity_id
WHERE s.athlete_id = %s
  AND s.metric_type = 'speed'
  AND (s.value < 0 OR s.value > %s)
  AND a.start_time >= now() - interval '30 days'
"""


async def hr_jump_activities(cur: Any, athlete_id: UUID) -> int:
    await cur.execute(_HR_JUMP_SQL, (athlete_id, HR_JUMP_BPM, HR_JUMP_MIN_EVENTS))
    rows = await cur.fetchall()
    return len(rows)


async def gps_drift_activities(cur: Any, athlete_id: UUID) -> int:
    await cur.execute(_GPS_DRIFT_SQL, (athlete_id, GPS_DRIFT_MPS, GPS_DRIFT_MIN_EVENTS))
    rows = await cur.fetchall()
    return len(rows)


async def speed_outlier_activities(cur: Any, athlete_id: UUID) -> int:
    await cur.execute(_SPEED_OUTLIER_SQL, (athlete_id, SPEED_OUTLIER_MPS))
    row = await cur.fetchone()
    return int(row["activities"]) if row else 0

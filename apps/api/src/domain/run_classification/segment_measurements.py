from collections.abc import Sequence
from typing import Protocol


class DistanceRow(Protocol):
    distance_m: float
    duration_s: float


def measured_values(
    distance: float,
    duration: float,
    avg_hr: float | None,
    speed: float,
) -> dict[str, object]:
    return {
        "distance_m": round(distance, 1),
        "duration_s": round(duration, 1),
        "pace_s_km": round(duration / (distance / 1000.0), 1) if distance > 0 else None,
        "avg_hr": round(avg_hr, 1) if avg_hr is not None else None,
        "speed_m_s": round(speed, 3),
        "rpe": None,
    }


def single_lap_inconsistent(
    rows: Sequence[DistanceRow], activity_distance: float, activity_duration: float
) -> bool:
    """A lone lap outside the whole-session envelope cannot stand in for it."""
    if len(rows) != 1 or activity_distance <= 0 or activity_duration <= 0:
        return False
    distance_error = abs(rows[0].distance_m - activity_distance) / activity_distance
    duration_error = abs(rows[0].duration_s - activity_duration) / activity_duration
    return distance_error > 0.01 or duration_error > 0.05

import statistics
from collections.abc import Sequence
from itertools import pairwise
from typing import Any, Final, Protocol

MIN_WORK_S: Final = 20.0
MIN_MOVING_SPEED: Final = 0.5
MIN_RECOVERY_S: Final = 10.0


class SpeedRow(Protocol):
    duration_s: float
    speed: float
    explicit_type: object


def alternating_recovery_speed(rows: Sequence[SpeedRow]) -> float | None:
    """Split alternating fast/slow work rows at the slow-side cut."""
    active = [
        row
        for row in rows
        if str(row.explicit_type or "").upper() in {"", "WORK"}
        and row.duration_s >= MIN_WORK_S
        and row.speed > MIN_MOVING_SPEED
    ]
    if len(active) < 4:
        return None
    sorted_speeds = sorted(row.speed for row in active)
    cut = _largest_scaled_gap_cut(sorted_speeds)
    if cut is None:
        return None
    high = [value for value in sorted_speeds if value >= cut]
    low = [value for value in sorted_speeds if value < cut]
    if not high or not low or statistics.median(high) < statistics.median(low) * 1.15:
        return None
    groups = ["H" if row.speed >= cut else "L" for row in active]
    alternations = sum(1 for left, right in pairwise(groups) if left != right)
    return cut if alternations >= 3 else None


def role_for_row(
    row: Any,
    index: int,
    work_indices: list[int],
) -> str:
    """An explicit RECOVERY row keeps its typed role at any boundary."""
    first, last = (work_indices[0], work_indices[-1]) if work_indices else (-1, -1)
    explicit_role = getattr(row, "explicit_role", None)
    if isinstance(explicit_role, str) and explicit_role:
        return explicit_role
    if row.work_candidate:
        return "work"
    if getattr(row, "explicit_recovery", False):
        return "recovery" if row.duration_s > 0 else "transition"
    if first >= 0 and index < first:
        return "warmup" if row.duration_s >= 60 else "transition"
    if first >= 0 and index > last:
        return "cooldown" if row.duration_s >= 60 else "transition"
    return "recovery" if row.duration_s >= MIN_RECOVERY_S else "transition"


def _largest_scaled_gap_cut(speeds: Sequence[float]) -> float | None:
    """Midpoint of the largest gap after scaling speeds by their median."""
    if len(speeds) < 4:
        return None
    scale = statistics.median(speeds)
    if scale <= 0:
        return None
    gaps = [((right - left) / scale, (left + right) / 2.0) for left, right in pairwise(speeds)]
    gap, cut = max(gaps, key=lambda item: item[0])
    return cut if gap >= 0.10 else None

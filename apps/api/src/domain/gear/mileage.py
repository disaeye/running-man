from collections.abc import Mapping, Sequence

DEFAULT_RETIREMENT_THRESHOLD_M = 800_000.0


def compute_mileage(assignments: Sequence[Mapping[str, object]]) -> float:
    total = 0.0
    for assignment in assignments:
        distance = assignment.get("distance_m")
        if isinstance(distance, int | float):
            total += float(distance)
    return total


def check_retirement(
    shoe: Mapping[str, object], threshold_m: float = DEFAULT_RETIREMENT_THRESHOLD_M
) -> bool:
    mileage = shoe.get("mileage_m", shoe.get("current_mileage_m", 0))
    if not isinstance(mileage, int | float):
        return False
    return float(mileage) >= threshold_m

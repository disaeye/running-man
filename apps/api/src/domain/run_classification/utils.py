import statistics


def number(value: object, default: float = 0.0) -> float:
    if isinstance(value, bool) or not isinstance(value, int | float):
        return default
    return float(value)


def distance(segment: dict[str, object]) -> float:
    return number(segment.get("distance_m"))


def duration(segment: dict[str, object]) -> float:
    return number(segment.get("duration_s"))


def pace(segment: dict[str, object]) -> float:
    return number(segment.get("pace_s_km"))


def speed(segment: dict[str, object]) -> float:
    measured = segment.get("measured")
    if not isinstance(measured, dict):
        return 0.0
    return number(measured.get("speed_m_s"))


def values_range(values: list[float]) -> list[float]:
    positive = [round(value, 1) for value in values if value > 0]
    if not positive:
        return []
    return [min(positive), max(positive)]


def ratio(actual: float, target: float) -> float | None:
    if target <= 0:
        return None
    return round(actual / target, 3)


def pace_text(seconds: float) -> str:
    return f"{int(seconds // 60)}:{int(seconds % 60):02d}"


def duration_text(seconds: float) -> str:
    if seconds >= 3600:
        return f"{int(seconds // 3600)}:{int(seconds % 3600 // 60):02d}:{int(seconds % 60):02d}"
    if seconds >= 60:
        return f"{int(seconds // 60)} min {int(seconds % 60):02d} s"
    return f"{int(seconds)} s"


def fade_pct(values: list[float]) -> float | None:
    if len(values) < 2:
        return None
    third = max(1, len(values) // 3)
    first = statistics.fmean(values[:third])
    last = statistics.fmean(values[-third:])
    if first <= 0:
        return None
    return round((last / first - 1.0) * 100.0, 1)


def coefficient(values: list[float]) -> float:
    if len(values) < 2:
        return 0.0
    mean = statistics.fmean(values)
    if mean <= 0:
        return 0.0
    return round(statistics.pstdev(values) / mean, 3)

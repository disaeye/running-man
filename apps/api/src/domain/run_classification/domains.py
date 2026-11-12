from domain.run_classification.schema import DOMAIN_NAMES


def pace_domain_for_speed(speed: float, raw_data: dict[str, object]) -> int | None:
    threshold = _number(raw_data.get("threshold_pace"))
    edges = raw_data.get("pace_zones")
    if threshold is None or threshold <= 0 or speed < 0.5 or not isinstance(edges, list):
        return None
    if len(edges) < 5:
        return None
    percent = speed / threshold * 100.0
    for index, edge in enumerate(edges[:5]):
        edge_number = _number(edge)
        if edge_number is None:
            raise ValueError("pace zone edge must be numeric")
        if percent <= edge_number:
            return 0 if index <= 1 else 1 if index <= 3 else 2
    return 2


def hr_domain_for_value(value: float, raw_data: dict[str, object]) -> int | None:
    edges = raw_data.get("icu_hr_zones")
    if value < 40 or not isinstance(edges, list) or len(edges) < 5:
        return None
    for index, edge in enumerate(edges[:5]):
        edge_number = _number(edge)
        if edge_number is None:
            raise ValueError("heart-rate zone edge must be numeric")
        if value <= edge_number:
            return 0 if index <= 1 else 1 if index == 2 else 2
    return 2


def domain_for_segment(
    *,
    speed: float,
    avg_hr: float | None,
    duration_s: float,
    raw_data: dict[str, object],
) -> str:
    pace_domain = pace_domain_for_speed(speed, raw_data)
    hr_domain = hr_domain_for_value(avg_hr, raw_data) if avg_hr is not None else None
    if pace_domain is None and hr_domain is None:
        return "low_unspecified"
    if pace_domain is None:
        return DOMAIN_NAMES[hr_domain or 0]
    if hr_domain is None or duration_s < 180:
        index = pace_domain
    else:
        index = round(pace_domain * 0.7 + hr_domain * 0.3)
    threshold = _number(raw_data.get("threshold_pace"))
    if threshold and threshold > 0 and speed >= threshold / 0.88 and index >= 2:
        index = 3
    return DOMAIN_NAMES[max(0, min(3, index))]


def raw_zone_domain_residence_s(raw_data: dict[str, object]) -> dict[str, float]:
    pace_key = "gap_zone_times" if raw_data.get("use_gap_zone_times") else "pace_zone_times"
    pace = _zone_seconds(raw_data.get(pace_key))
    hr = _zone_seconds(raw_data.get("icu_hr_zone_times"))
    if pace is None and hr is None:
        return {name: 0.0 for name in (*DOMAIN_NAMES, "low_unspecified")}
    pace_values = pace or [0.0, 0.0, 0.0, 0.0, 0.0]
    hr_values = hr or [0.0, 0.0, 0.0, 0.0, 0.0]
    pace_share = 1.0 if hr is None else 0.7
    hr_share = 0.0 if hr is None else 0.3
    result = {
        "below_mt1": (
            (pace_values[0] + pace_values[1]) * pace_share
            + (hr_values[0] + hr_values[1]) * hr_share
        ),
        "mt1_mt2": ((pace_values[2] + pace_values[3]) * pace_share + hr_values[2] * hr_share),
        "mt2_wmax": pace_values[4] * pace_share + hr_values[3] * hr_share,
        "above_wmax": hr_values[4] * hr_share,
        "low_unspecified": 0.0,
    }
    return {key: round(value, 1) for key, value in result.items()}


def _zone_seconds(value: object) -> list[float] | None:
    if not isinstance(value, list) or len(value) != 5:
        return None
    result: list[float] = []
    for item in value:
        number = _number(item)
        if number is None:
            raise ValueError("zone seconds must be numeric")
        result.append(number)
    return result


def _number(value: object) -> float | None:
    if isinstance(value, bool) or not isinstance(value, int | float):
        return None
    return float(value)

from domain.gear.mileage import DEFAULT_RETIREMENT_THRESHOLD_M, check_retirement, compute_mileage


def test_compute_mileage_sums_assigned_activity_distances() -> None:
    assignments = [{"distance_m": 10_000.0}, {"distance_m": 5_500}, {"distance_m": None}]

    assert compute_mileage(assignments) == 15_500.0


def test_compute_mileage_ignores_missing_and_non_numeric_distances() -> None:
    assignments = [{"distance_m": None}, {}, {"distance_m": "1000"}]

    assert compute_mileage(assignments) == 0.0


def test_check_retirement_uses_800km_default_threshold() -> None:
    assert check_retirement({"mileage_m": DEFAULT_RETIREMENT_THRESHOLD_M}) is True
    assert check_retirement({"mileage_m": DEFAULT_RETIREMENT_THRESHOLD_M - 1}) is False


def test_check_retirement_accepts_legacy_current_mileage_field() -> None:
    assert check_retirement({"current_mileage_m": 801_000}) is True


def test_check_retirement_allows_custom_threshold() -> None:
    assert check_retirement({"mileage_m": 300_000}, threshold_m=250_000) is True

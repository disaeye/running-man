from domain.insights.hrv_factor import compute_hrv_factor


def test_missing_hrv_data_returns_neutral() -> None:
    assert compute_hrv_factor(None, 50.0) == 50
    assert compute_hrv_factor(50.0, None) == 50


def test_hrv_above_typical_variation_scores_maximum() -> None:
    assert compute_hrv_factor(51.5, 50.0) == 100


def test_hrv_at_baseline_scores_high() -> None:
    assert compute_hrv_factor(50.0, 50.0) == 90.0


def test_hrv_below_baseline_uses_scaled_dropoff() -> None:
    assert compute_hrv_factor(45.0, 50.0) == 40.0
    assert compute_hrv_factor(40.0, 50.0) == 20.0


def test_invalid_non_positive_hrv_data_returns_neutral() -> None:
    assert compute_hrv_factor(0.0, 50.0) == 50
    assert compute_hrv_factor(50.0, 0.0) == 50

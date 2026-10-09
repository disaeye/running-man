import pytest

from domain.physiology.hrmax import estimate_hrmax


def test_hrmax_clean_ramp_uses_tangent_method_extrapolation() -> None:
    session_max_hrs = (
        [160, 162, 164, 166, 168, 170] * 3
        + [172, 174, 176, 178, 180, 182] * 2
        + [184, 186, 188, 190]
    )

    result = estimate_hrmax(session_max_hrs)

    assert result["data_sufficient"] is True
    assert result["method"] == "tangent"
    assert result["hr_max"] == pytest.approx(199, abs=2)
    assert result["session_count"] == 34


def test_hrmax_noisy_sessions_still_estimate_near_athlete_max() -> None:
    session_max_hrs = [
        150,
        162,
        171,
        166,
        175,
        169,
        178,
        181,
        172,
        185,
        176,
        188,
        183,
        179,
        186,
        182,
        187,
        184,
        189,
        180,
        177,
        185,
        181,
        186,
        188,
        183,
        190,
        187,
        184,
        189,
    ]

    result = estimate_hrmax(session_max_hrs)

    assert result["data_sufficient"] is True
    assert result["hr_max"] == pytest.approx(202, abs=5)
    assert result["confidence"] == "low"
    assert result["near_max_count"] == 0


def test_hrmax_insufficient_sessions_returns_graceful_empty_estimate() -> None:
    result = estimate_hrmax([181, 184, 187, 190])

    assert result == {
        "hr_max": None,
        "method": None,
        "confidence": None,
        "data_sufficient": False,
        "near_max_count": 0,
        "session_count": 4,
    }


def test_hrmax_ignores_non_positive_outliers_before_estimating() -> None:
    result = estimate_hrmax([-999, 0, 172, 181, 186, 188, 190])

    assert result["data_sufficient"] is True
    assert result["method"] == "rolling_max"
    assert result["hr_max"] == pytest.approx(190, abs=2)
    assert result["session_count"] == 5


def test_hrmax_empty_input_is_insufficient() -> None:
    result = estimate_hrmax([])

    assert result["hr_max"] is None
    assert result["data_sufficient"] is False
    assert result["session_count"] == 0


def test_hrmax_fallback_requires_five_valid_sessions() -> None:
    result = estimate_hrmax([176, 181, 184, 187, 190])

    assert result["data_sufficient"] is True
    assert result["method"] == "rolling_max"
    assert result["hr_max"] == pytest.approx(190, abs=2)


def test_hrmax_clean_sub_tangent_ramp_returns_observed_max() -> None:
    session_max_hrs = [
        160,
        162,
        164,
        166,
        168,
        170,
        172,
        174,
        176,
        178,
        180,
        182,
        184,
        186,
        188,
        190,
    ]

    result = estimate_hrmax(session_max_hrs)

    assert result["method"] == "rolling_max"
    assert result["hr_max"] == pytest.approx(190, abs=2)

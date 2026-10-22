import pytest

from domain.physiology.hrmax import MAX_PLAUSIBLE_HEADROOM_BPM, estimate_hrmax


def test_hrmax_clean_ramp_uses_tangent_method_extrapolation() -> None:
    session_max_hrs = (
        [160, 162, 164, 166, 168, 170] * 3
        + [172, 174, 176, 178, 180, 182] * 2
        + [184, 186, 188, 190]
    )

    result = estimate_hrmax(session_max_hrs)

    assert result["data_sufficient"] is True
    assert result["method"] == "tangent"
    # A few bpm above the highest session on record — the ceiling the athlete
    # has not quite reached yet. Not the 10+ bpm an over-smoothed density
    # produced, which no observation supported.
    assert result["hr_max"] == pytest.approx(195, abs=2)
    assert 0 < result["hr_max"] - 190 <= MAX_PLAUSIBLE_HEADROOM_BPM
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
    assert result["hr_max"] == pytest.approx(194, abs=3)
    # A ceiling four bpm above anything measured is a plausible gap between the
    # highest recorded session and true HRmax; the earlier answer sat 12 bpm
    # above, which is the fit running away rather than an estimate.
    assert result["hr_max"] - 190 <= MAX_PLAUSIBLE_HEADROOM_BPM
    # Seven sessions peaked within 3 bpm of the observed maximum (190). Counting
    # against the estimate instead made this 0 for every athlete, because the
    # extrapolation always sits above all the data.
    assert result["near_max_count"] == 7


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


def test_hrmax_confidence_reflects_repeated_peaks_not_a_constant() -> None:
    """The field is a measurement: a tight cluster of peaks earns high confidence."""
    result = estimate_hrmax([185.0] * 5 + [180.0] * 25)

    assert result["hr_max"] == 185
    assert result["near_max_count"] == 5
    assert result["confidence"] == "high"


def test_hrmax_low_confidence_when_the_extrapolation_runs_away() -> None:
    """A single outlier peak leaves the tangent nothing to hold on to."""
    result = estimate_hrmax([200.0, 160.0] + [170.0] * 28)

    assert result["near_max_count"] == 1
    assert result["confidence"] == "medium"


def test_hrmax_never_reports_a_ceiling_the_data_cannot_support() -> None:
    """A plausible HRmax sits a few bpm above the highest session, never tens.

    Heart rate max is a ceiling: the highest session on record is a lower bound.
    The tangent method extrapolates from the shape of the distribution, and on a
    skewed or sparse distribution that extrapolation can land far past every
    observation. Reporting it would state a number no measurement supports, so
    the estimator falls back to the observed maximum instead.
    """
    datasets = [
        [160.0] * 20 + [178.0, 179.0, 180.0],
        [150.0, 152.0, 154.0] * 8 + [186.0, 187.0],
        [165.0] * 25 + [170.0, 175.0, 180.0, 185.0, 190.0],
        [141.0, 145.0, 149.0, 153.0, 157.0, 161.0, 165.0, 169.0, 173.0] * 4,
    ]

    for data in datasets:
        result = estimate_hrmax(data)
        observed = max(data)
        assert result["hr_max"] is not None
        assert result["hr_max"] - observed <= MAX_PLAUSIBLE_HEADROOM_BPM, data
        assert result["hr_max"] >= observed

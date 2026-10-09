import pytest

from domain.physiology.threshold_pace import (
    EffortPoint,
    estimate_threshold_pace,
    extract_efforts_from_activities,
)


def _effort(distance_m: float, duration_s: float) -> EffortPoint:
    return EffortPoint(distance_m=distance_m, duration_s=duration_s)


def test_threshold_pace_four_efforts_estimates_430_per_km() -> None:
    efforts = [
        _effort(1311.11, 300),
        _effort(2422.22, 600),
        _effort(4644.44, 1200),
        _effort(9088.89, 2400),
    ]

    result = estimate_threshold_pace(efforts)

    assert result["data_sufficient"] is True
    assert result["method"] == "critical_speed_model"
    assert result["threshold_pace_s_per_km"] == pytest.approx(270, abs=5)
    assert result["critical_speed_ms"] == pytest.approx(3.704, abs=0.005)


def test_threshold_pace_regression_accuracy_with_six_efforts() -> None:
    efforts = [
        _effort(1500, 360),
        _effort(3000, 765),
        _effort(5000, 1305),
        _effort(8000, 2115),
        _effort(10000, 2655),
        _effort(15000, 4005),
    ]

    result = estimate_threshold_pace(efforts)

    assert result["threshold_pace_s_per_km"] == pytest.approx(270, abs=5)
    assert result["confidence"] == "high"
    assert result["effort_count"] == 6


def test_threshold_pace_insufficient_valid_efforts_returns_none() -> None:
    result = estimate_threshold_pace(
        [
            _effort(1500, 360),
            _effort(3000, 765),
            _effort(5000, 1305),
        ]
    )

    assert result == {
        "threshold_pace_s_per_km": None,
        "critical_speed_ms": None,
        "confidence": None,
        "data_sufficient": False,
        "method": None,
        "effort_count": 3,
    }


def test_threshold_pace_filters_invalid_short_efforts_before_regression() -> None:
    efforts = [
        _effort(100, 30),
        _effort(1311.11, 300),
        _effort(2422.22, 600),
        _effort(4644.44, 1200),
        _effort(9088.89, 2400),
    ]

    result = estimate_threshold_pace(efforts)

    assert result["data_sufficient"] is True
    assert result["effort_count"] == 4
    assert result["threshold_pace_s_per_km"] == pytest.approx(270, abs=5)


def test_threshold_pace_rejects_identical_duration_edge_case() -> None:
    result = estimate_threshold_pace(
        [
            _effort(1400, 360),
            _effort(1500, 360),
            _effort(1600, 360),
            _effort(1700, 360),
        ]
    )

    assert result["threshold_pace_s_per_km"] is None
    assert result["data_sufficient"] is False
    assert result["effort_count"] == 4


def test_threshold_pace_extracts_running_activity_efforts_only() -> None:
    activities: list[dict[str, object]] = [
        {"sport": "Run", "distance_m": 5000, "duration_s": 1320},
        {"sport": "TrailRun", "distance_m": 8000, "duration_s": 2250},
        {"sport": "Ride", "distance_m": 20000, "duration_s": 3600},
        {"sport": "Run", "distance_m": 800, "duration_s": 170},
        {"sport": "Run", "distance_m": "bad", "duration_s": 1000},
    ]

    points = extract_efforts_from_activities(activities)

    assert points == [
        EffortPoint(distance_m=5000.0, duration_s=1320.0),
        EffortPoint(distance_m=8000.0, duration_s=2250.0),
    ]


EASY_RUN = {"sport": "Run", "distance_m": 8270, "duration_s": 4056, "avg_hr": 144}
RACE_EFFORT = {"sport": "Run", "distance_m": 5030, "duration_s": 1308, "avg_hr": 174}
TEMPO_EFFORT = {"sport": "Run", "distance_m": 8540, "duration_s": 2400, "avg_hr": 174}
STEADY_RUN = {"sport": "Run", "distance_m": 8540, "duration_s": 3072, "avg_hr": 155}
LONG_EASY_RUN = {"sport": "Run", "distance_m": 10980, "duration_s": 3894, "avg_hr": 150}


class TestEffortIntensityFilter:
    """Only genuine efforts may feed the critical-speed fit.

    The model fits ``distance = CS·time + W'`` through the *boundary* of what
    the athlete can sustain, so every point must be a maximal effort. Passing
    every run made an easy 8:10/km run (67 min, HR 144) and a 4:34/km race
    (22 min, HR 174) equally valid boundary points: the fit returned 6'18"/km
    with ``confidence: high`` while the athlete's real best 10 km was 5'14"/km.
    Since rTSS scales with (threshold/pace)², a threshold 23% too slow
    understates every session's load.
    """

    def test_easy_running_is_excluded_even_without_hr_references(self) -> None:
        points = extract_efforts_from_activities([EASY_RUN, RACE_EFFORT, TEMPO_EFFORT])

        # The 865 s/km easy run is nowhere near the athlete's best pace.
        assert EffortPoint(distance_m=8270.0, duration_s=4056.0) not in points
        assert len(points) == 2

    def test_hr_reference_rejects_fast_but_not_hard_running(self) -> None:
        # STEADY is close to the best pace but averaged HR 155 against LTHR 182;
        # it is a steady run, not a threshold effort.
        points = extract_efforts_from_activities(
            [STEADY_RUN, RACE_EFFORT, TEMPO_EFFORT], lthr=182
        )

        assert EffortPoint(distance_m=8540.0, duration_s=3072.0) not in points
        assert len(points) == 2

    def test_an_activity_without_hr_passes_on_pace_alone(self) -> None:
        # Recorded without a strap: the pace filter already required it to be
        # near the athlete's best, so rejecting it would discard a real effort.
        # 8 km at 279 s/km is within 15% of the 260 s/km race pace.
        no_hr = {"sport": "Run", "distance_m": 8000, "duration_s": 2232}
        points = extract_efforts_from_activities([no_hr, RACE_EFFORT], lthr=182)

        assert EffortPoint(distance_m=8000.0, duration_s=2232.0) in points

    def test_hr_max_is_only_used_when_lthr_is_absent(self) -> None:
        # A threshold effort sits below HRmax, so demanding 95% of the ceiling
        # asks for an intensity above threshold — here 180.5 bpm against an
        # effort at 174. LTHR (182) is the correct reference and admits it.
        with_lthr = extract_efforts_from_activities(
            [RACE_EFFORT, TEMPO_EFFORT], lthr=182, hr_max=190
        )
        with_hr_max_only = extract_efforts_from_activities(
            [RACE_EFFORT, TEMPO_EFFORT], hr_max=190
        )

        assert len(with_lthr) == 2
        assert with_hr_max_only == []

    def test_all_easy_running_yields_no_efforts_with_an_hr_reference(self) -> None:
        # With LTHR known, both of these averaged far below threshold, so the
        # set is empty and the caller reports insufficient data.
        points = extract_efforts_from_activities(
            [EASY_RUN, LONG_EASY_RUN], lthr=182
        )

        assert points == []

    def test_filtered_set_reports_insufficient_data_rather_than_a_number(self) -> None:
        # Two real efforts cannot support a 4-point regression; the honest
        # answer is "not enough data", not a threshold derived from easy runs.
        points = extract_efforts_from_activities(
            [EASY_RUN, RACE_EFFORT, TEMPO_EFFORT, STEADY_RUN, LONG_EASY_RUN], lthr=182
        )
        result = estimate_threshold_pace(points)

        assert result["data_sufficient"] is False
        assert result["threshold_pace_s_per_km"] is None

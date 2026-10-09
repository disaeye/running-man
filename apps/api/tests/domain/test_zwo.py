"""ZWO parse / generate / TSS prediction tests.

Reference format: https://github.com/h4l/zwift-workout-file-reference
Power is stored as FTP fraction (0.0-3.0); duration is in seconds.
"""

import pytest
from lxml import etree

from domain.workout.zwo import (
    Workout,
    WorkoutSegment,
    generate_zwo,
    parse_zwo,
    predict_workout_tss,
)

# A representative workout covering every supported segment type.
SAMPLE_ZWO = """\
<workout_file>
  <name>Test Workout</name>
  <sportType>bike</sportType>
  <workout>
    <Warmup Duration="600" PowerLow="0.5" PowerHigh="0.8"/>
    <SteadyState Duration="1200" Power="0.9" Cadence="90"/>
    <IntervalsT Repeat="4" OnDuration="60" OffDuration="120" OnPower="1.2" OffPower="0.5"/>
    <Cooldown Duration="600" PowerLow="0.8" PowerHigh="0.4"/>
    <FreeRide Duration="300"/>
  </workout>
</workout_file>
"""


def test_parse_simple_zwo() -> None:
    workout = parse_zwo(SAMPLE_ZWO)

    assert workout == Workout(
        name="Test Workout",
        sport_type="bike",
        segments=[
            WorkoutSegment("warmup", 600, 0.5, 0.8, None),
            WorkoutSegment("steadystate", 1200, 0.9, 0.9, 90),
            # IntervalsT Repeat=4 expands to 4 segments, one per on/off cycle
            # (60 + 120 = 180s each); low = recovery (off), high = work (on).
            WorkoutSegment("intervals", 180, 0.5, 1.2, None),
            WorkoutSegment("intervals", 180, 0.5, 1.2, None),
            WorkoutSegment("intervals", 180, 0.5, 1.2, None),
            WorkoutSegment("intervals", 180, 0.5, 1.2, None),
            WorkoutSegment("cooldown", 600, 0.8, 0.4, None),
            WorkoutSegment("free_ride", 300, None, None, None),
        ],
    )


def test_parse_sport_type_run() -> None:
    xml = "<workout_file><name>R</name><sportType>run</sportType><workout/></workout_file>"
    assert parse_zwo(xml).sport_type == "run"


def test_parse_missing_sport_defaults_bike() -> None:
    xml = "<workout_file><name>R</name><workout/></workout_file>"
    assert parse_zwo(xml).sport_type == "bike"


def test_parse_steady_state_with_power_low_high() -> None:
    xml = (
        "<workout_file><name>R</name><sportType>bike</sportType>"
        '<workout><SteadyState Duration="100" PowerLow="0.7" PowerHigh="0.9"/></workout>'
        "</workout_file>"
    )
    seg = parse_zwo(xml).segments[0]
    assert seg == WorkoutSegment("steadystate", 100, 0.7, 0.9, None)


def test_roundtrip() -> None:
    """parse -> generate -> parse must be semantically identical."""
    original = parse_zwo(SAMPLE_ZWO)
    regenerated = parse_zwo(generate_zwo(original))
    assert regenerated == original


def test_generate_produces_valid_zwo_structure() -> None:
    xml = generate_zwo(parse_zwo(SAMPLE_ZWO))
    root = etree.fromstring(xml.encode("utf-8"))

    assert root.tag == "workout_file"
    assert root.find("name").text == "Test Workout"
    assert root.find("sportType").text == "bike"
    # IntervalsT must emit On/Off power and a Repeat count.
    interval_el = root.find("workout/IntervalsT")
    assert interval_el.get("OnPower") == "1.2"
    assert interval_el.get("OffPower") == "0.5"
    assert interval_el.get("Repeat") == "4"
    # SteadyState must round-trip cadence.
    steady_el = root.find("workout/SteadyState")
    assert steady_el.get("Power") == "0.9"
    assert steady_el.get("Cadence") == "90"


def test_predict_tss_steady_one_hour_at_ftp() -> None:
    # 1h @ 100% FTP -> ~100 TSS, independent of the FTP value.
    segments = [WorkoutSegment("steadystate", 3600, 1.0, 1.0, None)]
    assert predict_workout_tss(segments, ftp=250) == pytest.approx(100.0, abs=0.5)


def test_predict_tss_proportional_to_duration() -> None:
    half = [WorkoutSegment("steadystate", 1800, 1.0, 1.0, None)]
    full = [WorkoutSegment("steadystate", 3600, 1.0, 1.0, None)]
    assert predict_workout_tss(half, ftp=250) == pytest.approx(
        predict_workout_tss(full, ftp=250) / 2, abs=0.5
    )


def test_predict_tss_intervals_harder_than_steady() -> None:
    # 1h of 1.2/0.5 FTP intervals: NP > mean, so TSS > steady-at-mean.
    # Mean power = (1.2 + 0.5)/2 = 0.85 FTP.
    intervals = [WorkoutSegment("intervals", 3600, 0.5, 1.2, None)]
    steady_at_mean = [WorkoutSegment("steadystate", 3600, 0.85, 0.85, None)]

    tss_intervals = predict_workout_tss(intervals, ftp=250)
    tss_steady_mean = predict_workout_tss(steady_at_mean, ftp=250)

    assert tss_intervals > tss_steady_mean
    # Still bounded by 1h @ on-power for the whole hour.
    assert tss_intervals < predict_workout_tss(
        [WorkoutSegment("steadystate", 3600, 1.2, 1.2, None)], ftp=250
    )


def test_predict_tss_ignores_free_ride() -> None:
    segments = [WorkoutSegment("free_ride", 600, None, None, None)]
    assert predict_workout_tss(segments, ftp=250) == 0.0


def test_predict_tss_warmup_uses_mean_power() -> None:
    # Ramp 0.5 -> 1.5 over 1h: mean = 1.0 FTP -> ~100 TSS.
    segments = [WorkoutSegment("warmup", 3600, 0.5, 1.5, None)]
    assert predict_workout_tss(segments, ftp=200) == pytest.approx(100.0, abs=0.5)


def test_predict_tss_cooldown_uses_mean_power() -> None:
    # Cooldown 1.0 -> 0.4 over 1h: mean = 0.7 FTP.
    segments = [WorkoutSegment("cooldown", 3600, 1.0, 0.4, None)]
    assert predict_workout_tss(segments, ftp=200) == pytest.approx(49.0, abs=1.0)


def test_predict_tss_sums_across_segments() -> None:
    segments = [
        WorkoutSegment("steadystate", 1800, 1.0, 1.0, None),  # 50 TSS
        WorkoutSegment("steadystate", 1800, 1.0, 1.0, None),  # 50 TSS
    ]
    assert predict_workout_tss(segments, ftp=250) == pytest.approx(100.0, abs=1.0)

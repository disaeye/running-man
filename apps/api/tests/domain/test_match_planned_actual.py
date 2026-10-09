from __future__ import annotations

from datetime import date, datetime

from domain.calendar.match import match_planned_actual


def _plan(
    event_id: str,
    start_time: object,
    sport_type: str = "",
    predicted_tss: float | None = None,
) -> dict[str, object]:
    return {
        "event_id": event_id,
        "start_time": start_time,
        "sport_type": sport_type,
        "predicted_tss": predicted_tss,
    }


def _actual(
    activity_id: str,
    start_time: object,
    sport: str = "",
    tss: float = 0.0,
) -> dict[str, object]:
    return {
        "activity_id": activity_id,
        "start_time": start_time,
        "sport": sport,
        "tss": tss,
    }


# --- Match status tests ---


def test_completed_when_tss_within_tolerance() -> None:
    planned = [_plan("p1", date(2025, 6, 1), sport_type="Run", predicted_tss=100.0)]
    actuals = [_actual("a1", date(2025, 6, 1), sport="Run", tss=95.0)]

    result = match_planned_actual(planned, actuals)

    assert len(result) == 1
    assert result[0].match_status == "completed"
    assert result[0].planned_event_id == "p1"
    assert result[0].actual_activity_id == "a1"
    assert result[0].planned_tss == 100.0
    assert result[0].actual_tss == 95.0


def test_partial_when_tss_outside_tolerance() -> None:
    planned = [_plan("p1", date(2025, 6, 1), sport_type="Run", predicted_tss=100.0)]
    actuals = [_actual("a1", date(2025, 6, 1), sport="Run", tss=50.0)]

    result = match_planned_actual(planned, actuals)

    assert len(result) == 1
    assert result[0].match_status == "partial"
    assert result[0].planned_tss == 100.0
    assert result[0].actual_tss == 50.0


def test_missed_when_no_actual() -> None:
    planned = [_plan("p1", date(2025, 6, 1), sport_type="Run", predicted_tss=100.0)]
    actuals: list[dict[str, object]] = []

    result = match_planned_actual(planned, actuals)

    assert len(result) == 1
    assert result[0].match_status == "missed"
    assert result[0].planned_event_id == "p1"
    assert result[0].actual_activity_id is None
    assert result[0].actual_tss is None


def test_extra_when_actual_no_plan() -> None:
    planned: list[dict[str, object]] = []
    actuals = [_actual("a1", date(2025, 6, 1), sport="Run", tss=80.0)]

    result = match_planned_actual(planned, actuals)

    assert len(result) == 1
    assert result[0].match_status == "extra"
    assert result[0].planned_event_id == ""
    assert result[0].actual_activity_id == "a1"
    assert result[0].actual_tss == 80.0


# --- Date tolerance tests ---


def test_date_matches_one_day_apart() -> None:
    planned = [_plan("p1", date(2025, 6, 1), sport_type="Run")]
    actuals = [_actual("a1", date(2025, 6, 2), sport="Run")]

    result = match_planned_actual(planned, actuals)

    assert len(result) == 1
    assert result[0].match_status == "completed"


def test_date_no_match_three_days_apart() -> None:
    planned = [_plan("p1", date(2025, 6, 1), sport_type="Run")]
    actuals = [_actual("a1", date(2025, 6, 4), sport="Run")]

    result = match_planned_actual(planned, actuals)

    assert result[0].match_status == "missed"
    assert result[1].match_status == "extra"


# --- Sport matching tests ---


def test_run_matches_virtualrun() -> None:
    planned = [_plan("p1", date(2025, 6, 1), sport_type="Run")]
    actuals = [_actual("a1", date(2025, 6, 1), sport="VirtualRun")]

    result = match_planned_actual(planned, actuals)

    assert len(result) == 1
    assert result[0].match_status == "completed"


def test_ride_matches_virtualride() -> None:
    planned = [_plan("p1", date(2025, 6, 1), sport_type="Ride")]
    actuals = [_actual("a1", date(2025, 6, 1), sport="VirtualRide")]

    result = match_planned_actual(planned, actuals)

    assert len(result) == 1
    assert result[0].match_status == "completed"


def test_unspecified_sport_matches_any() -> None:
    planned = [_plan("p1", date(2025, 6, 1), sport_type="")]
    actuals = [_actual("a1", date(2025, 6, 1), sport="Swim")]

    result = match_planned_actual(planned, actuals)

    assert len(result) == 1
    assert result[0].match_status == "completed"


# --- Edge case tests ---


def test_no_planned_events_empty_result() -> None:
    planned: list[dict[str, object]] = []
    actuals: list[dict[str, object]] = []

    result = match_planned_actual(planned, actuals)

    assert result == []


def test_all_actuals_no_plan_all_missed() -> None:
    planned = [
        _plan("p1", date(2025, 6, 1), sport_type="Run"),
        _plan("p2", date(2025, 6, 2), sport_type="Ride"),
    ]
    actuals: list[dict[str, object]] = []

    result = match_planned_actual(planned, actuals)

    assert len(result) == 2
    assert all(m.match_status == "missed" for m in result)


def test_datetime_input_converted_to_date() -> None:
    planned = [_plan("p1", datetime(2025, 6, 1, 8, 0), sport_type="Run")]
    actuals = [_actual("a1", datetime(2025, 6, 1, 9, 0), sport="Run")]

    result = match_planned_actual(planned, actuals)

    assert len(result) == 1
    assert result[0].match_status == "completed"
    assert result[0].planned_date == date(2025, 6, 1)


def test_string_date_input_parsed() -> None:
    planned = [_plan("p1", "2025-06-01T08:00:00", sport_type="Run")]
    actuals = [_actual("a1", "2025-06-01", sport="Run")]

    result = match_planned_actual(planned, actuals)

    assert len(result) == 1
    assert result[0].match_status == "completed"


def test_completed_without_tss_when_plan_tss_none() -> None:
    planned = [_plan("p1", date(2025, 6, 1), sport_type="Run", predicted_tss=None)]
    actuals = [_actual("a1", date(2025, 6, 1), sport="Run", tss=200.0)]

    result = match_planned_actual(planned, actuals)

    assert len(result) == 1
    assert result[0].match_status == "completed"


def test_completed_without_tss_when_plan_tss_zero() -> None:
    planned = [_plan("p1", date(2025, 6, 1), sport_type="Run", predicted_tss=0.0)]
    actuals = [_actual("a1", date(2025, 6, 1), sport="Run", tss=50.0)]

    result = match_planned_actual(planned, actuals)

    assert len(result) == 1
    assert result[0].match_status == "completed"


def test_mixed_scenario_planned_and_extra() -> None:
    planned = [
        _plan("p1", date(2025, 6, 1), sport_type="Run", predicted_tss=100.0),
        _plan("p2", date(2025, 6, 2), sport_type="Ride", predicted_tss=80.0),
    ]
    actuals = [
        _actual("a1", date(2025, 6, 1), sport="Run", tss=95.0),
        _actual("a2", date(2025, 6, 3), sport="Swim", tss=30.0),
    ]

    result = match_planned_actual(planned, actuals)

    assert len(result) == 3
    statuses = {m.planned_event_id: m.match_status for m in result}
    assert statuses["p1"] == "completed"
    assert statuses["p2"] == "missed"
    assert any(m.match_status == "extra" for m in result)


def test_activity_matched_only_once() -> None:
    planned = [
        _plan("p1", date(2025, 6, 1), sport_type="Run"),
        _plan("p2", date(2025, 6, 2), sport_type="Run"),
    ]
    actuals = [_actual("a1", date(2025, 6, 1), sport="Run")]

    result = match_planned_actual(planned, actuals)

    assert len(result) == 2
    assert result[0].match_status == "completed"
    assert result[1].match_status == "missed"


def test_custom_tolerance() -> None:
    planned = [_plan("p1", date(2025, 6, 1), sport_type="Run", predicted_tss=100.0)]
    actuals = [_actual("a1", date(2025, 6, 1), sport="Run", tss=60.0)]

    result_default = match_planned_actual(planned, actuals)
    assert result_default[0].match_status == "partial"

    result_wide = match_planned_actual(planned, actuals, tss_tolerance=0.5)
    assert result_wide[0].match_status == "completed"


def test_sport_type_none_in_plan() -> None:
    planned: list[dict[str, object]] = [
        {"event_id": "p1", "start_time": date(2025, 6, 1)}
    ]
    actuals = [_actual("a1", date(2025, 6, 1), sport="Run")]

    result = match_planned_actual(planned, actuals)

    assert len(result) == 1
    assert result[0].match_status == "completed"

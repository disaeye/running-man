"""Time-versioned threshold resolution rules.

These tests pin the three behaviours that make historical recomputation
trustworthy: a threshold resolves to the value in force on the activity date,
an unmeasured date resolves to ``None`` (not zero, and not a neighbouring
step's value), and a partially-populated step never masks an earlier value.
"""

from datetime import date

from domain.thresholds.resolver import (
    ThresholdStep,
    age_from_dob,
    resolve_all,
    resolve_threshold,
    steps_since,
)

JAN = date(2026, 1, 1)
JUN = date(2026, 6, 1)
DEC = date(2026, 12, 1)

HISTORY = [
    ThresholdStep(effective_from=JAN, lthr=168, threshold_pace=270.0),
    ThresholdStep(effective_from=JUN, lthr=175, hr_max=189),
    ThresholdStep(effective_from=DEC, lthr=182, threshold_pace=255.0),
]


def test_resolves_value_in_force_on_target_date() -> None:
    assert resolve_threshold(HISTORY, JAN, "lthr") == 168
    assert resolve_threshold(HISTORY, JUN, "lthr") == 175
    assert resolve_threshold(HISTORY, DEC, "lthr") == 182


def test_resolves_between_steps_to_the_earlier_step() -> None:
    # A date between two observations keeps the older value; the newer one was
    # not known yet.
    assert resolve_threshold(HISTORY, date(2026, 3, 15), "lthr") == 168
    assert resolve_threshold(HISTORY, date(2026, 9, 30), "lthr") == 175


def test_target_before_history_resolves_to_none() -> None:
    # Distinct from 0.0: the threshold simply was not known.
    assert resolve_threshold(HISTORY, date(2025, 12, 31), "lthr") is None


def test_future_steps_are_ignored() -> None:
    assert resolve_threshold(HISTORY, JUN, "threshold_pace") == 270.0


def test_missing_field_in_later_step_does_not_mask_earlier_value() -> None:
    # JUN has no threshold_pace and DEC is in the future, so the JAN pace holds.
    assert resolve_threshold(HISTORY, JUN, "threshold_pace") == 270.0
    # hr_max only ever appears at JUN.
    assert resolve_threshold(HISTORY, JAN, "hr_max") is None
    assert resolve_threshold(HISTORY, DEC, "hr_max") == 189


def test_none_target_returns_latest_value() -> None:
    assert resolve_threshold(HISTORY, None, "lthr") == 182
    assert resolve_threshold(HISTORY, None, "threshold_pace") == 255.0


def test_empty_history_resolves_to_none() -> None:
    assert resolve_threshold([], JUN, "lthr") is None


def test_unsorted_history_is_handled() -> None:
    shuffled = [HISTORY[2], HISTORY[0], HISTORY[1]]
    assert resolve_threshold(shuffled, date(2026, 9, 30), "lthr") == 175


def test_int_and_float_fields_keep_their_types() -> None:
    assert isinstance(resolve_threshold(HISTORY, DEC, "lthr"), int)
    assert isinstance(resolve_threshold(HISTORY, DEC, "threshold_pace"), float)


def test_resolve_all_returns_every_threshold() -> None:
    resolved = resolve_all(HISTORY, JUN)
    assert resolved == {
        "hr_max": 189,
        "resting_hr": None,
        "lthr": 175,
        "threshold_pace": 270.0,
    }


def test_steps_since_filters_and_sorts() -> None:
    assert [step.effective_from for step in steps_since(HISTORY, JUN)] == [JUN, DEC]
    assert steps_since(HISTORY, date(2027, 1, 1)) == []


def test_age_from_dob_counts_completed_years() -> None:
    dob = date(1994, 6, 15)
    assert age_from_dob(dob, date(2026, 6, 14)) == 31
    assert age_from_dob(dob, date(2026, 6, 15)) == 32
    assert age_from_dob(dob, date(2026, 6, 16)) == 32


def test_age_from_dob_handles_missing_or_invalid_dob() -> None:
    assert age_from_dob(None, JUN) is None
    assert age_from_dob(date(2030, 1, 1), JUN) is None

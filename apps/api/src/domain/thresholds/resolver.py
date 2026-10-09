"""Resolve time-versioned athlete thresholds for a point in time.

Thresholds (HRmax, resting HR, LTHR, threshold pace) change as an athlete
trains and re-tests. Training load is a historical fact: a session recorded in
July was executed at July's fitness, so recomputing it months later must not
re-measure it against a newer threshold. Every compute path therefore resolves
the value *in force on the activity's date* rather than reading "the current
one".

A threshold history is an ordered sequence of ``(effective_from, value)`` steps.
``resolve_threshold`` returns the value from the latest step at or before the
target date. Three behaviours matter and are pinned by tests:

* A target earlier than every step resolves to ``None`` — the value was not
  known yet, which is different from "zero".
* ``None`` values inside the history are *not* steps: they mean "not measured
  in this step", so they never mask an earlier known value. Callers therefore
  pass only the entries they actually have (see ``threshold_from_row``).
* A missing target date (``None``) means "give me the current value", i.e. the
  last step in the history.
"""

from __future__ import annotations

from collections.abc import Iterable, Mapping, Sequence
from dataclasses import dataclass
from datetime import date
from typing import Literal, TypeVar

ThresholdField = Literal["hr_max", "resting_hr", "lthr", "threshold_pace"]
FieldValue = TypeVar("FieldValue", int, float)


@dataclass(frozen=True)
class ThresholdStep:
    """One observation of an athlete threshold, in force from ``effective_from``."""

    effective_from: date
    hr_max: int | None = None
    resting_hr: int | None = None
    lthr: int | None = None
    threshold_pace: float | None = None


def threshold_from_row(row: Mapping[str, object]) -> ThresholdStep:
    """Build a :class:`ThresholdStep` from a database row.

    Columns absent from the row are treated as ``None`` so repository queries
    may select only the fields a caller needs.
    """
    return ThresholdStep(
        effective_from=_as_date(row["effective_from"]),
        hr_max=_as_int(row.get("hr_max")),
        resting_hr=_as_int(row.get("resting_hr")),
        lthr=_as_int(row.get("lthr")),
        threshold_pace=_as_float(row.get("threshold_pace")),
    )


def resolve_threshold(
    history: Sequence[ThresholdStep],
    target_date: date | None,
    field: ThresholdField,
) -> int | float | None:
    """Value of ``field`` in force on ``target_date`` (or the latest if ``None``).

    ``history`` need not be sorted. Steps where ``field`` is ``None`` are
    skipped rather than treated as "the value became unknown".
    """
    candidates = [
        (step.effective_from, value)
        for step in history
        if (value := getattr(step, field)) is not None
        and (target_date is None or step.effective_from <= target_date)
    ]
    if not candidates:
        return None
    return max(candidates, key=lambda entry: entry[0])[1]


def resolve_all(
    history: Sequence[ThresholdStep],
    target_date: date | None,
) -> dict[ThresholdField, int | float | None]:
    """Resolve every threshold at once — the shape compute paths consume."""
    return {
        "hr_max": resolve_threshold(history, target_date, "hr_max"),
        "resting_hr": resolve_threshold(history, target_date, "resting_hr"),
        "lthr": resolve_threshold(history, target_date, "lthr"),
        "threshold_pace": resolve_threshold(history, target_date, "threshold_pace"),
    }


def age_from_dob(dob: date | None, target_date: date) -> int | None:
    """Completed years of age on ``target_date``."""
    if dob is None:
        return None
    years = target_date.year - dob.year
    if (target_date.month, target_date.day) < (dob.month, dob.day):
        years -= 1
    return years if years >= 0 else None


def steps_since(
    history: Iterable[ThresholdStep], since: date
) -> list[ThresholdStep]:
    """Steps observed on or after ``since`` — used by history/audit views."""
    return sorted(
        (step for step in history if step.effective_from >= since),
        key=lambda step: step.effective_from,
    )


def _as_date(value: object) -> date:
    if isinstance(value, date):
        return value
    raise TypeError(f"effective_from must be a date, got {type(value).__name__}")


def _as_int(value: object) -> int | None:
    if value is None:
        return None
    if isinstance(value, bool):
        return None
    if isinstance(value, int):
        return value
    if isinstance(value, float):
        return int(value)
    return None


def _as_float(value: object) -> float | None:
    if value is None or isinstance(value, bool):
        return None
    if isinstance(value, int | float):
        return float(value)
    return None

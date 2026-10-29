"""Persisting the device's training-effect pair from a FIT session frame.

A watch that computes a training effect writes it into the FIT ``session``
message: ``total_training_effect`` (aerobic) and
``total_anaerobic_training_effect``. Both are on a 0–5 scale.

These are the device's own figures, so they are stored as source inputs with
the device named in ``aerobic_te_source``. A watch that does not write them
leaves both columns NULL, and the page then says "未记录" instead of showing a
number this system made up.

The FIT session frame is read by ``infrastructure.parsing.fit_parser``; the
values are extracted here so the parser stays a parser.
"""

from __future__ import annotations

from typing import Final

TE_MIN: Final = 0.0
TE_MAX: Final = 5.0

# 设备训练效益的来源标注：只有写这两个字段的设备才写得上这个名字。
FIT_SESSION_SOURCE: Final = "fit_session"


def training_effects_from_session(
    session: dict[str, object] | None,
) -> tuple[float | None, float | None]:
    """The aerobic and anaerobic training effects from a FIT session frame.

    Returns ``(None, None)`` when the frame carries no training effect, which
    is the normal case for a device that does not compute one.
    """
    if not session:
        return None, None
    aerobic = _bounded(session.get("total_training_effect"))
    anaerobic = _bounded(session.get("total_anaerobic_training_effect"))
    return aerobic, anaerobic


def _bounded(value: object) -> float | None:
    if not isinstance(value, int | float):
        return None
    number = float(value)
    if number < TE_MIN or number > TE_MAX:
        return None
    return number

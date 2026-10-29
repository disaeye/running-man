"""Running-dynamics metrics read off a stored activity stream.

The demo analysis page shows a six-cell biomechanics matrix: heart rate,
cadence, stride length, vertical oscillation, ground contact time and
left/right balance. Four of them come from the source payload or the FIT
stream; the two that only exist in a FIT ``record`` frame
(``vertical_oscillation`` and ``stance_time``) are aggregated here from
``activity_streams``.

Every function takes plain values and returns plain values: no database, no
framework. The aggregation rules are stated in the docstrings so a reader can
tell what a number means without tracing the call site.

Units follow ``contracts/v1/stream-metrics.yaml``:
vertical oscillation in cm, ground contact time in ms, stride length in m,
left/right balance as percent of left foot.
"""

from __future__ import annotations

from dataclasses import dataclass
from statistics import mean

__all__ = (
    "BiomechanicsSummary",
    "cadence_to_spm",
    "summarize_biomechanics",
)

# A running cadence below this value is per-foot (FIT records single-foot
# cadence in rpm), not the per-stride figure some watches report. The
# deployment's own data settles it: a walk records 59.7 rpm, which is
# impossible as steps-per-minute for walking but is exactly one half of a
# plausible 119 spm, so the stored number is per foot.
PER_FOOT_CADENCE_MAX_RPM = 130.0

# The FTW (full-time walking) rule: cadence above this is running, at or below
# is walking. Used only to decide whether a per-foot cadence may be doubled.
RUNNING_CADENCE_MIN_RPM = 120.0


@dataclass(frozen=True, slots=True)
class BiomechanicsSummary:
    """Aggregated running dynamics for one activity.

    A field is ``None`` when the device did not record that channel, which is
    the normal case for a watch without a running-dynamics sensor. The page
    shows "未记录" for those; it never substitutes a number.
    """

    avg_cadence_spm: float | None
    avg_stride_length_m: float | None
    avg_vertical_oscillation_cm: float | None
    avg_ground_contact_time_ms: float | None
    avg_lr_balance_pct: float | None
    sample_counts: dict[str, int]

    @property
    def has_any(self) -> bool:
        return any(
            value is not None
            for value in (
                self.avg_cadence_spm,
                self.avg_stride_length_m,
                self.avg_vertical_oscillation_cm,
                self.avg_ground_contact_time_ms,
                self.avg_lr_balance_pct,
            )
        )


def cadence_to_spm(cadence_rpm: float | None, *, is_running: bool) -> float | None:
    """Convert a stored cadence to steps per minute.

    The stored value is the device's own cadence field. For running it is
    single-foot revolutions per minute, so the display figure (strides per
    minute) is twice it. Walking keeps the raw value: doubling a walking
    cadence would report 120 spm for a slow walk.

    ``None`` in, ``None`` out: a missing cadence is not zero.
    """
    if cadence_rpm is None or cadence_rpm <= 0:
        return None
    if not is_running:
        return cadence_rpm
    if cadence_rpm <= PER_FOOT_CADENCE_MAX_RPM:
        return cadence_rpm * 2.0
    return cadence_rpm


def summarize_biomechanics(
    streams: dict[str, list[float]],
    *,
    is_running: bool,
    source_avg_cadence: float | None = None,
    source_avg_stride_length_m: float | None = None,
    source_avg_lr_balance_pct: float | None = None,
) -> BiomechanicsSummary:
    """Aggregate the biomechanics channels of one activity.

    ``streams`` maps a canonical metric name to its sample values. The
    source-provided aggregates (cadence, stride length, balance) win whenever
    they exist: the source already averaged them over the whole activity with
    its own weighting, and averaging the samples again would discard that.
    The stream is the fallback, and the only source for the two channels the
    source summary does not carry (vertical oscillation and ground contact
    time).

    A channel with no samples yields ``None``, never ``0``.
    """
    cadence_stream = streams.get("cadence") or []
    stride_stream = streams.get("stride_length") or []
    vertical_stream = streams.get("vertical_oscillation") or []
    contact_stream = streams.get("ground_contact_time") or []
    balance_stream = streams.get("left_right_balance") or []

    cadence = source_avg_cadence
    if cadence is None:
        cadence = _mean(cadence_stream)

    stride = source_avg_stride_length_m
    if stride is None:
        stride = _mean(stride_stream)

    balance = source_avg_lr_balance_pct
    if balance is None:
        balance = _mean(balance_stream)

    return BiomechanicsSummary(
        avg_cadence_spm=cadence_to_spm(cadence, is_running=is_running),
        avg_stride_length_m=stride,
        avg_vertical_oscillation_cm=_mean(vertical_stream),
        avg_ground_contact_time_ms=_mean(contact_stream),
        avg_lr_balance_pct=balance,
        sample_counts={
            "cadence": len(cadence_stream),
            "stride_length": len(stride_stream),
            "vertical_oscillation": len(vertical_stream),
            "ground_contact_time": len(contact_stream),
            "left_right_balance": len(balance_stream),
        },
    )


def _mean(values: list[float]) -> float | None:
    if not values:
        return None
    return mean(values)

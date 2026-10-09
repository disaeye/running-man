"""Zwift Workout File (ZWO) parsing, generation, and TSS prediction.

Power is stored as an FTP fraction in [0.0, 3.0]; durations are in seconds.
Format reference: https://github.com/h4l/zwift-workout-file-reference
"""

from dataclasses import dataclass
from math import pow
from typing import Final

from lxml import etree

from domain.load.tss import power_tss

WARMUP = "warmup"
STEADY_STATE = "steadystate"
INTERVALS = "intervals"
COOLDOWN = "cooldown"
FREE_RIDE = "free_ride"

_TAG_TO_TYPE: Final[dict[str, str]] = {
    "Warmup": WARMUP,
    "SteadyState": STEADY_STATE,
    "IntervalsT": INTERVALS,
    "Cooldown": COOLDOWN,
    "FreeRide": FREE_RIDE,
}
_TYPE_TO_TAG: Final[dict[str, str]] = {v: k for k, v in _TAG_TO_TYPE.items()}


@dataclass(frozen=True)
class WorkoutSegment:
    """One contiguous block. power_low/power_high are FTP fractions or None.

    STEADY_STATE: low == high. WARMUP/COOLDOWN: ramp endpoints (low = start,
    high = end). INTERVALS: low = recovery (off), high = work (on), duration
    spans one on+off cycle. FREE_RIDE: both None.
    """

    segment_type: str
    duration_s: int
    power_low: float | None
    power_high: float | None
    cadence: int | None


@dataclass(frozen=True)
class Workout:
    name: str
    sport_type: str  # "bike" | "run"
    segments: list[WorkoutSegment]


def _attr_float(elem: etree._Element, name: str) -> float | None:
    raw = elem.get(name)
    return float(raw) if raw is not None else None


def _attr_int(elem: etree._Element, name: str) -> int | None:
    raw = elem.get(name)
    return int(float(raw)) if raw is not None else None


def _fmt_power(value: float) -> str:
    """Render a power fraction without trailing zeros (0.50 -> "0.5")."""
    return f"{value:.4f}".rstrip("0").rstrip(".") or "0"


def _text_or(root: etree._Element, tag: str, default: str) -> str:
    el = root.find(tag)
    if el is not None and el.text and el.text.strip():
        return el.text.strip()
    return default


def _segments_from_element(elem: etree._Element) -> list[WorkoutSegment]:
    """Map one ZWO element to segments. IntervalsT expands per repeat."""
    seg_type = _TAG_TO_TYPE.get(elem.tag)
    if seg_type is None:
        return []
    cadence = _attr_int(elem, "Cadence")
    if seg_type == STEADY_STATE:
        power = _attr_float(elem, "Power")
        low = _attr_float(elem, "PowerLow")
        high = _attr_float(elem, "PowerHigh")
        if power is not None:
            low = high = power
        return [WorkoutSegment(STEADY_STATE, _attr_int(elem, "Duration") or 0, low, high, cadence)]
    if seg_type == INTERVALS:
        cycle = (_attr_int(elem, "OnDuration") or 0) + (_attr_int(elem, "OffDuration") or 0)
        repeat = _attr_int(elem, "Repeat") or 1
        seg = WorkoutSegment(
            INTERVALS, cycle, _attr_float(elem, "OffPower"), _attr_float(elem, "OnPower"), cadence
        )
        return [seg] * repeat
    if seg_type == FREE_RIDE:
        return [WorkoutSegment(FREE_RIDE, _attr_int(elem, "Duration") or 0, None, None, cadence)]
    return [
        WorkoutSegment(
            seg_type,
            _attr_int(elem, "Duration") or 0,
            _attr_float(elem, "PowerLow"),
            _attr_float(elem, "PowerHigh"),
            cadence,
        )
    ]


def parse_zwo(xml: str) -> Workout:
    """Parse a ZWO XML string into a Workout."""
    root = etree.fromstring(xml.encode("utf-8"))
    name = _text_or(root, "name", "")
    sport = _text_or(root, "sportType", "bike").lower() or "bike"
    segments: list[WorkoutSegment] = []
    workout_el = root.find("workout")
    if workout_el is not None:
        for child in workout_el:
            segments.extend(_segments_from_element(child))
    return Workout(name=name, sport_type=sport, segments=segments)


def _write_power_attrs(elem: etree._Element, seg: WorkoutSegment) -> None:
    if seg.cadence is not None:
        elem.set("Cadence", str(seg.cadence))
    if seg.segment_type == INTERVALS:
        on_duration = seg.duration_s // 2
        elem.set("OnDuration", str(on_duration))
        elem.set("OffDuration", str(seg.duration_s - on_duration))
        if seg.power_high is not None:
            elem.set("OnPower", _fmt_power(seg.power_high))
        if seg.power_low is not None:
            elem.set("OffPower", _fmt_power(seg.power_low))
    else:
        elem.set("Duration", str(seg.duration_s))
        if seg.segment_type == STEADY_STATE and seg.power_low is not None:
            elem.set("Power", _fmt_power(seg.power_low))
        elif seg.segment_type in (WARMUP, COOLDOWN):
            if seg.power_low is not None:
                elem.set("PowerLow", _fmt_power(seg.power_low))
            if seg.power_high is not None:
                elem.set("PowerHigh", _fmt_power(seg.power_high))


def generate_zwo(workout: Workout) -> str:
    """Serialize a Workout to a ZWO XML string.

    Consecutive identical INTERVALS segments fold into one
    <IntervalsT Repeat="N"> element for a faithful round-trip.
    """
    root = etree.Element("workout_file")
    etree.SubElement(root, "name").text = workout.name
    etree.SubElement(root, "sportType").text = workout.sport_type
    workout_el = etree.SubElement(root, "workout")
    idx = 0
    while idx < len(workout.segments):
        seg = workout.segments[idx]
        repeat = 1
        while (
            idx + repeat < len(workout.segments)
            and seg.segment_type == INTERVALS
            and workout.segments[idx + repeat] == seg
        ):
            repeat += 1
        elem = etree.Element(_TYPE_TO_TAG[seg.segment_type])
        _write_power_attrs(elem, seg)
        if seg.segment_type == INTERVALS:
            elem.set("Repeat", str(repeat))
        workout_el.append(elem)
        idx += repeat
    xml_bytes = etree.tostring(root, xml_declaration=True, encoding="UTF-8", pretty_print=True)
    return xml_bytes.decode("utf-8")


def _segment_np(seg: WorkoutSegment, ftp: float) -> float:
    """Estimated normalized power (watts) for one segment."""
    low = seg.power_low
    high = seg.power_high
    if low is None and high is None:
        return 0.0
    if seg.segment_type == INTERVALS and low is not None and high is not None:
        # Idealized NP for an equal-time on/off square wave: 4th-power mean.
        return pow((pow(high * ftp, 4) + pow(low * ftp, 4)) / 2, 0.25)
    if seg.segment_type in (WARMUP, COOLDOWN) and low is not None and high is not None:
        return (low + high) / 2 * ftp
    return (low or 0.0) * ftp


def predict_workout_tss(segments: list[WorkoutSegment], ftp: int) -> float:
    """Predict total TSS for a segment list given FTP (watts)."""
    ftp_f = float(ftp)
    total = 0.0
    for seg in segments:
        if seg.duration_s <= 0:
            continue
        np = _segment_np(seg, ftp_f)
        if np > 0:
            total += power_tss(duration_s=seg.duration_s, np=np, ftp=ftp_f)
    return total

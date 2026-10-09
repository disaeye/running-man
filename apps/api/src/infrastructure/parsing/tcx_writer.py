"""Inverse of :mod:`parsing.tcx_parser` — serialize ``FitSample`` list to TCX XML.

Emits a Garmin Training Center Database v2 document with a single Activity /
Lap / Track structure. Mirrors the field set read by ``parse_tcx``: Time,
Position (lat/lon), AltitudeMeters, DistanceMeters, HeartRateBpm, Cadence,
and TPX extensions (Speed, Watts).

LXML is used (already a project dependency) with explicit namespace prefixes
to match the schema and produce byte-for-byte stable output.
"""

from __future__ import annotations

from collections.abc import Sequence
from datetime import datetime

from lxml import etree

from infrastructure.parsing.models import FitSample

_TCX_NS = "http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2"
_TCX_EXT_NS = "http://www.garmin.com/xmlschemas/ActivityExtension/v2"
_TCX_SPORT_MAP = {
    "Ride": "Biking",
    "Bike": "Biking",
    "VirtualRide": "Biking",
    "Run": "Running",
    "VirtualRun": "Running",
    "TrailRun": "Running",
}


def write_tcx(samples: Sequence[FitSample], sport: str = "Run") -> bytes:
    """Serialize ``samples`` to a UTF-8 TCX byte string.

    Raises ``ValueError`` for an empty sample list — a TCX file with no
    trackpoints cannot represent an activity.
    """
    if not samples:
        raise ValueError("cannot write TCX file with zero samples")

    nsmap = {None: _TCX_NS, "xsi": "http://www.w3.org/2001/XMLSchema-instance"}
    root = etree.Element(f"{{{_TCX_NS}}}TrainingCenterDatabase", nsmap=nsmap)
    root.set(
        "{http://www.w3.org/2001/XMLSchema-instance}schemaLocation",
        f"{_TCX_NS} http://www.garmin.com/xmlschemas/TrainingCenterDatabasev2.xsd",
    )

    activities = etree.SubElement(root, f"{{{_TCX_NS}}}Activities")
    activity = etree.SubElement(activities, f"{{{_TCX_NS}}}Activity")
    activity.set("Sport", _TCX_SPORT_MAP.get(sport, "Other"))

    start = samples[0].timestamp
    lap = etree.SubElement(activity, f"{{{_TCX_NS}}}Lap")
    lap.set("StartTime", _iso(start))
    _sub_text(lap, "TotalTimeSeconds", str(_total_seconds(samples)))
    distances = [s.distance for s in samples if s.distance is not None]
    _sub_text(lap, "DistanceMeters", str(max(distances) if distances else 0.0))
    _sub_text(lap, "Intensity", "Active")
    _sub_text(lap, "TriggerMethod", "Manual")

    track = etree.SubElement(lap, f"{{{_TCX_NS}}}Track")
    for sample in samples:
        _add_trackpoint(track, sample)

    body = etree.tostring(root, xml_declaration=True, encoding="UTF-8")
    return body


def _add_trackpoint(parent: etree._Element, sample: FitSample) -> None:
    tp = etree.SubElement(parent, f"{{{_TCX_NS}}}Trackpoint")
    _sub_text(tp, "Time", _iso(sample.timestamp))

    if sample.lat is not None and sample.lon is not None:
        pos = etree.SubElement(tp, f"{{{_TCX_NS}}}Position")
        _sub_text(pos, "LatitudeDegrees", _fmt_float(sample.lat))
        _sub_text(pos, "LongitudeDegrees", _fmt_float(sample.lon))

    if sample.altitude is not None:
        _sub_text(tp, "AltitudeMeters", _fmt_float(sample.altitude))
    if sample.distance is not None:
        _sub_text(tp, "DistanceMeters", _fmt_float(sample.distance))

    if sample.heart_rate is not None:
        hr = etree.SubElement(tp, f"{{{_TCX_NS}}}HeartRateBpm")
        _sub_text(hr, "Value", str(int(sample.heart_rate)))

    if sample.cadence is not None:
        _sub_text(tp, "Cadence", str(int(sample.cadence)))

    if sample.speed is not None or sample.power is not None:
        ext = etree.SubElement(tp, f"{{{_TCX_NS}}}Extensions")
        tpx = etree.SubElement(ext, f"{{{_TCX_EXT_NS}}}TPX")
        if sample.speed is not None:
            _sub_text(tpx, "Speed", _fmt_float(sample.speed), _TCX_EXT_NS)
        if sample.power is not None:
            _sub_text(tpx, "Watts", str(int(sample.power)), _TCX_EXT_NS)


def _sub_text(parent: etree._Element, tag: str, value: str, namespace: str = _TCX_NS) -> None:
    child = etree.SubElement(parent, f"{{{namespace}}}{tag}")
    child.text = value


def _iso(ts: datetime) -> str:
    if ts.tzinfo is None:
        return ts.replace().isoformat()
    return ts.isoformat()


def _fmt_float(value: float) -> str:
    # %g gives compact, round-trippable representation without trailing zeros.
    return f"{value:.7f}"


def _total_seconds(samples: Sequence[FitSample]) -> int:
    start = samples[0].timestamp
    end = samples[-1].timestamp
    return max(0, int((end - start).total_seconds()))

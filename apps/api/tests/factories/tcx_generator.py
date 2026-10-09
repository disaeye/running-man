"""Synthetic TCX (Training Center XML) generator.

Produces valid TCX v2 XML with Trackpoint, Position, HeartRateBpm, Cadence,
and TPX/Watts extensions.
"""

import datetime
from typing import Optional
from xml.etree.ElementTree import Element, SubElement, tostring

_TCX_NS = "http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2"
_TCX_EXT_NS = "http://www.garmin.com/xmlschemas/ActivityExtension/v2"


def _make_qtag(local: str) -> str:
    return f"{{{_TCX_NS}}}{local}"


def _make_ext_qtag(local: str) -> str:
    return f"{{{_TCX_EXT_NS}}}{local}"


def generate_tcx_bytes(
    duration_seconds: int = 3600,
    hr: int = 150,
    power: int = 200,
    lat: float = 25.06,
    lon: float = 121.63,
    cadence: int = 85,
    *,
    sport: str = "Biking",
) -> bytes:
    """Return a UTF-8-encoded TCX string for a single-lap activity."""
    root = Element(f"{{{_TCX_NS}}}TrainingCenterDatabase", attrib={"xmlns": _TCX_NS})
    # Extension namespace declaration
    root.set("xmlns:xsi", "http://www.w3.org/2001/XMLSchema-instance")
    root.set(
        "xsi:schemaLocation",
        "http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2 "
        "http://www.garmin.com/xmlschemas/TrainingCenterDatabasev2.xsd",
    )

    activities = SubElement(root, _make_qtag("Activities"))
    # Insert namespace for extensions in the Activities element
    activities.set("xmlns", _TCX_NS)

    activity = SubElement(activities, _make_qtag("Activity"))
    activity.set("Sport", sport)

    start_time = datetime.datetime(2026, 6, 16, 10, 0, 0, tzinfo=datetime.timezone.utc)

    # A single lap covering the whole activity
    lap = SubElement(activity, _make_qtag("Lap"))
    lap.set("StartTime", start_time.isoformat())
    _add_field(lap, "TotalTimeSeconds", str(duration_seconds))
    _add_field(lap, "DistanceMeters", str(duration_seconds * 10))
    _add_field(lap, "MaximumSpeed", "10.0")
    _add_field(lap, "Calories", "500")
    _add_field(lap, "Intensity", "Active")
    _add_field(lap, "TriggerMethod", "Manual")

    # Track
    track = SubElement(lap, _make_qtag("Track"))

    for i in range(duration_seconds):
        tp = SubElement(track, _make_qtag("Trackpoint"))
        t = start_time + datetime.timedelta(seconds=i)
        _add_field(tp, "Time", t.isoformat())

        pos = SubElement(tp, _make_qtag("Position"))
        _add_field(pos, "LatitudeDegrees", f"{lat:.7f}")
        _add_field(pos, "LongitudeDegrees", f"{lon:.7f}")

        _add_field(tp, "AltitudeMeters", "100.0")
        _add_field(tp, "DistanceMeters", str(i * 10))

        hr_elem = SubElement(tp, _make_qtag("HeartRateBpm"))
        _add_field(hr_elem, "Value", str(hr))

        _add_field(tp, "Cadence", str(cadence))

        ext = SubElement(tp, _make_qtag("Extensions"))
        tpx = SubElement(ext, _make_ext_qtag("TPX"))
        _add_field(tpx, "Watts", str(power), namespace=_TCX_EXT_NS)

    return b'<?xml version="1.0" encoding="UTF-8"?>\n' + tostring(root, encoding="UTF-8")


def _add_field(
    parent: Element,
    tag: str,
    value: str,
    namespace: Optional[str] = None,
) -> None:
    ns = namespace or _TCX_NS
    e = SubElement(parent, f"{{{ns}}}{tag}")
    e.text = value

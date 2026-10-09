"""Synthetic GPX generator (v1.1).

Produces a valid GPX document with trkpt, Position, HeartRateBcm (via
extensions), and power/cadence in the GPX 1.1 namespace.
"""

import datetime
from xml.etree.ElementTree import Element, SubElement, tostring

_GPX_NS = "http://www.topografix.com/GPX/1/1"
_GPX_EXT_NS = "http://www.garmin.com/xmlschemas/TrackPointExtension/v1"


def _q(tag: str, ns: str = _GPX_NS) -> str:
    return f"{{{ns}}}{tag}"


def generate_gpx_bytes(
    duration_seconds: int = 3600,
    hr: int = 150,
    power: int = 200,
    lat: float = 25.06,
    lon: float = 121.63,
    cadence: int = 85,
) -> bytes:
    """Return a UTF-8-encoded GPX v1.1 string with a single track."""
    root = Element(
        _q("gpx"),
        attrib={
            "version": "1.1",
            "creator": "running-man-test",
            "xmlns": _GPX_NS,
        },
    )
    root.set("xmlns:xsi", "http://www.w3.org/2001/XMLSchema-instance")
    root.set(
        "xsi:schemaLocation",
        "http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd",
    )

    metadata = SubElement(root, _q("metadata"))
    start_time = datetime.datetime(2026, 6, 16, 10, 0, 0, tzinfo=datetime.timezone.utc)
    _add(metadata, "time", start_time.isoformat())

    trk = SubElement(root, _q("trk"))
    _add(trk, "name", "Synthetic Test Activity")
    trkseg = SubElement(trk, _q("trkseg"))

    for i in range(duration_seconds):
        t = start_time + datetime.timedelta(seconds=i)
        pt = SubElement(trkseg, _q("trkpt"))
        pt.set("lat", f"{lat:.7f}")
        pt.set("lon", f"{lon:.7f}")

        _add(pt, "ele", "100.0")
        _add(pt, "time", t.isoformat())

        ext = SubElement(pt, _q("extensions"))
        hr_elem = SubElement(ext, _q("TrackPointExtension", _GPX_EXT_NS))
        _add(hr_elem, "hr", str(hr), _GPX_EXT_NS)
        _add(hr_elem, "cad", str(cadence), _GPX_EXT_NS)
        _add(hr_elem, "power", str(power), _GPX_EXT_NS)

    return b'<?xml version="1.0" encoding="UTF-8"?>\n' + tostring(root, encoding="UTF-8")


def _add(parent: Element, tag: str, text: str, ns: str = _GPX_NS) -> Element:
    e = SubElement(parent, _q(tag, ns))
    e.text = text
    return e

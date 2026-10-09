from __future__ import annotations

from datetime import datetime
from io import BytesIO
from typing import IO, Any

from lxml import etree

from infrastructure.parsing.models import FitSample

_TCX_NS = "http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2"
_TCX_EXT_NS = "http://www.garmin.com/xmlschemas/ActivityExtension/v2"


def _q(local: str) -> str:
    return f"{{{_TCX_NS}}}{local}"


def _ext_q(local: str) -> str:
    return f"{{{_TCX_EXT_NS}}}{local}"


def parse_tcx(source: str | bytes | IO[Any]) -> list[FitSample]:
    samples: list[FitSample] = []

    if isinstance(source, bytes):
        source = BytesIO(source)
    context = etree.iterparse(source, tag=_q("Trackpoint"), events=("end",))

    for _, tp_elem in context:
        sample = _extract_trackpoint(tp_elem)
        samples.append(sample)

        # Free memory — this subtree will never be visited again.
        tp_elem.clear()
        while tp_elem.getprevious() is not None:
            del tp_elem.getparent()[0]

    return samples


def _extract_trackpoint(tp: etree._Element) -> FitSample:
    ts_text = tp.findtext(_q("Time"))
    timestamp = datetime.fromisoformat(ts_text) if ts_text else datetime.min

    lat: float | None = None
    lon: float | None = None
    pos = tp.find(_q("Position"))
    if pos is not None:
        lat_text = pos.findtext(_q("LatitudeDegrees"))
        lon_text = pos.findtext(_q("LongitudeDegrees"))
        lat = float(lat_text) if lat_text else None
        lon = float(lon_text) if lon_text else None

    alt_text = tp.findtext(_q("AltitudeMeters"))
    altitude = float(alt_text) if alt_text else None

    dist_text = tp.findtext(_q("DistanceMeters"))
    distance = float(dist_text) if dist_text else None

    hr: int | None = None
    hr_bpm = tp.find(_q("HeartRateBpm"))
    if hr_bpm is not None:
        hr_text = hr_bpm.findtext(_q("Value"))
        hr = int(hr_text) if hr_text else None

    cad_text = tp.findtext(_q("Cadence"))
    cadence = int(cad_text) if cad_text else None

    # Extensions/TPX — Speed & Watts
    speed: float | None = None
    power: int | None = None
    ext_elem = tp.find(_q("Extensions"))
    if ext_elem is not None:
        tpx = ext_elem.find(_ext_q("TPX"))
        if tpx is not None:
            sp_text = tpx.findtext(_ext_q("Speed"))
            speed = float(sp_text) if sp_text else None
            pw_text = tpx.findtext(_ext_q("Watts"))
            power = int(pw_text) if pw_text else None

    return FitSample(
        timestamp=timestamp,
        lat=lat,
        lon=lon,
        altitude=altitude,
        distance=distance,
        heart_rate=hr,
        cadence=cadence,
        speed=speed,
        power=power,
    )

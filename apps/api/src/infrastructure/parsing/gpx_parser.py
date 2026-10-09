from __future__ import annotations

from datetime import datetime
from io import BytesIO
from typing import IO, Any

from lxml import etree

from infrastructure.parsing.models import FitSample

_GPX_NS = "http://www.topografix.com/GPX/1/1"
_EXT_NS = "http://www.garmin.com/xmlschemas/TrackPointExtension/v1"


def _q(local: str) -> str:
    return f"{{{_GPX_NS}}}{local}"


def _ext_q(local: str) -> str:
    return f"{{{_EXT_NS}}}{local}"


def parse_gpx(source: str | bytes | IO[Any]) -> list[FitSample]:
    samples: list[FitSample] = []

    if isinstance(source, bytes):
        source = BytesIO(source)
    context = etree.iterparse(source, tag=_q("trkpt"), events=("end",))

    for _, pt_elem in context:
        sample = _extract_trkpt(pt_elem)
        samples.append(sample)

        pt_elem.clear()
        while pt_elem.getprevious() is not None:
            del pt_elem.getparent()[0]

    return samples


def _extract_trkpt(pt: etree._Element) -> FitSample:
    lat = float(pt.get("lat"))
    lon = float(pt.get("lon"))

    ele_text = pt.findtext(_q("ele"))
    altitude = float(ele_text) if ele_text else None

    time_text = pt.findtext(_q("time"))
    timestamp = datetime.fromisoformat(time_text) if time_text else datetime.min

    hr: int | None = None
    cadence: int | None = None
    power: int | None = None

    ext_elem = pt.find(_q("extensions"))
    if ext_elem is not None:
        tpx = ext_elem.find(_ext_q("TrackPointExtension"))
        if tpx is not None:
            hr_text = tpx.findtext(_ext_q("hr"))
            hr = int(hr_text) if hr_text else None

            cad_text = tpx.findtext(_ext_q("cad"))
            cadence = int(cad_text) if cad_text else None

            pw_text = tpx.findtext(_ext_q("power"))
            power = int(pw_text) if pw_text else None

    return FitSample(
        timestamp=timestamp,
        lat=lat,
        lon=lon,
        altitude=altitude,
        heart_rate=hr,
        cadence=cadence,
        power=power,
    )

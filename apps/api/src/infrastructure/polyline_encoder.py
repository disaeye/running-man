"""Google Encoded Polyline Algorithm encoder.

Pure-Python encoder symmetric with the frontend decoder at
`apps/web/lib/decode-polyline.ts`.  Uses precision=5 and the standard
varint + zigzag encoding described at:
https://developers.google.com/maps/documentation/utilities/polylinealgorithm
"""

from __future__ import annotations

import logging
from collections.abc import Mapping

_logger = logging.getLogger(__name__)

_DEFAULT_PRECISION = 5
_MAX_POINTS_BEFORE_DOWNSAMPLE = 1000
_DOWNSAMPLE_TARGET = 500
_MIN_LATLNG_ENTRY_LEN = 2
_VARINT_CHUNK_MASK = 0x1F
_VARINT_CONTINUATION_BIT = 0x20
_CHAR_OFFSET = 63


def encode_polyline(
    points: list[tuple[float, float]],
    precision: int = _DEFAULT_PRECISION,
) -> str:
    """Encode a list of (lat, lon) pairs to a Google polyline string.

    Returns ``""`` for an empty point list.
    """
    if not points:
        return ""

    factor: int = 10**precision
    downsampled = _downsample(points)
    chars: list[str] = []
    prev_lat = 0
    prev_lon = 0

    for lat, lon in downsampled:
        dlat = round(lat * factor) - prev_lat
        dlon = round(lon * factor) - prev_lon
        prev_lat += dlat
        prev_lon += dlon
        chars.append(_encode_signed(dlat))
        chars.append(_encode_signed(dlon))

    return "".join(chars)


def extract_gps_from_raw(raw: Mapping[str, object]) -> list[tuple[float, float]] | None:
    """Attempt to extract GPS coordinate pairs from an Intervals.icu-style
    activity ``raw_data`` dictionary.

    Handles two formats:
    1.  Stream format — ``latlng`` key holds a list of ``[lat, lon]`` arrays.
    2.  Legacy format — ``latitude`` / ``longitude`` keys hold parallel arrays
        of equal length.

    Returns ``None`` when no usable coordinate data is found.
    """
    latlng = raw.get("latlng")
    if isinstance(latlng, list) and latlng:
        return _parse_latlng_list(latlng)

    lats = raw.get("latitude")
    lons = raw.get("longitude")
    if isinstance(lats, list) and isinstance(lons, list) and lats and len(lats) == len(lons):
        pairs: list[tuple[float, float]] = []
        for lat, lon in zip(lats, lons, strict=False):
            try:
                pairs.append((float(lat), float(lon)))
            except (TypeError, ValueError):
                return None
        return pairs if pairs else None

    return None


# ------------------------------------------------------------------ helpers


def _downsample(points: list[tuple[float, float]]) -> list[tuple[float, float]]:
    if len(points) <= _MAX_POINTS_BEFORE_DOWNSAMPLE:
        return points
    step = max(1, len(points) // _DOWNSAMPLE_TARGET)
    return points[::step]


def _parse_latlng_list(
    latlng: list[object],
) -> list[tuple[float, float]] | None:
    pairs: list[tuple[float, float]] = []
    for entry in latlng:
        if not isinstance(entry, list | tuple) or len(entry) < _MIN_LATLNG_ENTRY_LEN:
            return None
        try:
            pairs.append((float(entry[0]), float(entry[1])))
        except (TypeError, ValueError):
            return None
    return pairs if pairs else None


def _encode_signed(value: int) -> str:
    unsigned = _zigzag_encode(value)
    return _encode_varint(unsigned)


def _zigzag_encode(value: int) -> int:
    """Map a signed integer to an unsigned zigzag-encoded value.

    The decoder reverses this with ``(val >> 1) ^ -(val & 1)``.
    """
    if value >= 0:
        return value << 1
    # For negative values: ((abs(v) - 1) * 2) + 1
    return ((-value - 1) << 1) | 1


def _encode_varint(value: int) -> str:
    """Encode an unsigned integer as a varint string of 5-bit chunks.

    Each 5-bit chunk becomes a character (byte + 63).  The continuation
    bit (0x20) is set on every chunk except the last.
    """
    chars: list[str] = []
    while value > _VARINT_CHUNK_MASK:  # more than 5 bits remain
        chars.append(chr(((value & _VARINT_CHUNK_MASK) | _VARINT_CONTINUATION_BIT) + _CHAR_OFFSET))
        value >>= 5
    chars.append(chr((value & _VARINT_CHUNK_MASK) + _CHAR_OFFSET))
    return "".join(chars)

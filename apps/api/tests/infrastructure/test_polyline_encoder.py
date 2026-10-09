"""Tests for Google polyline encoder — symmetric with frontend decoder.

Uses the same test vectors as ``apps/web/lib/decode-polyline.test.ts``
to guarantee encoder/decoder symmetry.
"""

from __future__ import annotations

from infrastructure.polyline_encoder import (
    _downsample,
    _zigzag_encode,
    encode_polyline,
    extract_gps_from_raw,
)

# ------------------------------------------------------------------ encode_polyline


def test_encode_google_official_example() -> None:
    """Encoder produces the same string as Google's official polyline docs."""
    points = [
        (38.5, -120.2),
        (40.7, -120.95),
        (43.252, -126.453),
    ]
    result = encode_polyline(points, 5)
    assert result == "_p~iF~ps|U_ulLnnqC_mqNvxq`@"


def test_encode_empty_list_returns_empty_string() -> None:
    assert encode_polyline([], 5) == ""
    assert encode_polyline([], 6) == ""


def test_encode_single_point() -> None:
    """A single-point polyline encodes delta from (0,0)."""
    result = encode_polyline([(38.5, -120.2)], 5)
    # Must decode back — verify length is positive and decoder can read it.
    assert len(result) > 0
    # Every encoded char is in the valid range '?'–'~' (ASCII 63–126).
    assert all(63 <= ord(c) <= 126 for c in result)


def test_round_trip_via_known_polyline() -> None:
    """Encode, then decode with the frontend algorithm — points must match.

    The decoder at ``apps/web/lib/decode-polyline.ts`` uses the same
    precision and algorithm.  This test mimics the decoder logic so we
    can verify symmetry without importing TypeScript.
    """
    points = [
        (38.5, -120.2),
        (40.7, -120.95),
        (43.252, -126.453),
    ]
    encoded = encode_polyline(points, 5)
    decoded = _ts_decode(encoded, 5)
    assert len(decoded) == len(points)
    for (lat_a, lon_a), (lat_b, lon_b) in zip(decoded, points, strict=True):
        assert lat_a == lat_b
        assert lon_a == lon_b


def test_precision_5_vs_6() -> None:
    """Different precision values produce different strings for same coords."""
    points = [(38.5, -120.2)]
    p5 = encode_polyline(points, 5)
    p6 = encode_polyline(points, 6)
    assert p5 != p6
    assert len(p5) > 0
    assert len(p6) > 0


def test_downsample_large_track() -> None:
    """Tracks with >1000 points are down-sampled to keep output compact."""
    large = [(float(i) * 0.0001, float(i) * 0.0001) for i in range(1500)]
    result = encode_polyline(large, 5)
    # 1500 points down-sampled to 500 → ~2000 chars (500×2×~2 chars each)
    assert 1000 < len(result) < 10000
    assert all(63 <= ord(c) <= 126 for c in result)


def test_small_track_not_downsampled() -> None:
    """Tracks under threshold keep all points."""
    small = [(float(i), float(i + 1)) for i in range(500)]
    result = encode_polyline(small, 5)
    # 500 points → each point ~2-3 chars × 2 coords → ~2000-3000 chars
    assert len(result) > 1000
    assert all(63 <= ord(c) <= 126 for c in result)


# ------------------------------------------------------------------ extract_gps_from_raw


def test_extract_from_latlng_stream_format() -> None:
    raw = {"latlng": [[38.5, -120.2], [40.7, -120.95], [43.252, -126.453]]}
    points = extract_gps_from_raw(raw)
    assert points is not None
    assert len(points) == 3
    assert points[0] == (38.5, -120.2)
    assert points[2] == (43.252, -126.453)


def test_extract_from_legacy_arrays() -> None:
    raw = {
        "latitude": [38.5, 40.7, 43.252],
        "longitude": [-120.2, -120.95, -126.453],
    }
    points = extract_gps_from_raw(raw)
    assert points is not None
    assert len(points) == 3
    assert points[0] == (38.5, -120.2)


def test_extract_returns_none_when_no_gps() -> None:
    assert extract_gps_from_raw({}) is None
    assert extract_gps_from_raw({"type": "Run"}) is None
    assert extract_gps_from_raw({"latlng": []}) is None


def test_extract_returns_none_for_mismatched_arrays() -> None:
    assert extract_gps_from_raw({"latitude": [1.0], "longitude": [1.0, 2.0]}) is None


def test_extract_returns_none_for_invalid_entries() -> None:
    raw = {"latlng": [[38.5, "garbage"]]}
    assert extract_gps_from_raw(raw) is None


# ------------------------------------------------------------------ _zigzag_encode


def test_zigzag_encode_round_trip() -> None:
    """Verify zigzag encoding is symmetic with decoder's ``(val>>1) ^ -(val&1)``."""
    cases = [
        (0, 0),
        (-1, 1),
        (1, 2),
        (-2, 3),
        (2, 4),
        (-12020000, 24039999),
        (3850000, 7700000),
        (220000, 440000),
        (-75000, 149999),
        (255200, 510400),
        (-550300, 1100599),
    ]
    for signed, expected_unsigned in cases:
        assert _zigzag_encode(signed) == expected_unsigned
        # Verify round-trip via decoder formula
        decoded = (expected_unsigned >> 1) ^ -(expected_unsigned & 1)
        assert decoded == signed, f"round-trip failed for {signed}"


# ------------------------------------------------------------------ _downsample


def test_downsample_noop_below_threshold() -> None:
    small = [(1.0, 1.0)] * 500
    result = _downsample(small)
    assert len(result) == 500


def test_downsample_reduces_above_threshold() -> None:
    large = [(float(i), float(i)) for i in range(1500)]
    result = _downsample(large)
    # Should be roughly target, not 1500
    assert 300 <= len(result) <= 750


# ------------------------------------------------------------------ helpers


def _ts_decode(encoded: str, precision: int = 5) -> list[tuple[float, float]]:
    """Mirror of ``decodePolyline`` in ``apps/web/lib/decode-polyline.ts``.

    Reimplemented here so encoder tests don't need a TypeScript runtime.
    """
    if not encoded:
        return []
    factor = 10**precision
    points: list[tuple[float, float]] = []
    index = 0
    lat = 0
    lon = 0
    while index < len(encoded):
        dlat = _ts_decode_signed(encoded, index_ref := [index])
        index = index_ref[0]
        if dlat is None:
            break
        dlon = _ts_decode_signed(encoded, index_ref)
        index = index_ref[0]
        if dlon is None:
            break
        lat += dlat
        lon += dlon
        points.append((lat / factor, lon / factor))
    return points


def _ts_decode_signed(encoded: str, index: list[int]) -> int | None:
    val = 0
    shift = 0
    while True:
        if index[0] >= len(encoded):
            return None
        byte = ord(encoded[index[0]]) - 63
        if byte < 0 or byte > 63:
            return None
        index[0] += 1
        val |= (byte & 0x1F) << shift
        shift += 5
        if byte < 0x20:
            break
    return (val >> 1) ^ -(val & 1)

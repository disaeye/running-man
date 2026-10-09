"""Tests for TCX parser using the synthetic TCX generator."""

from datetime import datetime, timezone

from infrastructure.parsing.tcx_parser import parse_tcx
from tests.factories.tcx_generator import generate_tcx_bytes


def test_parse_tcx_returns_all_trackpoints() -> None:
    """Should produce one sample per second for a short activity."""
    xml = generate_tcx_bytes(duration_seconds=3)
    samples = parse_tcx(xml)
    assert len(samples) == 3


def test_parse_tcx_timestamp() -> None:
    """First sample should have the expected start time."""
    xml = generate_tcx_bytes(duration_seconds=1)
    samples = parse_tcx(xml)
    expected = datetime(2026, 6, 16, 10, 0, 0, tzinfo=timezone.utc)
    assert samples[0].timestamp == expected


def test_parse_tcx_timestamps_increment() -> None:
    """Each subsequent sample should be +1 second."""
    xml = generate_tcx_bytes(duration_seconds=3)
    samples = parse_tcx(xml)
    for i, s in enumerate(samples):
        expected = datetime(2026, 6, 16, 10, 0, i, tzinfo=timezone.utc)
        assert s.timestamp == expected, f"sample[{i}] mismatch"


def test_parse_tcx_position() -> None:
    """Latitude and longitude should match generator params."""
    xml = generate_tcx_bytes(duration_seconds=1, lat=25.06, lon=121.63)
    samples = parse_tcx(xml)
    assert samples[0].lat == 25.06
    assert samples[0].lon == 121.63


def test_parse_tcx_altitude() -> None:
    """AltitudeMeters should be parsed as float."""
    xml = generate_tcx_bytes(duration_seconds=1)
    samples = parse_tcx(xml)
    assert samples[0].altitude == 100.0


def test_parse_tcx_distance() -> None:
    """DistanceMeters should be parsed per sample."""
    xml = generate_tcx_bytes(duration_seconds=2)
    samples = parse_tcx(xml)
    # Generator: DistanceMeters = i * 10
    assert samples[0].distance == 0.0  # first sample i=0
    assert samples[1].distance == 10.0  # second sample i=1


def test_parse_tcx_heart_rate() -> None:
    """HeartRateBpm/Value should be extracted."""
    xml = generate_tcx_bytes(duration_seconds=1, hr=155)
    samples = parse_tcx(xml)
    assert samples[0].heart_rate == 155


def test_parse_tcx_cadence() -> None:
    """Cadence should be extracted."""
    xml = generate_tcx_bytes(duration_seconds=1, cadence=90)
    samples = parse_tcx(xml)
    assert samples[0].cadence == 90


def test_parse_tcx_power() -> None:
    """TPX/Watts should be extracted from extensions."""
    xml = generate_tcx_bytes(duration_seconds=1, power=250)
    samples = parse_tcx(xml)
    assert samples[0].power == 250


def test_parse_tcx_empty_track() -> None:
    """Zero-duration activity produces no samples."""
    xml = generate_tcx_bytes(duration_seconds=0)
    samples = parse_tcx(xml)
    assert samples == []


def test_parse_tcx_all_fields_present() -> None:
    """Verify every field is populated when all generator args are set."""
    xml = generate_tcx_bytes(
        duration_seconds=1,
        hr=140,
        power=200,
        lat=48.8566,
        lon=2.3522,
        cadence=80,
    )
    s = parse_tcx(xml)[0]
    assert s.timestamp is not None
    assert s.lat == 48.8566
    assert s.lon == 2.3522
    assert s.altitude == 100.0
    assert s.distance == 0.0  # first sample
    assert s.heart_rate == 140
    assert s.cadence == 80
    assert s.power == 200

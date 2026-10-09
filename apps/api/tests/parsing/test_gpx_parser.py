"""Tests for GPX parser using the synthetic GPX generator."""

from datetime import datetime, timezone

from infrastructure.parsing.gpx_parser import parse_gpx
from tests.factories.gpx_generator import generate_gpx_bytes


def test_parse_gpx_returns_all_trackpoints() -> None:
    """Should produce one sample per second."""
    xml = generate_gpx_bytes(duration_seconds=3)
    samples = parse_gpx(xml)
    assert len(samples) == 3


def test_parse_gpx_timestamp() -> None:
    """First sample timestamp should match expected start time."""
    xml = generate_gpx_bytes(duration_seconds=1)
    samples = parse_gpx(xml)
    expected = datetime(2026, 6, 16, 10, 0, 0, tzinfo=timezone.utc)
    assert samples[0].timestamp == expected


def test_parse_gpx_timestamps_increment() -> None:
    """Each sample should be +1 second."""
    xml = generate_gpx_bytes(duration_seconds=3)
    samples = parse_gpx(xml)
    for i, s in enumerate(samples):
        expected = datetime(2026, 6, 16, 10, 0, i, tzinfo=timezone.utc)
        assert s.timestamp == expected, f"sample[{i}] mismatch"


def test_parse_gpx_lat_lon() -> None:
    """Latitude and longitude from trkpt attributes."""
    xml = generate_gpx_bytes(duration_seconds=1, lat=48.8566, lon=2.3522)
    samples = parse_gpx(xml)
    assert samples[0].lat == 48.8566
    assert samples[0].lon == 2.3522


def test_parse_gpx_altitude() -> None:
    """ele element should be parsed as float."""
    xml = generate_gpx_bytes(duration_seconds=1)
    samples = parse_gpx(xml)
    assert samples[0].altitude == 100.0


def test_parse_gpx_heart_rate() -> None:
    """gpxtpx:hr inside track-point extension."""
    xml = generate_gpx_bytes(duration_seconds=1, hr=155)
    samples = parse_gpx(xml)
    assert samples[0].heart_rate == 155


def test_parse_gpx_cadence() -> None:
    """gpxtpx:cad inside track-point extension."""
    xml = generate_gpx_bytes(duration_seconds=1, cadence=90)
    samples = parse_gpx(xml)
    assert samples[0].cadence == 90


def test_parse_gpx_power() -> None:
    """gpxtpx:power inside track-point extension."""
    xml = generate_gpx_bytes(duration_seconds=1, power=250)
    samples = parse_gpx(xml)
    assert samples[0].power == 250


def test_parse_gpx_empty_track() -> None:
    """Zero-length track produces no samples."""
    xml = generate_gpx_bytes(duration_seconds=0)
    samples = parse_gpx(xml)
    assert samples == []


def test_parse_gpx_all_fields() -> None:
    """All fields correct with custom generator params."""
    xml = generate_gpx_bytes(
        duration_seconds=1,
        hr=140,
        power=200,
        lat=48.8566,
        lon=2.3522,
        cadence=80,
    )
    s = parse_gpx(xml)[0]
    assert s.timestamp is not None
    assert s.lat == 48.8566
    assert s.lon == 2.3522
    assert s.altitude == 100.0
    assert s.heart_rate == 140
    assert s.cadence == 80
    assert s.power == 200

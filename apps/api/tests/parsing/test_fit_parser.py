# pyright: reportMissingTypeStubs=false
import pytest

from infrastructure.parsing.constants import SEMICIRCLES_TO_DEGREES
from infrastructure.parsing.fit_parser import parse_fit
from tests.factories.fit_generator import generate_fit_stream

pytestmark = pytest.mark.no_db


def test_parse_record_hr_power_and_lap() -> None:
    data = generate_fit_stream(duration_seconds=5, hr=150, power=200, cadence=88)

    result = parse_fit(data)

    assert len(result.samples) == 5
    assert result.samples[0].heart_rate == 150
    assert result.samples[0].power == 200
    assert result.samples[0].cadence == 88
    assert result.samples[0].speed == 10.0
    assert result.samples[0].altitude == 100.0
    assert len(result.laps) == 1
    assert result.laps[0].avg_heart_rate == 150
    assert result.laps[0].avg_power == 200
    assert result.session is not None
    assert result.session["avg_power"] == 200


def test_gps_semicircles_are_converted_to_degrees() -> None:
    lat = 25.06
    lon = 121.63
    data = generate_fit_stream(duration_seconds=1, lat=lat, lon=lon)

    sample = parse_fit(data).samples[0]

    expected_lat = round(lat / SEMICIRCLES_TO_DEGREES) * SEMICIRCLES_TO_DEGREES
    expected_lon = round(lon / SEMICIRCLES_TO_DEGREES) * SEMICIRCLES_TO_DEGREES
    assert sample.lat == pytest.approx(expected_lat)
    assert sample.lon == pytest.approx(expected_lon)


def test_missing_record_fields_are_none() -> None:
    data = generate_fit_stream(duration_seconds=1)

    sample = parse_fit(data).samples[0]

    assert sample.vertical_oscillation is None
    assert sample.stance_time is None
    assert sample.stride_length is None
    assert sample.temperature is None


@pytest.mark.parametrize("payload", [b"", b"not a fit file"])
def test_empty_or_corrupt_fit_returns_empty_result(payload: bytes) -> None:
    result = parse_fit(payload)

    assert result.samples == []
    assert result.laps == []
    assert result.session is None

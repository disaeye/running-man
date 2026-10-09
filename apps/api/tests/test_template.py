"""AAA-style template demonstrating PG fixture + VCR + synthetic generators."""

from collections.abc import Generator

import fitdecode
import psycopg
import pytest

from tests.factories.fit_generator import generate_fit_stream
from tests.factories.gpx_generator import generate_gpx_bytes
from tests.factories.tcx_generator import generate_tcx_bytes


# ---------------------------------------------------------------------------
# PG transaction isolation demo
# ---------------------------------------------------------------------------
@pytest.fixture
def sample_table(db_conn: psycopg.Connection) -> Generator[None, None, None]:
    with db_conn.cursor() as cur:
        cur.execute("CREATE TEMP TABLE IF NOT EXISTS demo (val INT)")
    yield


class TestPgIsolation:
    def test_insert_data(self, sample_table: None, db_conn: psycopg.Connection) -> None:
        with db_conn.cursor() as cur:
            cur.execute("INSERT INTO demo (val) VALUES (42)")
            cur.execute("SELECT COUNT(*) FROM demo")
            assert cur.fetchone()[0] == 1

    def test_table_starts_empty(self, sample_table: None, db_conn: psycopg.Connection) -> None:
        with db_conn.cursor() as cur:
            cur.execute("SELECT COUNT(*) FROM demo")
            assert cur.fetchone()[0] == 0


# ---------------------------------------------------------------------------
# VCR usage demo
# ---------------------------------------------------------------------------
class TestVcrDemo:
    """VCR is configured in conftest.py (record_mode=none by default).

    When recording new cassettes, decorate individual test methods with
    @vcr.use_cassette and temporarily set record_mode="once".
    Actual HTTP calls are skipped here because httpbin.org is unreachable
    from this environment; the config remains ready for live recording.
    """

    def test_vcr_config_loaded(self, vcr_config: dict) -> None:
        assert vcr_config["record_mode"] == "none"
        assert "cassette_library_dir" in vcr_config


# ---------------------------------------------------------------------------
# FIT / TCX / GPX generator smoke tests
# ---------------------------------------------------------------------------
class TestFitGenerator:
    def test_roundtrip(self) -> None:
        stream = generate_fit_stream(duration_seconds=10)
        assert len(stream) > 50

        frames = list(fitdecode.FitReader(stream))
        types = {f.name for f in frames if f.frame_type == fitdecode.FIT_FRAME_DATAMESG}
        assert "file_id" in types
        assert "record" in types
        assert "lap" in types
        assert "session" in types

    def test_record_count(self) -> None:
        stream = generate_fit_stream(duration_seconds=60)
        frames = list(fitdecode.FitReader(stream))
        records = [
            f for f in frames if f.frame_type == fitdecode.FIT_FRAME_DATAMESG and f.name == "record"
        ]
        assert len(records) == 60

    def test_hr_power_values(self) -> None:
        stream = generate_fit_stream(duration_seconds=5, hr=130, power=250)
        frames = list(fitdecode.FitReader(stream))
        for frame in frames:
            if frame.frame_type == fitdecode.FIT_FRAME_DATAMESG and frame.name == "record":
                assert frame.get_value("heart_rate") == 130
                assert frame.get_value("power") == 250


class TestTcxGenerator:
    def test_xml_structure(self) -> None:
        xml = generate_tcx_bytes(duration_seconds=10)
        assert b"TrainingCenterDatabase" in xml
        assert b"Trackpoint" in xml
        assert b"HeartRateBpm" in xml
        assert b"Watts" in xml

    def test_custom_params(self) -> None:
        xml = generate_tcx_bytes(duration_seconds=5, hr=120, power=180, cadence=90)
        assert b"120" in xml
        assert b"90" in xml


class TestGpxGenerator:
    def test_xml_structure(self) -> None:
        xml = generate_gpx_bytes(duration_seconds=10)
        assert b"gpx" in xml
        assert b"trkpt" in xml
        assert b"TrackPointExtension" in xml  # extension wrapper element

    def test_custom_params(self) -> None:
        xml = generate_gpx_bytes(duration_seconds=5, hr=120, power=180, lat=48.85, lon=2.29)
        assert b">120<" in xml
        assert b'lat="48.' in xml

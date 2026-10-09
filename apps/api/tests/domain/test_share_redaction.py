from datetime import UTC, datetime

from domain.share.redaction import redact_for_public


def test_redact_for_public_allows_only_public_fields() -> None:
    redacted = redact_for_public(
        {
            "activity_id": "a-1",
            "athlete_id": "secret-athlete",
            "email": "runner@example.com",
            "start_time": datetime(2026, 6, 23, 9, 45, tzinfo=UTC),
            "sport": "Run",
            "distance_m": 10_000.0,
            "duration_s": 3_600,
            "avg_hr": 150,
            "max_hr": 180,
            "avg_power": 250,
            "device_name": "watch",
            "notes": "private",
            "streams": [{"lat": 1.0, "lon": 2.0, "value": 150}],
            "raw_data": {"name": "Morning Run", "lat": 1.0, "lon": 2.0},
        }
    )

    assert redacted == {
        "sport": "Run",
        "date": datetime(2026, 6, 23, 9, 45, tzinfo=UTC).date(),
        "duration_s": 3_600,
        "distance_m": 10_000.0,
        "name": "Morning Run",
    }


def test_redact_for_public_truncates_string_timestamp_to_date() -> None:
    redacted = redact_for_public(
        {
            "start_time": "2026-06-23T09:45:00+08:00",
            "sport": "Ride",
            "duration_s": None,
            "distance_m": None,
            "name": "Cafe Ride",
        }
    )

    assert redacted["date"] == "2026-06-23"
    assert set(redacted) == {"sport", "date", "duration_s", "distance_m", "name"}

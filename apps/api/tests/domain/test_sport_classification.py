"""Sport-family classification for personal records and the insights endpoints.

Four user-facing features — personal records, intensity distribution, shoe
assignment and race prediction — all returned empty for an athlete with 28
synced runs, and one of them (personal records) then returned 500 once the
emptiness was fixed. Both faults were spelling, and neither had a test.

The database stores sport in two spellings: `run` / `virtual_run` as written by
the Intervals.icu sync, and `Run` / `VirtualRun` as written by the FIT/GPX
upload path. `domain.sports` exists to absorb that difference and is
case- and separator-insensitive. `domain.insights.prs` nonetheless kept its own
set spelled only the Intervals.icu way, so every synced run failed
`is_run_sport` and dropped out of the computation.
"""

from __future__ import annotations

import pytest

from domain.insights.prs import compute_run_prs, is_ride_sport, is_run_sport


class TestRunClassification:
    """Both spellings, and the separator-insensitive spelling, are running."""

    @pytest.mark.parametrize(
        "sport",
        ["run", "Run", "RUN", "virtual_run", "VirtualRun", "trail_run", "TrailRun"],
    )
    def test_recognises_running(self, sport: str) -> None:
        assert is_run_sport(sport) is True

    @pytest.mark.parametrize(
        "sport",
        ["walk", "hike", "swim", "ride", "weight_training", "workout", "", None],
    )
    def test_rejects_everything_else(self, sport: str | None) -> None:
        assert is_run_sport(sport) is False

    @pytest.mark.parametrize("sport", ["ride", "Ride", "virtual_ride", "VirtualRide"])
    def test_recognises_riding(self, sport: str) -> None:
        assert is_ride_sport(sport) is True


class TestRunPersonalRecords:
    """The canonical lowercase key must produce records, not an empty list."""

    def test_synced_lowercase_run_produces_records(self) -> None:
        # This is the exact shape `_all_activities` returns for a synced run.
        # It used to yield nothing at all: the sport was spelled `run`, the set
        # held `Run`, and the distance loop never saw a qualifying activity.
        activities = [
            {"activity_id": "a", "sport": "run", "distance_m": 5030.0, "duration_s": 1310.0, "date": "2026-06-28"},
        ]

        records = compute_run_prs(activities)

        # A 5.03 km run covers 1 km and 5 km, and nothing longer.
        assert {r["distance_m"] for r in records} == {1000, 5000}
        five_k = next(r for r in records if r["distance_m"] == 5000)
        # 1310 s over 5030 m extrapolates to 1302 s over 5000 m.
        assert five_k["best_value"] == pytest.approx(1302.2, abs=0.1)
        assert five_k["activity_id"] == "a"

    def test_uploaded_capitalised_run_also_produces_records(self) -> None:
        activities = [
            {"activity_id": "b", "sport": "Run", "distance_m": 10000.0, "duration_s": 3000.0, "date": "2026-07-01"},
        ]

        records = compute_run_prs(activities)

        assert {r["distance_m"] for r in records} == {1000, 5000, 10000}
        assert all(r["activity_id"] == "b" for r in records)

    def test_a_short_run_only_qualifies_for_the_shortest_distance(self) -> None:
        # Guards the extrapolation gate. An activity qualifies for distance D
        # only when it actually covered D; the estimated time is then
        # extrapolated assuming constant pace. A 3.03 km run therefore yields a
        # 1 km record and nothing else — no 5 km, no 10 km, no half.
        activities = [
            {"activity_id": "c", "sport": "run", "distance_m": 3030.0, "duration_s": 751.0, "date": "2026-07-05"},
        ]

        records = compute_run_prs(activities)

        assert {r["distance_m"] for r in records} == {1000}
        # 751 s over 3030 m extrapolates to 247.9 s over 1000 m — the 4:08 that
        # the production endpoint reports for this exact activity.
        assert records[0]["best_value"] == pytest.approx(247.9, abs=0.1)


class TestPersonalRecordResponseShape:
    """The mapper's keys must match the response model, field for field.

    `_run_record` and `_ride_record` emitted `activityId` while
    `RunPersonalRecordResponse` requires `activity_id` and forbids extras. Every
    request therefore failed validation with two errors at once — a missing
    field and an unexpected one, which is the signature of a rename that only
    landed on one side. Nothing caught it because the endpoint returned an empty
    list for other reasons at the time; fixing the sport spelling above is what
    exposed it.
    """

    def test_run_record_keys_satisfy_the_response_model(self) -> None:
        from presentation.api.analytics_insight_contracts import RunPersonalRecordResponse
        from presentation.api.insights_helpers import _run_record

        record = _run_record(
            {
                "category": "distance",
                "distance_m": 5000,
                "duration_s": None,
                "best_value": 1302.2,
                "activity_id": "i161109961",
                "date": "2026-06-28",
            }
        )

        model = RunPersonalRecordResponse.model_validate(record)
        assert model.activity_id == "i161109961"

    def test_ride_record_keys_satisfy_the_response_model(self) -> None:
        from presentation.api.analytics_insight_contracts import RidePersonalRecordResponse
        from presentation.api.insights_helpers import _ride_record

        record = _ride_record(
            {
                "category": "power",
                "distance_m": None,
                "duration_s": 300,
                "best_value": 312.4,
                "activity_id": "i999",
                "date": "2026-07-01",
            }
        )

        model = RidePersonalRecordResponse.model_validate(record)
        assert model.activity_id == "i999"

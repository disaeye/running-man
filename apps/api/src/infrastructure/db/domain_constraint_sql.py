from __future__ import annotations

from collections.abc import Mapping
from typing import cast

from domain.generated.stream_metrics import STREAM_METRIC_DEFINITIONS

ACTIVITY_SUMMARY_CONSTRAINTS_SQL = """
ALTER TABLE activity_summary
    ADD CONSTRAINT fk_activity_summary_sport_definition
        FOREIGN KEY (sport) REFERENCES sport_definitions(sport_key),
    ADD CONSTRAINT fk_activity_summary_source_definition
        FOREIGN KEY (source) REFERENCES source_definitions(source_key),
    ADD CONSTRAINT ck_activity_summary_distance
        CHECK (distance_m IS NULL OR distance_m BETWEEN 0 AND 2000000) NOT VALID,
    ADD CONSTRAINT ck_activity_summary_duration
        CHECK (duration_s IS NULL OR duration_s BETWEEN 0 AND 172800) NOT VALID,
    ADD CONSTRAINT ck_activity_summary_hr
        CHECK (
            (avg_hr IS NULL OR avg_hr BETWEEN 1 AND 260)
            AND (max_hr IS NULL OR max_hr BETWEEN 1 AND 260)
        ) NOT VALID,
    ADD CONSTRAINT ck_activity_summary_power
        CHECK (
            (avg_power IS NULL OR avg_power BETWEEN 0 AND 3000)
            AND (source_weighted_power_w IS NULL OR source_weighted_power_w BETWEEN 0 AND 3000)
        ) NOT VALID,
    ADD CONSTRAINT ck_activity_summary_source_load
        CHECK (source_training_load IS NULL OR source_training_load BETWEEN 0 AND 10000) NOT VALID;
"""

ACTIVITY_STREAM_INDEX_SQL = """
CREATE UNIQUE INDEX IF NOT EXISTS uq_activity_stream_identity
    ON activity_streams (athlete_id, activity_id, sample_time, metric_type);
"""

WELLNESS_STRENGTH_STATUS_SQL = """
ALTER TABLE health_wellness
    ADD CONSTRAINT ck_health_wellness_scores
        CHECK (
            (sleep_score IS NULL OR sleep_score BETWEEN 0 AND 100)
            AND (fatigue IS NULL OR fatigue BETWEEN 0 AND 100)
            AND (soreness IS NULL OR soreness BETWEEN 0 AND 100)
            AND (stress IS NULL OR stress BETWEEN 0 AND 100)
            AND (mood IS NULL OR mood BETWEEN 0 AND 100)
            AND (motivation IS NULL OR motivation BETWEEN 0 AND 100)
            AND (readiness IS NULL OR readiness BETWEEN 0 AND 100)
        ) NOT VALID,
    ADD CONSTRAINT ck_health_wellness_physical
        CHECK (
            (resting_hr IS NULL OR resting_hr BETWEEN 1 AND 260)
            AND (sleep_secs IS NULL OR sleep_secs BETWEEN 0 AND 172800)
        ) NOT VALID;

ALTER TABLE workout_sets
    ADD CONSTRAINT ck_workout_sets_physical
        CHECK (
            set_number > 0
            AND reps > 0
            AND (weight_kg IS NULL OR weight_kg >= 0)
            AND (estimated_1rm_kg IS NULL OR estimated_1rm_kg >= 0)
            AND (rpe IS NULL OR rpe BETWEEN 1 AND 10)
            AND (rest_seconds IS NULL OR rest_seconds >= 0)
        ) NOT VALID;

ALTER TABLE training_calendar
    ADD CONSTRAINT ck_training_calendar_status
        CHECK (status IN ('planned', 'completed', 'skipped', 'deleted')) NOT VALID;
ALTER TABLE goals
    ADD CONSTRAINT ck_goals_status
        CHECK (status IN ('active', 'achieved', 'abandoned')) NOT VALID;
"""

SOURCE_STATUS_CONSTRAINTS_SQL = """
ALTER TABLE user_integrations
    ADD CONSTRAINT fk_user_integrations_source_definition
        FOREIGN KEY (source) REFERENCES source_definitions(source_key) NOT VALID,
    ADD CONSTRAINT ck_user_integrations_last_sync_status
        CHECK (
            last_sync_status IS NULL
            OR last_sync_status IN ('running', 'success', 'failed', 'skipped')
        ) NOT VALID;
"""

DERIVED_FACT_BOUNDS_SQL = """
CREATE OR REPLACE FUNCTION enforce_derived_metric_fact_bounds()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    allowed_min double precision;
    allowed_max double precision;
BEGIN
    SELECT legal_min, legal_max INTO allowed_min, allowed_max
    FROM metric_definitions
    WHERE metric_key = NEW.metric_key AND unit = NEW.unit;
    IF NEW.value < allowed_min OR NEW.value > allowed_max THEN
        RAISE EXCEPTION 'derived metric value out of legal range' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_derived_metric_fact_bounds ON derived_metric_facts;
CREATE TRIGGER trg_derived_metric_fact_bounds
BEFORE INSERT OR UPDATE ON derived_metric_facts
FOR EACH ROW EXECUTE FUNCTION enforce_derived_metric_fact_bounds();
"""


def activity_stream_constraints_sql() -> str:
    stream_check = " OR\n            ".join(
        _stream_value_condition(cast(Mapping[str, object], row))
        for row in STREAM_METRIC_DEFINITIONS
    )
    return f"""
ALTER TABLE activity_streams
    ADD CONSTRAINT fk_activity_streams_metric_definition
        FOREIGN KEY (metric_type) REFERENCES stream_metric_definitions(metric_key),
    ADD CONSTRAINT ck_activity_streams_position
        CHECK (
            (lat IS NULL OR lat BETWEEN -90 AND 90)
            AND (lon IS NULL OR lon BETWEEN -180 AND 180)
        ) NOT VALID,
    ADD CONSTRAINT ck_activity_streams_value
        CHECK (
            {stream_check}
        ) NOT VALID;
"""


def constraint_targets() -> tuple[tuple[str, str], ...]:
    return (
        ("fk_activity_summary_sport_definition", "activity_summary"),
        ("fk_activity_summary_source_definition", "activity_summary"),
        ("fk_activity_streams_metric_definition", "activity_streams"),
        ("fk_user_integrations_source_definition", "user_integrations"),
    )


def _range_value(row: Mapping[str, object], key: str) -> float:
    legal_range = cast(Mapping[str, int | float], row["legal_range"])
    return float(legal_range[key])


def _stream_value_condition(row: Mapping[str, object]) -> str:
    key = str(row["key"])
    minimum = _range_value(row, "minimum")
    maximum = _range_value(row, "maximum")
    return f"(metric_type = '{key}' AND value BETWEEN {minimum} AND {maximum})"

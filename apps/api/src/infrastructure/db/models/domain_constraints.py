from sqlalchemy import CheckConstraint, ForeignKeyConstraint, Index

from infrastructure.db import Base
from infrastructure.db.models.core import (
    activity_streams_t,
)

activity_summary_table = Base.metadata.tables["activity_summary"]
health_wellness_table = Base.metadata.tables["health_wellness"]
training_calendar_table = Base.metadata.tables["training_calendar"]
goals_table = Base.metadata.tables["goals"]
user_integrations_table = Base.metadata.tables["user_integrations"]

activity_summary_table.append_constraint(
    ForeignKeyConstraint(
        ["sport"],
        ["sport_definitions.sport_key"],
        name="fk_activity_summary_sport_definition",
    )
)
activity_summary_table.append_constraint(
    ForeignKeyConstraint(
        ["source"],
        ["source_definitions.source_key"],
        name="fk_activity_summary_source_definition",
    )
)
for constraint in (
    CheckConstraint(
        "distance_m IS NULL OR distance_m BETWEEN 0 AND 2000000",
        name="ck_activity_summary_distance",
    ),
    CheckConstraint(
        "duration_s IS NULL OR duration_s BETWEEN 0 AND 172800",
        name="ck_activity_summary_duration",
    ),
    CheckConstraint(
        "(avg_hr IS NULL OR avg_hr BETWEEN 1 AND 260) "
        "AND (max_hr IS NULL OR max_hr BETWEEN 1 AND 260)",
        name="ck_activity_summary_hr",
    ),
    CheckConstraint(
        "(avg_power IS NULL OR avg_power BETWEEN 0 AND 3000) "
        "AND (source_weighted_power_w IS NULL OR source_weighted_power_w BETWEEN 0 AND 3000)",
        name="ck_activity_summary_power",
    ),
    CheckConstraint(
        "source_training_load IS NULL OR source_training_load BETWEEN 0 AND 10000",
        name="ck_activity_summary_source_load",
    ),
):
    activity_summary_table.append_constraint(constraint)

activity_streams_t.append_constraint(
    ForeignKeyConstraint(
        ["metric_type"],
        ["stream_metric_definitions.metric_key"],
        name="fk_activity_streams_metric_definition",
    )
)
activity_streams_t.append_constraint(
    CheckConstraint(
        "(lat IS NULL OR lat BETWEEN -90 AND 90) "
        "AND (lon IS NULL OR lon BETWEEN -180 AND 180)",
        name="ck_activity_streams_position",
    )
)
activity_streams_t.append_constraint(
    CheckConstraint(
        "(metric_type = 'altitude' AND value BETWEEN -1000 AND 10000) "
        "OR (metric_type = 'cadence' AND value BETWEEN 0 AND 300) "
        "OR (metric_type = 'distance' AND value BETWEEN 0 AND 2000000) "
        "OR (metric_type = 'grade' AND value BETWEEN -100 AND 100) "
        "OR (metric_type = 'ground_contact_time' AND value BETWEEN 0 AND 2000) "
        "OR (metric_type = 'heart_rate' AND value BETWEEN 1 AND 260) "
        "OR (metric_type = 'left_right_balance' AND value BETWEEN 0 AND 100) "
        "OR (metric_type = 'power' AND value BETWEEN 0 AND 3000) "
        "OR (metric_type = 'speed' AND value BETWEEN 0 AND 40) "
        "OR (metric_type = 'stride_length' AND value BETWEEN 0 AND 10) "
        "OR (metric_type = 'temperature' AND value BETWEEN -80 AND 80) "
        "OR (metric_type = 'vertical_oscillation' AND value BETWEEN 0 AND 50)",
        name="ck_activity_streams_value",
    )
)
Index(
    "uq_activity_stream_identity",
    activity_streams_t.c.athlete_id,
    activity_streams_t.c.activity_id,
    activity_streams_t.c.sample_time,
    activity_streams_t.c.metric_type,
    unique=True,
)

health_wellness_table.append_constraint(
    CheckConstraint(
        "(sleep_score IS NULL OR sleep_score BETWEEN 0 AND 100) "
        "AND (fatigue IS NULL OR fatigue BETWEEN 0 AND 100) "
        "AND (soreness IS NULL OR soreness BETWEEN 0 AND 100) "
        "AND (stress IS NULL OR stress BETWEEN 0 AND 100) "
        "AND (mood IS NULL OR mood BETWEEN 0 AND 100) "
        "AND (motivation IS NULL OR motivation BETWEEN 0 AND 100) "
        "AND (readiness IS NULL OR readiness BETWEEN 0 AND 100)",
        name="ck_health_wellness_scores",
    )
)
health_wellness_table.append_constraint(
    CheckConstraint(
        "(resting_hr IS NULL OR resting_hr BETWEEN 1 AND 260) "
        "AND (sleep_secs IS NULL OR sleep_secs BETWEEN 0 AND 172800)",
        name="ck_health_wellness_physical",
    )
)
training_calendar_table.append_constraint(
    CheckConstraint(
        "status IN ('planned', 'completed', 'skipped', 'deleted')",
        name="ck_training_calendar_status",
    )
)
goals_table.append_constraint(
    CheckConstraint("status IN ('active', 'achieved', 'abandoned')", name="ck_goals_status")
)
user_integrations_table.append_constraint(
    ForeignKeyConstraint(
        ["source"],
        ["source_definitions.source_key"],
        name="fk_user_integrations_source_definition",
    )
)
user_integrations_table.append_constraint(
    CheckConstraint(
        "last_sync_status IS NULL OR last_sync_status IN "
        "('running', 'success', 'failed', 'skipped')",
        name="ck_user_integrations_last_sync_status",
    )
)

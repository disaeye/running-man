from __future__ import annotations

import re
from typing import Final

HEAD_REVISION: Final = "f6a7b8c9d0e1"
EXPECTED_TABLES: Final = frozenset({
    "activity_laps",
    "activity_streams",
    "activity_summary",
    "activity_summary_archive",
    "athletes",
    "computation_runs",
    "derived_metric_facts",
    "exercise_library",
    "ftp_history",
    "gear_assignments",
    "gear_shoes",
    "goals",
    "health_wellness",
    "integration_sync_errors",
    "integration_sync_runs",
    "login_attempts",
    "metric_definitions",
    "milestones",
    "notification_rules",
    "notifications",
    "revoked_tokens",
    "share_tokens",
    "source_definitions",
    "source_records",
    "sport_definitions",
    "stream_metric_definitions",
    "training_calendar",
    "training_phases",
    "user_integrations",
    "webhook_events",
    "workout_exercises",
    "workout_sets",
    "workout_templates",
    "zone_overrides",
})
EXPECTED_VIEWS: Final = frozenset({
    "current_activity_facts",
    "current_athlete_facts",
    "current_daily_facts",
    "current_derived_metric_facts",
    "current_metric_definitions",
})
EXPECTED_FUNCTIONS: Final = frozenset({
    "create_future_partitions",
    "enforce_derived_metric_fact_bounds",
    "get_athlete_daily_facts",
    "get_athlete_weekly_facts",
})
FORBIDDEN_TABLES: Final = frozenset({"daily_load"})
FORBIDDEN_MATVIEWS: Final = frozenset({"mv_daily_load", "mv_weekly_distance", "mv_hr_zones"})
FORBIDDEN_REFRESH_JOBS: Final = (
    "refresh_daily_load",
    "refresh_weekly_distance",
    "refresh_hr_zones",
)
DDL_RE: Final = re.compile(
    r"\bCREATE\s+(?:TABLE|VIEW|MATERIALIZED\s+VIEW|FUNCTION|EXTENSION)\b",
    re.IGNORECASE,
)
ALLOWED_DDL_PATHS: Final = (
    "apps/api/alembic/versions/",
    "apps/api/tests/",
    "scripts/db_maintenance_sql.py",
    "scripts/fixtures/",
)

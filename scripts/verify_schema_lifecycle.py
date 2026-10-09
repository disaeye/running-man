#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Final

import psycopg

import verify_fresh_schema
from fresh_schema_catalog import HEAD_REVISION
from schema_lifecycle_runner import create_fresh_database, exercise_reversibility

def _registry_counts() -> dict[str, int]:
    """Seed counts derived from the generated contract registry.

    Derived (rather than hardcoded) so the gate cannot drift when
    ``contracts/v1`` gains a definition: the seeding migrations upsert the
    registry, so the live count must always equal its size.
    """
    from domain.generated.metrics import METRIC_DEFINITIONS
    from domain.generated.sources import SOURCE_DEFINITIONS
    from domain.generated.sports import SPORT_DEFINITIONS
    from domain.generated.stream_metrics import STREAM_METRIC_DEFINITIONS

    return {
        "source_definitions": len(SOURCE_DEFINITIONS),
        "sport_definitions": len(SPORT_DEFINITIONS),
        "stream_metric_definitions": len(STREAM_METRIC_DEFINITIONS),
        "metric_definitions": len(METRIC_DEFINITIONS),
    }


EXPECTED_COUNTS: Final = _registry_counts()
EXPECTED_MINIMUMS: Final = {"exercise_library": 20}


@dataclass(frozen=True, slots=True)
class Diagnostic:
    code: str
    path: str
    message: str
    expected: str | None = None
    actual: str | None = None


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Verify schema lifecycle safety.")
    parser.add_argument("--database-url", default="")
    parser.add_argument("--admin-database-url", default="")
    parser.add_argument("--database-name", default="")
    parser.add_argument("--create-fresh", action="store_true")
    parser.add_argument("--exercise-reversibility", action="store_true")
    parser.add_argument("--expected-revision", default=HEAD_REVISION)
    parser.add_argument("--json", action="store_true", dest="json_output")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    database_url = args.database_url
    if database_url.startswith("fixture://"):
        diagnostics = fixture_diagnostics(database_url)
    elif args.create_fresh:
        database_url = create_fresh_database(args.admin_database_url, args.database_name)
        diagnostics = verify_live(database_url, args.expected_revision, args.exercise_reversibility)
    elif database_url:
        diagnostics = verify_live(database_url, args.expected_revision, args.exercise_reversibility)
    else:
        diagnostics = [
            Diagnostic("database_url_missing", "database_url", "database URL is required")
        ]
    emit(diagnostics, args.json_output)
    return 0 if not diagnostics else 1


def fixture_diagnostics(database_url: str) -> list[Diagnostic]:
    fixture = Path(__file__).parent / "fixtures" / f"{database_url.removeprefix('fixture://')}.json"
    payload = json.loads(fixture.read_text(encoding="utf-8"))
    return [Diagnostic(**item) for item in payload["diagnostics"]]


def verify_live(database_url: str, expected_revision: str, reversible: bool) -> list[Diagnostic]:
    if reversible:
        exercise_reversibility(database_url)
    with psycopg.connect(database_url) as connection:
        diagnostics = revision_diagnostics(connection, expected_revision)
        diagnostics.extend(seed_diagnostics(connection))
        diagnostics.extend(function_diagnostics(connection))
        diagnostics.extend(object_diagnostics(connection))
    diagnostics.extend(fresh_schema_diagnostics(database_url))
    return sorted(diagnostics, key=lambda item: (item.path, item.code))


def revision_diagnostics(
    connection: psycopg.Connection, expected_revision: str
) -> list[Diagnostic]:
    with connection.cursor() as cur:
        cur.execute("SELECT version_num FROM alembic_version")
        row = cur.fetchone()
    actual = "" if row is None else str(row[0])
    if actual == expected_revision:
        return []
    return [
        Diagnostic(
            "omitted_migration", "alembic.head", "unexpected Alembic head", expected_revision, actual
        )
    ]


def seed_diagnostics(connection: psycopg.Connection) -> list[Diagnostic]:
    diagnostics: list[Diagnostic] = []
    for table, expected in EXPECTED_COUNTS.items():
        actual = scalar_int(connection, f"SELECT count(*) FROM {table}")
        if actual != expected:
            diagnostics.append(seed_diagnostic("seed_count_mismatch", table, expected, actual))
    for table, minimum in EXPECTED_MINIMUMS.items():
        actual = scalar_int(connection, f"SELECT count(*) FROM {table}")
        if actual < minimum:
            diagnostics.append(seed_diagnostic("seed_count_too_low", table, minimum, actual))
    return diagnostics


def seed_diagnostic(code: str, table: str, expected: int, actual: int) -> Diagnostic:
    return Diagnostic(code, f"tables.{table}", "seed count mismatch", str(expected), str(actual))


def function_diagnostics(connection: psycopg.Connection) -> list[Diagnostic]:
    expected = {
        "create_future_partitions",
        "enforce_derived_metric_fact_bounds",
        "get_athlete_daily_facts",
        "get_athlete_weekly_facts",
    }
    actual = function_names(connection)
    return [
        Diagnostic("missing_function", f"functions.{name}", "expected function is missing")
        for name in sorted(expected - actual)
    ]


def function_names(connection: psycopg.Connection) -> set[str]:
    with connection.cursor() as cur:
        cur.execute(
            "SELECT proname FROM pg_proc JOIN pg_namespace n ON n.oid = pronamespace "
            "WHERE n.nspname = 'public'"
        )
        return {str(row[0]) for row in cur.fetchall()}


# ---------------------------------------------------------------------------
# Object-level checks for schema that was previously skipped by the fake
# migration runner (physiology pointer columns, account-deletion CASCADE FKs,
# the training_calendar external-id index, timezone-aware fact functions).
# ---------------------------------------------------------------------------

EXPECTED_COLUMNS: Final = {
    "athletes": ("physiology_computation_run_id", "physiology_algorithm_version"),
    "ftp_history": (
        "ftp_source",
    ),
}

CASCADE_TABLES: Final = (
    "health_wellness",
    "activity_summary",
    "training_calendar",
    "ftp_history",
    "goals",
    "user_integrations",
    "notifications",
    "gear_shoes",
    "share_tokens",
    "notification_rules",
    "workout_exercises",
    "workout_sets",
    "integration_sync_runs",
    "integration_sync_errors",
    "source_records",
)


def object_diagnostics(connection: psycopg.Connection) -> list[Diagnostic]:
    diagnostics: list[Diagnostic] = []
    for table, columns in EXPECTED_COLUMNS.items():
        present = set(table_columns(connection, table))
        for column in columns:
            if column not in present:
                diagnostics.append(
                    Diagnostic(
                        "missing_column", f"columns.{table}.{column}", "expected column is missing"
                    )
                )
    if not index_exists(connection, "training_calendar", "idx_tc_athlete_external"):
        diagnostics.append(
            Diagnostic(
                "missing_index",
                "indexes.training_calendar.idx_tc_athlete_external",
                "expected index is missing",
            )
        )
    for table in CASCADE_TABLES:
        if not cascade_athlete_fk_exists(connection, table):
            diagnostics.append(
                Diagnostic(
                    "missing_cascade",
                    f"cascades.{table}",
                    "expected ON DELETE CASCADE FK to athletes is missing",
                )
            )
    if not fact_functions_are_tz_aware(connection):
        diagnostics.append(
            Diagnostic(
                "function_not_tz_aware",
                "functions.get_athlete_daily_facts",
                "expected athlete local-day bucketing (AT TIME ZONE)",
            )
        )
    return diagnostics


def table_columns(connection: psycopg.Connection, table: str) -> set[str]:
    with connection.cursor() as cur:
        cur.execute(
            "SELECT column_name FROM information_schema.columns"
            " WHERE table_schema = 'public' AND table_name = %s",
            (table,),
        )
        return {str(row[0]) for row in cur.fetchall()}


def index_exists(connection: psycopg.Connection, table: str, index: str) -> bool:
    with connection.cursor() as cur:
        cur.execute(
            "SELECT EXISTS ("
            "  SELECT 1 FROM pg_indexes"
            "  WHERE schemaname = 'public' AND tablename = %s AND indexname = %s"
            ")",
            (table, index),
        )
        return bool((cur.fetchone() or (False,))[0])


def cascade_athlete_fk_exists(connection: psycopg.Connection, table: str) -> bool:
    with connection.cursor() as cur:
        cur.execute(
            "SELECT EXISTS ("
            "  SELECT 1 FROM pg_constraint"
            "  WHERE conrelid = %s::regclass"
            "    AND contype = 'f'"
            "    AND confrelid = 'athletes'::regclass"
            "    AND confdeltype = 'c'"
            ")",
            (table,),
        )
        return bool((cur.fetchone() or (False,))[0])


def fact_functions_are_tz_aware(connection: psycopg.Connection) -> bool:
    with connection.cursor() as cur:
        cur.execute(
            "SELECT EXISTS ("
            "  SELECT 1 FROM pg_proc"
            "  WHERE proname = 'get_athlete_daily_facts'"
            "    AND prosrc LIKE '%AT TIME ZONE COALESCE(ath.timezone%'"
            ")"
        )
        return bool((cur.fetchone() or (False,))[0])


def fresh_schema_diagnostics(database_url: str) -> list[Diagnostic]:
    return [
        Diagnostic(item.code, item.path, item.message, item.expected, item.actual)
        for item in verify_fresh_schema.check_live_database(database_url)
    ]


def scalar_int(connection: psycopg.Connection, query: str) -> int:
    with connection.cursor() as cur:
        cur.execute(query)
        row = cur.fetchone()
    if row is None:
        return 0
    return int(row[0])


def emit(diagnostics: list[Diagnostic], json_output: bool) -> None:
    payload = {"ok": not diagnostics, "diagnostics": [asdict(item) for item in diagnostics]}
    if json_output:
        print(json.dumps(payload, ensure_ascii=True, indent=2, sort_keys=True))
    elif diagnostics:
        for item in diagnostics:
            print(f"{item.code}: {item.path}: {item.message}")
    else:
        print("schema lifecycle ok")


if __name__ == "__main__":
    raise SystemExit(main())

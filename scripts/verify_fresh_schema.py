#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import sys
from dataclasses import asdict, dataclass
from importlib import import_module
from pathlib import Path
from typing import Any, Final

from fresh_schema_catalog import (
    ALLOWED_DDL_PATHS,
    DDL_RE,
    EXPECTED_FUNCTIONS,
    EXPECTED_TABLES,
    EXPECTED_VIEWS,
    FORBIDDEN_MATVIEWS,
    FORBIDDEN_REFRESH_JOBS,
    FORBIDDEN_TABLES,
    HEAD_REVISION,
)
from fresh_schema_columns import table_columns, text_value

REPO_ROOT: Final = Path(__file__).resolve().parents[1]
SCRIPT_DIR: Final = Path(__file__).resolve().parent
API_SRC: Final = REPO_ROOT / "apps" / "api" / "src"
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))
if str(API_SRC) not in sys.path:
    sys.path.insert(0, str(API_SRC))


@dataclass(frozen=True, slots=True)
class Diagnostic:
    code: str
    path: str
    message: str
    expected: str | None = None
    actual: str | None = None


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Verify a fresh Alembic-owned schema.")
    parser.add_argument("--database-url", default=os.environ.get("DATABASE_URL", ""))
    parser.add_argument("--json", action="store_true", dest="json_output")
    return parser.parse_args()


def fixture_diagnostics(database_url: str) -> list[Diagnostic] | None:
    if not database_url.startswith("fixture://"):
        return None
    name = database_url.removeprefix("fixture://")
    fixture_path = SCRIPT_DIR / "fixtures" / f"{name}.json"
    payload = json.loads(fixture_path.read_text(encoding="utf-8"))
    return [Diagnostic(**item) for item in payload["diagnostics"]]


def check_live_database(database_url: str) -> list[Diagnostic]:
    if not database_url:
        return [Diagnostic("database_url_missing", "database_url", "database URL is required")]
    modules = load_psycopg()
    try:
        with modules.psycopg.connect(database_url, row_factory=modules.dict_row) as connection:
            diagnostics = catalog_diagnostics(connection)
            diagnostics.extend(metadata_diagnostics(connection))
    except (modules.psycopg.Error, modules.psycopg.OperationalError) as exc:
        return [Diagnostic("database_error", "database", str(exc))]
    diagnostics.extend(source_diagnostics())
    return sorted(diagnostics, key=lambda item: (item.path, item.code))


@dataclass(frozen=True, slots=True)
class PsycopgModules:
    psycopg: Any
    dict_row: Any


def load_psycopg() -> PsycopgModules:
    psycopg_module = import_module("psycopg")
    rows_module = import_module("psycopg.rows")
    return PsycopgModules(psycopg=psycopg_module, dict_row=rows_module.dict_row)


def catalog_diagnostics(connection: Any) -> list[Diagnostic]:
    tables = catalog_names(connection, "r", "p")
    views = catalog_names(connection, "v")
    matviews = catalog_names(connection, "m")
    functions = function_names(connection)
    diagnostics = object_diagnostics("tables", EXPECTED_TABLES, tables)
    diagnostics.extend(object_diagnostics("views", EXPECTED_VIEWS, views))
    diagnostics.extend(object_diagnostics("functions", EXPECTED_FUNCTIONS, functions))
    diagnostics.extend(forbidden_diagnostics("tables", FORBIDDEN_TABLES, tables))
    diagnostics.extend(forbidden_diagnostics("matviews", FORBIDDEN_MATVIEWS, matviews))
    diagnostics.extend(activity_summary_column_diagnostics(connection))
    diagnostics.extend(alembic_diagnostics(connection))
    diagnostics.extend(pg_cron_diagnostics(connection))
    return diagnostics


def catalog_names(connection: Any, *relkinds: str) -> set[str]:
    with connection.cursor() as cur:
        cur.execute(
            """
            SELECT c.relname
            FROM pg_class c
            JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE n.nspname = 'public' AND c.relkind::text = ANY(%s)
            """,
            (list(relkinds),),
        )
        return {text_value(row["relname"]) for row in cur.fetchall()}


def function_names(connection: Any) -> set[str]:
    with connection.cursor() as cur:
        cur.execute(
            """
            SELECT p.proname
            FROM pg_proc p
            JOIN pg_namespace n ON n.oid = p.pronamespace
            WHERE n.nspname = 'public'
            """
        )
        return {text_value(row["proname"]) for row in cur.fetchall()}


def object_diagnostics(kind: str, expected: frozenset[str], actual: set[str]) -> list[Diagnostic]:
    return [
        Diagnostic("missing_object", f"{kind}.{name}", "expected schema object is missing")
        for name in sorted(expected - actual)
    ]


def forbidden_diagnostics(
    kind: str, forbidden: frozenset[str], actual: set[str]
) -> list[Diagnostic]:
    return [
        Diagnostic("forbidden_object", f"{kind}.{name}", "obsolete schema object is present")
        for name in sorted(forbidden & actual)
    ]


def alembic_diagnostics(connection: Any) -> list[Diagnostic]:
    with connection.cursor() as cur:
        cur.execute("SELECT version_num FROM alembic_version ORDER BY version_num")
        revisions = [text_value(row["version_num"]) for row in cur.fetchall()]
    if revisions == [HEAD_REVISION]:
        return []
    return [
        Diagnostic(
            "omitted_migration",
            "alembic.head",
            "database is not upgraded to the expected Alembic head",
            HEAD_REVISION,
            ",".join(revisions),
        )
    ]


def pg_cron_diagnostics(connection: Any) -> list[Diagnostic]:
    with connection.cursor() as cur:
        cur.execute("SELECT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron')")
        if not bool(cur.fetchone()["exists"]):
            return []
        cur.execute(
            "SELECT jobname FROM cron.job WHERE jobname = ANY(%s)",
            (list(FORBIDDEN_REFRESH_JOBS),),
        )
        return [
            Diagnostic(
                "forbidden_refresh_job",
                f"cron.job.{row['jobname']}",
                "obsolete refresh job is present",
            )
            for row in cur.fetchall()
        ]


def activity_summary_column_diagnostics(connection: Any) -> list[Diagnostic]:
    columns = table_columns(connection).get("activity_summary", set())
    forbidden = {"np", "intensity_factor", "tss"}
    required = {"source_weighted_power_w", "source_training_load"}
    diagnostics = [
        Diagnostic(
            "forbidden_column",
            f"tables.activity_summary.columns.{column_name}",
            "derived activity metric column must not exist on activity_summary",
        )
        for column_name in sorted(forbidden & columns)
    ]
    diagnostics.extend(
        Diagnostic(
            "missing_column",
            f"tables.activity_summary.columns.{column_name}",
            "source activity metric input column is missing",
        )
        for column_name in sorted(required - columns)
    )
    return diagnostics


def metadata_diagnostics(connection: Any) -> list[Diagnostic]:
    metadata_parity = import_module("metadata_parity")
    metadata = metadata_parity.load_metadata(metadata_parity.DEFAULT_METADATA_MODULE)
    result = []
    actual_columns = table_columns(connection)
    for table_name, columns in sorted(actual_columns.items()):
        metadata_table = metadata.tables.get(table_name)
        if metadata_table is None:
            continue
        metadata_columns = {column.name for column in metadata_table.columns}
        for column_name in sorted(columns - metadata_columns):
            result.append(
                Diagnostic(
                    "manual_column_drift",
                    f"tables.{table_name}.columns.{column_name}",
                    "manual column is not modeled by metadata",
                    None,
                    "present",
                )
            )
    return result


def source_diagnostics() -> list[Diagnostic]:
    diagnostics: list[Diagnostic] = []
    for path in REPO_ROOT.rglob("*"):
        if path.is_file() and should_scan(path):
            relative = path.relative_to(REPO_ROOT).as_posix()
            if DDL_RE.search(path.read_text(errors="ignore")):
                diagnostics.append(
                    Diagnostic(
                        "authoritative_ddl_outside_alembic",
                        relative,
                        "DDL exists outside Alembic authority",
                    )
                )
    return diagnostics


def should_scan(path: Path) -> bool:
    relative = path.relative_to(REPO_ROOT).as_posix()
    if any(part.startswith(".") for part in path.relative_to(REPO_ROOT).parts):
        return False
    if any(part in path.parts for part in ("node_modules", "__pycache__")):
        return False
    if path.suffix in (".db", ".sqlite", ".sqlite3", ".coverage"):
        return False
    return not any(relative.startswith(prefix) for prefix in ALLOWED_DDL_PATHS)


def emit(diagnostics: list[Diagnostic], json_output: bool) -> None:
    payload = {"ok": not diagnostics, "diagnostics": [asdict(item) for item in diagnostics]}
    if json_output:
        print(json.dumps(payload, ensure_ascii=True, indent=2, sort_keys=True))
    elif diagnostics:
        for item in diagnostics:
            print(f"{item.code}: {item.path}: {item.message}")
    else:
        print("fresh schema ok")


def main() -> int:
    args = parse_args()
    fixture = fixture_diagnostics(args.database_url)
    diagnostics = fixture if fixture is not None else check_live_database(args.database_url)
    emit(diagnostics, args.json_output)
    if any(item.code == "database_url_missing" for item in diagnostics):
        return 2
    return 0 if not diagnostics else 1


if __name__ == "__main__":
    raise SystemExit(main())

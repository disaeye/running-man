from __future__ import annotations

import sys
from dataclasses import dataclass
from importlib import import_module
from pathlib import Path
from typing import Any, Final

from metadata_parity_normalize import (
    compile_type,
    defaults_match,
    metadata_default,
    normalize_default,
    normalize_type,
)
from sqlalchemy import MetaData, create_engine, inspect, text
from sqlalchemy.engine import Connection
from sqlalchemy.engine.interfaces import Dialect, ReflectedColumn
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.schema import Column

REPO_ROOT: Final = Path(__file__).resolve().parents[1]
API_SRC: Final = REPO_ROOT / "apps" / "api" / "src"
DEFAULT_METADATA_MODULE: Final = "infrastructure.db.models"
MODEL_MODULES: Final = (
    "infrastructure.db.models",
    "infrastructure.db.models.sharing",
    "infrastructure.db.models.strength",
    "infrastructure.db.models.sync",
)
EXCLUDED_TABLES: Final = frozenset({"alembic_version"})


@dataclass(frozen=True, slots=True)
class Diagnostic:
    code: str
    path: str
    message: str
    expected: str | None = None
    actual: str | None = None


@dataclass(frozen=True, slots=True)
class ReflectedColumnInfo:
    name: str
    type_text: str
    nullable: bool
    default: str | None


def load_metadata(module_name: str) -> MetaData:
    if str(API_SRC) not in sys.path:
        sys.path.insert(0, str(API_SRC))
    if str(REPO_ROOT) not in sys.path:
        sys.path.insert(0, str(REPO_ROOT))
    for model_module in MODEL_MODULES:
        import_module(model_module)
    module = import_module(module_name)
    metadata = getattr(module, "metadata", None) or getattr(module, "target_metadata", None)
    if isinstance(metadata, MetaData):
        return metadata
    base = getattr(import_module("infrastructure.db"), "Base")
    base_metadata = getattr(base, "metadata")
    if isinstance(base_metadata, MetaData):
        return base_metadata
    raise TypeError("metadata module must expose SQLAlchemy MetaData")


def check_metadata_parity(database_url: str, module_name: str) -> list[Diagnostic]:
    if not database_url:
        return [Diagnostic("database_url_missing", "database_url", "database URL is required")]
    metadata = load_metadata(module_name)
    engine = create_engine(_sqlalchemy_url(database_url), future=True)
    try:
        with engine.connect() as connection:
            return compare_metadata(connection, metadata)
    except SQLAlchemyError as exc:
        return [Diagnostic("database_error", "database", str(exc))]
    finally:
        engine.dispose()


def compare_metadata(connection: Connection, metadata: MetaData) -> list[Diagnostic]:
    inspector = inspect(connection)
    database_tables = _application_tables(connection, inspector.get_table_names(schema="public"))
    metadata_tables = {
        table.name for table in metadata.tables.values() if table.schema in (None, "public")
    }
    diagnostics = _table_diagnostics(database_tables, metadata_tables)
    for table_name in sorted(database_tables & metadata_tables):
        reflected = _reflected_columns(
            inspector.get_columns(table_name, schema="public"), connection.dialect
        )
        diagnostics.extend(
            _column_diagnostics(
                table_name,
                reflected,
                metadata.tables[table_name].columns,
                connection.dialect,
            )
        )
    return diagnostics


def diagnostic_json(diagnostic: Diagnostic) -> dict[str, str | None]:
    return {
        "code": diagnostic.code,
        "path": diagnostic.path,
        "message": diagnostic.message,
        "expected": diagnostic.expected,
        "actual": diagnostic.actual,
    }


def _sqlalchemy_url(raw_url: str) -> str:
    if raw_url.startswith("postgresql://"):
        return raw_url.replace("postgresql://", "postgresql+psycopg://", 1)
    return raw_url


def _application_tables(connection: Connection, table_names: list[str]) -> set[str]:
    partitions = set(
        connection.execute(
            text("""
            SELECT child.relname
            FROM pg_inherits
            JOIN pg_class child ON child.oid = pg_inherits.inhrelid
            JOIN pg_namespace namespace ON namespace.oid = child.relnamespace
            WHERE namespace.nspname = 'public'
            """)
        ).scalars()
    )
    return {
        table_name
        for table_name in table_names
        if table_name not in EXCLUDED_TABLES
        and table_name not in partitions
        and not table_name.endswith("_archive")
    }


def _table_diagnostics(database_tables: set[str], metadata_tables: set[str]) -> list[Diagnostic]:
    diagnostics: list[Diagnostic] = []
    for table_name in sorted(database_tables - metadata_tables):
        diagnostics.append(
            Diagnostic(
                "missing_metadata_table",
                f"tables.{table_name}",
                "metadata table is missing",
            )
        )
    return diagnostics


def _reflected_columns(
    columns: list[ReflectedColumn], dialect: Dialect
) -> dict[str, ReflectedColumnInfo]:
    result: dict[str, ReflectedColumnInfo] = {}
    for column in columns:
        name = str(column["name"])
        result[name] = ReflectedColumnInfo(
            name=name,
            type_text=normalize_type(compile_type(column["type"], dialect)),
            nullable=bool(column["nullable"]),
            default=normalize_default(column.get("default")),
        )
    return result


def _column_diagnostics(
    table_name: str,
    reflected: dict[str, ReflectedColumnInfo],
    metadata_columns: Any,
    dialect: Dialect,
) -> list[Diagnostic]:
    metadata_by_name = {column.name: column for column in metadata_columns}
    diagnostics = [
        _missing_column(table_name, name)
        for name in sorted(reflected.keys() - metadata_by_name.keys())
    ]
    for column_name in sorted(reflected.keys() & metadata_by_name.keys()):
        diagnostics.extend(
            _drift_diagnostics(
                table_name,
                reflected[column_name],
                metadata_by_name[column_name],
                dialect,
            )
        )
    return diagnostics


def _missing_column(table_name: str, column_name: str) -> Diagnostic:
    return Diagnostic(
        "missing_metadata_column",
        f"tables.{table_name}.columns.{column_name}",
        "metadata column is missing",
    )


def _drift_diagnostics(
    table_name: str,
    reflected: ReflectedColumnInfo,
    metadata_column: Column[Any],
    dialect: Dialect,
) -> list[Diagnostic]:
    path = f"tables.{table_name}.columns.{reflected.name}"
    metadata_type = normalize_type(compile_type(metadata_column.type, dialect))
    column_default = metadata_default(metadata_column, dialect)
    diagnostics: list[Diagnostic] = []
    if metadata_type != reflected.type_text:
        diagnostics.append(
            Diagnostic(
                "type_drift",
                f"{path}.type",
                "column type differs",
                metadata_type,
                reflected.type_text,
            )
        )
    if bool(metadata_column.nullable) != reflected.nullable:
        diagnostics.append(
            Diagnostic(
                "nullability_drift",
                f"{path}.nullable",
                "column nullability differs",
                str(bool(metadata_column.nullable)).lower(),
                str(reflected.nullable).lower(),
            )
        )
    if not defaults_match(metadata_column, column_default, reflected.default):
        diagnostics.append(
            Diagnostic(
                "default_drift",
                f"{path}.default",
                "column default differs",
                column_default,
                reflected.default,
            )
        )
    return diagnostics

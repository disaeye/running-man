from __future__ import annotations

import hashlib
from dataclasses import dataclass
from datetime import UTC, date, datetime
from importlib import import_module
from types import ModuleType
from typing import Any, Literal

from db_maintenance_sql import (
    CATALOG_PARTITIONS_SQL,
    EXISTING_PARTITIONS_SQL,
    PARTITIONED_TABLES,
    PG_CRON_EXTENSION_SQL,
    PG_CRON_JOBS,
    PG_CRON_JOBS_SQL,
    STALE_AUDIT_SQL,
    STALE_RECOMPUTE_SQL,
    UNSCHEDULE_PG_CRON_JOB_SQL,
    PartitionObject,
)

Status = Literal["ok", "permission_denied", "connection_failed"]


@dataclass(frozen=True, slots=True)
class MaintenanceReport:
    status: Status
    payload: dict[str, Any]


@dataclass(frozen=True, slots=True)
class PsycopgModules:
    psycopg: ModuleType
    errors: ModuleType
    rows: ModuleType | None = None


def load_psycopg(include_rows: bool = False) -> PsycopgModules | MaintenanceReport:
    try:
        psycopg_module = import_module("psycopg")
        errors_module = import_module("psycopg.errors")
        rows_module = import_module("psycopg.rows") if include_rows else None
    except ModuleNotFoundError as exc:
        return connection_report(str(exc))
    return PsycopgModules(psycopg=psycopg_module, errors=errors_module, rows=rows_module)


def first_of_month(value: date | None = None) -> date:
    selected = value or datetime.now(UTC).date()
    return date(selected.year, selected.month, 1)


def plan_partitions(months_ahead: int, from_month: date | None = None) -> list[PartitionObject]:
    start = add_months(first_of_month(from_month), 1)
    objects: list[PartitionObject] = []
    for offset in range(months_ahead):
        month_start = add_months(start, offset)
        month_stop = add_months(month_start, 1)
        suffix = month_start.strftime("%Y_%m")
        for table_name in PARTITIONED_TABLES:
            objects.append(
                PartitionObject(
                    table_name=table_name,
                    partition_name=f"{table_name}_{suffix}",
                    month_start=month_start,
                    month_stop=month_stop,
                )
            )
    return objects


def add_months(value: date, months: int) -> date:
    month_index = value.month - 1 + months
    return date(value.year + month_index // 12, month_index % 12 + 1, 1)


def create_partitions(
    database_url: str,
    months_ahead: int,
    dry_run: bool,
    from_month: date | None = None,
) -> MaintenanceReport:
    planned = plan_partitions(months_ahead, from_month)
    if dry_run:
        return partition_report(planned, len(planned), True)
    modules = load_psycopg()
    if isinstance(modules, MaintenanceReport):
        return modules
    try:
        with modules.psycopg.connect(database_url) as conn:
            with conn.transaction(), conn.cursor() as cur:
                existing = existing_partitions(cur)
                missing = [item for item in planned if item.partition_name not in existing]
                for item in missing:
                    cur.execute(item.ddl)
        return partition_report(planned, len(missing), False)
    except (modules.errors.InsufficientPrivilege, modules.errors.ReadOnlySqlTransaction) as exc:
        return permission_report(str(exc))
    except modules.psycopg.Error as exc:
        return connection_report(str(exc))
    except modules.psycopg.OperationalError as exc:
        return connection_report(str(exc))


def partition_catalog_hash(
    database_url: str,
    months_ahead: int,
    dry_run: bool,
    from_month: date | None = None,
) -> MaintenanceReport:
    if dry_run:
        objects = [item.partition_name for item in plan_partitions(months_ahead, from_month)]
        return hash_report(objects, True)
    modules = load_psycopg(include_rows=True)
    if isinstance(modules, MaintenanceReport):
        return modules
    rows_module = modules.rows
    if rows_module is None:
        return connection_report("psycopg.rows unavailable")
    try:
        with modules.psycopg.connect(database_url, row_factory=rows_module.dict_row) as conn:
            cur = conn.cursor()
            cur.execute(CATALOG_PARTITIONS_SQL)
            objects = [
                f"{text_value(row['partition_name'])}:{text_value(row['partition_bound'])}"
                for row in cur.fetchall()
            ]
        return hash_report(objects, False)
    except (modules.errors.InsufficientPrivilege, modules.errors.ReadOnlySqlTransaction) as exc:
        return permission_report(str(exc))
    except modules.psycopg.Error as exc:
        return connection_report(str(exc))
    except modules.psycopg.OperationalError as exc:
        return connection_report(str(exc))


def cleanup_pg_cron(database_url: str, dry_run: bool) -> MaintenanceReport:
    if dry_run:
        return MaintenanceReport(
            status="ok",
            payload={"dry_run": True, "extension_present": False, "jobs_removed": 0},
        )
    modules = load_psycopg()
    if isinstance(modules, MaintenanceReport):
        return modules
    try:
        with modules.psycopg.connect(database_url) as conn:
            with conn.transaction(), conn.cursor() as cur:
                cur.execute(PG_CRON_EXTENSION_SQL)
                extension_present = bool(cur.fetchone()[0])
                if not extension_present:
                    return MaintenanceReport(
                        status="ok",
                        payload={"dry_run": False, "extension_present": False, "jobs_removed": 0},
                    )
                cur.execute(PG_CRON_JOBS_SQL, (list(PG_CRON_JOBS),))
                jobs = [row[0] for row in cur.fetchall()]
                for job in jobs:
                    cur.execute(UNSCHEDULE_PG_CRON_JOB_SQL, (job,))
        return MaintenanceReport(
            status="ok",
            payload={"dry_run": False, "extension_present": True, "jobs_removed": len(jobs)},
        )
    except (modules.errors.InsufficientPrivilege, modules.errors.ReadOnlySqlTransaction) as exc:
        return permission_report(str(exc))
    except modules.psycopg.Error as exc:
        return connection_report(str(exc))
    except modules.psycopg.OperationalError as exc:
        return connection_report(str(exc))


def stale_audit(database_url: str, dry_run: bool) -> MaintenanceReport:
    if dry_run:
        return MaintenanceReport(status="ok", payload={"audits": [], "dry_run": True, "writes": 0})
    modules = load_psycopg(include_rows=True)
    if isinstance(modules, MaintenanceReport):
        return modules
    rows_module = modules.rows
    if rows_module is None:
        return connection_report("psycopg.rows unavailable")
    try:
        with modules.psycopg.connect(database_url, row_factory=rows_module.dict_row) as conn:
            cur = conn.cursor()
            cur.execute(STALE_AUDIT_SQL)
            audits = [dict(row) for row in cur.fetchall()]
        return MaintenanceReport(
            status="ok",
            payload={"audits": audits, "dry_run": False, "writes": 0},
        )
    except (modules.errors.InsufficientPrivilege, modules.errors.ReadOnlySqlTransaction) as exc:
        return permission_report(str(exc))
    except modules.psycopg.Error as exc:
        return connection_report(str(exc))
    except modules.psycopg.OperationalError as exc:
        return connection_report(str(exc))


def stale_recompute_candidates(database_url: str) -> MaintenanceReport:
    modules = load_psycopg()
    if isinstance(modules, MaintenanceReport):
        return modules
    try:
        with modules.psycopg.connect(database_url) as conn:
            cur = conn.cursor()
            cur.execute(STALE_RECOMPUTE_SQL)
            athlete_ids = [text_value(row[0]) for row in cur.fetchall()]
        return MaintenanceReport(
            status="ok",
            payload={"athlete_ids": athlete_ids, "writes": 0},
        )
    except (modules.errors.InsufficientPrivilege, modules.errors.ReadOnlySqlTransaction) as exc:
        return permission_report(str(exc))
    except modules.psycopg.Error as exc:
        return connection_report(str(exc))
    except modules.psycopg.OperationalError as exc:
        return connection_report(str(exc))


def existing_partitions(cur: Any) -> set[str]:
    cur.execute(EXISTING_PARTITIONS_SQL, (list(PARTITIONED_TABLES),))
    return {text_value(row[0]) for row in cur.fetchall()}


def text_value(value: Any) -> str:
    if isinstance(value, bytes):
        return value.decode()
    return str(value)


def partition_report(
    planned: list[PartitionObject], changes: int, dry_run: bool
) -> MaintenanceReport:
    return MaintenanceReport(
        status="ok",
        payload={
            "changes": changes,
            "dry_run": dry_run,
            "health": {
                "months_ahead": len({item.month_start for item in planned}),
                "objects_planned": len(planned),
                "tables": list(PARTITIONED_TABLES),
            },
        },
    )


def hash_report(objects: list[str], dry_run: bool) -> MaintenanceReport:
    digest = hashlib.sha256("\n".join(objects).encode()).hexdigest()
    return MaintenanceReport(
        status="ok",
        payload={"catalog_hash": digest, "dry_run": dry_run, "objects": objects},
    )


def permission_report(message: str) -> MaintenanceReport:
    return MaintenanceReport(status="permission_denied", payload={"message": message})


def connection_report(message: str) -> MaintenanceReport:
    return MaintenanceReport(status="connection_failed", payload={"message": message})

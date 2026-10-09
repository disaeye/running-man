#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import sys
from collections.abc import Callable
from datetime import date
from pathlib import Path
from typing import Any, cast
from uuid import UUID

import anyio
from db_maintenance import (
    cleanup_pg_cron,
    create_partitions,
    partition_catalog_hash,
    stale_audit,
    stale_recompute_candidates,
)

REPO_ROOT = Path(__file__).resolve().parents[1]
API_SRC = REPO_ROOT / "apps" / "api" / "src"
if str(API_SRC) not in sys.path:
    sys.path.insert(0, str(API_SRC))


def parse_month(value: str | None) -> date | None:
    return None if value is None else date.fromisoformat(value)


def database_url(cli_value: str | None) -> str | None:
    return cli_value or os.environ.get("DATABASE_URL")


def emit_json(payload: dict[str, Any]) -> None:
    print(json.dumps(payload, ensure_ascii=True, sort_keys=True))


def emit_text(payload: dict[str, Any]) -> None:
    print(json.dumps(payload, indent=2, default=str))


def emit(payload: dict[str, Any], json_output: bool) -> None:
    if json_output:
        emit_json(payload)
    else:
        emit_text(payload)


def missing_database_url(json_output: bool) -> int:
    emit({"error": "missing_database_url", "status": "error"}, json_output)
    return 2


def command_partitions(args: argparse.Namespace) -> int:
    url = database_url(args.database_url)
    if url is None:
        return missing_database_url(args.json)
    report = create_partitions(url, args.months_ahead, args.dry_run, parse_month(args.from_month))
    emit({"status": report.status, **report.payload}, args.json)
    return 0 if report.status == "ok" else 1


def command_partition_hash(args: argparse.Namespace) -> int:
    url = database_url(args.database_url)
    if url is None:
        return missing_database_url(args.json)
    report = partition_catalog_hash(
        url,
        args.months_ahead,
        args.dry_run,
        parse_month(args.from_month),
    )
    emit({"status": report.status, **report.payload}, args.json)
    return 0 if report.status == "ok" else 1


def command_cleanup_pg_cron(args: argparse.Namespace) -> int:
    url = database_url(args.database_url)
    if url is None:
        return missing_database_url(args.json)
    report = cleanup_pg_cron(url, args.dry_run)
    emit({"status": report.status, **report.payload}, args.json)
    return 0 if report.status == "ok" else 1


def command_stale_audit(args: argparse.Namespace) -> int:
    url = database_url(args.database_url)
    if url is None:
        return missing_database_url(args.json)
    report = stale_audit(url, args.dry_run)
    emit({"status": report.status, **report.payload}, args.json)
    return 0 if report.status == "ok" else 1


def command_stale_recompute(args: argparse.Namespace) -> int:
    url = database_url(args.database_url)
    if url is None:
        return missing_database_url(args.json)
    if args.dry_run:
        emit({"status": "ok", "dry_run": True, "athlete_ids": [], "writes": 0}, args.json)
        return 0
    report = stale_recompute_candidates(url)
    if report.status != "ok":
        emit({"status": report.status, "dry_run": False, **report.payload}, args.json)
        return 1
    payload = anyio.run(_run_stale_recompute, _athlete_ids(report.payload))
    emit({"status": "ok", **payload}, args.json)
    return 0


def _athlete_ids(payload: dict[str, Any]) -> list[str]:
    values = payload.get("athlete_ids", [])
    return [str(value) for value in values] if isinstance(values, list) else []


async def _run_stale_recompute(raw_athlete_ids: list[str]) -> dict[str, Any]:
    from application.computation.orchestration import run_stale_computations  # noqa: PLC0415

    results: list[dict[str, object]] = []
    for raw_athlete_id in raw_athlete_ids:
        athlete_id = UUID(raw_athlete_id)
        staleness = await run_stale_computations(athlete_id, "maintenance")
        results.append(
            {
                "athlete_id": raw_athlete_id,
                "physiology_stale": staleness.physiology_stale,
            }
        )
    return {"dry_run": False, "results": results, "writes": len(results)}


def add_shared_options(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("--database-url")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--json", action="store_true")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser()
    subparsers = parser.add_subparsers(dest="command", required=True)

    partitions = subparsers.add_parser("partitions")
    add_shared_options(partitions)
    partitions.add_argument("--months-ahead", type=int, default=24)
    partitions.add_argument("--from-month")
    partitions.set_defaults(func=command_partitions)

    partition_hash = subparsers.add_parser("partition-hash")
    add_shared_options(partition_hash)
    partition_hash.add_argument("--months-ahead", type=int, default=24)
    partition_hash.add_argument("--from-month")
    partition_hash.set_defaults(func=command_partition_hash)

    cleanup = subparsers.add_parser("cleanup-pg-cron")
    add_shared_options(cleanup)
    cleanup.set_defaults(func=command_cleanup_pg_cron)

    stale = subparsers.add_parser("stale-audit")
    add_shared_options(stale)
    stale.set_defaults(func=command_stale_audit)

    stale_recompute = subparsers.add_parser("stale-recompute")
    add_shared_options(stale_recompute)
    stale_recompute.set_defaults(func=command_stale_recompute)
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv if argv is not None else sys.argv[1:])
    command = cast(Callable[[argparse.Namespace], int], args.func)
    return command(args)


if __name__ == "__main__":
    raise SystemExit(main())

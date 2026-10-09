#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path
from typing import Final
from uuid import UUID

REPO_ROOT: Final = Path(__file__).resolve().parents[1]
API_DIR: Final = REPO_ROOT / "apps" / "api"

try:
    import anyio
    import psycopg
except ModuleNotFoundError:
    if os.environ.get("RECOMPUTE_VERIFY_UV_BOOTSTRAPPED") == "1":
        raise
    os.environ["RECOMPUTE_VERIFY_UV_BOOTSTRAPPED"] = "1"
    os.execvp(
        "uv",
        ["uv", "run", "--project", str(API_DIR), "python", str(Path(__file__)), *sys.argv[1:]],
    )

    raise

if str(API_DIR / "src") not in sys.path:
    sys.path.insert(0, str(API_DIR / "src"))
if str(API_DIR) not in sys.path:
    sys.path.insert(0, str(API_DIR))

from psycopg.rows import DictRow  # noqa: E402

from application.load import recompute as activity_recompute  # noqa: E402
from application.load.activity_facts import ActivityMetricFact  # noqa: E402
from application.load.recompute import recompute_activity_load_facts  # noqa: E402
from tests.integration.recompute_verifier_helpers import (  # noqa: E402
    ATHLETE_ID,
    configure_database,
    current_fact_hash,
    run_status_counts,
    seed_idempotency_inputs,
)


class ParsedArgs(argparse.Namespace):
    database_url: str
    inject_failure_after_rows: int | None
    json_output: bool

    def __init__(self) -> None:
        super().__init__()
        self.database_url = ""
        self.inject_failure_after_rows = None
        self.json_output = False


def parse_args() -> ParsedArgs:
    parser = argparse.ArgumentParser()
    _ = parser.add_argument("--database-url", default=os.environ.get("TEST_DATABASE_URL", ""))
    _ = parser.add_argument("--inject-failure-after-rows", type=int)
    _ = parser.add_argument("--json", action="store_true", dest="json_output")
    args = ParsedArgs()
    return parser.parse_args(namespace=args)


async def verify(args: ParsedArgs) -> dict[str, object]:
    if not args.database_url:
        return {"ok": False, "error": "missing_database_url"}
    configure_database(args.database_url)
    seed_idempotency_inputs(args.database_url)
    first = await recompute_activity_load_facts(ATHLETE_ID, "verify")
    before = current_fact_hash(args.database_url)
    second = await recompute_activity_load_facts(ATHLETE_ID, "verify")
    after = current_fact_hash(args.database_url)
    payload: dict[str, object] = {
        "ok": before.fact_hash == after.fact_hash and second.status == "skipped",
        "first_status": first.status,
        "second_status": second.status,
        "prior_hash": before.fact_hash,
        "after_hash": after.fact_hash,
        "run_status_counts": run_status_counts(args.database_url),
    }
    if args.inject_failure_after_rows is not None:
        failure = await _verify_failure(args, before.fact_hash)
        payload |= failure
        payload["ok"] = bool(payload["ok"]) and bool(failure["failure_ok"])
    return payload


async def _verify_failure(args: ParsedArgs, prior_hash: str) -> dict[str, object]:
    original_insert = activity_recompute._insert_facts
    limit = args.inject_failure_after_rows
    assert limit is not None

    async def fail_after_rows(
        conn: psycopg.AsyncConnection[DictRow],
        athlete_id: UUID,
        run_id: UUID,
        facts: tuple[ActivityMetricFact, ...],
    ) -> int:
        await original_insert(conn, athlete_id, run_id, facts[:limit])
        message = "simulated verifier failure"
        raise psycopg.OperationalError(message)

    activity_recompute._insert_facts = fail_after_rows
    try:
        await _add_changed_input(args.database_url)
        try:
            _ = await recompute_activity_load_facts(ATHLETE_ID, "verify-failure")
        except psycopg.OperationalError:
            pass
    finally:
        activity_recompute._insert_facts = original_insert
    after = current_fact_hash(args.database_url)
    return {
        "failure_ok": after.fact_hash == prior_hash and after.failed_runs == 1,
        "failure_hash": after.fact_hash,
        "failed_runs": after.failed_runs,
    }


async def _add_changed_input(database_url: str) -> None:
    with psycopg.connect(database_url) as conn, conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO activity_streams (sample_time, activity_id, athlete_id, metric_type, value)
            VALUES ('2026-07-15T00:01:00+00:00', 'verify-power', %s, 'power', 250)
            """,
            (ATHLETE_ID,),
        )
        conn.commit()


def main() -> int:
    args = parse_args()
    payload = anyio.run(verify, args)
    print(json.dumps(payload, ensure_ascii=True, sort_keys=True))
    return 0 if payload.get("ok") is True else 1


if __name__ == "__main__":
    raise SystemExit(main())

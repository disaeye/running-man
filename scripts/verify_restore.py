#!/usr/bin/env python3
import argparse
import asyncio
import sys
from collections.abc import Sequence
from typing import cast

KEY_TABLES = (
    "athletes",
    "revoked_tokens",
    "login_attempts",
    "health_wellness",
    "activity_summary",
    "activity_streams",
    "training_calendar",
    "ftp_history",
    "webhook_events",
)


async def count_rows(db_url: str, table: str) -> int:
    proc = await asyncio.create_subprocess_exec(
        "psql",
        db_url,
        "-Atc",
        f'SELECT count(*) FROM "{table}"',
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    stdout, stderr = await proc.communicate()
    if proc.returncode != 0:
        error = stderr.decode().strip()
        raise RuntimeError(f"Failed to count {table}: {error}")
    return int(stdout.decode().strip())


async def verify_restore(original_url: str, restored_url: str) -> dict[str, tuple[int, int, bool]]:
    results: dict[str, tuple[int, int, bool]] = {}
    for table in KEY_TABLES:
        original_count, restored_count = await asyncio.gather(
            count_rows(original_url, table),
            count_rows(restored_url, table),
        )
        results[table] = (original_count, restored_count, original_count == restored_count)
    return results


def print_results(results: dict[str, tuple[int, int, bool]]) -> None:
    for table, (original, restored, matches) in results.items():
        status = "OK" if matches else "MISMATCH"
        print(f"{table}: original={original} restored={restored} {status}")


def parse_args(argv: Sequence[str] | None = None) -> tuple[str, str]:
    parser = argparse.ArgumentParser(
        description="Compare row counts between original and restored DBs."
    )
    _ = parser.add_argument("original_url")
    _ = parser.add_argument("restored_url")
    values = parser.parse_args(argv or sys.argv[1:])
    return cast(str, values.original_url), cast(str, values.restored_url)


async def main() -> int:
    original_url, restored_url = parse_args()
    results = await verify_restore(original_url, restored_url)
    print_results(results)
    return 0 if all(match for _, _, match in results.values()) else 1


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))

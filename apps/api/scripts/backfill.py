#!/usr/bin/env python
# pyright: reportMissingTypeStubs=false

from __future__ import annotations

import argparse
import asyncio
from datetime import date
from typing import NamedTuple, cast

import psycopg
from intervals.client import IntervalsClient
from intervals.sync import ActivitiesClient, backfill_activities


class BackfillArgs(NamedTuple):
    athlete_id: str
    from_date: date
    to_date: date
    dsn: str
    api_key: str | None


def parse_args() -> BackfillArgs:
    parser = argparse.ArgumentParser(description="Backfill Intervals.icu activity summaries")
    _ = parser.add_argument("athlete_id")
    _ = parser.add_argument("from_date", type=date.fromisoformat)
    _ = parser.add_argument("to_date", type=date.fromisoformat)
    _ = parser.add_argument("--dsn", required=True, help="PostgreSQL DSN")
    _ = parser.add_argument("--api-key", default=None, help="Intervals.icu API key")
    namespace = parser.parse_args()
    return BackfillArgs(
        athlete_id=cast(str, namespace.athlete_id),
        from_date=cast(date, namespace.from_date),
        to_date=cast(date, namespace.to_date),
        dsn=cast(str, namespace.dsn),
        api_key=cast(str | None, namespace.api_key),
    )


async def main() -> None:
    args = parse_args()
    with psycopg.connect(args.dsn) as db_conn:
        async with IntervalsClient(api_key=args.api_key) as client:
            count = await backfill_activities(
                args.athlete_id,
                cast(ActivitiesClient, client),
                db_conn,
                args.from_date,
                args.to_date,
            )
        db_conn.commit()
    print(f"upserted {count.upserted} activity summaries; deduplicated {count.deduplicated}")


if __name__ == "__main__":
    asyncio.run(main())

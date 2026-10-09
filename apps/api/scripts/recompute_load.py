import argparse
from dataclasses import dataclass
from typing import cast
from uuid import UUID

import anyio

from application.computation.orchestration import recompute_after_activity_change


@dataclass(frozen=True)
class Args:
    athlete_id: UUID


def parse_args() -> Args:
    parser = argparse.ArgumentParser(description="Recompute activity TSS and daily load")
    _ = parser.add_argument("athlete_id", type=UUID)
    namespace = parser.parse_args()
    return Args(athlete_id=cast(UUID, namespace.athlete_id))


async def main() -> None:
    args = parse_args()
    result = await recompute_after_activity_change(args.athlete_id, "manual")
    count = result.activity_load.rows_affected
    print(f"recomputed {count} activities")


if __name__ == "__main__":
    anyio.run(main)

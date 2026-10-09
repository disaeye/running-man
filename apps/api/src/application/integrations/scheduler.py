"""Scheduled activity sync.

The settings screen has always let an athlete choose ``auto_sync`` and a
``sync_frequency``, and the API has always stored them — but nothing ever read
them, so the product only ever updated when someone pressed the button by hand.
That is why a dashboard could sit three weeks stale while its own status
indicator claimed the sync link was fine.

This module is the missing reader. It runs on a timer, decides which athletes
are *due* for a sync from their stored settings, and runs them through the same
job the manual button uses — so there is one sync path, not two.

Design decisions worth stating:

* **Due, not periodic.** A single timer at a fixed cadence would either sync
  daily users hourly or hourly users daily. Instead the timer runs often and
  each athlete is checked against their own frequency and their last sync time.
* **Never overlap.** An athlete whose previous sync is still ``running`` is
  skipped, as is one synced more recently than the jitter window allows. The
  manual endpoint makes the same check; a timer that ignored it could stack
  concurrent syncs on the same account.
* **Failures are recorded, not raised.** One athlete's expired credentials must
  not stop the others, and the failure has to be visible in the app — so it is
  written to ``integration_sync_runs``/``integration_sync_errors`` through the
  normal job path and the run continues.
* **No credentials in logs.** Only the source name and athlete id are logged.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from time import monotonic
from typing import Final
from uuid import UUID

import anyio

from infrastructure.db.pool import close_pool, get_pool, open_pool
from infrastructure.repositories.activity import ActivitySyncStats
from infrastructure.repositories.integrations import UserIntegrationRepo
from presentation.api.integration_helpers import decrypt_credentials, sync
from presentation.api.integration_sync_detail import (
    IntegrationSyncResult,
    empty_sync_result,
    sync_detail,
)

# Cadence a frequency maps to. ``manual`` is absent on purpose: it means "never
# sync without being asked", which is the setting's whole point.
FREQUENCY_INTERVALS: Final[dict[str, timedelta]] = {
    "hourly": timedelta(hours=1),
    "daily": timedelta(days=1),
}

# Slack applied before an athlete counts as due, so a timer that fires a few
# minutes early on an hourly schedule does not skip a whole cycle.
DUE_TOLERANCE: Final = timedelta(minutes=5)

# Sources the scheduler knows how to sync. Others are skipped rather than
# attempted and failed.
SCHEDULED_SOURCES: Final[frozenset[str]] = frozenset({"intervals_icu"})


@dataclass(frozen=True, slots=True)
class SyncTarget:
    athlete_id: UUID
    source: str
    credentials: dict[str, object]
    frequency: str


@dataclass(frozen=True, slots=True)
class ScheduleReport:
    considered: int
    due: int
    synced: int
    failed: int
    skipped: list[str]

    def summary(self) -> str:
        return (
            f"considered={self.considered} due={self.due} "
            f"synced={self.synced} failed={self.failed}"
        )


def is_due(
    frequency: str,
    last_sync_at: datetime | None,
    now: datetime,
) -> bool:
    """Whether an athlete with this frequency should sync now.

    ``auto_sync`` is handled by the caller (it decides whether a row is
    considered at all); this answers only the timing question.

    An athlete who has never synced is due immediately: waiting a full interval
    after connecting a source would leave the first sync a day away and the app
    empty in the meantime.
    """
    interval = FREQUENCY_INTERVALS.get(frequency)
    if interval is None:
        return False
    if last_sync_at is None:
        return True
    if last_sync_at.tzinfo is None:
        # Stored timestamps are timestamptz, but a naive value from a fixture
        # would otherwise raise on comparison. Treat it as UTC.
        last_sync_at = last_sync_at.replace(tzinfo=UTC)
    age = now - last_sync_at
    # A last_sync_at in the future (clock skew, bad data) must not block
    # syncing forever.
    if age < timedelta(0):
        return True
    return age >= interval - DUE_TOLERANCE


async def collect_targets(now: datetime) -> tuple[list[SyncTarget], list[str]]:
    """Every athlete due for a sync right now, plus why others were skipped."""
    skipped: list[str] = []
    targets: list[SyncTarget] = []

    async with get_pool().connection() as conn, conn.cursor() as cur:
        _ = await cur.execute(
            """
            SELECT athlete_id, source, settings, credentials,
                   last_sync_at, last_sync_status
            FROM user_integrations
            WHERE connected = true
            ORDER BY athlete_id, source
            """
        )
        rows = [dict(row) for row in await cur.fetchall()]

    for row in rows:
        raw_settings = row.get("settings")
        settings = raw_settings if isinstance(raw_settings, dict) else {}
        source = str(row["source"])

        if source not in SCHEDULED_SOURCES:
            skipped.append(f"{source}:unsupported")
            continue
        if not settings.get("auto_sync", True):
            skipped.append(f"{source}:auto_sync_off")
            continue
        frequency = str(settings.get("sync_frequency") or "daily")
        if frequency not in FREQUENCY_INTERVALS:
            # "manual" lands here, as does any unrecognised value.
            skipped.append(f"{source}:frequency={frequency}")
            continue
        if row.get("last_sync_status") == "running":
            # A previous run is still going; stacking another would double-write.
            skipped.append(f"{source}:already_running")
            continue

        last_sync_at = row.get("last_sync_at")
        if not isinstance(last_sync_at, datetime):
            last_sync_at = None
        if not is_due(frequency, last_sync_at, now):
            skipped.append(f"{source}:not_due")
            continue

        decrypted = _credentials(row)
        if decrypted is None:
            skipped.append(f"{source}:no_credentials")
            continue

        targets.append(
            SyncTarget(
                athlete_id=UUID(str(row["athlete_id"])),
                source=source,
                credentials=decrypted,
                frequency=frequency,
            )
        )

    return targets, skipped


def _credentials(row: dict[str, object]) -> dict[str, object] | None:
    """Decrypt stored credentials, or ``None`` when unavailable.

    Decryption failure means the key changed or the value is corrupt; the
    athlete has to reconnect, which is a state the app can show. Crashing the
    whole run over one bad row would hide the other athletes' syncs.
    """
    try:
        return decrypt_credentials(row)
    except Exception:
        # Also catches the HTTPException that helper raises for a malformed
        # row: one athlete's bad credentials must not abort the run.
        return None




async def run_due_syncs(now: datetime | None = None) -> ScheduleReport:
    """Sync every athlete whose settings say they are due."""
    await open_pool()
    moment = now or datetime.now(UTC)
    targets, skipped = await collect_targets(moment)

    synced = 0
    failed = 0
    for target in targets:
        ok = await _run_one(target)
        synced += 1 if ok else 0
        failed += 0 if ok else 1

    return ScheduleReport(
        considered=len(targets) + len(skipped),
        due=len(targets),
        synced=synced,
        failed=failed,
        skipped=skipped,
    )


async def _run_one(target: SyncTarget) -> bool:
    """Run one sync through the manual path, recording the outcome either way."""
    repo = UserIntegrationRepo()
    started_at = monotonic()
    running_detail = sync_detail(empty_sync_result(), started_at, "running", None)
    await repo.update_sync_status(
        target.athlete_id, target.source, "running", None, running_detail
    )
    try:
        result = await sync(target.source, target.athlete_id, target.credentials)
    except Exception as error:
        message = f"{type(error).__name__}: {error}"
        detail = sync_detail(empty_sync_result(), started_at, "failed", message)
        await repo.update_sync_status(
            target.athlete_id, target.source, "failed", message, detail
        )
        return False

    detail = sync_detail(_as_result(result), started_at, "success", None)
    await repo.update_sync_status(
        target.athlete_id, target.source, "success", None, detail
    )
    return True


def _as_result(result: ActivitySyncStats | IntegrationSyncResult) -> IntegrationSyncResult:
    """Normalize the two shapes the sync layer can return."""
    if isinstance(result, IntegrationSyncResult):
        return result
    return IntegrationSyncResult(activity_stats=result)


async def main() -> int:
    """Entry point kept async so tests can await a scheduling pass directly."""
    report = await run_due_syncs()
    print(report.summary())
    return 0


async def _run_pass() -> ScheduleReport:
    """Zero-argument wrapper around :func:`run_due_syncs`.

    ``anyio.run`` is typed as ``Callable[[Unpack[PosArgsT]], Awaitable[T]]``;
    passing a function that has a defaulted parameter confuses the unpack
    inference in mypy, so the argument is bound here instead.
    """
    return await run_due_syncs()


def cli() -> int:
    """Run one scheduling pass, then close the pool.

    The pool is closed *inside* the event loop: ``close_pool`` is a coroutine,
    and calling it from the synchronous side of ``anyio.run`` would leave it
    un-awaited — the process exits either way, but a test that drives
    :func:`_scheduler_pass` directly would leak the pool across cases.
    """
    report = anyio.run(_scheduler_pass)
    print(report.summary())
    if report.skipped:
        # Printed rather than logged: this is a one-shot unit, and the reason an
        # athlete was skipped is the first thing to check when a dashboard looks
        # stale.
        print("skipped: " + ", ".join(sorted(set(report.skipped))))
    return 0


async def _scheduler_pass() -> ScheduleReport:
    """One scheduling pass, with the connection pool cleaned up afterwards."""
    try:
        return await run_due_syncs()
    finally:
        await close_pool()


if __name__ == "__main__":
    raise SystemExit(cli())

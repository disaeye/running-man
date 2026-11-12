"""Gate execution: cache verdict, then run the gate's command.

Split out of ``run_gates.py`` (which keeps gate definitions and the CLI) so each
file stays within the repository's size limit. A gate that runs and passes has
its input digest stored; the next run with identical inputs skips it as CACHED.
Only passes are cached — failures always re-run.
"""

from __future__ import annotations

import os
import subprocess
import threading
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Callable, Final

import gate_cache
import gate_e2e as _e2e
import gate_server as _server

FAIL_OUTPUT_TAIL: Final = 40
PRINT_LOCK: Final = threading.Lock()


@dataclass(slots=True)
class Gate:
    """One quality gate: command plus everything the runner needs to schedule it."""

    group: str
    name: str
    command: list[str]
    cwd: Path
    timeout: int = 300
    skip_reason: str | None = None
    failure_hint: str = ""
    env: dict[str, str] = field(default_factory=dict)
    needs_gate_server: bool = False
    # Cache inputs: repository-relative prefixes; ``excludes`` are pruned from
    # them (a gate's own outputs are not its inputs).
    inputs: tuple[str, ...] = ()
    excludes: tuple[str, ...] = ()
    salt: str = ""
    after: tuple[str, ...] = ()
    # Runtime precondition checked before a cached pass is honoured; returns a
    # problem string (cache miss) or None (honour the cache).
    verify: Callable[[], str | None] | None = None
    # This gate rewrites repository files (registry generation); the snapshot
    # must be recomputed before any later gate hashes its inputs.
    invalidates_snapshot: bool = False

    @property
    def slug(self) -> str:
        return f"{self.group}-{self.name}".replace(" ", "-").replace("/", "-")


def say(line: str) -> None:
    with PRINT_LOCK:
        print(line, flush=True)


class Snapshot:
    """Memoized repository snapshot, invalidated when a gate rewrites files."""

    def __init__(self) -> None:
        self._files: dict[str, str] | None = None
        self._lock = threading.Lock()

    def files(self) -> dict[str, str]:
        with self._lock:
            if self._files is None:
                self._files = gate_cache.snapshot_repo()
            return self._files

    def invalidate(self) -> None:
        with self._lock:
            self._files = None


def execute(gate: Gate, snapshot: Snapshot, use_cache: bool) -> tuple[str, str | None]:
    """Run one gate; returns (status, note) with the failure tail printed."""
    say(f"▶ {gate.group}/{gate.name} …")
    if gate.skip_reason is not None:
        say(f"  SKIP  {gate.slug}  ({gate.skip_reason})")
        return "SKIP", gate.skip_reason
    digest: str | None = None
    if use_cache:
        # The command itself is part of the verdict: editing what a gate runs
        # must invalidate the pass earned by the previous command.
        salt = repr((gate.command, str(gate.cwd), sorted(gate.env.items()), gate.salt))
        digest = gate_cache.gate_digest(
            snapshot.files(), gate.inputs, gate.excludes, f"{gate.slug}|{salt}"
        )
        record = gate_cache.lookup(gate.slug, digest)
        if record is not None:
            problem = gate.verify() if gate.verify is not None else None
            if problem is None:
                passed_at = float(record["passed_at"])  # type: ignore[arg-type]
                when = time.strftime("%m-%d %H:%M", time.localtime(passed_at))
                say(f"  CACHED  {gate.slug}  (inputs unchanged since pass at {when})")
                return "CACHED", f"inputs unchanged since pass at {when}"
            say(f"  ! cache not honoured: {problem}")
    started = time.monotonic()
    try:
        completed = run_command(gate)
    except subprocess.TimeoutExpired:
        return fail(gate, f"timeout after {gate.timeout}s", time.monotonic() - started)
    except OSError as error:
        return fail(gate, str(error), time.monotonic() - started)
    seconds = time.monotonic() - started
    if gate.invalidates_snapshot:
        snapshot.invalidate()
    if completed.returncode != 0:
        return fail(gate, output_tail(gate, completed), seconds)
    if digest is not None:
        gate_cache.store(gate.slug, digest, seconds)
    say(f"  PASS  {gate.slug}  {seconds:.1f}s")
    return "PASS", None


def run_command(gate: Gate) -> subprocess.CompletedProcess[str]:
    env = dict(os.environ)
    if gate.needs_gate_server:
        # Restart here, not when the gate list is built: `next build` may have
        # run earlier and rewritten the gate dist directory, and the server must
        # serve the build that exists on disk right now.
        for note in (_server.prepare_server(), _server.ensure_server()):
            if note:
                say(f"  ! {note}")
        env.update(_e2e.e2e_env())
    env.update(gate.env)
    try:
        return subprocess.run(
            gate.command,
            cwd=gate.cwd,
            capture_output=True,
            text=True,
            timeout=gate.timeout,
            env=env,
        )
    finally:
        if gate.needs_gate_server:
            _server.stop_server()


def fail(gate: Gate, tail: str, seconds: float) -> tuple[str, str | None]:
    if gate.failure_hint:
        tail = f"{tail}\nhint: {gate.failure_hint}" if tail else gate.failure_hint
    if tail:
        for line in tail.splitlines():
            say(f"    | {line}")
    say(f"  FAIL  {gate.slug}  {seconds:.1f}s")
    return "FAIL", tail.splitlines()[0] if tail else None


def output_tail(gate: Gate, completed: subprocess.CompletedProcess[str]) -> str:
    output = (completed.stdout + "\n" + completed.stderr).strip().splitlines()
    return "\n".join(output[-FAIL_OUTPUT_TAIL:])

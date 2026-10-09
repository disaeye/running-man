"""Playwright gate for ``scripts/run_gates.py``.

Split out to keep the runner within the repository's file-size limit.

Two things this gate has to get right, both learned by getting them wrong:

**The server must match the build.** ``next start`` reads its chunk manifest at
boot. Rebuilding while it runs replaces that manifest and the chunk files
underneath it, so the served HTML references assets the process cannot find and
every page fails to hydrate. Running ``next build`` immediately before the suite
made it fail while it passed when run alone — the failure had nothing to do with
the change under test. The gate therefore restarts the frontend itself, so it
runs against the build it just produced.

**Browser workers must be serial.** The suite drives a single frontend; with
several workers the calendar's month grid intermittently lost the race to load
its chunk.
"""

from __future__ import annotations

import os
import subprocess
from dataclasses import dataclass
from pathlib import Path
from typing import Final
from urllib.error import URLError
from urllib.request import urlopen

REPO_ROOT: Final = Path(__file__).resolve().parents[1]
WEB_DIR: Final = REPO_ROOT / "apps" / "web"
E2E_BASE_URL: Final = "http://localhost:28801"
E2E_SERVICE: Final = "running-man-e2e.service"

# The bundled Playwright browsers are not downloaded on this host; the system
# Chrome works and is what the suite has been verified against.
CHROME_CANDIDATES: Final = (
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
)


@dataclass(slots=True)
class E2eGate:
    """Gate definition mirroring the runner's Gate, without importing it."""

    group: str
    name: str
    command: list[str]
    cwd: Path
    timeout: int
    skip_reason: str | None = None
    failure_hint: str = ""


def e2e_gate(fast: bool) -> E2eGate:
    """The functional Playwright projects.

    The visual-baseline project is excluded: it compares screenshots against
    baselines that are not part of this repository, so it can only pass on a
    machine that generated them.
    """
    skip = e2e_skip_reason(fast)
    return E2eGate(
        group="web",
        name="e2e (playwright)",
        command=[
            "npx",
            "playwright",
            "test",
            "--project=chromium",
            "--reporter=line",
            # Serial, with retries. The suite drives a real browser against a
            # real server on a shared machine: the failures seen here were
            # timing flakes (a route compile or a fetch landing late), each of
            # which passed on a re-run, never a behavioural regression. Two
            # retries rather than one because the pressure is cumulative — a
            # single flake late in the run can consume the only retry, and at
            # ~2.5 minutes per attempt the cost of a third is small next to
            # reporting infrastructure noise as a broken build. Retried passes
            # are reported as "flaky", so a suite that needs this consistently
            # is still visible.
            "--workers=1",
            "--retries=2",
        ],
        cwd=WEB_DIR,
        timeout=900,
        skip_reason=skip,
        failure_hint=(
            "start the frontend first: systemctl --user start " + E2E_SERVICE
        ),
    )


def prepare_server() -> str | None:
    """Restart the frontend so it serves the current build.

    Returns a note when it restarted, or ``None`` when no action was needed.
    A failure to restart is not fatal: the gate may still pass if the running
    build happens to be current.
    """
    if not _unit_exists():
        return None
    build_id = WEB_DIR / ".next" / "BUILD_ID"
    if build_id.exists() and not _restart_needed():
        return None
    try:
        completed = subprocess.run(
            ["systemctl", "--user", "restart", E2E_SERVICE],
            capture_output=True,
            text=True,
            timeout=30,
            check=False,
        )
    except (OSError, subprocess.SubprocessError):
        return None
    if completed.returncode != 0:
        return None
    _wait_for_server()
    # Warm every route the suite visits, synchronously, and only then report
    # ready. A freshly restarted `next start` compiles a page on its first
    # request; on this machine that first hit can take several seconds, which
    # pushed individual assertions past their timeouts mid-suite (always around
    # the calendar routes, which are the heaviest). Warming keeps that cost out
    # of the timed assertions.
    _warm_routes()
    return "restarted the frontend to serve the current build"


WARM_ROUTES: Final = (
    "/",
    "/calendar",
    "/calendar?view=month",
    "/calendar?view=list",
    "/analysis",
    "/goals",
    "/settings?section=data",
    "/settings?section=account",
    "/activities",
)


def _warm_routes(attempts: int = 3) -> None:
    """Request each route until it answers, so the compile happens here."""
    for route in WARM_ROUTES:
        for attempt in range(attempts):
            if _url_responds(f"{E2E_BASE_URL}{route}"):
                break
            if attempt == attempts - 1:
                # Not fatal: the suite will surface a genuine failure. Warming
                # is an optimisation, not a gate of its own.
                break
            import time

            time.sleep(1.0)


def _restart_needed() -> bool:
    """Whether the running server started before the current build was written.

    ``systemctl show`` reports both sides in the same monotonic clock domain, so
    the comparison is exact rather than a guess from file mtimes.
    """
    build_monotonic = _file_mtime_monotonic(WEB_DIR / ".next" / "BUILD_ID")
    start_monotonic = _service_start_monotonic()
    if build_monotonic is None or start_monotonic is None:
        # Cannot tell; restarting is cheap and always safe.
        return True
    return start_monotonic < build_monotonic


def _file_mtime_monotonic(path: Path) -> int | None:
    """The file's mtime on the system's monotonic clock, in microseconds.

    ``os.stat`` gives wall-clock mtime, and ``systemd`` reports monotonic. They
    are reconciled through ``/proc/uptime``: mtime converted to an age, then
    subtracted from uptime.
    """
    import time

    try:
        mtime = path.stat().st_mtime
        uptime = _uptime_seconds()
    except OSError:
        return None
    if uptime is None:
        return None
    age = time.time() - mtime
    return int((uptime - age) * 1_000_000)


def _uptime_seconds() -> float | None:
    try:
        raw = Path("/proc/uptime").read_text().split()[0]
        return float(raw)
    except (OSError, IndexError, ValueError):
        return None


def _service_start_monotonic() -> int | None:
    value = _systemctl_show("ActiveEnterTimestampMonotonic")
    if not value:
        return None
    try:
        return int(value)
    except ValueError:
        return None


def _service_start_wallclock() -> str | None:
    return _systemctl_show("ActiveEnterTimestamp")


def _systemctl_show(prop: str) -> str | None:
    try:
        completed = subprocess.run(
            ["systemctl", "--user", "show", E2E_SERVICE, "-p", prop],
            capture_output=True,
            text=True,
            timeout=5,
            check=False,
        )
    except (OSError, subprocess.SubprocessError):
        return None
    if completed.returncode != 0:
        return None
    _, _, value = completed.stdout.strip().partition("=")
    return value.strip() or None


def _unit_exists() -> bool:
    return _service_start_wallclock() is not None


def e2e_skip_reason(fast: bool) -> str | None:
    if fast:
        return "--fast"
    if not _url_responds(f"{E2E_BASE_URL}/"):
        return (
            f"frontend not serving at {E2E_BASE_URL} "
            f"(systemctl --user start {E2E_SERVICE})"
        )
    if not any(Path(candidate).exists() for candidate in CHROME_CANDIDATES):
        return "no Chromium binary found (or set PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH)"
    return None


def e2e_env() -> dict[str, str]:
    """Environment for the e2e gate, pointing Playwright at the system browser."""
    env = dict(os.environ)
    for candidate in CHROME_CANDIDATES:
        if Path(candidate).exists():
            env.setdefault("PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH", candidate)
            break
    return env


def _wait_for_server(timeout_seconds: float = 30.0) -> bool:
    import time

    deadline = time.monotonic() + timeout_seconds
    while time.monotonic() < deadline:
        if _url_responds(f"{E2E_BASE_URL}/"):
            return True
        time.sleep(1.0)
    return False


def _url_responds(url: str) -> bool:
    try:
        with urlopen(url, timeout=3) as response:  # noqa: S310 - fixed local URL
            return response.status < 500
    except (URLError, OSError):
        return False

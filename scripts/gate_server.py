"""Lifecycle of the frontend server the e2e gate drives a browser against.

Split out of ``gate_e2e.py`` to keep both files within the repository's size
limit. Two properties matter, both learned by getting them wrong:

**The server must match the build.** ``next start`` reads its chunk manifest at
boot. Rebuilding while it runs replaces that manifest and the chunk files
underneath it, so the served HTML references assets the process cannot find and
every page fails to hydrate. The gate therefore restarts the frontend itself, so
it runs against the build it just produced.

**An unmanaged responder on the port is a leftover, not a server.** A gate
server from an earlier era holding a months-old manifest will answer the port
just fine while serving pages whose chunks no longer exist, and the suite times
out retrying. When no systemd unit owns the port, any responder is stopped (by
port, never by process name) and replaced with a server for the build on disk.
"""

from __future__ import annotations

import os
import subprocess
import time
from pathlib import Path
from typing import Final
from urllib.error import URLError
from urllib.request import urlopen

from gate_e2e import E2E_BASE_URL, E2E_SERVICE, GATE_DIST_DIR, WEB_DIR

E2E_PORT: Final = "31002/tcp"


def prepare_server() -> str | None:
    """Restart the frontend unit so it serves the current build.

    Returns a note when it restarted, or ``None`` when no action was needed.
    A failure to restart is not fatal: the gate may still pass if the running
    build happens to be current.
    """
    if not _unit_exists():
        return None
    build_id = WEB_DIR / GATE_DIST_DIR / "BUILD_ID"
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
    "/profile",
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
            time.sleep(1.0)


def _restart_needed() -> bool:
    """Whether the running server started before the current build was written.

    ``systemctl show`` reports both sides in the same monotonic clock domain, so
    the comparison is exact rather than a guess from file mtimes.
    """
    build_monotonic = _file_mtime_monotonic(WEB_DIR / GATE_DIST_DIR / "BUILD_ID")
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
    return _systemctl_show("ActiveEnterTimestamp") is not None


_owned_server: subprocess.Popen[bytes] | None = None


def ensure_server() -> str | None:
    """Serve the gate build from this process when no unit is doing it."""
    global _owned_server
    note = None
    if _url_responds(f"{E2E_BASE_URL}/"):
        if _unit_exists() or _owned_server is not None:
            # The unit owns the port (prepare_server restarted it when the
            # build was newer), or this process already serves this build.
            return None
        stop_port()
        if not _wait_for_port_free(15):
            return "could not free the e2e port from an unmanaged server"
        note = "removed an unmanaged leftover server on the e2e port"
    env = dict(os.environ)
    env["NEXT_DIST_DIR"] = GATE_DIST_DIR
    # UTC, matching production: a page that renders a date during render only
    # diverges from the client when the two clocks disagree.
    env["TZ"] = "UTC"
    try:
        _owned_server = subprocess.Popen(
            ["npx", "next", "start", "-p", "31002"],
            cwd=WEB_DIR,
            env=env,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
    except OSError as error:
        return f"could not start the gate server: {error}"
    if not _wait_for_server(120):
        stop_server()
        return f"gate server did not answer on {E2E_BASE_URL}"
    _warm_routes()
    return note or "started a gate server on port 31002"


def stop_port() -> None:
    """Kill whatever holds the e2e port.

    ``fuser -n tcp`` resolves the holder of that exact port; every Next.js
    process on this host shares the same cmdline, so matching by process name
    would kill unrelated servers.
    """
    subprocess.run(["fuser", "-k", E2E_PORT], capture_output=True, check=False)


def _wait_for_port_free(timeout_seconds: float) -> bool:
    deadline = time.monotonic() + timeout_seconds
    while time.monotonic() < deadline:
        if not _url_responds(f"{E2E_BASE_URL}/"):
            return True
        time.sleep(0.5)
    return False


def stop_server() -> None:
    """Stop the server this process started, by port and never by process name."""
    global _owned_server
    if _owned_server is None:
        return
    stop_port()
    try:
        _owned_server.wait(timeout=15)
    except subprocess.TimeoutExpired:
        _owned_server.kill()
    _owned_server = None


def _wait_for_server(timeout_seconds: float = 30.0) -> bool:
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

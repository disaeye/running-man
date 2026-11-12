"""Playwright gate for ``scripts/run_gates.py``.

The server lifecycle this gate needs lives in ``gate_server.py``; this module
holds the gate definition and the environment the browser runs in.

**Browser workers run in pairs.** Two workers completed the whole suite twice on
this host with no failures (212 passed, ~8 minutes per run), so the suite runs
with two workers.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path
from typing import Final

REPO_ROOT: Final = Path(__file__).resolve().parents[1]
WEB_DIR: Final = REPO_ROOT / "apps" / "web"
E2E_BASE_URL: Final = "http://localhost:31002"
E2E_SERVICE: Final = "running-man-e2e.service"

# The dist directory the gate builds into and the e2e unit serves from. Kept
# separate from `.next` so a gate run can never disturb the production service,
# which holds the manifest it read at boot.
GATE_DIST_DIR: Final = ".next-gate"

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


def e2e_gate(scope: str = "full") -> E2eGate:
    """The functional Playwright projects, as a smoke subset or the full suite.

    The visual-baseline project is excluded: it compares screenshots against
    baselines that are not part of this repository, so it can only pass on a
    machine that generated them.

    ``scope="smoke"`` selects the `@smoke`-tagged tests — one load per primary
    route — plus the analysis overview surface, roughly ten tests and well under
    a minute. ``scope="full"" runs every test.
    """
    skip = e2e_skip_reason()
    command = [
        "npx",
        "playwright",
        "test",
        "--project=chromium",
        "--reporter=line",
        # Two workers, with retries. The failures this gate has to absorb
        # are timing flakes (a route compile or a fetch landing late),
        # each of which passed on a re-run, never a behavioural regression.
        "--workers=2",
        "--retries=2",
    ]
    if scope == "smoke":
        command += [
            "--grep",
            "@smoke|analysis overview section renders deterministically",
        ]
    return E2eGate(
        group="web",
        name="e2e (smoke)" if scope == "smoke" else "e2e (playwright)",
        command=command,
        cwd=WEB_DIR,
        # The full suite takes ~8 minutes with two workers; 900s left too
        # little headroom for a slow run, so the budget is 1200s. The smoke
        # subset is an order of magnitude smaller and gets a proportionate
        # budget that still absorbs both retries.
        timeout=240 if scope == "smoke" else 1200,
        skip_reason=skip,
        failure_hint="see gate_server.py — the runner starts the server itself",
    )


def e2e_skip_reason() -> str | None:
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

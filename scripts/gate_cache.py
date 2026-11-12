"""Content-hash cache for the gate runner: unchanged inputs ⇒ instant skip.

Each cacheable gate declares the repository paths its verdict depends on
(``inputs``). Before the gate runs, those paths are content-hashed into one
digest; a stored pass with the same digest means the exact same inputs already
passed, so the gate is skipped and reported as CACHED. Only passes are stored —
a failure always re-runs, so iteration on broken code never hides behind the
cache.

The snapshot hashes file contents (never mtimes): a checkout, a stash or an
editor cannot fool it into skipping a gate over changed bytes. Secrets never
leave the process — the cache stores digests only, in ``.gate-cache/``.
"""

from __future__ import annotations

import hashlib
import json
import os
import time
from pathlib import Path
from typing import Final

REPO_ROOT: Final = Path(__file__).resolve().parents[1]
CACHE_DIR: Final = REPO_ROOT / ".gate-cache"

# Never hashed: caches and build outputs are derived state, and the runner's own
# modules are not inputs to the code under verification.
EXCLUDED_DIR_NAMES: Final = frozenset(
    {
        ".auth",
        ".git",
        ".gate-cache",
        ".impeccable",
        ".mypy_cache",
        ".next",
        ".next-build",
        ".next-gate",
        ".next-prev",
        ".omo",
        ".pi",
        ".pytest_cache",
        ".ruff_cache",
        ".scratch",
        ".venv",
        "__pycache__",
        "build",
        "coverage",
        "dist",
        "htmlcov",
        "node_modules",
        "out",
        "playwright-report",
        "research_output",
        "test-results",
    }
)
EXCLUDED_FILE_SUFFIXES: Final = (".log", ".pyc", ".tsbuildinfo")
EXCLUDED_FILE_NAMES: Final = frozenset({".eslintcache"})
EXCLUDED_FILES: Final = (
    "scripts/run_gates.py",
    "scripts/gate_cache.py",
    "scripts/gate_execute.py",
    "scripts/gate_scheduler.py",
    "scripts/gate_e2e.py",
    "scripts/gate_server.py",
)

CHUNK: Final = 1 << 16


def _digest_file(path: Path) -> str:
    hasher = hashlib.sha256()
    with path.open("rb") as handle:
        while chunk := handle.read(CHUNK):
            hasher.update(chunk)
    return hasher.hexdigest()


def snapshot_repo() -> dict[str, str]:
    """Relpath → content digest for every hashable file in the repository."""
    files: dict[str, str] = {}
    for dirpath, dirnames, filenames in os.walk(REPO_ROOT):
        dirnames[:] = sorted(d for d in dirnames if d not in EXCLUDED_DIR_NAMES)
        for filename in sorted(filenames):
            if filename in EXCLUDED_FILE_NAMES:
                continue
            if filename.endswith(EXCLUDED_FILE_SUFFIXES):
                continue
            rel = Path(dirpath, filename).relative_to(REPO_ROOT).as_posix()
            if rel in EXCLUDED_FILES:
                continue
            files[rel] = _digest_file(REPO_ROOT / rel)
    return files


def gate_digest(
    snapshot: dict[str, str],
    inputs: tuple[str, ...],
    excludes: tuple[str, ...],
    salt: str,
) -> str:
    """One digest over the snapshot entries under ``inputs`` (minus ``excludes``)."""
    hasher = hashlib.sha256()
    hasher.update(salt.encode())
    for rel in sorted(_selected(snapshot, inputs, excludes)):
        hasher.update(rel.encode())
        hasher.update(snapshot[rel].encode())
        hasher.update(b"\0")
    return hasher.hexdigest()


def _selected(
    snapshot: dict[str, str], inputs: tuple[str, ...], excludes: tuple[str, ...]
) -> list[str]:
    chosen: list[str] = []
    for rel in snapshot:
        if not _covered(rel, inputs) or _covered(rel, excludes):
            continue
        chosen.append(rel)
    return chosen


def _covered(rel: str, prefixes: tuple[str, ...]) -> bool:
    return any(rel == prefix or rel.startswith(prefix + "/") for prefix in prefixes)


def lookup(slug: str, digest: str) -> dict[str, object] | None:
    """The stored record for this gate when it passed with this digest."""
    record_file = CACHE_DIR / f"{slug}.json"
    try:
        record = json.loads(record_file.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None
    if record.get("digest") != digest:
        return None
    return record


def store(slug: str, digest: str, seconds: float) -> None:
    CACHE_DIR.mkdir(exist_ok=True)
    record = {"digest": digest, "passed_at": time.time(), "seconds": seconds}
    (CACHE_DIR / f"{slug}.json").write_text(
        json.dumps(record, sort_keys=True), encoding="utf-8"
    )

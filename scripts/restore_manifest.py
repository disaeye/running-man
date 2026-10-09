#!/usr/bin/env python3
from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Final

REQUIRED_KEYS: Final = frozenset({
    "ciphertext_remote",
    "ciphertext_sha256",
    "ciphertext_size_bytes",
    "created_at",
    "format",
    "schema_revision",
})


def main() -> int:
    path = Path(sys.argv[1])
    payload = json.loads(path.read_text(encoding="utf-8"))
    keys = set(payload)
    if keys != REQUIRED_KEYS:
        print("manifest keys mismatch", file=sys.stderr)
        return 1
    if payload["format"] != "running-man-age-v1":
        print("manifest format mismatch", file=sys.stderr)
        return 1
    for key in ("ciphertext_remote", "ciphertext_sha256", "schema_revision"):
        value = payload[key]
        if not isinstance(value, str) or not value:
            print(f"manifest {key} is invalid", file=sys.stderr)
            return 1
    size = payload["ciphertext_size_bytes"]
    if not isinstance(size, int) or size <= 0:
        print("manifest ciphertext size is invalid", file=sys.stderr)
        return 1
    print(payload["ciphertext_remote"])
    print(payload["ciphertext_sha256"])
    print(size)
    print(payload["schema_revision"])
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

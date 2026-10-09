#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
exec uv run --project "$ROOT_DIR/apps/api" python "$ROOT_DIR/scripts/verify_fresh_schema.py" "$@"

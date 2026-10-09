#!/bin/bash
# Deploy the Running Man frontend: build, restart the systemd service, verify.
#
# Equivalent to the two commands in CLAUDE.md; kept as one step for convenience.
# The build-then-restart is atomic from the service's POV: systemd swaps in a
# fresh process only after build succeeds, so a stale server can never serve
# chunks that no longer exist on disk.
#
# Usage:
#   scripts/deploy-web.sh          # build + restart + health check
#   scripts/deploy-web.sh --check  # only verify the running service
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WEB_DIR="$REPO_ROOT/apps/web"
SERVICE="running-man-web.service"
PORT=31000

# --- --check: just verify the live service ---------------------------------
if [[ "${1:-}" == "--check" ]]; then
  echo "==> service status"
  systemctl --user status "$SERVICE" --no-pager || true
  echo "==> http probe"
  code="$(curl -sS -o /dev/null -w '%{http_code}' "http://localhost:$PORT/" || true)"
  echo "GET / -> $code"
  [[ "$code" == "200" ]] && echo "OK" || { echo "FAIL"; exit 1; }
  exit 0
fi

# --- full deploy -----------------------------------------------------------
echo "==> building (npm run build) in $WEB_DIR"
cd "$WEB_DIR"
npm run build

echo "==> restarting $SERVICE"
systemctl --user restart "$SERVICE"

echo "==> waiting for service to come up (port $PORT)"
ok=""
for i in {1..30}; do
  code="$(curl -sS -o /dev/null -w '%{http_code}' "http://localhost:$PORT/" 2>/dev/null || echo "000")"
  if [[ "$code" == "200" ]]; then ok="1"; break; fi
  sleep 1
done

if [[ -z "$ok" ]]; then
  echo "ERROR: service did not return 200 within 30s. Last status:" >&2
  systemctl --user status "$SERVICE" --no-pager >&2 || true
  echo "Hint: journalctl --user -u $SERVICE -n 50" >&2
  exit 1
fi

echo "==> deployed. GET / -> $code"
echo "    logs: journalctl --user -u $SERVICE -f"

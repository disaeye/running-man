#!/bin/bash
# Deploy the Running Man frontend: build into a private directory, swap it in,
# restart the service, then prove the running process can serve its own build.
#
# Why the swap instead of building in place: `next start` reads its chunk
# manifest once at boot. Overwriting `.next` while the service runs leaves the
# old process advertising chunk files that the build just deleted, and the
# symptom is silent — `GET /` keeps returning 200 with correct server-rendered
# HTML, while every /_next/static request 500s and the browser renders the page
# with no CSS. The asset probe at the end is what makes that state impossible to
# call a successful deploy.
#
# Usage:
#   scripts/deploy-web.sh            # build + swap + restart + verify
#   scripts/deploy-web.sh --check    # verify the live service, no build
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WEB_DIR="$REPO_ROOT/apps/web"
SERVICE="running-man-web.service"
PORT=31000
BASE="http://localhost:$PORT"

cd "$WEB_DIR"

verify() {
  node scripts/verify-assets.mjs --base "$BASE" --dist .next
}

# --- --check: verify the live service ---------------------------------------
if [[ "${1:-}" == "--check" ]]; then
  echo "==> http probe"
  curl -sS -o /dev/null -w "GET /login -> %{http_code}\n" "$BASE/login"
  echo "==> asset probe"
  verify
  exit 0
fi

STAMP="$(date +%Y%m%d%H%M%S)"
# A fixed staging name, not a per-run one: `next build` appends its own
# `distDir` patterns to tsconfig.json, so a stamped directory would grow that
# include list by one entry on every deploy.
BUILD_DIR=".next-build"
PREV_DIR=".next-prev-$STAMP"

echo "==> building into $BUILD_DIR"
rm -rf "$BUILD_DIR"
NEXT_DIST_DIR="$BUILD_DIR" npm run build

for required in BUILD_ID build-manifest.json server static; do
  if [[ ! -e "$BUILD_DIR/$required" ]]; then
    echo "ERROR: $BUILD_DIR/$required is missing; the build did not complete" >&2
    rm -rf "$BUILD_DIR"
    exit 1
  fi
done

echo "==> swapping $BUILD_DIR into place"
swapped=0
if [[ -d .next ]]; then
  mv .next "$PREV_DIR"
fi
mv "$BUILD_DIR" .next
swapped=1

rollback() {
  if [[ "$swapped" == "1" && -d "$PREV_DIR" ]]; then
    echo "==> rolling back to the previous build" >&2
    rm -rf .next
    mv "$PREV_DIR" .next
    systemctl --user restart "$SERVICE" || true
  fi
}
trap rollback ERR

echo "==> restarting $SERVICE"
systemctl --user restart "$SERVICE"

echo "==> waiting for $BASE"
ready=""
for _ in $(seq 1 30); do
  if curl -sS -o /dev/null "$BASE/login" 2>/dev/null; then ready="1"; break; fi
  sleep 1
done
if [[ -z "$ready" ]]; then
  echo "ERROR: $SERVICE did not answer within 30s" >&2
  systemctl --user status "$SERVICE" --no-pager >&2 || true
  false
fi

echo "==> verifying served assets"
verify

trap - ERR
# Keep the newest previous build for manual rollback, drop older ones.
ls -1dt .next-prev-* 2>/dev/null | tail -n +2 | xargs -r rm -rf
find . -maxdepth 1 -type d -name '.next-build*' -exec rm -rf -- {} +

echo "==> deployed. logs: journalctl --user -u $SERVICE -f"

#!/usr/bin/env bash
# holocron-zerocache launchd / direct boot wrapper (Sprint 24 e2e substrate).
#
# Starts real `zero-cache` against zero_pub. Requires:
#   ZERO_ADMIN_PASSWORD
#   DATABASE_URL (or ZERO_UPSTREAM_DB)
# Optional Litestream (Zero 1.8.0 CI path):
#   ZERO_LITESTREAM_EXECUTABLE, ZERO_LITESTREAM_BACKUP_URL, ZERO_LITESTREAM_CONFIG
#
# See docs/ops/zero-cache-enable.md for operator enable steps.
set -euo pipefail

HOLO_ROOT="${HOLO_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
cd "$HOLO_ROOT"

upstream="${ZERO_UPSTREAM_DB:-${DATABASE_URL:-}}"
[[ -n "$upstream" ]] || { echo "run-zero-cache: DATABASE_URL or ZERO_UPSTREAM_DB required" >&2; exit 1; }
[[ -n "${ZERO_ADMIN_PASSWORD:-}" ]] || {
  echo "run-zero-cache: ZERO_ADMIN_PASSWORD required" >&2
  exit 1
}

port="${ZERO_PORT:-4848}"
cvr_db="${ZERO_CVR_DB:-$upstream}"
change_db="${ZERO_CHANGE_DB:-$upstream}"
pub="${ZERO_PUBLICATION:-zero_pub}"

# Prefer pnpm exec zero-cache from the repo install
zero_bin=""
if [[ -x "$HOLO_ROOT/node_modules/.bin/zero-cache" ]]; then
  zero_bin="$HOLO_ROOT/node_modules/.bin/zero-cache"
elif command -v pnpm >/dev/null 2>&1; then
  zero_bin="pnpm exec zero-cache"
elif command -v zero-cache >/dev/null 2>&1; then
  zero_bin="zero-cache"
else
  echo "run-zero-cache: zero-cache binary not found (install @rocicorp/zero)" >&2
  exit 1
fi

args=(
  --upstream-db "$upstream"
  --cvr-db "$cvr_db"
  --change-db "$change_db"
  --app-publications "$pub"
  --port "$port"
  --admin-password "$ZERO_ADMIN_PASSWORD"
)

if [[ -n "${ZERO_LITESTREAM_EXECUTABLE:-}" && -n "${ZERO_LITESTREAM_BACKUP_URL:-}" ]]; then
  litestream_config="${ZERO_LITESTREAM_CONFIG:-$HOLO_ROOT/scripts/e2e/zero-cache-litestream.yml}"
  args+=(
    --litestream-executable "$ZERO_LITESTREAM_EXECUTABLE"
    --litestream-backup-url "$ZERO_LITESTREAM_BACKUP_URL"
    --litestream-config-path "$litestream_config"
  )
fi

export NODE_ENV="${NODE_ENV:-production}"
echo "run-zero-cache: starting zero-cache on :${port} publication=${pub}"
# shellcheck disable=SC2086
exec $zero_bin "${args[@]}"

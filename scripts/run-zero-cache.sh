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

# LaunchAgents intentionally do not persist secret values in their plist. When
# credentials are absent from the process environment, resolve them at boot
# from Holocron's canonical 0600 secrets file. Values remain in process memory
# and are never printed or passed through a shell command line.
if [[ -z "${ZERO_UPSTREAM_DB:-${DATABASE_URL:-}}" || -z "${ZERO_ADMIN_PASSWORD:-}" ]]; then
  bun_bin="$(command -v bun 2>/dev/null || true)"
  [[ -n "$bun_bin" ]] || {
    echo "run-zero-cache: bun is required to resolve canonical secrets" >&2
    exit 1
  }
fi

upstream="${ZERO_UPSTREAM_DB:-${DATABASE_URL:-}}"
if [[ -z "$upstream" ]]; then
  upstream="$("$bun_bin" --eval '
    import { getSecretValue } from "./services/platform/src/config/secrets.ts";
    const value = getSecretValue("DATABASE_URL");
    if (!value) process.exit(1);
    process.stdout.write(value);
  ')" || {
    echo "run-zero-cache: DATABASE_URL missing from environment and canonical secrets" >&2
    exit 1
  }
fi

if [[ -z "${ZERO_ADMIN_PASSWORD:-}" ]]; then
  ZERO_ADMIN_PASSWORD="$("$bun_bin" --eval '
    import { getSecretValue } from "./services/platform/src/config/secrets.ts";
    const value = getSecretValue("ZERO_ADMIN_PASSWORD");
    if (!value) process.exit(1);
    process.stdout.write(value);
  ')" || {
    echo "run-zero-cache: ZERO_ADMIN_PASSWORD missing from environment and canonical secrets" >&2
    exit 1
  }
  export ZERO_ADMIN_PASSWORD
fi

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
  --app-publications "$pub"
  --port "$port"
)

# Zero's config parser consumes these exact environment names. Keep database
# credentials and the admin password out of argv/process listings.
export ZERO_UPSTREAM_DB="$upstream"
export ZERO_CVR_DB="$cvr_db"
export ZERO_CHANGE_DB="$change_db"

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

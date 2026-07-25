#!/usr/bin/env bash
# REDHAT-FIX-03 AC-3 runner — ensures worktree bin/holo is first on PATH so
# `holo seed:e2e --reset` is not shadowed by the ~/.local/bin/holo stub.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

export PATH="$ROOT/bin:$PATH"
export DATABASE_URL="${DATABASE_URL:-postgres://127.0.0.1:5432/holocron_nonprod}"
export MAESTRO_APP_ID="${MAESTRO_APP_ID:-com.holocron.app}"
export MAESTRO_METRO_URL="${MAESTRO_METRO_URL:-http://127.0.0.1:8081}"
export MAESTRO_DEVICE="${MAESTRO_DEVICE:-}"

if [[ -z "${MAESTRO_DEV_CLIENT_OPEN_URL:-}" ]]; then
  ENCODED=$(python3 -c 'import urllib.parse; print(urllib.parse.quote("'"$MAESTRO_METRO_URL"'", safe=""))')
  export MAESTRO_DEV_CLIENT_OPEN_URL="exp+holocron://expo-development-client/?url=${ENCODED}"
fi

if ! command -v holo >/dev/null 2>&1; then
  echo "run-reconnect-exactly-once: holo not on PATH after prepending $ROOT/bin" >&2
  exit 127
fi
if ! holo seed:e2e --help 2>&1 | rg -q 'seed:e2e|holocron operator'; then
  # --help may dump full usage; ensure we are not the stub
  if holo seed:e2e --reset --json 2>&1 | rg -q 'unknown command'; then
    echo "run-reconnect-exactly-once: PATH holo lacks seed:e2e (stub still winning)" >&2
    exit 127
  fi
fi

echo "run-reconnect-exactly-once: holo=$(command -v holo)"
echo "run-reconnect-exactly-once: seed:e2e --reset"
holo seed:e2e --reset

echo "run-reconnect-exactly-once: maestro test reconnect-exactly-once.yml"
MAESTRO_ARGS=(
  test .maestro/reactive/reconnect-exactly-once.yml
  -e MAESTRO_APP_ID="$MAESTRO_APP_ID"
  -e MAESTRO_METRO_URL="$MAESTRO_METRO_URL"
  -e MAESTRO_DEV_CLIENT_OPEN_URL="$MAESTRO_DEV_CLIENT_OPEN_URL"
)
if [[ -n "$MAESTRO_DEVICE" ]]; then
  MAESTRO_ARGS+=(--device "$MAESTRO_DEVICE")
fi
exec maestro "${MAESTRO_ARGS[@]}"

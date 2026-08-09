#!/usr/bin/env bash
# S31-FE-04 AC-4 / AC-6 — conversation switch no-leak + remount rehydrate.
# Seeds two conversations, asserts A marker never appears on B.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

export PATH="$ROOT/bin:$PATH"
export DATABASE_URL="${DATABASE_URL:-postgres://127.0.0.1:5432/holocron_nonprod}"
export MAESTRO_APP_ID="${MAESTRO_APP_ID:-com.holocron.app}"
export MAESTRO_METRO_URL="${MAESTRO_METRO_URL:-http://127.0.0.1:8081}"
export MAESTRO_DEVICE="${MAESTRO_DEVICE:-}"
export PLATFORM_URL="${PLATFORM_URL:-http://127.0.0.1:4111}"

EVIDENCE_DIR="${EVIDENCE_DIR:-$ROOT/.tmp/S31-FE-04}"
mkdir -p "$EVIDENCE_DIR"

log() { echo "[run-conversation-switch-no-leak] $*" | tee -a "$EVIDENCE_DIR/harness.log"; }

if [[ -z "${MAESTRO_DEV_CLIENT_OPEN_URL:-}" ]]; then
  ENCODED=$(python3 -c 'import urllib.parse; print(urllib.parse.quote("'"$MAESTRO_METRO_URL"'", safe=""))')
  export MAESTRO_DEV_CLIENT_OPEN_URL="exp+holocron://expo-development-client/?url=${ENCODED}"
fi

if ! command -v holo >/dev/null 2>&1; then
  log "holo not on PATH after prepending $ROOT/bin"
  exit 127
fi

# Fail closed if platform / zero / metro are not live.
if ! curl -sf --max-time 3 http://127.0.0.1:4111/health >/dev/null; then
  log "platform :4111/health not ok"
  exit 1
fi
if ! curl -sf --max-time 3 http://127.0.0.1:4848/keepalive >/dev/null; then
  log "zero-cache :4848/keepalive not ok (start scripts/run-zero-cache.sh)"
  exit 1
fi
if ! curl -sf --max-time 3 http://127.0.0.1:8081/status >/dev/null; then
  log "metro :8081/status not ok"
  exit 1
fi

log "seed:e2e --reset"
holo seed:e2e --reset 2>&1 | tee -a "$EVIDENCE_DIR/seed-e2e.txt"

log "maestro test conversation-switch-no-leak.yml"
MAESTRO_ARGS=(
  test .maestro/reactive/conversation-switch-no-leak.yml
  -e MAESTRO_APP_ID="$MAESTRO_APP_ID"
  -e MAESTRO_METRO_URL="$MAESTRO_METRO_URL"
  -e MAESTRO_DEV_CLIENT_OPEN_URL="$MAESTRO_DEV_CLIENT_OPEN_URL"
)
if [[ -n "$MAESTRO_DEVICE" ]]; then
  MAESTRO_ARGS+=(--device "$MAESTRO_DEVICE")
fi

set +e
maestro "${MAESTRO_ARGS[@]}" 2>&1 | tee "$EVIDENCE_DIR/maestro-conversation-switch-no-leak.txt"
STATUS=${PIPESTATUS[0]}
set -e

log "maestro exit=$STATUS"
exit "$STATUS"

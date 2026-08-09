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
ZERO_OK=0
for _ in 1 2 3 4 5 6 7 8 9 10; do
  if curl -sf --max-time 3 http://127.0.0.1:4848/keepalive >/dev/null \
    || curl -sf --max-time 3 http://[::1]:4848/keepalive >/dev/null; then
    ZERO_OK=1
    break
  fi
  sleep 0.5
done
if [[ "$ZERO_OK" -ne 1 ]]; then
  log "zero-cache :4848/keepalive not ok (start scripts/run-zero-cache.sh)"
  exit 1
fi
if ! curl -sf --max-time 3 http://127.0.0.1:8081/status >/dev/null; then
  log "metro :8081/status not ok"
  exit 1
fi

# PONR (data_plane_ponr) is append-only and blocks TRUNCATE. Prefer stable
# upsert seed (reset:false); only try --reset when explicitly forced.
if [[ "${FORCE_SEED_RESET:-0}" == "1" ]]; then
  log "seed:e2e --reset (FORCE_SEED_RESET=1)"
  set +e
  holo seed:e2e --reset 2>&1 | tee -a "$EVIDENCE_DIR/seed-e2e.txt"
  SEED_STATUS=${PIPESTATUS[0]}
  set -e
else
  log "seed:e2e stable upsert (reset:false; PONR-safe)"
  set +e
  bun -e '
    import { seedE2eDatabase } from "./services/platform/src/db/seed-e2e.ts";
    const r = await seedE2eDatabase({ reset: false, databaseUrl: process.env.DATABASE_URL });
    console.log(JSON.stringify({ ok: r.ok, conversations: r.conversations, messages: r.messages, errors: r.errors, log: r.messages_log.slice(-12) }, null, 2));
    process.exit(r.ok ? 0 : 1);
  ' 2>&1 | tee -a "$EVIDENCE_DIR/seed-e2e.txt"
  SEED_STATUS=${PIPESTATUS[0]}
  set -e
fi
if [[ "$SEED_STATUS" -ne 0 ]]; then
  log "seed failed exit=$SEED_STATUS"
  exit "$SEED_STATUS"
fi

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

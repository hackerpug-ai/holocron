#!/usr/bin/env bash
# S-REACTIVE-04 AC-3 harness: fleet-down first (so degraded can activate),
# then Maestro recovery flow (which restores fleet mid-script via runScript).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

export DATABASE_URL="${DATABASE_URL:-postgres://127.0.0.1:5432/holocron_nonprod}"
export MAESTRO_APP_ID="${MAESTRO_APP_ID:-com.holocron.app}"
export MAESTRO_METRO_URL="${MAESTRO_METRO_URL:-http://127.0.0.1:8081}"
export MAESTRO_CHAT_URL="${MAESTRO_CHAT_URL:-holocron://chat/00000000-0000-4000-8000-0000000000e1}"
export PLATFORM_URL="${PLATFORM_URL:-http://127.0.0.1:4111}"
export FLEET_URL="${FLEET_URL:-http://127.0.0.1:4545}"

if [[ -z "${MAESTRO_DEV_CLIENT_OPEN_URL:-}" ]]; then
  ENCODED=$(python3 -c 'import urllib.parse; print(urllib.parse.quote("'"$MAESTRO_METRO_URL"'", safe=""))')
  export MAESTRO_DEV_CLIENT_OPEN_URL="exp+holocron://expo-development-client/?url=${ENCODED}"
fi

EVIDENCE_DIR="${EVIDENCE_DIR:-$ROOT/.tmp/S-REACTIVE-04}"
mkdir -p "$EVIDENCE_DIR"

log() { echo "[run-degraded-recovery] $*" | tee -a "$EVIDENCE_DIR/harness-recovery.log"; }

export RESTORE_SERVER_PORT="${RESTORE_SERVER_PORT:-8766}"
export RESTORE_SERVER_URL="${RESTORE_SERVER_URL:-http://127.0.0.1:${RESTORE_SERVER_PORT}}"
export HOLO_ROOT="${HOLO_ROOT:-$ROOT}"
export EVIDENCE_DIR

# Start restore HTTP helper for mid-flow Maestro runScript
RESTORE_PID=""
if ! curl -sf "${RESTORE_SERVER_URL}/health" >/dev/null 2>&1; then
  python3 .maestro/reactive/restore-fleet-server.py \
    >>"$EVIDENCE_DIR/restore-fleet-server.stdout.log" 2>&1 &
  RESTORE_PID=$!
  for _ in $(seq 1 40); do
    if curl -sf "${RESTORE_SERVER_URL}/health" >/dev/null 2>&1; then
      log "restore-server ready on ${RESTORE_SERVER_URL}"
      break
    fi
    sleep 0.15
  done
fi

if [[ "${SKIP_SEED:-0}" != "1" ]]; then
  if command -v bun >/dev/null 2>&1; then
    bun services/platform/src/cli/holo.ts seed:e2e --reset --json 2>&1 | tee "$EVIDENCE_DIR/seed-e2e-recovery.txt" || true
  fi
fi

FLEET_PID="$(lsof -nP -iTCP:4545 -sTCP:LISTEN -t 2>/dev/null | head -1 || true)"
PLATFORM_PID="$(lsof -nP -iTCP:4111 -sTCP:LISTEN -t 2>/dev/null | head -1 || true)"
FLEET_CMD=""
if [[ -n "$FLEET_PID" ]]; then
  FLEET_CMD="$(ps -p "$FLEET_PID" -o args= 2>/dev/null || true)"
fi
export FLEET_PROXY_CMD="${FLEET_PROXY_CMD:-$FLEET_CMD}"

# Fleet-down so phase A of the Maestro flow can enter degraded
if [[ "${SKIP_FLEET_DOWN:-0}" != "1" && -n "$FLEET_PID" ]]; then
  log "fleet-down for recovery phase A: stop pid $FLEET_PID"
  kill "$FLEET_PID" 2>/dev/null || true
  for _ in $(seq 1 40); do
    if ! lsof -nP -iTCP:4545 -sTCP:LISTEN >/dev/null 2>&1; then
      break
    fi
    sleep 0.15
  done
fi

# Platform fleet-only so failure envelope is not masked
if [[ "${SKIP_PLATFORM_RESTART:-0}" != "1" && -n "$PLATFORM_PID" ]]; then
  log "platform fleet-only for recovery phase A"
  kill "$PLATFORM_PID" 2>/dev/null || true
  for _ in $(seq 1 40); do
    if ! lsof -nP -iTCP:4111 -sTCP:LISTEN >/dev/null 2>&1; then
      break
    fi
    sleep 0.15
  done
  export HOLO_CHAT_FLEET_ONLY=1
  unset HOLO_E2E || true
  unset HOLO_CHAT_DETERMINISTIC_STREAM || true
  export HOLO_KEY_RN="${HOLO_KEY_RN:-replace-me-rn-key}"
  export HOLO_KEY_MCP="${HOLO_KEY_MCP:-mcp-test}"
  export HOLO_KEY_CONTROL="${HOLO_KEY_CONTROL:-ctl-test}"
  nohup bun services/platform/src/cli/holo.ts service:up \
    >>"$EVIDENCE_DIR/platform-recovery-phase-a.log" 2>&1 &
  for _ in $(seq 1 80); do
    if curl -sf "${PLATFORM_URL}/health" >/dev/null 2>&1; then
      log "platform health ok (fleet-only)"
      break
    fi
    sleep 0.25
  done
fi

log "maestro test degraded-recovery.yml"
set +e
maestro test .maestro/reactive/degraded-recovery.yml \
  -e MAESTRO_APP_ID="$MAESTRO_APP_ID" \
  -e MAESTRO_METRO_URL="$MAESTRO_METRO_URL" \
  -e MAESTRO_DEV_CLIENT_OPEN_URL="$MAESTRO_DEV_CLIENT_OPEN_URL" \
  -e MAESTRO_CHAT_URL="$MAESTRO_CHAT_URL" \
  -e RESTORE_SERVER_URL="$RESTORE_SERVER_URL" \
  2>&1 | tee "$EVIDENCE_DIR/AC-3-maestro.txt"
MAESTRO_EXIT=${PIPESTATUS[0]}
set -e

if [[ -n "$RESTORE_PID" ]]; then
  kill "$RESTORE_PID" 2>/dev/null || true
fi

log "maestro exit=$MAESTRO_EXIT"
exit "$MAESTRO_EXIT"

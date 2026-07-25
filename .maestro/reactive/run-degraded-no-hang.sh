#!/usr/bin/env bash
# S-REACTIVE-04 AC-1 harness: seed + real fleet-down (:4545) + Maestro no-hang.
#
# Fleet-down action (Sprint 08 infer-3 style): make the divergent role endpoint
# unreachable so the chat failure envelope surfaces ROLE_UNAVAILABLE /
# surface-unavailable. Platform is briefly restarted without deterministic chat
# streaming so the failure envelope reaches the client (nonprod otherwise masks
# fleet failures with HOLO_CHAT_DETERMINISTIC_STREAM).
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

log() { echo "[run-degraded-no-hang] $*" | tee -a "$EVIDENCE_DIR/harness-no-hang.log"; }

# ── Seed ──────────────────────────────────────────────────────────────────
if [[ "${SKIP_SEED:-0}" != "1" ]]; then
  log "seed:e2e --reset"
  if command -v bun >/dev/null 2>&1; then
    bun services/platform/src/cli/holo.ts seed:e2e --reset --json 2>&1 | tee "$EVIDENCE_DIR/seed-e2e.txt" || true
  fi
fi

# ── Capture live PIDs ─────────────────────────────────────────────────────
FLEET_PID="$(lsof -nP -iTCP:4545 -sTCP:LISTEN -t 2>/dev/null | head -1 || true)"
PLATFORM_PID="$(lsof -nP -iTCP:4111 -sTCP:LISTEN -t 2>/dev/null | head -1 || true)"
FLEET_CMD=""
PLATFORM_CMD=""
if [[ -n "$FLEET_PID" ]]; then
  FLEET_CMD="$(ps -p "$FLEET_PID" -o args= 2>/dev/null || true)"
fi
if [[ -n "$PLATFORM_PID" ]]; then
  PLATFORM_CMD="$(ps -p "$PLATFORM_PID" -o args= 2>/dev/null || true)"
fi
log "fleet_pid=${FLEET_PID:-none} platform_pid=${PLATFORM_PID:-none}"

RESTARTED_PLATFORM=0
STOPPED_FLEET=0
NEW_PLATFORM_PID=""

cleanup() {
  # Restore fleet first so platform health recovers.
  if [[ "$STOPPED_FLEET" == "1" && -n "$FLEET_CMD" ]]; then
    log "restore fleet: $FLEET_CMD"
    # shellcheck disable=SC2086
    nohup $FLEET_CMD >>"$EVIDENCE_DIR/fleet-restore.log" 2>&1 &
    for _ in $(seq 1 40); do
      if curl -sf "${FLEET_URL}/v1/models" >/dev/null 2>&1 || curl -sf "${FLEET_URL}/health" >/dev/null 2>&1; then
        break
      fi
      # models path may 401 without key — any TCP accept is enough
      if lsof -nP -iTCP:4545 -sTCP:LISTEN >/dev/null 2>&1; then
        break
      fi
      sleep 0.25
    done
  fi
  if [[ "$RESTARTED_PLATFORM" == "1" ]]; then
    if [[ -n "$NEW_PLATFORM_PID" ]]; then
      kill "$NEW_PLATFORM_PID" 2>/dev/null || true
    fi
    if [[ -n "$PLATFORM_CMD" ]]; then
      log "restore platform: $PLATFORM_CMD"
      # Prefer original service:up so deterministic e2e path returns for other suites
      (
        export HOLO_E2E="${HOLO_E2E_RESTORE:-1}"
        export HOLO_CHAT_DETERMINISTIC_STREAM="${HOLO_CHAT_DETERMINISTIC_STREAM_RESTORE:-1}"
        unset HOLO_CHAT_FLEET_ONLY || true
        # shellcheck disable=SC2086
        nohup $PLATFORM_CMD >>"$EVIDENCE_DIR/platform-restore.log" 2>&1 &
      )
      for _ in $(seq 1 60); do
        if curl -sf "${PLATFORM_URL}/health" >/dev/null 2>&1; then
          break
        fi
        sleep 0.5
      done
    fi
  fi
}
trap cleanup EXIT

# ── Fleet-down action (:4545 endpoint-down) ───────────────────────────────
if [[ "${SKIP_FLEET_DOWN:-0}" != "1" ]]; then
  if [[ -n "$FLEET_PID" ]]; then
    log "fleet-down: stop pid $FLEET_PID"
    kill "$FLEET_PID" 2>/dev/null || true
    STOPPED_FLEET=1
    for _ in $(seq 1 40); do
      if ! lsof -nP -iTCP:4545 -sTCP:LISTEN >/dev/null 2>&1; then
        break
      fi
      sleep 0.15
    done
  else
    log "fleet-down: nothing listening on :4545 (already down)"
    STOPPED_FLEET=0
  fi
fi

# Prove :4545 is unreachable (or accept already-down)
if curl -sf --max-time 2 "${FLEET_URL}/v1/models" >/dev/null 2>&1; then
  log "WARN: fleet still reachable after fleet-down — failure envelope may not fire"
else
  log "fleet unreachable on :4545 (good for ROLE_UNAVAILABLE)"
fi

# ── Platform: fleet-only path so failure envelope is not masked ───────────
if [[ "${SKIP_PLATFORM_RESTART:-0}" != "1" && -n "$PLATFORM_PID" ]]; then
  log "restart platform with HOLO_CHAT_FLEET_ONLY=1 (no deterministic mask)"
  kill "$PLATFORM_PID" 2>/dev/null || true
  for _ in $(seq 1 40); do
    if ! lsof -nP -iTCP:4111 -sTCP:LISTEN >/dev/null 2>&1; then
      break
    fi
    sleep 0.15
  done

  # Reuse keys/db from ambient env; force fleet-only chat processing.
  export HOLO_CHAT_FLEET_ONLY=1
  unset HOLO_E2E || true
  unset HOLO_CHAT_DETERMINISTIC_STREAM || true
  export HOLO_KEY_RN="${HOLO_KEY_RN:-replace-me-rn-key}"
  export HOLO_KEY_MCP="${HOLO_KEY_MCP:-mcp-test}"
  export HOLO_KEY_CONTROL="${HOLO_KEY_CONTROL:-ctl-test}"

  # Prefer this worktree binary so HOLO_CHAT_FLEET_ONLY honors the failure envelope
  # (nonprod catch-path must not mask fleet-down with deterministic tokens).
  export HOLO_ROOT="${HOLO_ROOT:-$ROOT}"
  export PORT="${PORT:-4111}"
  export FLEET_URL="${FLEET_URL:-http://127.0.0.1:4545/v1}"
  nohup bun services/platform/src/cli/holo.ts service:up \
    >>"$EVIDENCE_DIR/platform-fleet-only.log" 2>&1 &
  NEW_PLATFORM_PID=$!
  RESTARTED_PLATFORM=1

  for _ in $(seq 1 80); do
    if curl -sf "${PLATFORM_URL}/health" >/dev/null 2>&1; then
      log "platform health ok (fleet-only mode)"
      break
    fi
    sleep 0.25
  done

  # Fleet may auto-respawn — keep it down for the Maestro window.
  for _ in $(seq 1 5); do
    for p in $(lsof -nP -iTCP:4545 -sTCP:LISTEN -t 2>/dev/null || true); do
      kill -9 "$p" 2>/dev/null || true
    done
    sleep 0.15
  done
fi

# ── Maestro ───────────────────────────────────────────────────────────────
log "maestro test degraded-no-hang.yml"
set +e
maestro test .maestro/reactive/degraded-no-hang.yml \
  -e MAESTRO_APP_ID="$MAESTRO_APP_ID" \
  -e MAESTRO_METRO_URL="$MAESTRO_METRO_URL" \
  -e MAESTRO_DEV_CLIENT_OPEN_URL="$MAESTRO_DEV_CLIENT_OPEN_URL" \
  -e MAESTRO_CHAT_URL="$MAESTRO_CHAT_URL" \
  2>&1 | tee "$EVIDENCE_DIR/AC-1-maestro.txt"
MAESTRO_EXIT=${PIPESTATUS[0]}
set -e

log "maestro exit=$MAESTRO_EXIT"
exit "$MAESTRO_EXIT"

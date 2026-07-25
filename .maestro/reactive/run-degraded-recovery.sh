#!/usr/bin/env bash
# S-REACTIVE-04 AC-3 harness: fleet-down first (so degraded can activate),
# then Maestro recovery flow (which restores fleet mid-script via runScript).
#
# Fail-closed: if platform_pid is missing or HOLO_CHAT_FLEET_ONLY restart fails,
# exit non-zero BEFORE Maestro (do not run a doomed flow).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

export DATABASE_URL="${DATABASE_URL:-postgres://127.0.0.1:5432/holocron_nonprod}"
export MAESTRO_APP_ID="${MAESTRO_APP_ID:-com.holocron.app}"
export MAESTRO_METRO_URL="${MAESTRO_METRO_URL:-http://127.0.0.1:8081}"
export MAESTRO_CHAT_URL="${MAESTRO_CHAT_URL:-holocron://chat/00000000-0000-4000-8000-0000000000e1}"
export PLATFORM_URL="${PLATFORM_URL:-http://127.0.0.1:4111}"
export FLEET_URL="${FLEET_URL:-http://127.0.0.1:4545}"
export HOLO_KEY_RN="${HOLO_KEY_RN:-replace-me-rn-key}"
export HOLO_KEY_MCP="${HOLO_KEY_MCP:-mcp-test}"
export HOLO_KEY_CONTROL="${HOLO_KEY_CONTROL:-ctl-test}"

if [[ -z "${MAESTRO_DEV_CLIENT_OPEN_URL:-}" ]]; then
  ENCODED=$(python3 -c 'import urllib.parse; print(urllib.parse.quote("'"$MAESTRO_METRO_URL"'", safe=""))')
  export MAESTRO_DEV_CLIENT_OPEN_URL="exp+holocron://expo-development-client/?url=${ENCODED}"
fi

EVIDENCE_DIR="${EVIDENCE_DIR:-$ROOT/.tmp/S-REACTIVE-04}"
mkdir -p "$EVIDENCE_DIR"
SEED_CONVERSATION_ID="${SEED_CONVERSATION_ID:-00000000-0000-4000-8000-0000000000e1}"

log() { echo "[run-degraded-recovery] $*" | tee -a "$EVIDENCE_DIR/harness-recovery.log"; }
fail_closed() {
  log "FAIL-CLOSED: $*"
  exit 1
}

kill_port_listeners() {
  local port="$1"
  local hard="${2:-0}"
  for p in $(lsof -nP -iTCP:"$port" -sTCP:LISTEN -t 2>/dev/null || true); do
    if [[ "$hard" == "1" ]]; then
      kill -9 "$p" 2>/dev/null || true
    else
      kill "$p" 2>/dev/null || true
    fi
  done
}

wait_port_free() {
  local port="$1"
  local tries="${2:-50}"
  for _ in $(seq 1 "$tries"); do
    if ! lsof -nP -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1; then
      return 0
    fi
    kill_port_listeners "$port" 1
    sleep 0.15
  done
  return 1
}

wait_http_ok() {
  local url="$1"
  local tries="${2:-80}"
  for _ in $(seq 1 "$tries"); do
    if curl -sf "$url" >/dev/null 2>&1; then
      return 0
    fi
    sleep 0.25
  done
  return 1
}

start_fleet_reaper() {
  rm -f "$EVIDENCE_DIR/fleet-reaper.stop" "$EVIDENCE_DIR/fleet-reaper.pid"
  (
    while [[ ! -f "$EVIDENCE_DIR/fleet-reaper.stop" ]]; do
      kill_port_listeners 4545 1
      sleep 0.4
    done
  ) >/dev/null 2>&1 &
  FLEET_REAPER_PID=$!
  echo "$FLEET_REAPER_PID" >"$EVIDENCE_DIR/fleet-reaper.pid"
  log "fleet reaper pid=$FLEET_REAPER_PID (stopped by restore-server on /restore)"
}

stop_fleet_reaper() {
  touch "$EVIDENCE_DIR/fleet-reaper.stop" 2>/dev/null || true
  if [[ -n "${FLEET_REAPER_PID:-}" ]]; then
    kill "$FLEET_REAPER_PID" 2>/dev/null || true
  fi
  if [[ -f "$EVIDENCE_DIR/fleet-reaper.pid" ]]; then
    kill "$(cat "$EVIDENCE_DIR/fleet-reaper.pid" 2>/dev/null || true)" 2>/dev/null || true
  fi
}

prove_fleet_unavailable_envelope() {
  local req="s-reactive-04-recovery-probe-$(date +%s)"
  local create
  create=$(curl -sS --max-time 20 -X POST "${PLATFORM_URL}/api/chat-runs" \
    -H "Authorization: Bearer ${HOLO_KEY_RN}" \
    -H "Content-Type: application/json" \
    -d "{\"requestId\":\"${req}\",\"msg\":\"harness recovery phase-A envelope probe\",\"conversationId\":\"${SEED_CONVERSATION_ID}\"}" \
    || true)
  echo "$create" >"$EVIDENCE_DIR/fleet-down-envelope-create-recovery.json"
  local run_id
  run_id=$(python3 -c 'import json,sys; print(json.load(sys.stdin).get("runId",""))' <<<"$create" 2>/dev/null || true)
  if [[ -z "$run_id" ]]; then
    fail_closed "envelope probe: POST /api/chat-runs did not return runId body=$create"
  fi
  local i body status final code
  for i in $(seq 1 40); do
    kill_port_listeners 4545 1
    body=$(curl -sS --max-time 10 -H "Authorization: Bearer ${HOLO_KEY_RN}" \
      "${PLATFORM_URL}/api/chat-runs/${run_id}" || true)
    echo "$body" >"$EVIDENCE_DIR/fleet-down-envelope-probe-recovery.json"
    status=$(python3 -c 'import json,sys; d=json.load(sys.stdin); print(d.get("status",""))' <<<"$body" 2>/dev/null || true)
    final=$(python3 -c 'import json,sys; d=json.load(sys.stdin); print(d.get("finalText") or d.get("error") or "")' <<<"$body" 2>/dev/null || true)
    code=$(python3 -c 'import json,sys; d=json.load(sys.stdin); print(d.get("errorCode") or "")' <<<"$body" 2>/dev/null || true)
    if [[ "$status" == "failed" ]] && echo "$final $code" | grep -qiE 'Local fleet unavailable|ROLE_UNAVAILABLE|surface-unavailable'; then
      log "envelope probe ok runId=$run_id status=failed code=$code"
      return 0
    fi
    if [[ "$status" == "completed" || "$status" == "blocked" ]]; then
      fail_closed "envelope probe: expected fleet-unavailable failed run, got status=$status body=$body"
    fi
    sleep 0.4
  done
  fail_closed "envelope probe: timed out waiting for ROLE_UNAVAILABLE runId=$run_id last=$body"
}

export RESTORE_SERVER_PORT="${RESTORE_SERVER_PORT:-8766}"
export RESTORE_SERVER_URL="${RESTORE_SERVER_URL:-http://127.0.0.1:${RESTORE_SERVER_PORT}}"
export HOLO_ROOT="${HOLO_ROOT:-$ROOT}"
export EVIDENCE_DIR

FLEET_REAPER_PID=""
RESTORE_PID=""

cleanup() {
  stop_fleet_reaper
  if [[ -n "${RESTORE_PID:-}" ]]; then
    kill "$RESTORE_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT

# Start restore HTTP helper for mid-flow Maestro runScript
if ! curl -sf "${RESTORE_SERVER_URL}/health" >/dev/null 2>&1; then
  # Kill stale restore server on the port if half-dead
  for p in $(lsof -nP -iTCP:"$RESTORE_SERVER_PORT" -sTCP:LISTEN -t 2>/dev/null || true); do
    kill "$p" 2>/dev/null || true
  done
  python3 .maestro/reactive/restore-fleet-server.py \
    >>"$EVIDENCE_DIR/restore-fleet-server.stdout.log" 2>&1 &
  RESTORE_PID=$!
  if ! wait_http_ok "${RESTORE_SERVER_URL}/health" 40; then
    fail_closed "restore-server failed to become ready on ${RESTORE_SERVER_URL}"
  fi
  log "restore-server ready on ${RESTORE_SERVER_URL}"
else
  log "restore-server already healthy on ${RESTORE_SERVER_URL}"
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
# Default fleet restore command if process already gone
if [[ -z "$FLEET_CMD" ]]; then
  FLEET_CMD="/opt/homebrew/bin/bun /Users/inference1/Projects/rogueone/.tmp/local-loop-fleet-proxy.ts"
fi
export FLEET_PROXY_CMD="${FLEET_PROXY_CMD:-$FLEET_CMD}"
log "fleet_pid=${FLEET_PID:-none} platform_pid=${PLATFORM_PID:-none}"

# Fail-closed: platform must be present so we can restart fleet-only
if [[ "${SKIP_PLATFORM_RESTART:-0}" != "1" ]]; then
  if [[ -z "$PLATFORM_PID" ]]; then
    fail_closed "platform_pid missing on :4111 — cannot restart with HOLO_CHAT_FLEET_ONLY before Maestro"
  fi
fi

# Fleet-down so phase A of the Maestro flow can enter degraded
if [[ "${SKIP_FLEET_DOWN:-0}" != "1" ]]; then
  if [[ -n "$FLEET_PID" ]]; then
    log "fleet-down for recovery phase A: stop pid $FLEET_PID"
    kill -9 "$FLEET_PID" 2>/dev/null || true
  else
    log "fleet-down: nothing listening on :4545 (already down)"
  fi
  # Reaper first so launchd/proxy cannot race the reachability check.
  start_fleet_reaper
  kill_port_listeners 4545 1
  sleep 0.3
  kill_port_listeners 4545 1
fi

if lsof -nP -iTCP:4545 -sTCP:LISTEN >/dev/null 2>&1; then
  kill_port_listeners 4545 1
  sleep 0.5
  kill_port_listeners 4545 1
  if lsof -nP -iTCP:4545 -sTCP:LISTEN >/dev/null 2>&1; then
    fail_closed "fleet still listening on :4545 after fleet-down + reaper — phase A will not enter degraded"
  fi
fi
log "fleet unreachable on :4545 (good for phase A degraded)"

# Platform fleet-only so failure envelope is not masked
if [[ "${SKIP_PLATFORM_RESTART:-0}" != "1" ]]; then
  log "platform fleet-only for recovery phase A"
  kill_port_listeners 4111 0
  if ! wait_port_free 4111 50; then
    fail_closed "could not free :4111 before HOLO_CHAT_FLEET_ONLY restart"
  fi
  export HOLO_CHAT_FLEET_ONLY=1
  unset HOLO_E2E || true
  unset HOLO_CHAT_DETERMINISTIC_STREAM || true
  export HOLO_ROOT="${HOLO_ROOT:-$ROOT}"
  export PORT="${PORT:-4111}"
  export FLEET_URL="http://127.0.0.1:4545/v1"
  if [[ -z "${FLEET_REAPER_PID:-}" ]]; then
    start_fleet_reaper
  fi

  nohup bun services/platform/src/cli/holo.ts service:up \
    >>"$EVIDENCE_DIR/platform-recovery-phase-a.log" 2>&1 &

  if ! wait_http_ok "${PLATFORM_URL}/health" 80; then
    fail_closed "HOLO_CHAT_FLEET_ONLY platform restart failed health probe on ${PLATFORM_URL}/health"
  fi
  log "platform health ok (fleet-only)"

  prove_fleet_unavailable_envelope
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

log "maestro exit=$MAESTRO_EXIT"
exit "$MAESTRO_EXIT"

#!/usr/bin/env bash
# S-REACTIVE-04 AC-1 harness: seed + real fleet-down (:4545) + Maestro no-hang.
#
# Fleet-down action (Sprint 08 infer-3 style): make the divergent role endpoint
# unreachable so the chat failure envelope surfaces ROLE_UNAVAILABLE /
# surface-unavailable. Platform is briefly restarted without deterministic chat
# streaming so the failure envelope reaches the client (nonprod otherwise masks
# fleet failures with HOLO_CHAT_DETERMINISTIC_STREAM).
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

log() { echo "[run-degraded-no-hang] $*" | tee -a "$EVIDENCE_DIR/harness-no-hang.log"; }
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

# Keep :4545 dead for the whole Maestro window (launchd/proxy may auto-respawn).
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
  log "fleet reaper pid=$FLEET_REAPER_PID"
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

# Prove live platform is fleet-only by observing ROLE_UNAVAILABLE envelope.
prove_fleet_unavailable_envelope() {
  local req="s-reactive-04-no-hang-probe-$(date +%s)"
  local create
  create=$(curl -sS --max-time 20 -X POST "${PLATFORM_URL}/api/chat-runs" \
    -H "Authorization: Bearer ${HOLO_KEY_RN}" \
    -H "Content-Type: application/json" \
    -d "{\"requestId\":\"${req}\",\"msg\":\"harness fleet-down envelope probe\",\"conversationId\":\"${SEED_CONVERSATION_ID}\"}" \
    || true)
  echo "$create" >"$EVIDENCE_DIR/fleet-down-envelope-create.json"
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
    echo "$body" >"$EVIDENCE_DIR/fleet-down-envelope-probe.json"
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
FLEET_REAPER_PID=""

cleanup() {
  stop_fleet_reaper
  # Restore fleet first so platform health recovers.
  if [[ "$STOPPED_FLEET" == "1" && -n "$FLEET_CMD" ]]; then
    log "restore fleet: $FLEET_CMD"
    # shellcheck disable=SC2086
    nohup $FLEET_CMD >>"$EVIDENCE_DIR/fleet-restore.log" 2>&1 &
    for _ in $(seq 1 40); do
      if lsof -nP -iTCP:4545 -sTCP:LISTEN >/dev/null 2>&1; then
        break
      fi
      sleep 0.25
    done
  fi
  if [[ "$RESTARTED_PLATFORM" == "1" ]]; then
    kill_port_listeners 4111 1
    wait_port_free 4111 40 || true
    if [[ -n "$PLATFORM_CMD" ]]; then
      log "restore platform: $PLATFORM_CMD"
      (
        export HOLO_E2E="${HOLO_E2E_RESTORE:-1}"
        export HOLO_CHAT_DETERMINISTIC_STREAM="${HOLO_CHAT_DETERMINISTIC_STREAM_RESTORE:-1}"
        unset HOLO_CHAT_FLEET_ONLY || true
        # shellcheck disable=SC2086
        nohup $PLATFORM_CMD >>"$EVIDENCE_DIR/platform-restore.log" 2>&1 &
      )
      wait_http_ok "${PLATFORM_URL}/health" 80 || true
    fi
  fi
}
trap cleanup EXIT

# ── Fail-closed prerequisites (before fleet-down / Maestro) ───────────────
if [[ "${SKIP_PLATFORM_RESTART:-0}" != "1" ]]; then
  if [[ -z "$PLATFORM_PID" ]]; then
    fail_closed "platform_pid missing on :4111 — cannot restart with HOLO_CHAT_FLEET_ONLY before Maestro"
  fi
fi

# ── Fleet-down action (:4545 endpoint-down) ───────────────────────────────
# Capture restore command before kill; default proxy if process already gone.
if [[ -z "$FLEET_CMD" ]]; then
  FLEET_CMD="/opt/homebrew/bin/bun /Users/inference1/Projects/rogueone/.tmp/local-loop-fleet-proxy.ts"
fi
if [[ "${SKIP_FLEET_DOWN:-0}" != "1" ]]; then
  if [[ -n "$FLEET_PID" ]]; then
    log "fleet-down: stop pid $FLEET_PID"
    kill -9 "$FLEET_PID" 2>/dev/null || true
  else
    log "fleet-down: nothing listening on :4545 (already down)"
  fi
  STOPPED_FLEET=1
  # Reaper first so launchd/proxy cannot race the reachability check.
  start_fleet_reaper
  kill_port_listeners 4545 1
  sleep 0.3
  kill_port_listeners 4545 1
fi

# Models path may 401; treat any TCP-accepting fleet as still-up.
FLEET_BASE="http://127.0.0.1:4545"
if curl -sf --max-time 1 "${FLEET_BASE}/v1/models" >/dev/null 2>&1 \
  || curl -sf --max-time 1 "${FLEET_BASE}/health" >/dev/null 2>&1 \
  || lsof -nP -iTCP:4545 -sTCP:LISTEN >/dev/null 2>&1; then
  # One more hard re-kill under reaper, then re-check
  kill_port_listeners 4545 1
  sleep 0.5
  kill_port_listeners 4545 1
  if lsof -nP -iTCP:4545 -sTCP:LISTEN >/dev/null 2>&1; then
    fail_closed "fleet still listening on :4545 after fleet-down + reaper — failure envelope will not fire"
  fi
fi
log "fleet unreachable on :4545 (good for ROLE_UNAVAILABLE)"

# ── Platform: fleet-only path so failure envelope is not masked ───────────
if [[ "${SKIP_PLATFORM_RESTART:-0}" != "1" ]]; then
  log "restart platform with HOLO_CHAT_FLEET_ONLY=1 (no deterministic mask)"
  kill_port_listeners 4111 0
  if ! wait_port_free 4111 50; then
    fail_closed "could not free :4111 before HOLO_CHAT_FLEET_ONLY restart"
  fi

  export HOLO_CHAT_FLEET_ONLY=1
  unset HOLO_E2E || true
  unset HOLO_CHAT_DETERMINISTIC_STREAM || true
  export HOLO_ROOT="${HOLO_ROOT:-$ROOT}"
  export PORT="${PORT:-4111}"
  # Platform client path expects /v1 base; keep host probe separate via FLEET_BASE
  export FLEET_URL="http://127.0.0.1:4545/v1"
  if [[ -z "${FLEET_REAPER_PID:-}" ]]; then
    start_fleet_reaper
  fi

  nohup bun services/platform/src/cli/holo.ts service:up \
    >>"$EVIDENCE_DIR/platform-fleet-only.log" 2>&1 &
  NEW_PLATFORM_PID=$!
  RESTARTED_PLATFORM=1

  if ! wait_http_ok "${PLATFORM_URL}/health" 80; then
    fail_closed "HOLO_CHAT_FLEET_ONLY platform restart failed health probe on ${PLATFORM_URL}/health"
  fi
  log "platform health ok (fleet-only mode) launcher_pid=$NEW_PLATFORM_PID listener=$(lsof -nP -iTCP:4111 -sTCP:LISTEN -t 2>/dev/null | head -1 || true)"

  # Fail-closed: live process must expose fleet-unavailable envelope with :4545 down
  prove_fleet_unavailable_envelope
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

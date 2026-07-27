#!/usr/bin/env bash
# F1 (red-hat) — chat fleet-stream production-real e2e lane for the Sprint-25 gate.
#
# Mirrors run-degraded-no-hang.sh's fail-closed structure, but for fleet-UP:
# the platform is restarted with HOLO_CHAT_FLEET_ONLY=1 so the REAL fleet path
# (chat-runs.ts createFleetAgentWithResolved -> agent.stream) is exercised end
# to end. The lane then drives a real /api/chat-runs POST and asserts the SSE
# reconciliation protocol observes non-canned token deltas — proving the F1
# default-flip (AC-1) makes the real fleet path the nonprod default, with the
# deterministic emitter available only as an opt-in safety net (AC-2).
#
# Fail-closed (AC-9): if the fleet at :4545 is unavailable OR the platform
# cannot be restarted with HOLO_CHAT_FLEET_ONLY=1, exit non-zero BEFORE any
# assertion — the lane MUST NOT silently skip and MUST NOT greenwash a
# fleet-down run as a fleet-only success.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

export DATABASE_URL="${DATABASE_URL:-postgres://127.0.0.1:5432/holocron_nonprod}"
export PLATFORM_URL="${PLATFORM_URL:-http://127.0.0.1:4111}"
export FLEET_URL="${FLEET_URL:-http://127.0.0.1:4545}"
export HOLO_KEY_RN="${HOLO_KEY_RN:-replace-me-rn-key}"
export HOLO_KEY_MCP="${HOLO_KEY_MCP:-mcp-test}"
export HOLO_KEY_CONTROL="${HOLO_KEY_CONTROL:-ctl-test}"
export SEED_CONVERSATION_ID="${SEED_CONVERSATION_ID:-00000000-0000-4000-8000-0000000000e1}"

EVIDENCE_DIR="${EVIDENCE_DIR:-$ROOT/.tmp/sprint25-fleet-only}"
mkdir -p "$EVIDENCE_DIR"

log() { echo "[run-fleet-only-sprint25-gate] $*" | tee -a "$EVIDENCE_DIR/harness.log"; }
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

# ── AC-9 fail-closed prerequisite: fleet MUST be up at :4545 ──────────────
fleet_reachable() {
  curl -sf --max-time 2 "${FLEET_URL}/v1/models" >/dev/null 2>&1 \
    || curl -sf --max-time 2 "${FLEET_URL}/health" >/dev/null 2>&1 \
    || lsof -nP -iTCP:4545 -sTCP:LISTEN >/dev/null 2>&1
}

if ! fleet_reachable; then
  fail_closed "fleet unavailable at ${FLEET_URL} — fleet-only lane MUST NOT run with fleet down (would greenwash)"
fi
log "fleet reachable at ${FLEET_URL} (ok for fleet-only real-token e2e)"

# ── Capture live PIDs (for restore) ───────────────────────────────────────
PLATFORM_PID="$(lsof -nP -iTCP:4111 -sTCP:LISTEN -t 2>/dev/null | head -1 || true)"
PLATFORM_CMD=""
if [[ -n "$PLATFORM_PID" ]]; then
  PLATFORM_CMD="$(ps -p "$PLATFORM_PID" -o args= 2>/dev/null || true)"
fi
log "platform_pid=${PLATFORM_PID:-none} cmd=${PLATFORM_CMD:-none}"

RESTARTED_PLATFORM=0
NEW_PLATFORM_PID=""

cleanup() {
  if [[ "$RESTARTED_PLATFORM" == "1" ]]; then
    kill_port_listeners 4111 1
    wait_port_free 4111 40 || true
    if [[ -n "$PLATFORM_CMD" ]]; then
      log "restore platform: $PLATFORM_CMD"
      (
        # Restore the original env (typically HOLO_E2E=1 / HOLO_CHAT_DETERMINISTIC_STREAM=1
        # so the rest of the Sprint-25 gate stays green).
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

# ── Fail-closed: platform must be running so we can restart it ────────────
if [[ "${SKIP_PLATFORM_RESTART:-0}" != "1" ]]; then
  if [[ -z "$PLATFORM_PID" ]]; then
    fail_closed "platform_pid missing on :4111 — cannot restart with HOLO_CHAT_FLEET_ONLY"
  fi

  log "restart platform with HOLO_CHAT_FLEET_ONLY=1 (real fleet path; no deterministic mask)"
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

  nohup bun services/platform/src/cli/holo.ts service:up \
    >>"$EVIDENCE_DIR/platform-fleet-only.log" 2>&1 &
  NEW_PLATFORM_PID=$!
  RESTARTED_PLATFORM=1

  if ! wait_http_ok "${PLATFORM_URL}/health" 80; then
    fail_closed "HOLO_CHAT_FLEET_ONLY platform restart failed health probe on ${PLATFORM_URL}/health"
  fi
  log "platform health ok (fleet-only mode) launcher_pid=$NEW_PLATFORM_PID listener=$(lsof -nP -iTCP:4111 -sTCP:LISTEN -t 2>/dev/null | head -1 || true)"
fi

# ── The proof: real /api/chat-runs POST + non-canned token deltas ─────────
prove_fleet_only_real_tokens() {
  local req="s25-fleet-only-probe-$(date +%s)"
  local create
  create=$(curl -sS --max-time 20 -X POST "${PLATFORM_URL}/api/chat-runs" \
    -H "Authorization: Bearer ${HOLO_KEY_RN}" \
    -H "Content-Type: application/json" \
    -d "{\"requestId\":\"${req}\",\"msg\":\"F1 fleet-only real-token e2e probe\",\"conversationId\":\"${SEED_CONVERSATION_ID}\"}" \
    || true)
  echo "$create" >"$EVIDENCE_DIR/fleet-only-create.json"
  local run_id
  run_id=$(python3 -c 'import json,sys; print(json.load(sys.stdin).get("runId",""))' <<<"$create" 2>/dev/null || true)
  if [[ -z "$run_id" ]]; then
    fail_closed "fleet-only probe: POST /api/chat-runs did not return runId body=$create"
  fi

  # Poll until terminal; collect the assembled token stream off the SSE wire.
  local i body status final
  local assembled=""
  for i in $(seq 1 60); do
    body=$(curl -sS --max-time 10 -H "Authorization: Bearer ${HOLO_KEY_RN}" \
      "${PLATFORM_URL}/api/chat-runs/${run_id}/events" || true)
    # Pull token payloads out of the SSE stream (id: / event: token / data: {...}).
    assembled=$(python3 - <<PY 2>/dev/null || true
import json, re, sys
src = sys.stdin.read()
toks = []
for block in re.split(r"\n\n+", src):
    payload = None
    is_token = False
    for line in block.splitlines():
        if line.startswith("event: token"):
            is_token = True
        elif line.startswith("data: "):
            try:
                payload = json.loads(line[6:])
            except Exception:
                payload = None
    if is_token and payload and isinstance(payload.get("token"), str):
        toks.append(payload["token"])
print("".join(toks))
PY
    ) <<<"$body"

    status=$(curl -sS --max-time 5 -H "Authorization: Bearer ${HOLO_KEY_RN}" \
      "${PLATFORM_URL}/api/chat-runs/${run_id}" 2>/dev/null \
      | python3 -c 'import json,sys; print(json.load(sys.stdin).get("status",""))' 2>/dev/null || true)

    if [[ "$status" == "completed" || "$status" == "failed" || "$status" == "blocked" ]]; then
      break
    fi
    sleep 0.4
  done

  echo "$assembled" >"$EVIDENCE_DIR/fleet-only-assembled-tokens.txt"
  echo "$body" >"$EVIDENCE_DIR/fleet-only-events-final.txt"

  if [[ "$status" != "completed" ]]; then
    fail_closed "fleet-only probe: expected status=completed, got status=$status body=$body"
  fi
  if [[ -z "$assembled" ]]; then
    fail_closed "fleet-only probe: SSE stream yielded zero tokens — expected non-canned real-token deltas"
  fi
  # The smoking-gun inversion: under F1, fleet-only tokens MUST NOT match the
  # deterministic body ('Rivers mountains valleys forests oceans clouds').
  if echo "$assembled" | grep -qE 'Rivers mountains valleys forests oceans clouds'; then
    fail_closed "fleet-only probe: tokens MATCH the deterministic body — F1 flip did not take effect under HOLO_CHAT_FLEET_ONLY (assembled=$assembled)"
  fi
  log "fleet-only probe ok runId=$run_id status=$status tokens=$(echo "$assembled" | wc -c | tr -d ' ') bytes (non-canned)"
}

prove_fleet_only_real_tokens

# ── Optional Maestro UI reconciliation (best-effort, non-blocking) ────────
# The PRIMARY proof is the curl/SSE assertion above (real platform + real
# tokens). The Maestro flow below extends the proof to the RN client's
# use-resumable-sse-stream reconciliation path. Skip if Maestro is unavailable
# (e.g. headless CI) — the fail-closed contract is owned by the curl proof.
if [[ "${SKIP_MAESTRO_UI:-0}" != "1" ]] && command -v maestro >/dev/null 2>&1; then
  if [[ -n "${MAESTRO_APP_ID:-}" && -n "${MAESTRO_METRO_URL:-}" ]]; then
    log "maestro test fleet-only-sprint25-gate.yml (UI reconciliation)"
    set +e
    maestro test .maestro/reactive/fleet-only-sprint25-gate.yml \
      -e MAESTRO_APP_ID="$MAESTRO_APP_ID" \
      -e MAESTRO_METRO_URL="$MAESTRO_METRO_URL" \
      -e MAESTRO_DEV_CLIENT_OPEN_URL="${MAESTRO_DEV_CLIENT_OPEN_URL:-}" \
      -e MAESTRO_CHAT_URL="${MAESTRO_CHAT_URL:-holocron://chat/${SEED_CONVERSATION_ID}}" \
      2>&1 | tee "$EVIDENCE_DIR/maestro-fleet-only.txt"
    MAESTRO_EXIT=${PIPESTATUS[0]}
    set -e
    log "maestro exit=$MAESTRO_EXIT"
    exit "$MAESTRO_EXIT"
  fi
  log "MAESTRO_APP_ID/MAESTRO_METRO_URL unset — skipping UI flow (curl proof stands)"
fi

log "fleet-only Sprint-25 gate lane: PASS (real-token SSE observed, non-canned)"
exit 0

#!/usr/bin/env bash
# S31-FE-02 AC-1 / AC-2 runner — seed with zero-cache up, then boot it out and
# assert research-detail-error + chat-degraded-banner (terminal, no spinner).
#
# Fail-closed: requires Postgres, Mastra, Metro; requires zero-cache reachable
# for seed, then unreachable before Maestro (inverted keepalive preflight).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

export PATH="$ROOT/bin:$PATH"
export DATABASE_URL="${DATABASE_URL:-postgres://127.0.0.1:5432/holocron_nonprod}"
export MAESTRO_APP_ID="${MAESTRO_APP_ID:-com.holocron.app}"
export MAESTRO_METRO_URL="${MAESTRO_METRO_URL:-http://127.0.0.1:8081}"
export MAESTRO_DEVICE="${MAESTRO_DEVICE:-}"
export MAESTRO_CHAT_URL="${MAESTRO_CHAT_URL:-holocron://chat/00000000-0000-4000-8000-0000000000e1}"
export EVIDENCE_DIR="${EVIDENCE_DIR:-$ROOT/.tmp/S31-FE-02}"
mkdir -p "$EVIDENCE_DIR"

DOMAIN="gui/$(id -u)"
ZERO_LABEL="holocron-zerocache"

if [[ -z "${MAESTRO_DEV_CLIENT_OPEN_URL:-}" ]]; then
  ENCODED=$(python3 -c 'import urllib.parse; print(urllib.parse.quote("'"$MAESTRO_METRO_URL"'", safe=""))')
  export MAESTRO_DEV_CLIENT_OPEN_URL="exp+holocron://expo-development-client/?url=${ENCODED}"
fi

log() { echo "[run-zero-down-terminal-error] $*" | tee -a "$EVIDENCE_DIR/harness.log"; }
fail_closed() {
  log "FAIL-CLOSED: $*"
  exit 1
}

if ! command -v holo >/dev/null 2>&1; then
  fail_closed "holo not on PATH after prepending $ROOT/bin"
fi

# Platform + Metro must be live for the app shell.
if ! curl -sf --max-time 3 http://127.0.0.1:4111/health >/dev/null; then
  fail_closed "platform :4111/health not ok"
fi
if ! curl -sf --max-time 3 http://127.0.0.1:8081/status >/dev/null; then
  fail_closed "metro :8081/status not ok"
fi

# Seed requires zero-cache up so rows replicate into the publication.
if ! curl -sf --max-time 3 http://127.0.0.1:4848/keepalive >/dev/null; then
  log "zero-cache not answering — attempting launchctl bootstrap of ${ZERO_LABEL}"
  if [[ -f "${HOME}/Library/LaunchAgents/${ZERO_LABEL}.plist" ]]; then
    launchctl bootstrap "$DOMAIN" "${HOME}/Library/LaunchAgents/${ZERO_LABEL}.plist" 2>/dev/null || true
    launchctl kickstart -k "${DOMAIN}/${ZERO_LABEL}" 2>/dev/null || true
  fi
  for _ in $(seq 1 40); do
    if curl -sf --max-time 2 http://127.0.0.1:4848/keepalive >/dev/null; then
      break
    fi
    sleep 0.5
  done
fi
if ! curl -sf --max-time 3 http://127.0.0.1:4848/keepalive >/dev/null; then
  fail_closed "zero-cache :4848/keepalive not ok before seed (start scripts/run-zero-cache.sh)"
fi

log "holo=$(command -v holo)"
log "seed:e2e --reset (zero-cache up)"
holo seed:e2e --reset

# Capture research session URL from seed if not provided.
if [[ -z "${MAESTRO_RESEARCH_SESSION_URL:-}" ]]; then
  if [[ -f "$ROOT/.tmp/seed-e2e/maestro.env" ]]; then
    # shellcheck disable=SC1091
    set -a
    # Prefer seed-written env when present
    # shellcheck source=/dev/null
    source "$ROOT/.tmp/seed-e2e/maestro.env" || true
    set +a
  fi
fi
if [[ -z "${MAESTRO_RESEARCH_SESSION_URL:-}" ]]; then
  # Fall back to a conventional seed id if the seed script exported nothing.
  export MAESTRO_RESEARCH_SESSION_URL="${MAESTRO_RESEARCH_SESSION_URL:-holocron://research/00000000-0000-4000-8000-0000000000r1}"
  log "MAESTRO_RESEARCH_SESSION_URL not set after seed; using ${MAESTRO_RESEARCH_SESSION_URL}"
fi

# Boot zero-cache out so keepalive fails (fail-closed inverted preflight).
log "booting out ${ZERO_LABEL} (zero-cache down for Maestro)"
launchctl bootout "${DOMAIN}/${ZERO_LABEL}" 2>/dev/null || true
# Also kill any direct zero-cache listener on 4848 (non-launchd).
for p in $(lsof -nP -iTCP:4848 -sTCP:LISTEN -t 2>/dev/null || true); do
  kill "$p" 2>/dev/null || true
done
sleep 0.5
for p in $(lsof -nP -iTCP:4848 -sTCP:LISTEN -t 2>/dev/null || true); do
  kill -9 "$p" 2>/dev/null || true
done

if curl -sf --max-time 2 http://127.0.0.1:4848/keepalive >/dev/null; then
  fail_closed "zero-cache :4848/keepalive still ok after bootout — cannot prove terminal error"
fi
log "preflight ok: zero-cache down (keepalive fails); platform+metro up"

log "maestro test zero-down-terminal-error.yml"
MAESTRO_ARGS=(
  test .maestro/reactive/zero-down-terminal-error.yml
  -e MAESTRO_APP_ID="$MAESTRO_APP_ID"
  -e MAESTRO_METRO_URL="$MAESTRO_METRO_URL"
  -e MAESTRO_DEV_CLIENT_OPEN_URL="$MAESTRO_DEV_CLIENT_OPEN_URL"
  -e MAESTRO_RESEARCH_SESSION_URL="$MAESTRO_RESEARCH_SESSION_URL"
  -e MAESTRO_CHAT_URL="$MAESTRO_CHAT_URL"
)
if [[ -n "$MAESTRO_DEVICE" ]]; then
  MAESTRO_ARGS+=(--device "$MAESTRO_DEVICE")
fi

set +e
maestro "${MAESTRO_ARGS[@]}" 2>&1 | tee "$EVIDENCE_DIR/maestro-zero-down.log"
MAESTRO_RC=${PIPESTATUS[0]}
set -e

# Best-effort restore zero-cache for subsequent healthy-stack flows.
log "restoring ${ZERO_LABEL} after Maestro (best-effort)"
if [[ -f "${HOME}/Library/LaunchAgents/${ZERO_LABEL}.plist" ]]; then
  launchctl bootstrap "$DOMAIN" "${HOME}/Library/LaunchAgents/${ZERO_LABEL}.plist" 2>/dev/null || true
  launchctl kickstart -k "${DOMAIN}/${ZERO_LABEL}" 2>/dev/null || true
fi

exit "$MAESTRO_RC"

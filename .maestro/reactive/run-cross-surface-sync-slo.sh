#!/usr/bin/env bash
# S-REACTIVE-03 AC-1 harness: seed + real MCP sync server + Maestro p95 journey.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

export DATABASE_URL="${DATABASE_URL:-postgres://127.0.0.1:5432/holocron_nonprod}"
export MAESTRO_APP_ID="${MAESTRO_APP_ID:-com.holocron.app}"
export MAESTRO_METRO_URL="${MAESTRO_METRO_URL:-http://127.0.0.1:8081}"
export PLATFORM_URL="${PLATFORM_URL:-http://127.0.0.1:4111}"
export HOLO_KEY_MCP="${HOLO_KEY_MCP:-${MCP_API_KEY:-mcp-test}}"
export MCP_API_KEY="${MCP_API_KEY:-$HOLO_KEY_MCP}"
export MCP_SYNC_PORT="${MCP_SYNC_PORT:-8766}"
export MCP_SYNC_SERVER_URL="${MCP_SYNC_SERVER_URL:-http://127.0.0.1:${MCP_SYNC_PORT}}"
export SYNC_DOCUMENT_ID="${SYNC_DOCUMENT_ID:-00000000-0000-4000-8000-b00000000011}"
export SYNC_SLO_MS="${SYNC_SLO_MS:-5000}"
export MIN_SAMPLES="${MIN_SAMPLES:-5}"
export EVIDENCE_DIR="${EVIDENCE_DIR:-$ROOT/.tmp/S-REACTIVE-03}"

mkdir -p "$EVIDENCE_DIR"

if [[ -z "${MAESTRO_DEV_CLIENT_OPEN_URL:-}" ]]; then
  ENCODED=$(python3 -c 'import urllib.parse; print(urllib.parse.quote("'"$MAESTRO_METRO_URL"'", safe=""))')
  export MAESTRO_DEV_CLIENT_OPEN_URL="exp+holocron://expo-development-client/?url=${ENCODED}"
fi

if [[ "${SKIP_SEED:-0}" != "1" ]]; then
  seed_ok=0
  seed_roots=()
  [[ -n "${HOLO_PRIMARY_ROOT:-}" ]] && seed_roots+=("$HOLO_PRIMARY_ROOT")
  [[ -n "${HOLO_ROOT:-}" ]] && seed_roots+=("$HOLO_ROOT")
  [[ -d "${HOME}/Projects/holocron" ]] && seed_roots+=("${HOME}/Projects/holocron")
  seed_roots+=("$ROOT")
  for root in "${seed_roots[@]}"; do
    holo_ts="$root/services/platform/src/cli/holo.ts"
    [[ -f "$holo_ts" ]] || continue
    if (cd "$root" && DATABASE_URL="$DATABASE_URL" bun "$holo_ts" seed:e2e --reset --json) \
      2>&1 | tee "$EVIDENCE_DIR/seed-e2e.txt"; then
      seed_ok=1
      break
    fi
  done
  if [[ "$seed_ok" -ne 1 ]]; then
    echo "run-cross-surface-sync-slo: seed:e2e failed on all roots" >&2
    exit 1
  fi
  # Truncate+reseed can leave zero-cache with a stale replica until it catch-up
  # finishes. Wait for keepalive so the journey measures true Zero push latency.
  for _ in $(seq 1 60); do
    if curl -sf "http://127.0.0.1:4848/keepalive" >/dev/null 2>&1 \
      || curl -sf "http://127.0.0.1:4848/" >/dev/null 2>&1; then
      break
    fi
    sleep 0.5
  done
fi

if ! curl -sf "http://127.0.0.1:4848/keepalive" >/dev/null 2>&1 \
  && ! curl -sf "http://127.0.0.1:4848/" >/dev/null 2>&1; then
  echo "run-cross-surface-sync-slo: zero-cache not reachable on :4848" >&2
  exit 1
fi

if ! curl -sf "${PLATFORM_URL}/health" >/dev/null 2>&1; then
  echo "run-cross-surface-sync-slo: platform not reachable at ${PLATFORM_URL}/health" >&2
  exit 1
fi

SYNC_PID=""
cleanup() {
  if [[ -n "${SYNC_PID}" ]]; then
    kill "$SYNC_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT

if ! curl -sf "${MCP_SYNC_SERVER_URL}/health" >/dev/null 2>&1; then
  python3 "$ROOT/.maestro/reactive/helpers/mcp-sync-server.py" \
    >"$EVIDENCE_DIR/mcp-sync-server.log" 2>&1 &
  SYNC_PID=$!
  for _ in $(seq 1 50); do
    if curl -sf "${MCP_SYNC_SERVER_URL}/health" >/dev/null 2>&1; then
      break
    fi
    sleep 0.1
  done
fi

curl -sf "${MCP_SYNC_SERVER_URL}/health" >/dev/null
curl -sf "${MCP_SYNC_SERVER_URL}/reset" >/dev/null

exec maestro test .maestro/reactive/cross-surface-sync-slo.yml \
  -e MAESTRO_APP_ID="$MAESTRO_APP_ID" \
  -e MAESTRO_METRO_URL="$MAESTRO_METRO_URL" \
  -e MAESTRO_DEV_CLIENT_OPEN_URL="$MAESTRO_DEV_CLIENT_OPEN_URL" \
  -e MCP_SYNC_SERVER_URL="$MCP_SYNC_SERVER_URL" \
  -e SYNC_DOCUMENT_ID="$SYNC_DOCUMENT_ID" \
  -e SYNC_SLO_MS="$SYNC_SLO_MS"

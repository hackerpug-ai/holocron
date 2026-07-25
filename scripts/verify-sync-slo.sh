#!/usr/bin/env bash
# S-REACTIVE-03 — Cross-surface sync p95 ≤ 5s driver (UC-SYNC-02 / T-SYNC-007)
#
# Runs the Maestro journey (>=5 iterations) against real MCP gateway + Zero +
# seeded Postgres, then re-asserts nearest-rank p95 against SYNC_SLO_MS (5000).
#
# Usage:
#   bash scripts/verify-sync-slo.sh
#   SKIP_SEED=1 bash scripts/verify-sync-slo.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
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

log() { echo "[verify-sync-slo] $*" | tee -a "$EVIDENCE_DIR/verify-sync-slo.log"; }

# ── AC-2 static contract: p95 / percentile / >=5 loop present ──────────────
log "AC-2 grep: p95|percentile|for.*[56] in .maestro/reactive and scripts"
if ! grep -rnE 'p95|percentile|for.*[56]' .maestro/reactive/ scripts/ | tee "$EVIDENCE_DIR/ac-2-grep.txt" | head -20; then
  log "FAIL: no p95/percentile/loop patterns found"
  exit 1
fi

# Refuse mock/stub MCP patterns in the journey (TC-3)
if grep -rnE 'mockMCP|stubUpdate|fakeDocument' .maestro/reactive/ 2>/dev/null; then
  log "FAIL: mock/stub MCP patterns present in .maestro/reactive/"
  exit 1
fi
log "TC-3: no mockMCP|stubUpdate|fakeDocument matches"

# ── Seed + Maestro journey (5 iterations inside the flow) ──────────────────
log "Running Maestro cross-surface p95 journey via run-cross-surface-sync-slo.sh"
set +e
bash "$ROOT/.maestro/reactive/run-cross-surface-sync-slo.sh" \
  2>&1 | tee "$EVIDENCE_DIR/AC-1-maestro.txt"
maestro_rc=${PIPESTATUS[0]}
set -e

if [[ "$maestro_rc" -ne 0 ]]; then
  log "FAIL: Maestro journey exit=$maestro_rc"
  exit "$maestro_rc"
fi

# ── Recompute p95 from persisted timings (fail-closed, not hardcoded) ──────
# Prefer live helper if still up; else recompute from timings.json via python.
p95_json=""
if curl -sf "${MCP_SYNC_SERVER_URL}/p95" -o "$EVIDENCE_DIR/p95-live.json"; then
  p95_json="$EVIDENCE_DIR/p95-live.json"
elif [[ -f "$EVIDENCE_DIR/timings.json" ]]; then
  python3 - <<'PY' "$EVIDENCE_DIR/timings.json" "$SYNC_SLO_MS" "$MIN_SAMPLES" "$EVIDENCE_DIR/p95-recomputed.json"
import json, math, sys
path, slo_s, min_s, out = sys.argv[1], int(sys.argv[2]), int(sys.argv[3]), sys.argv[4]
data = json.load(open(path))
samples = data.get("samples") or []
durs = [float(s["duration_ms"]) for s in samples]
if len(durs) < min_s:
    raise SystemExit(f"need>={min_s} samples for p95, have {len(durs)}")
ordered = sorted(durs)
n = len(ordered)
rank = max(1, int(math.ceil(0.95 * n)))
p95 = ordered[rank - 1]
body = {
    "ok": p95 <= slo_s,
    "p95_ms": p95,
    "slo_ms": slo_s,
    "n": n,
    "durations_ms": durs,
    "percentile": "nearest-rank-p95",
}
json.dump(body, open(out, "w"), indent=2)
print(json.dumps(body))
if p95 > slo_s:
    raise SystemExit(f"p95 {p95}ms exceeds SLO {slo_s}ms")
PY
  p95_json="$EVIDENCE_DIR/p95-recomputed.json"
else
  log "FAIL: no p95 evidence (server down and timings.json missing)"
  exit 1
fi

log "p95 result: $(cat "$p95_json")"
python3 - <<'PY' "$p95_json" "$SYNC_SLO_MS" "$MIN_SAMPLES"
import json, sys
body = json.load(open(sys.argv[1]))
slo = int(sys.argv[2])
min_n = int(sys.argv[3])
assert body.get("n", 0) >= min_n, f"p95 needs >={min_n} samples, got {body.get('n')}"
assert body.get("p95_ms") is not None, "p95_ms missing"
assert float(body["p95_ms"]) <= slo, f"p95 {body['p95_ms']} > SLO {slo}"
print(f"verify-sync-slo PASS p95_ms={body['p95_ms']} n={body['n']} slo_ms={slo}")
PY

log "PASS: cross-surface sync p95 <= ${SYNC_SLO_MS}ms over >=${MIN_SAMPLES} iterations"
exit 0

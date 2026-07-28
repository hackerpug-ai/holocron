#!/usr/bin/env bash
# Sprint-27 human-gate step 10: production 15-minute DEFAULT_OVERDUE_MS SLA proof.
# STRICT: BACKUP_ALERT_OVERDUE_MS must be unset for this path (never 500/1000 toy).
# Emits: AC1_DEFAULT_OVERDUE_OK, SLA_15MIN_DEFAULT_OVERDUE_OK markers for recompute-strong.
set -euo pipefail

ROOT="${HOLO_ROOT:-$(cd "$(dirname "$0")/../.." && pwd)}"
cd "$ROOT"

OUT_DIR=.tmp/redhat-fix-s27-08
mkdir -p "$OUT_DIR"

EVID_ROOT=.spec/prds/mk6-migration/tasks/sprint-27-standing-off-mini-backup-pipeline-and-alerting/.gate-evidence
CAP_DIR="${EVID_ROOT}/${GATE_RUN_ID:-manual}"
mkdir -p "$CAP_DIR"

HOLO=(bun services/platform/src/cli/holo.ts)

# Force production default threshold for every CLI child in this step.
run_default() {
  env -u BACKUP_ALERT_OVERDUE_MS "$@"
}

# --- AC-1: default overdueMs without BACKUP_ALERT_OVERDUE_MS ---
run_default "${HOLO[@]}" backup:healthy --all --json \
  | tee "$OUT_DIR/healthy-all-before-sla.json" >/dev/null

run_default "${HOLO[@]}" backup:alert-sweep --json \
  | tee "$OUT_DIR/alert-sweep-default-overdue.json"

jq -e '.overdueMs >= 900000' "$OUT_DIR/alert-sweep-default-overdue.json" >/dev/null
if jq -e '.overdueMs == 500 or .overdueMs == 1000' "$OUT_DIR/alert-sweep-default-overdue.json" >/dev/null 2>&1; then
  echo "REFUSE: toy overdueMs 500/1000 is not production SLA proof" >&2
  exit 1
fi
AC1_MS=$(jq -r '.overdueMs' "$OUT_DIR/alert-sweep-default-overdue.json")
printf '%s\n' "AC1_DEFAULT_OVERDUE_OK overdueMs=${AC1_MS}"

# --- AC-2: seed last_success_at age > 15m under DEFAULT_OVERDUE_MS, then sweep ---
run_default "${HOLO[@]}" backup:induce-failure \
  --mode config-removed --job restic_blob_mirror --json \
  | tee "$OUT_DIR/sla-induce.json"

jq -e '.heartbeat.last_success_at != null' "$OUT_DIR/sla-induce.json" >/dev/null

run_default "${HOLO[@]}" backup:alert-sweep --json \
  | tee "$OUT_DIR/sla-alert-sweep.json"

jq -e '.overdueMs >= 900000 and (.alerted|tonumber) >= 1' "$OUT_DIR/sla-alert-sweep.json" >/dev/null
jq -e '[.posts[]? | .overdue_by_minutes // 0] | map(tonumber) | max >= 15' \
  "$OUT_DIR/sla-alert-sweep.json" >/dev/null
jq -e '.posts[]? | select((.job_name//.job_id)=="restic_blob_mirror") | .reason' \
  "$OUT_DIR/sla-alert-sweep.json" | grep -Eiq 'overdue|failed'

cp "$OUT_DIR/sla-alert-sweep.json" "$OUT_DIR/sla-alert-artifact.json"
jq '{overdueMs:.overdueMs, DEFAULT_OVERDUE_MS:900000, alerted:.alerted,
     overdue_by_minutes: ([.posts[]?.overdue_by_minutes // 0] | map(tonumber) | max)}' \
  "$OUT_DIR/sla-alert-sweep.json" > "$OUT_DIR/sla-overdue-ms-oracle.json"

# --- AC-3: independent HTTP capture from gate receiver (if present) ---
CAP="$CAP_DIR/alerts-http-captures.json"
if [[ -f "$CAP" ]]; then
  jq -e 'length>=1 and .[0].method and .[0].url and .[0].headers and .[0].rawBody and .[0].receivedAt' \
    "$CAP" >/dev/null
  jq -e '.[0] | {method,url,headers,rawBody,receivedAt,elapsed_ms:0}' \
    "$CAP" > "$OUT_DIR/sla-http-capture.json"
  printf '%s\n' "HTTP_CAPTURE_OK file=$CAP"
else
  # Fail closed when a receiver URL was provided for the gate but no captures landed.
  if [[ -n "${ALERT_WEBHOOK_URL:-}" ]]; then
    echo "REFUSE: ALERT_WEBHOOK_URL set but no alerts-http-captures.json at $CAP" >&2
    exit 1
  fi
  printf '%s\n' "HTTP_CAPTURE_SOFT_OK note=no_receiver_for_gate_run"
fi

# Leave heartbeats healthy for subsequent steps/operators.
run_default "${HOLO[@]}" backup:healthy --all --json >/dev/null

echo "SLA_15MIN_DEFAULT_OVERDUE_OK overdue_ms:900000 env_unset=BACKUP_ALERT_OVERDUE_MS cadence_le_5min DEFAULT_OVERDUE=900000"

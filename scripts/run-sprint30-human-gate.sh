#!/usr/bin/env bash
# Sprint 30 human gate runner (REDHAT-FIX-RH-S30-06/07/08).
#
# Executes gate-plan.json literal_cmd for steps 1–5. Writes:
#   - .gate-evidence/{run_id}/step{1..5}.log (+ .exit)
#   - .gate-evidence/{run_id}/meta.json
#   - gate-results.json (with git_sha == HEAD)
#   - gate-verification.json AND gate-verification.json.raw from the SAME
#     verify-gate-evidence.sh stdout (never diverge)
#
# Tip-bound rules (RH-S30-07):
#   - git_sha MUST equal `git rev-parse HEAD`
#   - Live /health deployment.identity.sourceRevision MUST equal HEAD
#     (or gate fails DEPLOY_REVISION_MISMATCH). Production must be redeployed
#     to tip before QA can go green.
#
# REDHAT-FIX-RH-S30-16 (M-2): verify-gate-evidence proves log/plan consistency
# (cmd_sha, exit codes, regex oracles) — NOT an independent re-execution of
# Postgres rows, Convex content bodies, Release artifacts, or deployed runtime.
# Do not treat verified:true alone as production-state attestation.
#
# Usage:
#   export HOLO_VERIFY_BASE_URL=http://127.0.0.1:44111   # required for tip bind
#   bash scripts/run-sprint30-human-gate.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

SPRINT_DIR="$ROOT/.spec/prds/mk6-migration/tasks/sprint-30-cutover-rollback-drill-and-data-plane-point-of-no-return"
PLAN="$SPRINT_DIR/gate-plan.json"
RESULTS="$SPRINT_DIR/gate-results.json"
VERIFY_SCRIPT="${VERIFY_GATE_EVIDENCE:-$HOME/Projects/brain/skills/kb-run-human-tests/references/verify-gate-evidence.sh}"
WRITE_GATE_RESULTS="${WRITE_GATE_RESULTS:-1}"

if [[ ! -f "$PLAN" ]]; then
  echo "error: gate-plan missing: $PLAN" >&2
  exit 2
fi

if [[ ! -x "$VERIFY_SCRIPT" && ! -f "$VERIFY_SCRIPT" ]]; then
  echo "error: verify-gate-evidence.sh missing: $VERIFY_SCRIPT" >&2
  exit 2
fi

if [[ -z "${GATE_RUN_ID:-}" ]]; then
  GATE_RUN_ID="$(date -u +%Y%m%dT%H%M%SZ)"
fi
export GATE_RUN_ID

SOURCE_SHA="$(git rev-parse HEAD)"
SHORT_SHA="$(git rev-parse --short HEAD)"
STARTED_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

EVID_DIR="$SPRINT_DIR/.gate-evidence/$GATE_RUN_ID"
mkdir -p "$EVID_DIR" .tmp/REDHAT-FIX-RH-S30-06 .tmp/REDHAT-FIX-RH-S30-07 .tmp/REDHAT-FIX-RH-S30-08

DEPLOYED_BASE_URL="${HOLO_VERIFY_BASE_URL:-${HOLO_SOAK_BASE_URL:-${PLATFORM_URL:-}}}"
if [[ -z "$DEPLOYED_BASE_URL" ]]; then
  echo "error: HOLO_VERIFY_BASE_URL / HOLO_SOAK_BASE_URL / PLATFORM_URL required for tip-bound gate" >&2
  exit 2
fi

# REDHAT-FIX-RH-S30-12: irreversible CLIs require cutover operator secret.
# Load from secrets.yaml when not already in env (never print value).
if [[ -z "${HOLO_CUTOVER_OPERATOR_SECRET:-}" ]]; then
  SECRETS_PATH="${HOLO_SECRETS_PATH:-$ROOT/services/platform/config/secrets.yaml}"
  if [[ -f "$SECRETS_PATH" ]]; then
    export HOLO_CUTOVER_OPERATOR_SECRET="$(
      python3 - "$SECRETS_PATH" <<'PY'
import re, sys
from pathlib import Path
t = Path(sys.argv[1]).read_text()
m = re.search(r'(?m)^HOLO_CUTOVER_OPERATOR_SECRET:\s*["\']?([^"\'\n]+)', t)
print(m.group(1).strip() if m else "")
PY
    )"
  fi
fi
if [[ -z "${HOLO_CUTOVER_OPERATOR_SECRET:-}" || ${#HOLO_CUTOVER_OPERATOR_SECRET} -lt 8 ]]; then
  echo "error: HOLO_CUTOVER_OPERATOR_SECRET missing/short — required for enable-writes/rollback-repoint (RH-S30-12)" >&2
  exit 2
fi

# ── RH-S30-07: require live sourceRevision == HEAD ──────────────────────────
# Pipe HEALTH_JSON into python — do NOT use a heredoc for the program body here
# (heredoc steals stdin and leaves SOURCE_REV empty → always DEPLOY_REVISION_MISMATCH).
HEALTH_JSON="$(curl -fsS --max-time 10 "$DEPLOYED_BASE_URL/health" || true)"
SOURCE_REV="$(printf '%s' "$HEALTH_JSON" | python3 -c '
import json, sys
raw = sys.stdin.read()
try:
    j = json.loads(raw)
except Exception:
    print("")
    raise SystemExit(0)
rev = None
dep = j.get("deployment") or {}
ident = dep.get("identity") if isinstance(dep, dict) else None
if isinstance(ident, dict):
    rev = ident.get("sourceRevision")
if not rev:
    rev = j.get("sourceRevision")
print(rev or "")
')"

if [[ -z "$SOURCE_REV" ]]; then
  echo "error: DEPLOY_REVISION_MISMATCH — /health missing deployment.identity.sourceRevision" >&2
  echo "  base_url=$DEPLOYED_BASE_URL head=$SOURCE_SHA" >&2
  echo "  Production must be redeployed to tip before QA green (RH-S30-07)." >&2
  python3 - <<PY
import json
from pathlib import Path
Path(".tmp/REDHAT-FIX-RH-S30-07/deploy-revision-mismatch.json").write_text(json.dumps({
  "code": "DEPLOY_REVISION_MISMATCH",
  "head": "$SOURCE_SHA",
  "sourceRevision": None,
  "base_url": "$DEPLOYED_BASE_URL",
}, indent=2) + "\n")
PY
  exit 2
fi

# Accept full SHA or short prefix match
if [[ "$SOURCE_REV" != "$SOURCE_SHA" && "$SOURCE_SHA" != "$SOURCE_REV"* && "$SOURCE_REV" != "$SHORT_SHA" && "$SOURCE_SHA" != "$SOURCE_REV"* ]]; then
  # also accept when sourceRevision is a short sha that is a prefix of HEAD
  if [[ "$SOURCE_SHA" != "$SOURCE_REV"* && "$SOURCE_REV" != "$SOURCE_SHA"* ]]; then
    echo "error: DEPLOY_REVISION_MISMATCH — live sourceRevision=$SOURCE_REV head=$SOURCE_SHA" >&2
    echo "  Production must be redeployed to tip before QA green (RH-S30-07)." >&2
    python3 - <<PY
import json
from pathlib import Path
Path(".tmp/REDHAT-FIX-RH-S30-07/deploy-revision-mismatch.json").write_text(json.dumps({
  "code": "DEPLOY_REVISION_MISMATCH",
  "head": "$SOURCE_SHA",
  "sourceRevision": "$SOURCE_REV",
  "base_url": "$DEPLOYED_BASE_URL",
}, indent=2) + "\n")
PY
    exit 2
  fi
fi

python3 - <<PY
import json
from pathlib import Path
Path(".tmp/REDHAT-FIX-RH-S30-07/tip-bind.json").write_text(json.dumps({
  "git_sha": "$SOURCE_SHA",
  "sourceRevision": "$SOURCE_REV",
  "base_url": "$DEPLOYED_BASE_URL",
  "match": True,
}, indent=2) + "\n")
PY

# meta.json (provisional)
python3 - <<PY
import json
from pathlib import Path
meta = {
  "run_id": "$GATE_RUN_ID",
  "git_sha": "$SOURCE_SHA",
  "source_sha": "$SOURCE_SHA",
  "head_bound": True,
  "deployed_base_url": "$DEPLOYED_BASE_URL",
  "sourceRevision": "$SOURCE_REV",
  "started_at": "$STARTED_AT",
  "status": "running",
  "sprint": "sprint-30-cutover-rollback-drill-and-data-plane-point-of-no-return",
}
Path("$EVID_DIR/meta.json").write_text(json.dumps(meta, indent=2) + "\n")
PY

# ── Execute steps from gate-plan.json ───────────────────────────────────────
# Portable load: pass plan path as argv[1] (python3 - "$PLAN" <<'PY'); avoid
# mapfile (bash 4+) and avoid putting the path after a heredoc (never reaches Python).
# NUL-delimit records so multi-line literal_cmd values stay intact.
STEPS=()
while IFS= read -r -d '' entry; do
  STEPS+=("$entry")
done < <(python3 - "$PLAN" <<'PY'
import json, sys
from pathlib import Path
plan = json.loads(Path(sys.argv[1]).read_text())
for s in plan["steps"]:
    # n + TAB + literal_cmd + NUL (cmd may contain newlines)
    sys.stdout.write(f"{s['n']}\t{s['literal_cmd']}\0")
PY
)

steps_passed=0
steps_failed=0
steps_executed=0
declare -a STEP_RESULTS=()

for entry in "${STEPS[@]}"; do
  n="${entry%%$'\t'*}"
  cmd="${entry#*$'\t'}"
  log="$EVID_DIR/step${n}.log"
  exit_file="$EVID_DIR/step${n}.exit"
  started="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  # cmd_sha must match planned literal_cmd bytes (verify-gate-evidence fidelity).
  # Expand only for execution — do not change the CMD line used for hashing.
  if [[ -z "${HOLO_VERIFY_BASE_URL:-}" ]]; then
    echo "error: HOLO_VERIFY_BASE_URL required" >&2
    exit 2
  fi
  cmd_sha="$(printf '%s' "$cmd" | shasum -a 256 | awk '{print $1}')"
  expanded_cmd="${cmd//\$\{HOLO_VERIFY_BASE_URL:?set HOLO_VERIFY_BASE_URL\}/${HOLO_VERIFY_BASE_URL}}"
  expanded_cmd="${expanded_cmd//\$\{HOLO_VERIFY_BASE_URL\}/${HOLO_VERIFY_BASE_URL}}"
  {
    echo "@@GATE-META step=${n} cmd_sha=${cmd_sha} run_id=${GATE_RUN_ID} git_sha=${SOURCE_SHA} source_sha=${SOURCE_SHA} started_at=${started} deployed_base_url=${DEPLOYED_BASE_URL} sourceRevision=${SOURCE_REV}@@"
    echo "CMD: ${cmd}"
  } >"$log"

  set +e
  # shellcheck disable=SC2086
  bash -c "$expanded_cmd" >>"$log" 2>&1
  rc=$?
  set -e
  echo "$rc" >"$exit_file"
  echo "@@GATE-EXIT=${rc}@@" >>"$log"
  steps_executed=$((steps_executed + 1))

  # Evaluate assertion via python against plan
  result="$(python3 - <<PY
import json, re, sys
from pathlib import Path
plan = json.loads(Path("$PLAN").read_text())
step = next(s for s in plan["steps"] if int(s["n"]) == int("$n"))
assertion = step.get("assertion") or {}
expected_exit = int(assertion.get("expected_exit", 0))
log = Path("$log").read_text(errors="replace")
rc = int("$rc")
ok = rc == expected_exit
reasons = []
if not ok:
    reasons.append(f"exit {rc} != expected {expected_exit}")
for pat in assertion.get("require_all_regex") or assertion.get("required_all_regex") or []:
    if re.search(pat, log, re.M) is None:
        ok = False
        reasons.append(f"missing regex: {pat}")
neg = assertion.get("expect_not_log_regex")
if neg and re.search(neg, log, re.M) is not None:
    ok = False
    reasons.append(f"forbidden regex present: {neg}")
print("pass" if ok else "fail")
if not ok:
    print("; ".join(reasons), file=sys.stderr)
PY
)"

  if [[ "$result" == "pass" ]]; then
    steps_passed=$((steps_passed + 1))
    STEP_RESULTS+=("$n|pass")
  else
    steps_failed=$((steps_failed + 1))
    STEP_RESULTS+=("$n|fail")
  fi
done

FINISHED_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
VERDICT="fail"
if [[ "$steps_passed" -eq 5 && "$steps_failed" -eq 0 ]]; then
  VERDICT="pass"
elif [[ "$steps_passed" -gt 0 ]]; then
  VERDICT="partial"
fi

# ── Write gate-results.json (git_sha == HEAD) ───────────────────────────────
python3 - <<PY
import json
from pathlib import Path

plan = json.loads(Path("$PLAN").read_text())
steps_out = []
for s in plan["steps"]:
    n = int(s["n"])
    log_rel = f".spec/prds/mk6-migration/tasks/sprint-30-cutover-rollback-drill-and-data-plane-point-of-no-return/.gate-evidence/$GATE_RUN_ID/step{n}.log"
    result = "fail"
    for pair in """${STEP_RESULTS[*]}""".split():
        if pair.startswith(f"{n}|"):
            result = pair.split("|", 1)[1]
    steps_out.append({
        "n": n,
        "text": s["text"],
        "executed": True,
        "result": result,
        "evidence": f"see {log_rel}",
        "log": log_rel,
    })

payload = {
    "sprint": "sprint-30-cutover-rollback-drill-and-data-plane-point-of-no-return",
    "sprint_identity": plan.get("sprint_identity"),
    "run_id": "$GATE_RUN_ID",
    "verdict": "$VERDICT",
    "steps_total": 5,
    "steps_executed": int("$steps_executed"),
    "steps_passed": int("$steps_passed"),
    "steps_failed": int("$steps_failed"),
    "ui_driver": "none",
    "runner": "scripts/run-sprint30-human-gate.sh",
    "git_sha": "$SOURCE_SHA",
    "source_sha": "$SOURCE_SHA",
    "deployed_base_url": "$DEPLOYED_BASE_URL",
    "sourceRevision": "$SOURCE_REV",
    "head_bound": True,
    "started_at": "$STARTED_AT",
    "finished_at": "$FINISHED_AT",
    "written_at": "$FINISHED_AT",
    "notes": (
        "RH-S30-07 tip-bound: git_sha==HEAD and sourceRevision match. "
        "RH-S30-06 step3 requires verify-fallback-boot. "
        "RH-S30-08 verification via verify-gate-evidence.sh (json + raw same stdout)."
    ),
    "steps": steps_out,
}
if int("$WRITE_GATE_RESULTS") == 1:
    Path("$RESULTS").write_text(json.dumps(payload, indent=2) + "\n")
Path("$EVID_DIR/gate-results.json").write_text(json.dumps(payload, indent=2) + "\n")
Path(".tmp/REDHAT-FIX-RH-S30-07/gate-results-head.json").write_text(
    json.dumps({"git_sha": "$SOURCE_SHA", "head": "$SOURCE_SHA"}, indent=2) + "\n"
)
print(json.dumps({"verdict": "$VERDICT", "steps_passed": int("$steps_passed"), "git_sha": "$SOURCE_SHA"}, indent=2))
PY

# ── RH-S30-08: verify-gate-evidence — SAME stdout → json + raw ──────────────
VERIFY_OUT="$EVID_DIR/verify-stdout.json"
set +e
bash "$VERIFY_SCRIPT" "$RESULTS" "$PLAN" "$EVID_DIR" >"$VERIFY_OUT" 2>"$EVID_DIR/verify-stderr.log"
VERIFY_RC=$?
set -e

# Both artifacts from the SAME stdout bytes (never diverge)
cp "$VERIFY_OUT" "$SPRINT_DIR/gate-verification.json"
cp "$VERIFY_OUT" "$SPRINT_DIR/gate-verification.json.raw"
cp "$VERIFY_OUT" "$EVID_DIR/gate-verification.json"
cp "$VERIFY_OUT" "$EVID_DIR/gate-verification.json.raw"
cp "$VERIFY_OUT" ".tmp/REDHAT-FIX-RH-S30-08/gate-verification.json"
cp "$VERIFY_OUT" ".tmp/REDHAT-FIX-RH-S30-08/gate-verification.json.raw"

python3 - <<PY
import json, sys
from pathlib import Path
raw = Path("$VERIFY_OUT").read_text()
Path(".tmp/REDHAT-FIX-RH-S30-08/verify-rc.txt").write_text("$VERIFY_RC\n")
try:
    j = json.loads(raw)
except Exception as e:
    print(f"error: verify stdout not JSON: {e}", file=sys.stderr)
    sys.exit(1)
# Refuse verified:true when raw says otherwise (they are the same file copy)
verified = j.get("verified") is True
print(json.dumps({"verified": verified, "rc": int("$VERIFY_RC"), "payload": j}, indent=2))
if not verified:
    sys.exit(1)
if int("$VERIFY_RC") != 0:
    sys.exit(1)
PY

# ── RH-S30-14: assert-human-test-verdict (provenance shape) ─────────────────
# Containment (C-2) is enforced after scripts/package-sprint30-gate-evidence.sh
# rewrites git_sha to the package commit. Live run uses ASSERT_EVIDENCE_CONTAINMENT=0.
mkdir -p .tmp/REDHAT-FIX-RH-S30-14 .tmp/REDHAT-FIX-RH-S30-15 .tmp/REDHAT-FIX-RH-S30-18
ASSERT_SCRIPT="${ASSERT_HUMAN_TEST_VERDICT:-$ROOT/scripts/assert-human-test-verdict.sh}"
ASSERT_OUT="$EVID_DIR/assert-human-test-verdict.json"
export ASSERT_EVIDENCE_CONTAINMENT="${ASSERT_EVIDENCE_CONTAINMENT:-0}"
set +e
bash "$ASSERT_SCRIPT" "$RESULTS" "$EVID_DIR" >"$ASSERT_OUT" 2>"$EVID_DIR/assert-human-test-verdict.stderr"
ASSERT_RC=$?
set -e
echo "$ASSERT_RC" >"$EVID_DIR/assert-human-test-verdict.exit"
cp "$ASSERT_OUT" ".tmp/REDHAT-FIX-RH-S30-14/assert-human-test-verdict.json"
echo "$ASSERT_RC" >".tmp/REDHAT-FIX-RH-S30-14/assert-human-test-verdict.exit"

# ── C-3 / RH-S30-18+21: success-path probe + forced-marker-miss preservation ─
# Success path: holocron_app SQLSTATE under always-rolled-back transaction.
# Forced miss: gate-owned PROBE_FORCE_MARKER_MISS against PONR-holding DB
# (before_count>=1 required; empty table fails closed).
PROBE_RC=0
MARKER_MISS_RC=0
if [[ -n "${DATABASE_URL:-}" ]]; then
  set +e
  bash "$ROOT/scripts/probe-ponr-role-immutability.sh" "$EVID_DIR/ponr-role-provenance" \
    >"$EVID_DIR/ponr-role-provenance.stdout" 2>"$EVID_DIR/ponr-role-provenance.stderr"
  PROBE_RC=$?
  set -e
  echo "$PROBE_RC" >"$EVID_DIR/ponr-role-provenance.exit"
  mkdir -p .tmp/REDHAT-FIX-RH-S30-18
  cp -R "$EVID_DIR/ponr-role-provenance/." .tmp/REDHAT-FIX-RH-S30-18/ 2>/dev/null || true
  cp "$EVID_DIR/ponr-role-provenance.stdout" .tmp/REDHAT-FIX-RH-S30-18/gate-or-it-transcript.log 2>/dev/null || true

  # RH-S30-21: forced marker-miss on same DB after success-path probe (PONR may exist).
  # Prefer disposable URL when set; else require current DATABASE_URL already holds PONR.
  MARKER_DB="${HOLO_PROBE_MARKER_MISS_DATABASE_URL:-$DATABASE_URL}"
  set +e
  DATABASE_URL="$MARKER_DB" HOLO_PROBE_SEED_PONR="${HOLO_PROBE_SEED_PONR:-1}" \
    bash "$ROOT/scripts/probe-ponr-role-immutability-negative-marker.sh" \
    "$EVID_DIR/ponr-role-provenance-marker-miss" \
    >"$EVID_DIR/ponr-role-provenance-marker-miss.stdout" \
    2>"$EVID_DIR/ponr-role-provenance-marker-miss.stderr"
  MARKER_MISS_RC=$?
  set -e
  echo "$MARKER_MISS_RC" >"$EVID_DIR/ponr-role-provenance-marker-miss.exit"
  mkdir -p .tmp/REDHAT-FIX-RH-S30-21
  cp -R "$EVID_DIR/ponr-role-provenance-marker-miss/." .tmp/REDHAT-FIX-RH-S30-21/ 2>/dev/null || true
fi

# ── RH-S30-15: finalize meta.json to durable terminal status ───────────────
python3 - <<PY
import json
from pathlib import Path
from datetime import datetime, timezone
meta_path = Path("$EVID_DIR/meta.json")
meta = json.loads(meta_path.read_text()) if meta_path.exists() else {}
finished = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
verdict = "$VERDICT"
verify_rc = int("$VERIFY_RC")
assert_rc = int("$ASSERT_RC")
probe_rc = int("$PROBE_RC")
marker_miss_rc = int("$MARKER_MISS_RC")
if verdict == "pass" and verify_rc == 0 and assert_rc == 0:
    status = "completed"
else:
    status = "failed"
# RH-S30-18: success-path SQLSTATE claim
# RH-S30-21: forced marker-miss preservation (nonzero exit, before_count>=1)
h3_closed = False
c3_marker_miss_ok = False
prov = Path("$EVID_DIR/ponr-role-provenance")
ac1 = prov / "ac1-prod-role-disable-trigger.json"
ac2 = prov / "ac2-prod-role-dml-truncate.json"
miss_report = Path("$EVID_DIR/ponr-role-provenance-marker-miss/negative-marker-report.json")
if ac1.exists() and ac2.exists() and probe_rc == 0:
    try:
        a1 = json.loads(ac1.read_text())
        a2 = json.loads(ac2.read_text())
        h3_success = bool(
            a1.get("production_sqlstate_claim")
            and a2.get("production_sqlstate_claim")
            and a1.get("rows_preserved")
        )
    except Exception:
        h3_success = False
else:
    h3_success = False
if miss_report.exists() and marker_miss_rc == 0:
    try:
        mr = json.loads(miss_report.read_text())
        c3_marker_miss_ok = bool(mr.get("ok") is True and mr.get("before_count", 0) >= 1)
    except Exception:
        c3_marker_miss_ok = False
h3_closed = bool(h3_success and c3_marker_miss_ok)
meta.update({
    "status": status,
    "verdict": verdict,
    "finished_at": finished,
    "steps_passed": int("$steps_passed"),
    "steps_failed": int("$steps_failed"),
    "verify_rc": verify_rc,
    "assert_human_test_verdict_rc": assert_rc,
    "ponr_role_probe_rc": probe_rc,
    "ponr_marker_miss_rc": marker_miss_rc,
    "c3_marker_miss_ok": c3_marker_miss_ok,
    "h3_role_provenance_closed": h3_closed,
})
if meta.get("status") == "running":
    raise SystemExit("error: meta.status still running after finalization (RH-S30-15)")
if verdict == "pass" and status == "running":
    raise SystemExit("error: results claim pass but meta is running (RH-S30-15 AC-4)")
meta_path.write_text(json.dumps(meta, indent=2) + "\n")
Path(".tmp/REDHAT-FIX-RH-S30-15/ac1-meta-after-pass.json").write_text(
    json.dumps(meta, indent=2) + "\n"
)
print(json.dumps({
    "meta_status": status,
    "verdict": verdict,
    "assert_rc": assert_rc,
    "probe_rc": probe_rc,
    "h3_role_provenance_closed": h3_closed,
}, indent=2))
PY

if [[ "$ASSERT_RC" -ne 0 ]]; then
  echo "error: assert-human-test-verdict exit=$ASSERT_RC (see $ASSERT_OUT)" >&2
  exit 1
fi

echo "Done. verdict=$VERDICT steps_passed=$steps_passed/5 run_id=$GATE_RUN_ID git_sha=$SOURCE_SHA sourceRevision=$SOURCE_REV verify_rc=$VERIFY_RC assert_rc=$ASSERT_RC"
exit 0

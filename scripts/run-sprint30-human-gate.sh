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
  # Expand ${HOLO_VERIFY_BASE_URL} etc. for plan fidelity after expansion
  expanded_cmd="$(eval "printf %s \"$cmd\"")"
  cmd_sha="$(printf '%s' "$expanded_cmd" | shasum -a 256 | awk '{print $1}')"
  {
    echo "@@GATE-META step=${n} cmd_sha=${cmd_sha} run_id=${GATE_RUN_ID} git_sha=${SOURCE_SHA} source_sha=${SOURCE_SHA} started_at=${started} deployed_base_url=${DEPLOYED_BASE_URL} sourceRevision=${SOURCE_REV}@@"
    echo "CMD: ${expanded_cmd}"
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

echo "Done. verdict=$VERDICT steps_passed=$steps_passed/5 run_id=$GATE_RUN_ID git_sha=$SOURCE_SHA sourceRevision=$SOURCE_REV verify_rc=$VERIFY_RC"
exit 0

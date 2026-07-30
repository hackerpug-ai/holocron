#!/bin/bash
# GATE-FIX-S28R3-QA24 / QA25 — durable full Sprint 28 suite → live R2 RO → full suite record.
#
# Writes immutable JSON under .tmp/GATE-FIX-S28R3-QA25/full-suite-live-sequence.json
# (override with SEQ_OUT_DIR) with exact commands, exit codes, test totals, probe
# hashes, .qa16bak absence, SHA, run id, timestamps, and evidence pointers.
#
# GATE-FIX-S28R3-QA25: refuse silent overwrite of a completed 0444 record.
#
# Usage (from repo root, with live R2 secrets available via sourced .env):
#   set -a; source /path/to/.env; set +a
#   /bin/bash scripts/record-sprint28-full-suite-live-sequence.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

OUT_DIR="${SEQ_OUT_DIR:-${ROOT}/.tmp/GATE-FIX-S28R3-QA25}"
mkdir -p "$OUT_DIR"
TASK_ID="${SEQ_TASK_ID:-GATE-FIX-S28R3-QA25}"
RUN_ID="${SEQ_RUN_ID_PREFIX:-qa25-seq}-$(/bin/date -u +%Y%m%dT%H%M%SZ)-$$"
RECORD="${OUT_DIR}/full-suite-live-sequence.json"
PROBE="${ROOT}/scripts/lib/r2-scope-probes.json"
EVID_DIR="${OUT_DIR}/sequence-${RUN_ID}"
mkdir -p "$EVID_DIR"

# GATE-FIX-S28R3-QA25: refuse overwriting a completed immutable record.
if [[ -f "$RECORD" ]]; then
  mode="$(/usr/bin/stat -f '%Lp' "$RECORD" 2>/dev/null || /usr/bin/stat -c '%a' "$RECORD" 2>/dev/null || echo '')"
  if [[ "$mode" == "444" || "$mode" == "0444" ]]; then
    if /usr/bin/python3 -E -s - "$RECORD" <<'PY'
import json, sys
try:
    d = json.load(open(sys.argv[1], encoding="utf-8"))
except Exception:
    sys.exit(0)
if d.get("all_phases_exit_zero") is True:
    print(
        f"FAIL: GATE-FIX-S28R3-QA25 refuses overwrite of completed immutable sequence "
        f"run_id={d.get('run_id')} (mode 0444). Move or remove deliberately.",
        file=sys.stderr,
    )
    sys.exit(2)
sys.exit(0)
PY
    then
      :
    else
      exit 2
    fi
  fi
fi

sha256_file() {
  /usr/bin/shasum -a 256 "$1" | /usr/bin/awk '{print $1}'
}

probe_hash() {
  if [[ -f "$PROBE" ]]; then
    sha256_file "$PROBE"
  else
    echo "MISSING"
  fi
}

qa16bak_absent() {
  if [[ -e "${PROBE}.qa16bak" ]]; then
    echo "false"
  else
    echo "true"
  fi
}

git_sha() {
  git -C "$ROOT" rev-parse HEAD 2>/dev/null || echo "unknown"
}

# Parse vitest summary lines: "Test Files  X passed" / "Tests  N passed"
# Use python (macOS sed BRE captures only the last digit of multi-digit counts).
parse_vitest_totals() {
  local log="$1"
  /usr/bin/python3 -E -s - "$log" <<'PY'
import re, sys
text = open(sys.argv[1], encoding="utf-8", errors="replace").read()
fp = ff = tp = tf = 0
for line in text.splitlines():
    m = re.search(r"Test Files\s+(\d+)\s+passed", line)
    if m:
        fp = int(m.group(1))
        m2 = re.search(r"(\d+)\s+failed", line)
        ff = int(m2.group(1)) if m2 else 0
    m = re.search(r"^\s*Tests\s+(\d+)\s+passed", line)
    if m:
        tp = int(m.group(1))
        m2 = re.search(r"(\d+)\s+failed", line)
        tf = int(m2.group(1)) if m2 else 0
print(f"{fp}\t{ff}\t{tp}\t{tf}")
PY
}

SUITE_CMD='pnpm exec vitest run services/platform/tests/integration/sprint28-*.test.ts'
LIVE_CMD='REQUIRE_LIVE_R2_RO=1 /bin/bash scripts/prove-r2-readonly.sh'

SHA="$(git_sha)"
TS0="$(/bin/date -u +%Y-%m-%dT%H:%M:%SZ)"
H0="$(probe_hash)"
B0="$(qa16bak_absent)"

echo "INFO: GATE-FIX-S28R3-QA24 sequence start run_id=${RUN_ID} sha=${SHA}"
echo "INFO: probe_sha256_before=${H0} qa16bak_absent=${B0}"

# Phase 1: full suite
PHASE1_LOG="${EVID_DIR}/phase1-full-suite.log"
PHASE1_TS="$(/bin/date -u +%Y-%m-%dT%H:%M:%SZ)"
set +e
/bin/bash -c "$SUITE_CMD" >"$PHASE1_LOG" 2>&1
PHASE1_RC=$?
set -e
PHASE1_TOTALS="$(parse_vitest_totals "$PHASE1_LOG")"
H1="$(probe_hash)"
B1="$(qa16bak_absent)"
echo "INFO: phase1 exit=${PHASE1_RC} probe=${H1}"

# Phase 2: mandatory live R2 readonly proof (secrets must already be in env; never print)
PHASE2_LOG="${EVID_DIR}/phase2-live-r2-ro.log"
PHASE2_TS="$(/bin/date -u +%Y-%m-%dT%H:%M:%SZ)"
set +e
REQUIRE_LIVE_R2_RO=1 /bin/bash scripts/prove-r2-readonly.sh >"$PHASE2_LOG" 2>&1
PHASE2_RC=$?
set -e
# Redact any accidental secret-looking lines from the retained live log (status only).
/usr/bin/env -i PATH=/usr/bin:/bin HOME=/tmp LC_ALL=C /usr/bin/python3 -E -s - "$PHASE2_LOG" <<'PY' || true
import re, sys
path = sys.argv[1]
try:
    text = open(path, "r", errors="replace").read()
except OSError:
    sys.exit(0)
deny = re.compile(r"(?i)(api[_-]?key|secret|token|password|bearer |authorization:|sk-[a-z0-9]|AWS_|R2_.*KEY)")
out = []
for line in text.splitlines():
    if deny.search(line) and not re.match(r"^(PASS:|FAIL:|INFO:|=== |RESIDUAL:|human_required)", line):
        continue
    out.append(line)
open(path, "w").write("\n".join(out) + ("\n" if out else ""))
PY
H2="$(probe_hash)"
B2="$(qa16bak_absent)"
echo "INFO: phase2 exit=${PHASE2_RC} probe=${H2}"

# Phase 3: full suite again
PHASE3_LOG="${EVID_DIR}/phase3-full-suite.log"
PHASE3_TS="$(/bin/date -u +%Y-%m-%dT%H:%M:%SZ)"
set +e
/bin/bash -c "$SUITE_CMD" >"$PHASE3_LOG" 2>&1
PHASE3_RC=$?
set -e
PHASE3_TOTALS="$(parse_vitest_totals "$PHASE3_LOG")"
H3="$(probe_hash)"
B3="$(qa16bak_absent)"
TS_END="$(/bin/date -u +%Y-%m-%dT%H:%M:%SZ)"
echo "INFO: phase3 exit=${PHASE3_RC} probe=${H3}"

# Write record via python (no secrets in JSON). Fields via env to avoid quoting bugs.
export QA24_SEQ_RECORD="$RECORD"
export QA24_SEQ_RUN_ID="$RUN_ID"
export QA24_SEQ_SHA="$SHA"
export QA24_SEQ_TS0="$TS0"
export QA24_SEQ_TS_END="$TS_END"
export QA24_SEQ_SUITE_CMD="$SUITE_CMD"
export QA24_SEQ_LIVE_CMD="$LIVE_CMD"
export QA24_SEQ_TASK_ID="$TASK_ID"
export QA24_SEQ_P1_TS="$PHASE1_TS" QA24_SEQ_P1_RC="$PHASE1_RC" QA24_SEQ_P1_TOTALS="$PHASE1_TOTALS"
export QA24_SEQ_P2_TS="$PHASE2_TS" QA24_SEQ_P2_RC="$PHASE2_RC"
export QA24_SEQ_P3_TS="$PHASE3_TS" QA24_SEQ_P3_RC="$PHASE3_RC" QA24_SEQ_P3_TOTALS="$PHASE3_TOTALS"
export QA24_SEQ_H0="$H0" QA24_SEQ_H1="$H1" QA24_SEQ_H2="$H2" QA24_SEQ_H3="$H3"
export QA24_SEQ_B0="$B0" QA24_SEQ_B1="$B1" QA24_SEQ_B2="$B2" QA24_SEQ_B3="$B3"

/usr/bin/python3 -E -s <<'PY'
import json, os

def b(s):
    return s == "true"

def totals(s):
    p = (s or "0\t0\t0\t0").split("\t")
    while len(p) < 4:
        p.append("0")
    return [int(x or 0) for x in p[:4]]

p1 = totals(os.environ.get("QA24_SEQ_P1_TOTALS"))
p3 = totals(os.environ.get("QA24_SEQ_P3_TOTALS"))
h0, h1, h2, h3 = (os.environ[k] for k in ("QA24_SEQ_H0", "QA24_SEQ_H1", "QA24_SEQ_H2", "QA24_SEQ_H3"))
b0, b1, b2, b3 = (os.environ[k] for k in ("QA24_SEQ_B0", "QA24_SEQ_B1", "QA24_SEQ_B2", "QA24_SEQ_B3"))
rc1 = int(os.environ["QA24_SEQ_P1_RC"])
rc2 = int(os.environ["QA24_SEQ_P2_RC"])
rc3 = int(os.environ["QA24_SEQ_P3_RC"])
run_id = os.environ["QA24_SEQ_RUN_ID"]
suite = os.environ["QA24_SEQ_SUITE_CMD"]
live = os.environ["QA24_SEQ_LIVE_CMD"]
task_id = os.environ.get("QA24_SEQ_TASK_ID") or "GATE-FIX-S28R3-QA25"
all_zero = rc1 == 0 and rc2 == 0 and rc3 == 0
doc = {
    "schema": "holo.sprint28-full-suite-live-sequence.v1",
    "task_id": task_id,
    "run_id": run_id,
    "git_sha": os.environ["QA24_SEQ_SHA"],
    "started_at": os.environ["QA24_SEQ_TS0"],
    "finished_at": os.environ["QA24_SEQ_TS_END"],
    "probe_path": "scripts/lib/r2-scope-probes.json",
    "phases": [
        {
            "n": 1,
            "name": "full_sprint28_suite",
            "command": suite,
            "started_at": os.environ["QA24_SEQ_P1_TS"],
            "exit_code": rc1,
            "probe_sha256_before": h0,
            "probe_sha256_after": h1,
            "qa16bak_absent": b(b1),
            "log": f"sequence-{run_id}/phase1-full-suite.log",
            "test_files_passed": p1[0],
            "test_files_failed": p1[1],
            "tests_passed": p1[2],
            "tests_failed": p1[3],
        },
        {
            "n": 2,
            "name": "live_r2_readonly_proof",
            "command": live,
            "started_at": os.environ["QA24_SEQ_P2_TS"],
            "exit_code": rc2,
            "probe_sha256_before": h1,
            "probe_sha256_after": h2,
            "qa16bak_absent": b(b2),
            "log": f"sequence-{run_id}/phase2-live-r2-ro.log",
        },
        {
            "n": 3,
            "name": "full_sprint28_suite",
            "command": suite,
            "started_at": os.environ["QA24_SEQ_P3_TS"],
            "exit_code": rc3,
            "probe_sha256_before": h2,
            "probe_sha256_after": h3,
            "qa16bak_absent": b(b3),
            "log": f"sequence-{run_id}/phase3-full-suite.log",
            "test_files_passed": p3[0],
            "test_files_failed": p3[1],
            "tests_passed": p3[2],
            "tests_failed": p3[3],
        },
    ],
    "probe_sha256_initial": h0,
    "probe_sha256_final": h3,
    "probe_hash_stable": h0 == h1 == h2 == h3,
    "qa16bak_absent_all_phases": all(b(x) for x in (b0, b1, b2, b3)),
    "all_phases_exit_zero": all_zero,
    "evidence_dir": f"sequence-{run_id}",
}
path = os.environ["QA24_SEQ_RECORD"]
# GATE-FIX-S28R3-QA25: never chmod+overwrite a completed immutable record.
if os.path.isfile(path):
    try:
        mode = os.stat(path).st_mode & 0o777
    except OSError:
        mode = 0
    if mode == 0o444:
        try:
            prev = json.load(open(path, encoding="utf-8"))
        except Exception:
            prev = {}
        if prev.get("all_phases_exit_zero") is True:
            raise SystemExit(
                f"FAIL: GATE-FIX-S28R3-QA25 refuses overwrite of completed immutable sequence "
                f"run_id={prev.get('run_id')}"
            )
open(path, "w", encoding="utf-8").write(json.dumps(doc, indent=2) + "\n")
if all_zero:
    open(path + ".immutable", "w", encoding="utf-8").write(run_id + "\n")
print(f"INFO: wrote {path}")
PY


# chmod immutable-ish after successful all-zero write
if [[ $PHASE1_RC -eq 0 && $PHASE2_RC -eq 0 && $PHASE3_RC -eq 0 ]]; then
  /bin/chmod 0444 "$RECORD" 2>/dev/null || true
fi

echo "INFO: sequence complete all_zero=$([[ $PHASE1_RC -eq 0 && $PHASE2_RC -eq 0 && $PHASE3_RC -eq 0 ]] && echo true || echo false)"
if [[ $PHASE1_RC -ne 0 || $PHASE2_RC -ne 0 || $PHASE3_RC -ne 0 ]]; then
  exit 1
fi
exit 0

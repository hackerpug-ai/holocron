#!/usr/bin/env bash
# GATE-FIX-QA4 — prove gate-plan step4/step5 assertions match jq -e scalar `true`.
#
# Historical evidence 20260729T064907Z has exit 0 + body `true` for steps 4–5, but the
# OLD plan required LEDGER_CHECKSUM_MATCH / BLOB_PARITY_PASS tokens that jq never prints.
# Corrected plan requires anchored `^true$` so recompute accepts real success and rejects
# `false` / nonzero exit.
#
# Does NOT mutate authoritative gate-results.json, gate-verification.json, GATE-RESULTS.md,
# or .gate-evidence/**. All temp artifacts under .tmp/GATE-FIX-QA4/.
#
# Usage (repo root):
#   bash scripts/gate/s28-qa4-step4-5-jq-true-assertion.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

SPRINT_DIR=".spec/prds/mk6-migration/tasks/sprint-28-point-in-time-restore-and-fresh-hardware-fire-drill"
PLAN="$SPRINT_DIR/gate-plan.json"
EVDIR="$SPRINT_DIR/.gate-evidence/20260729T064907Z"
VERIFY="${VERIFY_GATE_EVIDENCE:-$HOME/Projects/brain/skills/kb-run-human-tests/references/verify-gate-evidence.sh}"
WORKDIR=".tmp/GATE-FIX-QA4"
mkdir -p "$WORKDIR"

# Frozen pre-fix literal_cmd sha256 (byte-identical requirement AC-4)
declare -A FROZEN_CMD_SHA=(
  [1]=18f977e2baa2061ccfa0fc79c1e20ffcd253c25292530f08b9fe1d140c49f36e
  [2]=0d0a751f81d37268d0c736f487cde96310aaf10c90c0c8e7adacfdbe0c0c8446
  [3]=a629076aba43cbf418611085a6967be5fe0d308963434c472892a2e8526b7494
  [4]=61f22258bb9d4ad554aaaf485047b1fde39cfe132dbd6a538b1ccd6d25746931
  [5]=ee89b86de160fe84065e2b0c3b13e9a59c22734ba5adfdc38cec5ca7adb608d3
  [6]=134e251a08f4325ff491e7a65d18abf08220d2060a4ff41ae4877edce535ad74
)

die() { echo "FAIL: $*" >&2; exit 1; }
pass() { echo "OK: $*"; }

test -f "$PLAN" || die "missing plan $PLAN"
test -d "$EVDIR" || die "missing evidence $EVDIR"
test -x "$VERIFY" || die "missing verifier $VERIFY (set VERIFY_GATE_EVIDENCE)"

# ---------- AC-4: freeze + verify literal_cmd hashes ----------
sha256_str() { python3 -c 'import hashlib,sys; print(hashlib.sha256(sys.stdin.buffer.read()).hexdigest())'; }

for n in 1 2 3 4 5 6; do
  lit="$(jq -r --argjson n "$n" '.steps[]|select(.n==$n)|.literal_cmd' "$PLAN")"
  [ -n "$lit" ] || die "step $n missing literal_cmd"
  got="$(printf '%s' "$lit" | sha256_str)"
  exp="${FROZEN_CMD_SHA[$n]}"
  [ "$got" = "$exp" ] || die "step $n literal_cmd hash drift: got=$got expected=$exp"
  header_sha="$(grep -om1 'cmd_sha=[a-f0-9]*' "$EVDIR/step${n}.log" | cut -d= -f2)"
  [ "$header_sha" = "$exp" ] || die "step $n evidence cmd_sha mismatch: $header_sha != $exp"
done
pass "all 6 literal_cmd hashes frozen and match evidence cmd_sha"

# Plan assertions must use anchored true (not domain tokens never printed by jq -e)
for n in 4 5; do
  jq -e --argjson n "$n" '
    .steps[]|select(.n==$n)|.assertion
    | .kind=="exit_and_log_regex"
    and .expected_exit==0
    and (.require_all_regex|index("^true$")!=null)
    and (.require_all_regex|index("LEDGER_CHECKSUM_MATCH")==null)
    and (.require_all_regex|index("BLOB_PARITY_PASS")==null)
  ' "$PLAN" >/dev/null || die "step $n assertion not corrected to ^true$"
done
pass "plan steps 4–5 require_all_regex includes ^true$ only (no domain token demand)"

# ---------- Build temporary gate-results claiming pass for all steps (option a) ----------
# verify-gate-evidence compares claimed vs recomputed. Historical emit initially claims pass
# from exit==0; we mirror that under .tmp so we never touch authoritative gate-results.json.
RESULTS_PASS="$WORKDIR/gate-results.claim-pass.json"
python3 - "$PLAN" "$EVDIR" "$RESULTS_PASS" <<'PY'
import json, sys
from pathlib import Path
plan = json.loads(Path(sys.argv[1]).read_text())
ev = Path(sys.argv[2])
out = Path(sys.argv[3])
steps = []
for s in plan["steps"]:
    n = s["n"]
    exit_raw = (ev / f"step{n}.exit").read_text().strip()
    exit_code = int(exit_raw) if exit_raw.isdigit() else 1
    steps.append({
        "n": n,
        "text": s.get("text", ""),
        "type": s.get("type", "terminal"),
        "method": s.get("method", "real-cli"),
        "executed": True,
        "result": "pass" if exit_code == 0 else "fail",
        "log": str(ev / f"step{n}.log"),
        "evidence": f"raw executor exit={exit_code}",
    })
doc = {
    "sprint": plan.get("sprint"),
    "run_id": "20260729T064907Z",
    "verdict": "pass" if all(st["result"] == "pass" for st in steps) else "fail",
    "runner": "GATE-FIX-QA4-regression",
    "ui_driver": "none",
    "steps_total": len(steps),
    "steps_executed": len(steps),
    "steps_passed": sum(1 for st in steps if st["result"] == "pass"),
    "steps": steps,
    "written_at": "2026-07-29T00:00:00Z",
    "notes": "tmp claim-pass for GATE-FIX-QA4 recompute; not authoritative",
}
out.write_text(json.dumps(doc, indent=2) + "\n")
PY

# ---------- RED shape: OLD plan assertions fail recompute on historical true/exit0 ----------
OLD_PLAN="$WORKDIR/gate-plan.old-assertions.json"
python3 - "$PLAN" "$OLD_PLAN" <<'PY'
import json, copy
from pathlib import Path
import sys
plan = json.loads(Path(sys.argv[1]).read_text())
for s in plan["steps"]:
    if s["n"] == 4:
        s["assertion"] = {
            "kind": "exit_and_log_regex",
            "expected_exit": 0,
            "require_all_regex": ["LEDGER_CHECKSUM_MATCH"],
        }
    elif s["n"] == 5:
        s["assertion"] = {
            "kind": "exit_and_log_regex",
            "expected_exit": 0,
            "require_all_regex": ["BLOB_PARITY_PASS"],
        }
Path(sys.argv[2]).write_text(json.dumps(plan, indent=2) + "\n")
# prove literal_cmds still identical to live plan
live = json.loads(Path(sys.argv[1]).read_text())
for a, b in zip(live["steps"], plan["steps"]):
    assert a["literal_cmd"] == b["literal_cmd"], a["n"]
PY

OLD_OUT="$WORKDIR/verify-old-plan.json"
set +e
bash "$VERIFY" "$RESULTS_PASS" "$OLD_PLAN" "$EVDIR" >"$OLD_OUT" 2>"$WORKDIR/verify-old-plan.err"
OLD_EC=$?
set -e
# Script exits 1 when verified:false (discrepancies). We expect that for the OLD plan.
jq -e '.verified == false and .recomputed_verdict == "fail"' "$OLD_OUT" >/dev/null \
  || die "OLD plan should recompute fail; got $(cat "$OLD_OUT")"
# Steps 4 and 5 must result-mismatch to fail (or at least be present as fail recomputes)
for n in 4 5; do
  jq -e --argjson n "$n" '
    .discrepancies[]
    | select(.step==$n and .kind=="result-mismatch" and .recomputed=="fail")
  ' "$OLD_OUT" >/dev/null \
    || die "OLD plan missing result-mismatch fail for step $n: $(cat "$OLD_OUT")"
done
pass "historical evidence + OLD assertions: steps 4–5 recompute fail (honest RED)"

# ---------- GREEN: NEW plan accepts historical true/exit0 ----------
NEW_OUT="$WORKDIR/verify-new-plan.json"
set +e
bash "$VERIFY" "$RESULTS_PASS" "$PLAN" "$EVDIR" >"$NEW_OUT" 2>"$WORKDIR/verify-new-plan.err"
NEW_EC=$?
set -e
jq -e '.verified == true and .recomputed_verdict == "pass" and (.discrepancies|length)==0' "$NEW_OUT" >/dev/null \
  || die "NEW plan should verify pass on historical evidence; got $(cat "$NEW_OUT") ec=$NEW_EC"
pass "historical evidence + NEW assertions: verified:true recomputed_verdict:pass"

# ---------- AC-3 negative: false body / nonzero exit still fails under NEW assertion ----------
NEG_EV="$WORKDIR/neg-evidence"
mkdir -p "$NEG_EV"
# Copy real steps 1–3,6 for structure; replace 4–5 with false jq output
for n in 1 2 3 6; do
  cp "$EVDIR/step${n}.log" "$NEG_EV/"
  cp "$EVDIR/step${n}.exit" "$NEG_EV/"
  cp "$EVDIR/step${n}.assertion.json" "$NEG_EV/" 2>/dev/null || true
done

# step4: false + exit 1 (jq -e failure shape)
cmd4="$(jq -r '.steps[]|select(.n==4)|.literal_cmd' "$PLAN")"
sha4="$(printf '%s' "$cmd4" | sha256_str)"
cat >"$NEG_EV/step4.log" <<EOF
@@GATE-META step=step4 cmd_sha=${sha4}@@
+ ${cmd4}
false
@@GATE-EXIT=1@@
EOF
printf '1' >"$NEG_EV/step4.exit"
printf '%s\n' '{"kind":"exit_and_log_regex","expected_exit":0,"require_all_regex":["^true$"]}' >"$NEG_EV/step4.assertion.json"

# step5: exit 0 but body false (regex must still fail)
cmd5="$(jq -r '.steps[]|select(.n==5)|.literal_cmd' "$PLAN")"
sha5="$(printf '%s' "$cmd5" | sha256_str)"
cat >"$NEG_EV/step5.log" <<EOF
@@GATE-META step=step5 cmd_sha=${sha5}@@
+ ${cmd5}
false
@@GATE-EXIT=0@@
EOF
printf '0' >"$NEG_EV/step5.exit"
printf '%s\n' '{"kind":"exit_and_log_regex","expected_exit":0,"require_all_regex":["^true$"]}' >"$NEG_EV/step5.assertion.json"

# claim pass for all (so mismatches surface as result-mismatch fail)
RESULTS_NEG="$WORKDIR/gate-results.neg-claim-pass.json"
python3 - "$PLAN" "$NEG_EV" "$RESULTS_NEG" <<'PY'
import json, sys
from pathlib import Path
plan = json.loads(Path(sys.argv[1]).read_text())
ev = Path(sys.argv[2])
out = Path(sys.argv[3])
steps = []
for s in plan["steps"]:
    n = s["n"]
    steps.append({
        "n": n,
        "text": s.get("text", ""),
        "type": s.get("type", "terminal"),
        "method": s.get("method", "real-cli"),
        "executed": True,
        "result": "pass",
        "log": str(ev / f"step{n}.log"),
        "evidence": "synthetic",
    })
doc = {
    "sprint": plan.get("sprint"),
    "run_id": "GATE-FIX-QA4-neg",
    "verdict": "pass",
    "runner": "GATE-FIX-QA4-regression",
    "ui_driver": "none",
    "steps_total": len(steps),
    "steps_executed": len(steps),
    "steps_passed": len(steps),
    "steps": steps,
    "written_at": "2026-07-29T00:00:00Z",
}
out.write_text(json.dumps(doc, indent=2) + "\n")
PY

NEG_OUT="$WORKDIR/verify-neg.json"
set +e
bash "$VERIFY" "$RESULTS_NEG" "$PLAN" "$NEG_EV" >"$NEG_OUT" 2>"$WORKDIR/verify-neg.err"
set -e
jq -e '.verified == false and .recomputed_verdict == "fail"' "$NEG_OUT" >/dev/null \
  || die "negative false body should not verify; got $(cat "$NEG_OUT")"
for n in 4 5; do
  jq -e --argjson n "$n" '
    .discrepancies[]
    | select(.step==$n and .kind=="result-mismatch" and .recomputed=="fail")
  ' "$NEG_OUT" >/dev/null \
    || die "negative: step $n should recompute fail; got $(cat "$NEG_OUT")"
done
# Confirm ^true$ does not match false
out4="$(awk 'NR>2 && !/^@@GATE-/' "$NEG_EV/step4.log")"
out5="$(awk 'NR>2 && !/^@@GATE-/' "$NEG_EV/step5.log")"
grep -Eq -- '^true$' <<<"$out4" && die "false body matched ^true$ (step4)"
grep -Eq -- '^true$' <<<"$out5" && die "false body matched ^true$ (step5)"
pass "negative: false/nonzero still fails under corrected ^true$ assertion"

# ---------- unit: anchored true rejects false, accepts true ----------
grep -Eq -- '^true$' <<<'true' || die "unit: true must match"
grep -Eq -- '^true$' <<<'false' && die "unit: false must not match ^true$"
grep -Eq -- 'true' <<<'false' && die "unit sanity" || true
pass "unit regex anchors"

echo "S28_QA4_STEP4_5_JQ_TRUE_ASSERTION_OK"
echo "artifacts under $WORKDIR (local only; not staged)"

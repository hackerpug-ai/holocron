#!/usr/bin/env bash
# C-2 v5 negative: valid package→attestation→lock, then mutate submitted results only.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$(cd "$ROOT" && mkdir -p "${1:-.tmp/REDHAT-FIX-RH-S30-20-v5-negative}" && cd "${1:-.tmp/REDHAT-FIX-RH-S30-20-v5-negative}" && pwd)"
FIX="$OUT/fixture"
rm -rf "$FIX"
mkdir -p "$FIX"
cd "$FIX"
git init -q
git config user.email "c2-neg@test"
git config user.name "c2-neg"

RUN="20260807TNEG0001Z"
REL=".spec/prds/mk6-migration/tasks/sprint-30-cutover-rollback-drill-and-data-plane-point-of-no-return/.gate-evidence/${RUN}"
mkdir -p "$REL"

# Initial commit for source tip
echo source > README && git add README && git commit -qm "source tip"
SOURCE=$(git rev-parse HEAD)

python3 - <<PY
import json
from pathlib import Path
rel=Path("$REL")
results={
  "verdict":"pass","run_id":"$RUN",
  "steps_total":5,"steps_executed":5,"steps_passed":5,
  "git_sha":"$SOURCE","source_sha_at_run":"$SOURCE",
  "steps":[{"n":i,"executed":True,"result":"pass","log":f"see step{i}.log"} for i in range(1,6)],
  "evidence_package_protocol":"C-2-atomic-v5-git-bound-attestation",
}
for i in range(1,6):
  (rel/f"step{i}.log").write_text(f"step {i} ok\n")
(rel/"gate-results.json").write_text(json.dumps(results, indent=2)+"\n")
PY
git add -A && git commit -qm "P1 package"
P1=$(git rev-parse HEAD)
BLOB=$(git rev-parse "HEAD:$REL/gate-results.json")

python3 - <<PY
import json
from pathlib import Path
att={
  "protocol":"C-2-atomic-v5-git-bound-attestation",
  "source_sha_at_run":"$SOURCE","package_commit":"$P1","run_id":"$RUN",
  "artifacts":{"gate-results.json":{"path":"$REL/gate-results.json","blob_oid":"$BLOB"}},
}
Path("$REL/evidence-attestation.json").write_text(json.dumps(att, indent=2)+"\n")
PY
git add -A && git commit -qm "A1 attestation"
A1=$(git rev-parse HEAD)
ATT_BLOB=$(git rev-parse "HEAD:$REL/evidence-attestation.json")

python3 - <<PY
import json
from pathlib import Path
lock={
  "protocol":"C-2-atomic-v5-git-bound-attestation","run_id":"$RUN",
  "source_sha_at_run":"$SOURCE","package_commit":"$P1",
  "attestation_commit":"$A1","attestation_path":"$REL/evidence-attestation.json",
  "attestation_blob_oid":"$ATT_BLOB",
}
Path("$REL/evidence-attestation.lock.json").write_text(json.dumps(lock, indent=2)+"\n")
PY
git add -A && git commit -qm "L1 lock"

export GIT_DIR="$FIX/.git"
export GIT_WORK_TREE="$FIX"
export ASSERT_PACKAGE_HEAD=1
unset ASSERT_LOCK_COMMIT || true

set +e
bash "$ROOT/scripts/assert-gate-evidence-containment.sh" "$FIX/$REL/gate-results.json" \
  >"$OUT/positive.json" 2>"$OUT/positive.err"
POS_RC=$?
set -e
echo "positive_rc=$POS_RC" | tee "$OUT/positive_rc.txt"
if [[ "$POS_RC" -ne 0 ]]; then
  echo "FAIL: positive fixture" >&2
  cat "$OUT/positive.err" >&2
  cat "$OUT/positive.json" >&2
  exit 2
fi

# Mutate only submitted results
python3 - <<PY
import json
from pathlib import Path
p=Path("$FIX/$REL/gate-results.json")
d=json.loads(p.read_text())
d["notes"]="MUTATED_SUBMITTED_ONLY"
p.write_text(json.dumps(d, indent=2)+"\n")
PY
set +e
bash "$ROOT/scripts/assert-gate-evidence-containment.sh" "$FIX/$REL/gate-results.json" \
  >"$OUT/negative.json" 2>"$OUT/negative.err"
NEG_RC=$?
set -e
echo "negative_rc=$NEG_RC" | tee "$OUT/negative_rc.txt"
if [[ "$NEG_RC" -eq 0 ]]; then
  echo "FAIL: expected hist_oid!=sub_oid failure" >&2
  exit 2
fi
if ! grep -qiE 'hist_oid|blob OID identity|sub_oid' "$OUT/negative.err" "$OUT/negative.json"; then
  echo "FAIL: missing OID mismatch wording" >&2
  cat "$OUT/negative.err" >&2
  exit 2
fi
echo "C-2 v5 OID-mismatch negative PASS"

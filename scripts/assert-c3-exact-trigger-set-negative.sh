#!/usr/bin/env bash
# RH-S30-33 — negative: duplicate mutation×2 and wrong-set must fail exact-set oracle.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
OUT="${1:-.tmp/REDHAT-FIX-RH-S30-33}"
mkdir -p "$OUT/fixtures/duplicate-mutation-cases" "$OUT/fixtures/wrong-set-cases"

# Fixture: mutation twice (len==2 but wrong set)
python3 - <<'PY'
import json
from pathlib import Path
out=Path(".tmp/REDHAT-FIX-RH-S30-33/fixtures/duplicate-mutation-cases")
out.mkdir(parents=True, exist_ok=True)
cases=[{
  "disabled_trigger":"data_plane_ponr_reject_mutation",
  "probe_rc":2,"refused":True,"disabled_tgenabled":"D","other_tgenabled":"O",
},{
  "disabled_trigger":"data_plane_ponr_reject_mutation",
  "probe_rc":2,"refused":True,"disabled_tgenabled":"D","other_tgenabled":"O",
}]
rep={"ok":True,"one_trigger_missing_cases":cases,"uri_alias_same_target_refused":True,"urls_distinct":True}
(out/"one-trigger-missing-report.json").write_text(json.dumps(rep,indent=2)+"\n")
# fake raw dirs that would pass len checks
for name in ["data_plane_ponr_reject_mutation"]:
  d=out/f"disable-{name}"
  d.mkdir(exist_ok=True)
  (d/"exit.code").write_text("2\n")
  (d/"stderr.txt").write_text("data_plane_ponr_reject_mutation|D\ndata_plane_ponr_reject_truncate|O\n")
print("wrote duplicate fixture")
PY

set +e
python3 scripts/lib/c3-exact-trigger-set.py \
  .tmp/REDHAT-FIX-RH-S30-33/fixtures/duplicate-mutation-cases/one-trigger-missing-report.json \
  .tmp/REDHAT-FIX-RH-S30-33/fixtures/duplicate-mutation-cases \
  >"$OUT/ac3-duplicate-case-fails.json" 2>"$OUT/ac3-duplicate.stderr"
rc=$?
set -e
if [[ "$rc" -eq 0 ]]; then
  echo "error: duplicate mutation×2 fixture must fail exact-set oracle" >&2
  exit 2
fi
python3 -c "import json;d=json.load(open('$OUT/ac3-duplicate-case-fails.json')); assert d.get('ok') is False; print('duplicate_rejected', d.get('errors')[:3])"

# Wrong-set: truncate only twice
python3 - <<'PY'
import json
from pathlib import Path
out=Path(".tmp/REDHAT-FIX-RH-S30-33/fixtures/wrong-set-cases")
out.mkdir(parents=True, exist_ok=True)
cases=[{
  "disabled_trigger":"data_plane_ponr_reject_truncate",
  "probe_rc":2,"refused":True,"disabled_tgenabled":"D","other_tgenabled":"O",
},{
  "disabled_trigger":"data_plane_ponr_reject_truncate",
  "probe_rc":2,"refused":True,"disabled_tgenabled":"D","other_tgenabled":"O",
}]
(out/"one-trigger-missing-report.json").write_text(json.dumps({"ok":True,"one_trigger_missing_cases":cases},indent=2)+"\n")
print("wrote wrong-set fixture")
PY
set +e
python3 scripts/lib/c3-exact-trigger-set.py \
  .tmp/REDHAT-FIX-RH-S30-33/fixtures/wrong-set-cases/one-trigger-missing-report.json \
  >"$OUT/ac3-wrong-set-fails.json"
rc2=$?
set -e
test "$rc2" -ne 0

# RED baseline: document residual len==2 hole (now closed)
cat >"$OUT/red-c3-exact-set-false-green-baseline.txt" <<'EOF'
RED (RH-S30-33 residual @ 9151324a): consumers accepted any two refused/nonzero cases
(len(cases)==2) without exact REQUIRED set equality. mutation×2 fixture would pass.
GREEN: scripts/lib/c3-exact-trigger-set.py rejects duplicates/wrong-set; gate/assert/package wired.
EOF

echo "assert-c3-exact-trigger-set-negative PASS"

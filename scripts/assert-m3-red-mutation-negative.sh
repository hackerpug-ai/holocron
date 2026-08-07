#!/usr/bin/env bash
# RH-S30-34 — assert rejects exit_code=127 theatre despite FAIL labels.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
OUT="${1:-.tmp/REDHAT-FIX-RH-S30-34}"
FIX="$OUT/negative-residual-fixture/m3-identity"
mkdir -p "$FIX"

# Copy a green structural tree if available, overwrite RED/mutation with theatre
SRC=".spec/prds/mk6-migration/tasks/sprint-30-cutover-rollback-drill-and-data-plane-point-of-no-return/.gate-evidence/20260807T113518Z/m3-identity"
if [[ -d "$SRC" ]]; then
  cp -R "$SRC/." "$FIX/"
else
  # minimal required files
  for n in branch-oracle-map.md suite-vitest.log non-201-accepted-id-enable-writes.json \
    non-201-accepted-id-fence-ledger.json non-201-accepted-id-rollback-refuse.json \
    transport-error-enable-writes.json transport-error-fence-ledger.json transport-error-rollback-refuse.json \
    reselect-miss-enable-writes.json reselect-miss-fence-ledger.json reselect-miss-identity.json \
    reselect-miss-rollback-refuse.json; do
    echo "{}" >"$FIX/$n" 2>/dev/null || true
  done
  echo "Tests 6 passed" >"$FIX/suite-vitest.log"
  python3 - <<'PY'
import json
from pathlib import Path
p=Path(".tmp/REDHAT-FIX-RH-S30-34/negative-residual-fixture/m3-identity")
hid="aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"
(p/"reselect-miss-identity.json").write_text(json.dumps({
  "independentHttp201Id":hid,"report_write_row_id":hid,
  "reselectProbeId":"00000000-0000-4000-8000-eeeeeeeeeeee",
  "writeIds":[hid],"dbIds":[hid],
},indent=2)+"\n")
for name,key,val in [
  ("non-201-accepted-id-fence-ledger.json","acceptedId",hid),
  ("transport-error-fence-ledger.json","transportDocId",hid),
]:
  (p/name).write_text(json.dumps({key:val,"writeIds":[hid]},indent=2)+"\n")
PY
fi

# Theatre RED: metadata FAIL labels + exit 127
cat >"$FIX/RED-identity-oracle-baseline.txt" <<'EOF'
=== M-3 RED identity oracle baseline ===
command: vitest run --project unit tests/_m3-identity-red-capture.test.ts
exit_code=127
expected_exit_code=1
oracle: expect(independentHttp201Id).not.toBe(reselectProbeId)
--- vitest transcript ---
vitest: command not found
bash: vitest: command not found
FAIL would have happened if vitest ran
AssertionError: expected theatre
Tests 1 failed (1)
EOF
cp "$FIX/RED-identity-oracle-baseline.txt" "$FIX/mutation-failure.log"

# Regenerate manifest without self
python3 - "$FIX" <<'PY'
import hashlib, json
from pathlib import Path
root=Path(__import__('sys').argv[1])
man=root/'manifest.json'
if man.exists(): man.unlink()
files=sorted(p for p in root.rglob('*') if p.is_file())
manifest={"tree":"m3-identity","files":[
  {"path":str(p.relative_to(root)),"sha256":hashlib.sha256(p.read_bytes()).hexdigest(),"bytes":p.stat().st_size}
  for p in files
]}
man.write_text(json.dumps(manifest,indent=2)+"\n")
PY

set +e
bash scripts/assert-m3-identity-evidence.sh "$OUT/negative-residual-fixture" \
  >"$OUT/assert-negative.json" 2>"$OUT/assert-negative.stderr"
rc=$?
set -e
if [[ "$rc" -eq 0 ]]; then
  echo "error: assert accepted exit_code=127 theatre" >&2
  cat "$OUT/assert-negative.json" >&2
  exit 2
fi
grep -Eiq '127|command.not.found|theatre' "$OUT/assert-negative.stderr" "$OUT/assert-negative.json" \
  || { echo "error: assert fail without 127/theatre wording"; exit 2; }
echo "assert-m3-red-mutation-negative PASS (exit=$rc)"

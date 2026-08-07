#!/usr/bin/env bash
# RH-S30-20 TC-3 — negative control: E1-versus-bind (path exists, blob differs).
#
# Reconstructs the v3 false-green: claim package_commit of a historical evidence
# tree while submitting a different bind-tip results body. Assert must exit ≠ 0
# with an explicit blob OID identity error.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
OUT="${1:-.tmp/REDHAT-FIX-RH-S30-20}"
mkdir -p "$OUT"

# Prefer known historical package with E1 pre-bind vs bind tip mismatch if present
E1="33f004d1524452b264dcc1a41b91d0c43fa8e6e9"
RUN="20260807T095843Z"
REL=".spec/prds/mk6-migration/tasks/sprint-30-cutover-rollback-drill-and-data-plane-point-of-no-return/.gate-evidence/${RUN}/gate-results.json"

if ! git cat-file -e "${E1}:${REL}" 2>/dev/null; then
  echo "skip: historical E1 $E1 not in this clone" >&2
  exit 0
fi

# Submitted body = bind tip HEAD of that run if available, else rewrite fields on E1 blob
BIND_CANDIDATES=("511213184e31b20dd09d0318a7da8cb3d6b0a0f5" "f4c60617ace5a5cf42e27984f5afc6f49c030567")
SUBMITTED=""
for b in "${BIND_CANDIDATES[@]}"; do
  if git cat-file -e "${b}:${REL}" 2>/dev/null; then
    e1_oid="$(git rev-parse "${E1}:${REL}")"
    b_oid="$(git rev-parse "${b}:${REL}")"
    if [[ "$e1_oid" != "$b_oid" ]]; then
      git show "${b}:${REL}" >"$OUT/submitted-bind-results.json"
      SUBMITTED="$OUT/submitted-bind-results.json"
      # Forge attestation that names E1 but claims bind content OID mismatch
      python3 - <<PY
import json, subprocess
from pathlib import Path
e1="$E1"
rel="$REL"
att={
  "protocol": "C-2-atomic-v4-blob-oid-identity",
  "source_sha_at_run": "324ce9045c0ced0ee39686cbec603afcf1116551",
  "package_commit": e1,
  "run_id": "$RUN",
  "artifacts": {
    "gate-results.json": {
      "path": rel,
      "blob_oid": subprocess.check_output(["git","rev-parse", f"{e1}:{rel}"], text=True).strip(),
    }
  },
}
# Place attestation next to submitted so checker finds it
Path("$OUT/evidence-attestation.json").write_text(json.dumps(att, indent=2)+"\n")
# Also copy submitted as if it were the results path next to attestation
Path("$OUT/gate-results.json").write_bytes(Path("$SUBMITTED").read_bytes())
print("forged", e1[:12], "vs", "$b"[:12])
PY
      break
    fi
  fi
done

if [[ -z "$SUBMITTED" ]]; then
  echo "skip: no E1/bind OID mismatch pair found" >&2
  exit 0
fi

set +e
ASSERT_PACKAGE_HEAD=0 \
  bash scripts/assert-gate-evidence-containment.sh "$OUT/gate-results.json" \
  >"$OUT/ac3-e1-bind-mismatch-stdout.json" 2>"$OUT/ac3-e1-bind-mismatch-stderr.txt"
RC=$?
set -e
echo "assert_rc=$RC" | tee "$OUT/ac3-e1-bind-mismatch-rc.txt"
if [[ "$RC" -eq 0 ]]; then
  echo "FAIL: expected non-zero assert for E1-versus-bind mismatch" >&2
  exit 2
fi
if ! grep -qiE 'blob OID identity|blob identity|hist_oid' "$OUT/ac3-e1-bind-mismatch-stderr.txt" \
  "$OUT/ac3-e1-bind-mismatch-stdout.json"; then
  echo "FAIL: expected explicit blob identity wording in assert output" >&2
  exit 2
fi
echo "E1-versus-bind negative control PASS (assert rejected mismatched blobs)"

#!/usr/bin/env bash
# RH-S30-17 / final closeout C-2 — C-2-atomic-v3-blob-attestation.
#
# False-green fixed by v2: git_sha named E1 while E1's gate-results blob still
# held pre-bind fields (git_sha=S0). Path existence alone was insufficient.
#
# Protocol C-2-atomic-v3-blob-attestation:
#   1. Gate runs at source tip S0 (temporary git_sha=S0 in results).
#   2. Commit evidence tree → E1 (first commit carrying .gate-evidence/<runId>/).
#   3. H1 = sha256(git show E1:<path>/gate-results.json)  # immutable blob id
#   4. Rewrite on-disk + evidence copies:
#        source_sha_at_run / source_sha = S0
#        git_sha / package_sha          = E1
#        gate_results_blob_sha256      = H1
#        evidence_package_protocol     = C-2-atomic-v3-blob-attestation
#   5. Commit bind tip B2 (rewritten binding; HEAD:blob == on-disk).
#   6. Assert: load named commit blob; require sha256 == H1; source ancestor;
#      HEAD gate-results byte-identical to on-disk (ASSERT_PACKAGE_HEAD=1).
#
# Usage:
#   bash scripts/package-sprint30-gate-evidence.sh <run_id>
set -euo pipefail

RUN_ID="${1:-}"
if [[ -z "$RUN_ID" ]]; then
  echo "usage: $0 <run_id>" >&2
  exit 2
fi

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
SPRINT_DIR="$ROOT/.spec/prds/mk6-migration/tasks/sprint-30-cutover-rollback-drill-and-data-plane-point-of-no-return"
EVID_DIR="$SPRINT_DIR/.gate-evidence/$RUN_ID"
RESULTS="$SPRINT_DIR/gate-results.json"
REL_RESULTS=".spec/prds/mk6-migration/tasks/sprint-30-cutover-rollback-drill-and-data-plane-point-of-no-return/.gate-evidence/${RUN_ID}/gate-results.json"

if [[ ! -f "$RESULTS" || ! -d "$EVID_DIR" ]]; then
  echo "error: missing results or evidence dir for run_id=$RUN_ID" >&2
  exit 2
fi

SOURCE_SHA="$(python3 -c "import json;print(json.load(open('$RESULTS'))['git_sha'])")"
if [[ ! "$SOURCE_SHA" =~ ^[0-9a-f]{40}$ ]]; then
  echo "error: results git_sha not 40-hex: $SOURCE_SHA" >&2
  exit 2
fi

export PATH="${ROOT}/node_modules/.bin:${PATH:-}"

git add \
  "$SPRINT_DIR/gate-results.json" \
  "$SPRINT_DIR/gate-verification.json" \
  "$SPRINT_DIR/gate-verification.json.raw" \
  "$EVID_DIR"

if git diff --cached --quiet; then
  if git cat-file -e "HEAD:${REL_RESULTS}" 2>/dev/null; then
    EVIDENCE_SHA="$(git rev-parse HEAD)"
    echo "note: HEAD already contains evidence tree: $EVIDENCE_SHA"
  else
    echo "error: nothing staged and HEAD does not contain ${REL_RESULTS}" >&2
    exit 2
  fi
else
  LEFTHOOK_EXCLUDE=root-test git commit -m "chore(sprint-30): package gate evidence ${RUN_ID} (evidence tree E1)"
  EVIDENCE_SHA="$(git rev-parse HEAD)"
fi

git cat-file -e "${EVIDENCE_SHA}:${REL_RESULTS}"

BLOB_SHA256="$(
  git show "${EVIDENCE_SHA}:${REL_RESULTS}" \
    | python3 -c 'import sys,hashlib;print(hashlib.sha256(sys.stdin.buffer.read()).hexdigest())'
)"
echo "evidence_sha=$EVIDENCE_SHA gate_results_blob_sha256=$BLOB_SHA256 source_sha_at_run=$SOURCE_SHA"

python3 - "$RESULTS" "$EVID_DIR" "$SOURCE_SHA" "$EVIDENCE_SHA" "$BLOB_SHA256" "$RUN_ID" <<'PY'
import json, sys
from pathlib import Path

results_path, evid_dir, source_sha, evidence_sha, blob_sha, run_id = sys.argv[1:7]
for p in [
    Path(results_path),
    Path(evid_dir) / "gate-results.json",
    Path(evid_dir) / "meta.json",
]:
    if not p.exists():
        continue
    data = json.loads(p.read_text())
    data["source_sha"] = source_sha
    data["source_sha_at_run"] = source_sha
    data["git_sha"] = evidence_sha
    data["package_sha"] = evidence_sha
    data["gate_results_blob_sha256"] = blob_sha
    data["evidence_package_protocol"] = "C-2-atomic-v3-blob-attestation"
    if p.name != "meta.json":
        data["head_bound"] = True
        data["sourceRevision"] = data.get("sourceRevision") or source_sha
        notes = data.get("notes") or ""
        bind = (
            f" C-2-atomic-v3: source_sha_at_run={source_sha[:12]} "
            f"git_sha/evidence={evidence_sha[:12]} "
            f"gate_results_blob_sha256={blob_sha[:16]} "
            f"contains .gate-evidence/{run_id}."
        )
        if "C-2-atomic-v3" not in notes:
            data["notes"] = (notes + bind).strip()
    # Drop obsolete self-ref bind fields from v2 experiments
    data.pop("package_bind_sha", None)
    p.write_text(json.dumps(data, indent=2) + "\n")
print(json.dumps({
    "source_sha_at_run": source_sha,
    "evidence_sha": evidence_sha,
    "gate_results_blob_sha256": blob_sha,
}))
PY

git add \
  "$SPRINT_DIR/gate-results.json" \
  "$EVID_DIR/gate-results.json" \
  "$EVID_DIR/meta.json" 2>/dev/null || true

if ! git diff --cached --quiet; then
  LEFTHOOK_EXCLUDE=root-test git commit -m "chore(sprint-30): bind gate evidence ${RUN_ID} (C-2-atomic-v3 attestation)"
fi

BIND_HEAD="$(git rev-parse HEAD)"
echo "evidence_sha=$EVIDENCE_SHA bind_head=$BIND_HEAD"

# Prove: named blob attestation + HEAD byte-identity with on-disk
python3 - <<PY
import json, subprocess, hashlib
from pathlib import Path
rel = "$REL_RESULTS"
data = json.loads(Path("$RESULTS").read_text())
ev = data["git_sha"]
raw = subprocess.check_output(["git", "show", f"{ev}:{rel}"])
h = hashlib.sha256(raw).hexdigest()
assert h == data["gate_results_blob_sha256"], (h, data["gate_results_blob_sha256"])
assert data["source_sha_at_run"] == "$SOURCE_SHA"
head = subprocess.check_output(["git", "rev-parse", "HEAD"], text=True).strip()
head_blob = subprocess.check_output(["git", "show", f"{head}:{rel}"])
assert head_blob == Path("$RESULTS").read_bytes(), "HEAD gate-results must match on-disk"
# Field identity on bind tip (HEAD): binding fields present
hb = json.loads(head_blob)
assert hb.get("git_sha") == ev
assert hb.get("source_sha_at_run") == "$SOURCE_SHA"
assert hb.get("gate_results_blob_sha256") == h
print(json.dumps({
  "attestation_ok": True,
  "evidence_sha": ev,
  "gate_results_blob_sha256": h,
  "bind_head": head,
  "head_matches_on_disk": True,
  "bind_fields_match_claim": True,
  "protocol": data.get("evidence_package_protocol"),
}, indent=2))
PY

export ASSERT_EVIDENCE_CONTAINMENT=1
export ASSERT_PACKAGE_HEAD=1
bash "$ROOT/scripts/assert-human-test-verdict.sh" "$RESULTS" "$EVID_DIR" \
  | tee "$EVID_DIR/assert-human-test-verdict.post-package.json"
bash "$ROOT/scripts/assert-gate-evidence-containment.sh" "$RESULTS" \
  | tee "$EVID_DIR/assert-gate-evidence-containment.post-package.json"
VERIFY_SCRIPT="${VERIFY_GATE_EVIDENCE:-$HOME/Projects/brain/skills/kb-run-human-tests/references/verify-gate-evidence.sh}"
bash "$VERIFY_SCRIPT" "$RESULTS" "$SPRINT_DIR/gate-plan.json" "$EVID_DIR" \
  | tee "$EVID_DIR/verify-stdout.post-package.json"

git add \
  "$EVID_DIR/assert-human-test-verdict.post-package.json" \
  "$EVID_DIR/assert-gate-evidence-containment.post-package.json" \
  "$EVID_DIR/verify-stdout.post-package.json" 2>/dev/null || true
if ! git diff --cached --quiet 2>/dev/null; then
  LEFTHOOK_EXCLUDE=root-test git commit -m "chore(sprint-30): post-package assert+verify for ${RUN_ID}"
fi

echo "package protocol complete: evidence=$EVIDENCE_SHA head=$(git rev-parse HEAD) protocol=C-2-atomic-v3-blob-attestation"

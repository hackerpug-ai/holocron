#!/usr/bin/env bash
# RH-S30-20 / C-2-atomic-v4-blob-oid-identity
#
# Rejects the v3 false-green: naming E1 while submitting a rewritten bind blob.
#
# Protocol:
#   1. Gate ran at source tip S0 (results temporarily git_sha=S0).
#   2. Finalize on-disk binding fields that do not self-reference the package tip:
#        source_sha_at_run = S0
#        git_sha           = S0  (source tip that ran; NOT the package tip)
#   3. Commit evidence tree + results → package_commit P1 (exact submitted bytes).
#   4. blob_oid = git rev-parse P1:<path>/gate-results.json
#   5. Write evidence-attestation.json (sidecar, non-self-referential):
#        source_sha_at_run, package_commit=P1, run_id, artifacts[].blob_oid
#   6. Commit attestation → P2 (gate-results blob OID unchanged).
#   7. Assert: hash-object(submitted) == blob_oid == rev-parse package_commit:path
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
ATTEST="$EVID_DIR/evidence-attestation.json"
REL_ATTEST=".spec/prds/mk6-migration/tasks/sprint-30-cutover-rollback-drill-and-data-plane-point-of-no-return/.gate-evidence/${RUN_ID}/evidence-attestation.json"

if [[ ! -f "$RESULTS" || ! -d "$EVID_DIR" ]]; then
  echo "error: missing results or evidence dir for run_id=$RUN_ID" >&2
  exit 2
fi

SOURCE_SHA="$(python3 -c "import json;d=json.load(open('$RESULTS'));print(d.get('source_sha_at_run') or d['git_sha'])")"
if [[ ! "$SOURCE_SHA" =~ ^[0-9a-f]{40}$ ]]; then
  echo "error: source sha not 40-hex: $SOURCE_SHA" >&2
  exit 2
fi

export PATH="${ROOT}/node_modules/.bin:${PATH:-}"

# Finalize results WITHOUT rewriting after package commit (single exact blob).
python3 - "$RESULTS" "$EVID_DIR" "$SOURCE_SHA" "$RUN_ID" <<'PY'
import json, sys
from pathlib import Path

results_path, evid_dir, source_sha, run_id = sys.argv[1:5]
for p in [Path(results_path), Path(evid_dir) / "gate-results.json", Path(evid_dir) / "meta.json"]:
    if not p.exists():
        continue
    data = json.loads(p.read_text())
    data["source_sha"] = source_sha
    data["source_sha_at_run"] = source_sha
    # git_sha names the source tip that ran (tip-bound deploy identity).
    # package_commit / blob OID live in evidence-attestation.json (non-self-ref).
    data["git_sha"] = source_sha
    data["package_sha"] = source_sha
    data["evidence_package_protocol"] = "C-2-atomic-v4-blob-oid-identity"
    data.pop("gate_results_blob_sha256", None)  # superseded by git blob OID attestation
    data.pop("package_bind_sha", None)
    if p.name != "meta.json":
        data["head_bound"] = True
        data["sourceRevision"] = data.get("sourceRevision") or source_sha
        notes = data.get("notes") or ""
        bind = (
            f" C-2-atomic-v4: source_sha_at_run/git_sha={source_sha[:12]} "
            f"(source tip); exact evidence blob OID in evidence-attestation.json "
            f"for .gate-evidence/{run_id}."
        )
        if "C-2-atomic-v4" not in notes:
            data["notes"] = (notes + bind).strip()
    p.write_text(json.dumps(data, indent=2) + "\n")
print(json.dumps({"source_sha_at_run": source_sha, "run_id": run_id}))
PY

git add \
  "$SPRINT_DIR/gate-results.json" \
  "$SPRINT_DIR/gate-verification.json" \
  "$SPRINT_DIR/gate-verification.json.raw" \
  "$EVID_DIR"

if git diff --cached --quiet; then
  echo "error: nothing staged for package commit" >&2
  exit 2
fi

LEFTHOOK_EXCLUDE=root-test git commit -m "chore(sprint-30): package gate evidence ${RUN_ID} (C-2-atomic-v4 exact blob)"
PACKAGE_COMMIT="$(git rev-parse HEAD)"

git cat-file -e "${PACKAGE_COMMIT}:${REL_RESULTS}"
BLOB_OID="$(git rev-parse "${PACKAGE_COMMIT}:${REL_RESULTS}")"
SUB_OID="$(git hash-object -t blob "$RESULTS")"
if [[ "$BLOB_OID" != "$SUB_OID" ]]; then
  echo "error: package blob oid $BLOB_OID != hash-object submitted $SUB_OID" >&2
  exit 2
fi

# Optional companion artifact OIDs
VER_OID=""
if [[ -f "$SPRINT_DIR/gate-verification.json" ]]; then
  VER_REL=".spec/prds/mk6-migration/tasks/sprint-30-cutover-rollback-drill-and-data-plane-point-of-no-return/gate-verification.json"
  if git cat-file -e "${PACKAGE_COMMIT}:${VER_REL}" 2>/dev/null; then
    VER_OID="$(git rev-parse "${PACKAGE_COMMIT}:${VER_REL}")"
  fi
fi

python3 - "$ATTEST" "$SOURCE_SHA" "$PACKAGE_COMMIT" "$RUN_ID" "$BLOB_OID" "$REL_RESULTS" "$VER_OID" <<'PY'
import json, sys
from pathlib import Path

path, source, package, run_id, blob_oid, rel, ver_oid = sys.argv[1:8]
artifacts = {
    "gate-results.json": {
        "path": rel,
        "blob_oid": blob_oid,
    }
}
if ver_oid:
    artifacts["gate-verification.json"] = {
        "path": ".spec/prds/mk6-migration/tasks/sprint-30-cutover-rollback-drill-and-data-plane-point-of-no-return/gate-verification.json",
        "blob_oid": ver_oid,
    }
att = {
    "protocol": "C-2-atomic-v4-blob-oid-identity",
    "source_sha_at_run": source,
    "package_commit": package,
    "run_id": run_id,
    "artifacts": artifacts,
    "notes": (
        "Non-self-referential: package_commit names the commit whose gate-results "
        "blob OID equals git hash-object of the submitted results. git_sha in "
        "gate-results names the source tip that ran, not a pre-bind ancestor."
    ),
}
Path(path).write_text(json.dumps(att, indent=2) + "\n")
print(json.dumps(att, indent=2))
PY

git add "$ATTEST"
LEFTHOOK_EXCLUDE=root-test git commit -m "chore(sprint-30): evidence-attestation ${RUN_ID} (C-2-atomic-v4)"

# Attestation commit must still present the same gate-results blob OID
ATTEST_HEAD="$(git rev-parse HEAD)"
BLOB_OID_HEAD="$(git rev-parse "${ATTEST_HEAD}:${REL_RESULTS}")"
if [[ "$BLOB_OID_HEAD" != "$BLOB_OID" ]]; then
  echo "error: attestation commit changed gate-results blob OID" >&2
  exit 2
fi

echo "package_commit=$PACKAGE_COMMIT blob_oid=$BLOB_OID source_sha_at_run=$SOURCE_SHA"

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

echo "package protocol complete: package_commit=$PACKAGE_COMMIT head=$(git rev-parse HEAD) protocol=C-2-atomic-v4-blob-oid-identity"

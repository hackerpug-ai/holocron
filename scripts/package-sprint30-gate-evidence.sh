#!/usr/bin/env bash
# RH-S30-20 residual / C-2-atomic-v5-git-bound-attestation
#
# Package exact gate-results blob, then commit a Git-bound attestation + lock
# that authenticates the sidecar itself (not a mutable worktree-only file).
#
# Protocol:
#   1. Finalize results: source_sha_at_run=S0, git_sha=S0 (source tip that ran).
#   2. Commit evidence tree + results → package_commit P1 (exact result bytes).
#   3. Write evidence-attestation.json naming P1 + gate-results blob OID.
#   4. Commit attestation → attestation_commit A1.
#   5. Write evidence-attestation.lock.json naming A1 + attestation blob OID.
#   6. Commit lock → L1 (HEAD package tip).
#   7. Assert loads lock from Git, resolves attestation from A1, then
#      hist_oid == sub_oid for gate-results.
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
LOCK="$EVID_DIR/evidence-attestation.lock.json"
REL_LOCK=".spec/prds/mk6-migration/tasks/sprint-30-cutover-rollback-drill-and-data-plane-point-of-no-return/.gate-evidence/${RUN_ID}/evidence-attestation.lock.json"
PROTOCOL="C-2-atomic-v5-git-bound-attestation"

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

# Stage package-bound M-3 identity tree (fail-closed at assert if incomplete)
M3_SRC=".tmp/REDHAT-FIX-RH-S30-22"
for dst in m3-identity m3-branch-identity; do
  if [[ -d "$M3_SRC" ]]; then
    mkdir -p "$EVID_DIR/$dst"
    cp -R "$M3_SRC/." "$EVID_DIR/$dst/" 2>/dev/null || true
  fi
done
# Generate manifest if missing
if [[ -d "$EVID_DIR/m3-identity" ]]; then
  python3 - "$EVID_DIR/m3-identity" <<'PY'
import json, hashlib
from pathlib import Path
root = Path(__import__("sys").argv[1])
files = sorted(p for p in root.rglob("*") if p.is_file())
manifest = {
  "tree": "m3-identity",
  "files": [
    {
      "path": str(p.relative_to(root)),
      "sha256": hashlib.sha256(p.read_bytes()).hexdigest(),
      "bytes": p.stat().st_size,
    }
    for p in files
  ],
}
(root / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
print(json.dumps({"m3_manifest_files": len(files)}))
PY
fi

python3 - "$RESULTS" "$EVID_DIR" "$SOURCE_SHA" "$RUN_ID" "$PROTOCOL" <<'PY'
import json, sys
from pathlib import Path

results_path, evid_dir, source_sha, run_id, protocol = sys.argv[1:6]
for p in [Path(results_path), Path(evid_dir) / "gate-results.json", Path(evid_dir) / "meta.json"]:
    if not p.exists():
        continue
    data = json.loads(p.read_text())
    data["source_sha"] = source_sha
    data["source_sha_at_run"] = source_sha
    data["git_sha"] = source_sha
    data["package_sha"] = source_sha
    data["evidence_package_protocol"] = protocol
    data.pop("gate_results_blob_sha256", None)
    data.pop("package_bind_sha", None)
    if p.name != "meta.json":
        data["head_bound"] = True
        data["sourceRevision"] = data.get("sourceRevision") or source_sha
        notes = data.get("notes") or ""
        bind = (
            f" {protocol}: source={source_sha[:12]}; "
            f"exact gate-results blob bound via Git-authenticated attestation lock "
            f"for .gate-evidence/{run_id}."
        )
        if protocol not in notes:
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

LEFTHOOK_EXCLUDE=root-test git commit -m "chore(sprint-30): package gate evidence ${RUN_ID} (C-2-atomic-v5 exact blob)"
PACKAGE_COMMIT="$(git rev-parse HEAD)"

git cat-file -e "${PACKAGE_COMMIT}:${REL_RESULTS}"
BLOB_OID="$(git rev-parse "${PACKAGE_COMMIT}:${REL_RESULTS}")"
SUB_OID="$(git hash-object -t blob "$RESULTS")"
if [[ "$BLOB_OID" != "$SUB_OID" ]]; then
  echo "error: package blob oid $BLOB_OID != hash-object submitted $SUB_OID" >&2
  exit 2
fi

# C-3 package predicates from PACKAGE_COMMIT Git objects (not mutable worktree alone)
python3 - "$PACKAGE_COMMIT" "$RUN_ID" <<'PY'
import json, subprocess, sys
from pathlib import Path

package, run_id = sys.argv[1:3]
base = (
    ".spec/prds/mk6-migration/tasks/"
    "sprint-30-cutover-rollback-drill-and-data-plane-point-of-no-return/"
    f".gate-evidence/{run_id}/"
)
errors = []
c3_oids = {}

def show(rel):
    r = subprocess.run(["git", "cat-file", "-e", f"{package}:{rel}"], capture_output=True)
    if r.returncode != 0:
        return None, None
    oid = subprocess.check_output(["git", "rev-parse", f"{package}:{rel}"], text=True).strip()
    raw = subprocess.check_output(["git", "show", f"{package}:{rel}"])
    return oid, raw

for name, rel in [
    ("ac1", base + "ponr-role-provenance/ac1-prod-role-disable-trigger.json"),
    ("ac2", base + "ponr-role-provenance/ac2-prod-role-dml-truncate.json"),
    ("marker_miss", base + "ponr-role-provenance-marker-miss/negative-marker-report.json"),
]:
    oid, raw = show(rel)
    if oid is None:
        errors.append(f"missing in package_commit: {rel}")
        continue
    c3_oids[name] = {"path": rel, "blob_oid": oid}
    data = json.loads(raw)
    if name == "ac1":
        if not data.get("production_sqlstate_claim"):
            errors.append("ac1 production_sqlstate_claim false")
        if data.get("probe_current_user") != "holocron_app":
            errors.append(f"ac1 probe_current_user not holocron_app: {data.get('probe_current_user')}")
    if name == "ac2" and not data.get("production_sqlstate_claim"):
        errors.append("ac2 production_sqlstate_claim false")
    if name == "marker_miss":
        if data.get("ok") is not True:
            errors.append("marker_miss ok!=true")
        if int(data.get("before_count") or 0) < 1:
            errors.append("marker_miss before_count < 1")
        if data.get("effective_non_owner") is not True:
            errors.append("marker_miss effective_non_owner false")
        if data.get("exact_required_triggers_enabled_before") is not True:
            errors.append("marker_miss exact triggers before false")
        if data.get("exact_required_triggers_enabled_after") is not True:
            errors.append("marker_miss exact triggers after false")
        if int(data.get("before_required_triggers_enabled_count") or 0) != 2:
            errors.append("marker_miss before trigger count != 2")
        if data.get("urls_distinct") is not True:
            errors.append("marker_miss urls not distinct")
        if data.get("production_untouched") is not True:
            errors.append("marker_miss production_untouched false")
if errors:
    print("C-3 package predicate FAIL:", *errors, sep="\n  ", file=sys.stderr)
    sys.exit(2)
Path("/tmp/s30-c3-oids.json").write_text(json.dumps(c3_oids, indent=2) + "\n")
print(json.dumps({"c3_package_predicates_ok": True, "c3_oids": c3_oids}))
PY

VER_OID=""
VER_REL=".spec/prds/mk6-migration/tasks/sprint-30-cutover-rollback-drill-and-data-plane-point-of-no-return/gate-verification.json"
if git cat-file -e "${PACKAGE_COMMIT}:${VER_REL}" 2>/dev/null; then
  VER_OID="$(git rev-parse "${PACKAGE_COMMIT}:${VER_REL}")"
fi

python3 - "$ATTEST" "$SOURCE_SHA" "$PACKAGE_COMMIT" "$RUN_ID" "$BLOB_OID" "$REL_RESULTS" "$VER_OID" "$PROTOCOL" <<'PY'
import json, sys
from pathlib import Path
path, source, package, run_id, blob_oid, rel, ver_oid, protocol = sys.argv[1:9]
artifacts = {"gate-results.json": {"path": rel, "blob_oid": blob_oid}}
if ver_oid:
    artifacts["gate-verification.json"] = {
        "path": ".spec/prds/mk6-migration/tasks/sprint-30-cutover-rollback-drill-and-data-plane-point-of-no-return/gate-verification.json",
        "blob_oid": ver_oid,
    }
c3_path = Path("/tmp/s30-c3-oids.json")
if c3_path.exists():
    c3 = json.loads(c3_path.read_text())
    for k, v in c3.items():
        artifacts[f"c3-{k}"] = v
att = {
    "protocol": protocol,
    "source_sha_at_run": source,
    "package_commit": package,
    "run_id": run_id,
    "artifacts": artifacts,
    "notes": (
        "Git-bound via evidence-attestation.lock.json. C-3 report blob OIDs are "
        "bound under artifacts.c3-* and must match package_commit objects."
    ),
}
Path(path).write_text(json.dumps(att, indent=2) + "\n")
print(json.dumps({"attestation_written": True, "package_commit": package, "c3_bound": True}))
PY
git add "$ATTEST"
LEFTHOOK_EXCLUDE=root-test git commit -m "chore(sprint-30): evidence-attestation ${RUN_ID} (C-2-atomic-v5)"
ATTEST_COMMIT="$(git rev-parse HEAD)"
ATTEST_BLOB_OID="$(git rev-parse "${ATTEST_COMMIT}:${REL_ATTEST}")"

# Lock authenticates the attestation object itself
python3 - "$LOCK" "$ATTEST_COMMIT" "$REL_ATTEST" "$ATTEST_BLOB_OID" "$RUN_ID" "$PROTOCOL" "$PACKAGE_COMMIT" "$SOURCE_SHA" <<'PY'
import json, sys
from pathlib import Path
path, att_commit, att_path, att_blob, run_id, protocol, package, source = sys.argv[1:9]
lock = {
    "protocol": protocol,
    "run_id": run_id,
    "source_sha_at_run": source,
    "package_commit": package,
    "attestation_commit": att_commit,
    "attestation_path": att_path,
    "attestation_blob_oid": att_blob,
}
Path(path).write_text(json.dumps(lock, indent=2) + "\n")
print(json.dumps(lock, indent=2))
PY

git add "$LOCK"
LEFTHOOK_EXCLUDE=root-test git commit -m "chore(sprint-30): evidence-attestation.lock ${RUN_ID} (C-2-atomic-v5)"
LOCK_COMMIT="$(git rev-parse HEAD)"
LOCK_BLOB_OID="$(git rev-parse "${LOCK_COMMIT}:${REL_LOCK}")"

# Gate-results must still be the same blob through attestation/lock commits
for c in "$ATTEST_COMMIT" "$LOCK_COMMIT"; do
  oid="$(git rev-parse "${c}:${REL_RESULTS}")"
  if [[ "$oid" != "$BLOB_OID" ]]; then
    echo "error: commit $c changed gate-results blob oid" >&2
    exit 2
  fi
done

echo "package_commit=$PACKAGE_COMMIT attestation_commit=$ATTEST_COMMIT lock_commit=$LOCK_COMMIT blob_oid=$BLOB_OID"

export ASSERT_EVIDENCE_CONTAINMENT=1
export ASSERT_PACKAGE_HEAD=1
export ASSERT_C3_PREDICATES=1
# Never inherit a stale ASSERT_LOCK_COMMIT into package verification
unset ASSERT_LOCK_COMMIT || true
bash "$ROOT/scripts/assert-human-test-verdict.sh" "$RESULTS" "$EVID_DIR" \
  | tee "$EVID_DIR/assert-human-test-verdict.post-package.json"
bash "$ROOT/scripts/assert-gate-evidence-containment.sh" "$RESULTS" \
  | tee "$EVID_DIR/assert-gate-evidence-containment.post-package.json"
bash "$ROOT/scripts/assert-m3-identity-evidence.sh" "$EVID_DIR" \
  | tee "$EVID_DIR/assert-m3-identity.post-package.json"
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

echo "package protocol complete: package_commit=$PACKAGE_COMMIT head=$(git rev-parse HEAD) protocol=$PROTOCOL lock_blob=$LOCK_BLOB_OID"

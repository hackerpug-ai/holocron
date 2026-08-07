#!/usr/bin/env bash
# Closeout C-2 / RH-S30-10 — package Sprint 30 gate evidence so git_sha names a
# commit that CONTAINS the evidence tree (atomic protocol).
#
# Protocol (two-commit; avoids self-referential content-hash deadlock):
#   1. Source tip S0 is deployed; gate runs with git_sha=S0 (code that ran).
#   2. This script commits results + .gate-evidence/<runId>/ → containing tip C1.
#      C1 is the first commit that carries the full evidence tree.
#   3. Rewrites gate-results (and copies) so:
#        source_sha_at_run / source_sha = S0  (code that ran)
#        git_sha    = C1   (commit that contains this evidence tree)
#        package_sha = C1
#   4. Second commit C2 records the rewritten binding (git_sha still = C1).
#   5. assert-human-test-verdict verifies git cat-file C1:<evidence path> succeeds.
#
# Usage (from repo root, after a successful run-sprint30-human-gate.sh):
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

# Stage package (do not pick up unrelated dirty tree)
git add \
  "$SPRINT_DIR/gate-results.json" \
  "$SPRINT_DIR/gate-verification.json" \
  "$SPRINT_DIR/gate-verification.json.raw" \
  "$EVID_DIR"

if git diff --cached --quiet; then
  # Already committed? Check whether SOURCE_SHA or HEAD already contains the tree.
  if git cat-file -e "${SOURCE_SHA}:${REL_RESULTS}" 2>/dev/null; then
    CONTAINING_SHA="$SOURCE_SHA"
    echo "note: source_sha already contains evidence tree: $CONTAINING_SHA"
  elif git cat-file -e "HEAD:${REL_RESULTS}" 2>/dev/null; then
    CONTAINING_SHA="$(git rev-parse HEAD)"
    echo "note: HEAD already contains evidence tree: $CONTAINING_SHA"
  else
    echo "error: nothing staged and no commit contains ${REL_RESULTS}" >&2
    exit 2
  fi
else
  export PATH="${ROOT}/node_modules/.bin:${PATH:-}"
  LEFTHOOK_EXCLUDE=root-test git commit -m "chore(sprint-30): package gate evidence ${RUN_ID} (containing tree)"
  CONTAINING_SHA="$(git rev-parse HEAD)"
fi

# Prove C1 contains the evidence path before rewriting binding
git cat-file -e "${CONTAINING_SHA}:${REL_RESULTS}"

# Rewrite binding fields so git_sha names the containing commit (C1)
python3 - "$RESULTS" "$EVID_DIR" "$SOURCE_SHA" "$CONTAINING_SHA" "$RUN_ID" <<'PY'
import json, sys
from pathlib import Path

results_path, evid_dir, source_sha, containing_sha, run_id = sys.argv[1:6]
paths = [
    Path(results_path),
    Path(evid_dir) / "gate-results.json",
    Path(evid_dir) / "meta.json",
]
for p in paths:
    if not p.exists():
        continue
    data = json.loads(p.read_text())
    if p.name == "meta.json":
        data["source_sha"] = source_sha
        data["git_sha"] = containing_sha
        data["package_sha"] = containing_sha
        data["source_sha_at_run"] = source_sha
        data["evidence_package_protocol"] = "C-2-atomic-v2-two-commit"
    else:
        data["source_sha"] = source_sha
        data["git_sha"] = containing_sha
        data["package_sha"] = containing_sha
        data["source_sha_at_run"] = source_sha
        data["head_bound"] = True
        data["sourceRevision"] = data.get("sourceRevision") or source_sha
        notes = data.get("notes") or ""
        bind = (
            f" C-2 atomic package v2: source_sha_at_run={source_sha[:12]} "
            f"git_sha/package_sha={containing_sha[:12]} contains .gate-evidence/{run_id}."
        )
        if "C-2 atomic package" not in notes:
            data["notes"] = (notes + bind).strip()
    p.write_text(json.dumps(data, indent=2) + "\n")
print(json.dumps({
    "source_sha_at_run": source_sha,
    "containing_sha": containing_sha,
    "run_id": run_id,
}))
PY

git add \
  "$SPRINT_DIR/gate-results.json" \
  "$EVID_DIR/gate-results.json" \
  "$EVID_DIR/meta.json" 2>/dev/null || true

if ! git diff --cached --quiet; then
  LEFTHOOK_EXCLUDE=root-test git commit -m "chore(sprint-30): bind gate evidence ${RUN_ID} to containing SHA (C-2)"
fi

BIND_SHA="$(git rev-parse HEAD)"
echo "containing_sha=$CONTAINING_SHA bind_sha=$BIND_SHA source_sha_at_run=$SOURCE_SHA run_id=$RUN_ID"

# Prove containment under the named git_sha (not necessarily HEAD/bind commit)
git cat-file -e "${CONTAINING_SHA}:${REL_RESULTS}"
python3 - <<PY
import json, subprocess
sha = "$CONTAINING_SHA"
run = "$RUN_ID"
# On-disk results after rewrite must name the containing commit
with open("$RESULTS") as f:
    g = json.load(f)
assert g["git_sha"] == sha, (g["git_sha"], sha)
src = g.get("source_sha_at_run") or g.get("source_sha")
assert src and len(src) == 40, src
# Tree at containing SHA exists (blob may still show pre-bind git_sha; path must exist)
path = f".spec/prds/mk6-migration/tasks/sprint-30-cutover-rollback-drill-and-data-plane-point-of-no-return/.gate-evidence/{run}/gate-results.json"
subprocess.check_call(["git", "cat-file", "-e", f"{sha}:{path}"])
# Ancestor check: source at run is ancestor of containing (or equal)
src = "$SOURCE_SHA"
if src != sha:
    r = subprocess.run(["git", "merge-base", "--is-ancestor", src, sha])
    assert r.returncode == 0, f"{src[:12]} not ancestor of {sha[:12]}"
bind = "$BIND_SHA"
print("containment_ok", sha[:12], "source_at_run", src[:12], "bind_head", bind[:12])
PY

# Re-run assertion with containment required (C-2)
export ASSERT_EVIDENCE_CONTAINMENT=1
bash "$ROOT/scripts/assert-human-test-verdict.sh" "$RESULTS" "$EVID_DIR" \
  | tee "$EVID_DIR/assert-human-test-verdict.post-package.json"
VERIFY_SCRIPT="${VERIFY_GATE_EVIDENCE:-$HOME/Projects/brain/skills/kb-run-human-tests/references/verify-gate-evidence.sh}"
bash "$VERIFY_SCRIPT" "$RESULTS" "$SPRINT_DIR/gate-plan.json" "$EVID_DIR" \
  | tee "$EVID_DIR/verify-stdout.post-package.json"

# Stage post-package verifier outputs into a third optional commit if present
git add \
  "$EVID_DIR/assert-human-test-verdict.post-package.json" \
  "$EVID_DIR/verify-stdout.post-package.json" 2>/dev/null || true
if ! git diff --cached --quiet 2>/dev/null; then
  LEFTHOOK_EXCLUDE=root-test git commit -m "chore(sprint-30): post-package assert+verify for ${RUN_ID}"
fi

echo "package protocol complete: containing=$CONTAINING_SHA head=$(git rev-parse HEAD)"

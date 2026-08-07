#!/usr/bin/env bash
# RH-S30-17 / C-2 — fail-closed Git-tree containment for Sprint 30 gate packages.
#
# Usage:
#   bash scripts/assert-gate-evidence-containment.sh <gate-results.json>
#
# Exit 0 only when:
#   - git_sha is 40-hex
#   - git cat-file -e <git_sha>:<sprint>/.gate-evidence/<run_id>/gate-results.json
#   - if source_sha_at_run set and differs, it is an ancestor of git_sha
set -euo pipefail

RESULTS="${1:-}"
if [[ -z "$RESULTS" || ! -f "$RESULTS" ]]; then
  echo "assert-gate-evidence-containment: missing results: ${RESULTS:-<none>}" >&2
  exit 2
fi

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

python3 - "$RESULTS" <<'PY'
import json, re, subprocess, sys
from pathlib import Path

results_path = Path(sys.argv[1])
data = json.loads(results_path.read_text())
git_sha = str(data.get("git_sha") or "")
source = str(data.get("source_sha_at_run") or data.get("source_sha") or "")
run_id = str(data.get("run_id") or "")
errors = []

if not re.fullmatch(r"[0-9a-f]{40}", git_sha):
    errors.append(f"git_sha not 40-hex: {git_sha!r}")
if not run_id:
    errors.append("run_id missing")

rel = (
    ".spec/prds/mk6-migration/tasks/"
    "sprint-30-cutover-rollback-drill-and-data-plane-point-of-no-return/"
    f".gate-evidence/{run_id}/gate-results.json"
)

if re.fullmatch(r"[0-9a-f]{40}", git_sha) and run_id:
    r = subprocess.run(
        ["git", "cat-file", "-e", f"{git_sha}:{rel}"],
        capture_output=True,
        text=True,
    )
    if r.returncode != 0:
        errors.append(
            f"C-2 containment FAIL: git_sha={git_sha[:12]} does not contain {rel} "
            f"(historical non-containing bind e.g. 09aae0dd+20260807T091354Z is rejected)"
        )
    if re.fullmatch(r"[0-9a-f]{40}", source) and source != git_sha:
        a = subprocess.run(
            ["git", "merge-base", "--is-ancestor", source, git_sha],
            capture_output=True,
        )
        if a.returncode != 0:
            errors.append(
                f"source_sha_at_run={source[:12]} is not an ancestor of git_sha={git_sha[:12]}"
            )

out = {
    "ok": len(errors) == 0,
    "tool": "scripts/assert-gate-evidence-containment.sh",
    "git_sha": git_sha,
    "source_sha_at_run": source or None,
    "run_id": run_id,
    "evidence_rel": rel if run_id else None,
    "errors": errors,
}
print(json.dumps(out, indent=2))
if errors:
    for e in errors:
        print(f"assert-gate-evidence-containment FAIL: {e}", file=sys.stderr)
    sys.exit(1)
sys.exit(0)
PY

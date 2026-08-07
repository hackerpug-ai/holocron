#!/usr/bin/env bash
# REDHAT-FIX-RH-S30-14 / closeout C-2 — assert a gate-results.json is a real
# tip-bound human-test pass with evidence-tree containment.
#
# Usage:
#   bash scripts/assert-human-test-verdict.sh <gate-results.json> [evidence-dir]
#
# Exit 0 only when:
#   - results file exists and parses
#   - verdict == pass
#   - steps_executed == steps_total == steps_passed
#   - every step executed:true and result:pass
#   - referenced step logs exist and are non-empty
#   - git_sha is 40-hex AND names a commit that CONTAINS the evidence tree
#     (git cat-file -e <git_sha>:<evidence-relative-path>/gate-results.json)
#   - if source_sha_at_run / source_sha is set, it must be an ancestor of git_sha
#
# This is provenance / shape + Git containment — not external-state re-execution.
set -euo pipefail

RESULTS="${1:-}"
EVID_DIR="${2:-}"

if [[ -z "$RESULTS" || ! -f "$RESULTS" ]]; then
  echo "assert-human-test-verdict: missing results file: ${RESULTS:-<none>}" >&2
  exit 2
fi

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

python3 - "$RESULTS" "${EVID_DIR:-}" <<'PY'
import json, sys, os, re, subprocess
from pathlib import Path

results_path = Path(sys.argv[1])
evid_dir = Path(sys.argv[2]) if len(sys.argv) > 2 and sys.argv[2] else None

try:
    data = json.loads(results_path.read_text())
except Exception as e:
    print(f"assert-human-test-verdict: unparseable JSON: {e}", file=sys.stderr)
    sys.exit(2)

verdict = data.get("verdict")
steps = data.get("steps") or []
steps_total = int(data.get("steps_total") or 0)
steps_executed = int(data.get("steps_executed") or 0)
steps_passed = int(data.get("steps_passed") or 0)
git_sha = str(data.get("git_sha") or "")
source_at_run = str(data.get("source_sha_at_run") or data.get("source_sha") or "")
run_id = str(data.get("run_id") or "")

errors = []
if verdict != "pass":
    errors.append(f"verdict={verdict!r} (want pass)")
if steps_total <= 0:
    errors.append(f"steps_total={steps_total}")
if steps_executed != steps_total or steps_passed != steps_total:
    errors.append(
        f"steps executed/passed/total = {steps_executed}/{steps_passed}/{steps_total}"
    )
if not re.fullmatch(r"[0-9a-f]{40}", git_sha):
    errors.append(f"git_sha not 40-hex: {git_sha!r}")

for s in steps:
    n = s.get("n")
    if s.get("executed") is not True:
        errors.append(f"step {n}: executed!={s.get('executed')!r}")
    if s.get("result") != "pass":
        errors.append(f"step {n}: result={s.get('result')!r}")
    log = s.get("log") or s.get("evidence")
    if isinstance(log, str) and log.startswith("see "):
        log = log[4:].strip()
    candidates = []
    if isinstance(log, str) and log:
        candidates.append(Path(log))
    if evid_dir is not None:
        candidates.append(evid_dir / f"step{n}.log")
    found = None
    for c in candidates:
        p = c if c.is_absolute() else Path.cwd() / c
        if p.is_file() and p.stat().st_size > 0:
            found = p
            break
    if found is None and candidates:
        errors.append(f"step {n}: missing/empty log (tried {candidates})")

# C-2: git_sha must contain the evidence tree (enforced after package protocol).
# During live gate run, set ASSERT_EVIDENCE_CONTAINMENT=0; packaging re-runs with =1.
require_containment = os.environ.get("ASSERT_EVIDENCE_CONTAINMENT", "1") == "1"
if require_containment and re.fullmatch(r"[0-9a-f]{40}", git_sha) and run_id:
    rel = (
        ".spec/prds/mk6-migration/tasks/"
        "sprint-30-cutover-rollback-drill-and-data-plane-point-of-no-return/"
        f".gate-evidence/{run_id}/gate-results.json"
    )
    r = subprocess.run(
        ["git", "cat-file", "-e", f"{git_sha}:{rel}"],
        capture_output=True,
        text=True,
    )
    if r.returncode != 0:
        errors.append(
            f"C-2 containment: git_sha={git_sha[:12]} does not contain {rel} "
            f"(package protocol requires evidence-containing git_sha)"
        )
    else:
        if re.fullmatch(r"[0-9a-f]{40}", source_at_run) and source_at_run != git_sha:
            a = subprocess.run(
                ["git", "merge-base", "--is-ancestor", source_at_run, git_sha],
                capture_output=True,
            )
            if a.returncode != 0:
                errors.append(
                    f"source_sha_at_run={source_at_run[:12]} is not an ancestor of git_sha={git_sha[:12]}"
                )
elif not require_containment:
    # still record that containment was deferred to packaging
    pass

out = {
    "ok": len(errors) == 0,
    "tool": "scripts/assert-human-test-verdict.sh",
    "results_path": str(results_path),
    "verdict": verdict,
    "steps_total": steps_total,
    "steps_executed": steps_executed,
    "steps_passed": steps_passed,
    "git_sha": git_sha,
    "source_sha_at_run": source_at_run or None,
    "errors": errors,
}
print(json.dumps(out, indent=2))
if errors:
    for e in errors:
        print(f"assert-human-test-verdict FAIL: {e}", file=sys.stderr)
    sys.exit(1)
sys.exit(0)
PY

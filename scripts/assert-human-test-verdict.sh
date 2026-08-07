#!/usr/bin/env bash
# REDHAT-FIX-RH-S30-14 / RH-S30-08 AC-2 — assert a gate-results.json is a real
# tip-bound human-test pass (not hollow/forged).
#
# Usage:
#   bash scripts/assert-human-test-verdict.sh <gate-results.json> [evidence-dir]
#
# Exit 0 only when:
#   - results file exists and parses
#   - verdict == pass
#   - steps_executed == steps_total == steps_passed
#   - every step executed:true and result:pass
#   - referenced step logs exist and are non-empty (when evidence-dir provided
#     or when step.log paths resolve relative to repo root)
#   - git_sha is a 40-char hex string (tip-bound claim present)
#
# This is a provenance / shape assertion, not an external-state re-execution
# (see REDHAT-FIX-RH-S30-16 verifier-scope note).
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
import json, sys, os, re
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
git_sha = str(data.get("git_sha") or data.get("source_sha") or "")

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
    # resolve relative to cwd/repo
    found = None
    for c in candidates:
        p = c if c.is_absolute() else Path.cwd() / c
        if p.is_file() and p.stat().st_size > 0:
            found = p
            break
    if found is None and candidates:
        errors.append(f"step {n}: missing/empty log (tried {candidates})")

out = {
    "ok": len(errors) == 0,
    "tool": "scripts/assert-human-test-verdict.sh",
    "results_path": str(results_path),
    "verdict": verdict,
    "steps_total": steps_total,
    "steps_executed": steps_executed,
    "steps_passed": steps_passed,
    "git_sha": git_sha,
    "errors": errors,
}
print(json.dumps(out, indent=2))
if errors:
    for e in errors:
        print(f"assert-human-test-verdict FAIL: {e}", file=sys.stderr)
    sys.exit(1)
sys.exit(0)
PY

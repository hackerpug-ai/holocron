#!/usr/bin/env bash
# REDHAT-FIX-RH-S30-14 / RH-S30-20 C-2 — tip-bound pass + blob OID identity.
#
# Usage:
#   bash scripts/assert-human-test-verdict.sh <gate-results.json> [evidence-dir]
#
# With ASSERT_EVIDENCE_CONTAINMENT=1, also requires C-2-atomic-v4 attestation
# and hist_oid == sub_oid for the package_commit gate-results blob.
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

require_containment = os.environ.get("ASSERT_EVIDENCE_CONTAINMENT", "1") == "1"
blob_identity = None
if require_containment:
    r = subprocess.run(
        ["bash", "scripts/assert-gate-evidence-containment.sh", str(results_path)],
        capture_output=True,
        text=True,
    )
    try:
        blob_identity = json.loads(r.stdout) if r.stdout.strip() else None
    except Exception:
        blob_identity = {"raw": r.stdout, "stderr": r.stderr}
    if r.returncode != 0:
        errors.append(
            "C-2 blob identity / Git-bound attestation failed via "
            f"assert-gate-evidence-containment (exit={r.returncode}): "
            f"{(r.stderr or r.stdout)[:500]}"
        )

# C-3 mandatory predicates at package time (after probes). Live gate assert runs
# before C-3 probes, so default off unless ASSERT_EVIDENCE_CONTAINMENT=1 or explicit.
c3 = None
_c3_default = "1" if require_containment else "0"
if evid_dir is not None and os.environ.get("ASSERT_C3_PREDICATES", _c3_default) == "1":
    c3_errors = []
    ac1 = evid_dir / "ponr-role-provenance" / "ac1-prod-role-disable-trigger.json"
    ac2 = evid_dir / "ponr-role-provenance" / "ac2-prod-role-dml-truncate.json"
    miss = evid_dir / "ponr-role-provenance-marker-miss" / "negative-marker-report.json"
    if not ac1.is_file() or not ac2.is_file():
        c3_errors.append("missing C-3 success-path ac1/ac2")
    else:
        a1 = json.loads(ac1.read_text())
        a2 = json.loads(ac2.read_text())
        if not a1.get("production_sqlstate_claim") or not a2.get("production_sqlstate_claim"):
            c3_errors.append("C-3 success-path production_sqlstate_claim false")
        if a1.get("probe_current_user") != "holocron_app":
            c3_errors.append(
                f"C-3 probe_current_user not holocron_app: {a1.get('probe_current_user')!r}"
            )
    if not miss.is_file():
        c3_errors.append("missing C-3 forced-marker-miss report")
    else:
        mr = json.loads(miss.read_text())
        if mr.get("ok") is not True:
            c3_errors.append("C-3 marker-miss ok!=true")
        if int(mr.get("before_count") or 0) < 1:
            c3_errors.append("C-3 marker-miss before_count < 1")
        if mr.get("effective_non_owner") is not True:
            c3_errors.append("C-3 marker-miss effective_non_owner not true")
        if mr.get("exact_required_triggers_enabled_before") is not True:
            c3_errors.append("C-3 exact_required_triggers_enabled_before not true")
        if mr.get("exact_required_triggers_enabled_after") is not True:
            c3_errors.append("C-3 exact_required_triggers_enabled_after not true")
        if int(mr.get("before_required_triggers_enabled_count") or 0) != 2:
            c3_errors.append("C-3 before_required_triggers_enabled_count != 2")
        if mr.get("urls_distinct") is not True:
            c3_errors.append("C-3 marker DB not distinct from gate URL")
        if mr.get("production_untouched") is not True:
            c3_errors.append("C-3 production_untouched not true")
    one_trig = evid_dir / "ponr-one-trigger-missing" / "one-trigger-missing-report.json"
    if not one_trig.is_file():
        c3_errors.append("missing C-3 one-trigger-missing report")
    else:
        ot = json.loads(one_trig.read_text())
        if ot.get("ok") is not True:
            c3_errors.append("C-3 one-trigger-missing ok!=true")
        if ot.get("uri_alias_same_target_refused") is not True:
            c3_errors.append("C-3 URI-alias same-target not refused")
        cases = ot.get("one_trigger_missing_cases") or []
        if len(cases) != 2:
            c3_errors.append(f"C-3 one-trigger-missing cases len={len(cases)} != 2")
        elif not all(
            c.get("refused") and int(c.get("probe_rc") or 0) != 0 for c in cases
        ):
            c3_errors.append("C-3 one-trigger-missing case not refused")
    # M-3 fail-closed identity tree (required at package time; no legacy fallback)
    m3_env = os.environ.copy()
    m3_r = subprocess.run(
        ["bash", "scripts/assert-m3-identity-evidence.sh", str(evid_dir)],
        capture_output=True,
        text=True,
        env=m3_env,
    )
    try:
        m3_j = json.loads(m3_r.stdout) if m3_r.stdout.strip() else {}
    except Exception:
        m3_j = {"ok": False, "raw": m3_r.stdout}
    if m3_r.returncode != 0:
        c3_errors.append(
            "M-3 fail-closed identity assertion failed: "
            + (m3_r.stderr or m3_r.stdout)[:400]
        )
    c3 = {
        "ok": len(c3_errors) == 0,
        "errors": c3_errors,
        "m3_package_bound": m3_j.get("ok"),
        "m3": m3_j,
    }
    errors.extend(c3_errors)

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
    "blob_identity": blob_identity,
    "c3": c3,
    "errors": errors,
}
print(json.dumps(out, indent=2))
if errors:
    for e in errors:
        print(f"assert-human-test-verdict FAIL: {e}", file=sys.stderr)
    sys.exit(1)
sys.exit(0)
PY

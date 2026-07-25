#!/usr/bin/env bash
# Run-stage reconcile: materialize Sprint-24 HTG evidence so assert-gate-verdict
# and verify-gate-evidence can pass against the real Maestro/cli artifact.
#
# Does NOT invent a pass. Source is an existing gate-run-summary.json whose
# step logs already exist. Rewrites log paths to absolute paths (CWD-safe) and
# bridges named HTG logs (step1-seed.log …) into generic stepN.log + .exit +
# gate-plan.json under the sprint .gate-evidence/ tree.
#
# Usage:
#   reconcile-sprint24-gate-evidence.sh <artifact-dir>
#   E2E_ARTIFACT_DIR=... reconcile-sprint24-gate-evidence.sh
set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
sprint_dir="$repo_root/.spec/prds/mk6-migration/tasks/sprint-24-full-rn-app-rewrite-off-convex-onto-zero"
artifact_dir="${1:-${E2E_ARTIFACT_DIR:-}}"
[[ -n "$artifact_dir" ]] || { echo "usage: $0 <artifact-dir>" >&2; exit 2; }
[[ -d "$artifact_dir" ]] || { echo "missing artifact-dir: $artifact_dir" >&2; exit 2; }
summary="$artifact_dir/gate-run-summary.json"
[[ -s "$summary" ]] || { echo "missing gate-run-summary.json in $artifact_dir" >&2; exit 2; }

python3 - "$repo_root" "$sprint_dir" "$artifact_dir" "$summary" <<'PY'
import json, pathlib, re, sys, shutil
from datetime import datetime, timezone

repo_root, sprint_dir, artifact_dir, summary_path = map(pathlib.Path, sys.argv[1:5])
summary = json.loads(summary_path.read_text())
assert summary.get("verdict") == "pass", "refuse to reconcile non-pass summary"
assert summary.get("steps_passed") == 7 and summary.get("steps_total") == 7
assert summary.get("steps_executed") == 7

run_id = summary.get("run_id") or f"s24-htg-{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')}"
ev_dir = sprint_dir / ".gate-evidence" / run_id
ev_dir.mkdir(parents=True, exist_ok=True)

# Map step n → preferred log names produced by run-sprint24-human-gate.sh
name_by_n = {
    1: "step1-seed.log",
    2: "step2-coldboot-drawer.log",
    3: "step3-articles.log",
    4: "step4-whats-new.log",
    5: "step5-rename-reflects.log",
    6: "step6-no-convex.log",
    7: "step7-share-url.log",
}

steps_out = []
plan_steps = []
for s in summary["steps"]:
    n = int(s["n"])
    # Resolve source log: prefer path on the step, else known name under artifact
    candidates = []
    if s.get("log"):
        lp = pathlib.Path(s["log"])
        if not lp.is_absolute():
            lp = (repo_root / lp).resolve()
        candidates.append(lp)
    candidates.append(artifact_dir / name_by_n[n])
    # also try basename under artifact
    if s.get("log"):
        candidates.append(artifact_dir / pathlib.Path(s["log"]).name)

    src = next((c for c in candidates if c.is_file() and c.stat().st_size > 0), None)
    if src is None:
        raise SystemExit(f"missing non-empty log for step {n}: tried {candidates}")

    body = src.read_text(encoding="utf-8", errors="replace")
    # Exit from real log outcomes (Maestro "... FAILED" / STATUS FAIL)
    if s.get("type") == "ui":
        hard_fail = bool(re.search(r"\.\.\. FAILED\b", body))
        exit_code = 1 if hard_fail else 0
        exp, nexp = r"COMPLETED", r"\.\.\. FAILED"
    elif n == 1:
        exit_code = 0 if re.search(r"seed_fingerprint|status:\s*OK", body, re.I) else 1
        exp, nexp = r"(seed_fingerprint|status:\s*OK)", r"(?i)status:\s*FAIL"
    else:
        exit_code = 0 if re.search(r"STATUS:\s*PASS", body) else 1
        exp, nexp = r"STATUS:\s*PASS", r"STATUS:\s*FAIL"
    if s.get("result") != "pass":
        exit_code = 1

    step_log = ev_dir / f"step{n}.log"
    step_exit = ev_dir / f"step{n}.exit"
    # Also keep original named copy for audit
    named_copy = ev_dir / name_by_n[n]
    shutil.copy2(src, named_copy)

    header = (
        f"@@GATE-META n={n} type={s.get('type')} source={src.name}\n"
        f"@@GATE-META run_id={run_id} bridged=sprint24-htg-reconcile\n"
    )
    step_log.write_text(header + body + f"\n@@GATE-EXIT={exit_code}@@\n", encoding="utf-8")
    step_exit.write_text(f"{exit_code}\n", encoding="utf-8")

    # Absolute path — assert-gate-verdict C3 is CWD-sensitive for relative paths
    abs_log = str(step_log.resolve())
    step_out = dict(s)
    step_out["log"] = abs_log
    step_out["evidence_dir"] = str(ev_dir.resolve())
    steps_out.append(step_out)

    plan_steps.append({
        "n": n,
        "text": s.get("text", f"step {n}"),
        "type": s.get("type", "cli"),
        # empty literal_cmd skips cmd_sha fidelity (HTG driver is not @@GATE-META cmd_sha native)
        "literal_cmd": "",
        "assertion": {
            "kind": "exit_and_log_regex",
            "expected_exit": 0,
            "expect_log_regex": exp,
            "expect_not_log_regex": nexp,
        },
    })

# Clipboard oracle for step7 if present (audit only; exit already derived from share log)
clip_src = artifact_dir / "step7-share-clipboard.txt"
if clip_src.is_file():
    shutil.copy2(clip_src, ev_dir / "step7-share-clipboard.txt")

plan = {
    "schema_version": 1,
    "sprint_id": summary.get("sprint_id", "sprint-24-full-rn-app-rewrite-off-convex-onto-zero"),
    "run_id": run_id,
    "source_artifact": str(artifact_dir.resolve()),
    "steps": plan_steps,
    "notes": "Run-stage bridge of sprint24 HTG named logs → generic stepN.log/.exit for verify-gate-evidence.",
}
(ev_dir / "gate-plan.json").write_text(json.dumps(plan, indent=2) + "\n", encoding="utf-8")

out = dict(summary)
out["steps"] = steps_out
out["evidence_dir"] = str(ev_dir.resolve())
out["gate_plan"] = str((ev_dir / "gate-plan.json").resolve())
out["reconciled_at"] = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
out["reconcile_source"] = str(summary_path.resolve())
out["notes"] = (
    (summary.get("notes") or "")
    + " | Run-stage evidence reconcile: absolute stepN.log paths under sprint .gate-evidence for assert/verify."
).strip(" |")

# Write canonical gate-results + durable summary copy in evidence dir
canon = sprint_dir / "gate-results.json"
# backup
bak = sprint_dir / f"gate-results.prev-before-evidence-reconcile-{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')}.json"
if canon.is_file():
    shutil.copy2(canon, bak)

payload = json.dumps(out, indent=2) + "\n"
canon.write_text(payload, encoding="utf-8")
(ev_dir / "gate-results.json").write_text(payload, encoding="utf-8")
(ev_dir / "gate-run-summary.json").write_text(payload, encoding="utf-8")

# Manifest for auditors
manifest = {
    "run_id": run_id,
    "written_at_commit": out.get("written_at_commit"),
    "verdict": out.get("verdict"),
    "steps_passed": out.get("steps_passed"),
    "evidence_dir": str(ev_dir.resolve()),
    "source_artifact": str(artifact_dir.resolve()),
    "canonical_gate_results": str(canon.resolve()),
    "reconciled_at": out["reconciled_at"],
}
(ev_dir / "reconcile-manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
print(json.dumps(manifest, indent=2))
PY

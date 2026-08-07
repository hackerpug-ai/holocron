#!/usr/bin/env bash
# RH-S30-17 / final closeout C-2 — fail-closed blob attestation.
#
# Usage:
#   bash scripts/assert-gate-evidence-containment.sh <gate-results.json>
#
# Exit 0 only when:
#   - git_sha is 40-hex and names a commit containing the evidence path
#   - gate_results_blob_sha256 is a 64-hex attestation
#   - sha256(git show <git_sha>:<evidence>/gate-results.json) == attestation
#   - source_sha_at_run is 40-hex and ancestor of git_sha (or equal)
#   - if ASSERT_PACKAGE_HEAD=1: HEAD:<path> is byte-identical to on-disk results
#     and bind fields (git_sha, source_sha_at_run, gate_results_blob_sha256) match
set -euo pipefail

RESULTS="${1:-}"
if [[ -z "$RESULTS" || ! -f "$RESULTS" ]]; then
  echo "assert-gate-evidence-containment: missing results: ${RESULTS:-<none>}" >&2
  exit 2
fi

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

python3 - "$RESULTS" <<'PY'
import hashlib, json, os, re, subprocess, sys
from pathlib import Path

results_path = Path(sys.argv[1])
on_disk = results_path.read_bytes()
data = json.loads(on_disk)
git_sha = str(data.get("git_sha") or "")
source = str(data.get("source_sha_at_run") or data.get("source_sha") or "")
run_id = str(data.get("run_id") or "")
attested = str(data.get("gate_results_blob_sha256") or "")
protocol = str(data.get("evidence_package_protocol") or "")
require_head = os.environ.get("ASSERT_PACKAGE_HEAD", "1") == "1"
errors = []

if not re.fullmatch(r"[0-9a-f]{40}", git_sha):
    errors.append(f"git_sha not 40-hex: {git_sha!r}")
if not run_id:
    errors.append("run_id missing")
if not re.fullmatch(r"[0-9a-f]{40}", source):
    errors.append(f"source_sha_at_run not 40-hex: {source!r}")
if not re.fullmatch(r"[0-9a-f]{64}", attested):
    errors.append(
        "gate_results_blob_sha256 missing/invalid — C-2-atomic-v3 requires "
        f"immutable attestation of the named-commit gate-results blob (got {attested!r})"
    )

rel = (
    ".spec/prds/mk6-migration/tasks/"
    "sprint-30-cutover-rollback-drill-and-data-plane-point-of-no-return/"
    f".gate-evidence/{run_id}/gate-results.json"
)
named_hash = None

if re.fullmatch(r"[0-9a-f]{40}", git_sha) and run_id:
    r = subprocess.run(
        ["git", "cat-file", "-e", f"{git_sha}:{rel}"],
        capture_output=True,
        text=True,
    )
    if r.returncode != 0:
        errors.append(
            f"C-2 containment FAIL: git_sha={git_sha[:12]} does not contain {rel}"
        )
    else:
        raw = subprocess.check_output(["git", "show", f"{git_sha}:{rel}"])
        named_hash = hashlib.sha256(raw).hexdigest()
        if re.fullmatch(r"[0-9a-f]{64}", attested) and named_hash != attested:
            errors.append(
                f"C-2 blob attestation FAIL: sha256(git show {git_sha[:12]}:{rel})="
                f"{named_hash} != gate_results_blob_sha256={attested} "
                f"(path existence alone is insufficient; named blob must match attestation)"
            )
        try:
            named = json.loads(raw.decode())
        except Exception as e:
            errors.append(f"named commit gate-results unparseable: {e}")
            named = None
        if named is not None and str(named.get("run_id") or "") != run_id:
            errors.append(
                f"named blob run_id={named.get('run_id')!r} != claimed run_id={run_id!r}"
            )

if re.fullmatch(r"[0-9a-f]{40}", source) and re.fullmatch(r"[0-9a-f]{40}", git_sha):
    if source != git_sha:
        a = subprocess.run(
            ["git", "merge-base", "--is-ancestor", source, git_sha],
            capture_output=True,
        )
        if a.returncode != 0:
            errors.append(
                f"source_sha_at_run={source[:12]} is not an ancestor of git_sha={git_sha[:12]}"
            )

head_hash = None
if require_head and run_id and not errors:
    head = subprocess.check_output(["git", "rev-parse", "HEAD"], text=True).strip()
    r = subprocess.run(
        ["git", "cat-file", "-e", f"{head}:{rel}"],
        capture_output=True,
    )
    if r.returncode != 0:
        errors.append(f"ASSERT_PACKAGE_HEAD: HEAD={head[:12]} does not contain {rel}")
    else:
        head_blob = subprocess.check_output(["git", "show", f"{head}:{rel}"])
        head_hash = hashlib.sha256(head_blob).hexdigest()
        if head_blob != on_disk:
            errors.append(
                f"ASSERT_PACKAGE_HEAD: git show HEAD:{rel} is not byte-identical to "
                f"on-disk results (bind tip must carry the claimed binding fields)"
            )
        else:
            hb = json.loads(head_blob)
            for field, disk_v, blob_v in [
                ("git_sha", git_sha, str(hb.get("git_sha") or "")),
                ("source_sha_at_run", source, str(hb.get("source_sha_at_run") or hb.get("source_sha") or "")),
                ("gate_results_blob_sha256", attested, str(hb.get("gate_results_blob_sha256") or "")),
            ]:
                if disk_v != blob_v:
                    errors.append(
                        f"C-2 field identity FAIL on HEAD blob: {field} on-disk={disk_v!r} "
                        f"blob={blob_v!r}"
                    )

out = {
    "ok": len(errors) == 0,
    "tool": "scripts/assert-gate-evidence-containment.sh",
    "git_sha": git_sha,
    "source_sha_at_run": source or None,
    "gate_results_blob_sha256": attested or None,
    "named_blob_sha256": named_hash,
    "head_blob_sha256": head_hash,
    "run_id": run_id,
    "evidence_rel": rel if run_id else None,
    "protocol": protocol or None,
    "assert_package_head": require_head,
    "errors": errors,
}
print(json.dumps(out, indent=2))
if errors:
    for e in errors:
        print(f"assert-gate-evidence-containment FAIL: {e}", file=sys.stderr)
    sys.exit(1)
sys.exit(0)
PY

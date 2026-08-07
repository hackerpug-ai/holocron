#!/usr/bin/env bash
# RH-S30-20 / C-2-atomic-v4 — exact blob OID identity via immutable attestation.
#
# Usage:
#   bash scripts/assert-gate-evidence-containment.sh <gate-results.json>
#
# Requires evidence-attestation.json beside the results (same evidence dir or
# under .gate-evidence/<run_id>/). Compares:
#   hist_oid = git rev-parse <package_commit>:<path>
#   sub_oid  = git hash-object -t blob <submitted>
# and requires hist_oid == sub_oid. Also verifies source_sha_at_run fields.
set -euo pipefail

RESULTS="${1:-}"
if [[ -z "$RESULTS" || ! -f "$RESULTS" ]]; then
  echo "assert-gate-evidence-containment: missing results: ${RESULTS:-<none>}" >&2
  exit 2
fi

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

python3 - "$RESULTS" <<'PY'
import json, os, re, subprocess, sys
from pathlib import Path

results_path = Path(sys.argv[1]).resolve()
on_disk = results_path.read_bytes()
data = json.loads(on_disk)
run_id = str(data.get("run_id") or "")
source = str(data.get("source_sha_at_run") or data.get("source_sha") or "")
errors = []

# Locate attestation sidecar
candidates = [
    results_path.parent / "evidence-attestation.json",
    results_path.parent / f".gate-evidence/{run_id}/evidence-attestation.json",
    Path(
        ".spec/prds/mk6-migration/tasks/"
        "sprint-30-cutover-rollback-drill-and-data-plane-point-of-no-return/"
        f".gate-evidence/{run_id}/evidence-attestation.json"
    ),
]
att_path = next((p for p in candidates if p.is_file()), None)
if att_path is None:
    errors.append(
        "C-2 attestation missing: evidence-attestation.json required "
        "(C-2-atomic-v4-blob-oid-identity)"
    )
    att = {}
else:
    att = json.loads(att_path.read_text())

protocol = str(att.get("protocol") or data.get("evidence_package_protocol") or "")
package_commit = str(att.get("package_commit") or "")
att_source = str(att.get("source_sha_at_run") or "")
artifacts = att.get("artifacts") or {}
gr = artifacts.get("gate-results.json") or {}
rel = str(
    gr.get("path")
    or (
        ".spec/prds/mk6-migration/tasks/"
        "sprint-30-cutover-rollback-drill-and-data-plane-point-of-no-return/"
        f".gate-evidence/{run_id}/gate-results.json"
    )
)
attested_oid = str(gr.get("blob_oid") or "")

if not re.fullmatch(r"[0-9a-f]{40}", package_commit):
    errors.append(f"attestation.package_commit not 40-hex: {package_commit!r}")
if not re.fullmatch(r"[0-9a-f]{40}", att_source):
    errors.append(f"attestation.source_sha_at_run not 40-hex: {att_source!r}")
if not re.fullmatch(r"[0-9a-f]{40}", attested_oid):
    errors.append(f"attestation gate-results blob_oid not 40-hex: {attested_oid!r}")
if not run_id:
    errors.append("run_id missing from submitted results")
if att.get("run_id") and str(att.get("run_id")) != run_id:
    errors.append(
        f"attestation.run_id={att.get('run_id')!r} != results.run_id={run_id!r}"
    )
if att_source and source and att_source != source:
    errors.append(
        f"attestation.source_sha_at_run={att_source[:12]} != "
        f"results.source_sha_at_run={source[:12]}"
    )

sub_oid = None
hist_oid = None
if re.fullmatch(r"[0-9a-f]{40}", package_commit) and rel:
    r = subprocess.run(
        ["git", "cat-file", "-e", f"{package_commit}:{rel}"],
        capture_output=True,
    )
    if r.returncode != 0:
        errors.append(
            f"C-2 containment FAIL: package_commit={package_commit[:12]} "
            f"does not contain {rel}"
        )
    else:
        hist_oid = subprocess.check_output(
            ["git", "rev-parse", f"{package_commit}:{rel}"], text=True
        ).strip()
        sub_oid = subprocess.check_output(
            ["git", "hash-object", "-t", "blob", str(results_path)], text=True
        ).strip()
        if hist_oid != sub_oid:
            errors.append(
                f"C-2 blob OID identity FAIL: hist_oid(git rev-parse "
                f"{package_commit[:12]}:{rel})={hist_oid} != "
                f"sub_oid(git hash-object submitted)={sub_oid} "
                f"(E1-versus-bind / historical-versus-submitted mismatch)"
            )
        if re.fullmatch(r"[0-9a-f]{40}", attested_oid) and hist_oid != attested_oid:
            errors.append(
                f"C-2 attestation OID FAIL: package blob {hist_oid} != "
                f"attestation.blob_oid {attested_oid}"
            )
        # Field identity: historical package blob must equal submitted bytes
        hist_bytes = subprocess.check_output(["git", "show", f"{package_commit}:{rel}"])
        if hist_bytes != on_disk:
            errors.append(
                "C-2 field/byte identity FAIL: named package_commit gate-results "
                "bytes differ from submitted results"
            )
        else:
            hist_j = json.loads(hist_bytes)
            for field in ("run_id", "verdict", "source_sha_at_run", "git_sha"):
                # source may be under source_sha
                def val(d, f):
                    if f == "source_sha_at_run":
                        return str(d.get("source_sha_at_run") or d.get("source_sha") or "")
                    return str(d.get(f) or "")

                if val(hist_j, field) != val(data, field):
                    errors.append(
                        f"C-2 field identity FAIL: {field} hist={val(hist_j, field)!r} "
                        f"submitted={val(data, field)!r}"
                    )

if re.fullmatch(r"[0-9a-f]{40}", att_source) and re.fullmatch(r"[0-9a-f]{40}", package_commit):
    if att_source != package_commit:
        a = subprocess.run(
            ["git", "merge-base", "--is-ancestor", att_source, package_commit],
            capture_output=True,
        )
        if a.returncode != 0:
            errors.append(
                f"source_sha_at_run={att_source[:12]} is not an ancestor of "
                f"package_commit={package_commit[:12]}"
            )

# Optional: HEAD must still carry the same gate-results blob (package tip may add attestation)
if os.environ.get("ASSERT_PACKAGE_HEAD", "1") == "1" and rel and hist_oid:
    head = subprocess.check_output(["git", "rev-parse", "HEAD"], text=True).strip()
    r = subprocess.run(["git", "cat-file", "-e", f"{head}:{rel}"], capture_output=True)
    if r.returncode != 0:
        errors.append(f"ASSERT_PACKAGE_HEAD: HEAD missing {rel}")
    else:
        head_oid = subprocess.check_output(
            ["git", "rev-parse", f"{head}:{rel}"], text=True
        ).strip()
        if head_oid != hist_oid:
            errors.append(
                f"ASSERT_PACKAGE_HEAD: HEAD gate-results oid {head_oid} != "
                f"package blob oid {hist_oid}"
            )

out = {
    "ok": len(errors) == 0,
    "tool": "scripts/assert-gate-evidence-containment.sh",
    "protocol": protocol or None,
    "package_commit": package_commit or None,
    "source_sha_at_run": att_source or source or None,
    "hist_oid": hist_oid,
    "sub_oid": sub_oid,
    "attested_blob_oid": attested_oid or None,
    "blob_identity_ok": bool(hist_oid and sub_oid and hist_oid == sub_oid and not errors),
    "attestation_path": str(att_path) if att_path else None,
    "run_id": run_id,
    "errors": errors,
}
print(json.dumps(out, indent=2))
if errors:
    for e in errors:
        print(f"assert-gate-evidence-containment FAIL: {e}", file=sys.stderr)
    sys.exit(1)
sys.exit(0)
PY

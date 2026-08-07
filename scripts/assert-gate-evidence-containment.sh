#!/usr/bin/env bash
# RH-S30-20 residual / C-2-atomic-v5 — Git-bound attestation lock + exact blob OID.
#
# Usage:
#   bash scripts/assert-gate-evidence-containment.sh <gate-results.json>
#
# 1. Resolve evidence-attestation.lock.json from Git (HEAD by default).
# 2. Verify lock blob OID matches git hash-object of worktree lock (if present).
# 3. Load attestation bytes ONLY via git show <attestation_commit>:<path>.
# 4. Verify attestation_blob_oid matches that object.
# 5. Require protocol/run_id/source/package_commit/artifacts present.
# 6. hist_oid == sub_oid for package_commit gate-results vs submitted file.
set -euo pipefail

RESULTS="${1:-}"
if [[ -z "$RESULTS" || ! -f "$RESULTS" ]]; then
  echo "assert-gate-evidence-containment: missing results: ${RESULTS:-<none>}" >&2
  exit 2
fi

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# Allow fixture repos via GIT_DIR/GIT_WORK_TREE (v5 negative control).
if [[ -z "${GIT_DIR:-}" ]]; then
  cd "$ROOT"
fi

python3 - "$RESULTS" <<'PY'
import json, os, re, subprocess, sys
from pathlib import Path

results_path = Path(sys.argv[1]).resolve()
on_disk = results_path.read_bytes()
data = json.loads(on_disk)
run_id = str(data.get("run_id") or "")
source = str(data.get("source_sha_at_run") or data.get("source_sha") or "")
errors = []
HEX40 = re.compile(r"^[0-9a-f]{40}$")
REQUIRED_PROTOCOL = "C-2-atomic-v5-git-bound-attestation"

rel_lock = (
    ".spec/prds/mk6-migration/tasks/"
    "sprint-30-cutover-rollback-drill-and-data-plane-point-of-no-return/"
    f".gate-evidence/{run_id}/evidence-attestation.lock.json"
)
rel_results = (
    ".spec/prds/mk6-migration/tasks/"
    "sprint-30-cutover-rollback-drill-and-data-plane-point-of-no-return/"
    f".gate-evidence/{run_id}/gate-results.json"
)

if not run_id:
    errors.append("run_id missing from submitted results")
if not HEX40.fullmatch(source):
    errors.append(f"results.source_sha_at_run not 40-hex: {source!r}")

head = subprocess.check_output(["git", "rev-parse", "HEAD"], text=True).strip()
require_head = os.environ.get("ASSERT_PACKAGE_HEAD", "1") == "1"
# Test-only fixture may set ASSERT_LOCK_COMMIT; production/package path requires HEAD.
lock_commit = os.environ.get("ASSERT_LOCK_COMMIT", head).strip()
if require_head and lock_commit != head:
    errors.append(
        f"ASSERT_PACKAGE_HEAD requires lock_commit==HEAD; got lock_commit={lock_commit[:12]} "
        f"HEAD={head[:12]} (refuse non-HEAD lock selection)"
    )
    lock_commit = head

lock = None
lock_oid = None
att = None
att_oid = None
hist_oid = None
sub_oid = None

if not errors:
    r = subprocess.run(["git", "cat-file", "-e", f"{lock_commit}:{rel_lock}"], capture_output=True)
    if r.returncode != 0:
        errors.append(
            f"C-2 lock missing in Git: {lock_commit[:12]}:{rel_lock} "
            f"(attestation must be Git-object-bound via evidence-attestation.lock.json)"
        )
    else:
        lock_bytes = subprocess.check_output(["git", "show", f"{lock_commit}:{rel_lock}"])
        lock_oid = subprocess.check_output(
            ["git", "rev-parse", f"{lock_commit}:{rel_lock}"], text=True
        ).strip()
        # Worktree lock, if present, must match Git bytes (no silent substitution)
        wt_lock = results_path.parent / "evidence-attestation.lock.json"
        if not wt_lock.is_file():
            wt_lock = Path(rel_lock)
        if wt_lock.is_file():
            wt_oid = subprocess.check_output(
                ["git", "hash-object", "-t", "blob", str(wt_lock)], text=True
            ).strip()
            if wt_oid != lock_oid:
                errors.append(
                    f"C-2 lock worktree/Git mismatch: worktree_oid={wt_oid} git_oid={lock_oid}"
                )
        try:
            lock = json.loads(lock_bytes.decode())
        except Exception as e:
            errors.append(f"lock JSON unparseable from Git: {e}")
            lock = None

if lock is not None:
    for field in (
        "protocol",
        "run_id",
        "source_sha_at_run",
        "package_commit",
        "attestation_commit",
        "attestation_path",
        "attestation_blob_oid",
    ):
        if not lock.get(field):
            errors.append(f"lock missing required field {field}")
    if lock.get("protocol") != REQUIRED_PROTOCOL and not str(lock.get("protocol") or "").startswith(
        "C-2-atomic-v5"
    ):
        errors.append(f"lock.protocol unsupported: {lock.get('protocol')!r}")
    if str(lock.get("run_id") or "") != run_id:
        errors.append(f"lock.run_id={lock.get('run_id')!r} != results.run_id={run_id!r}")
    if str(lock.get("source_sha_at_run") or "") != source:
        errors.append("lock.source_sha_at_run != results.source_sha_at_run")

    att_commit = str(lock.get("attestation_commit") or "")
    att_path = str(lock.get("attestation_path") or "")
    att_blob = str(lock.get("attestation_blob_oid") or "")
    if HEX40.fullmatch(att_commit) and att_path:
        r = subprocess.run(["git", "cat-file", "-e", f"{att_commit}:{att_path}"], capture_output=True)
        if r.returncode != 0:
            errors.append(f"attestation missing at {att_commit[:12]}:{att_path}")
        else:
            att_bytes = subprocess.check_output(["git", "show", f"{att_commit}:{att_path}"])
            att_oid = subprocess.check_output(
                ["git", "rev-parse", f"{att_commit}:{att_path}"], text=True
            ).strip()
            if att_oid != att_blob:
                errors.append(
                    f"C-2 attestation OID FAIL: git {att_oid} != lock.attestation_blob_oid {att_blob}"
                )
            try:
                att = json.loads(att_bytes.decode())
            except Exception as e:
                errors.append(f"attestation JSON unparseable from Git: {e}")
                att = None
    else:
        errors.append("lock.attestation_commit/path invalid")

if att is not None:
    for field in ("protocol", "run_id", "source_sha_at_run", "package_commit", "artifacts"):
        if field not in att or att.get(field) in (None, "", {}):
            errors.append(f"attestation missing required field {field}")
    if str(att.get("run_id") or "") != run_id:
        errors.append("attestation.run_id mismatch")
    if str(att.get("source_sha_at_run") or "") != source:
        errors.append("attestation.source_sha_at_run mismatch vs results")
    if str(att.get("package_commit") or "") != str(lock.get("package_commit") or ""):
        errors.append("attestation.package_commit != lock.package_commit")
    package_commit = str(att.get("package_commit") or "")
    gr = (att.get("artifacts") or {}).get("gate-results.json") or {}
    rel = str(gr.get("path") or rel_results)
    attested_oid = str(gr.get("blob_oid") or "")
    if not HEX40.fullmatch(package_commit):
        errors.append(f"attestation.package_commit not 40-hex: {package_commit!r}")
    if not HEX40.fullmatch(attested_oid):
        errors.append(f"attestation gate-results blob_oid not 40-hex: {attested_oid!r}")
    if HEX40.fullmatch(package_commit) and rel:
        r = subprocess.run(["git", "cat-file", "-e", f"{package_commit}:{rel}"], capture_output=True)
        if r.returncode != 0:
            errors.append(f"package_commit missing {rel}")
        else:
            hist_oid = subprocess.check_output(
                ["git", "rev-parse", f"{package_commit}:{rel}"], text=True
            ).strip()
            sub_oid = subprocess.check_output(
                ["git", "hash-object", "-t", "blob", str(results_path)], text=True
            ).strip()
            if hist_oid != sub_oid:
                errors.append(
                    f"C-2 blob OID identity FAIL: hist_oid={hist_oid} sub_oid={sub_oid}"
                )
            if hist_oid != attested_oid:
                errors.append(
                    f"C-2 attested OID FAIL: hist_oid={hist_oid} != attestation {attested_oid}"
                )
            hist_bytes = subprocess.check_output(["git", "show", f"{package_commit}:{rel}"])
            if hist_bytes != on_disk:
                errors.append("C-2 byte identity FAIL: package gate-results != submitted")
            else:
                hist_j = json.loads(hist_bytes)
                for field in ("run_id", "verdict", "git_sha"):
                    if str(hist_j.get(field) or "") != str(data.get(field) or ""):
                        errors.append(f"field mismatch {field}")
                hs = str(hist_j.get("source_sha_at_run") or hist_j.get("source_sha") or "")
                if hs != source:
                    errors.append("field mismatch source_sha_at_run")
            # source ancestor of package
            if HEX40.fullmatch(source) and source != package_commit:
                a = subprocess.run(
                    ["git", "merge-base", "--is-ancestor", source, package_commit],
                    capture_output=True,
                )
                if a.returncode != 0:
                    errors.append("source_sha_at_run not ancestor of package_commit")

# ASSERT_PACKAGE_HEAD: lock loaded must be HEAD's lock blob (not a foreign commit)
if require_head and not errors and lock_oid:
    r = subprocess.run(["git", "cat-file", "-e", f"{head}:{rel_lock}"], capture_output=True)
    if r.returncode != 0:
        errors.append("ASSERT_PACKAGE_HEAD: HEAD missing attestation lock")
    else:
        head_lock_oid = subprocess.check_output(
            ["git", "rev-parse", f"{head}:{rel_lock}"], text=True
        ).strip()
        if head_lock_oid != lock_oid:
            errors.append(
                f"ASSERT_PACKAGE_HEAD: HEAD lock oid {head_lock_oid} != loaded lock_oid {lock_oid}"
            )
    if hist_oid:
        r = subprocess.run(["git", "cat-file", "-e", f"{head}:{rel_results}"], capture_output=True)
        if r.returncode != 0:
            errors.append("ASSERT_PACKAGE_HEAD: HEAD missing gate-results")
        else:
            head_oid = subprocess.check_output(
                ["git", "rev-parse", f"{head}:{rel_results}"], text=True
            ).strip()
            if head_oid != hist_oid:
                errors.append("ASSERT_PACKAGE_HEAD: HEAD gate-results oid drift")

# C-3 artifact OIDs bound in attestation (when present)
if att is not None and not errors:
    package_commit = str(att.get("package_commit") or "")
    for key, meta in (att.get("artifacts") or {}).items():
        if not str(key).startswith("c3-"):
            continue
        rel = str(meta.get("path") or "")
        want = str(meta.get("blob_oid") or "")
        if not rel or not HEX40.fullmatch(want):
            errors.append(f"C-3 artifact {key} missing path/blob_oid")
            continue
        r = subprocess.run(["git", "cat-file", "-e", f"{package_commit}:{rel}"], capture_output=True)
        if r.returncode != 0:
            errors.append(f"C-3 artifact missing in package: {rel}")
            continue
        got = subprocess.check_output(
            ["git", "rev-parse", f"{package_commit}:{rel}"], text=True
        ).strip()
        if got != want:
            errors.append(f"C-3 artifact OID mismatch {key}: package={got} att={want}")

out = {
    "ok": len(errors) == 0,
    "tool": "scripts/assert-gate-evidence-containment.sh",
    "protocol": REQUIRED_PROTOCOL,
    "lock_commit": lock_commit,
    "lock_oid": lock_oid,
    "attestation_commit": (lock or {}).get("attestation_commit") if lock else None,
    "attestation_blob_oid": att_oid,
    "package_commit": (att or {}).get("package_commit") if att else None,
    "hist_oid": hist_oid,
    "sub_oid": sub_oid,
    "blob_identity_ok": bool(hist_oid and sub_oid and hist_oid == sub_oid and not errors),
    "attestation_git_bound": bool(att is not None and lock is not None and not errors),
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

#!/usr/bin/env bash
# GATE-FIX-S28R3-QA26 — production read-only D05-04 bundle consumer.
#
# Validates a committed fire-drill bundle WITHOUT creating, copying, or
# rewriting any file under the bundle it judges. Open / stat / hash only.
#
# Usage:
#   bash scripts/consume-d05-04-bundle.sh <bundle-dir>
#   BUNDLE_DIR=... bash scripts/consume-d05-04-bundle.sh
#
# Exit 0 only when:
#   - parity-report.json, attestation.json, SUMMARY.json (and optional
#     oracle-manifest.json) are present and readable
#   - POSTGRES/BLOB/LEDGER parity flags are true and consistent with counts
#   - non-zero pre/restored row totals match
#   - 11 pre/restored object identities present and agree with blob_parity
#   - blob_parity.ok/equal and counts agree with matched_objects
#   - if oracle-manifest.json present: recomputed sha256 of linked files match
set -euo pipefail

BUNDLE="${1:-${BUNDLE_DIR:-}}"
if [[ -z "$BUNDLE" ]]; then
  echo "error: consume-d05-04-bundle requires bundle dir (arg1 or BUNDLE_DIR)" >&2
  exit 2
fi
if [[ ! -d "$BUNDLE" ]]; then
  echo "error: bundle dir missing: $BUNDLE" >&2
  exit 2
fi

# Refuse write attempts by dropping umask to read-only open discipline in Python.
/usr/bin/env -i PATH=/usr/bin:/bin HOME=/tmp LC_ALL=C \
  /usr/bin/python3 -E -s - "$BUNDLE" <<'PY'
import hashlib, json, os, sys

bundle = sys.argv[1]
errors = []

def ro_open(path: str):
    """Open for read only; never create."""
    fd = os.open(path, os.O_RDONLY)
    try:
        return os.fdopen(fd, "r", encoding="utf-8", errors="strict")
    except Exception:
        os.close(fd)
        raise

def sha256_file(path: str) -> str:
    h = hashlib.sha256()
    fd = os.open(path, os.O_RDONLY)
    try:
        with os.fdopen(fd, "rb") as f:
            for chunk in iter(lambda: f.read(1024 * 1024), b""):
                h.update(chunk)
    except Exception:
        try:
            os.close(fd)
        except Exception:
            pass
        raise
    return h.hexdigest()

def load_json(rel: str):
    path = os.path.join(bundle, rel)
    if not os.path.isfile(path):
        errors.append(f"missing required file: {rel}")
        return None
    try:
        with ro_open(path) as f:
            return json.load(f)
    except Exception as e:
        errors.append(f"unreadable/invalid JSON {rel}: {e}")
        return None

parity = load_json("parity-report.json")
attest = load_json("attestation.json")
summary = load_json("SUMMARY.json")
manifest = None
man_path = os.path.join(bundle, "oracle-manifest.json")
if os.path.isfile(man_path):
    try:
        with ro_open(man_path) as f:
            manifest = json.load(f)
    except Exception as e:
        errors.append(f"oracle-manifest.json unreadable: {e}")

if parity is None or attest is None or summary is None:
    for e in errors:
        print(f"FAIL: {e}", file=sys.stderr)
    sys.exit(2)

# --- Attestation / summary must agree with success ---
if not (attest.get("ok") is True or attest.get("fire_drill_exit") == 0 or attest.get("exit_code") == 0):
    errors.append("attestation not ok / fire_drill_exit!=0")
if summary.get("ok") is not True:
    errors.append("SUMMARY.ok is not true")

# --- Parity flags ---
for flag in ("POSTGRES_PARITY_PASS", "BLOB_PARITY_PASS", "LEDGER_CHECKSUM_MATCH"):
    if parity.get(flag) is not True:
        errors.append(f"parity.{flag} is not true")
    if summary.get(flag) is not True and summary.get(flag) is not None:
        # SUMMARY may omit flags; when present must agree
        if summary.get(flag) is not True:
            errors.append(f"SUMMARY.{flag} disagrees with parity")

if parity.get("ok") is not True and parity.get("exitCode", 1) != 0:
    errors.append("parity ok/exitCode not success")
if parity.get("baseline_loaded") is not True:
    errors.append("baseline_loaded is not true")
if not parity.get("baseline_id") and not parity.get("baseline_key"):
    errors.append("baseline_id/key missing")

# --- Row counts: non-zero pre + restored, consistent ---
pre_rows = parity.get("pre_failure_row_counts") or {}
rest_rows = parity.get("restored_row_counts") or parity.get("row_counts") or {}
if not isinstance(pre_rows, dict) or not isinstance(rest_rows, dict):
    errors.append("row count maps missing")
    pre_total = rest_total = 0
else:
    pre_total = sum(int(v or 0) for v in pre_rows.values())
    rest_total = sum(int(v or 0) for v in rest_rows.values())
if pre_total <= 0:
    errors.append(f"pre_failure row total non-positive: {pre_total}")
if rest_total <= 0:
    errors.append(f"restored row total non-positive: {rest_total}")
if pre_total != rest_total:
    errors.append(f"pre/restored row total mismatch: {pre_total} != {rest_total}")
mismatches = parity.get("row_count_mismatches") or []
if mismatches:
    errors.append(f"row_count_mismatches non-empty: {len(mismatches)}")

# --- Blob object identities: require 11 pre + 11 restored, consistent ---
matched = int(parity.get("matched_objects") or 0)
pre_blobs = int(parity.get("pre_failure_blob_objects") or 0)
rest_blobs = int(parity.get("restored_blob_objects") or 0)
if matched != 11:
    errors.append(f"matched_objects={matched} want 11")
if pre_blobs != 11:
    errors.append(f"pre_failure_blob_objects={pre_blobs} want 11")
if rest_blobs != 11:
    errors.append(f"restored_blob_objects={rest_blobs} want 11")
if pre_blobs != rest_blobs or pre_blobs != matched:
    errors.append(
        f"blob counts inconsistent: pre={pre_blobs} restored={rest_blobs} matched={matched}"
    )

exp_ids = parity.get("expected_object_identities") or parity.get("pre_object_identities") or []
rest_ids = parity.get("restored_object_identities") or []
if not isinstance(exp_ids, list) or not isinstance(rest_ids, list):
    errors.append("object identity lists missing or wrong type")
    exp_ids, rest_ids = [], []
if len(exp_ids) != 11:
    errors.append(f"expected_object_identities len={len(exp_ids)} want 11")
if len(rest_ids) != 11:
    errors.append(f"restored_object_identities len={len(rest_ids)} want 11")

def is_sha256(x) -> bool:
    return isinstance(x, str) and len(x) == 64 and all(c in "0123456789abcdef" for c in x.lower())

for i, d in enumerate(exp_ids):
    if not is_sha256(d):
        errors.append(f"expected_object_identities[{i}] not 64-hex")
        break
for i, d in enumerate(rest_ids):
    if not is_sha256(d):
        errors.append(f"restored_object_identities[{i}] not 64-hex")
        break
if exp_ids and rest_ids and sorted(exp_ids) != sorted(rest_ids):
    errors.append("expected vs restored object identity sets disagree")

# --- blob_parity must agree with identities/flags ---
bp = parity.get("blob_parity")
if bp is None:
    errors.append("blob_parity is null while BLOB_PARITY_PASS claims true")
elif not isinstance(bp, dict):
    errors.append("blob_parity is not an object")
else:
    if bp.get("ok") is not True or bp.get("equal") is not True:
        errors.append(f"blob_parity.ok/equal not true: {bp}")
    lc = int(bp.get("localCount") or 0)
    rc = int(bp.get("remoteCount") or 0)
    if lc != 11 or rc != 11:
        errors.append(f"blob_parity counts local={lc} remote={rc} want 11")
    if bp.get("missingRemote") not in (None, [], ()):
        if bp.get("missingRemote"):
            errors.append("blob_parity.missingRemote non-empty")
    if bp.get("extraRemote") not in (None, [], ()):
        if bp.get("extraRemote"):
            errors.append("blob_parity.extraRemote non-empty")

# SUMMARY matched_objects when present
if "matched_objects" in summary and int(summary.get("matched_objects") or 0) != 11:
    errors.append("SUMMARY.matched_objects != 11")

# --- Optional oracle-manifest: recompute hashes read-only ---
if manifest is not None:
    files = manifest.get("files") or {}
    if not isinstance(files, dict) or not files:
        errors.append("oracle-manifest.files empty")
    for rel, meta in files.items():
        path = os.path.join(bundle, rel)
        if not os.path.isfile(path):
            errors.append(f"manifest linked file missing: {rel}")
            continue
        try:
            got = sha256_file(path)
        except Exception as e:
            errors.append(f"hash failed for {rel}: {e}")
            continue
        want = (meta or {}).get("sha256") if isinstance(meta, dict) else None
        if not want or got != want:
            errors.append(f"manifest hash mismatch for {rel}")
        if isinstance(meta, dict) and "bytes" in meta:
            try:
                st = os.stat(path)
                if int(meta["bytes"]) != int(st.st_size):
                    errors.append(f"manifest bytes mismatch for {rel}")
            except OSError as e:
                errors.append(f"stat failed for {rel}: {e}")

if errors:
    for e in errors:
        print(f"FAIL: {e}", file=sys.stderr)
    sys.exit(2)

print(
    "PASS: D05-04 read-only consumer ok "
    f"rows={rest_total} matched={matched} "
    f"identities={len(rest_ids)} baseline={parity.get('baseline_id')}"
)
sys.exit(0)
PY

#!/usr/bin/env bash
# D08-03 / CAP-CUT-01 — Fail-closed validator for deletion-gate.json (AC-4).
#
# Usage:
#   bash scripts/assert-s32-d08-03-deletion-gate.sh [path/to/deletion-gate.json]
#   ARTIFACT=... bash scripts/assert-s32-d08-03-deletion-gate.sh
#
# Exit 0 only when schema, status, deletion_eligible, convex_deletion_performed,
# all-check pass, nonempty evidence_manifest, 64-hex digests, and secret-free body hold.
set -euo pipefail

_SCRIPT_DIR="${BASH_SOURCE[0]%/*}"
[[ "$_SCRIPT_DIR" == "${BASH_SOURCE[0]}" ]] && _SCRIPT_DIR="."
ROOT="$(cd "$_SCRIPT_DIR/.." && pwd)"
cd "$ROOT"

DEFAULT_ART="$ROOT/.spec/prds/mk6-migration/tasks/sprint-32-convex-decommission-code-deps-and-cloud-deletion/evidence/D08-03/deletion-gate.json"
ART="${1:-${ARTIFACT:-${DELETION_GATE_ARTIFACT:-$DEFAULT_ART}}}"

if [[ -z "$ART" || ! -s "$ART" ]]; then
  echo "error: deletion-gate artifact missing or empty: ${ART:-<unset>}" >&2
  exit 2
fi

# Refuse deletion receipt next to a claimed pre-deletion gate (path derived when GATE_RUN_ID set).
if [[ -n "${GATE_RUN_ID:-}" ]]; then
  receipt="$ROOT/.tmp/REDHAT-FIX-S32-D08-03/${GATE_RUN_ID}/convex-deletion-receipt.json"
  if [[ -e "$receipt" ]]; then
    echo "error: refuse pass while convex-deletion-receipt exists: $receipt" >&2
    exit 1
  fi
fi

/usr/bin/python3 -E -s - "$ART" <<'PY'
import hashlib, json, os, re, sys

path = sys.argv[1]
try:
    raw = open(path, "rb").read()
except OSError as e:
    print(f"error: unreadable artifact: {e}", file=sys.stderr)
    sys.exit(2)

if not raw.strip():
    print("error: empty artifact", file=sys.stderr)
    sys.exit(2)

# Secret-bearing name denylist (values never expected in gate JSON).
SECRET_NAME_RE = re.compile(
    r"(?i)(password|secret|api[_-]?key|access_key|session_token|auth_token|private_key|bearer\s+[A-Za-z0-9._\-]{12,})"
)
# High-entropy credential-shaped tokens (AWS-like keys, long hex blobs that look like secrets).
# Digests are 64 hex and allowed only under evidence_manifest[].sha256 / known digest fields.
text = raw.decode("utf-8", errors="replace")
if SECRET_NAME_RE.search(text):
    # Allow schema field names that mention "secret_scan" metadata only.
    for m in SECRET_NAME_RE.finditer(text):
        window = text[max(0, m.start() - 40) : m.end() + 40]
        if "secret_scan" in window or "secret_free" in window:
            continue
        print(f"error: secret-bearing pattern in artifact near: {window!r}", file=sys.stderr)
        sys.exit(1)

try:
    data = json.loads(raw)
except json.JSONDecodeError as e:
    print(f"error: invalid JSON: {e}", file=sys.stderr)
    sys.exit(2)

errors = []

def req(cond: bool, msg: str) -> None:
    if not cond:
        errors.append(msg)

req(data.get("schema") == "holo.decommission.deletion-gate.v1", "schema must be holo.decommission.deletion-gate.v1")
req(data.get("status") == "pass", "status must be pass")
req(data.get("deletion_eligible") is True, "deletion_eligible must be true")
req(data.get("convex_deletion_performed") is False, "convex_deletion_performed must be false")

checks = data.get("checks")
req(isinstance(checks, list) and len(checks) > 0, "checks must be a non-empty array")
if isinstance(checks, list):
    for i, c in enumerate(checks):
        if not isinstance(c, dict):
            errors.append(f"checks[{i}] must be object")
            continue
        if c.get("status") != "pass":
            errors.append(f"checks[{i}].status must be pass (got {c.get('status')!r} id={c.get('id')!r})")
        if not isinstance(c.get("id"), str) or not c["id"].strip():
            errors.append(f"checks[{i}].id required")

manifest = data.get("evidence_manifest")
req(isinstance(manifest, list) and len(manifest) > 0, "evidence_manifest must be non-empty")

HEX64 = re.compile(r"^[0-9a-f]{64}$")
if isinstance(manifest, list):
    for i, ent in enumerate(manifest):
        if not isinstance(ent, dict):
            errors.append(f"evidence_manifest[{i}] must be object")
            continue
        p = ent.get("path")
        d = ent.get("sha256")
        if not isinstance(p, str) or not p.strip():
            errors.append(f"evidence_manifest[{i}].path required")
        if not isinstance(d, str) or not HEX64.match(d):
            errors.append(f"evidence_manifest[{i}].sha256 must be 64-hex")
        # Recompute when path exists relative to cwd or absolute.
        if isinstance(p, str) and p.strip():
            cand = p if os.path.isabs(p) else os.path.join(os.getcwd(), p)
            if os.path.isfile(cand):
                h = hashlib.sha256()
                with open(cand, "rb") as f:
                    for chunk in iter(lambda: f.read(1024 * 1024), b""):
                        h.update(chunk)
                got = h.hexdigest()
                if isinstance(d, str) and d != got:
                    errors.append(
                        f"evidence_manifest[{i}] digest mismatch for {p}: artifact={d} recomputed={got}"
                    )

req(data.get("convex_deletion_performed") is not True, "convex_deletion_performed must not be true")

if errors:
    for e in errors:
        print(f"error: {e}", file=sys.stderr)
    sys.exit(1)

print(f"assert-s32-d08-03-deletion-gate: PASS {path}")
sys.exit(0)
PY

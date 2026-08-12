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

# Fail closed on soft-pass / substitute markers in observations, gate body,
# and hash-bound evidence files referenced by the manifest.
soft_needles = (
    "environment_unavailable",
    "environment_unavailable_zero_schema",
    "enforced_postgres_fk_sql",
    "ALLOW_MAESTRO_ENV_SKIP",
    # Only the true-path token is a soft-pass (not the field name alone).
    '"sql_fallback": true',
    "SQL write/read fallback",
    "classified=environment_unavailable",
)
if data.get("status") == "pass":
    for needle in soft_needles:
        if needle in text:
            errors.append(f"soft-pass marker in pass artifact: {needle!r}")

    # Scan manifest evidence (ac3-maestro, ac3-summary, fk-audit, http proof)
    if isinstance(manifest, list):
        for ent in manifest:
            if not isinstance(ent, dict):
                continue
            ep = ent.get("path")
            if not isinstance(ep, str) or not ep.strip():
                continue
            base = os.path.basename(ep)
            if base not in (
                "ac3-maestro.txt",
                "ac3-summary.json",
                "ac3-http-mcp-proof.json",
                "fk-audit.json",
                "ac2-summary.json",
            ):
                continue
            cand = ep if os.path.isabs(ep) else os.path.join(os.getcwd(), ep)
            if not os.path.isfile(cand):
                # also try relative to artifact dir
                art_dir = os.path.dirname(os.path.abspath(path))
                cand2 = os.path.join(art_dir, ep)
                cand = cand2 if os.path.isfile(cand2) else cand
            if not os.path.isfile(cand):
                continue
            try:
                body = open(cand, "r", encoding="utf-8", errors="replace").read()
            except OSError:
                continue
            for needle in soft_needles:
                if needle in body:
                    errors.append(f"soft-pass marker in evidence {base}: {needle!r}")
            if base == "fk-audit.json":
                try:
                    fj = json.loads(body)
                except json.JSONDecodeError:
                    errors.append("fk-audit.json is not valid JSON")
                else:
                    if fj.get("mode") == "enforced_postgres_fk_sql":
                        errors.append("fk-audit.json mode=enforced_postgres_fk_sql (substitute refused)")
                    if fj.get("ok") is not True:
                        errors.append("fk-audit.json ok is not true")
                    if (fj.get("orphans") or 0) != 0:
                        errors.append(f"fk-audit.json orphans={fj.get('orphans')}")
                    if len(fj.get("unenforcedEdges") or []) != 0:
                        errors.append(
                            f"fk-audit.json unenforcedEdges length={len(fj.get('unenforcedEdges') or [])}"
                        )
            if base == "ac3-summary.json":
                try:
                    sj = json.loads(body)
                except json.JSONDecodeError:
                    errors.append("ac3-summary.json is not valid JSON")
                else:
                    if sj.get("maestro_exit_code") not in (0, "0"):
                        errors.append(
                            f"ac3-summary maestro_exit_code={sj.get('maestro_exit_code')} (must be 0)"
                        )
                    mm = str(sj.get("maestro_mode") or "")
                    if "environment_unavailable" in mm:
                        errors.append(f"ac3-summary maestro_mode soft-pass: {mm!r}")
                    if sj.get("http_mcp_mode") not in (None, "http_tools_call"):
                        # require honest mode when field present; prefer required
                        if sj.get("http_mcp_mode") != "http_tools_call":
                            errors.append(
                                f"ac3-summary http_mcp_mode={sj.get('http_mcp_mode')!r}"
                            )
            if base == "ac3-http-mcp-proof.json":
                try:
                    hj = json.loads(body)
                except json.JSONDecodeError:
                    errors.append("ac3-http-mcp-proof.json is not valid JSON")
                else:
                    if hj.get("sql_fallback") is True:
                        errors.append("http mcp used sql_fallback=true")
                    if hj.get("mode") and hj.get("mode") != "http_tools_call":
                        errors.append(f"http mcp mode={hj.get('mode')!r}")
                    if hj.get("ok") is not True:
                        errors.append("http mcp proof ok is not true")
            if base == "ac3-maestro.txt":
                # Real maestro non-zero in log while gate claims pass
                import re as _re
                m = _re.search(r"maestro_exit_code=(\d+)", body)
                if m and int(m.group(1)) != 0:
                    errors.append(
                        f"ac3-maestro.txt records maestro_exit_code={m.group(1)} while gate is pass"
                    )

# Structural soft-pass checks on AC observations
if isinstance(checks, list) and data.get("status") == "pass":
    for c in checks:
        if not isinstance(c, dict):
            continue
        obs = c.get("observations") or {}
        if not isinstance(obs, dict):
            continue
        cid = c.get("id")
        if cid == "AC-3":
            mrc = obs.get("maestro_exit_code")
            if mrc not in (0, "0", None):
                errors.append(f"AC-3 maestro_exit_code must be 0 on pass (got {mrc!r})")
            mm = str(obs.get("maestro_mode") or "")
            if "environment_unavailable" in mm:
                errors.append(f"AC-3 maestro_mode soft-pass: {mm!r}")
            hm = str(obs.get("http_mcp_mode") or "")
            if hm and hm != "http_tools_call":
                errors.append(f"AC-3 http_mcp_mode must be http_tools_call (got {hm!r})")
            if obs.get("http_mcp_ok") is False:
                errors.append("AC-3 http_mcp_ok is false")
        if cid == "AC-2":
            fm = str(obs.get("fk_audit_mode") or "")
            if fm in ("enforced_postgres_fk_sql", "substitute", "enforced_only"):
                errors.append(f"AC-2 fk_audit_mode substitute refused: {fm!r}")
            un = obs.get("unenforcedEdges")
            if un is not None and un != 0:
                errors.append(f"AC-2 unenforcedEdges must be 0 on pass (got {un!r})")
            orphans = obs.get("orphans")
            if orphans is not None and orphans != 0:
                errors.append(f"AC-2 orphans must be 0 on pass (got {orphans!r})")

if errors:
    for e in errors:
        print(f"error: {e}", file=sys.stderr)
    sys.exit(1)

print(f"assert-s32-d08-03-deletion-gate: PASS {path}")
sys.exit(0)
PY

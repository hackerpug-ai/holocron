#!/usr/bin/env bash
# GATE-FIX-S28R3-QA10 — deterministic prove-r2-readonly stand-in for unit tests.
# Enforces the same credential-tuple fail-closed rules and writes a fresh attestation
# without calling live R2. Never logs credential values.
set -euo pipefail

AK="${R2_RESTORE_ACCESS_KEY_ID:-${R2_ACCESS_KEY_ID:-}}"
SK="${R2_RESTORE_SECRET_ACCESS_KEY:-${R2_SECRET_ACCESS_KEY:-}}"
ST="${R2_RESTORE_SESSION_TOKEN:-}"
WAK="${R2_ACCESS_KEY_ID:-}"
WSK="${R2_SECRET_ACCESS_KEY:-}"
# When restore is explicit, writer is ambient R2_ACCESS_* only if restore keys also set.
if [[ -n "${R2_RESTORE_ACCESS_KEY_ID:-}" && -n "${R2_ACCESS_KEY_ID:-}" ]]; then
  WAK="${R2_ACCESS_KEY_ID}"
  WSK="${R2_SECRET_ACCESS_KEY:-}"
fi

is_placeholder() {
  local v="${1:-}"
  case "$v" in
    ''|ro-test|ro-test-*|*ro-test*|*placeholder*|*replace-me*|*example*|*not-for-prod*|*test-key*|*test-secret*)
      return 0 ;;
  esac
  return 1
}

if is_placeholder "$AK" || is_placeholder "$SK"; then
  echo "FAIL: placeholder restore credentials" >&2
  echo "RESIDUAL: DEPENDENCY-S28-R2-RO" >&2
  exit 1
fi
if [[ -n "$WSK" && "$SK" == "$WSK" ]]; then
  echo "FAIL: writer-equivalent credential tuple (restore secret equals writer secret)" >&2
  echo "RESIDUAL: DEPENDENCY-S28-R2-RO" >&2
  exit 1
fi
if [[ -n "$WAK" && "$AK" == "$WAK" ]]; then
  if [[ -z "$WSK" ]]; then
    echo "FAIL: GATE-FIX-S28R3-QA9 same parent Access Key ID without authoritative writer secret (cannot establish distinct restore secret)" >&2
    echo "RESIDUAL: DEPENDENCY-S28-R2-RO" >&2
    exit 1
  fi
  if [[ -z "$ST" ]]; then
    echo "FAIL: incomplete Cloudflare temporary credential tuple (same parent Access Key ID without session token)" >&2
    echo "RESIDUAL: DEPENDENCY-S28-R2-RO" >&2
    exit 1
  fi
fi

# Simulated live oracle (unit-only).
echo "PASS: aws s3 ls (stub List allowed)"
echo "PASS: aws s3 cp denied (stub Put blocked)"
echo "PASS: aws s3api delete-object denied (stub Delete blocked)"

OUT="${HOLO_R2_RO_PROOF_OUT:-}"
if [[ -n "$OUT" ]]; then
  FP="$(printf '%s\0%s\0%s' "$AK" "$SK" "$ST" | openssl dgst -sha256 2>/dev/null | awk '{print $NF}' | cut -c1-16)"
  mkdir -p "$(dirname "$OUT")"
  python3 - "$OUT" "$FP" <<'PY'
import json, os, sys
from datetime import datetime, timezone
out, fp = sys.argv[1], sys.argv[2]
payload = {
  "schema": "holo.r2-ro-proof.v1",
  "ok": True,
  "tuple_fp16": fp,
  "list_allowed": True,
  "put_denied": True,
  "delete_denied": True,
  "endpoint_present": True,
  "bucket_present": True,
  "prefix_present": True,
  "producer": "qa10-prove-stub.sh",
  "proved_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
  "note": "unit-test stub — non-secret fingerprint only",
}
with open(out, "w", encoding="utf-8") as f:
  json.dump(payload, f, indent=2)
  f.write("\n")
os.chmod(out, 0o600)
print(f"wrote RO proof attestation: {out} tuple_fp16={fp}")
PY
fi
echo "=== RESULT: PASS (stub live R2 List allowed; Put/Delete AccessDenied) ==="
exit 0

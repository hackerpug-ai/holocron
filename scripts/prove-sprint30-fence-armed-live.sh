#!/usr/bin/env bash
# GATE-FIX-gate-preflight-fence-rearm — prove live serving process is fenced.
#
# CLI isMigrationReadOnly() alone is NOT closed. Requires:
#   1) GET /health succeeds
#   2) real mutating POST returns HTTP 423 + body code migration_read_only
#
# Usage:
#   HOLO_VERIFY_BASE_URL=http://127.0.0.1:44121 bash scripts/prove-sprint30-fence-armed-live.sh
#   bash scripts/prove-sprint30-fence-armed-live.sh --base-url URL [--out path.json]
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

BASE_URL="${HOLO_VERIFY_BASE_URL:-${HOLO_SOAK_BASE_URL:-${PLATFORM_URL:-}}}"
OUT=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --base-url)
      BASE_URL="${2:?--base-url requires value}"
      shift 2
      ;;
    --out)
      OUT="${2:?--out requires path}"
      shift 2
      ;;
    -h|--help)
      sed -n '1,14p' "$0"
      exit 0
      ;;
    *)
      echo "error: unknown arg: $1" >&2
      exit 2
      ;;
  esac
done

if [[ -z "$BASE_URL" ]]; then
  echo "error: HOLO_VERIFY_BASE_URL / --base-url required" >&2
  exit 2
fi
BASE_URL="${BASE_URL%/}"

# Resolve RN key without printing it
RN_KEY="${HOLO_KEY_RN:-${RN_API_KEY:-}}"
if [[ -z "$RN_KEY" ]]; then
  SECRETS_PATH="${HOLO_SECRETS_PATH:-$ROOT/services/platform/config/secrets.yaml}"
  if [[ -f "$SECRETS_PATH" ]]; then
    RN_KEY="$(
      python3 - "$SECRETS_PATH" <<'PY'
import re, sys
from pathlib import Path
t = Path(sys.argv[1]).read_text()
for key in ("HOLO_KEY_RN", "RN_API_KEY", "HOLO_KEY_CONTROL"):
    m = re.search(rf'(?m)^{key}:\s*["\']?([^"\'\n]+)', t)
    if m:
        print(m.group(1).strip())
        break
else:
    print("")
PY
    )"
  fi
fi
if [[ -z "$RN_KEY" ]]; then
  echo "error: HOLO_KEY_RN required for live write probe" >&2
  exit 2
fi

HEALTH_JSON="$(curl -fsS --max-time 10 "$BASE_URL/health" || true)"
if [[ -z "$HEALTH_JSON" ]]; then
  echo "error: FENCE_LIVE_ORACLE_FAILED — /health not reachable at $BASE_URL" >&2
  exit 2
fi

PROBE_TAG="fence-prove-$(date +%s)"
# Capture status + body separately
HTTP_CODE="$(
  curl -sS --max-time 15 -o /tmp/sprint30-fence-prove-body.json -w '%{http_code}' \
    -X POST "$BASE_URL/api/documents" \
    -H "authorization: Bearer ${RN_KEY}" \
    -H 'content-type: application/json' \
    -d "{\"title\":\"${PROBE_TAG}\",\"content\":\"fence-armed live oracle\",\"category\":\"general\"}" \
    || echo "000"
)"
BODY="$(cat /tmp/sprint30-fence-prove-body.json 2>/dev/null || echo '{}')"

RESULT="$(
  HTTP_CODE="$HTTP_CODE" BODY="$BODY" BASE_URL="$BASE_URL" python3 - <<'PY'
import json, os, sys
code = int(os.environ.get("HTTP_CODE") or "0")
raw = os.environ.get("BODY") or "{}"
base = os.environ.get("BASE_URL") or ""
try:
    body = json.loads(raw)
except Exception:
    body = {"raw": raw[:500]}
code_field = body.get("code") if isinstance(body, dict) else None
err_field = body.get("error") if isinstance(body, dict) else None
ok = code == 423 and (
    code_field == "migration_read_only"
    or err_field == "migration_read_only"
    or (isinstance(err_field, str) and "migration_read_only" in err_field)
)
out = {
    "ok": ok,
    "tool": "scripts/prove-sprint30-fence-armed-live.sh",
    "base_url": base,
    "health_ok": True,
    "write_probe": {
        "method": "POST",
        "path": "/api/documents",
        "status": code,
        "body": body if isinstance(body, dict) else {"raw": str(body)[:500]},
        "expect": {"status": 423, "code": "migration_read_only"},
    },
}
if not ok:
    out["error"] = {
        "code": "FENCE_NOT_ARMED_ON_SERVING_PROCESS",
        "message": (
            f"live write probe status={code} body.code={code_field!r} "
            f"(require HTTP 423 + migration_read_only; CLI-only fence is NOT closed)"
        ),
    }
print(json.dumps(out, indent=2))
sys.exit(0 if ok else 2)
PY
)"
echo "$RESULT"
if [[ -n "$OUT" ]]; then
  mkdir -p "$(dirname "$OUT")"
  printf '%s\n' "$RESULT" >"$OUT"
fi
echo "$RESULT" | python3 -c 'import json,sys; j=json.load(sys.stdin); sys.exit(0 if j.get("ok") else 2)'

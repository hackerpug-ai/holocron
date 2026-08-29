#!/usr/bin/env bash
# GATE-FIX-gate-preflight-fence-rearm + GATE-FIX-prove-fence-no-mint-disarmed
#
# Prove live serving process is fenced WITHOUT minting when fence is disarmed.
#
# CLI isMigrationReadOnly() alone is NOT closed for PASS. Requires:
#   1) GET /health succeeds
#   2) durable/CLI fence precheck reads ARMED before any mutating POST
#   3) real mutating POST returns HTTP 423 + body code migration_read_only
#
# When durable/CLI fence is DISARMED: fail closed with FENCE_DISARMED_PRECHECK
# and NEVER issue POST /api/documents (no ledger mint / T-SYNC-013 poison).
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
      sed -n '1,18p' "$0"
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
  SECRETS_PATH="${HOLO_SECRETS_PATH:-$ROOT/packages/platform/config/secrets.yaml}"
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

emit_and_exit() {
  # Always write --out before exit when requested (L-1 / AC-4).
  # $1 = exit code; stdin = JSON payload.
  local rc="$1"
  local payload
  payload="$(cat)"
  printf '%s\n' "$payload"
  if [[ -n "$OUT" ]]; then
    mkdir -p "$(dirname "$OUT")"
    printf '%s\n' "$payload" >"$OUT"
  fi
  exit "$rc"
}

ledger_count() {
  bun -e '
import { resolveDatabaseUrl } from "./packages/platform/src/db/connection.ts";
import { createSql } from "./packages/platform/src/db/client.ts";
const u = resolveDatabaseUrl({ preferHolocron: true });
const sql = createSql(u);
try {
  const rows = await sql`SELECT count(*)::int AS c FROM post_export_write_audit`;
  console.log(String(rows[0]?.c ?? -1));
} catch {
  console.log("-1");
} finally {
  await sql.end({ timeout: 5 });
}
' 2>/dev/null || echo "-1"
}

HEALTH_JSON="$(curl -fsS --max-time 15 "$BASE_URL/health" || true)"
if [[ -z "$HEALTH_JSON" ]]; then
  BASE_URL="$BASE_URL" python3 - <<'PY' | emit_and_exit 2
import json, os
print(json.dumps({
  "ok": False,
  "tool": "scripts/prove-sprint30-fence-armed-live.sh",
  "base_url": os.environ.get("BASE_URL") or "",
  "health_ok": False,
  "post_attempted": False,
  "error": {
    "code": "FENCE_LIVE_ORACLE_FAILED",
    "message": f"/health not reachable at {os.environ.get('BASE_URL') or ''}",
  },
}, indent=2))
PY
fi

# ── Fence precheck BEFORE any POST (H-1 / AC-1) ─────────────────────────────
# Prefer durable + isMigrationReadOnly() from platform soak-fence (no second key).
PRECHECK_JSON="$(
  bun -e '
import {
  isMigrationReadOnly,
  readDurableMigrationReadOnly,
} from "./packages/platform/src/cutover/soak-fence.ts";
const durable = readDurableMigrationReadOnly();
const armed = isMigrationReadOnly();
console.log(JSON.stringify({
  durable_raw: durable ?? null,
  is_migration_read_only: armed,
  fence_precheck: armed ? "armed" : "disarmed",
}));
' 2>/dev/null || echo '{"durable_raw":null,"is_migration_read_only":false,"fence_precheck":"disarmed","precheck_error":"bun_precheck_failed"}'
)"

FENCE_PRECHECK="$(
  PRECHECK_JSON="$PRECHECK_JSON" python3 - <<'PY'
import json, os
try:
    j = json.loads(os.environ.get("PRECHECK_JSON") or "{}")
except Exception:
    j = {}
print(j.get("fence_precheck") or "disarmed")
PY
)"

LEDGER_BEFORE="$(ledger_count)"

if [[ "$FENCE_PRECHECK" != "armed" ]]; then
  # NEVER POST when known-disarmed — leave ledger unchanged
  PRECHECK_JSON="$PRECHECK_JSON" LEDGER_BEFORE="$LEDGER_BEFORE" BASE_URL="$BASE_URL" \
  python3 - <<'PY' | emit_and_exit 2
import json, os

try:
    pre = json.loads(os.environ.get("PRECHECK_JSON") or "{}")
except Exception:
    pre = {}
try:
    before_n = int(os.environ.get("LEDGER_BEFORE") or "-1")
except Exception:
    before_n = -1
print(json.dumps({
    "ok": False,
    "tool": "scripts/prove-sprint30-fence-armed-live.sh",
    "base_url": os.environ.get("BASE_URL") or "",
    "health_ok": True,
    "post_attempted": False,
    "fence_precheck": pre,
    "write_probe": None,
    "ledger": {
        "accepted_count_before": before_n,
        "accepted_count_after": before_n,
        "delta": 0,
        "measured": before_n >= 0,
    },
    "error": {
        "code": "FENCE_DISARMED_PRECHECK",
        "message": (
            "durable/CLI fence reads disarmed — refuse POST /api/documents "
            "(no mint; nested under FENCE_NOT_ARMED_ON_SERVING_PROCESS)"
        ),
        "nested_under": "FENCE_NOT_ARMED_ON_SERVING_PROCESS",
    },
}, indent=2))
PY
fi

# ── Armed path: live POST must return 423 + migration_read_only ──────────────
PROBE_TAG="fence-prove-$(date +%s)"
BODY_FILE="$(mktemp -t sprint30-fence-prove-body.XXXXXX)"
cleanup() { rm -f "$BODY_FILE"; }
trap cleanup EXIT

set +e
HTTP_CODE="$(
  curl -sS --max-time 15 -o "$BODY_FILE" -w '%{http_code}' \
    -X POST "$BASE_URL/api/documents" \
    -H "authorization: Bearer ${RN_KEY}" \
    -H 'content-type: application/json' \
    -d "{\"title\":\"${PROBE_TAG}\",\"content\":\"fence-armed live oracle\",\"category\":\"general\"}" \
    2>/dev/null
)"
CURL_RC=$?
set -e
if [[ "$CURL_RC" -ne 0 || -z "$HTTP_CODE" ]]; then
  HTTP_CODE="000"
fi
BODY="$(cat "$BODY_FILE" 2>/dev/null || echo '{}')"

LEDGER_AFTER="$(ledger_count)"

# Optional dual-reset on accidental 201 (defense-in-depth; AC-3)
DUAL_RESET=""
if [[ "$HTTP_CODE" == "201" ]]; then
  set +e
  bash scripts/reset-sprint30-gate-ledger.sh --authorize >/dev/null 2>&1
  DUAL_RESET_RC=$?
  set -e
  # re-measure after dual-reset
  LEDGER_AFTER="$(ledger_count)"
  DUAL_RESET="$(
    DUAL_RESET_RC="$DUAL_RESET_RC" python3 - <<'PY'
import json, os
print(json.dumps({
  "attempted": True,
  "rc": int(os.environ.get("DUAL_RESET_RC") or "1"),
  "note": "auto dual-reset after prove observed HTTP 201 mint",
}))
PY
  )"
fi

RESULT="$(
  HTTP_CODE="$HTTP_CODE" BODY="$BODY" BASE_URL="$BASE_URL" \
  PRECHECK_JSON="$PRECHECK_JSON" \
  LEDGER_BEFORE="$LEDGER_BEFORE" LEDGER_AFTER="$LEDGER_AFTER" \
  DUAL_RESET="$DUAL_RESET" PROBE_TAG="$PROBE_TAG" \
  python3 - <<'PY'
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
if isinstance(body, dict) and "document" in body and code_field is None:
    doc = body.get("document") or {}
    if isinstance(doc, dict):
        code_field = doc.get("code")

ok = code == 423 and (
    code_field == "migration_read_only"
    or err_field == "migration_read_only"
    or (isinstance(err_field, str) and "migration_read_only" in err_field)
)

try:
    pre = json.loads(os.environ.get("PRECHECK_JSON") or "{}")
except Exception:
    pre = {}

def _int(v, default=-1):
    try:
        return int(v)
    except Exception:
        return default

before = _int(os.environ.get("LEDGER_BEFORE"), -1)
after = _int(os.environ.get("LEDGER_AFTER"), -1)
delta = (after - before) if before >= 0 and after >= 0 else None

dual = None
if os.environ.get("DUAL_RESET"):
    try:
        dual = json.loads(os.environ["DUAL_RESET"])
    except Exception:
        dual = {"attempted": True}

out = {
    "ok": ok,
    "tool": "scripts/prove-sprint30-fence-armed-live.sh",
    "base_url": base,
    "health_ok": True,
    "post_attempted": True,
    "fence_precheck": pre,
    "probe_title": os.environ.get("PROBE_TAG") or "",
    "write_probe": {
        "method": "POST",
        "path": "/api/documents",
        "status": code,
        "body": body if isinstance(body, dict) else {"raw": str(body)[:500]},
        "expect": {"status": 423, "code": "migration_read_only"},
    },
    "ledger": {
        "accepted_count_before": before,
        "accepted_count_after": after,
        "delta": delta,
        "measured": before >= 0 and after >= 0,
    },
}
if dual is not None:
    out["dual_reset_on_201"] = dual
if not ok:
    err_code = "FENCE_NOT_ARMED_ON_SERVING_PROCESS"
    if code == 201:
        err_code = "FENCE_PROVE_MINTED_ON_DISARMED_SERVING"
    out["error"] = {
        "code": err_code,
        "message": (
            f"live write probe status={code} body.code={code_field!r} "
            f"(require HTTP 423 + migration_read_only; CLI-only fence is NOT closed)"
        ),
    }
print(json.dumps(out, indent=2))
# Always exit 0 so set -e + command substitution does not drop --out (L-1).
sys.exit(0)
PY
)"

RC=0
if ! printf '%s\n' "$RESULT" | python3 -c 'import json,sys; j=json.load(sys.stdin); sys.exit(0 if j.get("ok") else 2)'; then
  RC=2
fi

printf '%s\n' "$RESULT"
if [[ -n "$OUT" ]]; then
  mkdir -p "$(dirname "$OUT")"
  printf '%s\n' "$RESULT" >"$OUT"
fi
exit "$RC"

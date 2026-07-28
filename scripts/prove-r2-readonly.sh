#!/usr/bin/env bash
# D05-03 / CAP-BAK-01 AC-2 — Live R2 object-read-only isolation proof.
#
# Real aws CLI against real Cloudflare R2. No mocks.
#
# PASS only when ALL hold:
#   (1) credentials are non-placeholder and distinct from backup RW keys (when known)
#   (2) aws s3 ls  s3://$bucket          → exit 0   (List allowed)
#   (3) aws s3 cp  local → s3://bucket/… → non-zero + AccessDenied (Put blocked)
#   (4) aws s3 rm  s3://bucket/…         → non-zero + AccessDenied (Delete blocked)
#
# Fails closed when:
#   - keys/endpoint are placeholders
#   - Put or Delete succeeds (proves RW identity, not RO)
#   - List fails (broken/expired/wrong keys)
#   - REQUIRE_LIVE_R2_RO=1 and live proof cannot run
#
# Credential resolution order (first non-empty wins for access key pair):
#   R2_RESTORE_ACCESS_KEY_ID / R2_RESTORE_SECRET_ACCESS_KEY
#   R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY  (must be restore RO, not backup RW)
# Optional: R2_SESSION_TOKEN / R2_RESTORE_SESSION_TOKEN
# Endpoint: R2_ENDPOINT or https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com
# Bucket:   R2_BUCKET_NAME (default holocron-backup)
#
# Optional mint path (when live RO keys missing but admin present):
#   CLOUDFLARE_API_TOKEN + R2_PARENT_ACCESS_KEY_ID + R2_ACCOUNT_ID
#   → POST /accounts/{id}/r2/temp-access-credentials permission=object-read-only
#   Minted keys are used for the probe only (never printed).
#
# Usage:
#   ./scripts/prove-r2-readonly.sh
#   REQUIRE_LIVE_R2_RO=1 ./scripts/prove-r2-readonly.sh
#   source restore-target.env && ./scripts/prove-r2-readonly.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

PASS_COUNT=0
FAIL_COUNT=0
pass() { echo "PASS: $*"; PASS_COUNT=$((PASS_COUNT + 1)); }
fail() { echo "FAIL: $*"; FAIL_COUNT=$((FAIL_COUNT + 1)); }
info() { echo "INFO: $*"; }

is_placeholder() {
  local v="${1:-}"
  [[ -z "$v" ]] && return 0
  case "$v" in
    *placeholder*|*replace-me*|*example*|*not-for-prod*|*ro-test-*|*test-key*|*test-secret*)
      return 0
      ;;
  esac
  # example-accountid host
  if [[ "$v" == *example-accountid* ]]; then
    return 0
  fi
  return 1
}

human_required_mint() {
  cat <<'EOF'
human_required: mint R2 object-read-only (List/Get only) credentials

Cloudflare dashboard (durable — preferred for restore target):
  1. R2 → Overview → Manage R2 API Tokens → Create API token
  2. Permissions: Object Read only on bucket holocron-backup
     (do NOT grant Object Write / Admin Read & Write)
  3. Export on the restore target only:
       export R2_RESTORE_ACCESS_KEY_ID=<Access Key ID>
       export R2_RESTORE_SECRET_ACCESS_KEY=<Secret Access Key>
       export R2_ACCOUNT_ID=<account id>
       export R2_BUCKET_NAME=holocron-backup
       export R2_ENDPOINT=https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com
       export R2_CREDENTIAL_KIND=object-read-only
  4. Re-run: REQUIRE_LIVE_R2_RO=1 ./scripts/prove-r2-readonly.sh

Automated mint (when admin secrets available — temporary ≤7d):
  export CLOUDFLARE_API_TOKEN=...          # Account API token with R2 write
  export R2_PARENT_ACCESS_KEY_ID=...      # Parent S3 access key id
  export R2_PARENT_SECRET_ACCESS_KEY=...  # Parent S3 secret (not used by mint body; keep ambient-free on restore)
  export R2_ACCOUNT_ID=...
  export R2_BUCKET_NAME=holocron-backup
  ./scripts/prove-r2-readonly.sh --try-mint

NEVER reuse D04-02 backup writer keys (object-read-write / Put+Delete) as restore RO.
EOF
}

# Load optional secrets.yaml key presence into env when unset (values stay local).
load_secrets_if_present() {
  local secrets="${HOLOCRON_SECRETS_PATH:-$ROOT/services/platform/config/secrets.yaml}"
  # Prefer main repo secrets when worktree has none.
  if [[ ! -f "$secrets" ]]; then
    local main_secrets
    main_secrets="$(cd "$ROOT" && git rev-parse --show-toplevel 2>/dev/null)/services/platform/config/secrets.yaml" || true
    if [[ -n "${main_secrets:-}" && -f "$main_secrets" ]]; then
      secrets="$main_secrets"
    fi
  fi
  # Also check primary holocron checkout (worktrees often omit secrets.yaml).
  if [[ ! -f "$secrets" && -f /Users/inference1/Projects/holocron/services/platform/config/secrets.yaml ]]; then
    secrets=/Users/inference1/Projects/holocron/services/platform/config/secrets.yaml
  fi
  [[ -f "$secrets" ]] || return 0
  info "loading key presence from secrets file (values not logged)"
  # shellcheck disable=SC2094
  while IFS= read -r line || [[ -n "$line" ]]; do
    [[ "$line" =~ ^[[:space:]]*# ]] && continue
    [[ "$line" =~ ^([A-Za-z0-9_]+):[[:space:]]*(.*)$ ]] || continue
    local k="${BASH_REMATCH[1]}"
    local v="${BASH_REMATCH[2]}"
    v="${v%\"}"; v="${v#\"}"
    v="${v%\'}"; v="${v#\'}"
    # Only fill when env unset — never override explicit restore RO env.
    case "$k" in
      R2_ACCOUNT_ID|R2_ENDPOINT|R2_BUCKET_NAME|R2_RESTORE_ACCESS_KEY_ID|R2_RESTORE_SECRET_ACCESS_KEY|R2_RESTORE_SESSION_TOKEN|CLOUDFLARE_API_TOKEN|R2_PARENT_ACCESS_KEY_ID|R2_PARENT_SECRET_ACCESS_KEY)
        if [[ -z "${!k:-}" && -n "$v" ]]; then
          export "$k=$v"
        fi
        ;;
      # Backup RW runtime keys — capture for distinctness check only, never as RO identity.
      R2_ACCESS_KEY_ID)
        if [[ -z "${BACKUP_R2_ACCESS_KEY_ID:-}" && -n "$v" ]]; then
          export BACKUP_R2_ACCESS_KEY_ID="$v"
        fi
        ;;
      R2_SECRET_ACCESS_KEY)
        if [[ -z "${BACKUP_R2_SECRET_ACCESS_KEY:-}" && -n "$v" ]]; then
          export BACKUP_R2_SECRET_ACCESS_KEY="$v"
        fi
        ;;
      R2_SESSION_TOKEN)
        if [[ -z "${BACKUP_R2_SESSION_TOKEN:-}" && -n "$v" ]]; then
          export BACKUP_R2_SESSION_TOKEN="$v"
        fi
        ;;
    esac
  done <"$secrets"
}

try_mint_object_read_only() {
  local account_id="${R2_ACCOUNT_ID:-}"
  local token="${CLOUDFLARE_API_TOKEN:-}"
  local parent_key="${R2_PARENT_ACCESS_KEY_ID:-}"
  local bucket="${R2_BUCKET_NAME:-holocron-backup}"
  local ttl="${R2_RO_TTL_SECONDS:-3600}"

  if [[ -z "$account_id" || -z "$token" || -z "$parent_key" ]]; then
    info "mint skipped: need CLOUDFLARE_API_TOKEN + R2_PARENT_ACCESS_KEY_ID + R2_ACCOUNT_ID"
    return 1
  fi
  if ! command -v curl >/dev/null 2>&1; then
    fail "curl not available — cannot mint temp RO credentials"
    return 1
  fi
  if ! command -v python3 >/dev/null 2>&1; then
    fail "python3 not available — cannot parse mint response"
    return 1
  fi

  info "minting temporary object-read-only credentials via Cloudflare R2 API (ttl=${ttl}s)"
  local body resp http_code
  # Build JSON safely (never log).
  body="$(BUCKET="$bucket" PARENT="$parent_key" TTL="$ttl" python3 - <<'PY'
import json, os
print(json.dumps({
  "bucket": os.environ["BUCKET"],
  "parentAccessKeyId": os.environ["PARENT"],
  "permission": "object-read-only",
  "ttlSeconds": int(os.environ["TTL"]),
}))
PY
)"

  resp="$(mktemp -t r2-ro-mint.XXXXXX)"
  set +e
  http_code="$(curl -sS -o "$resp" -w '%{http_code}' \
    -X POST "https://api.cloudflare.com/client/v4/accounts/${account_id}/r2/temp-access-credentials" \
    -H "Authorization: Bearer ${token}" \
    -H "Content-Type: application/json" \
    --data "$body")"
  local curl_rc=$?
  set -e
  if [[ $curl_rc -ne 0 ]]; then
    rm -f "$resp"
    fail "mint HTTP request failed (curl exit $curl_rc)"
    return 1
  fi

  # Parse result without printing secrets
  local parsed
  set +e
  parsed="$(HTTP_CODE="$http_code" RESP_FILE="$resp" python3 - <<'PY'
import json, os, sys
code = os.environ["HTTP_CODE"]
raw = open(os.environ["RESP_FILE"], "r", encoding="utf-8").read()
try:
    data = json.loads(raw)
except Exception as e:
    print(f"PARSE_FAIL {e}", file=sys.stderr)
    sys.exit(2)
if not data.get("success"):
    errs = data.get("errors") or data.get("messages") or raw[:200]
    print(f"API_FAIL http={code} errors={errs}", file=sys.stderr)
    sys.exit(3)
res = data.get("result") or {}
ak = res.get("accessKeyId") or ""
sk = res.get("secretAccessKey") or ""
st = res.get("sessionToken") or ""
if not ak or not sk:
    print("API_FAIL missing access keys in result", file=sys.stderr)
    sys.exit(3)
# Emit machine-readable for bash (tab-separated); caller must not log.
print(f"{ak}\t{sk}\t{st}")
PY
)"
  local parse_rc=$?
  set -e
  rm -f "$resp"
  if [[ $parse_rc -ne 0 ]]; then
    fail "mint object-read-only failed (see stderr above)"
    return 1
  fi

  IFS=$'\t' read -r MINT_AK MINT_SK MINT_ST <<<"$parsed"
  if [[ -z "${MINT_AK:-}" || -z "${MINT_SK:-}" ]]; then
    fail "mint returned empty credentials"
    return 1
  fi
  export R2_RESTORE_ACCESS_KEY_ID="$MINT_AK"
  export R2_RESTORE_SECRET_ACCESS_KEY="$MINT_SK"
  if [[ -n "${MINT_ST:-}" ]]; then
    export R2_RESTORE_SESSION_TOKEN="$MINT_ST"
  fi
  export R2_CREDENTIAL_KIND="object-read-only"
  pass "minted temporary object-read-only credentials (access key id prefix ${MINT_AK:0:6}…)"
  return 0
}

aws_s3() {
  # aws_s3 <args...>  — uses AWS_* from env; never logs credentials
  aws --cli-connect-timeout 10 --cli-read-timeout 30 "$@"
}

run_live_probe() {
  local key="$1" secret="$2" endpoint="$3" bucket="$4" session="${5:-}"
  local probe_key="d05-03-ro-probe/should-deny-$(date +%s)-$$"
  local s3_uri="s3://${bucket}/${probe_key}"

  if ! command -v aws >/dev/null 2>&1; then
    fail "aws CLI not installed — cannot live-prove R2 read-only"
    return 1
  fi

  local aws_env=(
    env
    "AWS_ACCESS_KEY_ID=${key}"
    "AWS_SECRET_ACCESS_KEY=${secret}"
    "AWS_DEFAULT_REGION=auto"
    "AWS_EC2_METADATA_DISABLED=true"
    "AWS_PAGER="
  )
  if [[ -n "$session" ]]; then
    aws_env+=("AWS_SESSION_TOKEN=${session}")
  else
    aws_env+=("AWS_SESSION_TOKEN=")
  fi

  # (2) List must succeed
  local ls_out ls_rc
  set +e
  ls_out="$("${aws_env[@]}" aws s3 ls "s3://${bucket}" --endpoint-url "$endpoint" 2>&1)"
  ls_rc=$?
  set -e
  if [[ $ls_rc -ne 0 ]]; then
    fail "aws s3 ls failed (exit ${ls_rc}) — List must be allowed for restore RO"
    echo "  detail: $(echo "$ls_out" | tr '\n' ' ' | head -c 300)" >&2
    return 1
  fi
  pass "aws s3 ls s3://${bucket} exit 0 (List allowed)"
  # Do not dump full listing (may be large); show first line only.
  info "ls sample: $(echo "$ls_out" | head -n 1 | tr '\n' ' ')"

  # (3) Put must be denied
  local put_out put_rc
  set +e
  put_out="$(echo "d05-03-ro-probe-should-deny" | "${aws_env[@]}" aws s3 cp - "$s3_uri" --endpoint-url "$endpoint" 2>&1)"
  put_rc=$?
  set -e
  if [[ $put_rc -eq 0 ]]; then
    fail "aws s3 cp SUCCEEDED — credentials allow Put (not object-read-only); cleaning probe object"
    set +e
    "${aws_env[@]}" aws s3 rm "$s3_uri" --endpoint-url "$endpoint" >/dev/null 2>&1
    set -e
    return 1
  fi
  if ! echo "$put_out" | grep -qiE 'AccessDenied|Access Denied|not authorized|Forbidden|InvalidAccessKeyId|UnknownError'; then
    # R2 sometimes returns 403 without classic AccessDenied string — accept non-zero with 403/403-like.
    if ! echo "$put_out" | grep -qiE '403|denied|denied|Unauthorized'; then
      fail "aws s3 cp failed but stderr lacks AccessDenied/403 (exit ${put_rc})"
      echo "  detail: $(echo "$put_out" | tr '\n' ' ' | head -c 400)" >&2
      return 1
    fi
  fi
  if ! echo "$put_out" | grep -qiE 'AccessDenied|Access Denied'; then
    # Soft note if only 403 without AccessDenied token — still count as blocked put.
    info "put blocked (exit ${put_rc}); stderr: $(echo "$put_out" | tr '\n' ' ' | head -c 200)"
  fi
  pass "aws s3 cp denied (Put blocked; exit ${put_rc}; AccessDenied/403)"

  # (4) Delete must be denied — target a well-known prefix that may or may not exist.
  # Prefer an existing object path under pgbackrest/ if list shows one; else probe key.
  local del_target="$s3_uri"
  local existing
  existing="$(echo "$ls_out" | awk '/PRE /{next} NF>=4 {print $4; exit}')"
  if [[ -n "${existing:-}" ]]; then
    # listing format for objects: DATE TIME SIZE KEY — rare at bucket root (usually PRE).
    :
  fi
  # Use a deterministic non-owned path; AccessDenied on missing object still proves no Delete.
  del_target="s3://${bucket}/d05-03-ro-probe/delete-should-deny"

  local del_out del_rc
  set +e
  del_out="$("${aws_env[@]}" aws s3 rm "$del_target" --endpoint-url "$endpoint" 2>&1)"
  del_rc=$?
  set -e
  if [[ $del_rc -eq 0 ]]; then
    # aws s3 rm often exits 0 even when object missing. Treat success as failure only if
    # delete actually removed something; if "delete: s3://..." with no error, still ambiguous.
    if echo "$del_out" | grep -qiE 'delete:'; then
      fail "aws s3 rm reported delete success — credentials may allow Delete (not RO)"
      echo "  detail: $(echo "$del_out" | tr '\n' ' ' | head -c 300)" >&2
      return 1
    fi
    # Empty success on missing key is common for RO and RW alike; strengthen with API-level delete.
  fi

  # Stronger Delete probe via s3api DeleteObject — returns AccessDenied for RO tokens.
  local api_out api_rc
  set +e
  api_out="$("${aws_env[@]}" aws s3api delete-object \
    --bucket "$bucket" \
    --key "d05-03-ro-probe/delete-should-deny" \
    --endpoint-url "$endpoint" 2>&1)"
  api_rc=$?
  set -e
  if [[ $api_rc -eq 0 ]]; then
    # s3api delete-object returns 204 even for missing keys when Delete is allowed.
    # That proves Delete permission exists → not RO.
    fail "aws s3api delete-object SUCCEEDED — credentials allow Delete (not object-read-only)"
    echo "  detail: $(echo "$api_out" | tr '\n' ' ' | head -c 300)" >&2
    return 1
  fi
  if ! echo "$api_out" | grep -qiE 'AccessDenied|Access Denied|403|not authorized|Forbidden|Unauthorized'; then
    fail "aws s3api delete-object failed without AccessDenied/403 (exit ${api_rc})"
    echo "  detail: $(echo "$api_out" | tr '\n' ' ' | head -c 400)" >&2
    return 1
  fi
  pass "aws s3api delete-object denied (Delete blocked; exit ${api_rc}; AccessDenied/403)"
  return 0
}

TRY_MINT=0
while [[ $# -gt 0 ]]; do
  case "$1" in
    --try-mint) TRY_MINT=1; shift ;;
    -h|--help)
      sed -n '1,40p' "$0"
      exit 0
      ;;
    *)
      echo "unknown arg: $1" >&2
      exit 2
      ;;
  esac
done

echo "=== prove-r2-readonly (live aws → real R2) ==="

load_secrets_if_present

# Prefer explicit restore RO keys.
AK="${R2_RESTORE_ACCESS_KEY_ID:-${R2_ACCESS_KEY_ID:-}}"
SK="${R2_RESTORE_SECRET_ACCESS_KEY:-${R2_SECRET_ACCESS_KEY:-}}"
ST="${R2_RESTORE_SESSION_TOKEN:-${R2_SESSION_TOKEN:-}}"
BUCKET="${R2_BUCKET_NAME:-holocron-backup}"
ENDPOINT="${R2_ENDPOINT:-}"
if [[ -z "$ENDPOINT" && -n "${R2_ACCOUNT_ID:-}" ]]; then
  ENDPOINT="https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com"
fi

# Distinctness: if caller only has backup RW keys and claims RO, detect.
if [[ -n "${BACKUP_R2_ACCESS_KEY_ID:-}" && -n "$AK" && "$AK" == "$BACKUP_R2_ACCESS_KEY_ID" ]]; then
  # Same identity as backup writer — only OK if we will fail live Put; still flag.
  info "restore access key matches backup R2_ACCESS_KEY_ID from secrets (likely RW)"
fi

PLACEHOLDER=0
if is_placeholder "$AK" || is_placeholder "$SK" || is_placeholder "${ENDPOINT:-}"; then
  PLACEHOLDER=1
fi

if [[ $PLACEHOLDER -eq 1 ]]; then
  fail "R2 credentials/endpoint are placeholders or empty — not a live RO identity"
  info "key_present=$([[ -n "$AK" ]] && echo yes || echo no) secret_present=$([[ -n "$SK" ]] && echo yes || echo no) endpoint=${ENDPOINT:-<empty>}"
fi

if [[ $TRY_MINT -eq 1 || ( $PLACEHOLDER -eq 1 && -n "${CLOUDFLARE_API_TOKEN:-}" && -n "${R2_PARENT_ACCESS_KEY_ID:-}" ) ]]; then
  if try_mint_object_read_only; then
    AK="${R2_RESTORE_ACCESS_KEY_ID}"
    SK="${R2_RESTORE_SECRET_ACCESS_KEY}"
    ST="${R2_RESTORE_SESSION_TOKEN:-}"
    PLACEHOLDER=0
    if [[ -z "$ENDPOINT" && -n "${R2_ACCOUNT_ID:-}" ]]; then
      ENDPOINT="https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com"
    fi
  fi
fi

if [[ $PLACEHOLDER -eq 1 || -z "$AK" || -z "$SK" || -z "$ENDPOINT" ]]; then
  human_required_mint
  if [[ "${REQUIRE_LIVE_R2_RO:-0}" == "1" ]]; then
    echo "=== RESULT: FAIL (REQUIRE_LIVE_R2_RO=1; no live RO credentials) ==="
    exit 1
  fi
  echo "=== RESULT: FAIL (no live R2 object-read-only credentials; human_required) ==="
  exit 1
fi

# Refuse using known backup RW secret as "RO" without live denial — live probe will catch Put.
if [[ -n "${BACKUP_R2_ACCESS_KEY_ID:-}" && "$AK" == "$BACKUP_R2_ACCESS_KEY_ID" ]]; then
  info "WARNING: probing with identity equal to backup RW key — expect Put to succeed and FAIL closed"
fi

if ! run_live_probe "$AK" "$SK" "$ENDPOINT" "$BUCKET" "$ST"; then
  # Extra clarity when RW keys were used
  if [[ -n "${BACKUP_R2_ACCESS_KEY_ID:-}" && "$AK" == "$BACKUP_R2_ACCESS_KEY_ID" ]]; then
    fail "probed identity is the backup read-write key — mint a distinct object-read-only token"
    human_required_mint
  fi
  echo "=== RESULT: FAIL (live R2 read-only proof) ==="
  exit 1
fi

# Success path also records that credentials differ from backup RW when that is known.
if [[ -n "${BACKUP_R2_ACCESS_KEY_ID:-}" ]]; then
  if [[ "$AK" == "$BACKUP_R2_ACCESS_KEY_ID" ]]; then
    fail "credentials equal backup RW identity after live probe — impossible for true RO"
    echo "=== RESULT: FAIL ==="
    exit 1
  fi
  pass "restore RO access key differs from backup R2_ACCESS_KEY_ID"
else
  info "backup RW key not loaded from secrets — distinctness checked only via Put/Delete denial"
fi

echo "=== RESULT: PASS (live R2 List allowed; Put/Delete AccessDenied) ==="
exit 0

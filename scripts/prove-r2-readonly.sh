#!/usr/bin/env bash
# D05-03 / CAP-BAK-01 AC-2 — Live R2 object-read-only isolation proof.
#
# Real aws CLI against real Cloudflare R2. No mocks.
#
# PASS only when ALL hold:
#   (1) credentials are non-placeholder and distinct from backup RW keys (when known)
#   (2) aws s3 ls  s3://$bucket          → exit 0   (List allowed)
#   (3) aws s3 cp  local → s3://bucket/drill-neg/… → non-zero + AccessDenied (Put blocked)
#   (4) aws s3api delete-object on drill-neg/… only → non-zero + AccessDenied (Delete blocked)
#
# REDHAT-FIX-H4: NEVER target live recovery keys (backup/, archive/, pgbackrest/,
# restic/, literal "existing", HOLO_BACKUP_PREFIX). Delete negative control uses
# only sacrificial keys under drill-neg/<uuid>/ (or non-mutating policy inspect
# via scripts/verify-restore-creds.sh). Fail closed if a denylisted key is requested.
#
# Fails closed when:
#   - keys/endpoint are placeholders
#   - Put or Delete succeeds (proves RW identity, not RO)
#   - List fails (broken/expired/wrong keys)
#   - REQUIRE_LIVE_R2_RO=1 and live proof cannot run
#   - any delete/put probe targets a live recovery prefix
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
    # REDHAT-FIX-S28R3: bare ro-test (legacy gate default) is not a live RO identity.
    ro-test|ro-test-*|*ro-test*|*placeholder*|*replace-me*|*example*|*not-for-prod*|*test-key*|*test-secret*)
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

# ── REDHAT-FIX-H4: live recovery key denylist + sacrificial drill-neg keys ──
# Normalize an S3 key or s3://bucket/key URI to a bare object key (no leading /).
normalize_object_key() {
  local raw="${1:-}"
  raw="${raw#s3://}"
  # If URI form bucket/key, drop the first path segment when it looks like a bucket.
  if [[ "$raw" == */* && "$raw" != drill-neg/* && "$raw" != backup/* && "$raw" != archive/* ]]; then
    # Heuristic: s3://bucket/key → strip bucket only when caller passed full URI.
    if [[ "${1:-}" == s3://* ]]; then
      raw="${raw#*/}"
    fi
  fi
  raw="${raw#/}"
  printf '%s' "$raw"
}

# Return 0 if key is a denylisted live recovery / production path (must refuse).
# Denylist: backup/, archive/, pgbackrest/ (production stanza root), restic paths,
# literal "existing", configured HOLO_BACKUP_PREFIX / R2_PGBACKREST_PREFIX.
matches_live_recovery_key() {
  local key
  key="$(normalize_object_key "${1:-}")"
  [[ -z "$key" ]] && return 1

  # Literal root key used by the pre-fix D05-03 AC-2 destructive control.
  if [[ "$key" == "existing" || "$key" == "existing/"* ]]; then
    return 0
  fi

  case "$key" in
    backup|backup/*|archive|archive/*) return 0 ;;
    restic|restic/*) return 0 ;;
  esac

  # Production pgBackRest prefix (exact "pgbackrest" or "pgbackrest/…").
  # Test-scoped fixtures like pgbackrest-d05-01-red/ are NOT denylisted here;
  # destructive negative controls still must use drill-neg/ only (assert below).
  if [[ "$key" == "pgbackrest" || "$key" == pgbackrest/* ]]; then
    return 0
  fi

  local pref="${HOLO_BACKUP_PREFIX:-${R2_PGBACKREST_PREFIX:-}}"
  if [[ -n "$pref" ]]; then
    pref="${pref#/}"
    pref="${pref%/}"
    if [[ -n "$pref" && ( "$key" == "$pref" || "$key" == "$pref"/* ) ]]; then
      return 0
    fi
  fi
  return 1
}

# Return 0 only for sacrificial drill-neg/<uuid>/… keys (H-4 allowed destructive target).
is_sacrificial_drill_neg_key() {
  local key
  key="$(normalize_object_key "${1:-}")"
  [[ "$key" == drill-neg/* ]] || return 1
  # drill-neg itself must never alias a denylisted path
  matches_live_recovery_key "$key" && return 1
  # require at least drill-neg/<something>
  [[ "$key" == "drill-neg" || "$key" == "drill-neg/" ]] && return 1
  return 0
}

# Hard-stop before any Put/Delete API call against a non-sacrificial key.
assert_safe_destructive_probe_key() {
  local key="${1:-}"
  local op="${2:-destructive}"
  if matches_live_recovery_key "$key"; then
    fail "refusing ${op} against live recovery key '${key}' (REDHAT-FIX-H4 denylist)"
    echo "  detail: use only drill-neg/<uuid>/… sacrificial keys; never backup/, archive/, pgbackrest/, restic/, or 'existing'" >&2
    return 1
  fi
  if ! is_sacrificial_drill_neg_key "$key"; then
    fail "refusing ${op} against non-sacrificial key '${key}' (must be drill-neg/<uuid>/…)"
    return 1
  fi
  return 0
}

# Generate a unique sacrificial object key under drill-neg/.
make_sacrificial_drill_neg_key() {
  local uuid
  if command -v uuidgen >/dev/null 2>&1; then
    uuid="$(uuidgen | tr '[:upper:]' '[:lower:]')"
  else
    uuid="$(date +%s)-$$-${RANDOM:-0}"
  fi
  printf 'drill-neg/%s-redhat-fix-h4.txt' "$uuid"
}

run_live_probe() {
  local key="$1" secret="$2" endpoint="$3" bucket="$4" session="${5:-}"
  # REDHAT-FIX-H4: uniquely generated sacrificial key only — never live recovery objects.
  local probe_key
  probe_key="$(make_sacrificial_drill_neg_key)"
  local s3_uri="s3://${bucket}/${probe_key}"

  if ! assert_safe_destructive_probe_key "$probe_key" "put/delete probe"; then
    return 1
  fi

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
  info "sacrificial probe key: ${probe_key} (REDHAT-FIX-H4 drill-neg only)"

  # (3) Put must be denied — only against sacrificial drill-neg key.
  local put_out put_rc
  set +e
  put_out="$(echo "SACRIFICIAL_DRILL_NEG_H4-should-deny" | "${aws_env[@]}" aws s3 cp - "$s3_uri" --endpoint-url "$endpoint" 2>&1)"
  put_rc=$?
  set -e
  if [[ $put_rc -eq 0 ]]; then
    fail "aws s3 cp SUCCEEDED — credentials allow Put (not object-read-only); cleaning sacrificial probe object"
    # Cleanup only allowed under drill-neg/ (already asserted).
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
  pass "aws s3 cp denied on drill-neg key (Put blocked; exit ${put_rc}; AccessDenied/403)"

  # (4) Delete must be denied — sacrificial drill-neg key ONLY (H-4).
  # NEVER target live recovery keys (bucket-root "existing", backup/, pgbackrest/, …).
  # AccessDenied on a missing sacrificial key still proves Delete is not allowed.
  if ! assert_safe_destructive_probe_key "$probe_key" "delete probe"; then
    return 1
  fi
  local del_target="s3://${bucket}/${probe_key}"

  local del_out del_rc
  set +e
  del_out="$("${aws_env[@]}" aws s3 rm "$del_target" --endpoint-url "$endpoint" 2>&1)"
  del_rc=$?
  set -e
  if [[ $del_rc -eq 0 ]]; then
    # aws s3 rm often exits 0 even when object missing. Treat success as failure only if
    # delete actually removed something; if "delete: s3://..." with no error, still ambiguous.
    if echo "$del_out" | grep -qiE 'delete:'; then
      fail "aws s3 rm reported delete success on sacrificial key — credentials may allow Delete (not RO)"
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
    --key "$probe_key" \
    --endpoint-url "$endpoint" 2>&1)"
  api_rc=$?
  set -e
  if [[ $api_rc -eq 0 ]]; then
    # s3api delete-object returns 204 even for missing keys when Delete is allowed.
    # That proves Delete permission exists → not RO.
    fail "aws s3api delete-object SUCCEEDED on sacrificial key — credentials allow Delete (not object-read-only)"
    echo "  detail: $(echo "$api_out" | tr '\n' ' ' | head -c 300)" >&2
    return 1
  fi
  if ! echo "$api_out" | grep -qiE 'AccessDenied|Access Denied|403|not authorized|Forbidden|Unauthorized'; then
    fail "aws s3api delete-object failed without AccessDenied/403 (exit ${api_rc})"
    echo "  detail: $(echo "$api_out" | tr '\n' ' ' | head -c 400)" >&2
    return 1
  fi
  pass "aws s3api delete-object denied on drill-neg key (Delete blocked; exit ${api_rc}; AccessDenied/403)"
  return 0
}

TRY_MINT=0
# REDHAT-FIX-H4 helper modes (no network): denylist / sacrificial key classification.
#   --assert-safe-key KEY   exit 0 if KEY is sacrificial drill-neg; else non-zero
#   --assert-denylisted KEY exit 0 if KEY matches live recovery denylist; else non-zero
#   --make-sacrificial-key  print a new drill-neg/<uuid> key and exit 0
while [[ $# -gt 0 ]]; do
  case "$1" in
    --try-mint) TRY_MINT=1; shift ;;
    --assert-safe-key)
      key_arg="${2:-}"
      if [[ -z "$key_arg" ]]; then
        echo "FAIL: --assert-safe-key requires a key" >&2
        exit 2
      fi
      if assert_safe_destructive_probe_key "$key_arg" "assert-safe-key"; then
        echo "PASS: sacrificial drill-neg key allowed: $(normalize_object_key "$key_arg")"
        exit 0
      fi
      exit 1
      ;;
    --assert-denylisted)
      key_arg="${2:-}"
      if [[ -z "$key_arg" ]]; then
        echo "FAIL: --assert-denylisted requires a key" >&2
        exit 2
      fi
      if matches_live_recovery_key "$key_arg"; then
        echo "PASS: key is denylisted live recovery path: $(normalize_object_key "$key_arg")"
        exit 0
      fi
      echo "FAIL: key is NOT denylisted: $(normalize_object_key "$key_arg")" >&2
      exit 1
      ;;
    --make-sacrificial-key)
      make_sacrificial_drill_neg_key
      exit 0
      ;;
    -h|--help)
      sed -n '1,50p' "$0"
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

# When both ambient writer and restore are in env (no secrets file), capture writer for
# GATE-FIX-S28R3-QA8 credential-tuple compare. Never log values.
if [[ -z "${BACKUP_R2_ACCESS_KEY_ID:-}" && -n "${R2_RESTORE_ACCESS_KEY_ID:-}" && -n "${R2_ACCESS_KEY_ID:-}" ]]; then
  export BACKUP_R2_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID"
  if [[ -z "${BACKUP_R2_SECRET_ACCESS_KEY:-}" && -n "${R2_SECRET_ACCESS_KEY:-}" ]]; then
    export BACKUP_R2_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY"
  fi
fi

# GATE-FIX-S28R3-QA8 — credential-tuple identity (not Access Key ID alone).
# Cloudflare temp object-read-only sessions may reuse the parent Access Key ID when the
# secret differs and a non-empty session token is present. Shape never replaces the live
# List/Put/Delete oracle.
r2_writer_equivalent_tuple() {
  # args: restore_ak restore_sk restore_st [writer_ak] [writer_sk]
  local rak="${1:-}" rsk="${2:-}" rst="${3:-}" wak="${4:-}" wsk="${5:-}"
  if [[ -z "$rak" || -z "$rsk" ]]; then
    return 0 # incomplete — handled by placeholder/empty path
  fi
  if [[ -n "$wsk" && "$rsk" == "$wsk" ]]; then
    return 0 # equivalent (true = is writer-equivalent)
  fi
  if [[ -n "$wak" && "$rak" == "$wak" ]]; then
    if [[ -z "$rst" ]]; then
      return 0 # same parent AK without session token → incomplete CF temp / writer reuse
    fi
    if [[ -n "$wsk" && "$rsk" == "$wsk" ]]; then
      return 0
    fi
    return 1 # same parent AK + distinct secret + session → NOT writer-equivalent
  fi
  return 1 # distinct AK (or no writer known) → not writer-equivalent by shape
}

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
    echo "RESIDUAL: DEPENDENCY-S28-R2-RO"
    echo "=== RESULT: FAIL (REQUIRE_LIVE_R2_RO=1; no live RO credentials; DEPENDENCY-S28-R2-RO) ==="
    exit 1
  fi
  echo "RESIDUAL: DEPENDENCY-S28-R2-RO"
  echo "=== RESULT: FAIL (no live R2 object-read-only credentials; human_required; DEPENDENCY-S28-R2-RO) ==="
  exit 1
fi

# Pre-probe credential-tuple gate (never logs secret/session values).
if r2_writer_equivalent_tuple "$AK" "$SK" "$ST" "${BACKUP_R2_ACCESS_KEY_ID:-}" "${BACKUP_R2_SECRET_ACCESS_KEY:-}"; then
  if [[ -n "${BACKUP_R2_SECRET_ACCESS_KEY:-}" && "$SK" == "$BACKUP_R2_SECRET_ACCESS_KEY" ]]; then
    fail "writer-equivalent credential tuple refused (restore secret equals backup RW secret)"
  elif [[ -n "${BACKUP_R2_ACCESS_KEY_ID:-}" && "$AK" == "$BACKUP_R2_ACCESS_KEY_ID" && -z "$ST" ]]; then
    fail "incomplete Cloudflare temporary credential tuple (same parent Access Key ID without non-empty session token)"
  else
    fail "writer-equivalent or incomplete restore credential tuple refused"
  fi
  echo "RESIDUAL: DEPENDENCY-S28-R2-RO"
  echo "=== RESULT: FAIL (credential tuple not restore-only; DEPENDENCY-S28-R2-RO) ==="
  exit 1
fi

if [[ -n "${BACKUP_R2_ACCESS_KEY_ID:-}" && "$AK" == "$BACKUP_R2_ACCESS_KEY_ID" ]]; then
  info "GATE-FIX-S28R3-QA8: Cloudflare temporary credential tuple shape (same parent AK; distinct secret; session present) — live Put/Delete oracle required"
fi

if ! run_live_probe "$AK" "$SK" "$ENDPOINT" "$BUCKET" "$ST"; then
  # Extra clarity when RW-equivalent secrets were somehow still used
  if [[ -n "${BACKUP_R2_SECRET_ACCESS_KEY:-}" && "$SK" == "$BACKUP_R2_SECRET_ACCESS_KEY" ]]; then
    fail "probed identity is the backup read-write secret — mint a distinct object-read-only token"
    human_required_mint
  fi
  echo "=== RESULT: FAIL (live R2 read-only proof) ==="
  exit 1
fi

# Success path: live List allowed + Put/Delete denied is the permission oracle.
# Same parent AK with distinct secret + session is a valid Cloudflare temp RO shape.
if [[ -n "${BACKUP_R2_ACCESS_KEY_ID:-}" ]]; then
  if [[ "$AK" == "$BACKUP_R2_ACCESS_KEY_ID" ]]; then
    if [[ -n "${BACKUP_R2_SECRET_ACCESS_KEY:-}" && "$SK" == "$BACKUP_R2_SECRET_ACCESS_KEY" ]]; then
      fail "credentials equal backup RW identity after live probe — writer-equivalent tuple"
      echo "=== RESULT: FAIL ==="
      exit 1
    fi
    pass "GATE-FIX-S28R3-QA8: Cloudflare temporary RO tuple (same parent AK) passed live List/Put/Delete oracle"
  else
    pass "restore RO access key differs from backup R2_ACCESS_KEY_ID"
  fi
else
  info "backup RW key not loaded — distinctness checked only via Put/Delete denial"
fi

echo "=== RESULT: PASS (live R2 List allowed; Put/Delete AccessDenied) ==="
exit 0

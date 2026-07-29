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
# GATE-FIX-S28R3-QA12: trusted provider + canonical context + private proof helpers
# shellcheck source=scripts/lib/r2-ro-live.sh
source "$ROOT/scripts/lib/r2-ro-live.sh"

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
  # Prefer explicit HOLOCRON_SECRETS_PATH / HOLO_SECRETS_PATH; never override with personal
  # checkout secrets when the caller set an isolation path (GATE-FIX-S28R3-QA9).
  local secrets_explicit=0
  local secrets=""
  if [[ -n "${HOLOCRON_SECRETS_PATH:-}" ]]; then
    secrets="$HOLOCRON_SECRETS_PATH"
    secrets_explicit=1
  elif [[ -n "${HOLO_SECRETS_PATH:-}" ]]; then
    secrets="$HOLO_SECRETS_PATH"
    secrets_explicit=1
  else
    secrets="$ROOT/services/platform/config/secrets.yaml"
  fi
  # Worktree/default path only: prefer toplevel secrets when default path is missing.
  if [[ "$secrets_explicit" -eq 0 && ! -f "$secrets" ]]; then
    local main_secrets
    main_secrets="$(cd "$ROOT" && git rev-parse --show-toplevel 2>/dev/null)/services/platform/config/secrets.yaml" || true
    if [[ -n "${main_secrets:-}" && -f "$main_secrets" ]]; then
      secrets="$main_secrets"
    fi
  fi
  if [[ "$secrets_explicit" -eq 0 && ! -f "$secrets" && -f /Users/inference1/Projects/holocron/services/platform/config/secrets.yaml ]]; then
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
      R2_ACCOUNT_ID|R2_ENDPOINT|R2_BUCKET_NAME|R2_PGBACKREST_PREFIX|R2_RESTORE_OBJECT_PREFIX|R2_RESTORE_ACCESS_KEY_ID|R2_RESTORE_SECRET_ACCESS_KEY|R2_RESTORE_SESSION_TOKEN|CLOUDFLARE_API_TOKEN|R2_PARENT_ACCESS_KEY_ID|R2_PARENT_SECRET_ACCESS_KEY)
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
  if ! r2_ro_init_trusted_helpers; then
    fail "GATE-FIX-S28R3-QA14 trusted helper chain unavailable for mint"
    return 1
  fi

  info "minting temporary object-read-only credentials via Cloudflare R2 API (ttl=${ttl}s)"
  local body resp http_code
  # Build JSON safely (never log).
  body="$("$R2_RO_ENV_BIN" -i PATH=/usr/bin:/bin HOME="${HOME:-/tmp}" LC_ALL=C BUCKET="$bucket" PARENT="$parent_key" TTL="$ttl" "$R2_RO_PYTHON_BIN" - <<'PY'
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
  http_code="$(
    "$R2_RO_ENV_BIN" -i \
      PATH=/usr/bin:/bin \
      HOME="${HOME:-/tmp}" \
      LC_ALL=C \
      "$R2_RO_CURL_BIN" -sS -o "$resp" -w '%{http_code}' \
      -X POST "https://api.cloudflare.com/client/v4/accounts/${account_id}/r2/temp-access-credentials" \
      -H "Authorization: Bearer ${token}" \
      -H "Content-Type: application/json" \
      --data "$body"
  )"

  local curl_rc=$?
  set -e
  if [[ $curl_rc -ne 0 ]]; then
    rm -f "$resp"
    fail "mint HTTP request failed (curl exit $curl_rc)"
    return 1
  fi

  # Parse result without printing secrets or raw API bodies (GATE-FIX-S28R3-QA10 / L1).
  local parsed
  set +e
  parsed="$("$R2_RO_ENV_BIN" -i PATH=/usr/bin:/bin HOME="${HOME:-/tmp}" LC_ALL=C HTTP_CODE="$http_code" RESP_FILE="$resp" "$R2_RO_PYTHON_BIN" - <<'PY'
import json, os, sys
code = os.environ["HTTP_CODE"]
raw = open(os.environ["RESP_FILE"], "r", encoding="utf-8").read()
try:
    data = json.loads(raw)
except Exception:
    # Never print raw body or exception content (may reflect credentials).
    print(f"PARSE_FAIL http={code} class=invalid_json", file=sys.stderr)
    sys.exit(2)
if not data.get("success"):
    errs = data.get("errors") or []
    code_list = []
    if isinstance(errs, list):
        for e in errs:
            if isinstance(e, dict) and e.get("code") is not None:
                # Strict: numeric codes only (or short alnum codes); never free-text messages.
                c = e.get("code")
                if isinstance(c, int) or (isinstance(c, str) and c.isdigit()):
                    code_list.append(str(int(c) if not isinstance(c, int) else c))
                elif isinstance(c, str) and c.isalnum() and len(c) <= 32:
                    code_list.append(c)
    err_class = ",".join(code_list[:5]) if code_list else "api_error"
    # Fixed status + error-code class only — never raw messages/body/strings.
    print(f"API_FAIL http={code} class={err_class}", file=sys.stderr)
    sys.exit(3)
res = data.get("result") or {}
ak = res.get("accessKeyId") or ""
sk = res.get("secretAccessKey") or ""
st = res.get("sessionToken") or ""
if not ak or not sk:
    print(f"API_FAIL http={code} class=missing_access_keys", file=sys.stderr)
    sys.exit(3)
# Emit machine-readable for bash (tab-separated); caller must not log.
print(f"{ak}\t{sk}\t{st}")
PY
)"
  local parse_rc=$?
  set -e
  rm -f "$resp"
  if [[ $parse_rc -ne 0 ]]; then
    fail "mint object-read-only failed (HTTP/class only; raw response not logged)"
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
  # GATE-FIX-S28R3-QA9 / L1: never log Access Key ID (or any credential fragment).
  pass "minted temporary object-read-only credentials (permission kind=object-read-only; values not logged)"
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
  local key="$1" secret="$2" endpoint="$3" bucket="$4" session="${5:-}" prefix="${6:-}"
  local probe_key
  probe_key="$(make_sacrificial_drill_neg_key)"
  if ! assert_safe_destructive_probe_key "$probe_key" "put/delete probe"; then
    return 1
  fi

  if ! r2_ro_init_trusted_helpers; then
    fail "GATE-FIX-S28R3-QA14 trusted helper chain unavailable (PATH ignored)"
    return 1
  fi
  info "using repository stdlib R2 provider via root-owned /usr/bin/python3 (values not logged)"

  # GATE-FIX-S28R3-QA16: re-bind versioned probes in this shell (not env-dependent).
  if ! r2_ro_bind_scope_probes; then
    fail "GATE-FIX-S28R3-QA16 versioned scope probe bind failed"
    return 1
  fi
  local in_key="${R2_SCOPE_PROBE_IN_KEY:-}"
  local out_key="${R2_SCOPE_PROBE_OUT_KEY:-}"
  if [[ -z "$in_key" || -z "$out_key" ]]; then
    fail "GATE-FIX-S28R3-QA16 missing versioned known-existing scope probe keys"
    return 1
  fi

  # GATE-FIX-S28R3-QA17: optional writer preflight when explicit BACKUP/PARENT writer secrets exist.
  # Never treat ambient R2_* as writer (same-parent CF temp RO tuples).
  local wak="${BACKUP_R2_ACCESS_KEY_ID:-${R2_PARENT_ACCESS_KEY_ID:-}}"
  local wsk="${BACKUP_R2_SECRET_ACCESS_KEY:-${R2_PARENT_SECRET_ACCESS_KEY:-}}"
  export R2_SCOPE_PREFLIGHT_PROVENANCE="versioned-config-bind"
  export R2_SCOPE_PREFLIGHT_IN_EXISTS="pending-ro-head"
  export R2_SCOPE_PREFLIGHT_OUT_EXISTS="pending-access-denied-oracle"
  # Harness mock: skip writer preflight.
  if [[ -n "${HOLO_R2_PROVIDER_MOCK_MODE:-}" ]]; then
    wak=""
    wsk=""
    export R2_SCOPE_PREFLIGHT_PROVENANCE="versioned-config-bind+mock"
  fi
  if [[ -n "$wak" && -n "$wsk" && "$wsk" != "$secret" ]]; then
    local prc_in prc_out
    set +e
    r2_ro_run_provider "$wak" "$wsk" "" head-object \
      --endpoint "$endpoint" --bucket "$bucket" --key "$in_key" >/dev/null 2>&1
    prc_in=$?
    r2_ro_run_provider "$wak" "$wsk" "" head-object \
      --endpoint "$endpoint" --bucket "$bucket" --key "$out_key" >/dev/null 2>&1
    prc_out=$?
    set -e
    if [[ $prc_in -eq 0 && $prc_out -eq 0 ]]; then
      export R2_SCOPE_PREFLIGHT_PROVENANCE="writer-head-preflight"
      export R2_SCOPE_PREFLIGHT_IN_EXISTS="true"
      export R2_SCOPE_PREFLIGHT_OUT_EXISTS="true"
      pass "writer preflight: both scope probes exist (class=scope_preflight_ok)"
    elif [[ "${R2_SCOPE_REQUIRE_WRITER_PREFLIGHT:-0}" == "1" ]]; then
      fail "GATE-FIX-S28R3-QA17 writer preflight required but failed (in=${prc_in} out=${prc_out})"
      return 1
    else
      info "writer preflight unavailable (in=${prc_in} out=${prc_out}); continuing with versioned bind + RO oracles"
    fi
  fi

  # (1) Prefix list must succeed and return at least one object.
  local ls_out ls_rc
  set +e
  ls_out="$(r2_ro_run_provider "$key" "$secret" "$session" list-prefix \
    --endpoint "$endpoint" --bucket "$bucket" --prefix "$prefix" 2>&1)"
  ls_rc=$?
  set -e
  if [[ $ls_rc -ne 0 ]]; then
    ls_out=""
    fail "prefix list failed (exit ${ls_rc}; class=prefix_list_denied_or_error)"
    return 1
  fi
  if ! printf '%s' "$ls_out" | grep -q '^LIST_OK'; then
    ls_out=""
    fail "prefix list missing LIST_OK (class=prefix_list_unclassified)"
    return 1
  fi
  ls_out=""
  pass "prefix list allowed (class=prefix_list_ok; body not logged)"

  # (2) In-prefix Head + Get against known-existing key.
  local rc
  set +e
  r2_ro_run_provider "$key" "$secret" "$session" head-object \
    --endpoint "$endpoint" --bucket "$bucket" --key "$in_key" >/dev/null 2>&1
  rc=$?
  set -e
  if [[ $rc -ne 0 ]]; then
    fail "in-prefix head-object failed (exit ${rc}; class=prefix_head_denied_or_error) — known-existing probe required"
    return 1
  fi
  pass "in-prefix head-object allowed (class=prefix_head_ok)"
  export R2_SCOPE_PREFLIGHT_IN_EXISTS="true"

  set +e
  r2_ro_run_provider "$key" "$secret" "$session" get-object \
    --endpoint "$endpoint" --bucket "$bucket" --key "$in_key" >/dev/null 2>&1
  rc=$?
  set -e
  if [[ $rc -ne 0 ]]; then
    fail "in-prefix get-object failed (exit ${rc}; class=prefix_get_denied_or_error) — known-existing probe required"
    return 1
  fi
  pass "in-prefix get-object allowed (class=prefix_get_ok; body discarded)"

  # (3) Out-of-prefix List/Head/Get against known-existing object.
  # List/Head/Get MUST each be explicit AccessDenied (exit 2). Never accept 404/NoSuchKey.
  local out_prefix
  out_prefix="$(dirname "$out_key")"
  [[ "$out_prefix" == "." ]] && out_prefix=""
  set +e
  r2_ro_run_provider "$key" "$secret" "$session" list-prefix \
    --endpoint "$endpoint" --bucket "$bucket" --prefix "${out_prefix:+$out_prefix/}" >/dev/null 2>&1
  rc=$?
  set -e
  if [[ $rc -eq 0 ]]; then
    fail "out-of-prefix list SUCCEEDED (class=broader_list_scope); require AccessDenied"
    return 1
  fi
  if [[ $rc -ne 2 ]]; then
    fail "out-of-prefix list exit ${rc} is not AccessDenied (class=scope_oracle_ambiguous; refuse 404/other)"
    return 1
  fi
  pass "out-of-prefix list AccessDenied (class=prefix_scope_enforced)"

  set +e
  r2_ro_run_provider "$key" "$secret" "$session" head-object \
    --endpoint "$endpoint" --bucket "$bucket" --key "$out_key" >/dev/null 2>&1
  rc=$?
  set -e
  if [[ $rc -eq 0 ]]; then
    fail "out-of-prefix head SUCCEEDED (class=broader_read_scope)"
    return 1
  fi
  if [[ $rc -ne 2 ]]; then
    fail "out-of-prefix head exit ${rc} is not AccessDenied (class=scope_oracle_ambiguous; refuse 404/other)"
    return 1
  fi
  pass "out-of-prefix head AccessDenied (class=prefix_scope_enforced)"
  # Exit 2 (not 404/3) + versioned key binding is the existence+denial dual oracle without writer.
  export R2_SCOPE_PREFLIGHT_OUT_EXISTS="access-denied-not-404"

  set +e
  r2_ro_run_provider "$key" "$secret" "$session" get-object \
    --endpoint "$endpoint" --bucket "$bucket" --key "$out_key" >/dev/null 2>&1
  rc=$?
  set -e
  if [[ $rc -eq 0 ]]; then
    fail "out-of-prefix get SUCCEEDED (class=broader_read_scope)"
    return 1
  fi
  if [[ $rc -ne 2 ]]; then
    fail "out-of-prefix get exit ${rc} is not AccessDenied (class=scope_oracle_ambiguous; refuse 404/other)"
    return 1
  fi
  pass "out-of-prefix get AccessDenied (class=prefix_scope_enforced)"

  # (4) Put/Delete denial on sacrificial drill-neg key.
  info "sacrificial probe key class=drill-neg (REDHAT-FIX-H4; key value not logged)"
  set +e
  printf 'SACRIFICIAL_DRILL_NEG_QA14' | r2_ro_run_provider "$key" "$secret" "$session" put-object \
    --endpoint "$endpoint" --bucket "$bucket" --key "$probe_key" >/dev/null 2>&1
  rc=$?
  set -e
  if [[ $rc -eq 0 ]]; then
    fail "put-object SUCCEEDED (class=put_allowed) — not object-read-only"
    set +e
    r2_ro_run_provider "$key" "$secret" "$session" delete-object \
      --endpoint "$endpoint" --bucket "$bucket" --key "$probe_key" >/dev/null 2>&1
    set -e
    return 1
  fi
  if [[ $rc -ne 2 ]]; then
    fail "put-object exit ${rc} is not AccessDenied (class=put_error_unclassified)"
    return 1
  fi
  pass "put-object AccessDenied (class=access_denied)"

  if ! assert_safe_destructive_probe_key "$probe_key" "delete probe"; then
    return 1
  fi
  set +e
  r2_ro_run_provider "$key" "$secret" "$session" delete-object \
    --endpoint "$endpoint" --bucket "$bucket" --key "$probe_key" >/dev/null 2>&1
  rc=$?
  set -e
  if [[ $rc -eq 0 ]]; then
    fail "delete-object SUCCEEDED (class=delete_allowed) — not object-read-only"
    return 1
  fi
  if [[ $rc -ne 2 ]]; then
    fail "delete-object exit ${rc} is not AccessDenied (class=delete_error_unclassified)"
    return 1
  fi
  pass "delete-object AccessDenied (class=access_denied)"
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

# GATE-FIX-S28R3-QA8/QA9 — credential-tuple identity (not Access Key ID alone).
# Cloudflare temp object-read-only sessions may reuse the parent Access Key ID only when
# the authoritative writer secret is present, restore secret is explicitly unequal, and a
# non-empty session token is present. Unknown writer secret → fail closed (QA9/H1).
# Shape never replaces the live List/Put/Delete oracle.
r2_writer_equivalent_tuple() {
  # args: restore_ak restore_sk restore_st [writer_ak] [writer_sk]
  # return 0 => refuse (writer-equivalent or incomplete); 1 => shape OK
  local rak="${1:-}" rsk="${2:-}" rst="${3:-}" wak="${4:-}" wsk="${5:-}"
  if [[ -z "$rak" || -z "$rsk" ]]; then
    return 0
  fi
  if [[ -n "$wsk" && "$rsk" == "$wsk" ]]; then
    return 0
  fi
  if [[ -n "$wak" && "$rak" == "$wak" ]]; then
    if [[ -z "$rst" ]]; then
      return 0
    fi
    # GATE-FIX-S28R3-QA9 / H1: cannot establish "distinct secret" without writer secret.
    if [[ -z "$wsk" ]]; then
      return 0
    fi
    if [[ "$rsk" == "$wsk" ]]; then
      return 0
    fi
    return 1
  fi
  return 1
}

# Safe non-secret fingerprints — delegate to shared lib (GATE-FIX-S28R3-QA12).
r2_tuple_fp16() { r2_ro_tuple_fp16 "$@"; }
r2_context_fp16() {
  r2_ro_context_fp16 "$1" "$2" "$3" "${4:-object-read-only}" "${5:-}"
}

write_r2_ro_proof_attestation() {
  # GATE-FIX-S28R3-QA12: exclusive no-follow create under trusted private dir only.
  local rak="$1" rsk="$2" rst="$3"
  local out="${HOLO_R2_RO_PROOF_OUT:-}"
  local fp ctx
  if [[ -z "$out" ]]; then
    out="$(r2_ro_new_proof_path)" || return 1
  else
    # GATE-FIX-S28R3-QA17: compare realpaths (callers may pass absolute paths).
    local trusted_real out_parent_real
    trusted_real="$(/usr/bin/python3 -E -s -c 'import os,sys; print(os.path.realpath(sys.argv[1]))' "$R2_RO_TRUSTED_PROOF_DIR")"
    out_parent_real="$(/usr/bin/python3 -E -s -c 'import os,sys; print(os.path.realpath(os.path.dirname(sys.argv[1])))' "$out")"
    if [[ "$out_parent_real" != "$trusted_real" ]]; then
      fail "HOLO_R2_RO_PROOF_OUT must be under trusted .tmp/r2-ro-proofs"
      return 1
    fi
    # Ensure trusted private dir mode before exclusive create.
    r2_ro_ensure_private_proof_dir >/dev/null || return 1
    if [[ -e "$out" ]]; then
      fail "HOLO_R2_RO_PROOF_OUT already exists (refuse truncate/follow)"
      return 1
    fi
  fi
  fp="$(r2_ro_tuple_fp16 "$rak" "$rsk" "$rst")"
  if [[ -z "$fp" || "${#fp}" -lt 8 ]]; then
    fail "unable to compute non-secret tuple fingerprint for RO proof attestation"
    return 1
  fi
  if [[ -n "${HOLO_R2_CONTEXT_FP16:-}" ]]; then
    ctx="${HOLO_R2_CONTEXT_FP16}"
  else
    local established
    if ! established="$(r2_ro_establish_canonical_context)"; then
      fail "unable to establish canonical R2 context for proof"
      return 1
    fi
    ctx="$(printf '%s' "$established" | awk -F'\t' '{print $6}')"
  fi
  if [[ -z "$ctx" || "${#ctx}" -lt 8 ]]; then
    fail "unable to compute non-secret context fingerprint for RO proof attestation"
    return 1
  fi
  r2_ro_write_proof_exclusive "$out" "$fp" "$ctx"
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
  if [[ -n "${BACKUP_R2_ACCESS_KEY_ID:-}" && "$AK" == "$BACKUP_R2_ACCESS_KEY_ID" && -z "${BACKUP_R2_SECRET_ACCESS_KEY:-}" ]]; then
    fail "GATE-FIX-S28R3-QA9: same parent Access Key ID without authoritative writer secret (cannot establish distinct restore secret)"
  elif [[ -n "${BACKUP_R2_SECRET_ACCESS_KEY:-}" && "$SK" == "$BACKUP_R2_SECRET_ACCESS_KEY" ]]; then
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
  info "GATE-FIX-S28R3-QA8/QA9: Cloudflare temporary credential tuple shape (same parent AK; writer secret present and unequal; session present) — live Put/Delete oracle required"
fi

# Establish canonical context (endpoint/bucket/prefix/policy) before probe.
if ! r2_ro_init_trusted_helpers; then
  echo "RESIDUAL: DEPENDENCY-S28-R2-RO"
  echo "=== RESULT: FAIL (trusted helper chain) ==="
  exit 1
fi
CANON_CTX_LINE=""
if ! CANON_CTX_LINE="$(R2_ENDPOINT="$ENDPOINT" R2_BUCKET_NAME="${BUCKET:-holocron-backup}"   R2_ACCOUNT_ID="${R2_ACCOUNT_ID:-}"   R2_RESTORE_OBJECT_PREFIX="${R2_RESTORE_OBJECT_PREFIX:-${R2_PGBACKREST_PREFIX:-pgbackrest}}"   R2_CREDENTIAL_KIND="${R2_CREDENTIAL_KIND:-object-read-only}"   R2_CREDENTIAL_POLICY="${R2_CREDENTIAL_POLICY:-}"   r2_ro_establish_canonical_context)"; then
  echo "RESIDUAL: DEPENDENCY-S28-R2-RO"
  echo "=== RESULT: FAIL (canonical context refused) ==="
  exit 1
fi
CANON_EP="$(printf '%s' "$CANON_CTX_LINE" | awk -F'	' '{print $1}')"
CANON_BUCKET="$(printf '%s' "$CANON_CTX_LINE" | awk -F'	' '{print $2}')"
CANON_PREFIX="$(printf '%s' "$CANON_CTX_LINE" | awk -F'	' '{print $3}')"
CANON_KIND="$(printf '%s' "$CANON_CTX_LINE" | awk -F'	' '{print $4}')"
CANON_POLICY="$(printf '%s' "$CANON_CTX_LINE" | awk -F'	' '{print $5}')"
HOLO_R2_CONTEXT_FP16="$(printf '%s' "$CANON_CTX_LINE" | awk -F'	' '{print $6}')"
export HOLO_R2_CONTEXT_FP16
ENDPOINT="$CANON_EP"
BUCKET="$CANON_BUCKET"
export R2_RESTORE_OBJECT_PREFIX="$CANON_PREFIX"
export R2_PGBACKREST_PREFIX="$CANON_PREFIX"
export R2_CREDENTIAL_KIND="$CANON_KIND"
export R2_CREDENTIAL_POLICY="$CANON_POLICY"
# Parent-shell bind: establish_canonical_context runs in a subshell so exports do not stick.
if ! r2_ro_bind_scope_probes; then
  echo "RESIDUAL: DEPENDENCY-S28-R2-RO"
  echo "=== RESULT: FAIL (versioned scope probe bind refused) ==="
  exit 1
fi

if ! run_live_probe "$AK" "$SK" "$ENDPOINT" "$BUCKET" "$ST" "$CANON_PREFIX"; then
  if [[ -n "${BACKUP_R2_SECRET_ACCESS_KEY:-}" && "$SK" == "$BACKUP_R2_SECRET_ACCESS_KEY" ]]; then
    fail "probed identity is the backup read-write secret — mint a distinct object-read-only token"
    human_required_mint
  fi
  echo "=== RESULT: FAIL (live R2 read-only proof) ==="
  exit 1
fi

# Success path: live List allowed + Put/Delete denied is the permission oracle.
if [[ -n "${BACKUP_R2_ACCESS_KEY_ID:-}" ]]; then
  if [[ "$AK" == "$BACKUP_R2_ACCESS_KEY_ID" ]]; then
    if [[ -z "${BACKUP_R2_SECRET_ACCESS_KEY:-}" ]]; then
      fail "GATE-FIX-S28R3-QA9: post-probe same parent AK without writer secret — refuse"
      echo "=== RESULT: FAIL ==="
      exit 1
    fi
    if [[ "$SK" == "$BACKUP_R2_SECRET_ACCESS_KEY" ]]; then
      fail "credentials equal backup RW identity after live probe — writer-equivalent tuple"
      echo "=== RESULT: FAIL ==="
      exit 1
    fi
    pass "GATE-FIX-S28R3-QA8/QA9: Cloudflare temporary RO tuple (same parent AK) passed live List/Put/Delete oracle"
  else
    pass "restore RO access key differs from backup R2_ACCESS_KEY_ID"
  fi
else
  info "backup RW key not loaded — distinctness checked only via Put/Delete denial"
fi

# GATE-FIX-S28R3-QA9 / M1: optional/default proof attestation bound to tuple fingerprint.
if ! write_r2_ro_proof_attestation "$AK" "$SK" "$ST"; then
  echo "=== RESULT: FAIL (proof attestation write) ==="
  exit 1
fi

echo "=== RESULT: PASS (live R2 prefix List+Head+Get allowed; out-of-prefix AccessDenied; Put/Delete AccessDenied) ==="
exit 0

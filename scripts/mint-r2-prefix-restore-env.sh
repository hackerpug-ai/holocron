#!/bin/bash
# Mint a temporary Cloudflare R2 restore tuple scoped to pgbackrest/ and export
# it into the current shell. Source this file; credential values are never logged.

_holo_mint_r2_prefix_restore_env() {
  local had_errexit=0
  [[ "$-" == *e* ]] && had_errexit=1

  local script_dir root ROOT
  script_dir="${BASH_SOURCE[0]%/*}"
  [[ "$script_dir" == "${BASH_SOURCE[0]}" ]] && script_dir="."
  root="$(cd "$script_dir/.." && pwd)" || return 2
  ROOT="$root"
  # shellcheck source=scripts/lib/r2-ro-live.sh
  source "$root/scripts/lib/r2-ro-live.sh"
  r2_ro_init_trusted_helpers >/dev/null || return 2

  local account="${R2_ACCOUNT_ID:-}"
  local bucket="${R2_BUCKET_NAME:-holocron-backup}"
  local parent="${R2_PARENT_ACCESS_KEY_ID:-${BACKUP_R2_ACCESS_KEY_ID:-}}"
  local token="${CLOUDFLARE_API_TOKEN:-}"
  local ttl="${R2_RO_TTL_SECONDS:-21600}"
  if [[ -z "$account" || -z "$parent" || -z "$token" ]]; then
    echo "error: prefix-scoped R2 mint requires R2_ACCOUNT_ID, CLOUDFLARE_API_TOKEN, and R2_PARENT_ACCESS_KEY_ID or BACKUP_R2_ACCESS_KEY_ID" >&2
    return 2
  fi
  if [[ ! "$ttl" =~ ^[0-9]+$ || "$ttl" -lt 900 || "$ttl" -gt 604800 ]]; then
    echo "error: R2_RO_TTL_SECONDS must be an integer from 900 through 604800" >&2
    return 2
  fi

  # Preserve the caller's complete durable read-only tuple for the full
  # fire-drill data plane before replacing R2_RESTORE_* with the narrower
  # pgbackrest-only proof tuple. Never preserve a partial tuple.
  if [[ -n "${R2_RESTORE_ACCESS_KEY_ID:-}" && -n "${R2_RESTORE_SECRET_ACCESS_KEY:-}" ]]; then
    export R2_FIRE_DRILL_DATA_ACCESS_KEY_ID="$R2_RESTORE_ACCESS_KEY_ID"
    export R2_FIRE_DRILL_DATA_SECRET_ACCESS_KEY="$R2_RESTORE_SECRET_ACCESS_KEY"
    if [[ -n "${R2_RESTORE_SESSION_TOKEN:-}" ]]; then
      export R2_FIRE_DRILL_DATA_SESSION_TOKEN="$R2_RESTORE_SESSION_TOKEN"
    else
      unset R2_FIRE_DRILL_DATA_SESSION_TOKEN 2>/dev/null || true
    fi
  elif [[ -n "${R2_RESTORE_ACCESS_KEY_ID:-}" || -n "${R2_RESTORE_SECRET_ACCESS_KEY:-}" || -n "${R2_RESTORE_SESSION_TOKEN:-}" ]]; then
    echo "error: refusing to mint over a partial R2_RESTORE_* tuple" >&2
    return 2
  fi

  local isolated_home="${HOME:-/tmp}"
  local PATH=/usr/bin:/bin
  local HOME="$isolated_home"
  local LC_ALL=C
  local MINT_BUCKET="$bucket"
  local MINT_PARENT_ACCESS_KEY_ID="$parent"
  local MINT_TTL_SECONDS="$ttl"
  local CF_API_TOKEN="$token"
  local CF_ACCOUNT_ID="$account"
  local MINT_BODY MINT_RESP
  export MINT_BUCKET MINT_PARENT_ACCESS_KEY_ID MINT_TTL_SECONDS
  export PATH HOME LC_ALL
  local body
  if ! body="$(r2_ro_exec_isolated_from_env \
    PATH HOME LC_ALL MINT_BUCKET MINT_PARENT_ACCESS_KEY_ID MINT_TTL_SECONDS -- \
    /usr/bin/python3 -E -s -c '
import json, os
print(json.dumps({
    "bucket": os.environ["MINT_BUCKET"],
    "parentAccessKeyId": os.environ["MINT_PARENT_ACCESS_KEY_ID"],
    "permission": "object-read-only",
    "prefixes": ["pgbackrest/"],
    "ttlSeconds": int(os.environ["MINT_TTL_SECONDS"]),
}))
')"; then
    echo "error: unable to construct prefix-scoped R2 mint request" >&2
    [[ "$had_errexit" -eq 1 ]] && set -e
    return 2
  fi

  local resp helper http_code mint_rc
  resp="$(/usr/bin/mktemp -t r2-ro-prefix-mint.XXXXXX)" || {
    [[ "$had_errexit" -eq 1 ]] && set -e
    return 2
  }
  /bin/chmod 600 "$resp" || {
    /bin/rm -f "$resp"
    [[ "$had_errexit" -eq 1 ]] && set -e
    return 2
  }
  helper="$root/scripts/lib/r2-mint-temp-ro.py"
  if [[ ! -f "$helper" ]]; then
    /bin/rm -f "$resp"
    echo "error: missing trusted R2 mint helper" >&2
    [[ "$had_errexit" -eq 1 ]] && set -e
    return 2
  fi
  MINT_BODY="$body"
  MINT_RESP="$resp"
  export CF_API_TOKEN CF_ACCOUNT_ID MINT_BODY MINT_RESP
  if http_code="$(r2_ro_exec_isolated_from_env \
    PATH HOME LC_ALL CF_API_TOKEN CF_ACCOUNT_ID MINT_BODY MINT_RESP -- \
    /usr/bin/python3 -E -s "$helper")"; then
    mint_rc=0
  else
    mint_rc=$?
  fi
  if [[ "$mint_rc" -ne 0 || ! "$http_code" =~ ^2[0-9][0-9]$ ]]; then
    /bin/rm -f "$resp"
    echo "error: prefix-scoped R2 mint failed (http=${http_code:-000}; class=request_failed; values not logged)" >&2
    [[ "$had_errexit" -eq 1 ]] && set -e
    return 2
  fi

  local parsed parse_rc
  if parsed="$(/usr/bin/env -i PATH=/usr/bin:/bin HOME="${HOME:-/tmp}" LC_ALL=C \
    MINT_PARSE_RESP="$resp" /usr/bin/python3 -E -s -c '
import json, os, sys
try:
    doc = json.load(open(os.environ["MINT_PARSE_RESP"], encoding="utf-8"))
except Exception:
    sys.exit(2)
result = doc.get("result") or {}
values = [result.get("accessKeyId") or "", result.get("secretAccessKey") or "", result.get("sessionToken") or ""]
if not all(values):
    sys.exit(3)
print("\t".join(values))
')"; then
    parse_rc=0
  else
    parse_rc=$?
  fi
  /bin/rm -f "$resp"
  if [[ "$parse_rc" -ne 0 ]]; then
    echo "error: prefix-scoped R2 mint response invalid (class=parse_failed; values not logged)" >&2
    [[ "$had_errexit" -eq 1 ]] && set -e
    return 2
  fi

  # Mint a second temporary read-only tuple for the complete restore data
  # plane. The proof tuple remains pgbackrest-only so the exact-scope gate is
  # honest; this tuple is separately live-probed by the fire-drill runner.
  local data_body data_resp data_http_code data_mint_rc data_parsed data_parse_rc
  if ! data_body="$(r2_ro_exec_isolated_from_env \
    PATH HOME LC_ALL MINT_BUCKET MINT_PARENT_ACCESS_KEY_ID MINT_TTL_SECONDS -- \
    /usr/bin/python3 -E -s -c '
import json, os
print(json.dumps({
    "bucket": os.environ["MINT_BUCKET"],
    "parentAccessKeyId": os.environ["MINT_PARENT_ACCESS_KEY_ID"],
    "permission": "object-read-only",
    "prefixes": ["pgbackrest/", "recovery-baselines/", "restic/"],
    "ttlSeconds": int(os.environ["MINT_TTL_SECONDS"]),
}))
')"; then
    echo "error: unable to construct fire-drill data R2 mint request" >&2
    [[ "$had_errexit" -eq 1 ]] && set -e
    return 2
  fi
  data_resp="$(/usr/bin/mktemp -t r2-ro-fire-drill-mint.XXXXXX)" || {
    [[ "$had_errexit" -eq 1 ]] && set -e
    return 2
  }
  /bin/chmod 600 "$data_resp" || {
    /bin/rm -f "$data_resp"
    [[ "$had_errexit" -eq 1 ]] && set -e
    return 2
  }
  MINT_BODY="$data_body"
  MINT_RESP="$data_resp"
  export MINT_BODY MINT_RESP
  if data_http_code="$(r2_ro_exec_isolated_from_env \
    PATH HOME LC_ALL CF_API_TOKEN CF_ACCOUNT_ID MINT_BODY MINT_RESP -- \
    /usr/bin/python3 -E -s "$helper")"; then
    data_mint_rc=0
  else
    data_mint_rc=$?
  fi
  if [[ "$data_mint_rc" -ne 0 || ! "$data_http_code" =~ ^2[0-9][0-9]$ ]]; then
    /bin/rm -f "$data_resp"
    echo "error: fire-drill data R2 mint failed (http=${data_http_code:-000}; class=request_failed; values not logged)" >&2
    [[ "$had_errexit" -eq 1 ]] && set -e
    return 2
  fi
  if data_parsed="$(/usr/bin/env -i PATH=/usr/bin:/bin HOME="${HOME:-/tmp}" LC_ALL=C \
    MINT_PARSE_RESP="$data_resp" /usr/bin/python3 -E -s -c '
import json, os, sys
try:
    doc = json.load(open(os.environ["MINT_PARSE_RESP"], encoding="utf-8"))
except Exception:
    sys.exit(2)
result = doc.get("result") or {}
values = [result.get("accessKeyId") or "", result.get("secretAccessKey") or "", result.get("sessionToken") or ""]
if not all(values):
    sys.exit(3)
print("\t".join(values))
')"; then
    data_parse_rc=0
  else
    data_parse_rc=$?
  fi
  /bin/rm -f "$data_resp"
  if [[ "$data_parse_rc" -ne 0 ]]; then
    echo "error: fire-drill data R2 mint response invalid (class=parse_failed; values not logged)" >&2
    [[ "$had_errexit" -eq 1 ]] && set -e
    return 2
  fi
  IFS=$'\t' read -r R2_FIRE_DRILL_DATA_ACCESS_KEY_ID R2_FIRE_DRILL_DATA_SECRET_ACCESS_KEY R2_FIRE_DRILL_DATA_SESSION_TOKEN <<<"$data_parsed"
  if [[ -z "$R2_FIRE_DRILL_DATA_ACCESS_KEY_ID" || -z "$R2_FIRE_DRILL_DATA_SECRET_ACCESS_KEY" || -z "$R2_FIRE_DRILL_DATA_SESSION_TOKEN" ]]; then
    echo "error: fire-drill data R2 mint returned an incomplete tuple" >&2
    [[ "$had_errexit" -eq 1 ]] && set -e
    return 2
  fi
  export R2_FIRE_DRILL_DATA_ACCESS_KEY_ID R2_FIRE_DRILL_DATA_SECRET_ACCESS_KEY R2_FIRE_DRILL_DATA_SESSION_TOKEN

  IFS=$'\t' read -r R2_RESTORE_ACCESS_KEY_ID R2_RESTORE_SECRET_ACCESS_KEY R2_RESTORE_SESSION_TOKEN <<<"$parsed"
  if [[ -z "$R2_RESTORE_ACCESS_KEY_ID" || -z "$R2_RESTORE_SECRET_ACCESS_KEY" || -z "$R2_RESTORE_SESSION_TOKEN" ]]; then
    echo "error: prefix-scoped R2 mint returned an incomplete tuple" >&2
    [[ "$had_errexit" -eq 1 ]] && set -e
    return 2
  fi
  export R2_RESTORE_ACCESS_KEY_ID R2_RESTORE_SECRET_ACCESS_KEY R2_RESTORE_SESSION_TOKEN
  export R2_CREDENTIAL_KIND=object-read-only
  unset R2_SCOPE_PROBE_IN_KEY R2_SCOPE_PROBE_OUT_KEY 2>/dev/null || true
  echo "PASS: minted temporary pgbackrest proof + fire-drill data object-read-only R2 tuples (ttl=${ttl}s; values not logged)"
  [[ "$had_errexit" -eq 1 ]] && set -e
  return 0
}

_holo_mint_r2_prefix_restore_env
_holo_mint_rc=$?
unset -f _holo_mint_r2_prefix_restore_env
return "$_holo_mint_rc" 2>/dev/null || exit "$_holo_mint_rc"

#!/bin/bash
# Shared Cloudflare R2 temporary-credential mint primitive.
# Source after r2-ro-live.sh; tuple values are returned only through stdout for capture.

r2_mint_temp_credential() {
  local permission="${1:?permission required}"
  local prefixes_json="${2:?prefixes JSON required}"
  local account="${R2_ACCOUNT_ID:-}"
  local bucket="${R2_BUCKET_NAME:-holocron-backup}"
  local parent="${R2_PARENT_ACCESS_KEY_ID:-${BACKUP_R2_ACCESS_KEY_ID:-}}"
  local token="${CLOUDFLARE_API_TOKEN:-}"
  local ttl="${R2_RO_TTL_SECONDS:-21600}"
  if [[ -z "$account" || -z "$parent" || -z "$token" ]]; then
    echo "error: R2 temporary credential mint requires account, parent key, and API token" >&2
    return 2
  fi
  if [[ ! "$ttl" =~ ^[0-9]+$ || "$ttl" -lt 900 || "$ttl" -gt 604800 ]]; then
    echo "error: R2_RO_TTL_SECONDS must be an integer from 900 through 604800" >&2
    return 2
  fi

  local body
  if ! body="$(MINT_BUCKET="$bucket" MINT_PARENT_ACCESS_KEY_ID="$parent" \
    MINT_PERMISSION="$permission" MINT_PREFIXES_JSON="$prefixes_json" MINT_TTL_SECONDS="$ttl" \
    /usr/bin/python3 -E -s -c '
import json, os
prefixes = json.loads(os.environ["MINT_PREFIXES_JSON"])
if not isinstance(prefixes, list) or not prefixes or not all(isinstance(v, str) and v for v in prefixes):
    raise SystemExit(2)
print(json.dumps({
    "bucket": os.environ["MINT_BUCKET"],
    "parentAccessKeyId": os.environ["MINT_PARENT_ACCESS_KEY_ID"],
    "permission": os.environ["MINT_PERMISSION"],
    "prefixes": prefixes,
    "ttlSeconds": int(os.environ["MINT_TTL_SECONDS"]),
}))
')"; then
    echo "error: unable to construct R2 temporary credential request" >&2
    return 2
  fi

  local response helper http_code mint_rc parsed parse_rc
  response="$(/usr/bin/mktemp -t r2-temp-mint.XXXXXX)" || return 2
  /bin/chmod 600 "$response" || {
    /bin/rm -f "$response"
    return 2
  }
  helper="${ROOT:?ROOT required}/scripts/lib/r2-mint-temp-ro.py"
  if [[ ! -f "$helper" ]]; then
    /bin/rm -f "$response"
    echo "error: missing trusted R2 mint helper" >&2
    return 2
  fi

  export CF_API_TOKEN="$token" CF_ACCOUNT_ID="$account" MINT_BODY="$body" MINT_RESP="$response"
  if http_code="$(r2_ro_exec_isolated_from_env \
    CF_API_TOKEN CF_ACCOUNT_ID MINT_BODY MINT_RESP -- \
    /usr/bin/python3 -E -s "$helper")"; then
    mint_rc=0
  else
    mint_rc=$?
  fi
  if [[ "$mint_rc" -ne 0 || ! "$http_code" =~ ^2[0-9][0-9]$ ]]; then
    /bin/rm -f "$response"
    echo "error: R2 temporary credential mint failed (http=${http_code:-000}; values not logged)" >&2
    return 2
  fi

  if parsed="$(MINT_PARSE_RESP="$response" /usr/bin/python3 -E -s -c '
import json, os
result = json.load(open(os.environ["MINT_PARSE_RESP"], encoding="utf-8")).get("result") or {}
values = [result.get("accessKeyId") or "", result.get("secretAccessKey") or "", result.get("sessionToken") or ""]
if not all(values):
    raise SystemExit(2)
print("\t".join(values))
')"; then
    parse_rc=0
  else
    parse_rc=$?
  fi
  /bin/rm -f "$response"
  if [[ "$parse_rc" -ne 0 ]]; then
    echo "error: R2 temporary credential response invalid (values not logged)" >&2
    return 2
  fi
  printf '%s' "$parsed"
}

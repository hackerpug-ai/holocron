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
  # shellcheck source=scripts/lib/r2-mint-temp-credential.sh
  source "$root/scripts/lib/r2-mint-temp-credential.sh"

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

  local integration_prefix="${HOLO_GO_NO_GO_R2_PGBACKREST_PREFIX:-}"
  integration_prefix="${integration_prefix#/}"
  integration_prefix="${integration_prefix%/}"
  if [[ -n "$integration_prefix" && "$integration_prefix" != integration/* ]]; then
    echo "error: integration R2 prefix must start with integration/" >&2
    return 2
  fi

  local proof_tuple data_prefixes data_tuple integration_writer_tuple
  if ! proof_tuple="$(r2_mint_temp_credential object-read-only '["pgbackrest/"]')"; then
    [[ "$had_errexit" -eq 1 ]] && set -e
    return 2
  fi
  data_prefixes="$(MINT_INTEGRATION_PREFIX="$integration_prefix" /usr/bin/python3 -E -s -c '
import json, os
prefixes = ["pgbackrest/", "recovery-baselines/", "restic/"]
integration = os.environ.get("MINT_INTEGRATION_PREFIX") or ""
if integration:
    prefixes.append(integration.rstrip("/") + "/")
print(json.dumps(prefixes))
')"
  if ! data_tuple="$(r2_mint_temp_credential object-read-only "$data_prefixes")"; then
    [[ "$had_errexit" -eq 1 ]] && set -e
    return 2
  fi

  IFS=$'\t' read -r R2_RESTORE_ACCESS_KEY_ID R2_RESTORE_SECRET_ACCESS_KEY R2_RESTORE_SESSION_TOKEN <<<"$proof_tuple"
  if [[ -z "$R2_RESTORE_ACCESS_KEY_ID" || -z "$R2_RESTORE_SECRET_ACCESS_KEY" || -z "$R2_RESTORE_SESSION_TOKEN" ]]; then
    echo "error: prefix-scoped R2 mint returned an incomplete tuple" >&2
    [[ "$had_errexit" -eq 1 ]] && set -e
    return 2
  fi
  export R2_RESTORE_ACCESS_KEY_ID R2_RESTORE_SECRET_ACCESS_KEY R2_RESTORE_SESSION_TOKEN

  IFS=$'\t' read -r R2_FIRE_DRILL_DATA_ACCESS_KEY_ID R2_FIRE_DRILL_DATA_SECRET_ACCESS_KEY R2_FIRE_DRILL_DATA_SESSION_TOKEN <<<"$data_tuple"
  if [[ -z "$R2_FIRE_DRILL_DATA_ACCESS_KEY_ID" || -z "$R2_FIRE_DRILL_DATA_SECRET_ACCESS_KEY" || -z "$R2_FIRE_DRILL_DATA_SESSION_TOKEN" ]]; then
    echo "error: fire-drill data R2 mint returned an incomplete tuple" >&2
    [[ "$had_errexit" -eq 1 ]] && set -e
    return 2
  fi
  export R2_FIRE_DRILL_DATA_ACCESS_KEY_ID R2_FIRE_DRILL_DATA_SECRET_ACCESS_KEY R2_FIRE_DRILL_DATA_SESSION_TOKEN

  if [[ -n "$integration_prefix" ]]; then
    if ! integration_writer_tuple="$(r2_mint_temp_credential object-read-write "[\"${integration_prefix}/\"]")"; then
      [[ "$had_errexit" -eq 1 ]] && set -e
      return 2
    fi
    IFS=$'\t' read -r R2_INTEGRATION_ACCESS_KEY_ID R2_INTEGRATION_SECRET_ACCESS_KEY R2_INTEGRATION_SESSION_TOKEN <<<"$integration_writer_tuple"
    if [[ -z "$R2_INTEGRATION_ACCESS_KEY_ID" || -z "$R2_INTEGRATION_SECRET_ACCESS_KEY" || -z "$R2_INTEGRATION_SESSION_TOKEN" ]]; then
      echo "error: integration R2 writer mint returned an incomplete tuple" >&2
      [[ "$had_errexit" -eq 1 ]] && set -e
      return 2
    fi
    export R2_INTEGRATION_ACCESS_KEY_ID R2_INTEGRATION_SECRET_ACCESS_KEY R2_INTEGRATION_SESSION_TOKEN
    export R2_INTEGRATION_RESTORE_ACCESS_KEY_ID="$R2_FIRE_DRILL_DATA_ACCESS_KEY_ID"
    export R2_INTEGRATION_RESTORE_SECRET_ACCESS_KEY="$R2_FIRE_DRILL_DATA_SECRET_ACCESS_KEY"
    export R2_INTEGRATION_RESTORE_SESSION_TOKEN="$R2_FIRE_DRILL_DATA_SESSION_TOKEN"
  fi

  export R2_CREDENTIAL_KIND=object-read-only
  unset R2_SCOPE_PROBE_IN_KEY R2_SCOPE_PROBE_OUT_KEY 2>/dev/null || true
  echo "PASS: minted temporary pgbackrest proof, fire-drill read, and isolated integration R2 tuples (values not logged)"
  [[ "$had_errexit" -eq 1 ]] && set -e
  return 0
}

_holo_mint_r2_prefix_restore_env
_holo_mint_rc=$?
unset -f _holo_mint_r2_prefix_restore_env
return "$_holo_mint_rc" 2>/dev/null || exit "$_holo_mint_rc"

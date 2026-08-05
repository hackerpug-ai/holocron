#!/usr/bin/env bash
# Wait for Convex's post-deploy function catalog to contain every required
# identifier. Self-hosted deployments can briefly return a partial catalog
# immediately after `convex dev --once` reports ready.
#
# Catalog greps use bash here-strings (<<<"$function_spec") — do not pipe via
# printf|grep (freshness oracle REDHAT-FIX-S29-R2-H01 / R3-C01). Large catalogs
# (~750KB) fit in modern bash command substitution; raise timeout if needed.
set -Eeuo pipefail

# Large self-hosted/cloud catalogs (~2–20s per fetch) need headroom after
# `convex dev --once` reports ready — partial catalogs (~100–200KB) are common
# for several minutes while the full ~750KB migrationFence catalog indexes.
timeout_seconds="${CONVEX_FUNCTION_SPEC_TIMEOUT_SECONDS:-600}"
poll_seconds="${CONVEX_FUNCTION_SPEC_POLL_SECONDS:-3}"
# Brief settle so the first poll is less likely to hit a mid-deploy snapshot.
settle_seconds="${CONVEX_FUNCTION_SPEC_SETTLE_SECONDS:-5}"

[[ "$timeout_seconds" =~ ^[1-9][0-9]*$ ]] \
  || { echo "wait-convex-function-spec: timeout must be a positive integer" >&2; exit 2; }
[[ "$poll_seconds" =~ ^[1-9][0-9]*$ ]] \
  || { echo "wait-convex-function-spec: poll interval must be a positive integer" >&2; exit 2; }
[[ "$settle_seconds" =~ ^[0-9]+$ ]] \
  || { echo "wait-convex-function-spec: settle must be a non-negative integer" >&2; exit 2; }
[[ "$#" -gt 0 ]] \
  || { echo "wait-convex-function-spec: at least one function identifier is required" >&2; exit 2; }

function_spec=""
missing_identifier=""
err_file="$(mktemp "${TMPDIR:-/tmp}/convex-function-spec-err.XXXXXX")"
cleanup() { rm -f "$err_file"; }
trap cleanup EXIT

if [[ "$settle_seconds" -gt 0 ]]; then
  sleep "$settle_seconds"
fi
# Deadline starts after settle so short unit-test timeouts remain meaningful.
deadline=$(( $(date +%s) + timeout_seconds ))

while true; do
  if ! function_spec="$(pnpm exec convex function-spec 2>"$err_file")"; then
    missing_identifier="(function-spec command failed)"
    function_spec=""
  elif [[ -z "$function_spec" ]]; then
    missing_identifier="(function-spec returned empty catalog)"
  else
    missing_identifier=""
    for function_identifier in "$@"; do
      if ! grep -F "\"identifier\": \"$function_identifier\"" \
        <<<"$function_spec" >/dev/null; then
        missing_identifier="$function_identifier"
        break
      fi
    done
  fi

  if [[ -z "$missing_identifier" ]]; then
    printf '%s' "$function_spec"
    exit 0
  fi

  if [[ "$(date +%s)" -ge "$deadline" ]]; then
    bytes="${#function_spec}"
    echo "wait-convex-function-spec: timed out waiting for complete catalog; missing $missing_identifier (catalog_bytes=$bytes)" >&2
    if [[ -s "$err_file" ]]; then
      echo "wait-convex-function-spec: last function-spec stderr:" >&2
      tail -n 20 "$err_file" >&2 || true
    fi
    exit 1
  fi
  sleep "$poll_seconds"
done

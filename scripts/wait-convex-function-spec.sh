#!/usr/bin/env bash
# Wait for Convex's post-deploy function catalog to contain every required
# identifier. Self-hosted deployments can briefly return a partial catalog
# immediately after `convex dev --once` reports ready.
set -Eeuo pipefail

timeout_seconds="${CONVEX_FUNCTION_SPEC_TIMEOUT_SECONDS:-60}"
poll_seconds="${CONVEX_FUNCTION_SPEC_POLL_SECONDS:-1}"

[[ "$timeout_seconds" =~ ^[1-9][0-9]*$ ]] \
  || { echo "wait-convex-function-spec: timeout must be a positive integer" >&2; exit 2; }
[[ "$poll_seconds" =~ ^[1-9][0-9]*$ ]] \
  || { echo "wait-convex-function-spec: poll interval must be a positive integer" >&2; exit 2; }
[[ "$#" -gt 0 ]] \
  || { echo "wait-convex-function-spec: at least one function identifier is required" >&2; exit 2; }

deadline=$(( $(date +%s) + timeout_seconds ))
function_spec=""
missing_identifier=""

while true; do
  function_spec="$(pnpm exec convex function-spec)"
  missing_identifier=""

  for function_identifier in "$@"; do
    if ! grep -F "\"identifier\": \"$function_identifier\"" \
      <<<"$function_spec" >/dev/null; then
      missing_identifier="$function_identifier"
      break
    fi
  done

  if [[ -z "$missing_identifier" ]]; then
    printf '%s' "$function_spec"
    exit 0
  fi

  if [[ "$(date +%s)" -ge "$deadline" ]]; then
    echo "wait-convex-function-spec: timed out waiting for complete catalog; missing $missing_identifier" >&2
    exit 1
  fi
  sleep "$poll_seconds"
done

#!/usr/bin/env bash
# Wait for Convex's post-deploy function catalog to contain every required
# identifier. Self-hosted deployments can briefly return a partial catalog
# immediately after `convex dev --once` reports ready.
set -Eeuo pipefail

# Large self-hosted/cloud catalogs (~750KB, ~20s per fetch) need headroom after
# `convex dev --once` reports ready — partial catalogs are common for ~1–2 min.
timeout_seconds="${CONVEX_FUNCTION_SPEC_TIMEOUT_SECONDS:-300}"
poll_seconds="${CONVEX_FUNCTION_SPEC_POLL_SECONDS:-2}"

[[ "$timeout_seconds" =~ ^[1-9][0-9]*$ ]] \
  || { echo "wait-convex-function-spec: timeout must be a positive integer" >&2; exit 2; }
[[ "$poll_seconds" =~ ^[1-9][0-9]*$ ]] \
  || { echo "wait-convex-function-spec: poll interval must be a positive integer" >&2; exit 2; }
[[ "$#" -gt 0 ]] \
  || { echo "wait-convex-function-spec: at least one function identifier is required" >&2; exit 2; }

deadline=$(( $(date +%s) + timeout_seconds ))
missing_identifier=""
# Large catalogs can overflow bash command-substitution capture; always use a temp file.
spec_file="$(mktemp "${TMPDIR:-/tmp}/convex-function-spec.XXXXXX")"
err_file="$(mktemp "${TMPDIR:-/tmp}/convex-function-spec-err.XXXXXX")"
cleanup() { rm -f "$spec_file" "$err_file"; }
trap cleanup EXIT

while true; do
  # Prefer CLI write-to-file path; capture stderr for diagnostics on timeout.
  if ! pnpm exec convex function-spec >"$spec_file" 2>"$err_file"; then
    missing_identifier="(function-spec command failed)"
  elif [[ ! -s "$spec_file" ]]; then
    missing_identifier="(function-spec returned empty catalog)"
  else
    missing_identifier=""
    for function_identifier in "$@"; do
      if ! grep -F "\"identifier\": \"$function_identifier\"" \
        "$spec_file" >/dev/null 2>&1; then
        missing_identifier="$function_identifier"
        break
      fi
    done
  fi

  if [[ -z "$missing_identifier" ]]; then
    cat "$spec_file"
    exit 0
  fi

  if [[ "$(date +%s)" -ge "$deadline" ]]; then
    bytes="$(wc -c <"$spec_file" 2>/dev/null | tr -d ' ' || echo 0)"
    echo "wait-convex-function-spec: timed out waiting for complete catalog; missing $missing_identifier (catalog_bytes=$bytes)" >&2
    if [[ -s "$err_file" ]]; then
      echo "wait-convex-function-spec: last function-spec stderr:" >&2
      tail -n 20 "$err_file" >&2 || true
    fi
    exit 1
  fi
  sleep "$poll_seconds"
done

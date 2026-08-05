#!/usr/bin/env bash
# Wait for Convex's post-deploy function catalog to contain every required
# identifier. Self-hosted deployments can briefly return a partial catalog
# immediately after `convex dev --once` reports ready.
#
# IMPORTANT: Do NOT capture the full catalog via bash command substitution
# (`spec="$(pnpm exec convex function-spec)"`). On macOS/bash that truncates
# around ~170KB while the real catalog is ~750KB — greps then falsely report
# missing migrationFence/* forever. Always write the CLI output to a temp file.
#
# Catalog greps use bash here-strings (<<<"$function_spec") over the *verified
# identifier lines only* — do not pipe via printf|grep (freshness oracle
# REDHAT-FIX-S29-R2-H01 / R3-C01).
set -Eeuo pipefail

# Large self-hosted/cloud catalogs (~2–20s per fetch) need headroom after
# `convex dev --once` reports ready — partial catalogs are common for minutes.
timeout_seconds="${CONVEX_FUNCTION_SPEC_TIMEOUT_SECONDS:-600}"
poll_seconds="${CONVEX_FUNCTION_SPEC_POLL_SECONDS:-3}"
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
spec_file="$(mktemp "${TMPDIR:-/tmp}/convex-function-spec.XXXXXX")"
err_file="$(mktemp "${TMPDIR:-/tmp}/convex-function-spec-err.XXXXXX")"
cleanup() { rm -f "$spec_file" "$err_file"; }
trap cleanup EXIT

if [[ "$settle_seconds" -gt 0 ]]; then
  sleep "$settle_seconds"
fi
# Deadline starts after settle so short unit-test timeouts remain meaningful.
deadline=$(( $(date +%s) + timeout_seconds ))

while true; do
  if ! pnpm exec convex function-spec >"$spec_file" 2>"$err_file"; then
    missing_identifier="(function-spec command failed)"
    function_spec=""
  elif [[ ! -s "$spec_file" ]]; then
    missing_identifier="(function-spec returned empty catalog)"
    function_spec=""
  else
    missing_identifier=""
    # Build a small here-string payload of only the matched identifier lines so
    # gate-plan step5 can still capture stdout without hitting bash truncation.
    function_spec=""
    for function_identifier in "$@"; do
      match_line="$(grep -F "\"identifier\": \"$function_identifier\"" "$spec_file" || true)"
      if [[ -z "$match_line" ]]; then
        missing_identifier="$function_identifier"
        function_spec=""
        break
      fi
      function_spec+="${match_line}"$'\n'
    done
  fi

  if [[ -z "$missing_identifier" ]]; then
    # Prove each identifier via here-string (freshness oracle) then emit payload.
    for function_identifier in "$@"; do
      if ! grep -F "\"identifier\": \"$function_identifier\"" \
        <<<"$function_spec" >/dev/null; then
        echo "wait-convex-function-spec: internal error: missing $function_identifier after match" >&2
        exit 3
      fi
    done
    printf '%s' "$function_spec"
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

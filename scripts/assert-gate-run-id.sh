#!/usr/bin/env bash
# GATE-FIX-S28R3-QA3 / C-3 — Require nonempty allowlisted GATE_RUN_ID before any gate state.
#
# Pattern: ^[A-Za-z0-9](?:[A-Za-z0-9_-]{0,62}[A-Za-z0-9])?$
#   length 1–64; alphanumeric plus '-' / '_' only; no spaces or path chars.
#
# Usage (from gate-plan literal_cmd preflight):
#   set -euo pipefail; bash scripts/assert-gate-run-id.sh; ...
#
# Exit 0 when GATE_RUN_ID is valid; non-zero otherwise (fail closed, no side effects).
set -euo pipefail

GATE_RUN_ID_VALUE="${GATE_RUN_ID-}"

if [[ -z "${GATE_RUN_ID_VALUE}" ]]; then
  echo "error: GATE_RUN_ID is required (unset/empty) — refuse shared manual defaults" >&2
  echo "hint: export GATE_RUN_ID=<allowlisted id> pattern ^[A-Za-z0-9](?:[A-Za-z0-9_-]{0,62}[A-Za-z0-9])?$" >&2
  exit 2
fi

# Allowlist: 1–64 chars; start/end alphanumeric when multi-char; interior may include _-
if [[ ! "$GATE_RUN_ID_VALUE" =~ ^[A-Za-z0-9]([A-Za-z0-9_-]{0,62}[A-Za-z0-9])?$ ]]; then
  echo "error: refuse invalid GATE_RUN_ID (allowlist: alphanumeric + _- , length 1-64): ${GATE_RUN_ID_VALUE}" >&2
  exit 2
fi

# Extra refuse path/metachar (defense in depth; regex already blocks most).
case "$GATE_RUN_ID_VALUE" in
  */*|*..*|*';*|*'*|*\"*|*\$*|*\`*|*\|*|*\&*|*\;*|*[[:space:]]*)
    echo "error: refuse GATE_RUN_ID with path/metachar/space: ${GATE_RUN_ID_VALUE}" >&2
    exit 2
    ;;
esac

exit 0

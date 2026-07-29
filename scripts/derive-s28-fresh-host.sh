#!/usr/bin/env bash
# GATE-FIX-S28R3-QA6 — Deterministic Docker/fresh-target host from GATE_RUN_ID.
#
# Requires GATE_RUN_ID already set and allowlisted (same contract as assert-gate-run-id.sh).
# Prints a single host name on stdout (one line), length 1–64, matching provision allowlist:
#   ^[A-Za-z0-9][A-Za-z0-9_-]{0,62}[A-Za-z0-9]$|^[A-Za-z0-9]$
#
# Policy:
#   - If s28r3-gate-${GATE_RUN_ID} length ≤ 64 → use that full string (readable).
#   - Else → s28r3- + first 16 hex of sha256(GATE_RUN_ID) (collision-resistant; no silent truncate).
#
# Usage (gate-plan step 3, after assert-gate-run-id):
#   HOST="$(bash scripts/derive-s28-fresh-host.sh)"
#
# Exit 0 with host on stdout; non-zero on invalid/missing GATE_RUN_ID (errors on stderr).
set -euo pipefail

# Resolve repo root relative to this script so assert can be invoked from any cwd.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Re-validate via the authoritative allowlist (no weaker copy).
bash "${SCRIPT_DIR}/assert-gate-run-id.sh"

GATE_RUN_ID_VALUE="${GATE_RUN_ID}"

# Readable form when it fits the host length contract.
NAIVE="s28r3-gate-${GATE_RUN_ID_VALUE}"
if [[ "${#NAIVE}" -le 64 ]]; then
  # Defense in depth: still must match host allowlist.
  if [[ ! "$NAIVE" =~ ^[A-Za-z0-9][A-Za-z0-9_-]{0,62}[A-Za-z0-9]$|^[A-Za-z0-9]$ ]]; then
    echo "error: derived naive host fails host allowlist: ${NAIVE}" >&2
    exit 2
  fi
  printf '%s\n' "$NAIVE"
  exit 0
fi

# Collision-resistant digest form (never silent-truncate run-id alone).
# Prefer openssl; fall back to shasum/sha256sum for portability.
if command -v openssl >/dev/null 2>&1; then
  DIGEST_HEX="$(printf '%s' "$GATE_RUN_ID_VALUE" | openssl dgst -sha256 | awk '{print $NF}')"
elif command -v shasum >/dev/null 2>&1; then
  DIGEST_HEX="$(printf '%s' "$GATE_RUN_ID_VALUE" | shasum -a 256 | awk '{print $1}')"
elif command -v sha256sum >/dev/null 2>&1; then
  DIGEST_HEX="$(printf '%s' "$GATE_RUN_ID_VALUE" | sha256sum | awk '{print $1}')"
else
  echo "error: need openssl, shasum, or sha256sum to derive collision-resistant host" >&2
  exit 2
fi

# Normalize to lowercase hex (openssl may already be lower).
DIGEST_HEX="$(printf '%s' "$DIGEST_HEX" | tr 'A-F' 'a-f')"
DIGEST16="${DIGEST_HEX:0:16}"
if [[ ! "$DIGEST16" =~ ^[0-9a-f]{16}$ ]]; then
  echo "error: refuse non-hex digest fragment for host derivation" >&2
  exit 2
fi

HOST="s28r3-${DIGEST16}"
# s28r3- (6) + 16 hex = 22 ≤ 64; always allowlisted.
if [[ ! "$HOST" =~ ^[A-Za-z0-9][A-Za-z0-9_-]{0,62}[A-Za-z0-9]$ ]]; then
  echo "error: derived digest host fails host allowlist: ${HOST}" >&2
  exit 2
fi
if [[ "${#HOST}" -gt 64 ]]; then
  echo "error: derived host exceeds 64 chars: ${HOST}" >&2
  exit 2
fi

printf '%s\n' "$HOST"
exit 0

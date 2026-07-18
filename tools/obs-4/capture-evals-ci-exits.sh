#!/usr/bin/env bash
# Capture real process exits for holo evals:ci fixtures.
# MUST run under bash (PIPESTATUS). Do NOT use: cmd | tee f; echo EXIT:$?
set -euo pipefail
: "${DATABASE_URL:?DATABASE_URL required}"
OUT_DIR="${1:-.tmp/obs-4/exit-proof-corrected}"
mkdir -p "$OUT_DIR"
HOLO=(bun services/platform/src/cli/holo.ts)

capture() {
  local name="$1"; shift
  local out="$OUT_DIR/${name}.stdout.txt"
  local err="$OUT_DIR/${name}.stderr.txt"
  set +e
  "${HOLO[@]}" "$@" >"$out" 2>"$err"
  local ec=$?
  set -e
  set +e
  set -o pipefail
  "${HOLO[@]}" "$@" 2>&1 | tee "$OUT_DIR/${name}.tee.txt" >/dev/null
  local -a ps=("${PIPESTATUS[@]}")
  set +o pipefail
  set -e
  printf '%s\n' "$name shell_exit=$ec pipe_bun_exit=${ps[0]} tee_exit=${ps[1]:-}" | tee -a "$OUT_DIR/exits.log"
  printf '%s\n' "$ec" >"$OUT_DIR/${name}.shell_exit"
  # fail if disagree
  [[ "$ec" == "${ps[0]}" ]] || { echo "exit mismatch for $name" >&2; exit 2; }
}

capture deliberately-bad evals:ci --fixture deliberately-bad --json
capture known-good evals:ci --fixture known-good --json
capture deterministic-invariant-regression evals:ci --fixture deterministic-invariant-regression --json
capture invalid-config evals:ci --fixture invalid-config --json

# assert contract
bad=$(cat "$OUT_DIR/deliberately-bad.shell_exit")
good=$(cat "$OUT_DIR/known-good.shell_exit")
det=$(cat "$OUT_DIR/deterministic-invariant-regression.shell_exit")
inv=$(cat "$OUT_DIR/invalid-config.shell_exit")
[[ "$bad" != 0 ]] || { echo "bad fixture must be nonzero, got $bad" >&2; exit 1; }
[[ "$good" == 0 ]] || { echo "known-good must be zero, got $good" >&2; exit 1; }
[[ "$det" != 0 ]] || { echo "det fixture must be nonzero, got $det" >&2; exit 1; }
[[ "$inv" != 0 ]] || { echo "invalid-config must be nonzero, got $inv" >&2; exit 1; }
echo "ALL_EXIT_PROOFS_OK"

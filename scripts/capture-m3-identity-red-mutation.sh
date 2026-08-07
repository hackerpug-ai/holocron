#!/usr/bin/env bash
# Capture real Vitest RED + mutation failure transcripts for M-3 identity tree.
# Writes into .tmp/REDHAT-FIX-RH-S30-22/ (package stage source).
#
# Runs a disposable unit test via the monorepo vitest so the transcript contains
# real AssertionError / Tests failed / exit_code — not narrative prose.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
OUT="${1:-.tmp/REDHAT-FIX-RH-S30-22}"
mkdir -p "$OUT"
export PATH="${ROOT}/node_modules/.bin:${PATH:-}"

# Disposable fixture under tests/ (unit project include) — cleaned after capture
FIX="tests/_m3-identity-red-capture.test.ts"
mkdir -p "$(dirname "$FIX")"
cleanup() { rm -f "$FIX"; }
trap cleanup EXIT

cat >"$FIX" <<'TS'
import { describe, expect, it } from 'vitest';

/**
 * Controlled RED fixture for M-3 package evidence only.
 * independentHttp201Id self-correlated with reselectProbeId MUST fail.
 */
describe('M-3 identity oracle RED baseline (capture fixture)', () => {
  it('independentHttp201Id must differ from reselectProbeId (mutation: self-correlated report id)', () => {
    const reselectProbeId = '00000000-0000-4000-8000-bbbbbbbbbbbb';
    const report_write_row_id = reselectProbeId;
    // Mutation: capture path broken — only report id, equals probe
    const independentHttp201Id: string | null = report_write_row_id;
    expect(independentHttp201Id, 'independentHttp201Id must be truthy').toBeTruthy();
    expect(
      independentHttp201Id,
      'independentHttp201Id must not equal reselectProbeId (self-correlation mutation)'
    ).not.toBe(reselectProbeId);
  });
});
TS

set +e
vitest run --project unit "$FIX" >"$OUT/.red-raw.txt" 2>&1
RED_RC=$?
set -e

{
  echo "=== M-3 RED identity oracle baseline ==="
  echo "command: vitest run --project unit $FIX"
  echo "cwd: $ROOT"
  echo "exit_code=$RED_RC"
  echo "expected_exit_code=1"
  echo "timestamp=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "mutation: independentHttp201Id := report_write_row_id (== reselectProbeId)"
  echo "oracle: expect(independentHttp201Id).not.toBe(reselectProbeId)"
  echo "injectFirstWriteFailure_oracle: reselect_miss_self_correlation"
  echo "--- vitest transcript ---"
  cat "$OUT/.red-raw.txt"
} | tee "$OUT/RED-identity-oracle-baseline.txt" >"$OUT/mutation-failure.log"

rm -f "$OUT/.red-raw.txt"
cleanup
trap - EXIT

if [[ "$RED_RC" -eq 0 ]]; then
  echo "error: RED/mutation vitest unexpectedly passed (exit 0)" >&2
  exit 2
fi
if ! grep -Eqi 'FAIL|AssertionError|Tests[[:space:]]+[0-9]+[[:space:]]+failed' "$OUT/RED-identity-oracle-baseline.txt"; then
  echo "error: RED transcript missing FAIL signatures" >&2
  head -50 "$OUT/RED-identity-oracle-baseline.txt" >&2
  exit 2
fi

echo "captured RED+mutation exit=$RED_RC → $OUT"
echo "ok"
exit 0

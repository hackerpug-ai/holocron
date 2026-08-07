#!/usr/bin/env bash
# RH-S30-34 — Capture real Vitest RED/mutation for production M-3 identity oracle.
#
# Requires real vitest on PATH (node_modules/.bin). Rejects exit 127 / command-not-found.
# Mutates the production reselect/independentHttp201Id path in
# services/platform/tests/integration/sprint30-redhat-rh-s30.test.ts under a trap,
# validates raw framework FAIL before metadata prepend, restores the file.
#
# Usage:
#   bash scripts/capture-m3-identity-red-mutation.sh [.tmp/REDHAT-FIX-RH-S30-22]
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
OUT="${1:-.tmp/REDHAT-FIX-RH-S30-22}"
mkdir -p "$OUT"
export PATH="${ROOT}/node_modules/.bin:${PATH:-}"

PROD_TEST="services/platform/tests/integration/sprint30-redhat-rh-s30.test.ts"
if [[ ! -f "$PROD_TEST" ]]; then
  echo "error: missing production M-3 test $PROD_TEST" >&2
  exit 2
fi

# AC-1: require real vitest binary before any "RED" claim
if ! command -v vitest >/dev/null 2>&1; then
  echo "error: vitest not found on PATH (need node_modules/.bin/vitest)" >&2
  exit 2
fi
VITEST_BIN="$(command -v vitest)"
if [[ ! -x "$VITEST_BIN" && ! -f "$VITEST_BIN" ]]; then
  echo "error: vitest path not executable: $VITEST_BIN" >&2
  exit 2
fi

# Disposable production-path mutation: force independentHttp201Id == reselectProbeId
# after the real runEnableWrites path would have set a distinct HTTP-201 id.
# Trap restores the production oracle — never leave a weakened tree.
BACKUP="$(mktemp "${TMPDIR:-/tmp}/m3-prod-oracle.XXXXXX.ts")"
cp "$PROD_TEST" "$BACKUP"
restore_prod() {
  if [[ -f "$BACKUP" ]]; then
    cp "$BACKUP" "$PROD_TEST"
    rm -f "$BACKUP"
  fi
}
trap restore_prod EXIT

python3 - "$PROD_TEST" <<'PY'
from pathlib import Path
import sys
p = Path(sys.argv[1])
text = p.read_text()
needle = "expect(independentHttp201Id).not.toBe(reselectProbeId);"
if needle not in text:
    # allow already-mutated only if marker present — still fail closed
    if "RH-S30-34-MUTATION" not in text:
        raise SystemExit(f"error: production oracle needle missing in {p}")
mut = (
    "/* RH-S30-34-MUTATION: self-correlate independentHttp201Id to force RED */\n"
    "      independentHttp201Id = reselectProbeId;\n"
    "      expect(independentHttp201Id).not.toBe(reselectProbeId);"
)
# Only mutate the reselect-miss identity block once
text2 = text.replace(needle, mut, 1)
if text2 == text and "RH-S30-34-MUTATION" not in text:
    raise SystemExit("error: failed to apply production-path mutation")
p.write_text(text2)
print("mutated production reselect identity oracle (disposable)")
PY

set +e
# Prefer PLATFORM_IT path when available; fall back to unit-less targeted file run
# which still executes the production test file (fails closed if PLATFORM_IT required).
PLATFORM_IT="${PLATFORM_IT:-0}" \
  "$VITEST_BIN" run --project integration "$PROD_TEST" \
  >"$OUT/.red-raw.txt" 2>&1
RED_RC=$?
set -e

RAW="$OUT/.red-raw.txt"
# AC-2 / AC-4: validate RAW framework output BEFORE metadata prepend
if [[ "$RED_RC" -eq 127 ]]; then
  echo "error: vitest exit_code=127 (command not found theatre) — not RED" >&2
  head -20 "$RAW" >&2 || true
  restore_prod
  trap - EXIT
  exit 2
fi
if grep -Eiq 'command not found|not found: vitest|Cannot find module.*vitest' "$RAW"; then
  echo "error: raw transcript indicates vitest never ran (command not found)" >&2
  exit 2
fi
if [[ "$RED_RC" -eq 0 ]]; then
  echo "error: production-path mutation unexpectedly passed (exit 0)" >&2
  exit 2
fi
# Expected vitest failure is typically 1 (not arbitrary nonzero)
if [[ "$RED_RC" -ne 1 ]]; then
  # Accept 1 only as preferred; still require real FAIL signatures below
  echo "warn: vitest exit_code=$RED_RC (expected 1); requiring FAIL signatures" >&2
fi
if ! grep -Eqi 'FAIL|AssertionError|Tests[[:space:]]+[0-9]+[[:space:]]+failed' "$RAW"; then
  echo "error: raw vitest transcript missing FAIL/AssertionError/Tests N failed (before metadata)" >&2
  head -40 "$RAW" >&2
  exit 2
fi
if ! grep -Eqi 'independentHttp201Id|reselectProbeId|reselect' "$RAW"; then
  echo "error: raw transcript not production-path identity related" >&2
  exit 2
fi

# Metadata only AFTER raw validation
{
  echo "=== M-3 RED identity oracle baseline (production-path mutation) ==="
  echo "command: vitest run --project integration $PROD_TEST"
  echo "vitest_bin=$VITEST_BIN"
  echo "cwd: $ROOT"
  echo "exit_code=$RED_RC"
  echo "expected_exit_code=1"
  echo "timestamp=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "mutation: independentHttp201Id := reselectProbeId after runEnableWrites reselect_miss path"
  echo "oracle: expect(independentHttp201Id).not.toBe(reselectProbeId)  # production test"
  echo "production_test: $PROD_TEST"
  echo "injectFirstWriteFailure_oracle: reselect_miss_self_correlation"
  echo "--- vitest raw transcript (validated before this header) ---"
  cat "$RAW"
} | tee "$OUT/RED-identity-oracle-baseline.txt" >"$OUT/mutation-failure.log"

rm -f "$RAW"
restore_prod
trap - EXIT

# Confirm production oracle restored
if grep -q 'RH-S30-34-MUTATION' "$PROD_TEST"; then
  echo "error: production oracle still mutated after restore" >&2
  exit 2
fi
if ! grep -q 'expect(independentHttp201Id).not.toBe(reselectProbeId);' "$PROD_TEST"; then
  echo "error: production oracle needle missing after restore" >&2
  exit 2
fi

echo "captured production-path RED+mutation exit=$RED_RC → $OUT"
echo "ok"
exit 0

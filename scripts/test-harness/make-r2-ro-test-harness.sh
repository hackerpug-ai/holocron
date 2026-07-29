#!/usr/bin/env bash
# GATE-FIX-S28R3-QA13 — build an isolated script tree for unit tests.
# Production scripts remain free of any runtime provider override.
# Usage: make-r2-ro-test-harness.sh <harness_dir> <absolute_fixture_aws> [absolute_fixture_curl]
set -euo pipefail
HARNESS="${1:?harness dir}"
FIXTURE_AWS="${2:?absolute fixture aws}"
FIXTURE_CURL="${3:-}"
ROOT_SRC="$(cd "$(dirname "$0")/../.." && pwd)"
rm -rf "$HARNESS"
mkdir -p "$HARNESS/scripts/lib" "$HARNESS/scripts/test-harness"
cp "$ROOT_SRC/scripts/prove-r2-readonly.sh" "$HARNESS/scripts/"
cp "$ROOT_SRC/scripts/provision-fresh-restore-target.sh" "$HARNESS/scripts/"
cp "$ROOT_SRC/scripts/run-fire-drill-on-fresh-target.sh" "$HARNESS/scripts/"
cp "$ROOT_SRC/scripts/verify-restore-creds.sh" "$HARNESS/scripts/" 2>/dev/null || true
cp "$ROOT_SRC/scripts/assert-fire-drill-report.sh" "$HARNESS/scripts/" 2>/dev/null || true
cp "$ROOT_SRC/scripts/lib/r2-ro-live.sh" "$HARNESS/scripts/lib/"
# Patch harness lib: hardcode fixture as sole production allowlist entry (compile-time in copy only).
python3 - "$HARNESS/scripts/lib/r2-ro-live.sh" "$FIXTURE_AWS" "$FIXTURE_CURL" <<'PY'
import sys
from pathlib import Path
path, aws, curl = Path(sys.argv[1]), sys.argv[2], sys.argv[3]
t = path.read_text()
# Replace allowlists with fixture paths only for this harness copy.
t = t.replace(
    'R2_RO_AWS_ALLOWLIST=(/opt/homebrew/bin/aws /usr/local/bin/aws /usr/bin/aws)',
    f'R2_RO_AWS_ALLOWLIST=("{aws}")',
)
if curl:
    t = t.replace(
        'R2_RO_CURL_ALLOWLIST=(/usr/bin/curl /opt/homebrew/bin/curl /usr/local/bin/curl)',
        f'R2_RO_CURL_ALLOWLIST=("{curl}")',
    )
# Relax verify to accept the fixture realpath (still refuse group/world writable).
old = '''# Refuse any test/fixture path in production verification.
low = cand.lower()
if "/fixtures/" in low or "/.tmp/" in low or "mock" in os.path.basename(cand).lower():
    print("error: GATE-FIX-S28R3-QA13 refuses fixture/tmp/mock provider paths in production", file=sys.stderr)
    sys.exit(2)
'''
new = '''# Harness copy: fixtures allowed only when they match the hard-coded allowlist entry.
'''
t = t.replace(old, new)
old2 = '''# Fixture path ban on realpath too
if "/fixtures/" in real or "/.tmp/" in real:
    print("error: GATE-FIX-S28R3-QA13 refuses fixture/tmp resolved provider path", file=sys.stderr)
    sys.exit(2)
'''
t = t.replace(old2, '')
# Re-enable mock env forwarding for harness prove by patching prove script
path.write_text(t)
PY
# Forward mock modes in harness prove only
python3 - "$HARNESS/scripts/prove-r2-readonly.sh" <<'PY'
from pathlib import Path
import sys
p=Path(sys.argv[1])
t=p.read_text()
needle='  # GATE-FIX-S28R3-QA13: production never forwards test mock controls.\n'
insert='''  # Harness-only: forward mock controls into env -i provider process.
  if [[ -n "${HOLO_AWS_MOCK_MODE:-}" ]]; then
    aws_env+=("HOLO_AWS_MOCK_MODE=${HOLO_AWS_MOCK_MODE}")
  fi
  if [[ -n "${HOLO_AWS_MOCK_CANARY:-}" ]]; then
    aws_env+=("HOLO_AWS_MOCK_CANARY=${HOLO_AWS_MOCK_CANARY}")
  fi
  if [[ -n "${HOLO_AWS_MOCK_RAN_MARKER:-}" ]]; then
    aws_env+=("HOLO_AWS_MOCK_RAN_MARKER=${HOLO_AWS_MOCK_RAN_MARKER}")
  fi
'''
if needle in t:
    t=t.replace(needle, insert)
p.write_text(t)
PY
# Prove must treat HARNESS as ROOT - scripts compute ROOT from dirname
chmod +x "$HARNESS/scripts/"*.sh "$HARNESS/scripts/lib/"*.sh
echo "$HARNESS"

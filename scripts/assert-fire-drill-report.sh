#!/usr/bin/env bash
# GATE-FIX-S28R3-QA5 / M-1 — Fail-closed parity-report contract (no Docker required).
#
# Validates a fire-drill parity report has the required true fields and a nonempty
# baseline binding. Extracted from run-fire-drill-on-fresh-target.sh so unit tests
# can exercise the contract without provisioned volumes.
#
# Usage:
#   bash scripts/assert-fire-drill-report.sh <parity-report.json>
#   REPORT_PATH=... bash scripts/assert-fire-drill-report.sh
set -euo pipefail

path="${1:-${REPORT_PATH:-}}"
if [[ -z "$path" ]]; then
  echo "error: assert-fire-drill-report requires a report path (arg1 or REPORT_PATH)" >&2
  exit 2
fi

python3 - "$path" <<'PY'
import json, sys

path = sys.argv[1]
try:
    with open(path) as f:
        data = json.load(f)
except Exception as e:
    print(f"error: parity report missing/unreadable at {path}: {e}", file=sys.stderr)
    sys.exit(1)

required = ("POSTGRES_PARITY_PASS", "LEDGER_CHECKSUM_MATCH", "BLOB_PARITY_PASS")
missing = [k for k in required if data.get(k) is not True]
if missing:
    print(
        f"error: parity report contract failed — require true for {', '.join(missing)} at {path}",
        file=sys.stderr,
    )
    sys.exit(1)

baseline_id = data.get("baseline_id")
baseline_key = data.get("baseline_key")
bound = (isinstance(baseline_id, str) and baseline_id.strip()) or (
    isinstance(baseline_key, str) and baseline_key.strip()
)
if not bound:
    print(
        f"error: parity report contract failed — baseline_id or baseline_key must be nonempty at {path}",
        file=sys.stderr,
    )
    sys.exit(1)

sys.exit(0)
PY

#!/usr/bin/env bash
# D05-04 optional wrapper: full CAP-BAK-01 fire-drill restore (Postgres + blob).
# Usage:
#   scripts/fire-drill.sh --target-timestamp <iso> --scratch <empty-pgdata> --blob-dir <empty-dir>
#                        [--report .tmp/D05-04/parity-report.json]
set -euo pipefail
# GATE-FIX-S28R3-QA22: shell-native root resolution (no PATH dirname).
_SCRIPT_DIR="${BASH_SOURCE[0]%/*}"
[[ "$_SCRIPT_DIR" == "${BASH_SOURCE[0]}" ]] && _SCRIPT_DIR="."
ROOT="$(cd "$_SCRIPT_DIR/.." && pwd)"
cd "$ROOT"
exec bun services/platform/src/cli/holo.ts restore:fire-drill "$@"

#!/usr/bin/env bash
# D05-04 optional wrapper: full CAP-BAK-01 fire-drill restore (Postgres + blob).
# Usage:
#   scripts/fire-drill.sh --target-timestamp <iso> --scratch <empty-pgdata> --blob-dir <empty-dir>
#                        [--report .tmp/D05-04/parity-report.json]
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
exec bun services/platform/src/cli/holo.ts restore:fire-drill "$@"

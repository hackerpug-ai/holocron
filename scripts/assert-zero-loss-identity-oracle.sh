#!/usr/bin/env bash
# GATE-FIX-zero-loss-t-sync-013 — wrapper for zero-loss identity oracle.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
exec python3 "$ROOT/scripts/lib/zero-loss-identity-oracle.py" --mode zero-loss "$@"

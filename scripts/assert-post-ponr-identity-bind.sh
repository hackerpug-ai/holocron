#!/usr/bin/env bash
# GATE-FIX-zero-loss-t-sync-013 — step4→step5 POST_PONR identity bind.
# Usage:
#   bash scripts/assert-post-ponr-identity-bind.sh --step4 step4.log --step5 step5.log
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
exec python3 "$ROOT/scripts/lib/zero-loss-identity-oracle.py" --mode post-ponr "$@"

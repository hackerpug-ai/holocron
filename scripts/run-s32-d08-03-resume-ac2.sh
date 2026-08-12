#!/usr/bin/env bash
# Thin wrapper: resume D08-03 from a prior live AC-1 restore (new GATE_RUN_ID).
# Usage:
#   set -a; source /Users/inference1/Projects/holocron/.env; set +a
#   export HOLO_SECRETS_PATH=...
#   RESUME_FROM_GATE_RUN_ID=s32d0803-20260810T192706Z \
#   RESUME_RESTORED_DATABASE_URL=postgres://127.0.0.1:51376/holocron \
#   KEEP_RESTORED_PG_ON_EXIT=1 \
#   bash scripts/run-s32-d08-03-resume-ac2.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
: "${RESUME_FROM_GATE_RUN_ID:?RESUME_FROM_GATE_RUN_ID required}"
export SKIP_AC1=1
export RESUME_FROM_GATE_RUN_ID
export KEEP_RESTORED_PG_ON_EXIT="${KEEP_RESTORED_PG_ON_EXIT:-1}"
exec /bin/bash "$ROOT/scripts/run-s32-d08-03-deletion-gate.sh" "$@"

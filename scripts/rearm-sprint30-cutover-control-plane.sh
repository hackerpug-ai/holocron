#!/usr/bin/env bash
# Safe durable re-arm for Sprint 30 human-gate preflight.
#
# NEVER regex-rewrite secrets.yaml. A prior ad-hoc re.sub produced:
#   HOLO_MIGRATION_READ_ONLY: "1""
# which fails YAML parse (Unexpected double-quoted-scalar). Always use
# platform upsertSecretsFile via writeDurableMigrationReadOnly /
# writeDurableDataPlane after an optional surgical repair of that one key.
#
# Usage:
#   bash scripts/rearm-sprint30-cutover-control-plane.sh
#   bash scripts/rearm-sprint30-cutover-control-plane.sh --plane postgres --target postgres-soak
#   bash scripts/rearm-sprint30-cutover-control-plane.sh --fence 1
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

FENCE="1"
PLANE=""
TARGET=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --fence)
      FENCE="${2:?--fence requires 0|1}"
      shift 2
      ;;
    --plane)
      PLANE="${2:?--plane requires value}"
      shift 2
      ;;
    --target)
      TARGET="${2:?--target requires value}"
      shift 2
      ;;
    -h|--help)
      sed -n '1,18p' "$0"
      exit 0
      ;;
    *)
      echo "error: unknown arg: $1" >&2
      exit 2
      ;;
  esac
done

if [[ "$FENCE" != "0" && "$FENCE" != "1" ]]; then
  echo "error: --fence must be 0 or 1" >&2
  exit 2
fi
if [[ -n "$PLANE" && -z "$TARGET" ]]; then
  echo "error: --plane requires --target" >&2
  exit 2
fi
if [[ -n "$TARGET" && -z "$PLANE" ]]; then
  echo "error: --target requires --plane" >&2
  exit 2
fi

export HOLO_SECRETS_PATH="${HOLO_SECRETS_PATH:-$ROOT/packages/platform/config/secrets.yaml}"
if [[ ! -f "$HOLO_SECRETS_PATH" ]]; then
  echo "error: secrets missing: $HOLO_SECRETS_PATH" >&2
  exit 2
fi

export FENCE PLANE TARGET
WORKER="$ROOT/scripts/lib/rearm-sprint30-cutover-control-plane.ts"
if [[ ! -f "$WORKER" ]]; then
  echo "error: missing worker $WORKER" >&2
  exit 2
fi

bun "$WORKER"
echo "rearm ok fence=$FENCE plane=${PLANE:-<unchanged>} target=${TARGET:-<unchanged>}"

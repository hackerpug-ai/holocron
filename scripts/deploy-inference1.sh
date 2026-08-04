#!/usr/bin/env bash
# Operator entry point for the D06-07 inference1 deployment. No cutover action
# is present here: this script only cold-recreates the locked Compose services.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

AUTHORIZED=0
DRY_RUN=0
RELEASE="${HOLO_RELEASE_PATH:-$ROOT/services/platform/deploy/compose/image-lock.json}"
BASE_URL="${HOLO_PRODUCTION_BASE_URL:-${HOLO_VERIFY_BASE_URL:-}}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --authorize)
      AUTHORIZED=1
      shift
      ;;
    --dry-run)
      DRY_RUN=1
      shift
      ;;
    --release)
      RELEASE="${2:?--release requires a path}"
      shift 2
      ;;
    --base-url)
      BASE_URL="${2:?--base-url requires a URL}"
      shift 2
      ;;
    -h|--help)
      echo "Usage: scripts/deploy-inference1.sh --authorize --release <image-lock.json> [--base-url URL]"
      exit 0
      ;;
    *)
      echo "error: unknown argument: $1" >&2
      exit 2
      ;;
  esac
done

if [[ "$AUTHORIZED" -ne 1 ]]; then
  echo "error: deploy:apply refused: operator authorization is required (--authorize)" >&2
  exit 2
fi

PRIMARY_ROOT="${HOLO_PRIMARY_ROOT:-${HOME}/Projects/holocron}"
if [[ -f "$ROOT/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$ROOT/.env"
  set +a
elif [[ -f "$PRIMARY_ROOT/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$PRIMARY_ROOT/.env"
  set +a
fi

if [[ -z "${HOLO_SECRETS_PATH:-}" ]]; then
  if [[ -f "$ROOT/services/platform/config/secrets.yaml" ]]; then
    export HOLO_SECRETS_PATH="$ROOT/services/platform/config/secrets.yaml"
  elif [[ -f "$PRIMARY_ROOT/services/platform/config/secrets.yaml" ]]; then
    export HOLO_SECRETS_PATH="$PRIMARY_ROOT/services/platform/config/secrets.yaml"
  else
    echo "error: canonical secrets.yaml is missing" >&2
    exit 2
  fi
fi

if [[ -z "$BASE_URL" ]]; then
  LAN_IP="$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || true)"
  if [[ -z "$LAN_IP" ]]; then
    echo "error: cannot derive a non-loopback inference1 address; set HOLO_PRODUCTION_BASE_URL" >&2
    exit 2
  fi
  BASE_URL="http://${LAN_IP}:44111"
fi

export HOLO_DEPLOY_TARGET=inference1
export HOLO_PRODUCTION_BASE_URL="$BASE_URL"
export HOLO_VERIFY_BASE_URL="$BASE_URL"

ARGS=(deploy:apply --authorize --release "$RELEASE" --base-url "$BASE_URL" --json)
if [[ "$DRY_RUN" -eq 1 ]]; then
  ARGS+=(--dry-run)
fi
exec bun services/platform/src/cli/holo.ts "${ARGS[@]}"

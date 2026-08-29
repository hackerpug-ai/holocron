#!/usr/bin/env bash
# Compatibility entry point for portable Holocron deployment.
# Retains the historical filename; target/base URL come from validated portable
# inputs (env or Tailscale MagicDNS) — never from a derived LAN address.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

AUTHORIZED=0
DRY_RUN=0
RELEASE="${HOLO_RELEASE_PATH:-$ROOT/packages/platform/deploy/compose/image-lock.json}"
BASE_URL="${HOLO_PRODUCTION_BASE_URL:-${HOLO_VERIFY_BASE_URL:-}}"
TARGET="${HOLO_DEPLOY_TARGET:-holocron}"

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
    --target)
      TARGET="${2:?--target requires a host}"
      shift 2
      ;;
    -h|--help)
      echo "Usage: scripts/deploy-inference1.sh --authorize --release <image-lock.json> [--base-url URL] [--target host]"
      echo "  Base URL defaults to https://\$(tailscale MagicDNS):44111 when unset."
      echo "  Never derives a LAN address."
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
  if [[ -f "$ROOT/packages/platform/config/secrets.yaml" ]]; then
    export HOLO_SECRETS_PATH="$ROOT/packages/platform/config/secrets.yaml"
  elif [[ -f "$PRIMARY_ROOT/packages/platform/config/secrets.yaml" ]]; then
    export HOLO_SECRETS_PATH="$PRIMARY_ROOT/packages/platform/config/secrets.yaml"
  else
    echo "error: canonical secrets.yaml is missing" >&2
    exit 2
  fi
fi

# Approved secret store root (parent of secrets.yaml unless operator overrides).
if [[ -z "${HOLO_SECRET_STORE_ROOT:-}" && -n "${HOLO_SECRETS_PATH:-}" ]]; then
  export HOLO_SECRET_STORE_ROOT="$(cd "$(dirname "$HOLO_SECRETS_PATH")" && pwd)"
fi

if [[ -z "$BASE_URL" ]]; then
  # Private Serve URL via Tailscale MagicDNS — never LAN/ipconfig.
  TS_JSON="$(tailscale status --json 2>/dev/null || true)"
  TS_DNS="$(
    printf '%s' "$TS_JSON" | python3 -c '
import json,sys
raw=sys.stdin.read()
i=raw.find("{")
if i<0: raise SystemExit(1)
d=json.loads(raw[i:])
name=(d.get("Self") or {}).get("DNSName") or ""
print(name.rstrip(".").lower())
' 2>/dev/null || true
  )"
  if [[ -z "$TS_DNS" ]]; then
    echo "error: cannot resolve Tailscale MagicDNS; set HOLO_PRODUCTION_BASE_URL to the private Serve URL" >&2
    exit 2
  fi
  BASE_URL="https://${TS_DNS}:44111"
fi

export HOLO_DEPLOY_TARGET="$TARGET"
export HOLO_PRODUCTION_BASE_URL="$BASE_URL"
export HOLO_VERIFY_BASE_URL="$BASE_URL"

ARGS=(deploy:apply --authorize --release "$RELEASE" --base-url "$BASE_URL" --target "$TARGET" --json)
if [[ "$DRY_RUN" -eq 1 ]]; then
  ARGS+=(--dry-run)
fi
exec bun packages/platform/src/cli/holo.ts "${ARGS[@]}"

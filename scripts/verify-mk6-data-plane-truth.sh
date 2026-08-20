#!/usr/bin/env bash
set -euo pipefail

# Isolated-only MK6-DATA-001 verifier. Never addresses production Compose
# (:44111/:44112). Credentials stay in the environment and are never printed.

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MODULE="$ROOT/services/platform/src/etl/composite-corpus.ts"

if [[ "${PLATFORM_IT:-}" != "1" ]]; then
  printf '{"ok":false,"error":"PLATFORM_IT=1 is required"}\n'
  exit 2
fi

CASE=""
NEGATIVE=""
JSON=0
while [[ $# -gt 0 ]]; do
  case "$1" in
    --case) CASE="${2:-}"; shift 2 ;;
    --negative-control) NEGATIVE="${2:-}"; shift 2 ;;
    --json) JSON=1; shift ;;
    *) shift ;;
  esac
done

if [[ -z "$CASE" && -z "$NEGATIVE" ]]; then
  printf '{"ok":false,"error":"usage: PLATFORM_IT=1 bash scripts/verify-mk6-data-plane-truth.sh --case composite-positive --json"}\n'
  exit 2
fi

CANONICAL_ROOT="${MK6_DATA_CANONICAL_ROOT:-$HOME/.holocron}"
if [[ ! -d "$CANONICAL_ROOT" ]]; then
  printf '{"ok":false,"error":"canonical composite root is missing"}\n'
  exit 2
fi

if [[ -f "$ROOT/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$ROOT/.env"
  set +a
fi

command -v bun >/dev/null
command -v psql >/dev/null
command -v openssl >/dev/null

export HOLO_DANGEROUS_ALLOW_PROD_DB="${HOLO_DANGEROUS_ALLOW_PROD_DB:-1}"

if [[ -z "${MK6_DATA_DATABASE_URL:-}" ]]; then
  DB_NAME="holocron_mk6_isolated"
  if ! psql -h 127.0.0.1 -p 5432 -d postgres -Atc "SELECT 1 FROM pg_database WHERE datname='${DB_NAME}'" | grep -q 1; then
    psql -h 127.0.0.1 -p 5432 -d postgres -v ON_ERROR_STOP=1 -c "CREATE DATABASE ${DB_NAME}"
  fi
  export MK6_DATA_DATABASE_URL="postgres://justinrich@127.0.0.1:5432/${DB_NAME}"
  DATABASE_URL="$MK6_DATA_DATABASE_URL" HOLO_DANGEROUS_ALLOW_PROD_DB=1 bun -e '
    import { applyMigrations } from "./services/platform/src/db/migrate.ts";
    const result = await applyMigrations({ databaseUrl: process.env.DATABASE_URL });
    if (!result.ok) {
      console.error(result.errors.join("; "));
      process.exit(1);
    }
  '
fi
export DATABASE_URL="${DATABASE_URL:-$MK6_DATA_DATABASE_URL}"

RUN_TOKEN="$(date -u +%Y%m%d%H%M%S)-$(openssl rand -hex 4)"
EVIDENCE="$ROOT/.tmp/MK6-DATA-001/verify-${RUN_TOKEN}"
mkdir -p "$EVIDENCE"
SECRETS="$EVIDENCE/secrets.yaml"
RN_KEY="${HOLO_KEY_RN:-mk6-isolated-${RUN_TOKEN}}"
SOURCE_REVISION="$(git -C "$ROOT" rev-parse HEAD)"
IMAGE_DIGEST="sha256:$(shasum -a 256 "$ROOT/services/platform/src/http/hono-app.ts" | awk '{print $1}')"
COMPOSE_SHA256="$(shasum -a 256 "$ROOT/services/platform/deploy/nonprod/mk6-verification.compose.yaml" | awk '{print $1}')"
COMPOSE_GENERATION="mk6iso-${RUN_TOKEN:0:8}"
DEPLOYED_AT="$(date -u +%Y-%m-%dT%H:%M:%S.000Z)"
cat >"$SECRETS" <<EOF
HOLO_DATA_PLANE: postgres
HOLO_ROLLBACK_TARGET: postgres
HOLO_MIGRATION_READ_ONLY: "1"
HOLO_KEY_RN: ${RN_KEY}
EOF
LOCK="$EVIDENCE/release-lock.json"
cat >"$LOCK" <<EOF
{
  "sourceRevision": "${SOURCE_REVISION}",
  "imageDigest": "${IMAGE_DIGEST}",
  "composeGeneration": "${COMPOSE_GENERATION}",
  "composeSha256": "${COMPOSE_SHA256}",
  "host": "127.0.0.1",
  "runtime": "container"
}
EOF
export MK6_DATA_RELEASE_LOCK_PATH="${MK6_DATA_RELEASE_LOCK_PATH:-$LOCK}"
export HOLO_SECRETS_PATH="$SECRETS"
export HOLOCRON_SECRETS_PATH="$SECRETS"
export HOLO_DATA_PLANE=postgres
export HOLO_ROLLBACK_TARGET=postgres
export HOLO_MIGRATION_READ_ONLY=1
export HOLO_KEY_RN="$RN_KEY"
export MK6_DATA_EXTERNAL_BEARER_TOKEN="$RN_KEY"

if [[ -z "${MK6_DATA_EXTERNAL_BASE_URL:-}" && ( -n "$CASE" || "$NEGATIVE" == "count-equal-content-corrupt" || "$NEGATIVE" == "external-witness-contract-matrix" ) ]]; then
  printf '{"ok":false,"failureClass":"HONO_MISSING","error":"MK6_DATA_EXTERNAL_BASE_URL must name a pre-existing isolated Hono"}\n'
  exit 2
fi

ARGS=()
if [[ -n "$CASE" ]]; then ARGS+=(--case "$CASE"); fi
if [[ -n "$NEGATIVE" ]]; then ARGS+=(--negative-control "$NEGATIVE"); fi

set +e
OUTPUT="$(
  cd "$ROOT"
  MK6_DATA_CANONICAL_ROOT="$CANONICAL_ROOT" \
    MK6_DATA_DATABASE_URL="$MK6_DATA_DATABASE_URL" \
    DATABASE_URL="$MK6_DATA_DATABASE_URL" \
    MK6_DATA_EXTERNAL_BASE_URL="$MK6_DATA_EXTERNAL_BASE_URL" \
    MK6_DATA_RELEASE_LOCK_PATH="$MK6_DATA_RELEASE_LOCK_PATH" \
    HOLO_DANGEROUS_ALLOW_PROD_DB=1 \
    HOLO_SECRETS_PATH="$SECRETS" \
    HOLO_KEY_RN="$RN_KEY" \
    MK6_DATA_EXTERNAL_BEARER_TOKEN="$RN_KEY" \
    bun "$MODULE" "${ARGS[@]}"
)"
STATUS=$?
set -e

if [[ "$JSON" == "1" ]]; then
  printf '%s\n' "$OUTPUT"
else
  printf '%s\n' "$OUTPUT"
fi
exit "$STATUS"

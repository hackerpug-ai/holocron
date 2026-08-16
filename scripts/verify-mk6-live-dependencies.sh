#!/usr/bin/env bash
set -euo pipefail

# MK6-DEP-001. This verifier owns only a generated Compose project and never
# addresses an operator-owned Compose project. All credentials are inherited
# through environment variables and are deliberately absent from argv/output.

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_FILE="$ROOT/services/platform/deploy/nonprod/mk6-verification.compose.yaml"
HELPER="$ROOT/services/platform/tests/integration/helpers/mk6-live-services.ts"
EVIDENCE_DIR="$ROOT/.tmp/MK6-DEP-001"

if [[ $# -ne 2 || "$1" != "--provision-isolated" || "$2" != "--json" ]]; then
  printf '{"ready":false,"status":"blocked","error":"usage: PLATFORM_IT=1 bash scripts/verify-mk6-live-dependencies.sh --provision-isolated --json"}\n'
  exit 2
fi

json_error() {
  local message="$1"
  printf '{"ready":false,"status":"blocked","error":%s}\n' "$(jq -Rn --arg v "$message" '$v')"
}

redact_stream() {
  # Values are taken from the process environment, never put in this command's
  # argv. This also covers Mastra's startup line, which includes DATABASE_URL.
  perl -0pe '
    for my $name (qw(MK6_DATABASE_PASSWORD MK6_DATABASE_URL_CONTAINER MK6_ZERO_ADMIN_PASSWORD MK6_RN_KEY MK6_MCP_KEY MK6_CONTROL_KEY FLEET_KEY MASTRA_API_KEY)) {
      my $value = $ENV{$name} // "";
      s/\Q$value\E/[REDACTED]/g if length($value) > 0;
    }
    s#postgres(?:ql)?://[^\s/@]+@#postgres://[REDACTED]@#gi;
  '
}

if [[ "${PLATFORM_IT:-}" != "1" ]]; then
  json_error 'PLATFORM_IT=1 is required for real-service verification'
  exit 2
fi

if [[ ! -f "$COMPOSE_FILE" || ! -f "$HELPER" ]]; then
  json_error 'MK6 verification files are incomplete'
  exit 2
fi

if [[ -f "$ROOT/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$ROOT/.env"
  set +a
fi

for command_name in docker jq bun openssl; do
  if ! command -v "$command_name" >/dev/null 2>&1; then
    json_error "required command missing: $command_name"
    exit 2
  fi
done
if ! docker compose version >/dev/null 2>&1; then
  json_error 'docker compose is unavailable'
  exit 2
fi

RUN_ID="mk6-$(date -u +%Y%m%d%H%M%S)-$(openssl rand -hex 4)"
PROJECT="holocron-${RUN_ID}"
DB_NAME="holocron_nonprod"
DB_USER="holocron"
DB_PASSWORD="${MK6_DATABASE_PASSWORD:-$(openssl rand -hex 24)}"
ZERO_PASSWORD="${MK6_ZERO_ADMIN_PASSWORD:-$(openssl rand -hex 24)}"
RN_KEY="${MK6_RN_KEY:-mk6-rn-${RUN_ID}}"
MCP_KEY="${MK6_MCP_KEY:-mk6-mcp-${RUN_ID}}"
CONTROL_KEY="${MK6_CONTROL_KEY:-mk6-control-${RUN_ID}}"
# Compose's environment-backed secret source must be defined even when the
# operator's fleet does not require a key; an empty value is still fail-closed
# by the real fleet request below if authentication is required.
FLEET_KEY="${FLEET_KEY:-}"
MASTRA_API_KEY="${MASTRA_API_KEY:-}"

pick_port() {
  local port
  for _ in $(seq 1 60); do
    port="$(bun -e 'process.stdout.write(String(42000 + Math.floor(Math.random() * 7000)))')"
    if ! nc -z 127.0.0.1 "$port" >/dev/null 2>&1 &&
      [[ " ${USED_PORTS:-} " != *" $port "* ]]; then
      USED_PORTS="${USED_PORTS:-} $port"
      printf '%s' "$port"
      return 0
    fi
  done
  return 1
}

if ! command -v nc >/dev/null 2>&1; then
  json_error 'required command missing: nc'
  exit 2
fi
USED_PORTS=""
POSTGRES_PORT="${MK6_POSTGRES_PORT:-$(pick_port)}"
USED_PORTS="$POSTGRES_PORT"
MASTRA_PORT="${MK6_MASTRA_PORT:-$(pick_port)}"
USED_PORTS="$USED_PORTS $MASTRA_PORT"
ZERO_PORT="${MK6_ZERO_PORT:-$(pick_port)}"
if [[ "$POSTGRES_PORT" == "$MASTRA_PORT" || "$POSTGRES_PORT" == "$ZERO_PORT" || "$MASTRA_PORT" == "$ZERO_PORT" ]]; then
  json_error 'generated service ports are not unique'
  exit 2
fi
VOLUME="mk6-${RUN_ID}-postgres"
DEPLOY_HOST="mk6-${RUN_ID#mk6-}"
SOURCE_REVISION="$(git -C "$ROOT" rev-parse HEAD)"
COMPOSE_GENERATION="${RUN_ID#mk6-}"
DEPLOYED_AT="$(date -u +%Y-%m-%dT%H:%M:%S.000Z)"
COMPOSE_SHA256="$(shasum -a 256 "$COMPOSE_FILE" | awk '{print $1}')"

mkdir -p "$EVIDENCE_DIR"

PLATFORM_IMAGE="${MK6_PLATFORM_IMAGE:-${HOLO_PLATFORM_IMAGE:-}}"
if [[ -z "$PLATFORM_IMAGE" ]]; then
  PLATFORM_IMAGE="holocron-platform:${RUN_ID}"
  if ! docker build --file "$ROOT/services/platform/Dockerfile" \
    --build-arg "SOURCE_REVISION=$SOURCE_REVISION" \
    --tag "$PLATFORM_IMAGE" "$ROOT" >"$EVIDENCE_DIR/${RUN_ID}-image-build.log" 2>&1; then
    json_error 'real Mastra image build failed; see image-build evidence'
    exit 1
  fi
fi
if [[ "$PLATFORM_IMAGE" == "latest" || "$PLATFORM_IMAGE" == *":latest" ]]; then
  json_error 'latest image tags are forbidden for MK6 verification'
  exit 2
fi
if ! docker image inspect "$PLATFORM_IMAGE" >/dev/null 2>&1; then
  if ! docker pull "$PLATFORM_IMAGE" >"$EVIDENCE_DIR/${RUN_ID}-image-pull.log" 2>&1; then
    json_error 'configured Mastra image is unavailable'
    exit 1
  fi
fi
IMAGE_ID="$(docker image inspect --format '{{.Id}}' "$PLATFORM_IMAGE")"
if [[ ! "$IMAGE_ID" =~ ^sha256:[a-f0-9]{64}$ ]]; then
  json_error 'Mastra image did not expose an immutable image identity'
  exit 2
fi

# The runtime manifest is generated only inside the task evidence directory;
# it contains no credentials, and its endpoint points from Docker to the real
# host fleet rather than to an in-container loopback address.
FLEET_URL="${FLEET_URL:-http://127.0.0.1:4545}"
FLEET_CONTAINER_URL="$(printf '%s' "$FLEET_URL" | sed -E 's#127\.0\.0\.1|localhost#host.docker.internal#g')"
sed -E 's#http://127\.0\.0\.1:4545#http://host.docker.internal:4545#g; s#http://localhost:4545#http://host.docker.internal:4545#g' \
  "$ROOT/services/platform/fleet/manifest.json" >"$EVIDENCE_DIR/${RUN_ID}-fleet-manifest.json"

DATABASE_URL="postgres://${DB_USER}:${DB_PASSWORD}@127.0.0.1:${POSTGRES_PORT}/${DB_NAME}"
DATABASE_URL_CONTAINER="postgres://${DB_USER}:${DB_PASSWORD}@postgres:5432/${DB_NAME}"
export MK6_COMPOSE_PROJECT="$PROJECT"
export MK6_DATABASE_NAME="$DB_NAME"
export MK6_DATABASE_USER="$DB_USER"
export MK6_DATABASE_PASSWORD="$DB_PASSWORD"
export MK6_DATABASE_URL_CONTAINER="$DATABASE_URL_CONTAINER"
export MK6_ZERO_ADMIN_PASSWORD="$ZERO_PASSWORD"
export MK6_RN_KEY="$RN_KEY"
export MK6_MCP_KEY="$MCP_KEY"
export MK6_CONTROL_KEY="$CONTROL_KEY"
export MK6_PLATFORM_IMAGE="$PLATFORM_IMAGE"
export MK6_FLEET_CONTAINER_URL="$FLEET_CONTAINER_URL"
export MK6_FLEET_MANIFEST="$EVIDENCE_DIR/${RUN_ID}-fleet-manifest.json"
export MK6_POSTGRES_PORT="$POSTGRES_PORT"
export MK6_MASTRA_PORT="$MASTRA_PORT"
export MK6_ZERO_PORT="$ZERO_PORT"
export MK6_POSTGRES_VOLUME="$VOLUME"
export MK6_REPO_ROOT="$ROOT"
export MK6_IMAGE_DIGEST="$IMAGE_ID"
export MK6_SOURCE_REVISION="$SOURCE_REVISION"
export MK6_COMPOSE_GENERATION="$COMPOSE_GENERATION"
export MK6_COMPOSE_SHA256="$COMPOSE_SHA256"
export MK6_DEPLOY_HOST="$DEPLOY_HOST"
export MK6_DEPLOYED_AT="$DEPLOYED_AT"
export MK6_MASTRA_URL="http://127.0.0.1:${MASTRA_PORT}"
export MK6_ZERO_URL="http://127.0.0.1:${ZERO_PORT}"
export MK6_DATABASE_URL="$DATABASE_URL"

COMPOSE=(docker compose -f "$COMPOSE_FILE" -p "$PROJECT")
STACK_STARTED=0
cleanup() {
  if [[ "$STACK_STARTED" == "1" && "${MK6_KEEP_STACK:-0}" != "1" ]]; then
    "${COMPOSE[@]}" down --volumes --remove-orphans >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

STACK_STARTED=1
if ! "${COMPOSE[@]}" up -d --wait --wait-timeout 180 >"$EVIDENCE_DIR/${RUN_ID}-compose-up.log" 2>&1; then
  "${COMPOSE[@]}" ps >"$EVIDENCE_DIR/${RUN_ID}-compose-ps.log" 2>&1 || true
  "${COMPOSE[@]}" logs --no-color 2>&1 | redact_stream >"$EVIDENCE_DIR/${RUN_ID}-compose-logs.log" || true
  json_error 'isolated real-service Compose startup failed'
  exit 1
fi

run_helper() {
  env \
    MK6_DATABASE_URL="$MK6_DATABASE_URL" \
    MK6_MASTRA_URL="$MK6_MASTRA_URL" \
    MK6_ZERO_URL="$MK6_ZERO_URL" \
    MK6_RN_KEY="$MK6_RN_KEY" \
    FLEET_URL="$FLEET_URL" \
    FLEET_KEY="$FLEET_KEY" \
    MK6_NEGATIVE_DEPENDENCY="${MK6_NEGATIVE_DEPENDENCY:-}" \
    MK6_SCHEDULER_HEARTBEAT_TIMEOUT_MS="${MK6_SCHEDULER_HEARTBEAT_TIMEOUT_MS:-75000}" \
    MK6_SCHEDULER_NEGATIVE_TIMEOUT_MS="${MK6_SCHEDULER_NEGATIVE_TIMEOUT_MS:-5000}" \
    bun "$HELPER" "$@"
}

POSITIVE_FILE="$EVIDENCE_DIR/${RUN_ID}-positive.json"
set +e
run_helper >"$POSITIVE_FILE"
positive_status=$?
set -e

manual_only='[{"id":"DEP-M1","status":"manual_only","requires":["R2_RESTORE_ACCESS_KEY_ID","R2_RESTORE_SECRET_ACCESS_KEY"]},{"id":"DEP-M2","status":"manual_only","requires":["MAESTRO_DEVICE","simulator UDID","exclusive Xcode/DerivedData ownership"]},{"id":"DEP-M3","status":"manual_only","requires":["second authorized tailnet device"]}]'

if [[ "${MK6_NEGATIVE_DEPENDENCY:-}" == "zero" ]]; then
  # A zero-only negative control is evaluated against the live stack without
  # touching any container: the helper probes an unreachable Zero endpoint.
  set +e
  MK6_NEGATIVE_DEPENDENCY=zero run_helper --negative >"$EVIDENCE_DIR/${RUN_ID}-negative-zero.json"
  negative_status=$?
  set -e
  jq -n --argjson result "$(cat "$EVIDENCE_DIR/${RUN_ID}-negative-zero.json")" --argjson manual "$manual_only" \
    '{ready:false,negativeDependency:"zero",dependencyResult:$result,manualOnly:$manual}'
  [[ "$negative_status" -ne 0 ]] || exit 1
  exit 1
fi

if [[ "${MK6_NEGATIVE_DEPENDENCY:-}" == "core-matrix" ]]; then
  matrix_file="$EVIDENCE_DIR/${RUN_ID}-negative-matrix.jsonl"
  : >"$matrix_file"
  for dependency in postgres fleet mastra scheduler zero; do
    if [[ "$dependency" == "scheduler" ]]; then
      "${COMPOSE[@]}" stop scheduler >"$EVIDENCE_DIR/${RUN_ID}-stop-scheduler.log" 2>&1 || true
    fi
    set +e
    MK6_NEGATIVE_DEPENDENCY="$dependency" run_helper --negative >>"$matrix_file"
    dependency_status=$?
    set -e
    if [[ "$dependency" == "scheduler" ]]; then
      "${COMPOSE[@]}" start scheduler >"$EVIDENCE_DIR/${RUN_ID}-start-scheduler.log" 2>&1 || true
    fi
    jq -cn --arg dependency "$dependency" --arg status "$dependency_status" \
      --slurpfile result <(tail -n 1 "$matrix_file") '{dependency:$dependency,exitStatus:($status|tonumber),result:$result[0]}' \
      >>"$EVIDENCE_DIR/${RUN_ID}-negative-cases.jsonl"
  done
  matrix_json="$(jq -s '.' "$EVIDENCE_DIR/${RUN_ID}-negative-cases.jsonl")"
  named_count="$(jq '[.[] | select(.exitStatus != 0 and (.result.dependency // "") != "")] | length' <<<"$matrix_json")"
  jq -n --argjson cases "$matrix_json" --argjson manual "$manual_only" --argjson named "$named_count" \
    '{ready:false,enumeratedDependencyCount:5,namedDependencyFailureCount:$named,readyCount:0,negativeCases:$cases,manualOnly:$manual}'
  [[ "$named_count" == "5" ]] || exit 1
  exit 1
fi

if [[ "$positive_status" -ne 0 ]]; then
  jq -n --argjson result "$(cat "$POSITIVE_FILE")" --argjson manual "$manual_only" \
    '{ready:false,result:$result,manualOnly:$manual}'
  exit "$positive_status"
fi
jq -n --argjson result "$(cat "$POSITIVE_FILE")" --argjson manual "$manual_only" \
  '{ready:($result.ready == true),result:$result,manualOnly:$manual}'

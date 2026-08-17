#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR=$(cd -- "$(dirname -- "$0")" && pwd)
REPO_ROOT=$(cd -- "$SCRIPT_DIR/.." && pwd)
MODE=
ROUTER_URL=http://holocron.tail011a51.ts.net:4545
HEALTH_URL=https://holocron.tail011a51.ts.net:44111/health
HOLOCRON_HOST=
REMOTE_COMPOSE_FILE=
REMOTE_DOCKER_BIN=
NEGATIVE_CONTROL=
INFERENCE1_HOST=
INFERENCE2_HOST=
REQUEST_COUNT=6
EVIDENCE_DIR=.tmp/S33-OPS-02
HTTP_TIMEOUT=180
SSH_TIMEOUT=12
EXPECTED_REVIEWER_BASE=http://inference2.tail011a51.ts.net:8003/v1
EXPECTED_INFERENCE1_BASE=http://inference1.tail011a51.ts.net:8003/v1
EXPECTED_INFERENCE2_BASE=http://inference2.tail011a51.ts.net:8003/v1
LOG_PATH='${HOME}/local-llm/logs/omlx-mini-8003.log'

die() { echo "S33-OPS-02 verifier failed: $*" >&2; exit 1; }
usage() { echo "usage: $0 --mode models-reviewer|implementer-distribution|health-flip [options]" >&2; exit 2; }

while (($#)); do
  case "$1" in
    --mode) (($# > 1)) || usage; MODE=$2; shift 2 ;;
    --router-url) (($# > 1)) || usage; ROUTER_URL=$2; shift 2 ;;
    --health-url) (($# > 1)) || usage; HEALTH_URL=$2; shift 2 ;;
    --holocron-host) (($# > 1)) || usage; HOLOCRON_HOST=$2; shift 2 ;;
    --remote-compose-file) (($# > 1)) || usage; REMOTE_COMPOSE_FILE=$2; shift 2 ;;
    --remote-docker-bin) (($# > 1)) || usage; REMOTE_DOCKER_BIN=$2; shift 2 ;;
    --negative-control) (($# > 1)) || usage; NEGATIVE_CONTROL=$2; shift 2 ;;
    --inference1-host) (($# > 1)) || usage; INFERENCE1_HOST=$2; shift 2 ;;
    --inference2-host) (($# > 1)) || usage; INFERENCE2_HOST=$2; shift 2 ;;
    --request-count) (($# > 1)) || usage; REQUEST_COUNT=$2; shift 2 ;;
    --evidence-dir) (($# > 1)) || usage; EVIDENCE_DIR=$2; shift 2 ;;
    --remote-log-path) (($# > 1)) || usage; LOG_PATH=$2; shift 2 ;;
    --health-regression) MODE=health-regression; shift ;;
    --help|-h) usage ;;
    *) usage ;;
  esac
done

case "$MODE" in
  models-reviewer) [[ -n "$INFERENCE1_HOST" ]] || die "--inference1-host is required" ;;
  implementer-distribution)
    [[ -n "$INFERENCE1_HOST" && -n "$INFERENCE2_HOST" ]] || die "both mini hosts are required"
    [[ "$REQUEST_COUNT" =~ ^[1-9][0-9]*$ && "$REQUEST_COUNT" -ge 2 ]] || die "--request-count must be >= 2"
    ;;
  health-regression) [[ -z "$NEGATIVE_CONTROL" ]] || die "--negative-control is only valid with --mode health-flip" ;;
  health-flip)
    [[ -z "$INFERENCE1_HOST" && -z "$INFERENCE2_HOST" ]] || die "inference host options are not valid for health-flip"
    [[ "$REQUEST_COUNT" == 6 ]] || die "request count is not valid for health-flip"
    [[ "$LOG_PATH" == '${HOME}/local-llm/logs/omlx-mini-8003.log' ]] || die "remote log path is not valid for health-flip"
    [[ "$HOLOCRON_HOST" == holocron ]] || die "--holocron-host must be exactly holocron"
    [[ "$REMOTE_COMPOSE_FILE" == /Users/holocron/Projects/holocron/.kb-run-sprint/worktrees/S33-OPS-02/services/platform/deploy/compose/router.compose.yaml ]] || die "--remote-compose-file must be the exact deployed isolated compose file"
    [[ "$REMOTE_DOCKER_BIN" == /usr/local/bin/docker ]] || die "--remote-docker-bin must be exactly /usr/local/bin/docker"
    [[ "$ROUTER_URL" == http://holocron.tail011a51.ts.net:4545 ]] || die "--router-url must be the canonical router URL"
    [[ "$HEALTH_URL" == https://holocron.tail011a51.ts.net:44111/health ]] || die "--health-url must be the canonical health URL"
    if [[ -n "$NEGATIVE_CONTROL" && "$NEGATIVE_CONTROL" != fail-after-stop ]]; then
      die "unsupported health-flip negative control"
    fi
    if [[ "$NEGATIVE_CONTROL" == fail-after-stop ]]; then
      [[ "$EVIDENCE_DIR" == .tmp/S33-OPS-02/health-flip-negative ]] || die "negative health-flip evidence path is not allowlisted"
    else
      [[ "$EVIDENCE_DIR" == .tmp/S33-OPS-02/health-flip ]] || die "health-flip evidence path is not allowlisted"
    fi
    ;;
  *) die "unsupported mode" ;;
esac
if [[ "$MODE" != health-regression ]]; then
  [[ "$ROUTER_URL" =~ ^https?://[^[:space:]]+$ ]] || die "router URL must be an http(s) URL without whitespace"
  [[ "$HEALTH_URL" =~ ^https?://[^[:space:]]+$ ]] || die "health URL must be an http(s) URL without whitespace"
  [[ -z "$INFERENCE1_HOST" || "$INFERENCE1_HOST" =~ ^[A-Za-z0-9._:-]+$ ]] || die "inference1 host is invalid"
  [[ -z "$INFERENCE2_HOST" || "$INFERENCE2_HOST" =~ ^[A-Za-z0-9._:-]+$ ]] || die "inference2 host is invalid"
  [[ "$LOG_PATH" =~ ^(\$\{HOME\}/|/)[A-Za-z0-9._/-]+$ ]] || die "remote log path is invalid"
fi

resolve_evidence_paths() {
  local resolved
  if ! resolved=$(python3 - "$REPO_ROOT" "$EVIDENCE_DIR" <<'PY'
import os
import pathlib
import sys

repo, candidate_arg = sys.argv[1:]
approved = os.path.abspath(os.path.join(repo, '.tmp', 'S33-OPS-02'))
approved_real = os.path.realpath(approved)
if not os.path.isdir(approved_real):
    raise SystemExit('approved evidence root is missing or not a directory')
if approved_real != approved:
    raise SystemExit('approved evidence root is a symlink')

parts = pathlib.PurePath(candidate_arg).parts
if '..' in parts:
    raise SystemExit('candidate evidence path contains ..')
candidate = os.path.abspath(candidate_arg if os.path.isabs(candidate_arg) else os.path.join(repo, candidate_arg))
if os.path.commonpath((approved, candidate)) != approved:
    raise SystemExit('candidate evidence path is outside the approved root')

relative = os.path.relpath(candidate, approved)
current = approved
if relative != '.':
    for part in pathlib.PurePath(relative).parts:
        current = os.path.join(current, part)
        if os.path.islink(current):
            raise SystemExit('candidate evidence path contains a symlink')

candidate_real = os.path.realpath(candidate)
if os.path.commonpath((approved_real, candidate_real)) != approved_real:
    raise SystemExit('canonical candidate evidence path is outside the approved root')
print(f'{approved_real}\t{candidate_real}')
PY
  ); then
    die "evidence path rejected"
  fi
  IFS=$'\t' read -r EVIDENCE_ROOT EVIDENCE_PATH <<<"$resolved"
  [[ -n "$EVIDENCE_ROOT" && -n "$EVIDENCE_PATH" ]] || die 'evidence path resolution returned no path'
}

health_ssh() {
  ssh -o BatchMode=yes -o StrictHostKeyChecking=yes -o ConnectTimeout=10 \
    -o ServerAliveInterval=5 -o ServerAliveCountMax=2 "$HOLOCRON_HOST" "$1"
}

health_capture_raw() {
  local destination=$1 label=$2 temporary status rc
  temporary="$EVIDENCE_PATH/.$label.$$"
  rm -f -- "$temporary"
  set +e
  status=$(curl --silent --show-error --connect-timeout 5 --max-time 20 \
    --output "$temporary" --write-out '%{http_code}' "$HEALTH_URL" \
    2>"$EVIDENCE_PATH/$label.curl.stderr")
  rc=$?
  set -e
  ((rc == 0)) || return "$rc"
  [[ -s "$temporary" ]] || return 1
  mv -f -- "$temporary" "$destination"
  printf '%s\n' "$status" >"$EVIDENCE_PATH/$label.status.txt"
}

health_archive_existing_outcome() {
  [[ "$MODE" == health-flip ]] || return 0
  if [[ -e "$EVIDENCE_PATH" ]]; then
    if [[ -d "$EVIDENCE_PATH" ]] && [[ -z "$(find "$EVIDENCE_PATH" -mindepth 1 -maxdepth 1 -print -quit)" ]]; then
      return 0
    fi
    local stamp archive suffix
    stamp="$(date '+%Y%m%dT%H%M%S')-$$"
    suffix=normal
    [[ "$NEGATIVE_CONTROL" == fail-after-stop ]] && suffix=negative
    archive="$EVIDENCE_ROOT/health-flip-attempts/$stamp-$suffix"
    mkdir -p -- "$EVIDENCE_ROOT/health-flip-attempts"
    [[ ! -e "$archive" ]] || die "outcome archive already exists"
    mv -- "$EVIDENCE_PATH" "$archive"
  fi
}


health_assert_state() {
  python3 - "$1" "$2" <<'PY'
import json, math, sys
path, expected = sys.argv[1:]
value = json.load(open(path, encoding='utf-8'))
states = {'pre': ('ok', True, None), 'degraded': ('degraded', False, 'fleet'), 'restored': ('ok', True, None)}
if expected not in states:
    raise SystemExit(f'unknown health state {expected!r}')
status, ready, failure = states[expected]
if value.get('status') != status:
    raise SystemExit(f'{expected} status={value.get("status")!r}')
fleet = value.get('fleet')
if not isinstance(fleet, dict) or fleet.get('ready') is not ready:
    raise SystemExit(f'{expected} fleet.ready mismatch')
if value.get('failing_dependency') != failure:
    raise SystemExit(f'{expected} failing_dependency={value.get("failing_dependency")!r}')
identity = value.get('deployment', {}).get('identity')
if not isinstance(identity, dict):
    raise SystemExit(f'{expected} deployment identity is missing')
for field in ('host', 'runtime', 'imageDigest', 'sourceRevision', 'composeGeneration'):
    if not isinstance(identity.get(field), str) or not identity[field].strip():
        raise SystemExit(f'{expected} deployment identity field {field} is missing')
if not isinstance(identity.get('pid'), int) or isinstance(identity.get('pid'), bool) or identity['pid'] <= 0:
    raise SystemExit(f'{expected} deployment pid is invalid')
uptime = identity.get('uptimeMs')
if isinstance(uptime, bool) or not isinstance(uptime, (int, float)) or not math.isfinite(uptime) or uptime < 0:
    raise SystemExit(f'{expected} deployment uptimeMs is not finite')
print(json.dumps({'status': status, 'fleet_ready': ready, 'failing_dependency': failure, 'uptimeMs': uptime}, sort_keys=True))
PY
}

health_poll_state() {
  local destination=$1 expected=$2 attempt temporary
  for ((attempt=1; attempt<=45; attempt++)); do
    temporary="$EVIDENCE_PATH/.health-$expected-$attempt.json"
    if health_capture_raw "$temporary" "health-$expected-$attempt" && health_assert_state "$temporary" "$expected" >/dev/null 2>&1; then
      mv -f -- "$temporary" "$destination"
      return 0
    fi
    rm -f -- "$temporary"
    sleep 1
  done
  return 1
}

health_capture_remote_file() {
  local destination=$1 label=$2 command=$3 temporary
  temporary="$EVIDENCE_PATH/.$label.$$"
  rm -f -- "$temporary"
  if ! health_ssh "$command" >"$temporary" 2>"$EVIDENCE_PATH/$label.ssh.stderr"; then
    rm -f -- "$temporary"
    return 1
  fi
  [[ -s "$temporary" ]] || { rm -f -- "$temporary"; return 1; }
  mv -f -- "$temporary" "$destination"
}

health_router_inspect() {
  health_ssh "set -eu
D='$REMOTE_DOCKER_BIN'
C='$REMOTE_COMPOSE_FILE'
ids=\$(\"\$D\" compose -f \"\$C\" ps -q litellm-router)
set -- \$ids
test \$# -eq 1
test -n \"\$1\"
\"\$D\" inspect \"\$1\""
}

health_production_command() {
  cat <<'REMOTE'
set -eu
D='/usr/local/bin/docker'
for service in postgres mastra scheduler zero-cache; do
  found=$("$D" ps -q --filter "label=com.docker.compose.service=$service")
  count=$(printf '%s\n' "$found" | awk 'NF {n++} END {print n+0}')
  test "$count" -eq 1
  id=$(printf '%s\n' "$found" | awk 'NF {print; exit}')
  case "$service" in
    postgres) id_postgres="$id" ;;
    mastra) id_mastra="$id" ;;
    scheduler) id_scheduler="$id" ;;
    zero-cache) id_zero_cache="$id" ;;
  esac
done
"$D" inspect "$id_postgres" "$id_mastra" "$id_scheduler" "$id_zero_cache"
REMOTE
}

health_primary_command() {
  cat <<'REMOTE'
set -eu
P=/Users/holocron/Projects/holocron
head=$(git -C "$P" rev-parse HEAD)
status_sha256=$(git -C "$P" status --porcelain=v1 | shasum -a 256 | awk '{print $1}')
tracked_hash=$(git -C "$P" ls-files -s | shasum -a 256 | awk '{print $1}')
test -n "$head" -a -n "$status_sha256" -a -n "$tracked_hash"
printf '{"head":"%s","status_sha256":"%s","tracked_hash":"%s"}\n' "$head" "$status_sha256" "$tracked_hash"
REMOTE
}

health_assert_router_inspect() {
  python3 - "$1" "$2" <<'PY'
import json, sys
path, expected = sys.argv[1:]
value = json.load(open(path, encoding='utf-8'))
if not isinstance(value, list) or len(value) != 1:
    raise SystemExit('router inspect must contain exactly one record')
record = value[0]
labels = record.get('Config', {}).get('Labels', {})
if labels.get('com.docker.compose.project') != 'holocron-router':
    raise SystemExit('router compose project label is not holocron-router')
if labels.get('com.docker.compose.service') != 'litellm-router':
    raise SystemExit('router compose service label is not litellm-router')
if labels.get('com.docker.compose.project.config_files') != '/Users/holocron/Projects/holocron/.kb-run-sprint/worktrees/S33-OPS-02/services/platform/deploy/compose/router.compose.yaml':
    raise SystemExit('router compose file label is not the exact isolated file')
state = record.get('State', {})
if expected == 'running-healthy' and (state.get('Status') != 'running' or state.get('Health', {}).get('Status') != 'healthy'):
    raise SystemExit('router is not running and healthy')
print(json.dumps({'state': state.get('Status'), 'health': state.get('Health', {}).get('Status')}, sort_keys=True))
PY
}

health_wait_router_healthy() {
  local destination=$1 attempt temporary
  for ((attempt=1; attempt<=45; attempt++)); do
    temporary="$EVIDENCE_PATH/.router-post-$attempt.json"
    if health_router_inspect >"$temporary" 2>"$EVIDENCE_PATH/router-inspect-$attempt.ssh.stderr" && health_assert_router_inspect "$temporary" running-healthy >/dev/null 2>&1; then
      mv -f -- "$temporary" "$destination"
      return 0
    fi
    rm -f -- "$temporary"
    sleep 1
  done
  return 1
}

health_validate_raw_invariants() {
  python3 - "$EVIDENCE_PATH/health.pre.json" "$EVIDENCE_PATH/health.degraded.json" "$EVIDENCE_PATH/health.restored.json" "$EVIDENCE_PATH/production-containers.pre.json" "$EVIDENCE_PATH/production-containers.post.json" "$EVIDENCE_PATH/remote-primary.pre.json" "$EVIDENCE_PATH/remote-primary.post.json" <<'PY'
import json, math, sys
pre, degraded, restored, containers_pre, containers_post, primary_pre, primary_post = sys.argv[1:]
def load(path):
    return json.load(open(path, encoding='utf-8'))
health = [load(path) for path in (pre, degraded, restored)]
expected = [('ok', True, None), ('degraded', False, 'fleet'), ('ok', True, None)]
identities = []
for index, (value, state) in enumerate(zip(health, expected)):
    if (value.get('status'), value.get('fleet', {}).get('ready'), value.get('failing_dependency')) != state:
        raise SystemExit(f'health triplet mismatch at {index}')
    identity = value.get('deployment', {}).get('identity')
    if not isinstance(identity, dict):
        raise SystemExit(f'missing deployment identity at {index}')
    for field in ('host', 'runtime', 'imageDigest', 'sourceRevision', 'composeGeneration'):
        if not isinstance(identity.get(field), str) or not identity[field]:
            raise SystemExit(f'missing identity field {field} at {index}')
    if not isinstance(identity.get('pid'), int) or identity['pid'] <= 0:
        raise SystemExit(f'invalid pid at {index}')
    uptime = identity.get('uptimeMs')
    if isinstance(uptime, bool) or not isinstance(uptime, (int, float)) or not math.isfinite(uptime):
        raise SystemExit(f'uptimeMs is not finite at {index}')
    identities.append(identity)
for field in ('host', 'runtime', 'imageDigest', 'sourceRevision', 'composeGeneration', 'pid'):
    if not (identities[0][field] == identities[1][field] == identities[2][field]):
        raise SystemExit(f'deployment identity changed in {field}')
if not (identities[0]['uptimeMs'] <= identities[1]['uptimeMs'] <= identities[2]['uptimeMs']):
    raise SystemExit('deployment uptime is not monotonic')
def container_identities(path):
    records = load(path)
    if not isinstance(records, list) or len(records) != 4:
        raise SystemExit(f'production inspect is not exactly four records: {path}')
    result = {}
    for record in records:
        service = record.get('Config', {}).get('Labels', {}).get('com.docker.compose.service')
        if service not in {'postgres', 'mastra', 'scheduler', 'zero-cache'} or service in result:
            raise SystemExit(f'invalid production service in {path}: {service!r}')
        state = record.get('State', {})
        identity = (record.get('Id'), record.get('Image'), state.get('StartedAt'))
        if not all(isinstance(item, str) and item for item in identity):
            raise SystemExit(f'incomplete production identity in {path}: {service}')
        result[service] = identity
    if set(result) != {'postgres', 'mastra', 'scheduler', 'zero-cache'}:
        raise SystemExit(f'production service set mismatch in {path}')
    return result
if container_identities(containers_pre) != container_identities(containers_post):
    raise SystemExit('production container identities changed')
def primary(path):
    value = load(path)
    if set(value) != {'head', 'status_sha256', 'tracked_hash'} or not all(isinstance(item, str) and item for item in value.values()):
        raise SystemExit(f'invalid protected primary sentinel: {path}')
    return value
if primary(primary_pre) != primary(primary_post):
    raise SystemExit('protected remote primary sentinel changed')
print(json.dumps({'deployment_identity_unchanged': True, 'deployment_pid_unchanged': True, 'deployment_uptime_monotonic': True, 'production_service_identities_unchanged': True, 'remote_primary_unchanged': True, 'finite_numeric_uptime_count': 3}, sort_keys=True))
PY
}

health_write_failure() {
  local reason=$1 comparison=''
  comparison=$(health_validate_raw_invariants 2>/dev/null || true)
  python3 - "$EVIDENCE_PATH/failure.json" "$NEGATIVE_CONTROL" "$reason" "$HEALTH_CLEANUP_RESTORE_ARMED" "$HEALTH_CLEANUP_RESTORE_ATTEMPTED" "$HEALTH_RESTORE_SUCCEEDED" "$comparison" <<'PY'
import json, os, sys
out, negative, reason, armed, attempted, succeeded, comparison = sys.argv[1:]
root = os.path.dirname(out)
result = {'ok': False, 'mode': 'health-flip', 'negative_control': negative or None, 'intentional_failure_observed': negative == 'fail-after-stop', 'failure_reason': reason, 'cleanup_restore_armed': armed == '1', 'cleanup_restore_attempted': attempted == '1', 'restore_succeeded': succeeded == '1'}
def read_json(name):
    path = os.path.join(root, name)
    if os.path.isfile(path) and os.path.getsize(path):
        return json.load(open(path, encoding='utf-8'))
    return None
restored = read_json('health.restored.json')
if isinstance(restored, dict):
    result['restored_health'] = {'status': restored.get('status'), 'fleet': restored.get('fleet'), 'failing_dependency': restored.get('failing_dependency')}
for key in ('deployment_identity_unchanged', 'deployment_pid_unchanged', 'deployment_uptime_monotonic', 'production_service_identities_unchanged', 'remote_primary_unchanged'):
    result[key] = False
if comparison:
    result.update(json.loads(comparison))
router = read_json('router.post.json')
result['final_router'] = {'state': router[0].get('State', {}).get('Status'), 'health': router[0].get('State', {}).get('Health', {}).get('Status')} if isinstance(router, list) and router else {'state': None, 'health': None}
result['artifact_manifest'] = {}
for name in ('health.pre.json', 'health.degraded.json', 'health.restored.json', 'production-containers.pre.json', 'production-containers.post.json', 'remote-primary.pre.json', 'remote-primary.post.json'):
    path = os.path.join(root, name)
    if os.path.isfile(path) and os.path.getsize(path):
        result['artifact_manifest'][name.replace('.', '_')] = {'path': os.path.relpath(path, os.getcwd()), 'exists': True, 'byte_length': os.path.getsize(path)}
json.dump(result, open(out, 'w', encoding='utf-8'), indent=2, sort_keys=True)
open(out, 'a', encoding='utf-8').write('\n')
PY
}

HEALTH_MUTATION_STARTED=0
HEALTH_CLEANUP_RESTORE_ARMED=0
HEALTH_CLEANUP_RESTORE_ATTEMPTED=0
HEALTH_RESTORE_SUCCEEDED=0
HEALTH_CLEANUP_RUNNING=0

health_restore_router() {
  local restore_rc=0 comparison
  HEALTH_CLEANUP_RESTORE_ATTEMPTED=1
  set +e
  health_ssh "set -eu
D='$REMOTE_DOCKER_BIN'
C='$REMOTE_COMPOSE_FILE'
\"\$D\" compose -f \"\$C\" up -d litellm-router >/dev/null" >"$EVIDENCE_PATH/restore.stdout" 2>"$EVIDENCE_PATH/restore.ssh.stderr"
  restore_rc=$?
  if ((restore_rc == 0)); then
    health_wait_router_healthy "$EVIDENCE_PATH/router.post.json"
    restore_rc=$?
  fi
  if ((restore_rc == 0)); then
    health_poll_state "$EVIDENCE_PATH/health.restored.json" restored
    restore_rc=$?
  fi
  if ((restore_rc == 0)); then
    health_capture_remote_file "$EVIDENCE_PATH/production-containers.post.json" production-containers-post "$(health_production_command)"
    restore_rc=$?
  fi
  if ((restore_rc == 0)); then
    health_capture_remote_file "$EVIDENCE_PATH/remote-primary.post.json" remote-primary-post "$(health_primary_command)"
    restore_rc=$?
  fi
  if ((restore_rc == 0)); then
    comparison=$(health_validate_raw_invariants 2>"$EVIDENCE_PATH/raw-invariants.stderr")
    restore_rc=$?
  fi
  set -e
  if ((restore_rc == 0)); then
    HEALTH_RESTORE_SUCCEEDED=1
  fi
  return "$restore_rc"
}

health_cleanup() {
  local original_rc=$1 restore_rc=0
  ((HEALTH_CLEANUP_RUNNING == 0)) || exit "$original_rc"
  ((HEALTH_MUTATION_STARTED == 1)) || exit "$original_rc"
  HEALTH_CLEANUP_RUNNING=1
  if ((HEALTH_RESTORE_SUCCEEDED == 0)); then
    health_restore_router || restore_rc=$?
  fi
  if [[ "$NEGATIVE_CONTROL" == fail-after-stop ]]; then
    health_write_failure "intentional fail-after-stop control"
    if ((HEALTH_RESTORE_SUCCEEDED == 1 && original_rc != 0)); then
      exit "$original_rc"
    fi
    exit 1
  fi
  if ((restore_rc != 0 || HEALTH_RESTORE_SUCCEEDED != 1)); then
    health_write_failure "cleanup restore failed"
    exit 1
  fi
  exit "$original_rc"
}

health_flip() {
  local comparison restored_json router_json
  trap 'health_cleanup "$?"' EXIT
  trap 'exit 130' HUP INT TERM

  health_ssh "test -x '$REMOTE_DOCKER_BIN'" || die 'remote Docker CLI is not executable'
  health_router_inspect >"$EVIDENCE_PATH/router.pre.json" 2>"$EVIDENCE_PATH/router-pre.ssh.stderr" || die 'could not inspect isolated router before mutation'
  health_assert_router_inspect "$EVIDENCE_PATH/router.pre.json" running-healthy >/dev/null || die 'isolated router is not running and healthy before mutation'
  health_capture_remote_file "$EVIDENCE_PATH/production-containers.pre.json" production-containers-pre "$(health_production_command)" || die 'could not capture production identities before mutation'
  health_capture_remote_file "$EVIDENCE_PATH/remote-primary.pre.json" remote-primary-pre "$(health_primary_command)" || die 'could not capture protected primary before mutation'
  health_capture_raw "$EVIDENCE_PATH/health.pre.json" health-pre || die 'could not capture pre-stop health'
  health_assert_state "$EVIDENCE_PATH/health.pre.json" pre >/dev/null || die 'pre-stop health is not ready'

  HEALTH_MUTATION_STARTED=1
  HEALTH_CLEANUP_RESTORE_ARMED=1
  health_ssh "set -eu
D='$REMOTE_DOCKER_BIN'
C='$REMOTE_COMPOSE_FILE'
\"\$D\" compose -f \"\$C\" stop litellm-router >/dev/null" || die 'router-only stop failed'
  health_poll_state "$EVIDENCE_PATH/health.degraded.json" degraded || die 'router stop did not produce exact degraded health'

  if [[ "$NEGATIVE_CONTROL" == fail-after-stop ]]; then
    die 'intentional fail-after-stop control'
  fi

  health_restore_router || die 'router restore or post-state validation failed'
  comparison=$(health_validate_raw_invariants) || die 'raw health/container/primary invariants failed'
  restored_json=$(health_assert_state "$EVIDENCE_PATH/health.restored.json" restored)
  router_json=$(health_assert_router_inspect "$EVIDENCE_PATH/router.post.json" running-healthy)
  python3 - "$RESULT_PATH" "$restored_json" "$router_json" "$comparison" <<'PY'
import json, os, sys
out, restored, router, comparison = sys.argv[1:]
root = os.path.dirname(out)
def art(path):
    if not os.path.isfile(path) or os.path.getsize(path) < 1:
        raise SystemExit(f'missing or empty artifact: {path}')
    return {'path': os.path.relpath(path, os.getcwd()), 'exists': True, 'byte_length': os.path.getsize(path)}
files = ('health.pre.json', 'health.degraded.json', 'health.restored.json', 'production-containers.pre.json', 'production-containers.post.json', 'remote-primary.pre.json', 'remote-primary.post.json')
manifest = {name.replace('.', '_'): art(os.path.join(root, name)) for name in files}
result = {'ok': True, 'mode': 'health-flip', 'ssh_host': 'holocron', 'remote_docker_bin': '/usr/local/bin/docker', 'remote_compose_file': '/Users/holocron/Projects/holocron/.kb-run-sprint/worktrees/S33-OPS-02/services/platform/deploy/compose/router.compose.yaml', 'cleanup_restore_armed': True, 'restore_succeeded': True, 'pre_health': {'status': 'ok', 'fleet_ready': True, 'failing_dependency': None}, 'degraded_health': {'status': 'degraded', 'fleet_ready': False, 'failing_dependency': 'fleet'}, 'restored_health': json.loads(restored), 'deployment_identity_unchanged': True, 'deployment_pid_unchanged': True, 'deployment_uptime_monotonic': True, 'production_service_identities_unchanged': True, 'remote_primary_unchanged': True, 'final_router': json.loads(router), 'raw_invariant_comparison': json.loads(comparison), 'artifact_manifest': manifest}
json.dump(result, open(out, 'w', encoding='utf-8'), indent=2, sort_keys=True)
open(out, 'a', encoding='utf-8').write('\n')
PY
  HEALTH_MUTATION_STARTED=0
}




resolve_evidence_paths
health_archive_existing_outcome
if [[ "$MODE" != health-regression ]]; then
  mkdir -p -- "$EVIDENCE_PATH"
  ERRORS_PATH=$EVIDENCE_PATH/errors.log
  : > "$ERRORS_PATH"
  RESULT_PATH=$EVIDENCE_PATH/result.json
  ROUTER_BASE=$(printf '%s' "$ROUTER_URL" | sed 's:/*$::')

# Preserve other S33 evidence.  A mode owns only these paths and its request
# subtree; never erase the task evidence root or another mode's artifacts.
for owned in \
  result.json health.json health.headers.txt health.status.txt health.json.curl.stderr \
  laptop-models.json laptop-models.headers.txt laptop-models.status.txt laptop-models.json.curl.stderr \
  inference1-models.json inference1-models.ssh.stderr inference1-models.ssh.provenance.txt inference1-models.ssh.exit.txt reviewer-payload.json reviewer-body.json \
  reviewer-headers.txt reviewer.status.txt reviewer-body.json.curl.stderr \
  inference1-log-baseline.bytes inference2-log-baseline.bytes inference1-log-post.bytes \
  inference2-log-post.bytes inference1-log-growth.bytes inference2-log-growth.bytes \
  inference1-log-baseline.json inference2-log-baseline.json inference1-log-post.json inference2-log-post.json \
  inference1-log-post-baseline.log inference2-log-post-baseline.log request-summaries.jsonl; do
  rm -f -- "$EVIDENCE_PATH/$owned"
done
rm -rf -- "$EVIDENCE_PATH/requests"
fi

relative_path() {
  printf '%s\n' "$1" | sed "s#^$REPO_ROOT#.#"
}

local_http() {
  local method=$1 url=$2 body=$3 headers=$4 status_file=$5 payload=$6
  local status rc
  set +e
  if [[ -n "$payload" ]]; then
    status=$(curl --silent --show-error --connect-timeout 8 --max-time "$HTTP_TIMEOUT" --retry 0 --request "$method" --header 'content-type: application/json' --data-binary "@$payload" --dump-header "$headers" --output "$body" --write-out '%{http_code}' "$url" 2>"$body.curl.stderr")
  else
    status=$(curl --silent --show-error --connect-timeout 8 --max-time "$HTTP_TIMEOUT" --retry 0 --request "$method" --dump-header "$headers" --output "$body" --write-out '%{http_code}' "$url" 2>"$body.curl.stderr")
  fi
  rc=$?
  set -e
  printf '%s' "$status" >"$status_file"
  ((rc == 0)) || { cat "$body.curl.stderr" >> "$ERRORS_PATH"; die "curl failed for $url"; }
  [[ "$status" =~ ^2[0-9][0-9]$ ]] || die "HTTP $status from $url"
}

remote_models() {
  local host=$1 url=$2 body=$3 err=$4 qurl
  printf -v qurl '%q' "$url"
  printf 'host=%s\nssh_options=BatchMode=yes,StrictHostKeyChecking=yes,ConnectTimeout=%s,ConnectionAttempts=1,ServerAliveInterval=5,ServerAliveCountMax=2\ncommand=curl --silent --show-error --fail --connect-timeout 8 --max-time %s %s\n' "$host" "$SSH_TIMEOUT" "$HTTP_TIMEOUT" "$url" >"$EVIDENCE_PATH/inference1-models.ssh.provenance.txt"
  set +e
  ssh -o BatchMode=yes -o StrictHostKeyChecking=yes -o ConnectTimeout="$SSH_TIMEOUT" -o ConnectionAttempts=1 -o ServerAliveInterval=5 -o ServerAliveCountMax=2 "$host" "curl --silent --show-error --fail --connect-timeout 8 --max-time $HTTP_TIMEOUT $qurl" >"$body" 2>"$err"
  local rc=$?
  set -e
  printf '%s\n' "$rc" >"$EVIDENCE_PATH/inference1-models.ssh.exit.txt"
  if ((rc != 0)); then
    cat "$err" >> "$ERRORS_PATH"; die "SSH-originated models curl failed"
  fi
  [[ -s "$body" ]] || die "SSH-originated models response is empty"
}

remote_log_identity() {
  local host=$1 out
  out=$(ssh -o BatchMode=yes -o StrictHostKeyChecking=yes -o ConnectTimeout="$SSH_TIMEOUT" -o ConnectionAttempts=1 -o ServerAliveInterval=5 -o ServerAliveCountMax=2 "$host" "p=\"$LOG_PATH\"; stat -f \"%d %i %z\" \"\$p\" 2>/dev/null || stat -c \"%d %i %s\" \"\$p\"" 2>>"$ERRORS_PATH") || die "could not read oMLX log identity from $host"
  out=$(printf '%s' "$out" | tr -d '\r\n')
  [[ "$out" =~ ^[0-9]+[[:space:]]+[0-9]+[[:space:]]+[0-9]+$ ]] || die "invalid oMLX log identity from $host"
  printf '%s\n' "$out"
}

remote_segment() {
  local host=$1 offset=$2 count=$3 destination=$4
  ssh -o BatchMode=yes -o StrictHostKeyChecking=yes -o ConnectTimeout="$SSH_TIMEOUT" -o ConnectionAttempts=1 -o ServerAliveInterval=5 -o ServerAliveCountMax=2 "$host" "dd if=\"$LOG_PATH\" bs=1 skip=$offset count=$count 2>/dev/null" >"$destination" 2>>"$ERRORS_PATH" || die "could not read post-baseline log segment from $host"
}

write_log_identity() {
  local path=$1 host=$2 identity=$3 device inode size
  read -r device inode size <<<"$identity"
  printf '{"host":"%s","device":%s,"inode":%s,"byte_size":%s}\n' "$host" "$device" "$inode" "$size" >"$path"
}

wait_for_log_growth() {
  local host=$1 baseline=$2 current deadline=$((SECONDS + 30))
  local baseline_device baseline_inode baseline_size current_device current_inode current_size
  read -r baseline_device baseline_inode baseline_size <<<"$baseline"
  while :; do
    current=$(remote_log_identity "$host")
    read -r current_device current_inode current_size <<<"$current"
    [[ "$current_device" == "$baseline_device" && "$current_inode" == "$baseline_inode" ]] || die "oMLX log identity changed on $host"
    ((current_size >= baseline_size)) || die "oMLX log was truncated on $host"
    if ((current_size > baseline_size)); then
      printf '%s\n' "$current"
      return 0
    fi
    if ((SECONDS >= deadline)); then
      die "oMLX log did not grow after tracked requests on $host"
    fi
    sleep 1
  done
}

assert_models() {
  python3 - "$1" <<'PY'
import json,sys
try: d=json.load(open(sys.argv[1],encoding='utf-8'))
except Exception as e: raise SystemExit(f'invalid models JSON: {e}')
ids=[x.get('id') for x in d.get('data',[]) if isinstance(x,dict)]
if 'implementer' not in ids or 'reviewer' not in ids: raise SystemExit(f'missing exact roles: {ids!r}')
print('true')
PY
}

assert_health() {
  python3 - "$@" <<'PY'
import json,sys
try:
    if sys.argv[1]=='--json': d=json.loads(sys.argv[2])
    else: d=json.load(open(sys.argv[1],encoding='utf-8'))
except Exception as e: raise SystemExit(f'invalid health JSON: {e}')
if d.get('status')!='ok': raise SystemExit(f'health status={d.get("status")!r}')
f=d.get('fleet')
if not isinstance(f,dict) or f.get('ready') is not True: raise SystemExit(f'fleet not ready: {f!r}')
if 'failing_dependency' not in d: raise SystemExit('failing_dependency key is missing')
if d['failing_dependency'] is not None: raise SystemExit(f'failure dependency={d["failing_dependency"]!r}')
if not isinstance(f.get('latency_ms'),(int,float)) or f['latency_ms']<1: raise SystemExit(f'invalid fleet latency: {f.get("latency_ms")!r}')
print(json.dumps({'status':'ok','fleet_ready':True,'latency_ms':f['latency_ms']}))
PY
}

assert_deployment_identity() {
  python3 - "$1" "$2" <<'PY'
import json,sys
path,label=sys.argv[1:]
try: d=json.load(open(path,encoding='utf-8'))
except Exception as e: raise SystemExit(f'invalid {label} health JSON: {e}')
deployment=d.get('deployment')
identity=deployment.get('identity') if isinstance(deployment,dict) else None
if not isinstance(identity,dict): raise SystemExit(f'{label} deployment identity is missing')
required=('host','runtime','imageDigest','sourceRevision','composeGeneration')
for key in required:
    if not isinstance(identity.get(key),str) or not identity[key].strip(): raise SystemExit(f'{label} deployment identity field {key} is missing')
if not isinstance(identity.get('pid'),int) or identity['pid']<=0: raise SystemExit(f'{label} deployment pid is invalid')
if not isinstance(identity.get('uptimeMs'),(int,float)) or identity['uptimeMs']<0: raise SystemExit(f'{label} deployment uptimeMs is invalid')
print(json.dumps({key:identity[key] for key in (*required,'pid','uptimeMs')},sort_keys=True))
PY
}

compare_deployment_identity() {
  python3 - "$1" "$2" <<'PY'
import json,sys
baseline_path,post_path=sys.argv[1:]
def load(path,label):
    try: d=json.load(open(path,encoding='utf-8'))
    except Exception as e: raise SystemExit(f'invalid {label} health JSON: {e}')
    deployment=d.get('deployment')
    identity=deployment.get('identity') if isinstance(deployment,dict) else None
    if not isinstance(identity,dict): raise SystemExit(f'{label} deployment identity is missing')
    required=('host','runtime','imageDigest','sourceRevision','composeGeneration')
    for key in required:
        if not isinstance(identity.get(key),str) or not identity[key].strip(): raise SystemExit(f'{label} deployment identity field {key} is missing')
    if not isinstance(identity.get('pid'),int) or identity['pid']<=0: raise SystemExit(f'{label} deployment pid is invalid')
    if not isinstance(identity.get('uptimeMs'),(int,float)) or identity['uptimeMs']<0: raise SystemExit(f'{label} deployment uptimeMs is invalid')
    return identity
baseline=load(baseline_path,'pre-router-deploy baseline')
post=load(post_path,'post-deploy')
stable=('host','runtime','imageDigest','sourceRevision','composeGeneration','pid')
for key in stable:
    if baseline[key]!=post[key]: raise SystemExit(f'deployment identity changed in {key}: {baseline[key]!r} -> {post[key]!r}')
if post['uptimeMs']<baseline['uptimeMs']: raise SystemExit(f'deployment uptime regressed: {baseline["uptimeMs"]} -> {post["uptimeMs"]}')
print(json.dumps({'stable_identity_unchanged':True,'pid_unchanged':True,'uptime_monotonic':True,'baseline_uptime_ms':baseline['uptimeMs'],'post_uptime_ms':post['uptimeMs'],'uptime_delta_ms':post['uptimeMs']-baseline['uptimeMs']},sort_keys=True))
PY
}

require_pre_deploy_health_baseline() {
  local path=$1
  [[ -f "$path" && ! -L "$path" ]] || die "pre-router-deploy health baseline is missing"
  assert_deployment_identity "$path" 'pre-router-deploy baseline' >/dev/null || die "pre-router-deploy health baseline is malformed"
}

health_assertion_regression() {
  local missing_output nonnull_output valid_output missing_rc nonnull_rc
  set +e
  missing_output=$(assert_health --json '{"status":"ok","fleet":{"ready":true}}' 2>&1)
  missing_rc=$?
  nonnull_output=$(assert_health --json '{"status":"ok","fleet":{"ready":true,"latency_ms":1},"failing_dependency":"fleet"}' 2>&1)
  nonnull_rc=$?
  set -e
  ((missing_rc != 0)) || die 'health assertion regression accepted missing failing_dependency'
  [[ "$missing_output" == *'failing_dependency key is missing'* ]] || die 'health assertion regression reported the wrong missing-key cause'
  ((nonnull_rc != 0)) || die 'health assertion regression accepted non-null failing_dependency'
  [[ "$nonnull_output" == *'failure dependency='* ]] || die 'health assertion regression reported the wrong non-null cause'
  valid_output=$(assert_health --json '{"status":"ok","fleet":{"ready":true,"latency_ms":1},"failing_dependency":null}')
  [[ "$valid_output" == *'"fleet_ready": true'* ]] || die 'health assertion regression rejected exact null failing_dependency'
  printf '%s\n' "$valid_output"
}

assert_reviewer() {
  python3 - "$1" "$2" "$3" "$EXPECTED_REVIEWER_BASE" <<'PY'
import json,sys
body,headers,status,expected=sys.argv[1:]
s=open(status).read().strip()
if not s.isdigit() or not 200<=int(s)<300: raise SystemExit(f'bad reviewer HTTP status {s!r}')
try: d=json.load(open(body,encoding='utf-8'))
except Exception as e: raise SystemExit(f'bad reviewer JSON: {e}')
try: content=d['choices'][0]['message']['content']
except (KeyError,IndexError,TypeError) as e: raise SystemExit(f'missing reviewer content: {e}')
if not isinstance(content,str) or not content.strip(): raise SystemExit('empty reviewer content')
base=None
for line in open(headers,encoding='utf-8',errors='replace'):
    k,sep,v=line.partition(':')
    if sep and k.strip().lower()=='x-litellm-model-api-base': base=v.strip()
if base!=expected or 'inference1.tail011a51.ts.net' in base: raise SystemExit(f'wrong reviewer backend: {base!r}')
print(json.dumps({'http_status':int(s),'content_nonempty':True,'api_base':base}))
PY
}

make_payload() {
  python3 - "$1" "$2" <<'PY'
import json,sys
p={'model':'implementer','messages':[{'role':'user','content':f'S33-OPS-02 live capacity request {sys.argv[2]}: reply with a short unique sentence.'}],'max_tokens':96,'temperature':0.7}
with open(sys.argv[1],'w',encoding='utf-8') as h: json.dump(p,h,separators=(',',':')); h.write('\n')
PY
}

request_one() {
  local dir=$1 url=$2
  set +e
  curl --silent --show-error --connect-timeout 8 --max-time "$HTTP_TIMEOUT" --retry 0 --header 'content-type: application/json' --data-binary "@$dir/payload.json" --dump-header "$dir/headers.txt" --output "$dir/body.json" --write-out '%{http_code}' "$url" >"$dir/status.txt" 2>"$dir/curl.stderr"
  local rc=$?
  set -e
  printf '%s\n' "$rc" >"$dir/curl-exit.txt"
  return "$rc"
}

assert_request() {
  python3 - "$1" "$EXPECTED_INFERENCE1_BASE" "$EXPECTED_INFERENCE2_BASE" <<'PY'
import hashlib,json,sys,os
d,e1,e2=sys.argv[1:]
metadata=json.load(open(f'{d}/metadata.json',encoding='utf-8'))
if not isinstance(metadata.get('pid'),int) or metadata['pid']<=0: raise SystemExit('request metadata has no valid tracked PID')
status=open(f'{d}/status.txt').read().strip(); rc=open(f'{d}/curl-exit.txt').read().strip()
if rc!='0': raise SystemExit(f'curl exit={rc!r}')
if not status.isdigit() or not 200<=int(status)<300: raise SystemExit(f'bad HTTP status={status!r}')
b=open(f'{d}/body.json','rb').read()
if not b: raise SystemExit('empty response body')
try: x=json.loads(b)
except Exception as e: raise SystemExit(f'bad response JSON: {e}')
try: content=x['choices'][0]['message']['content']
except (KeyError,IndexError,TypeError) as e: raise SystemExit(f'missing generated content: {e}')
if not isinstance(content,str) or not content.strip(): raise SystemExit('empty generated content')
base=None
for line in open(f'{d}/headers.txt',encoding='utf-8',errors='replace'):
    k,sep,v=line.partition(':')
    if sep and k.strip().lower()=='x-litellm-model-api-base': base=v.strip()
if base not in {e1,e2}: raise SystemExit(f'wrong backend header={base!r}')
print(json.dumps({'request_dir':os.path.relpath(d,os.getcwd()),'request_id':metadata['request_id'],'pid':metadata['pid'],'http_status':int(status),'api_base':base,'body_bytes':len(b),'body_sha256':hashlib.sha256(b).hexdigest(),'content_nonempty':True}))
PY
}

models_reviewer() {
  local pre=$EVIDENCE_PATH/health.pre-deploy.json
  local hb=$EVIDENCE_PATH/health.json hh=$EVIDENCE_PATH/health.headers.txt hs=$EVIDENCE_PATH/health.status.txt
  local lm=$EVIDENCE_PATH/laptop-models.json im=$EVIDENCE_PATH/inference1-models.json
  local rp=$EVIDENCE_PATH/reviewer-payload.json rb=$EVIDENCE_PATH/reviewer-body.json rh=$EVIDENCE_PATH/reviewer-headers.txt rs=$EVIDENCE_PATH/reviewer.status.txt
  local health_json reviewer_json deployment_json
  require_pre_deploy_health_baseline "$pre"
  local_http GET "$HEALTH_URL" "$hb" "$hh" "$hs" ""
  health_json=$(assert_health "$hb")
  deployment_json=$(compare_deployment_identity "$pre" "$hb") || die "deployment identity changed across router deploy"
  local_http GET "$ROUTER_BASE/v1/models" "$lm" "$EVIDENCE_PATH/laptop-models.headers.txt" "$EVIDENCE_PATH/laptop-models.status.txt" ""
  [[ "$(assert_models "$lm")" == true ]] || die "laptop role assertion failed"
  remote_models "$INFERENCE1_HOST" "$ROUTER_BASE/v1/models" "$im" "$EVIDENCE_PATH/inference1-models.ssh.stderr"
  [[ "$(assert_models "$im")" == true ]] || die "inference1 role assertion failed"
  python3 - "$rp" <<'PY'
import json,sys
with open(sys.argv[1],'w',encoding='utf-8') as h:
    json.dump({'model':'reviewer','messages':[{'role':'user','content':'S33-OPS-02 live reviewer check: reply with a short sentence.'}],'max_tokens':96,'temperature':0},h,separators=(',',':')); h.write('\n')
PY
  local_http POST "$ROUTER_BASE/v1/chat/completions" "$rb" "$rh" "$rs" "$rp"
  reviewer_json=$(assert_reviewer "$rb" "$rh" "$rs")
  python3 - "$RESULT_PATH" "$MODE" "$pre" "$hb" "$hh" "$hs" "$lm" "$EVIDENCE_PATH/laptop-models.headers.txt" "$EVIDENCE_PATH/laptop-models.status.txt" "$im" "$EVIDENCE_PATH/inference1-models.ssh.provenance.txt" "$EVIDENCE_PATH/inference1-models.ssh.exit.txt" "$rb" "$rh" "$rs" "$rp" "$health_json" "$deployment_json" "$reviewer_json" <<'PY'
import json,os,sys
out,mode,pre,health,health_headers,health_status,laptop,laptop_headers,laptop_status,mini,ssh_provenance,ssh_exit,body,headers,reviewer_status,payload,health_json,deployment_json,reviewer_json=sys.argv[1:]
def art(p):
    if not os.path.isfile(p) or os.path.getsize(p)<1: raise SystemExit(f'missing or empty artifact: {p}')
    return {'path':os.path.relpath(p,os.getcwd()),'exists':True,'byte_length':os.path.getsize(p)}
manifest={'health_pre_deploy':art(pre),'health':art(health),'health_headers':art(health_headers),'health_status':art(health_status),'laptop_models':art(laptop),'laptop_models_headers':art(laptop_headers),'laptop_models_status':art(laptop_status),'inference1_models':art(mini),'inference1_ssh_provenance':art(ssh_provenance),'inference1_ssh_exit':art(ssh_exit),'reviewer_payload':art(payload),'reviewer_body':art(body),'reviewer_headers':art(headers),'reviewer_status':art(reviewer_status)}
comparison=json.loads(deployment_json)
r={'ok':True,'mode':mode,'health':json.loads(health_json),'health_pre_deploy_artifact':manifest['health_pre_deploy'],'deployment_identity_comparison':comparison,'deployment_identity_unchanged':comparison['stable_identity_unchanged'],'deployment_pid_unchanged':comparison['pid_unchanged'],'deployment_uptime_monotonic':comparison['uptime_monotonic'],'deployment_restart_oracle_limitation':'health exposes no container restart count; oracle enforces stable deployment identity, unchanged pid, and monotonic uptime','laptop_models_artifact_path':manifest['laptop_models']['path'],'inference1_models_artifact_path':manifest['inference1_models']['path'],'laptop_models_artifact':manifest['laptop_models'],'inference1_models_artifact':manifest['inference1_models'],'laptop_models_has_both_roles':True,'inference1_models_has_both_roles':True,'reviewer_body_artifact':manifest['reviewer_body'],'reviewer_headers_artifact':manifest['reviewer_headers'],'reviewer_completion':json.loads(reviewer_json),'artifact_manifest':manifest}
if r['laptop_models_artifact_path']==r['inference1_models_artifact_path']: raise SystemExit('models artifact paths are not distinct')
json.dump(r,open(out,'w',encoding='utf-8'),indent=2,sort_keys=True); open(out,'a',encoding='utf-8').write('\n')
PY
}

distribution() {
  local rr=$EVIDENCE_PATH/requests
  local id dir baseline1 baseline2 post1 post2 growth1 growth2 failed=0 pid
  mkdir -p "$rr"
  baseline1=$(remote_log_identity "$INFERENCE1_HOST"); baseline2=$(remote_log_identity "$INFERENCE2_HOST")
  read -r _baseline1_device _baseline1_inode _baseline1_size <<<"$baseline1"
  read -r _baseline2_device _baseline2_inode _baseline2_size <<<"$baseline2"
  printf '%s\n' "$_baseline1_size" >"$EVIDENCE_PATH/inference1-log-baseline.bytes"
  printf '%s\n' "$_baseline2_size" >"$EVIDENCE_PATH/inference2-log-baseline.bytes"
  write_log_identity "$EVIDENCE_PATH/inference1-log-baseline.json" "$INFERENCE1_HOST" "$baseline1"
  write_log_identity "$EVIDENCE_PATH/inference2-log-baseline.json" "$INFERENCE2_HOST" "$baseline2"
  for ((id=1;id<=REQUEST_COUNT;id++)); do
    dir=$rr/request-$id; mkdir -p "$dir"; make_payload "$dir/payload.json" "$id"
    request_one "$dir" "$ROUTER_BASE/v1/chat/completions" &
    pid=$!
    printf '%s\n' "$pid" >"$dir/pid"
    printf '{"request_id":%s,"pid":%s,"prompt_artifact_path":"%s"}\n' "$id" "$pid" "$(relative_path "$dir/payload.json")" >"$dir/metadata.json"
  done
  for ((id=1;id<=REQUEST_COUNT;id++)); do pid=$(cat "$rr/request-$id/pid"); wait "$pid" || failed=1; done
  ((failed==0)) || die "tracked concurrent request failed"
  : >"$EVIDENCE_PATH/request-summaries.jsonl"
  for ((id=1;id<=REQUEST_COUNT;id++)); do assert_request "$rr/request-$id" >>"$EVIDENCE_PATH/request-summaries.jsonl"; done
  post1=$(wait_for_log_growth "$INFERENCE1_HOST" "$baseline1"); post2=$(wait_for_log_growth "$INFERENCE2_HOST" "$baseline2")
  read -r _post1_device _post1_inode _post1_size <<<"$post1"
  read -r _post2_device _post2_inode _post2_size <<<"$post2"
  printf '%s\n' "$_post1_size" >"$EVIDENCE_PATH/inference1-log-post.bytes"; printf '%s\n' "$_post2_size" >"$EVIDENCE_PATH/inference2-log-post.bytes"
  write_log_identity "$EVIDENCE_PATH/inference1-log-post.json" "$INFERENCE1_HOST" "$post1"
  write_log_identity "$EVIDENCE_PATH/inference2-log-post.json" "$INFERENCE2_HOST" "$post2"
  growth1=$((_post1_size-_baseline1_size)); growth2=$((_post2_size-_baseline2_size))
  ((growth1>0 && growth2>0)) || die "one mini log has no post-baseline growth"
  printf '%s\n' "$growth1" >"$EVIDENCE_PATH/inference1-log-growth.bytes"; printf '%s\n' "$growth2" >"$EVIDENCE_PATH/inference2-log-growth.bytes"
  remote_segment "$INFERENCE1_HOST" "$_baseline1_size" "$growth1" "$EVIDENCE_PATH/inference1-log-post-baseline.log"
  remote_segment "$INFERENCE2_HOST" "$_baseline2_size" "$growth2" "$EVIDENCE_PATH/inference2-log-post-baseline.log"
  [[ -s "$EVIDENCE_PATH/inference1-log-post-baseline.log" && -s "$EVIDENCE_PATH/inference2-log-post-baseline.log" ]] || die "post-baseline log segment empty"
  local fresh1 fresh2
  fresh1=$(grep -Ec 'Chat completion: model=Qwen3\.6-35B-A3B-MLX-8bit' "$EVIDENCE_PATH/inference1-log-post-baseline.log" || true)
  fresh2=$(grep -Ec 'Chat completion: model=Qwen3\.6-35B-A3B-MLX-8bit' "$EVIDENCE_PATH/inference2-log-post-baseline.log" || true)
  [[ "$fresh1" =~ ^[1-9][0-9]*$ ]] || die "inference1 fresh completion evidence missing"
  [[ "$fresh2" =~ ^[1-9][0-9]*$ ]] || die "inference2 fresh completion evidence missing"
  python3 - "$RESULT_PATH" "$MODE" "$EVIDENCE_PATH/request-summaries.jsonl" "$EVIDENCE_PATH/inference1-log-post-baseline.log" "$EVIDENCE_PATH/inference2-log-post-baseline.log" "$EVIDENCE_PATH/inference1-log-baseline.json" "$EVIDENCE_PATH/inference2-log-baseline.json" "$EVIDENCE_PATH/inference1-log-post.json" "$EVIDENCE_PATH/inference2-log-post.json" "$rr" "$REQUEST_COUNT" "$fresh1" "$fresh2" <<'PY'
import json,os,sys
out,mode,summaries,log1,log2,baseline1,baseline2,post1,post2,requests_dir,count,fresh1,fresh2=sys.argv[1:]
rows=[json.loads(x) for x in open(summaries) if x.strip()]
if len(rows)!=int(count): raise SystemExit(f'expected {count} request summaries, found {len(rows)}')
hosts={r['api_base'] for r in rows}
expected={'http://inference1.tail011a51.ts.net:8003/v1','http://inference2.tail011a51.ts.net:8003/v1'}
if hosts!=expected: raise SystemExit(f'expected both exact backend headers, got {sorted(hosts)}')
backend_request_counts={backend:sum(1 for row in rows if row['api_base']==backend) for backend in sorted(expected)}
bodies={r['body_sha256'] for r in rows if r['body_bytes']>0}
if len(bodies)<2: raise SystemExit('expected >=2 byte-distinct nonempty bodies')
backend_fresh_completion_counts={'http://inference1.tail011a51.ts.net:8003/v1':int(fresh1),'http://inference2.tail011a51.ts.net:8003/v1':int(fresh2)}
for backend in sorted(expected):
    if backend_fresh_completion_counts[backend] < backend_request_counts[backend]: raise SystemExit(f'insufficient fresh completion records for {backend}: {backend_fresh_completion_counts[backend]} < {backend_request_counts[backend]}')
def art(p): return {'path':os.path.relpath(p,os.getcwd()),'exists':os.path.isfile(p),'byte_length':os.path.getsize(p) if os.path.isfile(p) else 0}
def required_artifact(path):
    if not os.path.isfile(path) or os.path.getsize(path)<1: raise SystemExit(f'missing or empty artifact: {path}')
    return art(path)
request_artifacts=[]
request_dirs=sorted(os.path.join(requests_dir,name) for name in os.listdir(requests_dir) if name.startswith('request-') and os.path.isdir(os.path.join(requests_dir,name)))
if len(request_dirs)!=int(count): raise SystemExit(f'expected {count} raw request directories, found {len(request_dirs)}')
for request_dir in request_dirs:
    request_artifacts.append({'path':os.path.relpath(request_dir,os.getcwd()),'artifacts':{name:required_artifact(os.path.join(request_dir,name)) for name in ('metadata.json','pid','status.txt','headers.txt','body.json','curl-exit.txt')}})
manifest={'request_summaries':required_artifact(summaries),'inference1_log_baseline_identity':required_artifact(baseline1),'inference2_log_baseline_identity':required_artifact(baseline2),'inference1_log_post_identity':required_artifact(post1),'inference2_log_post_identity':required_artifact(post2),'inference1_log_post_baseline':required_artifact(log1),'inference2_log_post_baseline':required_artifact(log2)}
r={'ok':True,'mode':mode,'request_count':int(count),'tracked_request_count':len(rows),'backend_headers':sorted(hosts),'backend_request_counts':backend_request_counts,'backend_fresh_completion_counts':backend_fresh_completion_counts,'backend_completion_counts_sufficient':True,'distinct_nonempty_body_count':len(bodies),'requests_artifact_path':os.path.relpath(requests_dir,os.getcwd()),'request_summaries_artifact':manifest['request_summaries'],'request_artifacts':request_artifacts,'inference1_log_baseline_identity_artifact':manifest['inference1_log_baseline_identity'],'inference2_log_baseline_identity_artifact':manifest['inference2_log_baseline_identity'],'inference1_log_post_identity_artifact':manifest['inference1_log_post_identity'],'inference2_log_post_identity_artifact':manifest['inference2_log_post_identity'],'inference1_log_post_baseline_artifact':manifest['inference1_log_post_baseline'],'inference2_log_post_baseline_artifact':manifest['inference2_log_post_baseline'],'inference1_fresh_request_count':int(fresh1),'inference2_fresh_request_count':int(fresh2),'inference1_fresh_log_evidence':int(fresh1)>=1,'inference2_fresh_log_evidence':int(fresh2)>=1,'artifact_manifest':manifest}
json.dump(r,open(out,'w',encoding='utf-8'),indent=2,sort_keys=True); open(out,'a',encoding='utf-8').write('\n')
PY
}

case "$MODE" in
  models-reviewer) models_reviewer ;;
  implementer-distribution) distribution ;;
  health-regression) health_assertion_regression ;;
  health-flip) health_flip ;;
esac
[[ "$MODE" == health-regression ]] && exit 0
[[ -s "$RESULT_PATH" ]] || die "result.json missing"
python3 - "$RESULT_PATH" <<'PY'
import json,sys
r=json.load(open(sys.argv[1],encoding='utf-8'))
if r.get('ok') is not True: raise SystemExit('result does not assert ok:true')
print(json.dumps(r,sort_keys=True))
PY

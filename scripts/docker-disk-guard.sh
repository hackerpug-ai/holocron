#!/bin/bash
# Bound recoverable Docker growth without touching durable, unlabeled volumes.
set -euo pipefail

PATH="/usr/bin:/bin:/usr/sbin:/sbin:/usr/local/bin:/opt/homebrew/bin"
export PATH

HOLO_DOCKER_WARNING_FREE_GIB="${HOLO_DOCKER_WARNING_FREE_GIB:-40}"
HOLO_DOCKER_CRITICAL_FREE_GIB="${HOLO_DOCKER_CRITICAL_FREE_GIB:-25}"
HOLO_DOCKER_RAW_WARNING_GIB="${HOLO_DOCKER_RAW_WARNING_GIB:-32}"
HOLO_DOCKER_BUILDER_KEEP_STORAGE="${HOLO_DOCKER_BUILDER_KEEP_STORAGE:-5GB}"
HOLO_DOCKER_GUARD_CHECK_ONLY="${HOLO_DOCKER_GUARD_CHECK_ONLY:-0}"
LIFECYCLE_LABEL="io.holocron.lifecycle=ephemeral"

for value in \
  "$HOLO_DOCKER_WARNING_FREE_GIB" \
  "$HOLO_DOCKER_CRITICAL_FREE_GIB" \
  "$HOLO_DOCKER_RAW_WARNING_GIB"; do
  if [[ ! "$value" =~ ^[0-9]+$ ]]; then
    echo "docker-disk-guard: thresholds must be non-negative integers" >&2
    exit 2
  fi
done

if [[ -z "${HOME:-}" || "$HOME" == "/" ]]; then
  echo "docker-disk-guard: refusing unsafe HOME" >&2
  exit 2
fi

DOCKER_BIN="${DOCKER_BIN:-}"
if [[ -z "$DOCKER_BIN" ]]; then
  for candidate in /usr/local/bin/docker /opt/homebrew/bin/docker /usr/bin/docker; do
    if [[ -x "$candidate" ]]; then DOCKER_BIN="$candidate"; break; fi
  done
fi

docker_ready() {
  local probe_pid
  local _
  "$DOCKER_BIN" info >/dev/null 2>&1 &
  probe_pid=$!
  for _ in 1 2 3; do
    if ! /bin/kill -0 "$probe_pid" 2>/dev/null; then
      if wait "$probe_pid"; then return 0; fi
      return 1
    fi
    /bin/sleep 1
  done
  /bin/kill "$probe_pid" 2>/dev/null || true
  wait "$probe_pid" 2>/dev/null || true
  return 1
}

NOTICE_DIR="$HOME/Library/Caches/holocron/docker-disk-guard-notices"
/bin/mkdir -p "$NOTICE_DIR"

notify_throttled() {
  local key="$1"
  local message="$2"
  local stamp="$NOTICE_DIR/$key"
  local current_time last_time=0
  current_time="$(/bin/date +%s)"
  if [[ -f "$stamp" ]]; then
    last_time="$(/usr/bin/stat -f '%m' "$stamp" 2>/dev/null || echo 0)"
  fi
  if [[ "$last_time" =~ ^[0-9]+$ ]] && [[ $(( current_time - last_time )) -lt 3600 ]]; then
    return
  fi
  : >"$stamp"
  /usr/bin/osascript -e \
    "display notification \"$message\" with title \"Holocron Docker guard\"" \
    >/dev/null 2>&1 || true
}

LOCK_DIR="$HOME/Library/Caches/holocron/docker-disk-guard.lockdir"
/bin/mkdir -p "${LOCK_DIR%/*}"
if ! /bin/mkdir "$LOCK_DIR" 2>/dev/null; then
  owner_pid="$(/bin/cat "$LOCK_DIR/pid" 2>/dev/null || true)"
  if [[ ! "$owner_pid" =~ ^[0-9]+$ ]]; then
    /bin/sleep 1
    owner_pid="$(/bin/cat "$LOCK_DIR/pid" 2>/dev/null || true)"
  fi
  if [[ "$owner_pid" =~ ^[0-9]+$ ]] && /bin/kill -0 "$owner_pid" 2>/dev/null; then
    exit 0
  fi
  /bin/rm -r "$LOCK_DIR"
  /bin/mkdir "$LOCK_DIR"
fi
echo "$$" >"$LOCK_DIR/pid"
release_lock() {
  /bin/rm -r "$LOCK_DIR" 2>/dev/null || true
}
trap release_lock EXIT INT TERM

if [[ -z "$DOCKER_BIN" ]] || ! docker_ready; then
  if [[ "$HOLO_DOCKER_GUARD_CHECK_ONLY" != "1" ]]; then
    notify_throttled unavailable "Docker is unavailable; disk safeguards could not run."
  fi
  exit 0
fi

now="$(/bin/date +%s)"

is_expired() {
  local resource_type="$1"
  local resource_id="$2"
  local expires_at
  if [[ "$resource_type" == "container" ]]; then
    expires_at="$(
      "$DOCKER_BIN" container inspect \
        --format '{{ index .Config.Labels "io.holocron.expires-at" }}' \
        "$resource_id" 2>/dev/null || true
    )"
  else
    expires_at="$(
      "$DOCKER_BIN" "$resource_type" inspect \
        --format '{{ index .Labels "io.holocron.expires-at" }}' \
        "$resource_id" 2>/dev/null || true
    )"
  fi
  [[ "$expires_at" =~ ^[0-9]+$ ]] && [[ "$expires_at" -le "$now" ]]
}

sweep_expired_ephemeral() {
  local resource_id
  while IFS= read -r resource_id; do
    [[ -n "$resource_id" ]] || continue
    if is_expired container "$resource_id"; then
      owner_pid="$(
        "$DOCKER_BIN" container inspect \
          --format '{{ index .Config.Labels "io.holocron.owner-pid" }}' \
          "$resource_id" 2>/dev/null || true
      )"
      owner_alive=0
      if [[ "$owner_pid" =~ ^[0-9]+$ ]] && /bin/kill -0 "$owner_pid" 2>/dev/null; then
        owner_alive=1
      fi
      running="$(
        "$DOCKER_BIN" container inspect --format '{{.State.Running}}' "$resource_id" 2>/dev/null \
          || true
      )"
      if [[ "$running" != "true" || "$owner_alive" -eq 0 ]]; then
        [[ "$HOLO_DOCKER_GUARD_CHECK_ONLY" == "1" ]] \
          || "$DOCKER_BIN" container rm -f "$resource_id" >/dev/null 2>&1 \
          || true
      fi
    fi
  done < <("$DOCKER_BIN" ps -aq --filter "label=$LIFECYCLE_LABEL")

  while IFS= read -r resource_id; do
    [[ -n "$resource_id" ]] || continue
    if is_expired volume "$resource_id" \
      && [[ -z "$("$DOCKER_BIN" ps -aq --filter "volume=$resource_id")" ]]; then
      [[ "$HOLO_DOCKER_GUARD_CHECK_ONLY" == "1" ]] \
        || "$DOCKER_BIN" volume rm "$resource_id" >/dev/null 2>&1 \
        || true
    fi
  done < <("$DOCKER_BIN" volume ls -q --filter "label=$LIFECYCLE_LABEL")

  while IFS= read -r resource_id; do
    [[ -n "$resource_id" ]] || continue
    if is_expired network "$resource_id"; then
      [[ "$HOLO_DOCKER_GUARD_CHECK_ONLY" == "1" ]] \
        || "$DOCKER_BIN" network rm "$resource_id" >/dev/null 2>&1 \
        || true
    fi
  done < <("$DOCKER_BIN" network ls -q --filter "label=$LIFECYCLE_LABEL")
}

sweep_expired_ephemeral

available_kib="$(/bin/df -Pk "$HOME" | /usr/bin/awk 'END {print $4}')"
raw_kib=0
for raw_path in \
  "$HOME/Library/Containers/com.docker.docker/Data/vms/0/data/Docker.raw" \
  "$HOME/Library/Containers/com.docker.docker/Data/vms/0/Docker.raw"; do
  if [[ -f "$raw_path" ]]; then
    raw_kib="$(/usr/bin/du -sk "$raw_path" | /usr/bin/awk '{print $1}')"
    break
  fi
done

warning_kib="$(( HOLO_DOCKER_WARNING_FREE_GIB * 1024 * 1024 ))"
critical_kib="$(( HOLO_DOCKER_CRITICAL_FREE_GIB * 1024 * 1024 ))"
raw_warning_kib="$(( HOLO_DOCKER_RAW_WARNING_GIB * 1024 * 1024 ))"
pressure=0
if [[ "$available_kib" -lt "$warning_kib" || "$raw_kib" -gt "$raw_warning_kib" ]]; then
  pressure=1
fi

if [[ "$pressure" -eq 1 ]]; then
  if [[ "$HOLO_DOCKER_GUARD_CHECK_ONLY" != "1" ]]; then
    # Equivalent CLI: docker builder prune --all --force --filter until=24h
    "$DOCKER_BIN" builder prune --all --force --filter until=24h \
      --keep-storage "$HOLO_DOCKER_BUILDER_KEEP_STORAGE" >/dev/null 2>&1 || true
  fi
  free_gib="$(( available_kib / 1024 / 1024 ))"
  raw_gib="$(( raw_kib / 1024 / 1024 ))"
  echo "docker-disk-guard: pressure free=${free_gib}GiB docker-raw=${raw_gib}GiB" >&2
  if [[ "$HOLO_DOCKER_GUARD_CHECK_ONLY" != "1" ]]; then
    notify_throttled pressure \
      "Disk pressure detected: ${free_gib} GiB free; Docker uses ${raw_gib} GiB."
  fi
fi

if [[ "$available_kib" -lt "$critical_kib" ]]; then
  exit 75
fi

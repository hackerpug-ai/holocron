#!/bin/bash
# Install versioned Docker daemon defaults and the macOS disk-pressure guard.
set -euo pipefail

SCRIPT_DIR="${BASH_SOURCE[0]%/*}"
[[ "$SCRIPT_DIR" == "${BASH_SOURCE[0]}" ]] && SCRIPT_DIR="."
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
RESTART_DOCKER=0

docker_ready() {
  local probe_pid
  local _
  "$docker_bin" info >/dev/null 2>&1 &
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

if [[ "${1:-}" == "--restart-docker" ]]; then
  RESTART_DOCKER=1
  shift
fi
if [[ $# -ne 0 ]]; then
  echo "usage: $0 [--restart-docker]" >&2
  exit 2
fi
if [[ -z "${HOME:-}" || "$HOME" == "/" ]]; then
  echo "error: refusing unsafe HOME" >&2
  exit 2
fi
if [[ "$(/usr/bin/uname -s)" != "Darwin" ]]; then
  echo "error: this installer currently supports Docker Desktop on macOS" >&2
  exit 2
fi

for command in /usr/bin/jq /usr/bin/plutil /bin/launchctl; do
  if [[ ! -x "$command" ]]; then
    echo "error: required command is unavailable: $command" >&2
    exit 2
  fi
done

DAEMON_DIR="$HOME/.docker"
DAEMON_JSON="$DAEMON_DIR/daemon.json"
POLICY_JSON="$ROOT/packages/platform/deploy/docker/daemon-resilience.json"
PLIST_TEMPLATE="$ROOT/packages/platform/deploy/launchd/holocron-docker-disk-guard.plist"
PLIST_DEST="$HOME/Library/LaunchAgents/holocron-docker-disk-guard.plist"
LOG_DIR="$HOME/Library/Logs/holocron"

/bin/mkdir -p "$DAEMON_DIR" "${PLIST_DEST%/*}" "$LOG_DIR"
temporary_json="$(/usr/bin/mktemp "$DAEMON_DIR/daemon.json.XXXXXX")"
temporary_plist="$(/usr/bin/mktemp "${PLIST_DEST%/*}/holocron-docker-disk-guard.plist.XXXXXX")"
cleanup() {
  /bin/rm -f "$temporary_json" "$temporary_plist"
}
trap cleanup EXIT INT TERM

if [[ -f "$DAEMON_JSON" ]]; then
  /usr/bin/jq -e . "$DAEMON_JSON" >/dev/null
  if [[ ! -f "$DAEMON_JSON.holocron-backup" ]]; then
    /bin/cp -p "$DAEMON_JSON" "$DAEMON_JSON.holocron-backup"
  fi
  /usr/bin/jq -s '.[0] * .[1]' "$DAEMON_JSON" "$POLICY_JSON" >"$temporary_json"
else
  /bin/cp "$POLICY_JSON" "$temporary_json"
fi
/usr/bin/jq -e . "$temporary_json" >/dev/null
/bin/chmod 600 "$temporary_json"
/bin/mv "$temporary_json" "$DAEMON_JSON"

escaped_root="${ROOT//%/\\%}"
escaped_home="${HOME//%/\\%}"
/usr/bin/sed -e "s%@HOLO_ROOT@%$escaped_root%g" -e "s%@HOME@%$escaped_home%g" \
  "$PLIST_TEMPLATE" >"$temporary_plist"
/usr/bin/plutil -lint "$temporary_plist" >/dev/null
/bin/mv "$temporary_plist" "$PLIST_DEST"

uid="$(/usr/bin/id -u)"
/bin/launchctl bootout "gui/$uid/holocron-docker-disk-guard" >/dev/null 2>&1 || true
/bin/launchctl bootstrap "gui/$uid" "$PLIST_DEST"

if [[ "$RESTART_DOCKER" -eq 1 ]]; then
  docker_bin=""
  for candidate in /usr/local/bin/docker /opt/homebrew/bin/docker /usr/bin/docker; do
    if [[ -x "$candidate" ]]; then docker_bin="$candidate"; break; fi
  done
  if [[ -n "$docker_bin" ]] \
    && "$docker_bin" desktop restart --timeout 60 >/dev/null 2>&1; then
    :
  else
    /usr/bin/osascript -e 'quit app "Docker"' >/dev/null 2>&1 || true
    /usr/bin/open -a Docker
  fi
  for _ in $(/usr/bin/seq 1 10); do
    if [[ -n "$docker_bin" ]] && docker_ready; then break; fi
    /bin/sleep 2
  done
  if [[ -z "$docker_bin" ]] || ! docker_ready; then
    echo "error: Docker did not become ready after restart" >&2
    exit 1
  fi
fi

echo "installed Docker resilience policy: $DAEMON_JSON"
echo "installed five-minute disk guard: $PLIST_DEST"
echo "note: existing containers receive bounded logging when they are next recreated"

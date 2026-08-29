#!/usr/bin/env bash
# install-launchd.sh — materialize Holocron LaunchAgents from repo templates.
#
# Usage:
#   ./scripts/install-launchd.sh            # copy + lint only
#   ./scripts/install-launchd.sh --bootstrap  # also bootstrap postgres + mastra
#   ./scripts/install-launchd.sh --unload     # bootout loaded holocron services
#
# Placeholders substituted in packages/platform/deploy/launchd/*.plist:
#   @HOME@ @HOLO_ROOT@ @BUN_BIN@ @BUN_DIR@ @NODE_DIR@ @PG_BIN@ @PGDATA@ @DATABASE_URL@
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# Prefer git toplevel; fall back to parent of scripts/
if REPO_ROOT="$(git -C "$SCRIPT_DIR/.." rev-parse --show-toplevel 2>/dev/null)"; then
  :
else
  REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
fi

HOME_DIR="${HOME:-$(eval echo ~)}"
DEFAULT_MAIN="${HOME_DIR}/Projects/holocron"
if [[ -f "${DEFAULT_MAIN}/packages/platform/src/cli/holo.ts" ]]; then
  DEFAULT_HOLO_ROOT="$DEFAULT_MAIN"
else
  DEFAULT_HOLO_ROOT="$REPO_ROOT"
fi

HOLO_ROOT="${HOLO_ROOT:-$DEFAULT_HOLO_ROOT}"
BUN_BIN="${BUN_BIN:-${HOME_DIR}/.bun/bin/bun}"
BUN_DIR="$(dirname "$BUN_BIN")"
NODE_BIN="${NODE_BIN:-$(command -v node 2>/dev/null || true)}"
NODE_DIR="${NODE_BIN:+$(dirname "$NODE_BIN")}"
NODE_DIR="${NODE_DIR:-/opt/homebrew/bin}"
if command -v brew >/dev/null 2>&1; then
  PG_PREFIX="$(brew --prefix postgresql@18 2>/dev/null || true)"
  BREW_PREFIX="$(brew --prefix 2>/dev/null || echo /opt/homebrew)"
else
  PG_PREFIX=""
  BREW_PREFIX="/opt/homebrew"
fi
PG_BIN="${PG_BIN:-${PG_PREFIX:-${BREW_PREFIX}/opt/postgresql@18}/bin}"
# brew --prefix/var is the cluster data dir used by postgresql@18 formula
PGDATA="${PGDATA:-${BREW_PREFIX}/var/postgresql@18}"
DATABASE_URL="${DATABASE_URL:-postgres://127.0.0.1:5432/holocron}"
LAUNCH_AGENTS_DIR="${LAUNCH_AGENTS_DIR:-${HOME_DIR}/Library/LaunchAgents}"
LOG_DIR="${HOME_DIR}/Library/Logs/holocron"
TEMPLATE_DIR="${REPO_ROOT}/packages/platform/deploy/launchd"
UID_NUM="$(id -u)"
DOMAIN="gui/${UID_NUM}"

PLISTS=(
  holocron-postgres.plist
  holocron-mastra.plist
  holocron-scheduler.plist
  holocron-zerocache.plist
)

BOOTSTRAP=0
UNLOAD=0
for arg in "$@"; do
  case "$arg" in
    --bootstrap) BOOTSTRAP=1 ;;
    --unload) UNLOAD=1 ;;
    -h|--help)
      sed -n '2,12p' "$0"
      exit 0
      ;;
    *)
      echo "unknown arg: $arg" >&2
      exit 2
      ;;
  esac
done

if [[ "$UNLOAD" -eq 1 ]]; then
  for label in holocron-postgres holocron-mastra holocron-scheduler holocron-zerocache; do
    launchctl bootout "${DOMAIN}/${label}" 2>/dev/null || true
  done
  echo "booted out holocron-* from ${DOMAIN} (if loaded)"
  exit 0
fi

die() { echo "error: $*" >&2; exit 1; }

[[ -d "$TEMPLATE_DIR" ]] || die "template dir missing: $TEMPLATE_DIR"
[[ -x "$BUN_BIN" || -f "$BUN_BIN" ]] || die "bun not found at $BUN_BIN (set BUN_BIN=)"
[[ -f "$HOLO_ROOT/packages/platform/src/cli/holo.ts" ]] || die "holo.ts missing under HOLO_ROOT=$HOLO_ROOT"
[[ -x "$PG_BIN/postgres" || -f "$PG_BIN/postgres" ]] || die "postgres not found at $PG_BIN/postgres (brew install postgresql@18)"

mkdir -p "$LAUNCH_AGENTS_DIR" "$LOG_DIR"

subst() {
  local src="$1" dest="$2"
  # Portable sed (macOS) — replace placeholders with absolute paths only
  sed \
    -e "s|@HOME@|${HOME_DIR}|g" \
    -e "s|@HOLO_ROOT@|${HOLO_ROOT}|g" \
    -e "s|@BUN_BIN@|${BUN_BIN}|g" \
    -e "s|@BUN_DIR@|${BUN_DIR}|g" \
    -e "s|@NODE_DIR@|${NODE_DIR}|g" \
    -e "s|@PG_BIN@|${PG_BIN}|g" \
    -e "s|@PGDATA@|${PGDATA}|g" \
    -e "s|@DATABASE_URL@|${DATABASE_URL}|g" \
    "$src" >"$dest"
}

echo "HOLO_ROOT=$HOLO_ROOT"
echo "BUN_BIN=$BUN_BIN"
echo "PG_BIN=$PG_BIN"
echo "PGDATA=$PGDATA"
echo "LAUNCH_AGENTS_DIR=$LAUNCH_AGENTS_DIR"
echo "DATABASE_URL=resolved"

for name in "${PLISTS[@]}"; do
  src="${TEMPLATE_DIR}/${name}"
  dest="${LAUNCH_AGENTS_DIR}/${name}"
  [[ -f "$src" ]] || die "missing template $src"
  subst "$src" "$dest"
  plutil -lint "$dest" >/dev/null
  echo "installed $dest"
done

# Sanity: no relative ../bin paths, scheduler enabled + zerocache opt-in.
if grep -n '\.\./bin' "${LAUNCH_AGENTS_DIR}"/holocron-*.plist 2>/dev/null; then
  die "relative ../bin paths found in installed plists"
fi
grep -A2 '<key>Disabled</key>' "${LAUNCH_AGENTS_DIR}/holocron-scheduler.plist" | grep -q '<false/>' \
  || die "scheduler must have Disabled=false"
grep -A2 '<key>Disabled</key>' "${LAUNCH_AGENTS_DIR}/holocron-zerocache.plist" | grep -q '<true/>' \
  || die "zerocache must have Disabled=true by default (opt-in via HOLO_ENABLE_ZERO_CACHE)"
# Real boot path (Sprint 24) — must not be a /usr/bin/true placeholder
grep -q 'run-zero-cache' "${LAUNCH_AGENTS_DIR}/holocron-zerocache.plist" \
  || die "zerocache plist must invoke scripts/run-zero-cache.sh (not /usr/bin/true)"

if [[ "$BOOTSTRAP" -eq 1 ]]; then
  # Avoid fighting brew services for the same PGDATA/port
  if command -v brew >/dev/null 2>&1; then
    brew services stop postgresql@18 2>/dev/null || true
  fi

  for name in holocron-postgres.plist holocron-mastra.plist; do
    label="${name%.plist}"
    dest="${LAUNCH_AGENTS_DIR}/${name}"
    # bootout first so reinstall is idempotent
    launchctl bootout "${DOMAIN}/${label}" 2>/dev/null || true
    launchctl bootstrap "$DOMAIN" "$dest"
    echo "bootstrapped ${DOMAIN}/${label}"
  done

  # Disabled units: ensure they are not left running from older installs
  for label in holocron-scheduler holocron-zerocache; do
    launchctl bootout "${DOMAIN}/${label}" 2>/dev/null || true
  done

  echo "waiting for postgres..."
  for _ in $(seq 1 30); do
    if "$PG_BIN/pg_isready" -h 127.0.0.1 -p 5432 >/dev/null 2>&1; then
      echo "pg_isready: ok"
      break
    fi
    sleep 0.5
  done
  "$PG_BIN/pg_isready" -h 127.0.0.1 -p 5432 || echo "warn: pg_isready not ready yet — check $LOG_DIR/postgres.err.log" >&2

  echo "waiting for mastra /health..."
  for _ in $(seq 1 40); do
    if curl -sf --max-time 2 http://127.0.0.1:4111/health >/dev/null 2>&1; then
      echo "mastra /health: ok"
      break
    fi
    sleep 0.5
  done
  curl -sf --max-time 3 http://127.0.0.1:4111/health >/dev/null 2>&1 \
    || echo "warn: mastra /health not ready yet — check $LOG_DIR/mastra.err.log" >&2

  launchctl list | grep holocron || true
fi

echo "done."

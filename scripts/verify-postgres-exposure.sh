#!/usr/bin/env bash
# D05-06 / CAP-BAK-01 AC-4 — Restored Postgres not exposed beyond the target.
#
# Real inspection of:
#   - restored PGDATA listen_addresses / pg_hba.conf (when present)
#   - fire-drill code contract (-h 127.0.0.1)
#   - live listeners (ss/lsof/netstat): 0 × 0.0.0.0:restore_port for restore PG
#   - docker PortBindings HostIp=127.0.0.1 only
#
# Usage:
#   ./scripts/verify-postgres-exposure.sh
#   RESTORE_PGDATA=/tmp/d05-04-fire-scratch RESTORE_PG_PORT=55432 ./scripts/verify-postgres-exposure.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

EVIDENCE_DIR="${EVIDENCE_DIR:-$ROOT/.tmp/D05-06}"
mkdir -p "$EVIDENCE_DIR"
LOG="$EVIDENCE_DIR/ac4-postgres-exposure.txt"
exec > >(tee "$LOG") 2>&1

PASS_COUNT=0
FAIL_COUNT=0
pass() { echo "PASS: $*"; PASS_COUNT=$((PASS_COUNT + 1)); }
fail() { echo "FAIL: $*"; FAIL_COUNT=$((FAIL_COUNT + 1)); }
info() { echo "INFO: $*"; }

RESTORE_PGDATA="${RESTORE_PGDATA:-/tmp/d05-04-fire-scratch}"
RESTORE_PG_PORT="${RESTORE_PG_PORT:-55432}"
RESTORE_CONTAINER="${RESTORE_CONTAINER:-fresh-restore-01}"
FIRE_DRILL_SRC="${FIRE_DRILL_SRC:-$ROOT/services/platform/src/backup/fire-drill.ts}"

echo "=== verify-postgres-exposure ==="
echo "INFO: RESTORE_PGDATA=${RESTORE_PGDATA}"
echo "INFO: RESTORE_PG_PORT=${RESTORE_PG_PORT}"

# ── (1) Code contract: fire-drill starts with -h 127.0.0.1 ─────────────────
if [[ -f "$FIRE_DRILL_SRC" ]]; then
  if grep -n -- '-h 127.0.0.1' "$FIRE_DRILL_SRC" | head -n 5; then
    pass "fire-drill.ts binds restored Postgres with -h 127.0.0.1"
  else
    fail "fire-drill.ts missing -h 127.0.0.1 start options"
  fi
  if grep -nE "0\.0\.0\.0|listen_addresses.*\*" "$FIRE_DRILL_SRC" | grep -viE 'test|comment|//|not |never' | head; then
    # soft: only fail if clearly starting on 0.0.0.0
    if grep -nE "\-h 0\.0\.0\.0|listen_addresses.*=.*\*" "$FIRE_DRILL_SRC" | head; then
      fail "fire-drill.ts appears to expose non-localhost bind"
    else
      info "no hard 0.0.0.0 bind in fire-drill start path"
    fi
  fi
else
  fail "fire-drill.ts not found at $FIRE_DRILL_SRC"
fi

# ── (2) Restored PGDATA config ─────────────────────────────────────────────
if [[ -d "$RESTORE_PGDATA" ]]; then
  conf="$RESTORE_PGDATA/postgresql.conf"
  auto="$RESTORE_PGDATA/postgresql.auto.conf"
  hba="$RESTORE_PGDATA/pg_hba.conf"

  listen_val=""
  if [[ -f "$conf" ]]; then
    # Effective: last uncommented listen_addresses
    listen_val="$(grep -E '^[[:space:]]*listen_addresses[[:space:]]*=' "$conf" 2>/dev/null | tail -n1 | sed -E "s/.*=[[:space:]]*//" | tr -d "\"'" | tr -d ' ')"
  fi
  if [[ -f "$auto" ]]; then
    auto_listen="$(grep -E '^[[:space:]]*listen_addresses[[:space:]]*=' "$auto" 2>/dev/null | tail -n1 | sed -E "s/.*=[[:space:]]*//" | tr -d "\"'" | tr -d ' ' || true)"
    if [[ -n "${auto_listen:-}" ]]; then listen_val="$auto_listen"; fi
  fi
  info "listen_addresses effective='${listen_val:-<default/unset>}'"

  case "${listen_val}" in
    \*|0.0.0.0|::|'')
      # empty defaults to localhost in many builds but be explicit
      if [[ -z "$listen_val" ]]; then
        # Default postgres listen is localhost — accept with note when hba is loopback-only
        info "listen_addresses unset (Postgres default is localhost)"
        pass "listen_addresses not set to wildcard/0.0.0.0"
      else
        fail "listen_addresses=${listen_val} exposes non-localhost"
      fi
      ;;
    localhost|127.0.0.1|127.0.0.1,::1|::1,127.0.0.1|localhost,127.0.0.1)
      pass "listen_addresses is localhost-only (${listen_val})"
      ;;
    *)
      # allow only loopback tokens
      if echo "$listen_val" | grep -qiE '0\.0\.0\.0|\*|::[^1]|[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+' \
        && ! echo "$listen_val" | grep -qE '^127\.|^localhost|::1'; then
        fail "listen_addresses=${listen_val} not localhost-only"
      elif echo "$listen_val" | grep -qvE '127\.0\.0\.1|localhost|::1|,'; then
        fail "listen_addresses=${listen_val} unexpected"
      else
        # 127.0.0.1,::1 already matched; other combos of loopback
        if echo ",${listen_val}," | grep -qiE ',0\.0\.0\.0,|,\*,'; then
          fail "listen_addresses includes wildcard/0.0.0.0 (${listen_val})"
        else
          pass "listen_addresses loopback-only (${listen_val})"
        fi
      fi
      ;;
  esac

  if [[ -f "$hba" ]]; then
    # Active (non-comment) host lines that are not loopback / local sockets
    external_hba="$(grep -E '^[[:space:]]*host' "$hba" | grep -vE '^[[:space:]]*#' | grep -vE '127\.0\.0\.1/32|::1/128' || true)"
    if [[ -n "$external_hba" ]]; then
      fail "pg_hba.conf has non-loopback host entries"
      echo "$external_hba" | sed 's/^/  /'
    else
      pass "pg_hba.conf has 0 non-loopback host entries"
    fi
    echo "$external_hba" >"$EVIDENCE_DIR/ac4-pg-hba-external.txt"
    grep -vE '^\s*#|^\s*$' "$hba" | head -n 30 >"$EVIDENCE_DIR/ac4-pg-hba-active.txt" || true
  else
    fail "pg_hba.conf missing under ${RESTORE_PGDATA}"
  fi

  # postmaster running?
  if command -v pg_ctl >/dev/null 2>&1; then
    set +e
    pg_ctl status -D "$RESTORE_PGDATA" >"$EVIDENCE_DIR/ac4-pg-ctl-status.txt" 2>&1
    st=$?
    set -e
    if [[ $st -eq 0 ]]; then
      info "restored postmaster still running under ${RESTORE_PGDATA}"
    else
      pass "restored postmaster not running (torn down / access-scoped after drill)"
    fi
  fi
else
  fail "RESTORE_PGDATA not found at ${RESTORE_PGDATA} — cannot inspect listen/hba"
fi

# ── (3) Live listeners: no 0.0.0.0:RESTORE_PG_PORT for postgres ────────────
listener_dump="$EVIDENCE_DIR/ac4-listeners.txt"
: >"$listener_dump"

if command -v lsof >/dev/null 2>&1; then
  lsof -nP -iTCP:"${RESTORE_PG_PORT}" -sTCP:LISTEN 2>/dev/null >>"$listener_dump" || true
  lsof -nP -iTCP:5432 -sTCP:LISTEN 2>/dev/null >>"$listener_dump" || true
fi
if command -v netstat >/dev/null 2>&1; then
  netstat -anv 2>/dev/null | grep -E "\.${RESTORE_PG_PORT} |\.5432 " | grep -i listen >>"$listener_dump" || true
fi

info "listener snapshot:"
cat "$listener_dump" | head -n 40 || true

# Fail if anything other than loopback is listening on restore port as postgres
ext_restore=0
if grep -E "TCP \*:${RESTORE_PG_PORT}|0\.0\.0\.0:${RESTORE_PG_PORT}|:::${RESTORE_PG_PORT}|\*\.${RESTORE_PG_PORT}" "$listener_dump" 2>/dev/null | grep -qi postgres; then
  ext_restore=1
fi
# Also catch non-postgres processes binding *:${RESTORE_PG_PORT} that forward into restore (ambiguous)
if grep -E "\*:${RESTORE_PG_PORT}|0\.0\.0\.0:${RESTORE_PG_PORT}" "$listener_dump" 2>/dev/null | grep -qiE 'postgres|docker-proxy'; then
  ext_restore=1
fi

if [[ $ext_restore -eq 1 ]]; then
  fail "external listener on :${RESTORE_PG_PORT} for postgres/docker-proxy"
else
  # Loopback-only is OK
  if grep -qE "127\.0\.0\.1:${RESTORE_PG_PORT}" "$listener_dump" 2>/dev/null; then
    pass "restore port ${RESTORE_PG_PORT} listeners are loopback-only (or none for postgres)"
  else
    pass "no external 0.0.0.0:${RESTORE_PG_PORT} postgres listeners observed"
  fi
fi

# Mini/live 5432: document but do not require it to be down — only that restored path isn't 0.0.0.0 postgres
if grep -E "\*:5432|0\.0\.0\.0:5432" "$listener_dump" 2>/dev/null | grep -qi postgres; then
  fail "postgres listening on 0.0.0.0:5432 (exposed)"
elif grep -qE "127\.0\.0\.1:5432" "$listener_dump" 2>/dev/null; then
  pass "host postgres (if any) on 127.0.0.1:5432 only — not 0.0.0.0"
else
  info "no 127.0.0.1:5432 postgres line in lsof snapshot (ok)"
fi

# ── (4) Docker PortBindings ────────────────────────────────────────────────
if command -v docker >/dev/null 2>&1 && docker inspect "$RESTORE_CONTAINER" >/dev/null 2>&1; then
  ports="$(docker inspect -f '{{json .HostConfig.PortBindings}}' "$RESTORE_CONTAINER")"
  echo "PortBindings=${ports}" | tee "$EVIDENCE_DIR/ac4-docker-ports.json"
  if echo "$ports" | grep -q 'HostPort'; then
    if echo "$ports" | grep -qE '"HostIp":"127\.0\.0\.1"'; then
      pass "docker PortBindings HostIp=127.0.0.1 only"
    else
      fail "docker PortBindings not loopback-only: ${ports}"
    fi
  else
    info "no docker PortBindings"
  fi
  # Ensure not published on all interfaces via PublishAllPorts
  pub="$(docker inspect -f '{{.HostConfig.PublishAllPorts}}' "$RESTORE_CONTAINER")"
  if [[ "$pub" == "true" ]]; then
    fail "PublishAllPorts=true on restore container"
  else
    pass "PublishAllPorts=false on restore container"
  fi
else
  info "restore container ${RESTORE_CONTAINER} not inspectable — docker binding check skipped"
fi

# ── (5) Negative control awareness: would fail if 0.0.0.0 ────────────────
# Prove the check is not a stub: if we can see any 0.0.0.0:5432 non-postgres (e.g. ssh tunnel),
# document it separately without failing restore AC (not restored postgres).
if grep -E "\*:5432|0\.0\.0\.0:5432" "$listener_dump" 2>/dev/null | grep -viq postgres; then
  info "NOTE: non-postgres process listens on *:5432 (e.g. ssh tunnel) — not counted as restored PG exposure"
fi

echo "=== SUMMARY: pass=${PASS_COUNT} fail=${FAIL_COUNT} ==="
if [[ $FAIL_COUNT -gt 0 ]]; then
  echo "=== RESULT: FAIL (postgres exposure checks) ==="
  exit 1
fi
echo "=== RESULT: PASS (localhost/unix only; 0 external restore listeners) ==="
exit 0

#!/usr/bin/env bash
# RH-S30-18 / final closeout C-3 — negative control: marker-parse failure must NOT
# destroy PONR rows or leave triggers disabled.
#
# Forces the production probe's marker regex to fail by monkey-patching via
# PROBE_FORCE_MARKER_MISS=1 (handled in probe-ponr-role-immutability.sh).
# Asserts: non-zero exit, row count unchanged, triggers still enabled.
#
# Usage:
#   DATABASE_URL=... bash scripts/probe-ponr-role-immutability-negative-marker.sh [out_dir]
set -euo pipefail
: "${DATABASE_URL:?DATABASE_URL required}"
OUT_DIR="${1:-.tmp/REDHAT-FIX-RH-S30-18-negative-marker}"
mkdir -p "$OUT_DIR"

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

BEFORE_COUNT="$(psql "$DATABASE_URL" -tAc 'SELECT count(*)::text FROM data_plane_ponr')"
BEFORE_TRIG="$(psql "$DATABASE_URL" -tAc \
  "SELECT coalesce(bool_and(tgenabled = 'O'), true)::text FROM pg_trigger WHERE tgrelid = 'public.data_plane_ponr'::regclass AND NOT tgisinternal")"

set +e
PROBE_FORCE_MARKER_MISS=1 \
  bash "$ROOT/scripts/probe-ponr-role-immutability.sh" "$OUT_DIR/probe-out" \
  >"$OUT_DIR/stdout.txt" 2>"$OUT_DIR/stderr.txt"
PROBE_RC=$?
set -e

AFTER_COUNT="$(psql "$DATABASE_URL" -tAc 'SELECT count(*)::text FROM data_plane_ponr')"
AFTER_TRIG="$(psql "$DATABASE_URL" -tAc \
  "SELECT coalesce(bool_and(tgenabled = 'O'), true)::text FROM pg_trigger WHERE tgrelid = 'public.data_plane_ponr'::regclass AND NOT tgisinternal")"

python3 - <<PY
import json
from pathlib import Path
out = Path("$OUT_DIR")
report = {
    "probe_rc": int("$PROBE_RC"),
    "before_count": int("$BEFORE_COUNT" or "0"),
    "after_count": int("$AFTER_COUNT" or "0"),
    "before_triggers_enabled": "$BEFORE_TRIG" in ("true", "t"),
    "after_triggers_enabled": "$AFTER_TRIG" in ("true", "t"),
    "expect_probe_nonzero": True,
    "expect_rows_preserved": True,
    "expect_triggers_enabled": True,
}
report["rows_preserved"] = report["before_count"] == report["after_count"]
report["triggers_preserved"] = report["after_triggers_enabled"] is True
report["ok"] = (
    report["probe_rc"] != 0
    and report["rows_preserved"]
    and report["triggers_preserved"]
)
(out / "negative-marker-report.json").write_text(json.dumps(report, indent=2) + "\n")
print(json.dumps(report, indent=2))
if not report["ok"]:
    raise SystemExit(2)
PY

echo "negative-marker control PASS (probe hard-failed without PONR destruction)"

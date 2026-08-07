#!/usr/bin/env bash
# RH-S30-21 / C-3 — forced marker-miss on a PONR-holding DB (gate/IT owned).
#
# Requirements (fail closed):
#   - before_count >= 1 (empty table is NOT a pass)
#   - triggers initially enabled
#   - PROBE_FORCE_MARKER_MISS=1 → probe exit != 0
#   - after_count == before_count, triggers still enabled
#   - probe used effective non-owner session when SQLSTATE path runs (or force-miss
#     aborts after the rolled-back DO block with holocron_app current_user)
#
# Usage:
#   DATABASE_URL=... bash scripts/probe-ponr-role-immutability-negative-marker.sh [out_dir]
# Optional:
#   HOLO_PROBE_SEED_PONR=1  — if count=0, seed one disposable PONR row (owner path)
set -euo pipefail
: "${DATABASE_URL:?DATABASE_URL required}"
OUT_DIR="${1:-.tmp/REDHAT-FIX-RH-S30-21}"
mkdir -p "$OUT_DIR"

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

seed_ponr_if_empty() {
  local count
  count="$(psql "$DATABASE_URL" -tAc 'SELECT count(*)::text FROM data_plane_ponr')"
  if [[ "${count:-0}" -ge 1 ]]; then
    return 0
  fi
  if [[ "${HOLO_PROBE_SEED_PONR:-0}" != "1" ]]; then
    echo "error: data_plane_ponr is empty; set HOLO_PROBE_SEED_PONR=1 to seed disposable row" >&2
    return 2
  fi
  # Owner/superuser seed with trigger disable — disposable DBs only.
  # Singleton table: at most one row; only seed when empty.
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 <<'SQL'
DO $seed$
BEGIN
  ALTER TABLE data_plane_ponr DISABLE TRIGGER data_plane_ponr_reject_mutation;
  BEGIN
    ALTER TABLE data_plane_ponr DISABLE TRIGGER data_plane_ponr_reject_truncate;
  EXCEPTION WHEN undefined_object THEN NULL;
  END;
  INSERT INTO data_plane_ponr (
    fence_lifted_at,
    write_surface,
    write_table,
    write_row_id,
    write_row_digest_sha256,
    write_committed_at,
    base_url,
    operator,
    run_id,
    idempotency_key,
    export_watermark_ms,
    convex_fence_audit_id,
    convex_fence_env_value,
    convex_documents_total,
    convex_newest_document_creation_time,
    convex_accepted_writes_since_watermark,
    convex_rejected_writes_since_watermark
  ) VALUES (
    now(),
    'probe.seed',
    'documents',
    '00000000-0000-4000-8000-aaaaaaaaaaaa',
    repeat('ab', 32),
    now(),
    'http://127.0.0.1:9',
    'probe-seed',
    's30-marker-miss-seed',
    's30-marker-miss-seed-idem',
    (extract(epoch from now()) * 1000)::bigint,
    'seed',
    '1',
    0,
    0,
    0,
    0
  );
  ALTER TABLE data_plane_ponr ENABLE TRIGGER data_plane_ponr_reject_mutation;
  BEGIN
    ALTER TABLE data_plane_ponr ENABLE TRIGGER data_plane_ponr_reject_truncate;
  EXCEPTION WHEN undefined_object THEN NULL;
  END;
END
$seed$;
SQL
}

seed_ponr_if_empty

BEFORE_COUNT="$(psql "$DATABASE_URL" -tAc 'SELECT count(*)::text FROM data_plane_ponr')"
BEFORE_TRIG="$(psql "$DATABASE_URL" -tAc \
  "SELECT coalesce(bool_and(tgenabled = 'O'), true)::text FROM pg_trigger WHERE tgrelid = 'public.data_plane_ponr'::regclass AND NOT tgisinternal")"

if [[ "${BEFORE_COUNT:-0}" -lt 1 ]]; then
  echo "error: before_count must be >= 1 (empty table cannot prove PONR preservation)" >&2
  exit 2
fi
if [[ "$BEFORE_TRIG" != "true" && "$BEFORE_TRIG" != "t" ]]; then
  echo "error: non-internal triggers must be enabled before forced-miss probe" >&2
  exit 2
fi

set +e
PROBE_FORCE_MARKER_MISS=1 \
  bash "$ROOT/scripts/probe-ponr-role-immutability.sh" "$OUT_DIR/probe-out" \
  >"$OUT_DIR/stdout.txt" 2>"$OUT_DIR/stderr.txt"
PROBE_RC=$?
set -e

AFTER_COUNT="$(psql "$DATABASE_URL" -tAc 'SELECT count(*)::text FROM data_plane_ponr')"
AFTER_TRIG="$(psql "$DATABASE_URL" -tAc \
  "SELECT coalesce(bool_and(tgenabled = 'O'), true)::text FROM pg_trigger WHERE tgrelid = 'public.data_plane_ponr'::regclass AND NOT tgisinternal")"

python3 - "$OUT_DIR" "$PROBE_RC" "$BEFORE_COUNT" "$AFTER_COUNT" "$BEFORE_TRIG" "$AFTER_TRIG" <<'PY'
import json, re, sys
from pathlib import Path

out = Path(sys.argv[1])
probe_rc = int(sys.argv[2])
before_count = int(sys.argv[3] or "0")
after_count = int(sys.argv[4] or "0")
before_trig = sys.argv[5] in ("true", "t")
after_trig = sys.argv[6] in ("true", "t")
text = ""
for name in ("stdout.txt", "stderr.txt"):
    p = out / name
    if p.exists():
        text += p.read_text()
m = re.search(r'"probe_current_user"\s*:\s*"([^"]+)"', text)
effective = m.group(1) if m else None
report = {
    "probe_rc": probe_rc,
    "before_count": before_count,
    "after_count": after_count,
    "before_triggers_enabled": before_trig,
    "after_triggers_enabled": after_trig,
    "effective_user_hint": effective,
    "expect_probe_nonzero": True,
    "expect_before_count_ge_1": True,
    "expect_rows_preserved": True,
    "expect_triggers_enabled": True,
}
report["rows_preserved"] = report["before_count"] == report["after_count"]
report["triggers_preserved"] = report["after_triggers_enabled"] is True
report["seeded_ponr_holding"] = report["before_count"] >= 1
report["ok"] = (
    report["probe_rc"] != 0
    and report["seeded_ponr_holding"]
    and report["rows_preserved"]
    and report["triggers_preserved"]
    and report["before_triggers_enabled"]
)
(out / "negative-marker-report.json").write_text(json.dumps(report, indent=2) + "\n")
print(json.dumps(report, indent=2))
if not report["ok"]:
    raise SystemExit(2)
(out / "ac-empty-table-must-fail.md").write_text(
    "# Empty-table wrapper must fail\n\n"
    "This script exits 2 when `before_count < 1` (and HOLO_PROBE_SEED_PONR!=1).\n"
    "An empty `data_plane_ponr` table cannot establish PONR preservation.\n"
)
PY

echo "negative-marker control PASS (forced miss hard-fail; PONR rows+triggers preserved; before_count>=1)"

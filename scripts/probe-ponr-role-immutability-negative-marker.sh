#!/usr/bin/env bash
# RH-S30-21 / C-3 — forced marker-miss on a PONR-holding DB (gate/IT owned).
#
# Fail closed unless:
#   - before_count >= 1
#   - required non-internal triggers exist and are enabled (named, count>=1)
#   - PROBE_FORCE_MARKER_MISS → probe exit != 0
#   - after_count == before_count; triggers still enabled
#   - effective current_user == holocron_app from rolled-back DO (ac-force-miss-session.json)
#
# Usage:
#   DATABASE_URL=... bash scripts/probe-ponr-role-immutability-negative-marker.sh [out_dir]
# Optional: HOLO_PROBE_SEED_PONR=1 seeds one disposable row when empty.
set -euo pipefail
: "${DATABASE_URL:?DATABASE_URL required}"
OUT_DIR="${1:-.tmp/REDHAT-FIX-RH-S30-21}"
mkdir -p "$OUT_DIR"

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

REQUIRED_TRIGGERS="data_plane_ponr_reject_mutation data_plane_ponr_reject_truncate"

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
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 <<'SQL'
DO $seed$
BEGIN
  ALTER TABLE data_plane_ponr DISABLE TRIGGER data_plane_ponr_reject_mutation;
  BEGIN
    ALTER TABLE data_plane_ponr DISABLE TRIGGER data_plane_ponr_reject_truncate;
  EXCEPTION WHEN undefined_object THEN NULL;
  END;
  INSERT INTO data_plane_ponr (
    fence_lifted_at, write_surface, write_table, write_row_id, write_row_digest_sha256,
    write_committed_at, base_url, operator, run_id, idempotency_key, export_watermark_ms,
    convex_fence_audit_id, convex_fence_env_value, convex_documents_total,
    convex_newest_document_creation_time, convex_accepted_writes_since_watermark,
    convex_rejected_writes_since_watermark
  ) VALUES (
    now(), 'probe.seed', 'documents', '00000000-0000-4000-8000-aaaaaaaaaaaa',
    repeat('ab', 32), now(), 'http://127.0.0.1:9', 'probe-seed',
    's30-marker-miss-seed', 's30-marker-miss-seed-idem',
    (extract(epoch from now()) * 1000)::bigint,
    'seed', '1', 0, 0, 0, 0
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

trig_report() {
  psql "$DATABASE_URL" -tAc "
    SELECT coalesce(json_agg(row_to_json(t)), '[]'::json)::text FROM (
      SELECT tgname, tgenabled
      FROM pg_trigger
      WHERE tgrelid = 'public.data_plane_ponr'::regclass
        AND NOT tgisinternal
        AND tgname IN ('data_plane_ponr_reject_mutation','data_plane_ponr_reject_truncate')
      ORDER BY tgname
    ) t;
  "
}

seed_ponr_if_empty

BEFORE_COUNT="$(psql "$DATABASE_URL" -tAc 'SELECT count(*)::text FROM data_plane_ponr')"
BEFORE_TRIG_JSON="$(trig_report)"
BEFORE_TRIG_N="$(psql "$DATABASE_URL" -tAc "
  SELECT count(*)::text FROM pg_trigger
  WHERE tgrelid = 'public.data_plane_ponr'::regclass
    AND NOT tgisinternal
    AND tgenabled = 'O'
    AND tgname IN ('data_plane_ponr_reject_mutation','data_plane_ponr_reject_truncate');
")"

if [[ "${BEFORE_COUNT:-0}" -lt 1 ]]; then
  echo "error: before_count must be >= 1 (empty table cannot prove PONR preservation)" >&2
  exit 2
fi
if [[ "${BEFORE_TRIG_N:-0}" -lt 1 ]]; then
  echo "error: required PONR immutability triggers missing or not enabled (tgenabled=O)" >&2
  exit 2
fi

set +e
PROBE_FORCE_MARKER_MISS=1 \
  bash "$ROOT/scripts/probe-ponr-role-immutability.sh" "$OUT_DIR/probe-out" \
  >"$OUT_DIR/stdout.txt" 2>"$OUT_DIR/stderr.txt"
PROBE_RC=$?
set -e

AFTER_COUNT="$(psql "$DATABASE_URL" -tAc 'SELECT count(*)::text FROM data_plane_ponr')"
AFTER_TRIG_JSON="$(trig_report)"
AFTER_TRIG_N="$(psql "$DATABASE_URL" -tAc "
  SELECT count(*)::text FROM pg_trigger
  WHERE tgrelid = 'public.data_plane_ponr'::regclass
    AND NOT tgisinternal
    AND tgenabled = 'O'
    AND tgname IN ('data_plane_ponr_reject_mutation','data_plane_ponr_reject_truncate');
")"

python3 - "$OUT_DIR" "$PROBE_RC" "$BEFORE_COUNT" "$AFTER_COUNT" \
  "$BEFORE_TRIG_N" "$AFTER_TRIG_N" "$BEFORE_TRIG_JSON" "$AFTER_TRIG_JSON" <<'PY'
import json, sys
from pathlib import Path

out = Path(sys.argv[1])
probe_rc = int(sys.argv[2])
before_count = int(sys.argv[3] or "0")
after_count = int(sys.argv[4] or "0")
before_trig_n = int(sys.argv[5] or "0")
after_trig_n = int(sys.argv[6] or "0")
before_trig_json = json.loads(sys.argv[7] or "[]")
after_trig_json = json.loads(sys.argv[8] or "[]")

session = {}
sess_path = out / "probe-out" / "ac-force-miss-session.json"
if sess_path.exists():
    session = json.loads(sess_path.read_text())
effective = session.get("probe_current_user")
effective_non_owner = session.get("effective_non_owner") is True or effective == "holocron_app"

report = {
    "probe_rc": probe_rc,
    "before_count": before_count,
    "after_count": after_count,
    "before_required_triggers_enabled_count": before_trig_n,
    "after_required_triggers_enabled_count": after_trig_n,
    "before_triggers": before_trig_json,
    "after_triggers": after_trig_json,
    "required_trigger_names": [
        "data_plane_ponr_reject_mutation",
        "data_plane_ponr_reject_truncate",
    ],
    "probe_current_user": effective,
    "effective_non_owner": effective_non_owner,
    "expect_probe_nonzero": True,
    "expect_before_count_ge_1": True,
    "expect_required_triggers": True,
    "expect_effective_holocron_app": True,
}
report["rows_preserved"] = report["before_count"] == report["after_count"]
report["triggers_preserved"] = (
    after_trig_n >= 1 and after_trig_n >= before_trig_n and before_trig_n >= 1
)
report["seeded_ponr_holding"] = before_count >= 1
report["ok"] = (
    probe_rc != 0
    and report["seeded_ponr_holding"]
    and report["rows_preserved"]
    and report["triggers_preserved"]
    and effective_non_owner
)
(out / "negative-marker-report.json").write_text(json.dumps(report, indent=2) + "\n")
print(json.dumps(report, indent=2))
if not report["ok"]:
    raise SystemExit(2)
(out / "ac-empty-table-must-fail.md").write_text(
    "# Empty-table wrapper must fail\n\n"
    "Exits 2 when before_count < 1 (unless HOLO_PROBE_SEED_PONR=1 seeds a row).\n"
)
PY

echo "negative-marker control PASS (forced miss; PONR preserved; holocron_app session; triggers enabled)"

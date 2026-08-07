#!/usr/bin/env bash
# RH-S30-21 residual — forced marker-miss on an EXPLICIT disposable DB only.
#
# NEVER seeds against the gate/cutover DATABASE_URL.
# Requires operator-supplied HOLO_PROBE_MARKER_MISS_DATABASE_URL (no silent default).
# Target identity uses canonical PG URL equality (scheme + default port aliases).
# Seeding is opt-in only (HOLO_PROBE_SEED_PONR=1); default is OFF (0).
#
# Exact required triggers (both must exist and tgenabled='O'):
#   data_plane_ponr_reject_mutation
#   data_plane_ponr_reject_truncate
#
# Usage:
#   DATABASE_URL=<gate> \
#   HOLO_PROBE_MARKER_MISS_DATABASE_URL=<disposable distinct> \
#   HOLO_PROBE_SEED_PONR=1 \
#   bash scripts/probe-ponr-role-immutability-negative-marker.sh [out_dir]
set -euo pipefail
: "${DATABASE_URL:?DATABASE_URL required (gate/cutover URL — never the seed target)}"
: "${HOLO_PROBE_MARKER_MISS_DATABASE_URL:?HOLO_PROBE_MARKER_MISS_DATABASE_URL required (operator-supplied distinct disposable DB; no default)}"

GATE_URL="$DATABASE_URL"
MARKER_URL="$HOLO_PROBE_MARKER_MISS_DATABASE_URL"
OUT_DIR="${1:-.tmp/REDHAT-FIX-RH-S30-21}"
mkdir -p "$OUT_DIR"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
CANON="$ROOT/scripts/lib/canonical-pg-url.py"

GATE_NORM="$(python3 "$CANON" "$GATE_URL")"
MARKER_NORM="$(python3 "$CANON" "$MARKER_URL")"
if [[ "$MARKER_NORM" == "$GATE_NORM" ]]; then
  echo "error: HOLO_PROBE_MARKER_MISS_DATABASE_URL canonically equals DATABASE_URL (refuse production/gate seed)" >&2
  echo "  gate_canon=$GATE_NORM" >&2
  echo "  marker_canon=$MARKER_NORM" >&2
  exit 2
fi
# Production-like ports / hostnames used by cutover soak (conservative reject; no override for gate path)
if echo "$MARKER_URL" | grep -Eqi '(:44112/|/holocron$|holocron:.*@.*:44112)'; then
  if [[ "${HOLO_PROBE_ALLOW_PROD_LIKE_MARKER_DB:-0}" != "1" ]]; then
    echo "error: marker DB looks production-like (port 44112 / holocron prod). Use disposable nonprod URL." >&2
    exit 2
  fi
fi
# Canonical path ending in /holocron (prod-like DB name) also refuse unless explicit allow
if [[ "$MARKER_NORM" == *"/holocron" ]] && [[ "${HOLO_PROBE_ALLOW_PROD_LIKE_MARKER_DB:-0}" != "1" ]]; then
  echo "error: marker canonical path ends with /holocron (prod-like). Use disposable nonprod URL." >&2
  exit 2
fi

REQUIRED_TRIGGERS=(data_plane_ponr_reject_mutation data_plane_ponr_reject_truncate)

seed_ponr_if_empty() {
  local count
  count="$(psql "$MARKER_URL" -tAc 'SELECT count(*)::text FROM data_plane_ponr')"
  if [[ "${count:-0}" -ge 1 ]]; then
    return 0
  fi
  if [[ "${HOLO_PROBE_SEED_PONR:-0}" != "1" ]]; then
    echo "error: disposable marker DB data_plane_ponr empty; set HOLO_PROBE_SEED_PONR=1 (disposable only)" >&2
    return 2
  fi
  # Seed ONLY on MARKER_URL (never GATE_URL).
  psql "$MARKER_URL" -v ON_ERROR_STOP=1 <<'SQL'
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

trig_json() {
  psql "$MARKER_URL" -tAc "
    SELECT coalesce(json_agg(row_to_json(t) ORDER BY tgname), '[]'::json)::text FROM (
      SELECT tgname, tgenabled::text AS tgenabled
      FROM pg_trigger
      WHERE tgrelid = 'public.data_plane_ponr'::regclass
        AND NOT tgisinternal
        AND tgname IN ('data_plane_ponr_reject_mutation','data_plane_ponr_reject_truncate')
    ) t;
  "
}

exact_triggers_ok() {
  # Returns 0 only when BOTH required names exist and tgenabled='O'
  python3 -c "
import json,sys
req={'data_plane_ponr_reject_mutation','data_plane_ponr_reject_truncate'}
rows=json.loads(sys.argv[1] or '[]')
enabled={r['tgname'] for r in rows if r.get('tgenabled')=='O'}
sys.exit(0 if req <= enabled else 1)
" "$1"
}

seed_ponr_if_empty

BEFORE_COUNT="$(psql "$MARKER_URL" -tAc 'SELECT count(*)::text FROM data_plane_ponr')"
BEFORE_TRIG_JSON="$(trig_json)"
GATE_COUNT_BEFORE="$(psql "$GATE_URL" -tAc 'SELECT count(*)::text FROM data_plane_ponr' 2>/dev/null || echo -1)"

if [[ "${BEFORE_COUNT:-0}" -lt 1 ]]; then
  echo "error: marker DB before_count must be >= 1" >&2
  exit 2
fi
if ! exact_triggers_ok "$BEFORE_TRIG_JSON"; then
  echo "error: both required PONR triggers must exist and be tgenabled=O before probe" >&2
  echo "got: $BEFORE_TRIG_JSON" >&2
  exit 2
fi

set +e
DATABASE_URL="$MARKER_URL" PROBE_FORCE_MARKER_MISS=1 \
  bash "$ROOT/scripts/probe-ponr-role-immutability.sh" "$OUT_DIR/probe-out" \
  >"$OUT_DIR/stdout.txt" 2>"$OUT_DIR/stderr.txt"
PROBE_RC=$?
set -e

AFTER_COUNT="$(psql "$MARKER_URL" -tAc 'SELECT count(*)::text FROM data_plane_ponr')"
AFTER_TRIG_JSON="$(trig_json)"
GATE_COUNT_AFTER="$(psql "$GATE_URL" -tAc 'SELECT count(*)::text FROM data_plane_ponr' 2>/dev/null || echo -1)"

python3 - "$OUT_DIR" "$PROBE_RC" "$BEFORE_COUNT" "$AFTER_COUNT" \
  "$BEFORE_TRIG_JSON" "$AFTER_TRIG_JSON" \
  "$GATE_COUNT_BEFORE" "$GATE_COUNT_AFTER" \
  "$GATE_NORM" "$MARKER_NORM" <<'PY'
import json, sys
from pathlib import Path

out = Path(sys.argv[1])
probe_rc = int(sys.argv[2])
before_count = int(sys.argv[3] or "0")
after_count = int(sys.argv[4] or "0")
before_trig = json.loads(sys.argv[5] or "[]")
after_trig = json.loads(sys.argv[6] or "[]")
gate_before = int(sys.argv[7] or "-1")
gate_after = int(sys.argv[8] or "-1")
gate_norm = sys.argv[9]
marker_norm = sys.argv[10]

req = {"data_plane_ponr_reject_mutation", "data_plane_ponr_reject_truncate"}

def enabled_set(rows):
    return {r["tgname"] for r in rows if r.get("tgenabled") == "O"}

before_en = enabled_set(before_trig)
after_en = enabled_set(after_trig)
exact_before = req <= before_en and len(before_en & req) == 2
exact_after = req <= after_en and len(after_en & req) == 2

session = {}
sess_path = out / "probe-out" / "ac-force-miss-session.json"
if sess_path.exists():
    session = json.loads(sess_path.read_text())
effective = session.get("probe_current_user")
effective_non_owner = effective == "holocron_app"

report = {
    "probe_rc": probe_rc,
    "before_count": before_count,
    "after_count": after_count,
    "gate_db_count_before": gate_before,
    "gate_db_count_after": gate_after,
    "gate_url_normalized": gate_norm,
    "marker_url_normalized": marker_norm,
    "urls_distinct": gate_norm != marker_norm,
    "before_triggers": before_trig,
    "after_triggers": after_trig,
    "required_trigger_names": sorted(req),
    "exact_required_triggers_enabled_before": exact_before,
    "exact_required_triggers_enabled_after": exact_after,
    "before_required_triggers_enabled_count": len(before_en & req),
    "after_required_triggers_enabled_count": len(after_en & req),
    "probe_current_user": effective,
    "effective_non_owner": effective_non_owner,
    "production_untouched": gate_before == gate_after,
}
report["rows_preserved"] = before_count == after_count
report["triggers_preserved"] = exact_before and exact_after
report["seeded_ponr_holding"] = before_count >= 1
report["ok"] = (
    probe_rc != 0
    and report["urls_distinct"]
    and report["seeded_ponr_holding"]
    and report["rows_preserved"]
    and report["triggers_preserved"]
    and effective_non_owner
    and report["production_untouched"]
)
(out / "negative-marker-report.json").write_text(json.dumps(report, indent=2) + "\n")
print(json.dumps(report, indent=2))
if not report["ok"]:
    raise SystemExit(2)
(out / "ac-disposable-only.md").write_text(
    "# Disposable-only marker DB\n\n"
    "HOLO_PROBE_MARKER_MISS_DATABASE_URL must be distinct from DATABASE_URL.\n"
    "Seeding never targets the gate/cutover URL. Production count must be unchanged.\n"
)
PY

echo "negative-marker control PASS (disposable-only; exact triggers; holocron_app; production untouched)"

#!/usr/bin/env bash
# RH-S30-21 residual — forced marker-miss on an explicit disposable DB only.
set -euo pipefail
: "${DATABASE_URL:?DATABASE_URL required (gate/cutover URL — never the seed target)}"
: "${HOLO_PROBE_MARKER_MISS_DATABASE_URL:?HOLO_PROBE_MARKER_MISS_DATABASE_URL required (distinct marker DB)}"

GATE_URL="$DATABASE_URL"
MARKER_URL="$HOLO_PROBE_MARKER_MISS_DATABASE_URL"
OUT_DIR="${1:-.tmp/REDHAT-FIX-RH-S30-21}"
mkdir -p "$OUT_DIR"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

identity_json() {
  DATABASE_URL="$1" bun --eval '
    try {
      const { parseDatabaseTargetIdentity } = await import("./packages/platform/src/db/connection.ts");
      const x = parseDatabaseTargetIdentity(process.env.DATABASE_URL!);
      process.stdout.write(JSON.stringify({
        host: x.host,
        effective_port: x.effective_port,
        database: x.database,
        fingerprint: x.fingerprint,
      }));
    } catch {
      process.stderr.write("error: DATABASE_TARGET_IDENTITY_FAILED\n");
      process.exit(2);
    }
  '
}
GATE_NORM="$(identity_json "$GATE_URL")"
MARKER_NORM="$(identity_json "$MARKER_URL")"
if [[ "$MARKER_NORM" == "$GATE_NORM" ]]; then
  echo 'error: gate and marker targets are canonically equal; refusing seed' >&2
  exit 2
fi
MARKER_DB_PORT="$(python3 - "$MARKER_NORM" <<'PY'
import json, sys
target = json.loads(sys.argv[1])
print(f"{target['database'].lower()}:{target['effective_port']}")
PY
)"
if [[ ("$MARKER_DB_PORT" == holocron:* || "$MARKER_DB_PORT" == *:44112) && "${HOLO_PROBE_ALLOW_PROD_LIKE_MARKER_DB:-0}" != "1" ]]; then
  echo 'error: production-like marker target refused; use a disposable database' >&2
  exit 2
fi
if [[ "${HOLO_PROBE_SEED_PONR:-0}" == "1" ]]; then
  DATABASE_URL="$GATE_URL" HOLO_PROBE_MARKER_MISS_DATABASE_URL="$MARKER_URL" \
    bun --eval '
      try {
        const { seedExactPonrMarker } = await import("./packages/platform/src/cutover/ponr-marker.ts");
        await seedExactPonrMarker({
          gateDatabaseUrl: process.env.DATABASE_URL!,
          markerDatabaseUrl: process.env.HOLO_PROBE_MARKER_MISS_DATABASE_URL!,
        });
      } catch {
        process.stderr.write("error: PONR_MARKER_SEED_FAILED\n");
        process.exit(2);
      }
    '
fi

database_state_json() {
  DATABASE_URL="$1" bun --eval '
    let sql: any = null;
    try {
      const { createSql } = await import("./packages/platform/src/db/client.ts");
      const { REQUIRED_PONR_TRIGGER_NAMES } = await import("./packages/platform/src/cutover/ponr-marker.ts");
      sql = createSql(process.env.DATABASE_URL!);
      const rows = await sql<Array<{ count: string }>>`SELECT count(*)::text AS count FROM public.data_plane_ponr`;
      const triggers = await sql<Array<{ tgname: string; tgenabled: string }>>`
        SELECT tgname, tgenabled::text AS tgenabled
        FROM pg_trigger
        WHERE tgrelid = '\''public.data_plane_ponr'\''::regclass
          AND NOT tgisinternal
          AND (
            tgname = ${REQUIRED_PONR_TRIGGER_NAMES[0]}
            OR tgname = ${REQUIRED_PONR_TRIGGER_NAMES[1]}
          )
        ORDER BY tgname
      `;
      process.stdout.write(JSON.stringify({ count: Number(rows[0]?.count ?? 0), triggers }));
    } catch {
      process.stderr.write("error: PONR_MARKER_DATABASE_STATE_FAILED\n");
      process.exitCode = 2;
    } finally {
      await sql?.end({ timeout: 5 }).catch(() => {});
    }
  '
}
exact_triggers_ok() {
  python3 -c "import json,sys; req={'data_plane_ponr_reject_mutation','data_plane_ponr_reject_truncate'}; rows=json.loads(sys.argv[1] or '[]'); enabled={r['tgname'] for r in rows if r.get('tgenabled')=='O'}; sys.exit(0 if req <= enabled else 1)" "$1"
}

MARKER_BEFORE_STATE="$(database_state_json "$MARKER_URL")"
BEFORE_COUNT="$(python3 -c 'import json,sys; print(json.loads(sys.argv[1])["count"])' "$MARKER_BEFORE_STATE")"
BEFORE_TRIG_JSON="$(python3 -c 'import json,sys; print(json.dumps(json.loads(sys.argv[1])["triggers"], separators=(",",":")))' "$MARKER_BEFORE_STATE")"
GATE_COUNT_BEFORE="$(database_state_json "$GATE_URL" 2>/dev/null | python3 -c 'import json,sys; print(json.loads(sys.stdin.read())["count"])' 2>/dev/null || echo -1)"
if [[ "${BEFORE_COUNT:-0}" -lt 1 ]] || ! exact_triggers_ok "$BEFORE_TRIG_JSON"; then
  echo 'error: marker seed/triggers precondition failed' >&2
  exit 2
fi

set +e
DATABASE_URL="$MARKER_URL" PROBE_FORCE_MARKER_MISS=1 \
  bash "$ROOT/scripts/probe-ponr-role-immutability.sh" "$OUT_DIR/probe-out" \
  >"$OUT_DIR/stdout.txt" 2>"$OUT_DIR/stderr.txt"
PROBE_RC=$?
set -e

MARKER_AFTER_STATE="$(database_state_json "$MARKER_URL")"
AFTER_COUNT="$(python3 -c 'import json,sys; print(json.loads(sys.argv[1])["count"])' "$MARKER_AFTER_STATE")"
AFTER_TRIG_JSON="$(python3 -c 'import json,sys; print(json.dumps(json.loads(sys.argv[1])["triggers"], separators=(",",":")))' "$MARKER_AFTER_STATE")"
GATE_COUNT_AFTER="$(database_state_json "$GATE_URL" 2>/dev/null | python3 -c 'import json,sys; print(json.loads(sys.stdin.read())["count"])' 2>/dev/null || echo -1)"
python3 - "$OUT_DIR" "$PROBE_RC" "$BEFORE_COUNT" "$AFTER_COUNT" "$BEFORE_TRIG_JSON" "$AFTER_TRIG_JSON" "$GATE_COUNT_BEFORE" "$GATE_COUNT_AFTER" "$GATE_NORM" "$MARKER_NORM" <<'PY'
import json, sys
from pathlib import Path
out = Path(sys.argv[1])
probe_rc = int(sys.argv[2])
before_count = int(sys.argv[3] or '0')
after_count = int(sys.argv[4] or '0')
before_trig = json.loads(sys.argv[5] or '[]')
after_trig = json.loads(sys.argv[6] or '[]')
gate_before = int(sys.argv[7] or '-1')
gate_after = int(sys.argv[8] or '-1')
gate_identity = json.loads(sys.argv[9])
marker_identity = json.loads(sys.argv[10])
req = {'data_plane_ponr_reject_mutation', 'data_plane_ponr_reject_truncate'}
def enabled(rows):
    return {r['tgname'] for r in rows if r.get('tgenabled') == 'O'}
before_enabled = enabled(before_trig)
after_enabled = enabled(after_trig)
session = {}
session_path = out / 'probe-out' / 'ac-force-miss-session.json'
if session_path.exists():
    session = json.loads(session_path.read_text())
effective_non_owner = session.get('probe_current_user') == 'holocron_app'
report = {
    'probe_rc': probe_rc,
    'before_count': before_count,
    'after_count': after_count,
    'gate_db_count_before': gate_before,
    'gate_db_count_after': gate_after,
    'gate_database_target': gate_identity,
    'marker_database_target': marker_identity,
    'urls_distinct': gate_identity != marker_identity,
    'before_triggers': before_trig,
    'after_triggers': after_trig,
    'exact_required_triggers_enabled_before': req <= before_enabled,
    'exact_required_triggers_enabled_after': req <= after_enabled,
    'before_required_triggers_enabled_count': len(req & before_enabled),
    'after_required_triggers_enabled_count': len(req & after_enabled),
    'rows_preserved': before_count == after_count,
    'triggers_preserved': req <= before_enabled and req <= after_enabled,
    'seeded_ponr_holding': before_count >= 1,
    'probe_current_user': session.get('probe_current_user'),
    'effective_non_owner': effective_non_owner,
    'production_untouched': gate_before == gate_after,
}
report['ok'] = (probe_rc != 0 and report['urls_distinct'] and report['seeded_ponr_holding'] and report['rows_preserved'] and report['triggers_preserved'] and report['effective_non_owner'] and report['production_untouched'])
(out / 'negative-marker-report.json').write_text(json.dumps(report, indent=2) + '\n')
print(json.dumps(report, indent=2))
if not report['ok']:
    raise SystemExit(2)
PY

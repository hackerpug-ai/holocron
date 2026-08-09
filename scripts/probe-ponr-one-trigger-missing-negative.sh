#!/usr/bin/env bash
# RH-S30-30 residual / C-3 eighth closeout — one-trigger-missing negative.
#
# On a disposable marker DB only: disable each required PONR trigger in turn,
# prove the marker-miss precheck refuses (non-zero, ok!=true), then re-enable.
# Also prove same-target URI-alias rejection (postgres vs postgresql + default port).
#
# Usage:
#   DATABASE_URL=<gate> \
#   HOLO_PROBE_MARKER_MISS_DATABASE_URL=<disposable distinct> \
#   bash scripts/probe-ponr-one-trigger-missing-negative.sh [out_dir]
set -euo pipefail
: "${DATABASE_URL:?DATABASE_URL required (gate — never mutated)}"
: "${HOLO_PROBE_MARKER_MISS_DATABASE_URL:?HOLO_PROBE_MARKER_MISS_DATABASE_URL required (disposable)}"

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
OUT_DIR="${1:-.tmp/REDHAT-FIX-RH-S30-30-one-trigger-missing}"
mkdir -p "$OUT_DIR"

GATE_URL="$DATABASE_URL"
MARKER_URL="$HOLO_PROBE_MARKER_MISS_DATABASE_URL"

# URL material is supplied to Python only through S30_TARGET_URL. Evidence
# retains only the shared four-field target identity, never a URL-shaped value.
database_identity() {
  env -u DATABASE_URL -u HOLO_PROBE_MARKER_MISS_DATABASE_URL \
    S30_IDENTITY_CHILD=1 S30_TARGET_URL="$1" bun --eval '
    try {
      const { parseDatabaseTargetIdentity } = await import("./services/platform/src/db/connection.ts");
      process.stdout.write(JSON.stringify(parseDatabaseTargetIdentity(process.env.S30_TARGET_URL!)));
    } catch {
      process.stderr.write("error: DATABASE_TARGET_IDENTITY_FAILED\n");
      process.exit(2);
    }
  '
}

# The psql process receives only libpq PG* values. This wrapper absorbs raw
# libpq stderr and reports a stable error so neither argv nor transcript can
# disclose a URL, userinfo, query values, or fragments.
psql_on_target() {
  local target_url="$1"
  shift
  S30_TARGET_URL="$target_url" python3 -c '
import os
import subprocess
import sys
from urllib.parse import parse_qs, unquote, urlsplit

raw = (os.environ.get("S30_TARGET_URL") or "").strip()
try:
    parsed = urlsplit(raw)
    host = parsed.hostname
    port = parsed.port or 5432
    database = unquote(parsed.path.lstrip("/"))
except ValueError:
    print("error: DATABASE_TARGET_INVALID", file=sys.stderr)
    raise SystemExit(2)
if parsed.scheme not in {"postgres", "postgresql"} or not host or not database:
    print("error: DATABASE_TARGET_INVALID", file=sys.stderr)
    raise SystemExit(2)

env = os.environ.copy()
for key in list(env):
    if key == "DATABASE_URL" or key.endswith("_DATABASE_URL") or key == "S30_TARGET_URL":
        env.pop(key, None)
for key in (
    "PGHOST", "PGHOSTADDR", "PGPORT", "PGDATABASE", "PGUSER", "PGPASSWORD",
    "PGSERVICE", "PGSERVICEFILE", "PGSSLMODE", "PGSSLROOTCERT", "PGSSLCERT",
    "PGSSLKEY", "PGCONNECT_TIMEOUT", "PGAPPNAME", "PGOPTIONS",
    "PGTARGETSESSIONATTRS", "PGGSSENCMODE", "PGCHANNELBINDING",
):
    env.pop(key, None)
env.update({"PGHOST": host, "PGPORT": str(port), "PGDATABASE": database})
if parsed.username:
    env["PGUSER"] = unquote(parsed.username)
if parsed.password is not None:
    env["PGPASSWORD"] = unquote(parsed.password)
query = parse_qs(parsed.query, keep_blank_values=True)
for parameter, env_key in {
    "sslmode": "PGSSLMODE", "sslrootcert": "PGSSLROOTCERT",
    "sslcert": "PGSSLCERT", "sslkey": "PGSSLKEY",
    "connect_timeout": "PGCONNECT_TIMEOUT", "application_name": "PGAPPNAME",
    "options": "PGOPTIONS", "target_session_attrs": "PGTARGETSESSIONATTRS",
    "gssencmode": "PGGSSENCMODE", "channel_binding": "PGCHANNELBINDING",
}.items():
    if query.get(parameter):
        env[env_key] = query[parameter][-1]

result = subprocess.run(["psql", *sys.argv[1:]], env=env, stdin=sys.stdin, capture_output=True, text=True)
if result.returncode:
    print("error: POSTGRES_OPERATION_FAILED", file=sys.stderr)
    raise SystemExit(result.returncode or 2)
sys.stdout.write(result.stdout)
' "$@"
}

GATE_IDENTITY="$(database_identity "$GATE_URL")"
MARKER_IDENTITY="$(database_identity "$MARKER_URL")"
if [[ "$GATE_IDENTITY" == "$MARKER_IDENTITY" ]]; then
  echo "error: marker URL canonically equals gate URL — refuse" >&2
  exit 2
fi

# ── URI-alias same-target negative (must reject) ───────────────────────────
# Build an alias of GATE that differs only by scheme/default-port spelling.
ALIAS_SAME="$(
  DATABASE_URL="$GATE_URL" python3 - <<'PY'
import os
from urllib.parse import urlparse, urlunparse
u = urlparse(os.environ.get("DATABASE_URL", ""))
# Flip scheme between postgres/postgresql and drop explicit :5432 if present
scheme = "postgres" if (u.scheme or "").lower().startswith("postgresql") else "postgresql"
host = u.hostname or "127.0.0.1"
# Omit port when default 5432 to force alias form
port = u.port
netloc_host = host
if port and port != 5432:
    netloc_host = f"{host}:{port}"
# else omit port → default 5432 equivalence
userinfo = ""
if u.username:
    userinfo = u.username
    if u.password is not None:
        userinfo += f":{u.password}"
    userinfo += "@"
netloc = f"{userinfo}{netloc_host}"
print(urlunparse((scheme, netloc, u.path, "", "", "")))
PY
)"
ALIAS_IDENTITY="$(database_identity "$ALIAS_SAME")"
set +e
if [[ "$ALIAS_IDENTITY" == "$GATE_IDENTITY" ]]; then
  printf 'equal\n' >"$OUT_DIR/uri-alias-equal.stdout"
  : >"$OUT_DIR/uri-alias-equal.stderr"
  ALIAS_EQ_RC=1
else
  printf 'distinct\n' >"$OUT_DIR/uri-alias-equal.stdout"
  : >"$OUT_DIR/uri-alias-equal.stderr"
  ALIAS_EQ_RC=0
fi
set -e
# equal → exit 1 from helper; we need them equal for the negative fixture
if [[ "$ALIAS_EQ_RC" -ne 1 ]]; then
  echo "error: failed to construct same-target URI alias of gate" >&2
  cat "$OUT_DIR/uri-alias-equal.stdout" >&2 || true
  exit 2
fi

# Marker probe invoked with MARKER_URL = alias of GATE must refuse (exit != 0)
set +e
DATABASE_URL="$GATE_URL" \
  HOLO_PROBE_MARKER_MISS_DATABASE_URL="$ALIAS_SAME" \
  HOLO_PROBE_SEED_PONR=0 \
  bash "$ROOT/scripts/probe-ponr-role-immutability-negative-marker.sh" \
  "$OUT_DIR/uri-alias-reject" \
  >"$OUT_DIR/uri-alias-reject.stdout" 2>"$OUT_DIR/uri-alias-reject.stderr"
ALIAS_PROBE_RC=$?
set -e
echo "$ALIAS_PROBE_RC" >"$OUT_DIR/uri-alias-reject.exit"
if [[ "$ALIAS_PROBE_RC" -eq 0 ]]; then
  echo "error: URI-alias same-target marker probe must refuse (got exit 0)" >&2
  exit 2
fi

REQUIRED=(data_plane_ponr_reject_mutation data_plane_ponr_reject_truncate)

restore_triggers() {
  for t in "${REQUIRED[@]}"; do
    psql_on_target "$MARKER_URL" -v ON_ERROR_STOP=1 -c \
      "ALTER TABLE data_plane_ponr ENABLE TRIGGER ${t};" 2>/dev/null || true
  done
}
trap restore_triggers EXIT

# Ensure both triggers start enabled
restore_triggers

cases_json='[]'
for disable_one in "${REQUIRED[@]}"; do
  case_dir="$OUT_DIR/disable-${disable_one}"
  mkdir -p "$case_dir"
  psql_on_target "$MARKER_URL" -v ON_ERROR_STOP=1 -c \
    "ALTER TABLE data_plane_ponr DISABLE TRIGGER ${disable_one};"

  # Snapshot exact tgenabled states for complementary D/O bind (RH-S30-33)
  TRIG_SNAP="$(
    psql_on_target "$MARKER_URL" -tAc "
      SELECT coalesce(string_agg(tgname || '|' || tgenabled::text, E'\n' ORDER BY tgname), '')
      FROM pg_trigger
      WHERE tgrelid = 'public.data_plane_ponr'::regclass
        AND NOT tgisinternal
        AND tgname IN ('data_plane_ponr_reject_mutation','data_plane_ponr_reject_truncate');
    "
  )"
  {
    echo "complementary_do_snapshot:"
    echo "$TRIG_SNAP"
  } >>"$case_dir/stderr.txt"

  set +e
  # Precheck-only path: marker script must exit non-zero when exact set incomplete
  DATABASE_URL="$GATE_URL" \
    HOLO_PROBE_MARKER_MISS_DATABASE_URL="$MARKER_URL" \
    HOLO_PROBE_SEED_PONR=0 \
    bash "$ROOT/scripts/probe-ponr-role-immutability-negative-marker.sh" \
    "$case_dir/probe" \
    >"$case_dir/stdout.txt" 2>>"$case_dir/stderr.txt"
  case_rc=$?
  set -e
  echo "$case_rc" >"$case_dir/exit.code"

  # Parse D/O from snapshot for case record
  DO_JSON="$(
    python3 -c "
snap='''$TRIG_SNAP'''
disabled='''$disable_one'''
req={'data_plane_ponr_reject_mutation','data_plane_ponr_reject_truncate'}
states={}
for line in snap.splitlines():
  line=line.strip()
  if '|' not in line: continue
  n,s=line.split('|',1)
  states[n]=s.upper()
other=next(iter(req-{disabled}), '')
import json
print(json.dumps({
  'disabled_tgenabled': states.get(disabled),
  'other_tgenabled': states.get(other),
  'other_trigger': other,
  'states': states,
}))
"
  )"

  # Re-enable before next case
  psql_on_target "$MARKER_URL" -v ON_ERROR_STOP=1 -c \
    "ALTER TABLE data_plane_ponr ENABLE TRIGGER ${disable_one};"

  if [[ "$case_rc" -eq 0 ]]; then
    echo "error: one-trigger-missing ($disable_one) must non-zero exit" >&2
    exit 2
  fi

  # Prefer structured report when present
  ok_field="missing"
  if [[ -f "$case_dir/probe/negative-marker-report.json" ]]; then
    ok_field="$(python3 -c "import json;print(json.load(open('$case_dir/probe/negative-marker-report.json')).get('ok'))")"
    if [[ "$ok_field" == "True" || "$ok_field" == "true" ]]; then
      echo "error: one-trigger-missing report ok must not be true for $disable_one" >&2
      exit 2
    fi
  fi

  cases_json="$(
    python3 -c "
import json
cases=json.loads('''$cases_json''')
do=json.loads('''$DO_JSON''')
cases.append({
  'disabled_trigger': '''$disable_one''',
  'probe_rc': $case_rc,
  'ok_field': '''$ok_field''',
  'refused': True,
  'disabled_tgenabled': do.get('disabled_tgenabled'),
  'other_tgenabled': do.get('other_tgenabled'),
  'complementary_do': do,
  'raw_exit_code_path': f'disable-{'''$disable_one'''}/exit.code',
})
print(json.dumps(cases))
"
  )"
done

restore_triggers
trap - EXIT

python3 - "$OUT_DIR" "$GATE_IDENTITY" "$MARKER_IDENTITY" "$ALIAS_PROBE_RC" "$cases_json" "$ROOT" <<'PY'
import json, sys, subprocess
from pathlib import Path

out = Path(sys.argv[1])
gate_identity = json.loads(sys.argv[2])
marker_identity = json.loads(sys.argv[3])
alias_rc = int(sys.argv[4])
cases = json.loads(sys.argv[5])
root = Path(sys.argv[6])
report = {
    "ok": True,
    "tool": "scripts/probe-ponr-one-trigger-missing-negative.sh",
    "gate_database_target": gate_identity,
    "marker_database_target": marker_identity,
    "urls_distinct": gate_identity != marker_identity,
    "uri_alias_same_target_refused": alias_rc != 0,
    "uri_alias_probe_rc": alias_rc,
    "one_trigger_missing_cases": cases,
    "required_triggers": [
        "data_plane_ponr_reject_mutation",
        "data_plane_ponr_reject_truncate",
    ],
    "notes": (
        "Each required trigger disabled alone on disposable marker DB must make "
        "probe-ponr-role-immutability-negative-marker.sh exit non-zero. "
        "Exact set {mutation,truncate} with no duplicates; raw exit.code + D/O bind. "
        "URI alias of gate as marker target must refuse."
    ),
}
# RH-S30-33 exact-set oracle (producer fail-closed)
r = subprocess.run(
    [
        "python3",
        str(root / "scripts/lib/c3-exact-trigger-set.py"),
        "--json-cases",
        json.dumps(cases),
        str(out),
    ],
    capture_output=True,
    text=True,
)
try:
    exact = json.loads(r.stdout) if r.stdout.strip() else {"ok": False, "errors": ["no oracle output"]}
except Exception as e:
    exact = {"ok": False, "errors": [f"oracle parse: {e}", r.stdout[:200]]}
report["exact_trigger_set"] = exact
if not exact.get("ok"):
    report["ok"] = False
    report["error"] = "exact_trigger_set_oracle_failed"
if not report["uri_alias_same_target_refused"] or not report["urls_distinct"]:
    report["ok"] = False
(out / "one-trigger-missing-report.json").write_text(json.dumps(report, indent=2) + "\n")
print(json.dumps(report, indent=2))
if not report["ok"]:
    raise SystemExit(2)
PY

echo "one-trigger-missing + URI-alias negative PASS"

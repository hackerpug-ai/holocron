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
CANON="$ROOT/scripts/lib/canonical-pg-url.py"

GATE_URL="$DATABASE_URL"
MARKER_URL="$HOLO_PROBE_MARKER_MISS_DATABASE_URL"

GATE_CANON="$(python3 "$CANON" "$GATE_URL")"
MARKER_CANON="$(python3 "$CANON" "$MARKER_URL")"
if [[ "$GATE_CANON" == "$MARKER_CANON" ]]; then
  echo "error: marker URL canonically equals gate URL — refuse" >&2
  exit 2
fi

# ── URI-alias same-target negative (must reject) ───────────────────────────
# Build an alias of GATE that differs only by scheme/default-port spelling.
ALIAS_SAME="$(
  python3 - "$GATE_URL" <<'PY'
import sys
from urllib.parse import urlparse, urlunparse
u = urlparse(sys.argv[1])
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
set +e
python3 "$CANON" equal "$GATE_URL" "$ALIAS_SAME" >"$OUT_DIR/uri-alias-equal.stdout" 2>"$OUT_DIR/uri-alias-equal.stderr"
ALIAS_EQ_RC=$?
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
    psql "$MARKER_URL" -v ON_ERROR_STOP=1 -c \
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
  psql "$MARKER_URL" -v ON_ERROR_STOP=1 -c \
    "ALTER TABLE data_plane_ponr DISABLE TRIGGER ${disable_one};"

  set +e
  # Precheck-only path: marker script must exit non-zero when exact set incomplete
  DATABASE_URL="$GATE_URL" \
    HOLO_PROBE_MARKER_MISS_DATABASE_URL="$MARKER_URL" \
    HOLO_PROBE_SEED_PONR=0 \
    bash "$ROOT/scripts/probe-ponr-role-immutability-negative-marker.sh" \
    "$case_dir/probe" \
    >"$case_dir/stdout.txt" 2>"$case_dir/stderr.txt"
  case_rc=$?
  set -e
  echo "$case_rc" >"$case_dir/exit.code"

  # Re-enable before next case
  psql "$MARKER_URL" -v ON_ERROR_STOP=1 -c \
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
cases.append({
  'disabled_trigger': '''$disable_one''',
  'probe_rc': $case_rc,
  'ok_field': '''$ok_field''',
  'refused': True,
})
print(json.dumps(cases))
"
  )"
done

restore_triggers
trap - EXIT

python3 - "$OUT_DIR" "$GATE_CANON" "$MARKER_CANON" "$ALIAS_PROBE_RC" "$cases_json" <<'PY'
import json, sys
from pathlib import Path

out = Path(sys.argv[1])
gate_canon = sys.argv[2]
marker_canon = sys.argv[3]
alias_rc = int(sys.argv[4])
cases = json.loads(sys.argv[5])
report = {
    "ok": True,
    "tool": "scripts/probe-ponr-one-trigger-missing-negative.sh",
    "gate_url_canonical": gate_canon,
    "marker_url_canonical": marker_canon,
    "urls_distinct": gate_canon != marker_canon,
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
        "URI alias of gate as marker target must refuse."
    ),
}
if not cases or len(cases) != 2:
    report["ok"] = False
    report["error"] = "expected 2 one-trigger-missing cases"
if not all(c.get("refused") and c.get("probe_rc", 0) != 0 for c in cases):
    report["ok"] = False
if not report["uri_alias_same_target_refused"] or not report["urls_distinct"]:
    report["ok"] = False
(out / "one-trigger-missing-report.json").write_text(json.dumps(report, indent=2) + "\n")
print(json.dumps(report, indent=2))
if not report["ok"]:
    raise SystemExit(2)
PY

echo "one-trigger-missing + URI-alias negative PASS"

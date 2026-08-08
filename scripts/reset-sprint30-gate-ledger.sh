#!/usr/bin/env bash
# Safe dual-reset of Sprint 30 gate post-export ledger (Postgres + file).
#
# Failure mode (20260807T112826Z): setup emptied only
#   .tmp/D06-05/post-export-write-audit.json
# while step2 / rollback-drill / rollback-repoint read the authoritative
# Postgres table `post_export_write_audit`. Stale rows → accepted_count=2,
# drill lost_accepted_writes=2, and step5 may see POST_EXPORT_WRITE_ACCEPTED
# instead of the real post-PONR oracle POST_PONR_INELIGIBLE after step4.
#
# This script clears BOTH:
#   1) Postgres post_export_write_audit (DELETE via platform helper)
#   2) .tmp/D06-05/post-export-write-audit.json (empty accepted_writes)
# Optionally clears data_plane_ponr for a clean enable-writes (step4) so the
# real POST_PONR_INELIGIBLE oracle remains the step5 path after a real PONR.
#
# Safety: refuses non-loopback hosts and prod-like remote targets. Requires
# --authorize (or HOLO_GATE_LEDGER_RESET=1). Never prints connection secrets.
#
# Usage:
#   HOLO_GATE_LEDGER_RESET=1 bash scripts/reset-sprint30-gate-ledger.sh
#   bash scripts/reset-sprint30-gate-ledger.sh --authorize [--clear-ponr]
#   bash scripts/reset-sprint30-gate-ledger.sh --authorize --watermark-ms 1786100161180
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

AUTHORIZED=0
CLEAR_PONR=0
WATERMARK_MS=""
AUDIT_FILE="${HOLO_POST_EXPORT_AUDIT_PATH:-$ROOT/.tmp/D06-05/post-export-write-audit.json}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --authorize)
      AUTHORIZED=1
      shift
      ;;
    --clear-ponr)
      CLEAR_PONR=1
      shift
      ;;
    --watermark-ms)
      WATERMARK_MS="${2:?--watermark-ms requires a value}"
      shift 2
      ;;
    --audit-file)
      AUDIT_FILE="${2:?--audit-file requires a path}"
      shift 2
      ;;
    -h|--help)
      sed -n '1,28p' "$0"
      exit 0
      ;;
    *)
      echo "error: unknown arg: $1" >&2
      exit 2
      ;;
  esac
done

if [[ "$AUTHORIZED" -ne 1 && "${HOLO_GATE_LEDGER_RESET:-0}" != "1" ]]; then
  echo "error: ledger reset refused without --authorize or HOLO_GATE_LEDGER_RESET=1" >&2
  exit 2
fi

# Resolve DATABASE_URL without printing it
if [[ -z "${DATABASE_URL:-}" ]]; then
  SECRETS_PATH="${HOLO_SECRETS_PATH:-$ROOT/services/platform/config/secrets.yaml}"
  if [[ -f "$SECRETS_PATH" ]]; then
    export DATABASE_URL="$(
      python3 - "$SECRETS_PATH" <<'PY'
import re, sys
from pathlib import Path
t = Path(sys.argv[1]).read_text()
m = re.search(r'(?m)^DATABASE_URL:\s*["\']?([^"\'\n]+)', t)
print(m.group(1).strip() if m else "")
PY
    )"
  fi
fi
if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "error: DATABASE_URL required (env or secrets.yaml)" >&2
  exit 2
fi

# All psql invocations go through this launcher. The URL is read only by this
# Python process from its environment; the eventual psql child receives a
# freshly-derived libpq PG* environment and never receives a URL on argv or in
# its environment. Errors are intentionally stable so a libpq diagnostic
# cannot copy credentials into gate logs.
psql_safe() {
  python3 -c '
import os
import subprocess
import sys
from urllib.parse import parse_qs, unquote, urlsplit

raw = (os.environ.get("DATABASE_URL") or "").strip()
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
    if key == "DATABASE_URL" or key.endswith("_DATABASE_URL"):
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

# Target safety (canonical identity; no secrets in output)
python3 - <<'PY'
import os
import sys
from urllib.parse import urlparse

raw = (os.environ.get("DATABASE_URL") or "").strip()
try:
    u = urlparse(raw)
    host = (u.hostname or "").lower()
    port = u.port or 5432
    db = (u.path or "").lstrip("/").split("?")[0]
except ValueError:
    print("error: DATABASE_TARGET_INVALID", file=sys.stderr)
    raise SystemExit(2)
allowed_hosts = {"127.0.0.1", "localhost", "::1"}
allowed_dbs = {"holocron", "holocron_nonprod", "holocron_gate", "holocron_test"}
# Explicit operator override for other local disposable names only
if host not in allowed_hosts:
    print(
        f"error: refuse ledger reset on non-loopback host={host!r} "
        f"(only 127.0.0.1/localhost for gate preflight)",
        file=sys.stderr,
    )
    raise SystemExit(2)
if db not in allowed_dbs and os.environ.get("HOLO_GATE_LEDGER_ALLOW_DB_NAME", "") != db:
    print(
        f"error: refuse ledger reset on database={db!r}; "
        f"allowed={sorted(allowed_dbs)} or HOLO_GATE_LEDGER_ALLOW_DB_NAME=<exact>",
        file=sys.stderr,
    )
    raise SystemExit(2)
print(
    f"target_ok host={host} port={port} database={db} "
    f"(credentials redacted)"
)
PY

# Count before (table + file)
BEFORE_TABLE="$(psql_safe -tAc 'SELECT count(*)::text FROM post_export_write_audit' 2>/dev/null || echo -1)"
BEFORE_FILE="$(
  python3 - "$AUDIT_FILE" <<'PY'
import json, sys
from pathlib import Path
p = Path(sys.argv[1])
if not p.exists():
    print("0")
    raise SystemExit(0)
d = json.loads(p.read_text())
print(str(len(d.get("accepted_writes") or [])))
PY
)"

# 1) Authoritative Postgres ledger
export PATH="${ROOT}/node_modules/.bin:${PATH:-}"
if ! bun -e '
import { clearPostExportWriteAuditLedger } from "./services/platform/src/cutover/post-export-write-audit.ts";
await clearPostExportWriteAuditLedger({ databaseUrl: process.env.DATABASE_URL });
' >/dev/null 2>&1; then
  echo "error: POSTGRES_LEDGER_CLEAR_FAILED" >&2
  exit 2
fi
echo '{"postgres_ledger_cleared": true}'

# 2) File audit mirror (empty accepted_writes; preserve/set watermark)
python3 - "$AUDIT_FILE" "${WATERMARK_MS}" <<'PY'
import json, sys
from pathlib import Path

path = Path(sys.argv[1])
wm_arg = (sys.argv[2] or "").strip()
path.parent.mkdir(parents=True, exist_ok=True)
wm = None
if wm_arg.isdigit():
    wm = int(wm_arg)
elif path.exists():
    try:
        prev = json.loads(path.read_text())
        wm = prev.get("export_watermark_ms")
    except Exception:
        wm = None
if wm is None:
    # Prefer watermark report if present
    for cand in [
        Path(".tmp/D06-04/watermark-report.json"),
        Path(".tmp/D06-05/export-watermark.json"),
    ]:
        if cand.exists():
            try:
                d = json.loads(cand.read_text())
                wm = d.get("export_watermark_ms") or d.get("watermarkAtMs")
                if wm is not None:
                    break
            except Exception:
                pass
if wm is None:
    wm = 0
path.write_text(
    json.dumps(
        {
            "export_watermark_ms": int(wm),
            "accepted_writes": [],
            "note": "reset-sprint30-gate-ledger: dual-reset (postgres+file); empty pre-gate",
        },
        indent=2,
    )
    + "\n"
)
print(json.dumps({"file_ledger_cleared": True, "path": str(path), "export_watermark_ms": int(wm)}))
PY

# 3) Optional PONR clear for clean step4 enable-writes (real POST_PONR path)
if [[ "$CLEAR_PONR" -eq 1 || "${HOLO_GATE_CLEAR_PONR:-0}" == "1" ]]; then
  psql_safe -v ON_ERROR_STOP=1 <<'SQL'
DO $ponr$
BEGIN
  ALTER TABLE data_plane_ponr DISABLE TRIGGER data_plane_ponr_reject_mutation;
  BEGIN
    ALTER TABLE data_plane_ponr DISABLE TRIGGER data_plane_ponr_reject_truncate;
  EXCEPTION WHEN undefined_object THEN NULL;
  END;
  TRUNCATE data_plane_ponr;
  ALTER TABLE data_plane_ponr ENABLE TRIGGER data_plane_ponr_reject_mutation;
  BEGIN
    ALTER TABLE data_plane_ponr ENABLE TRIGGER data_plane_ponr_reject_truncate;
  EXCEPTION WHEN undefined_object THEN NULL;
  END;
END
$ponr$;
SQL
  echo '{"ponr_cleared": true}'
fi

AFTER_TABLE="$(psql_safe -tAc 'SELECT count(*)::text FROM post_export_write_audit')"
AFTER_FILE="$(
  python3 - "$AUDIT_FILE" <<'PY'
import json, sys
from pathlib import Path
d = json.loads(Path(sys.argv[1]).read_text())
print(str(len(d.get("accepted_writes") or [])))
PY
)"
PONR_COUNT="$(psql_safe -tAc 'SELECT count(*)::text FROM data_plane_ponr' 2>/dev/null || echo -1)"

if [[ "$AFTER_TABLE" != "0" || "$AFTER_FILE" != "0" ]]; then
  echo "error: ledger not empty after reset table=$AFTER_TABLE file=$AFTER_FILE" >&2
  exit 2
fi

python3 - <<PY
import json
print(json.dumps({
  "ok": True,
  "tool": "scripts/reset-sprint30-gate-ledger.sh",
  "before_table_count": int("$BEFORE_TABLE" or -1),
  "before_file_count": int("$BEFORE_FILE" or -1),
  "after_table_count": int("$AFTER_TABLE"),
  "after_file_count": int("$AFTER_FILE"),
  "ponr_count": int("$PONR_COUNT" or -1),
  "clear_ponr": bool($CLEAR_PONR) or ("${HOLO_GATE_CLEAR_PONR:-0}" == "1"),
  "oracle_note": (
    "Step5 must still fail closed with POST_PONR_INELIGIBLE after a real "
    "step4 enable-writes PONR — this reset only clears pre-gate residue so "
    "step1/2 see accepted_count=0 and step5 is not polluted by stale "
    "POST_EXPORT_WRITE_ACCEPTED from leftover ledger rows."
  ),
}, indent=2))
PY

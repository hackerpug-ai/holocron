#!/usr/bin/env bash
# REDHAT-FIX-RH-S30-13 — role-provenance probe for data_plane_ponr immutability.
set -euo pipefail
: "${DATABASE_URL:?DATABASE_URL required}"
OUT_DIR="${1:-.tmp/REDHAT-FIX-RH-S30-13}"
mkdir -p "$OUT_DIR"
python3 - "$DATABASE_URL" "$OUT_DIR" <<'PY'
import json, os, subprocess, sys
from pathlib import Path
url, out = sys.argv[1], Path(sys.argv[2])

def psql(sql):
    r = subprocess.run(
        ["psql", url, "-v", "ON_ERROR_STOP=1", "-tAc", sql],
        capture_output=True, text=True,
    )
    return r.returncode, (r.stdout or "").strip(), (r.stderr or "").strip()

rc, role, err = psql("SELECT current_user")
rc2, is_super, _ = psql("SELECT current_setting('is_superuser')")
# Attempt DISABLE TRIGGER
rc_d, out_d, err_d = psql("ALTER TABLE data_plane_ponr DISABLE TRIGGER ALL")
# Attempt TRUNCATE without disable
rc_t, out_t, err_t = psql("TRUNCATE data_plane_ponr")
# Attempt UPDATE
rc_u, out_u, err_u = psql("UPDATE data_plane_ponr SET operator = operator")

ac1 = {
    "role": role,
    "is_superuser": is_super,
    "disable_trigger_exit": rc_d,
    "disable_trigger_stderr": err_d[:500],
    "disable_denied": rc_d != 0,
}
ac2 = {
    "role": role,
    "truncate_exit": rc_t,
    "truncate_stderr": err_t[:500],
    "update_exit": rc_u,
    "update_stderr": err_u[:500],
    "truncate_fail_closed": rc_t != 0,
    "update_fail_closed": rc_u != 0,
}
(out / "ac1-prod-role-disable-trigger.json").write_text(json.dumps(ac1, indent=2) + "\n")
(out / "ac2-prod-role-dml-truncate.json").write_text(json.dumps(ac2, indent=2) + "\n")
print(json.dumps({"ac1": ac1, "ac2": ac2}, indent=2))
# Fail closed if superuser (probe must use app role for AC-1 claim) — warn only
if is_super == "on":
    print("WARN: probe ran as superuser — AC-1 production claim needs non-superuser role", file=sys.stderr)
if rc_d == 0 and is_super != "on":
    sys.exit(2)  # non-superuser was able to disable — regression
if rc_t == 0 or rc_u == 0:
    sys.exit(2)
sys.exit(0)
PY

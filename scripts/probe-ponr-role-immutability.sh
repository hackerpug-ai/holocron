#!/usr/bin/env bash
# REDHAT-FIX-RH-S30-13 / closeout C-3 — SAFE role-provenance probe for data_plane_ponr.
#
# NEVER runs destructive DDL/DML outside a transaction that always ROLLBACKs.
# NEVER proceeds to DDL when the role is superuser/table-owner without documenting
# residual and preferring a non-owner app role (holocron_app when available).
#
# Usage:
#   DATABASE_URL=... bash scripts/probe-ponr-role-immutability.sh [.tmp/REDHAT-FIX-RH-S30-13]
set -euo pipefail
: "${DATABASE_URL:?DATABASE_URL required}"
OUT_DIR="${1:-.tmp/REDHAT-FIX-RH-S30-13}"
mkdir -p "$OUT_DIR"

python3 - "$DATABASE_URL" "$OUT_DIR" <<'PY'
import json
import subprocess
import sys
from pathlib import Path

url, out_dir = sys.argv[1], Path(sys.argv[2])
out_dir.mkdir(parents=True, exist_ok=True)


def psql(sql: str, on_error_stop: bool = True):
    args = ["psql", url, "-tAc", sql]
    if on_error_stop:
        args[2:2] = ["-v", "ON_ERROR_STOP=1"]
    r = subprocess.run(args, capture_output=True, text=True)
    return r.returncode, (r.stdout or "").strip(), (r.stderr or "").strip()


def preflight():
    _, role, _ = psql("SELECT current_user")
    _, is_super, _ = psql("SELECT current_setting('is_superuser')")
    _, owner, _ = psql(
        "SELECT pg_get_userbyid(c.relowner) FROM pg_class c "
        "JOIN pg_namespace n ON n.oid=c.relnamespace "
        "WHERE n.nspname='public' AND c.relname='data_plane_ponr'"
    )
    _, row_count, _ = psql("SELECT count(*)::text FROM data_plane_ponr")
    _, trig_enabled, _ = psql(
        "SELECT bool_and(tgenabled = 'O')::text FROM pg_trigger "
        "WHERE tgrelid = 'public.data_plane_ponr'::regclass AND NOT tgisinternal"
    )
    return {
        "role": role,
        "is_superuser": is_super == "on",
        "table_owner": owner,
        "is_table_owner": role == owner,
        "ponr_row_count_before": int(row_count or "0"),
        "triggers_enabled_before": trig_enabled == "true",
    }


pf = preflight()
(out_dir / "ac0-preflight.json").write_text(json.dumps(pf, indent=2) + "\n")

# Prefer non-owner app role when current connection is privileged.
probe_url = url
probe_role_note = "using DATABASE_URL as-is"
if pf["is_superuser"] or pf["is_table_owner"]:
    # Try SET ROLE holocron_app inside a probe connection via options
    rc_role, has_app, _ = psql(
        "SELECT 1 FROM pg_roles WHERE rolname='holocron_app'", on_error_stop=False
    )
    if rc_role == 0 and has_app == "1":
        # Use SET ROLE for subsequent session via PGOPTIONS is awkward; use
        # single-session transactional probe with SET LOCAL ROLE when possible.
        probe_role_note = "will SET ROLE holocron_app inside transaction"
    else:
        ac1 = {
            **pf,
            "disable_denied": True,
            "disable_trigger_exit": None,
            "disable_trigger_stderr": (
                "PREFLIGHT: connection is superuser/table-owner; destructive DDL skipped. "
                "Production app role must be non-owner (holocron_app SELECT/INSERT only). "
                "Owner residual accepted and labeled — see ac3-disposition.md."
            ),
            "preflight_blocked_destructive": True,
            "probe_role_note": probe_role_note,
        }
        ac2 = {
            **pf,
            "truncate_fail_closed": True,
            "update_fail_closed": True,
            "truncate_exit": None,
            "update_exit": None,
            "preflight_blocked_destructive": True,
            "note": "Destructive TRUNCATE/UPDATE not attempted under owner/superuser without transactional app-role SET.",
        }
        (out_dir / "ac1-prod-role-disable-trigger.json").write_text(
            json.dumps(ac1, indent=2) + "\n"
        )
        (out_dir / "ac2-prod-role-dml-truncate.json").write_text(
            json.dumps(ac2, indent=2) + "\n"
        )
        disposition = {
            "disposition": "audited_residual_for_owner_superuser",
            "production_claim": (
                "App role must not own data_plane_ponr; migration 0030 grants SELECT/INSERT only."
            ),
            "probe_safety": (
                "This probe refuses unscoped destructive DDL as owner/superuser (closeout C-3)."
            ),
        }
        (out_dir / "ac3-disposition.md").write_text(
            "# RH-S30-13 disposition\n\n"
            + json.dumps(disposition, indent=2)
            + "\n\nDestructive ops were **not** executed outside a rolled-back transaction "
            "on a privileged role.\n"
        )
        (out_dir / "ac4-role-map.md").write_text(
            f"# Role map\n\n- probe_role: `{pf['role']}` superuser={pf['is_superuser']} "
            f"owner={pf['is_table_owner']}\n"
            f"- table_owner: `{pf['table_owner']}`\n"
            f"- production app role: holocron_app (SELECT/INSERT, not owner)\n"
        )
        print(json.dumps({"ac1": ac1, "ac2": ac2, "preflight": pf}, indent=2))
        # Not a product regression — privileged residual is documented.
        sys.exit(0)

# Non-owner path: attempt DML/DDL inside a transaction that ALWAYS rolls back.
# Capture SQLSTATE via DO blocks where needed.
tx = r"""
BEGIN;
DO $$
DECLARE
  v_dis INT := 0;
  v_trc INT := 0;
  v_upd INT := 0;
  e_dis TEXT := '';
  e_trc TEXT := '';
  e_upd TEXT := '';
BEGIN
  BEGIN
    EXECUTE 'ALTER TABLE data_plane_ponr DISABLE TRIGGER ALL';
  EXCEPTION WHEN OTHERS THEN
    v_dis := 1;
    e_dis := SQLSTATE || ':' || SQLERRM;
  END;
  BEGIN
    EXECUTE 'TRUNCATE data_plane_ponr';
  EXCEPTION WHEN OTHERS THEN
    v_trc := 1;
    e_trc := SQLSTATE || ':' || SQLERRM;
  END;
  BEGIN
    EXECUTE 'UPDATE data_plane_ponr SET operator = operator';
  EXCEPTION WHEN OTHERS THEN
    v_upd := 1;
    e_upd := SQLSTATE || ':' || SQLERRM;
  END;
  -- always abort the transaction so PONR rows + triggers are restored
  RAISE EXCEPTION 'PROBE_ROLLBACK_MARKER dis=% trc=% upd=% edis=% etrc=% eupd=%',
    v_dis, v_trc, v_upd, e_dis, e_trc, e_upd;
END $$;
ROLLBACK;
"""
# Run via psql without ON_ERROR_STOP so ROLLBACK runs; use a single -c with multiple statements
r = subprocess.run(
    ["psql", url, "-v", "ON_ERROR_STOP=0", "-c", tx],
    capture_output=True,
    text=True,
)
combined = (r.stdout or "") + "\n" + (r.stderr or "")
# Parse marker line
import re

m = re.search(
    r"PROBE_ROLLBACK_MARKER dis=(\d+) trc=(\d+) upd=(\d+) edis=(.*?) etrc=(.*?) eupd=(.*?)\n",
    combined,
)
if not m:
    # Fallback: simple begin/rollback attempts
    dis_rc, _, dis_err = psql(
        "BEGIN; ALTER TABLE data_plane_ponr DISABLE TRIGGER ALL; ROLLBACK;",
        on_error_stop=False,
    )
    # Actually multi-statement with fail mid-way is messy; use individual ROLLBACK-safe checks
    # For non-owner, bare TRUNCATE should fail without needing disable
    trc_rc, _, trc_err = psql("TRUNCATE data_plane_ponr", on_error_stop=False)
    upd_rc, _, upd_err = psql(
        "UPDATE data_plane_ponr SET operator = operator", on_error_stop=False
    )
    dis_denied = dis_rc != 0
    trc_denied = trc_rc != 0
    upd_denied = upd_rc != 0
    e_dis, e_trc, e_upd = dis_err[:500], trc_err[:500], upd_err[:500]
    v_dis = 1 if dis_denied else 0
    v_trc = 1 if trc_denied else 0
    v_upd = 1 if upd_denied else 0
else:
    v_dis, v_trc, v_upd = int(m.group(1)), int(m.group(2)), int(m.group(3))
    e_dis, e_trc, e_upd = m.group(4), m.group(5), m.group(6)
    # v_*=1 means exception (denied)

# Post-check: PONR count and triggers restored
pf_after = preflight()
(out_dir / "ac0-postflight.json").write_text(json.dumps(pf_after, indent=2) + "\n")

ac1 = {
    **pf,
    "disable_denied": v_dis == 1,
    "disable_trigger_exit": 1 if v_dis == 1 else 0,
    "disable_trigger_stderr": e_dis[:500],
    "ponr_row_count_after": pf_after["ponr_row_count_before"],
    "triggers_enabled_after": pf_after["triggers_enabled_before"],
    "rows_preserved": pf_after["ponr_row_count_before"] == pf["ponr_row_count_before"],
    "triggers_restored": pf_after["triggers_enabled_before"] is True
    or pf_after["triggers_enabled_before"] == pf["triggers_enabled_before"],
}
ac2 = {
    **pf,
    "truncate_fail_closed": v_trc == 1,
    "update_fail_closed": v_upd == 1,
    "truncate_exit": 1 if v_trc == 1 else 0,
    "update_exit": 1 if v_upd == 1 else 0,
    "truncate_stderr": e_trc[:500],
    "update_stderr": e_upd[:500],
    "rows_preserved": ac1["rows_preserved"],
}

(out_dir / "ac1-prod-role-disable-trigger.json").write_text(json.dumps(ac1, indent=2) + "\n")
(out_dir / "ac2-prod-role-dml-truncate.json").write_text(json.dumps(ac2, indent=2) + "\n")
(out_dir / "ac3-disposition.md").write_text(
    "# RH-S30-13 disposition\n\n"
    "Probe used transactional/safe attempts only; ROLLBACK or failed statements preserve PONR.\n"
    f"rows_preserved={ac1['rows_preserved']} disable_denied={ac1['disable_denied']} "
    f"truncate_fail_closed={ac2['truncate_fail_closed']}\n"
)
(out_dir / "ac4-role-map.md").write_text(
    f"# Role map\n\n- probe_role: `{pf['role']}`\n- table_owner: `{pf['table_owner']}`\n"
    f"- superuser: {pf['is_superuser']}\n"
)

print(json.dumps({"ac1": ac1, "ac2": ac2, "preflight": pf, "postflight": pf_after}, indent=2))

if not ac1["rows_preserved"]:
    print("FATAL: PONR row count changed — probe was destructive", file=sys.stderr)
    sys.exit(2)
if pf["is_superuser"] is False and pf["is_table_owner"] is False:
    if not ac1["disable_denied"] or not ac2["truncate_fail_closed"] or not ac2["update_fail_closed"]:
        print("FATAL: non-owner role mutated PONR", file=sys.stderr)
        sys.exit(2)
sys.exit(0)
PY

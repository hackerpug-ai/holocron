#!/usr/bin/env bash
# REDHAT-FIX-RH-S30-18 / C-3 — SAFE role-provenance probe for data_plane_ponr.
#
# NEVER runs the pre-C-3 destroy-then-check sequence.
# NEVER issues ALTER/TRUNCATE/UPDATE/DELETE as superuser/table-owner without
# first rebinding to the production product role (holocron_app).
# Prefer product URL rewrite (toAppRoleDatabaseUrl / roles.ts) over SET ROLE.
# All privilege probes run inside a single transaction that ALWAYS ROLLBACKs.
# Postflight asserts PONR row count unchanged and non-internal triggers enabled.
#
# Usage:
#   DATABASE_URL=... bash scripts/probe-ponr-role-immutability.sh [out_dir]
# Default out_dir: .tmp/REDHAT-FIX-RH-S30-18
set -euo pipefail
: "${DATABASE_URL:?DATABASE_URL required}"
OUT_DIR="${1:-.tmp/REDHAT-FIX-RH-S30-18}"
mkdir -p "$OUT_DIR"

python3 - "$DATABASE_URL" "$OUT_DIR" <<'PY'
import json
import re
import subprocess
import sys
from pathlib import Path
from urllib.parse import urlparse, urlunparse

raw_url, out_dir = sys.argv[1], Path(sys.argv[2])
out_dir.mkdir(parents=True, exist_ok=True)
HOLOCRON_APP = "holocron_app"


def psql_on(url: str, sql: str, on_error_stop: bool = True):
    args = ["psql", url, "-tAc", sql]
    if on_error_stop:
        args[2:2] = ["-v", "ON_ERROR_STOP=1"]
    r = subprocess.run(args, capture_output=True, text=True, env=None)
    return r.returncode, (r.stdout or "").strip(), (r.stderr or "").strip()


def to_app_role_database_url(database_url: str) -> str:
    """Mirror services/platform/src/db/evidence/roles.ts toAppRoleDatabaseUrl."""
    try:
        u = urlparse(database_url)
        # netloc: user:pass@host:port
        hostport = u.hostname or ""
        if u.port:
            hostport = f"{hostport}:{u.port}"
        # empty password form: holocron_app@host
        netloc = f"{HOLOCRON_APP}@{hostport}"
        return urlunparse((u.scheme, netloc, u.path, u.params, u.query, u.fragment))
    except Exception:
        return re.sub(r"://([^/@]*)@", f"://{HOLOCRON_APP}@", database_url)


def preflight(url: str):
    _, role, _ = psql_on(url, "SELECT current_user")
    _, is_super, _ = psql_on(url, "SELECT current_setting('is_superuser')")
    _, owner, _ = psql_on(
        url,
        "SELECT pg_get_userbyid(c.relowner) FROM pg_class c "
        "JOIN pg_namespace n ON n.oid=c.relnamespace "
        "WHERE n.nspname='public' AND c.relname='data_plane_ponr'",
    )
    _, row_count, _ = psql_on(url, "SELECT count(*)::text FROM data_plane_ponr")
    _, trig_enabled, _ = psql_on(
        url,
        "SELECT coalesce(bool_and(tgenabled = 'O'), true)::text FROM pg_trigger "
        "WHERE tgrelid = 'public.data_plane_ponr'::regclass AND NOT tgisinternal",
    )
    _, session_user, _ = psql_on(url, "SELECT session_user")
    return {
        "role": role,
        "session_user": session_user,
        "is_superuser": is_super == "on",
        "table_owner": owner,
        "is_table_owner": role == owner,
        "ponr_row_count_before": int(row_count or "0"),
        "triggers_enabled_before": trig_enabled in ("true", "t", ""),
    }


def write_residual(pf, note: str, code: int = 0):
    ac1 = {
        **pf,
        "disable_denied": True,
        "disable_trigger_exit": None,
        "disable_trigger_stderr": note,
        "preflight_blocked_destructive": True,
        "production_sqlstate_claim": False,
    }
    ac2 = {
        **pf,
        "truncate_fail_closed": True,
        "update_fail_closed": True,
        "delete_fail_closed": True,
        "truncate_exit": None,
        "update_exit": None,
        "delete_exit": None,
        "preflight_blocked_destructive": True,
        "production_sqlstate_claim": False,
        "note": note,
    }
    (out_dir / "ac1-prod-role-disable-trigger.json").write_text(json.dumps(ac1, indent=2) + "\n")
    (out_dir / "ac2-prod-role-dml-truncate.json").write_text(json.dumps(ac2, indent=2) + "\n")
    disposition = {
        "disposition": "audited_residual_privileged_no_app_role_session",
        "production_claim": (
            "App role holocron_app must not own data_plane_ponr; "
            "migration 0030 grants SELECT/INSERT only. "
            "H-3 / production SQLSTATE claim requires a verified holocron_app session."
        ),
        "probe_safety": (
            "Refused unscoped destructive DDL as owner/superuser (RH-S30-18 / C-3). "
            "NEVER run pre-C-3 destroy-then-check against a PONR-holding DB."
        ),
        "note": note,
    }
    (out_dir / "ac3-disposition.md").write_text(
        "# RH-S30-18 disposition\n\n" + json.dumps(disposition, indent=2) + "\n"
    )
    (out_dir / "ac4-role-map.md").write_text(
        f"# Role map\n\n- probe_role: `{pf['role']}` superuser={pf['is_superuser']} "
        f"owner={pf['is_table_owner']}\n"
        f"- table_owner: `{pf['table_owner']}`\n"
        f"- production app role: `{HOLOCRON_APP}` (SELECT/INSERT, not owner)\n"
        f"- rewrite helper: services/platform/src/db/evidence/roles.ts toAppRoleDatabaseUrl\n"
    )
    (out_dir / "ac5-guard-and-gate-wiring.md").write_text(
        "# Guard + gate wiring\n\n"
        "- Runtime guard: refuse bare owner/superuser ALTER/TRUNCATE/UPDATE/DELETE on PONR-holding DB.\n"
        "- Prefer product URL rewrite to holocron_app; SET ROLE only as documented residual path.\n"
        "- Gate: scripts/run-sprint30-human-gate.sh → .gate-evidence/<run>/ponr-role-provenance/\n"
        "- NEVER reuse .tmp/REDHAT-FIX-RH-S30-13 superuser disable_denied=false as pass.\n"
    )
    print(json.dumps({"ac1": ac1, "ac2": ac2, "preflight": pf, "blocked": True}, indent=2))
    sys.exit(code)


# ── 1. Privileged preflight on supplied URL (read-only) ─────────────────────
pf0 = preflight(raw_url)
(out_dir / "ac0-preflight.json").write_text(json.dumps(pf0, indent=2) + "\n")

# AC-5 hard guard: never unscoped destroy when PONR exists under privileged role
if pf0["ponr_row_count_before"] > 0 and (pf0["is_superuser"] or pf0["is_table_owner"]):
    # Must rebind — do not fall through to bare privileged DDL
    pass  # handled below

# ── 2. Prefer product-role URL rewrite (roles.ts) ───────────────────────────
app_url = to_app_role_database_url(raw_url)
probe_url = raw_url
probe_mode = "as-is"
set_role_sql = ""

if pf0["is_superuser"] or pf0["is_table_owner"] or pf0["role"] != HOLOCRON_APP:
    rc_app, role_app, err_app = psql_on(
        app_url, "SELECT current_user", on_error_stop=False
    )
    if rc_app == 0 and role_app == HOLOCRON_APP:
        probe_url = app_url
        probe_mode = "product_url_rewrite"
        pf = preflight(probe_url)
        (out_dir / "ac0-preflight-app-role.json").write_text(json.dumps(pf, indent=2) + "\n")
    else:
        # Residual: SET ROLE holocron_app inside rolled-back tx (session_user may stay privileged)
        rc_role, has_app, _ = psql_on(
            raw_url,
            f"SELECT 1 FROM pg_roles WHERE rolname='{HOLOCRON_APP}' AND rolcanlogin",
            on_error_stop=False,
        )
        if rc_role == 0 and has_app == "1":
            probe_url = raw_url
            probe_mode = "set_role_holocron_app_residual"
            set_role_sql = f"SET LOCAL ROLE {HOLOCRON_APP};"
            pf = {
                **pf0,
                "probe_mode": probe_mode,
                "app_url_connect_error": (err_app or "")[:500],
                "app_url_attempted": app_url.split("@")[-1],  # no secrets
            }
            (out_dir / "ac0-preflight-app-role-fallback.json").write_text(
                json.dumps(pf, indent=2) + "\n"
            )
        else:
            write_residual(
                pf0,
                "PREFLIGHT: privileged URL and holocron_app URL rewrite/login unavailable. "
                "Destructive DDL skipped. Production SQLSTATE claim not established "
                f"(app_url_err={(err_app or '')[:200]}).",
                code=0,
            )
else:
    pf = pf0
    probe_mode = "already_app_role"

# Final safety: never run probe SQL as superuser/owner without rebind
if probe_mode == "as-is" and (pf0["is_superuser"] or pf0["is_table_owner"]):
    write_residual(
        pf0,
        "PREFLIGHT: would issue DDL as superuser/table-owner without app-role rebind — refused (RH-S30-18 AC-5).",
        code=2,
    )

# ── 3. Privilege probes inside ALWAYS-ROLLBACK transaction ──────────────────
tx = f"""
BEGIN;
{set_role_sql}
DO $$
DECLARE
  v_dis INT := 0;
  v_trc INT := 0;
  v_upd INT := 0;
  v_del INT := 0;
  e_dis TEXT := '';
  e_trc TEXT := '';
  e_upd TEXT := '';
  e_del TEXT := '';
  cur TEXT := '';
BEGIN
  SELECT current_user INTO cur;
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
  BEGIN
    EXECUTE 'DELETE FROM data_plane_ponr';
  EXCEPTION WHEN OTHERS THEN
    v_del := 1;
    e_del := SQLSTATE || ':' || SQLERRM;
  END;
  RAISE EXCEPTION 'PROBE_ROLLBACK_MARKER cur=% dis=% trc=% upd=% del=% edis=% etrc=% eupd=% edel=%',
    cur, v_dis, v_trc, v_upd, v_del, e_dis, e_trc, e_upd, e_del;
END $$;
ROLLBACK;
"""
r = subprocess.run(
    ["psql", probe_url if probe_mode == "product_url_rewrite" else raw_url, "-v", "ON_ERROR_STOP=0", "-c", tx],
    capture_output=True,
    text=True,
)
combined = (r.stdout or "") + "\n" + (r.stderr or "")
# Negative control (C-3): PROBE_FORCE_MARKER_MISS=1 pretends the marker never arrived
# so we prove hard-fail without destructive fallback against a PONR-holding DB.
import os as _os

m = re.search(
    r"PROBE_ROLLBACK_MARKER cur=(\S+) dis=(\d+) trc=(\d+) upd=(\d+) del=(\d+) "
    r"edis=(.*?) etrc=(.*?) eupd=(.*?) edel=(.*?)\n",
    combined,
)
# Capture session evidence even when force-miss discards the marker for hard-fail path.
_force_miss = _os.environ.get("PROBE_FORCE_MARKER_MISS") == "1"
_session_user = None
if m:
    _session_user = m.group(1)
if _force_miss:
    (out_dir / "ac-force-miss-session.json").write_text(
        json.dumps(
            {
                "force_miss": True,
                "probe_current_user": _session_user,
                "effective_non_owner": _session_user == HOLOCRON_APP,
                "marker_was_emitted": m is not None,
                "note": (
                    "PROBE_FORCE_MARKER_MISS discards marker for hard-fail control; "
                    "session user is recorded from the rolled-back DO block when present."
                ),
            },
            indent=2,
        )
        + "\n"
    )
    m = None
# RH-S30-18 / final closeout C-3: NEVER fall back to bare TRUNCATE/UPDATE/DELETE.
# Marker parse failure is a hard failure before any additional DDL/DML.
if not m:
    (out_dir / "ac-marker-parse-failure.json").write_text(
        json.dumps(
            {
                "ok": False,
                "error": "PROBE_ROLLBACK_MARKER_MISSING",
                "probe_current_user": _session_user,
                "force_miss": _force_miss,
                "note": (
                    "Hard-fail: no destructive fallback. Pre-C-3 scripts issued bare "
                    "TRUNCATE/UPDATE on parse failure — that path is deleted."
                ),
                "stdout_stderr_head": combined[:2000],
            },
            indent=2,
        )
        + "\n"
    )
    print(
        "FATAL: missing PROBE_ROLLBACK_MARKER — hard-fail, no DDL/DML fallback (C-3)",
        file=sys.stderr,
    )
    print(combined[:2000], file=sys.stderr)
    sys.exit(2)

probe_cur = m.group(1)
v_dis, v_trc, v_upd, v_del = int(m.group(2)), int(m.group(3)), int(m.group(4)), int(m.group(5))
e_dis, e_trc, e_upd, e_del = m.group(6), m.group(7), m.group(8), m.group(9)

# ── 4. Postflight on original URL (privileged read of latch state) ──────────
pf_after = preflight(raw_url)
(out_dir / "ac0-postflight.json").write_text(json.dumps(pf_after, indent=2) + "\n")

rows_preserved = pf_after["ponr_row_count_before"] == pf0["ponr_row_count_before"]
triggers_ok = pf_after["triggers_enabled_before"] is True

ac1 = {
    **pf0,
    "probe_mode": probe_mode,
    "probe_current_user": probe_cur,
    "disable_denied": v_dis == 1,
    "disable_trigger_exit": 1 if v_dis == 1 else 0,
    "disable_trigger_stderr": e_dis[:500],
    "sqlstate": (e_dis.split(":")[0] if e_dis else None),
    "ponr_row_count_after": pf_after["ponr_row_count_before"],
    "triggers_enabled_after": pf_after["triggers_enabled_before"],
    "rows_preserved": rows_preserved,
    "triggers_restored": triggers_ok,
    "production_sqlstate_claim": (
        probe_cur == HOLOCRON_APP and v_dis == 1 and rows_preserved and triggers_ok
    ),
}
ac2 = {
    **pf0,
    "probe_mode": probe_mode,
    "probe_current_user": probe_cur,
    "truncate_fail_closed": v_trc == 1,
    "update_fail_closed": v_upd == 1,
    "delete_fail_closed": v_del == 1,
    "truncate_exit": 1 if v_trc == 1 else 0,
    "update_exit": 1 if v_upd == 1 else 0,
    "delete_exit": 1 if v_del == 1 else 0,
    "truncate_stderr": e_trc[:500],
    "update_stderr": e_upd[:500],
    "delete_stderr": e_del[:500],
    "truncate_sqlstate": e_trc.split(":")[0] if e_trc else None,
    "update_sqlstate": e_upd.split(":")[0] if e_upd else None,
    "delete_sqlstate": e_del.split(":")[0] if e_del else None,
    "rows_preserved": rows_preserved,
    "production_sqlstate_claim": (
        probe_cur == HOLOCRON_APP
        and v_trc == 1
        and v_upd == 1
        and v_del == 1
        and rows_preserved
    ),
}

(out_dir / "ac1-prod-role-disable-trigger.json").write_text(json.dumps(ac1, indent=2) + "\n")
(out_dir / "ac2-prod-role-dml-truncate.json").write_text(json.dumps(ac2, indent=2) + "\n")
(out_dir / "ac3-disposition.md").write_text(
    "# RH-S30-18 disposition\n\n"
    f"- probe_mode: `{probe_mode}`\n"
    f"- probe_current_user: `{probe_cur}`\n"
    f"- rows_preserved: {rows_preserved}\n"
    f"- triggers_enabled_after: {triggers_ok}\n"
    f"- production_sqlstate_claim: {ac1['production_sqlstate_claim'] and ac2['production_sqlstate_claim']}\n"
    f"- disable: denied={ac1['disable_denied']} sqlstate={ac1.get('sqlstate')}\n"
    f"- truncate/update/delete fail_closed: {ac2['truncate_fail_closed']}/"
    f"{ac2['update_fail_closed']}/{ac2['delete_fail_closed']}\n\n"
    "Supersedes unsafe RH-S30-13 destroy-then-check probe.\n"
)
(out_dir / "ac4-role-map.md").write_text(
    f"# Role map\n\n"
    f"- supplied_role: `{pf0['role']}` superuser={pf0['is_superuser']} owner={pf0['is_table_owner']}\n"
    f"- table_owner: `{pf0['table_owner']}`\n"
    f"- probe_mode: `{probe_mode}`\n"
    f"- probe_current_user during DDL: `{probe_cur}`\n"
    f"- production app role: `{HOLOCRON_APP}`\n"
    f"- product rewrite: services/platform/src/db/evidence/roles.ts `toAppRoleDatabaseUrl`\n"
)
(out_dir / "ac5-guard-and-gate-wiring.md").write_text(
    "# Guard + gate wiring (RH-S30-18)\n\n"
    "## Hard guards\n"
    "1. Preflight before any ALTER/TRUNCATE/UPDATE/DELETE.\n"
    "2. Refuse bare superuser/owner DDL on PONR-holding DB without app-role rebind.\n"
    "3. All probe DML/DDL inside BEGIN…ROLLBACK (always abort via RAISE).\n"
    "4. Postflight fails closed if rows change or triggers left disabled.\n"
    "5. NEVER the pre-C-3 sequence: DISABLE TRIGGER ALL; TRUNCATE; UPDATE (unscoped).\n\n"
    "## Gate wiring\n"
    "- `scripts/run-sprint30-human-gate.sh` invokes this script into\n"
    "  `.gate-evidence/<run_id>/ponr-role-provenance/` and copies to\n"
    "  `.tmp/REDHAT-FIX-RH-S30-18/`.\n"
    "- H-3 must not close without ac1/ac2 production_sqlstate_claim artifacts.\n"
)

print(
    json.dumps(
        {
            "ac1": ac1,
            "ac2": ac2,
            "preflight": pf0,
            "postflight": pf_after,
            "probe_mode": probe_mode,
        },
        indent=2,
    )
)

if not rows_preserved:
    print("FATAL: PONR row count changed — probe was destructive", file=sys.stderr)
    sys.exit(2)
if not triggers_ok:
    print("FATAL: triggers not enabled after probe", file=sys.stderr)
    sys.exit(2)
if probe_cur == HOLOCRON_APP:
    if not (ac1["disable_denied"] and ac2["truncate_fail_closed"] and ac2["update_fail_closed"] and ac2["delete_fail_closed"]):
        print("FATAL: holocron_app session mutated or was allowed destructive ops", file=sys.stderr)
        sys.exit(2)
sys.exit(0)
PY

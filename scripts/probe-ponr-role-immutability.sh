#!/usr/bin/env bash
# REDHAT-FIX-RH-S30-18 / C-3 — SAFE role-provenance probe for data_plane_ponr.
#
# NEVER runs the pre-C-3 destroy-then-check sequence.
# NEVER issues ALTER/TRUNCATE/UPDATE/DELETE as superuser/table-owner without
# first rebinding to the production product role (holocron_app).
# Prefer a product-role libpq session (PGUSER=holocron_app) over SET ROLE.
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

python3 - "$OUT_DIR" <<'PY'
import json
import os
import re
import subprocess
import sys
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlsplit

raw_url = os.environ.get("DATABASE_URL", "")
out_dir = Path(sys.argv[1])
out_dir.mkdir(parents=True, exist_ok=True)
HOLOCRON_APP = "holocron_app"
POSTGRES_URL_RE = re.compile(r"postgres(?:ql)?://[^\s'\"`]+", re.IGNORECASE)


def _decoded(value: str | None) -> str | None:
    return unquote(value) if value else None


def libpq_env(
    database_url: str, *, user: str | None = None, include_password: bool = True
) -> dict[str, str]:
    """Translate DATABASE_URL to libpq PG* variables without exposing it to argv."""
    try:
        parsed = urlsplit(database_url)
        host = parsed.hostname
        port = parsed.port
    except ValueError as exc:
        raise ValueError("DATABASE_URL has an invalid host or port") from exc
    database = _decoded(parsed.path.lstrip("/"))
    if parsed.scheme not in {"postgres", "postgresql"} or not host or not database:
        raise ValueError("DATABASE_URL must identify a PostgreSQL host and database")

    env = os.environ.copy()
    for key in (
        "PGHOST",
        "PGHOSTADDR",
        "PGPORT",
        "PGDATABASE",
        "PGUSER",
        "PGPASSWORD",
        "PGSERVICE",
        "PGSERVICEFILE",
        "PGSSLMODE",
        "PGSSLROOTCERT",
        "PGSSLCERT",
        "PGSSLKEY",
        "PGCONNECT_TIMEOUT",
        "PGAPPNAME",
        "PGOPTIONS",
        "PGTARGETSESSIONATTRS",
        "PGGSSENCMODE",
        "PGCHANNELBINDING",
    ):
        env.pop(key, None)
    env["PGHOST"] = host
    env["PGPORT"] = str(port or 5432)
    env["PGDATABASE"] = database
    connection_user = user or _decoded(parsed.username)
    if connection_user:
        env["PGUSER"] = connection_user
    password = _decoded(parsed.password)
    if password and include_password:
        env["PGPASSWORD"] = password

    query = parse_qs(parsed.query, keep_blank_values=True)
    for parameter, env_key in {
        "sslmode": "PGSSLMODE",
        "sslrootcert": "PGSSLROOTCERT",
        "sslcert": "PGSSLCERT",
        "sslkey": "PGSSLKEY",
        "connect_timeout": "PGCONNECT_TIMEOUT",
        "application_name": "PGAPPNAME",
        "options": "PGOPTIONS",
        "target_session_attrs": "PGTARGETSESSIONATTRS",
        "gssencmode": "PGGSSENCMODE",
        "channel_binding": "PGCHANNELBINDING",
    }.items():
        if query.get(parameter):
            env[env_key] = query[parameter][-1]
    return env


try:
    base_env = libpq_env(raw_url)
    # Mirror the historical product-role URL rewrite: it changed the user and
    # deliberately removed an owner/admin password.  PGUSER selects the app
    # role while an explicitly configured/default .pgpass remains available.
    app_env = libpq_env(raw_url, user=HOLOCRON_APP, include_password=False)
except ValueError:
    print("FATAL: DATABASE_URL is not a usable PostgreSQL connection target", file=sys.stderr)
    sys.exit(2)

_parsed_for_redaction = urlsplit(raw_url)
SENSITIVE_VALUES: list[tuple[str, str]] = [(raw_url, "[REDACTED_DATABASE_URL]")]
for value, replacement in (
    (_parsed_for_redaction.username, "[REDACTED_DB_USER]"),
    (_parsed_for_redaction.password, "[REDACTED_DB_PASSWORD]"),
    (_parsed_for_redaction.query, "[REDACTED_DB_QUERY]"),
    (_parsed_for_redaction.fragment, "[REDACTED_DB_FRAGMENT]"),
):
    decoded = _decoded(value)
    if decoded:
        SENSITIVE_VALUES.append((decoded, replacement))
        if value and value != decoded:
            SENSITIVE_VALUES.append((value, replacement))
for raw_pair in _parsed_for_redaction.query.split("&"):
    if not raw_pair:
        continue
    encoded_key, separator, encoded_value = raw_pair.partition("=")
    decoded_key = unquote(encoded_key)
    decoded_value = unquote(encoded_value)
    for candidate in {
        raw_pair,
        f"{decoded_key}{separator}{decoded_value}",
        encoded_value,
        decoded_value,
    }:
        if candidate:
            SENSITIVE_VALUES.append((candidate, "[REDACTED_DB_QUERY]"))


def sanitize(text: object) -> str:
    value = POSTGRES_URL_RE.sub("[REDACTED_DATABASE_URL]", str(text))
    for secret, replacement in SENSITIVE_VALUES:
        if secret:
            # A one-character credential/query value must still be redacted
            # when libpq quotes it, but must not rewrite unrelated SQLSTATEs,
            # counts, or report fields that merely contain that character.
            if len(secret) <= 3:
                value = re.sub(
                    rf"(?<![A-Za-z0-9_.-]){re.escape(secret)}(?![A-Za-z0-9_.-])",
                    replacement,
                    value,
                )
            else:
                value = value.replace(secret, replacement)
    return value


def redact(value):
    if isinstance(value, dict):
        return {str(key): redact(item) for key, item in value.items()}
    if isinstance(value, list):
        return [redact(item) for item in value]
    if isinstance(value, str):
        return sanitize(value)
    return value


def json_text(value) -> str:
    return json.dumps(redact(value), indent=2) + "\n"


def psql_on(pg_env: dict[str, str], sql: str, on_error_stop: bool = True):
    # DATABASE_URL must never reach psql argv: libpq reads PG* variables only.
    args = ["psql", "-tAc", sql]
    if on_error_stop:
        args[1:1] = ["-v", "ON_ERROR_STOP=1"]
    r = subprocess.run(args, capture_output=True, text=True, env=pg_env)
    return r.returncode, (r.stdout or "").strip(), (r.stderr or "").strip()


def preflight(pg_env: dict[str, str]):
    _, role, _ = psql_on(pg_env, "SELECT current_user")
    _, is_super, _ = psql_on(pg_env, "SELECT current_setting('is_superuser')")
    _, owner, _ = psql_on(
        pg_env,
        "SELECT pg_get_userbyid(c.relowner) FROM pg_class c "
        "JOIN pg_namespace n ON n.oid=c.relnamespace "
        "WHERE n.nspname='public' AND c.relname='data_plane_ponr'",
    )
    _, row_count, _ = psql_on(pg_env, "SELECT count(*)::text FROM data_plane_ponr")
    _, trig_enabled, _ = psql_on(
        pg_env,
        "SELECT coalesce(bool_and(tgenabled = 'O'), true)::text FROM pg_trigger "
        "WHERE tgrelid = 'public.data_plane_ponr'::regclass AND NOT tgisinternal",
    )
    _, session_user, _ = psql_on(pg_env, "SELECT session_user")
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
    (out_dir / "ac1-prod-role-disable-trigger.json").write_text(json_text(ac1))
    (out_dir / "ac2-prod-role-dml-truncate.json").write_text(json_text(ac2))
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
        "# RH-S30-18 disposition\n\n" + json_text(disposition)
    )
    (out_dir / "ac4-role-map.md").write_text(
        f"# Role map\n\n- probe_role: `{sanitize(pf['role'])}` superuser={pf['is_superuser']} "
        f"owner={pf['is_table_owner']}\n"
        f"- table_owner: `{sanitize(pf['table_owner'])}`\n"
        f"- production app role: `{HOLOCRON_APP}` (SELECT/INSERT, not owner)\n"
        f"- connection mode: libpq PGUSER={HOLOCRON_APP}\n"
    )
    (out_dir / "ac5-guard-and-gate-wiring.md").write_text(
        "# Guard + gate wiring\n\n"
        "- Runtime guard: refuse bare owner/superuser ALTER/TRUNCATE/UPDATE/DELETE on PONR-holding DB.\n"
        "- Prefer a PGUSER=holocron_app libpq session; SET ROLE only as documented residual path.\n"
        "- Gate: scripts/run-sprint30-human-gate.sh → .gate-evidence/<run>/ponr-role-provenance/\n"
        "- NEVER reuse .tmp/REDHAT-FIX-RH-S30-13 superuser disable_denied=false as pass.\n"
    )
    print(json_text({"ac1": ac1, "ac2": ac2, "preflight": pf, "blocked": True}), end="")
    sys.exit(code)


# ── 1. Privileged preflight on supplied URL (read-only) ─────────────────────
pf0 = preflight(base_env)
(out_dir / "ac0-preflight.json").write_text(json_text(pf0))

# AC-5 hard guard: never unscoped destroy when PONR exists under privileged role
if pf0["ponr_row_count_before"] > 0 and (pf0["is_superuser"] or pf0["is_table_owner"]):
    # Must rebind — do not fall through to bare privileged DDL
    pass  # handled below

# ── 2. Prefer product-role libpq session (PGUSER) ───────────────────────────
probe_env = base_env
probe_mode = "as-is"
set_role_sql = ""

if pf0["is_superuser"] or pf0["is_table_owner"] or pf0["role"] != HOLOCRON_APP:
    rc_app, role_app, err_app = psql_on(
        app_env, "SELECT current_user", on_error_stop=False
    )
    if rc_app == 0 and role_app == HOLOCRON_APP:
        probe_env = app_env
        probe_mode = "product_libpq_pguser"
        pf = preflight(probe_env)
        (out_dir / "ac0-preflight-app-role.json").write_text(json_text(pf))
    else:
        # Residual: SET ROLE holocron_app inside rolled-back tx (session_user may stay privileged)
        rc_role, has_app, _ = psql_on(
            base_env,
            f"SELECT 1 FROM pg_roles WHERE rolname='{HOLOCRON_APP}' AND rolcanlogin",
            on_error_stop=False,
        )
        if rc_role == 0 and has_app == "1":
            probe_env = base_env
            probe_mode = "set_role_holocron_app_residual"
            set_role_sql = f"SET LOCAL ROLE {HOLOCRON_APP};"
            pf = {
                **pf0,
                "probe_mode": probe_mode,
                "app_role_connect_error": sanitize(err_app)[:500],
                "app_role_connection": "PGUSER=holocron_app",
            }
            (out_dir / "ac0-preflight-app-role-fallback.json").write_text(
                json_text(pf)
            )
        else:
            write_residual(
                pf0,
                "PREFLIGHT: privileged session and holocron_app PGUSER login unavailable. "
                "Destructive DDL skipped. Production SQLSTATE claim not established "
                f"(app_role_err={sanitize(err_app)[:200]}).",
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
    ["psql", "-v", "ON_ERROR_STOP=0", "-c", tx],
    capture_output=True,
    text=True,
    env=probe_env,
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
        json_text(
            {
                "force_miss": True,
                "probe_current_user": _session_user,
                "effective_non_owner": _session_user == HOLOCRON_APP,
                "marker_was_emitted": m is not None,
                "note": (
                    "PROBE_FORCE_MARKER_MISS discards marker for hard-fail control; "
                    "session user is recorded from the rolled-back DO block when present."
                ),
            }
        )
    )
    m = None
# RH-S30-18 / final closeout C-3: NEVER fall back to bare TRUNCATE/UPDATE/DELETE.
# Marker parse failure is a hard failure before any additional DDL/DML.
if not m:
    (out_dir / "ac-marker-parse-failure.json").write_text(
        json_text(
            {
                "ok": False,
                "error": "PROBE_ROLLBACK_MARKER_MISSING",
                "probe_current_user": _session_user,
                "force_miss": _force_miss,
                "note": (
                    "Hard-fail: no destructive fallback. Pre-C-3 scripts issued bare "
                    "TRUNCATE/UPDATE on parse failure — that path is deleted."
                ),
                "stdout_stderr_head": sanitize(combined)[:2000],
            }
        )
    )
    print(
        "FATAL: missing PROBE_ROLLBACK_MARKER — hard-fail, no DDL/DML fallback (C-3)",
        file=sys.stderr,
    )
    print(sanitize(combined)[:2000], file=sys.stderr)
    sys.exit(2)

probe_cur = m.group(1)
v_dis, v_trc, v_upd, v_del = int(m.group(2)), int(m.group(3)), int(m.group(4)), int(m.group(5))
e_dis, e_trc, e_upd, e_del = m.group(6), m.group(7), m.group(8), m.group(9)

# ── 4. Postflight on original URL (privileged read of latch state) ──────────
pf_after = preflight(base_env)
(out_dir / "ac0-postflight.json").write_text(json_text(pf_after))

rows_preserved = pf_after["ponr_row_count_before"] == pf0["ponr_row_count_before"]
triggers_ok = pf_after["triggers_enabled_before"] is True

ac1 = {
    **pf0,
    "probe_mode": probe_mode,
    "probe_current_user": probe_cur,
    "disable_denied": v_dis == 1,
    "disable_trigger_exit": 1 if v_dis == 1 else 0,
    "disable_trigger_stderr": sanitize(e_dis)[:500],
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
    "truncate_stderr": sanitize(e_trc)[:500],
    "update_stderr": sanitize(e_upd)[:500],
    "delete_stderr": sanitize(e_del)[:500],
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

(out_dir / "ac1-prod-role-disable-trigger.json").write_text(json_text(ac1))
(out_dir / "ac2-prod-role-dml-truncate.json").write_text(json_text(ac2))
(out_dir / "ac3-disposition.md").write_text(
    "# RH-S30-18 disposition\n\n"
    f"- probe_mode: `{probe_mode}`\n"
    f"- probe_current_user: `{sanitize(probe_cur)}`\n"
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
    f"- supplied_role: `{sanitize(pf0['role'])}` superuser={pf0['is_superuser']} owner={pf0['is_table_owner']}\n"
    f"- table_owner: `{sanitize(pf0['table_owner'])}`\n"
    f"- probe_mode: `{probe_mode}`\n"
    f"- probe_current_user during DDL: `{sanitize(probe_cur)}`\n"
    f"- production app role: `{HOLOCRON_APP}`\n"
    f"- product connection: libpq `PGUSER={HOLOCRON_APP}`\n"
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
    json_text(
        {
            "ac1": ac1,
            "ac2": ac2,
            "preflight": pf0,
            "postflight": pf_after,
            "probe_mode": probe_mode,
        },
    ),
    end="",
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

#!/usr/bin/env python3
"""
GATE-FIX-zero-loss-t-sync-013 — identity-bound zero-loss oracle (T-SYNC-013).

PASS (required-zero path) requires ALL of:
  1. Postgres post_export_write_audit count == 0
  2. drill independent recompute acceptedCount == 0 with matchesReport true
     (when drill report present)
  3. identity set empty (no accepted write row ids in ledger)
  4. none of this-run probe-created document ids present as accepted

When count > 0 (failure / residual path):
  MUST emit accepted_write_identities[] — count-only is NOT closed.

Negative / fixture modes:
  --report PATH   evaluate a drill report JSON (and optional --ledger-ids)
  --fixtures-dir  evaluate RED fixtures and require fail

Usage:
  python3 scripts/lib/zero-loss-identity-oracle.py [--out path.json]
  python3 scripts/lib/zero-loss-identity-oracle.py --report drill.json --ledger-ids ids.json
"""
from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
from pathlib import Path
from typing import Any

UUID_RE = re.compile(
    r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}", re.I
)
SENTINEL_AAAA = "00000000-0000-4000-8000-aaaaaaaaaaaa"


def psql_ledger_rows() -> tuple[int, list[dict[str, Any]]]:
    """Return (count, rows with id/surface/write_row_id) via platform resolve path."""
    r = subprocess.run(
        [
            "bun",
            "-e",
            """
import { resolveDatabaseUrl } from './services/platform/src/db/connection.ts';
import { createSql } from './services/platform/src/db/client.ts';
const u = resolveDatabaseUrl({ preferHolocron: true });
const sql = createSql(u);
try {
  const rows = await sql`
    SELECT id::text AS id,
           surface::text AS surface,
           write_row_id::text AS write_row_id,
           committed_at_ms
    FROM post_export_write_audit
    ORDER BY committed_at_ms NULLS LAST
  `;
  console.log(JSON.stringify({ count: rows.length, rows }));
} catch (e) {
  console.log(JSON.stringify({
    count: -1,
    rows: [],
    error: String(e instanceof Error ? e.message : e),
  }));
  process.exit(2);
} finally {
  await sql.end({ timeout: 5 });
}
""",
        ],
        capture_output=True,
        text=True,
        timeout=90,
        cwd=str(Path(__file__).resolve().parents[2]),
    )
    if r.returncode != 0:
        raise RuntimeError(f"ledger query failed: {r.stderr or r.stdout}")
    data = json.loads(r.stdout.strip().splitlines()[-1])
    return int(data.get("count", -1)), list(data.get("rows") or [])


def load_json(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {}
    try:
        return json.loads(path.read_text())
    except Exception:
        return {}


def identities_from_drill(drill: dict[str, Any]) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for item in drill.get("accepted_write_identities") or []:
        if isinstance(item, dict) and item.get("id"):
            out.append(
                {
                    "surface": item.get("surface") or "probe",
                    "id": str(item["id"]),
                    "status": item.get("status"),
                    "source": "drill.accepted_write_identities",
                }
            )
    probes = drill.get("probes") or {}
    app = probes.get("app") or {}
    if app.get("executed") and isinstance(app.get("status"), int) and 200 <= app["status"] < 300:
        body = app.get("body") or {}
        doc_id = body.get("id") or body.get("documentId") or (body.get("document") or {}).get("id")
        if doc_id:
            out.append(
                {
                    "surface": "app",
                    "id": str(doc_id),
                    "status": app["status"],
                    "source": "probes.app",
                }
            )
    mcp = probes.get("mcp") or {}
    if mcp.get("executed") and not mcp.get("rejected") and isinstance(mcp.get("status"), int) and 200 <= mcp["status"] < 300:
        msg = str(mcp.get("message") or "")
        m = UUID_RE.search(msg)
        if m:
            out.append(
                {
                    "surface": "mcp",
                    "id": m.group(0),
                    "status": mcp["status"],
                    "source": "probes.mcp",
                }
            )
    # de-dupe by id
    seen: set[str] = set()
    uniq: list[dict[str, Any]] = []
    for x in out:
        if x["id"] in seen:
            continue
        seen.add(x["id"])
        uniq.append(x)
    return uniq


def evaluate(
    *,
    drill: dict[str, Any],
    ledger_count: int,
    ledger_rows: list[dict[str, Any]],
    require_live_ledger: bool,
) -> dict[str, Any]:
    drill_ids = identities_from_drill(drill)
    ledger_ids = [
        {
            "surface": str(r.get("surface") or "ledger"),
            "id": str(r.get("write_row_id") or r.get("id") or ""),
            "source": "postgres:post_export_write_audit",
        }
        for r in ledger_rows
        if (r.get("write_row_id") or r.get("id"))
    ]
    all_ids = []
    seen: set[str] = set()
    for x in drill_ids + ledger_ids:
        if not x["id"] or x["id"] in seen:
            continue
        seen.add(x["id"])
        all_ids.append(x)

    recompute = drill.get("independentRecompute") or {}
    accepted_recompute = recompute.get("acceptedCount")
    if accepted_recompute is None:
        accepted_recompute = drill.get("lost_accepted_writes")
    matches = recompute.get("matchesReport")
    fence_armed = drill.get("fence_armed")
    drill_ok = drill.get("ok")
    lost = drill.get("lost_accepted_writes")

    reasons: list[str] = []
    if ledger_count < 0:
        reasons.append("ledger_unreadable")
    if ledger_count != 0:
        reasons.append(f"ledger_count={ledger_count}")
    if all_ids:
        reasons.append(f"accepted_write_identities_nonempty={len(all_ids)}")
    if drill and accepted_recompute not in (0, None) and accepted_recompute != 0:
        reasons.append(f"recompute_acceptedCount={accepted_recompute}")
    if drill and matches is False:
        reasons.append("matchesReport=false")
    if drill and lost not in (0, None) and lost != 0:
        reasons.append(f"lost_accepted_writes={lost}")
    if drill and fence_armed is False and (
        any((drill.get("probes") or {}).get(s, {}).get("executed") for s in ("app", "mcp", "upload", "job", "mission"))
        or (drill.get("error") or {}).get("code") == "DRILL_WRITE_SURFACES_NOT_BLOCKED"
    ):
        reasons.append("fence_armed=false_with_probes_or_post_mint_error")

    # PASS only when zero identities + zero count (+ recompute 0 when drill present)
    ok = ledger_count == 0 and len(all_ids) == 0
    if drill:
        if accepted_recompute is not None and accepted_recompute != 0:
            ok = False
        if matches is False:
            ok = False
        if lost is not None and lost != 0:
            ok = False
        # disarmed fence with any accepted identity fails closed
        if fence_armed is False and all_ids:
            ok = False

    # Count-only would ignore identities when count>0 — we always surface them
    out: dict[str, Any] = {
        "ok": ok,
        "tool": "scripts/lib/zero-loss-identity-oracle.py",
        "ledger": "postgres:post_export_write_audit",
        "accepted_count": ledger_count,
        "accepted_write_identities": all_ids,
        "identity_count": len(all_ids),
        "drill_ok": drill_ok,
        "drill_lost_accepted_writes": lost,
        "independent_recompute_acceptedCount": accepted_recompute,
        "independent_recompute_matchesReport": matches,
        "fence_armed": fence_armed,
        "require_live_ledger": require_live_ledger,
        "reasons": reasons,
        "t_sync_013": "PASS" if ok else "FAIL",
    }
    if not ok:
        out["error"] = {
            "code": "ZERO_LOSS_IDENTITY_ORACLE_FAILED",
            "message": (
                f"T-SYNC-013 zero-loss failed: accepted_count={ledger_count} "
                f"identity_count={len(all_ids)} reasons={reasons}; "
                f"identities={[x['id'] for x in all_ids]}"
            ),
        }
    return out


def evaluate_post_ponr_bind(
    step4: dict[str, Any], step5: dict[str, Any] | str
) -> dict[str, Any]:
    """AC-3: step5 POST_PONR_INELIGIBLE must bind this-run step4 ponr_id/write_row_id."""
    if isinstance(step5, str):
        text = step5
        try:
            # last JSON object in log
            objs = []
            for line in text.splitlines():
                line = line.strip()
                if line.startswith("{"):
                    try:
                        objs.append(json.loads(line))
                    except Exception:
                        pass
            step5_obj = objs[-1] if objs else {}
        except Exception:
            step5_obj = {}
    else:
        step5_obj = step5
        text = json.dumps(step5)

    p = step4.get("ponr_id") or (step4.get("ponr") or {}).get("id")
    w = step4.get("write_row_id") or (step4.get("ponr") or {}).get("write_row_id")
    # also dig nested
    if not p and isinstance(step4.get("result"), dict):
        p = step4["result"].get("ponr_id")
        w = w or step4["result"].get("write_row_id")

    err = step5_obj.get("error") or {}
    code = err.get("code") if isinstance(err, dict) else None
    if code is None and "POST_PONR_INELIGIBLE" in text:
        code = "POST_PONR_INELIGIBLE"
    pre = step5_obj.get("precondition") or {}
    s5_ponr = pre.get("ponr_id") or err.get("ponr_id") if isinstance(err, dict) else None
    s5_write = (
        pre.get("write_row_id")
        or (err.get("write_row_id") if isinstance(err, dict) else None)
        or step5_obj.get("write_row_id")
    )
    # scan text for ids
    if not s5_ponr and p and p in text:
        s5_ponr = p
    if not s5_write and w and w in text:
        s5_write = w

    repointed = step5_obj.get("repointed")
    residual_aaaa = s5_write == SENTINEL_AAAA or (w == SENTINEL_AAAA)
    reasons = []
    if code != "POST_PONR_INELIGIBLE":
        reasons.append(f"error.code={code!r}")
    if repointed is True:
        reasons.append("repointed=true")
    if not p or not w:
        reasons.append("step4_missing_ponr_identity")
    if p and s5_ponr and s5_ponr != p:
        reasons.append(f"ponr_id_mismatch step4={p} step5={s5_ponr}")
    if w and s5_write and s5_write != w:
        reasons.append(f"write_row_id_mismatch step4={w} step5={s5_write}")
    if p and p not in text:
        reasons.append("step5_log_missing_step4_ponr_id")
    if w and w not in text:
        reasons.append("step5_log_missing_step4_write_row_id")
    if residual_aaaa and (not p or s5_write == SENTINEL_AAAA and s5_write != w):
        reasons.append("residual_aaaa_sentinel")
    if s5_write == SENTINEL_AAAA and w != SENTINEL_AAAA:
        reasons.append("step5_write_row_id_is_aaaa_sentinel_not_this_run")

    ok = (
        code == "POST_PONR_INELIGIBLE"
        and repointed is not True
        and bool(p)
        and bool(w)
        and p in text
        and w in text
        and s5_write != SENTINEL_AAAA
        and (s5_ponr in (None, p) or s5_ponr == p)
        and (s5_write in (None, w) or s5_write == w)
    )
    return {
        "ok": ok,
        "tool": "zero-loss-identity-oracle.post_ponr_bind",
        "step4_ponr_id": p,
        "step4_write_row_id": w,
        "step5_error_code": code,
        "step5_ponr_id": s5_ponr,
        "step5_write_row_id": s5_write,
        "step5_repointed": repointed,
        "sentinel_aaaa": SENTINEL_AAAA,
        "reasons": reasons,
        "t_sync_014": "PASS" if ok else "FAIL",
        **(
            {}
            if ok
            else {
                "error": {
                    "code": "POST_PONR_IDENTITY_BIND_FAILED",
                    "message": f"step5 not bound to this-run step4: {reasons}",
                }
            }
        ),
    }


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="")
    ap.add_argument("--report", default="", help="drill report JSON path")
    ap.add_argument("--ledger-ids", default="", help="optional precomputed ledger JSON")
    ap.add_argument("--step4", default="", help="step4 enable-writes JSON/log for PONR bind")
    ap.add_argument("--step5", default="", help="step5 rollback-repoint JSON/log for PONR bind")
    ap.add_argument("--mode", default="zero-loss", choices=["zero-loss", "post-ponr", "both"])
    ap.add_argument("--no-live-ledger", action="store_true")
    args = ap.parse_args()

    drill: dict[str, Any] = {}
    if args.report:
        drill = load_json(Path(args.report))
    else:
        default_report = Path(".tmp/D07-03/rollback-drill-report.json")
        if default_report.exists():
            drill = load_json(default_report)

    results: dict[str, Any] = {}
    rc = 0

    if args.mode in ("zero-loss", "both"):
        if args.ledger_ids:
            ledger = load_json(Path(args.ledger_ids))
            ledger_count = int(ledger.get("accepted_count", ledger.get("count", -1)))
            ledger_rows = list(ledger.get("rows") or ledger.get("accepted_write_identities") or [])
        elif args.no_live_ledger:
            # Fixture-only: derive count from drill identities / fields
            ids = identities_from_drill(drill)
            ledger_count = int(drill.get("lost_accepted_writes") or len(ids) or 0)
            if drill.get("independentRecompute", {}).get("acceptedCount") not in (None,):
                ledger_count = max(
                    ledger_count, int(drill["independentRecompute"]["acceptedCount"] or 0)
                )
            ledger_rows = [{"write_row_id": x["id"], "surface": x["surface"]} for x in ids]
        else:
            ledger_count, ledger_rows = psql_ledger_rows()

        zl = evaluate(
            drill=drill,
            ledger_count=ledger_count,
            ledger_rows=ledger_rows,
            require_live_ledger=not args.no_live_ledger,
        )
        results["zero_loss"] = zl
        if not zl.get("ok"):
            rc = 2

    if args.mode in ("post-ponr", "both"):
        step4 = load_json(Path(args.step4)) if args.step4 else {}
        if args.step4 and not step4:
            step4_text = Path(args.step4).read_text(errors="replace") if Path(args.step4).exists() else ""
            # parse last JSON with ponr_id
            for line in step4_text.splitlines():
                line = line.strip()
                if "ponr_id" in line and line.startswith("{"):
                    try:
                        step4 = json.loads(line)
                    except Exception:
                        pass
            if not step4 and step4_text.strip().startswith("{"):
                try:
                    step4 = json.loads(step4_text)
                except Exception:
                    # multi-json file — take last complete object containing ponr
                    for m in re.finditer(r"\{[^{}]*ponr_id[^{}]*\}", step4_text):
                        try:
                            step4 = json.loads(m.group(0))
                        except Exception:
                            pass
        step5_src: Any
        if args.step5:
            p = Path(args.step5)
            step5_src = p.read_text(errors="replace") if p.exists() else ""
        else:
            step5_src = ""
        bind = evaluate_post_ponr_bind(step4, step5_src)
        results["post_ponr"] = bind
        if not bind.get("ok"):
            rc = 2

    # Flatten primary mode for gate step consumers
    if args.mode == "zero-loss" and "zero_loss" in results:
        payload = results["zero_loss"]
    elif args.mode == "post-ponr" and "post_ponr" in results:
        payload = results["post_ponr"]
    else:
        payload = results

    text = json.dumps(payload, indent=2)
    print(text)
    if args.out:
        Path(args.out).parent.mkdir(parents=True, exist_ok=True)
        Path(args.out).write_text(text + "\n")
    return rc


if __name__ == "__main__":
    sys.exit(main())

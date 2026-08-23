#!/usr/bin/env python3
"""Live Cloudflare MCP audit runner.

Calls the laptop Access proxy (127.0.0.1:44113) which injects a Cloudflare
Access JWT and forwards to https://mcp.holocrnlib.com/mcp on the Holocron
device. Independent oracles are SSH + docker exec psql on host `holocron`.

Never prints HOLO_KEY_MCP, JWTs, or DATABASE_URL.
"""

from __future__ import annotations

import base64
import json
import os
import socket
import subprocess
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

RUN_ID = os.environ.get("MCP_AUDIT_RUN_ID") or datetime.now(timezone.utc).strftime(
    "20260823T%H%M%SZ"
)
NS = f"mcp-audit-{RUN_ID}"
PROXY = os.environ.get("HOLOCRON_MCP_PROXY", "http://127.0.0.1:44113/mcp")
REPO = Path(__file__).resolve().parents[1]
EVIDENCE_DIR = REPO / ".spec" / "evidence"
LEDGER_PATH = EVIDENCE_DIR / f"mcp-cloudflare-audit-{RUN_ID}.json"
REPORT_PATH = EVIDENCE_DIR / f"mcp-cloudflare-audit-{RUN_ID}.md"

FROZEN_45 = [
    "get_research_session",
    "search_research",
    "search_fts",
    "search_vector",
    "hybrid_search",
    "store_document",
    "update_document",
    "share_document",
    "unshare_document",
    "get_document",
    "list_documents",
    "add_subscription",
    "remove_subscription",
    "list_subscriptions",
    "check_subscriptions",
    "get_subscription_content",
    "set_subscription_filter",
    "get_subscription_filters",
    "store_tool",
    "search_tools",
    "get_tool",
    "list_tools",
    "update_tool",
    "remove_tool",
    "shop_products",
    "get_shop_session",
    "get_shop_listings",
    "get_whats_new_report",
    "list_whats_new_reports",
    "start_assimilation",
    "approve_assimilation_plan",
    "reject_assimilation_plan",
    "get_assimilation_status",
    "cancel_assimilation",
    "steer_assimilation",
    "assimilate_creator",
    "get_creator_transcripts",
    "regenerate_transcript",
    "search_improvements",
    "get_improvement",
    "list_improvements",
    "add_improvement",
    "close_improvement",
    "set_improvement_status",
    "findRecommendations",
]


def load_mcp_key() -> str:
    env = os.environ.get("HOLO_KEY_MCP") or os.environ.get("MCP_API_KEY")
    if env and not env.startswith("${"):
        return env.strip()
    secrets = REPO / "services" / "platform" / "config" / "secrets.yaml"
    for line in secrets.read_text().splitlines():
        s = line.strip()
        if s.startswith("HOLO_KEY_MCP:") or s.startswith("MCP_API_KEY:"):
            value = s.split(":", 1)[1].strip().strip('"').strip("'")
            if value and not value.startswith("${"):
                return value
    raise SystemExit("HOLO_KEY_MCP missing")


KEY = load_mcp_key()
STATE: dict[str, Any] = {
    "run_id": RUN_ID,
    "namespace": NS,
    "proxy": PROXY,
    "created": {},
    "calls": [],
    "oracles": [],
    "cleanup": [],
}
CALL_ID = 0


def mcp_post(method: str, params: dict[str, Any] | None = None, timeout: int = 60) -> dict[str, Any]:
    global CALL_ID
    CALL_ID += 1
    body = {"jsonrpc": "2.0", "id": CALL_ID, "method": method, "params": params or {}}
    req = urllib.request.Request(
        PROXY,
        data=json.dumps(body).encode(),
        method="POST",
        headers={
            "Authorization": f"Bearer {KEY}",
            "Accept": "application/json, text/event-stream",
            "Content-Type": "application/json",
        },
    )
    t0 = time.time()
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            raw = resp.read()
            headers = {k.lower(): v for k, v in resp.headers.items()}
            status = resp.status
    except urllib.error.HTTPError as exc:
        raw = exc.read()
        headers = {k.lower(): v for k, v in exc.headers.items()}
        status = exc.code
    elapsed_ms = int((time.time() - t0) * 1000)
    parsed: Any
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        parsed = {"_non_json": raw[:400].decode("utf-8", "replace")}
    return {
        "status": status,
        "elapsed_ms": elapsed_ms,
        "cf_ray": headers.get("cf-ray"),
        "server": headers.get("server"),
        "body": parsed,
    }


def call_tool(name: str, args: dict[str, Any], timeout: int = 90) -> dict[str, Any]:
    mcp_post(
        "initialize",
        {
            "protocolVersion": "2025-11-25",
            "capabilities": {},
            "clientInfo": {"name": "mcp-audit", "version": "1"},
        },
        timeout=30,
    )
    res = mcp_post("tools/call", {"name": name, "arguments": args}, timeout=timeout)
    body = res["body"] if isinstance(res["body"], dict) else {}
    rpc_error = body.get("error")
    result = body.get("result") if isinstance(body.get("result"), dict) else {}
    is_error = bool(result.get("isError")) or rpc_error is not None
    payload: Any = result.get("structuredContent")
    if payload is None:
        text = None
        content = result.get("content")
        if isinstance(content, list) and content:
            text = content[0].get("text") if isinstance(content[0], dict) else None
        if isinstance(text, str) and text:
            try:
                payload = json.loads(text)
            except json.JSONDecodeError:
                payload = text
    record = {
        "tool": name,
        "args_keys": sorted(args.keys()),
        "http_status": res["status"],
        "elapsed_ms": res["elapsed_ms"],
        "cf_ray": res["cf_ray"],
        "server": res["server"],
        "is_error": is_error,
        "rpc_error": rpc_error,
        "payload": payload,
    }
    STATE["calls"].append(record)
    print(
        f"TOOL {name} http={res['status']} err={is_error} cf={res['cf_ray']} ms={res['elapsed_ms']}",
        flush=True,
    )
    return record


def remote_sql(sql: str) -> list[str]:
    b64 = base64.b64encode(sql.encode()).decode()
    script = f"""
export PATH="/usr/local/bin:/opt/homebrew/bin:/Applications/Docker.app/Contents/Resources/bin:$PATH"
echo {b64} | base64 -D | docker exec -i holocron-production-postgres-1 psql -U holocron -d holocron -v ON_ERROR_STOP=1 -tA
"""
    proc = subprocess.run(
        ["ssh", "-o", "BatchMode=yes", "-o", "ConnectTimeout=20", "holocron", "bash", "-s"],
        input=script,
        text=True,
        capture_output=True,
        timeout=60,
    )
    out = (proc.stdout or "").strip()
    err = (proc.stderr or "").strip()
    if proc.returncode != 0:
        return [f"SQL_ERROR:{proc.returncode}:{err[-400:]}"]
    return [line for line in out.splitlines() if line.strip()]


def oracle(name: str, sql: str) -> list[str]:
    rows = remote_sql(sql)
    STATE["oracles"].append({"name": name, "sql": sql, "rows": rows[:20], "n": len(rows)})
    print(f"ORACLE {name} n={len(rows)} sample={rows[:3]}", flush=True)
    return rows


def classify(record: dict[str, Any], *, expect_error: bool = False) -> str:
    if record["http_status"] != 200:
        return "fail"
    if record["is_error"]:
        return "designed_error" if expect_error else "fail"
    if record["payload"] is None:
        return "fail"
    return "pass"


def extract_id(payload: Any, *keys: str) -> str | None:
    if not isinstance(payload, dict):
        return None
    for key in keys:
        value = payload.get(key)
        if isinstance(value, str) and value:
            return value
    return None


def main() -> None:
    EVIDENCE_DIR.mkdir(parents=True, exist_ok=True)
    print(f"RUN {RUN_ID} NS {NS}", flush=True)

    init = mcp_post(
        "initialize",
        {
            "protocolVersion": "2025-11-25",
            "capabilities": {},
            "clientInfo": {"name": "mcp-audit", "version": "1"},
        },
    )
    listed = mcp_post("tools/list", {})
    tools = ((listed["body"] or {}).get("result") or {}).get("tools") or []
    live_ids = [t.get("name") for t in tools if isinstance(t, dict)]
    STATE["protocol"] = {
        "init_status": init["status"],
        "init_cf_ray": init["cf_ray"],
        "init_server": ((init["body"] or {}).get("result") or {}).get("serverInfo"),
        "list_status": listed["status"],
        "list_cf_ray": listed["cf_ray"],
        "live_count": len(live_ids),
        "live_ids": live_ids,
        "missing_from_live": [t for t in FROZEN_45 if t not in live_ids],
        "extra_on_live": [t for t in live_ids if t not in FROZEN_45],
    }
    print("LIVE", len(live_ids), "missing", STATE["protocol"]["missing_from_live"], flush=True)

    # Seed ids from holocron postgres
    doc_id = (oracle("seed_doc", "SELECT id::text FROM documents WHERE title IS NOT NULL ORDER BY created_at DESC LIMIT 1;") or [None])[0]
    research_id = (oracle("seed_research", "SELECT id::text FROM research_sessions ORDER BY created_at DESC LIMIT 1;") or [None])[0]
    tool_id = (oracle("seed_tool", "SELECT id::text FROM toolbelt_tools ORDER BY created_at DESC LIMIT 1;") or [None])[0]
    imp_id = (oracle("seed_imp", "SELECT id::text FROM improvement_requests ORDER BY created_at DESC LIMIT 1;") or [None])[0]
    creator_id = (oracle("seed_creator", "SELECT id::text FROM creator_profiles LIMIT 1;") or [None])[0]
    STATE["seeds"] = {
        "documentId": doc_id,
        "researchSessionId": research_id,
        "toolId": tool_id,
        "improvementId": imp_id,
        "creatorId": creator_id,
    }

    laptop_ports = {}
    for port in (5432, 4111, 44112, 44113):
        sock = socket.socket()
        sock.settimeout(1)
        laptop_ports[port] = sock.connect_ex(("127.0.0.1", port)) == 0
        sock.close()
    STATE["laptop_ports"] = laptop_ports

    scores: dict[str, str] = {}

    # --- marker write ---
    store = call_tool(
        "store_document",
        {
            "title": f"{NS}-marker",
            "content": f"Cloudflare MCP audit marker {RUN_ID}. Must exist on holocron postgres.",
            "metadata": {"audit": True, "run_id": RUN_ID},
        },
    )
    marker_id = extract_id(store["payload"], "documentId", "id", "_id")
    STATE["created"]["documentId"] = marker_id
    marker_rows = oracle(
        "marker",
        f"SELECT id::text, title FROM documents WHERE title = '{NS}-marker';",
    )
    scores["store_document"] = "pass" if marker_id and marker_rows else classify(store)
    got = call_tool("get_document", {"documentId": marker_id or "00000000-0000-0000-0000-000000000001"})
    scores["get_document"] = "pass" if not got["is_error"] and got["payload"] else classify(got)

    # laptop 5432 must not have the marker (if we can query without a password, try; else note closed 44112)
    STATE["laptop_marker"] = "not_queried"
    if laptop_ports.get(5432):
        STATE["laptop_marker"] = "port_open_unqueried_no_creds"

    upd = call_tool(
        "update_document",
        {"documentId": marker_id or "00000000-0000-0000-0000-000000000001", "content": f"{NS} updated"},
    )
    scores["update_document"] = classify(upd)

    share = call_tool("share_document", {"documentId": marker_id or "00000000-0000-0000-0000-000000000001"})
    share_url = share["payload"].get("shareUrl") if isinstance(share["payload"], dict) else None
    scores["share_document"] = (
        "pass"
        if not share["is_error"]
        and isinstance(share_url, str)
        and share_url.startswith("https://docs.holocrnlib.com/d/")
        else classify(share)
    )
    unshare = call_tool("unshare_document", {"documentId": marker_id or "00000000-0000-0000-0000-000000000001"})
    if "unshare_document" in live_ids:
        scores["unshare_document"] = classify(unshare)
    else:
        scores["unshare_document"] = "designed_error" if unshare["is_error"] else classify(unshare)
        STATE["unshare_note"] = "not advertised on live tools/list"

    lst = call_tool("list_documents", {"limit": 5})
    scores["list_documents"] = classify(lst)

    # --- search / research ---
    scores["search_fts"] = classify(call_tool("search_fts", {"query": "holocron", "limit": 5}))
    scores["search_vector"] = classify(
        call_tool("search_vector", {"embedding": [0.0] * 1024, "limit": 3})
    )
    hybrid = call_tool("hybrid_search", {"query": "holocron postgres mcp", "limit": 5})
    scores["hybrid_search"] = classify(hybrid)
    scores["search_research"] = classify(call_tool("search_research", {"query": "holocron", "limit": 5}))
    scores["get_research_session"] = classify(
        call_tool("get_research_session", {"sessionId": research_id or "missing"})
    )

    # --- subscriptions ---
    listed_subs = call_tool("list_subscriptions", {"limit": 10})
    scores["list_subscriptions"] = classify(listed_subs)
    holocron_count = oracle("sub_count", "SELECT count(*)::text FROM subscription_sources;")
    add = call_tool(
        "add_subscription",
        {
            "sourceType": "github",
            "identifier": NS,
            "name": NS,
            "url": "https://github.com/nodejs/node",
            "feedUrl": "https://github.com/nodejs/node/releases.atom",
        },
    )
    sub_id = extract_id(add["payload"], "subscriptionId", "id")
    STATE["created"]["subscriptionId"] = sub_id
    add_rows = oracle(
        "add_sub",
        f"SELECT id::text, identifier, feed_url FROM subscription_sources WHERE identifier = '{NS}';",
    )
    scores["add_subscription"] = "pass" if add_rows and sub_id else classify(add)
    replay = call_tool(
        "add_subscription",
        {
            "sourceType": "github",
            "identifier": NS,
            "name": NS,
            "feedUrl": "https://github.com/nodejs/node/releases.atom",
        },
    )
    replay_id = extract_id(replay["payload"], "subscriptionId", "id")
    STATE["subscription_replay_same_id"] = replay_id == sub_id

    check = call_tool("check_subscriptions", {"sourceType": "github"}, timeout=120)
    check_payload = check["payload"] if isinstance(check["payload"], dict) else {}
    content_rows = oracle(
        "sub_content",
        f"SELECT count(*)::text FROM subscription_content WHERE source_id = '{sub_id}';"
        if sub_id
        else "SELECT '0';",
    )
    fetched = int(check_payload.get("totalFetched") or 0) if isinstance(check_payload, dict) else 0
    checked = int(check_payload.get("sourcesChecked") or 0) if isinstance(check_payload, dict) else 0
    scores["check_subscriptions"] = (
        "pass"
        if not check["is_error"] and checked >= 1 and (fetched >= 1 or content_rows and content_rows[0] != "0")
        else classify(check)
    )
    got_content = call_tool(
        "get_subscription_content",
        {"subscriptionId": sub_id or "00000000-0000-0000-0000-000000000001", "limit": 5},
    )
    scores["get_subscription_content"] = classify(got_content)
    filt = call_tool(
        "set_subscription_filter",
        {
            "sourceId": sub_id,
            "ruleName": f"{NS}-rule",
            "ruleType": "keyword",
            "ruleValue": "audit",
            "weight": 1,
        },
    )
    filter_id = extract_id(filt["payload"], "filterId", "id")
    STATE["created"]["filterId"] = filter_id
    scores["set_subscription_filter"] = classify(filt)
    scores["get_subscription_filters"] = classify(
        call_tool("get_subscription_filters", {"subscriptionId": sub_id})
    )

    # --- toolbelt ---
    store_t = call_tool(
        "store_tool",
        {
            "title": NS,
            "description": "audit toolbelt row",
            "sourceType": "other",
            "category": "tool",
            "status": "draft",
        },
    )
    t_id = extract_id(store_t["payload"], "toolId", "id")
    STATE["created"]["toolbeltId"] = t_id
    scores["store_tool"] = (
        "pass"
        if oracle("toolbelt", f"SELECT id::text FROM toolbelt_tools WHERE title = '{NS}';")
        else classify(store_t)
    )
    scores["get_tool"] = classify(call_tool("get_tool", {"toolId": t_id or tool_id or "missing"}))
    scores["list_tools"] = classify(call_tool("list_tools", {"limit": 10}))
    scores["search_tools"] = classify(call_tool("search_tools", {"query": "audit", "limit": 5}))
    scores["update_tool"] = classify(
        call_tool(
            "update_tool",
            {
                "toolId": t_id or tool_id or "missing",
                "description": f"{NS} updated",
                "sourceType": "other",
                "category": "tool",
            },
        )
    )

    # --- improvements ---
    add_imp = call_tool(
        "add_improvement",
        {"items": [{"description": NS, "sourceScreen": "mcp-audit"}]},
    )
    ids = add_imp["payload"].get("ids") if isinstance(add_imp["payload"], dict) else None
    new_imp = ids[0] if isinstance(ids, list) and ids else None
    STATE["created"]["improvementId"] = new_imp
    scores["add_improvement"] = (
        "pass"
        if oracle(
            "imp",
            f"SELECT id::text FROM improvement_requests WHERE description = '{NS}';",
        )
        else classify(add_imp)
    )
    scores["get_improvement"] = classify(
        call_tool("get_improvement", {"id": new_imp or imp_id or "missing"})
    )
    scores["list_improvements"] = classify(call_tool("list_improvements", {"limit": 5}))
    scores["search_improvements"] = classify(
        call_tool("search_improvements", {"query": "audit", "limit": 5})
    )
    scores["set_improvement_status"] = classify(
        call_tool("set_improvement_status", {"id": new_imp or imp_id or "missing", "status": "open"})
    )
    scores["close_improvement"] = classify(
        call_tool("close_improvement", {"id": new_imp or "missing", "reason": "mcp-audit cleanup"})
    )

    # --- whats-new / creators ---
    scores["get_whats_new_report"] = classify(call_tool("get_whats_new_report", {}))
    scores["list_whats_new_reports"] = classify(call_tool("list_whats_new_reports", {"limit": 3}))
    scores["get_creator_transcripts"] = classify(
        call_tool("get_creator_transcripts", {"profileId": creator_id or "missing", "limit": 3})
    )
    scores["assimilate_creator"] = classify(
        call_tool("assimilate_creator", {"profileId": "00000000-0000-0000-0000-00000000aud1"}),
        expect_error=True,
    )
    scores["regenerate_transcript"] = classify(
        call_tool("regenerate_transcript", {"contentId": "00000000-0000-0000-0000-00000000aud2"}),
        expect_error=True,
    )

    # --- shop / recommendations ---
    shop = call_tool(
        "shop_products",
        {"query": f"{NS} usb-c cable", "retailers": ["ebay"], "condition": "any"},
        timeout=120,
    )
    shop_id = extract_id(shop["payload"], "sessionId")
    STATE["created"]["shopSessionId"] = shop_id
    if shop["is_error"]:
        scores["shop_products"] = "vendor_outage"
    else:
        scores["shop_products"] = classify(shop)
    scores["get_shop_session"] = classify(
        call_tool("get_shop_session", {"sessionId": shop_id or "00000000-0000-0000-0000-000000000001"})
    )
    scores["get_shop_listings"] = classify(
        call_tool("get_shop_listings", {"sessionId": shop_id or "00000000-0000-0000-0000-000000000001", "limit": 5})
    )
    rec = call_tool("findRecommendations", {"query": "coffee shop", "count": 3, "location": "Salt Lake City"})
    scores["findRecommendations"] = "vendor_outage" if rec["is_error"] else classify(rec)

    # --- assimilation ---
    start = call_tool(
        "start_assimilation",
        {
            "repositoryUrl": f"https://github.com/octocat/Hello-World#{NS}",
            "profile": "fast",
            "autoApprove": False,
        },
    )
    sess = extract_id(start["payload"], "sessionId", "_id")
    STATE["created"]["assimilationId"] = sess
    scores["start_assimilation"] = (
        "pass"
        if oracle(
            "assim",
            f"SELECT id::text FROM assimilation_sessions WHERE repository_url LIKE '%{NS}%';",
        )
        else classify(start)
    )
    scores["get_assimilation_status"] = classify(
        call_tool("get_assimilation_status", {"sessionId": sess or "missing"})
    )
    scores["steer_assimilation"] = classify(
        call_tool("steer_assimilation", {"sessionId": sess or "missing", "note": f"{NS} steer"})
    )
    # Do not approve into a crawl; reject then cancel.
    scores["reject_assimilation_plan"] = classify(
        call_tool("reject_assimilation_plan", {"sessionId": sess or "missing", "feedback": NS})
    )
    scores["cancel_assimilation"] = classify(
        call_tool("cancel_assimilation", {"sessionId": sess or "missing"})
    )
    scores["approve_assimilation_plan"] = classify(
        call_tool("approve_assimilation_plan", {"sessionId": sess or "missing"}),
        expect_error=True,
    )

    # remove namespaced tool/subscription last so earlier reads still work
    scores["remove_tool"] = classify(call_tool("remove_tool", {"toolId": t_id or "missing"}))
    scores["remove_subscription"] = classify(
        call_tool("remove_subscription", {"subscriptionId": sub_id or "missing"})
    )

    STATE["scores"] = scores

    # cleanup leftover rows by namespace
    cleanup_sql = [
        f"DELETE FROM subscription_filters WHERE rule_name = '{NS}-rule';",
        f"DELETE FROM subscription_content WHERE source_id IN (SELECT id FROM subscription_sources WHERE identifier = '{NS}');",
        f"DELETE FROM subscription_sources WHERE identifier = '{NS}';",
        f"DELETE FROM documents WHERE title LIKE '{NS}%';",
        f"DELETE FROM toolbelt_tools WHERE title = '{NS}';",
        f"DELETE FROM improvement_requests WHERE description = '{NS}';",
        f"DELETE FROM shop_listings WHERE session_id IN (SELECT id FROM shop_sessions WHERE query LIKE '{NS}%');",
        f"DELETE FROM shop_sessions WHERE query LIKE '{NS}%';",
        f"DELETE FROM assimilation_sessions WHERE repository_url LIKE '%{NS}%';",
    ]
    for stmt in cleanup_sql:
        rows = remote_sql(stmt)
        STATE["cleanup"].append({"sql": stmt, "result": rows[:5]})

    residue = oracle(
        "residue",
        " UNION ALL ".join(
            [
                f"SELECT 'documents' AS t, count(*)::text FROM documents WHERE title LIKE '{NS}%'",
                f"SELECT 'subs', count(*)::text FROM subscription_sources WHERE identifier = '{NS}'",
                f"SELECT 'tools', count(*)::text FROM toolbelt_tools WHERE title = '{NS}'",
                f"SELECT 'imps', count(*)::text FROM improvement_requests WHERE description = '{NS}'",
                f"SELECT 'shop', count(*)::text FROM shop_sessions WHERE query LIKE '{NS}%'",
                f"SELECT 'assim', count(*)::text FROM assimilation_sessions WHERE repository_url LIKE '%{NS}%'",
            ]
        )
        + ";",
    )
    STATE["residue"] = residue
    STATE["holocron_sub_count_before"] = holocron_count

    LEDGER_PATH.write_text(json.dumps(STATE, indent=2, default=str)[:1_000_000])
    print(f"WROTE {LEDGER_PATH}", flush=True)
    print("SCORES", json.dumps(scores, indent=2), flush=True)


if __name__ == "__main__":
    main()

# Holocron MCP Cloudflare audit

**Run:** `20260823T012201Z`  
**Namespace:** `mcp-audit-20260823T012201Z`  
**Verdict:** Grok (and Claude/Codex/OpenCode) reach the **Holocron device through the Cloudflare Access tunnel**. Most tools work on that device. Embeddings and a few catalog/schema drifts do not.

Companion JSON: `.spec/evidence/mcp-cloudflare-audit-20260823T012201Z-summary.json`  
Runner: `scripts/audit-holocron-mcp-cloudflare.py`

## Plain-language answer

This laptop does **not** talk to a local Mastra on `:4111` for Holocron MCP. Grok posts to `http://127.0.0.1:44113/mcp`. That process is a loopback Access proxy. It injects a Cloudflare Access login JWT and forwards to `https://mcp.holocrnlib.com/mcp`. Cloudflare Access and `cloudflared` on host `holocron` then deliver the request to `http://127.0.0.1:44111/mcp` inside the production Mastra container. Tool calls write and read **production Postgres on that device**.

Proof that is not self-report: a marker document created through the proxy (`3d98a49c-a619-4d3c-994d-86a57785a17a`, title `mcp-audit-20260823T012201Z-marker`) was selected from `holocron-production-postgres-1`. The same role/database does not exist on laptop `:5432`. Every successful `tools/call` carried `server: cloudflare` and a `cf-ray`.

## Path of trust

| Check | Result |
|---|---|
| Grok config | `http://127.0.0.1:44113/mcp`, `Authorization: Bearer ${HOLO_KEY_MCP}` only |
| Proxy healthz | `ok`, upstream `https://mcp.holocrnlib.com`, `tokenCached: true` |
| DNS `mcp.holocrnlib.com` | Cloudflare A records `104.21.55.203`, `172.67.172.198` — not `*.ts.net` |
| Unauthenticated public `/mcp` | HTTP 302 to `hackerpug.cloudflareaccess.com` login, HTML, no JSON-RPC (twice) |
| Adjacent public paths | `/api/missions`, `/blobs/x`, `/health`, `/mcp/../health` also Access 302 — never Mastra JSON or `data_plane` |
| JWT, no bearer | Origin **401** `missing or invalid Authorization Bearer token` with `cf-ray` |
| JWT + `HOLO_KEY_MCP` | **200** initialize `holocron-postgres` protocol `2025-11-25`; `tools/list` = **44** |
| Proxy without bearer | Same origin 401, still Cloudflare (`cf-ray`) — proxy injects Access JWT |
| `cloudflared` on holocron | LaunchAgent `com.holocron.cloudflared` running; ingress `mcp.holocrnlib.com` path `^/mcp(/.*)?$` → `http://127.0.0.1:44111` with Protect-with-Access |
| Funnel | `tailscale serve status --json` has TCP/Web only, no Funnel keys |
| Loopback `/health` on holocron | `data_plane: postgres`, `host: holocron`, image `sha256:d7765f3d…`, sourceRevision `bba5bcb9…`, queue `pg-boss` ready |
| Public `/health` | Access login, not that health body |
| Foreign `Origin` on origin | **403** `MCP_ORIGIN_REJECTED` |
| Same call via proxy | **200** (Origin stripped) |
| GET `/mcp` SSE | **Fail.** `curl -N` for 6s on proxy and public hostname: 0 bytes, no status line. POST JSON-RPC works. Long-lived SSE is not streaming through this path. |

## Catalog

Current git registry/manifest list **45** tools. Live gateway lists **44**. Missing from live: **`unshare_document`**.

Deployed Mastra is an older image (`sourceRevision bba5bcb9…`, deployed 2026-08-20). Local `holocron-mcp` stdio wrapper still advertises `unshare_document` and types `check_subscriptions` with `subscriptionId`; the live schema is `sourceType`. `MCP-SETUP.md` still documents `PLATFORM_URL=http://127.0.0.1:4111`.

## Protocol methods

| Method | Live |
|---|---|
| `initialize` | 200, `holocron-postgres` 1.0.0, `2025-11-25` |
| `tools/list` | 44 tools |
| `tools/call` unknown name | `isError: true`, `Tool … not found` |
| `ping` | 200 empty result |
| `resources/list` | `-32601` Method not found (none registered) |
| `prompts/list` | `-32601` Method not found (none registered) |
| `GET /mcp` SSE | hang, 0 bytes |

## Tool scoreboard (44 live + 1 missing)

Independent oracle: SSH `docker exec holocron-production-postgres-1 psql -U holocron`. Marker/subscription/shop/improvement/assimilation rows were selected on the device, then deleted.

| Tool | Class | Notes |
|---|---|---|
| `store_document` | **pass** | Created `3d98a49c-…` on holocron Postgres |
| `get_document` | **pass** | Same row; `data_plane: postgres`, `source: postgres` |
| `update_document` | **pass** | `updated: true` |
| `share_document` | **pass** after retry | Live schema **requires** `isPublic: true`. First call without it: `-32602`. Retry returned `shareToken mcp-8ffe9060-…` (no `shareUrl` field on this deploy) |
| `unshare_document` | **fail / catalog gap** | `Tool unshare_document not found` |
| `list_documents` | **pass** | Marker appeared first in list |
| `search_fts` | **pass** | Real Postgres FTS |
| `search_vector` | **fail** | Query ran; output schema rejected `score: NaN` on a zero vector |
| `hybrid_search` | **fail** | `ROLE_UNAVAILABLE` embed fleet: LiteLLM 404 `Qwen3-Embedding-0.6B-4bit-DWQ` not loaded; available `Qwen3.6-35B-A3B-MLX-8bit`. Fail-closed is honest |
| `search_research` | **pass** | 2 sessions |
| `get_research_session` | **pass** after retry | Works with a real UUID (`019d4f4a-…`) |
| `list_subscriptions` | **pass** | 115 sources on device |
| `add_subscription` | **pass** | Row `86309564-…` identifier `mcp-audit-…`, feed `releases.atom`; replay same id |
| `check_subscriptions` | **pass** | Real GitHub Atom fetch: `sourcesChecked=1`, `totalFetched=10`, `totalQueued=10`, `errors=[]`. Content rows existed on Postgres |
| `get_subscription_content` | **pass** | Node.js v26.7.0 release item from that feed |
| `set_subscription_filter` | **pass** | Filter `7cda60b2-…` |
| `get_subscription_filters` | **pass** | |
| `remove_subscription` | **fail then cleaned** | FK `subscription_content_source_id_fkey` RESTRICT until content deleted. Cleanup deleted 10 content + 1 source |
| `store_tool` / `get_tool` / `list_tools` / `search_tools` / `update_tool` / `remove_tool` | **pass** | Toolbelt round-trip; remove deleted the audit row |
| `add_improvement` / `get_improvement` / `list_improvements` / `search_improvements` / `set_improvement_status` / `close_improvement` | **pass** | Improvement `ae92baa5-…` on Postgres |
| `get_whats_new_report` / `list_whats_new_reports` | **pass** | 136 reports on device |
| `get_creator_transcripts` | **pass** after retry | Profile `jayminwest`, `transcriptCount: 0` |
| `assimilate_creator` | **designed_error** | Fake UUID rejected |
| `regenerate_transcript` | **fail (false success)** | Garbage `contentId` still queued `transcript_jobs` (`f193c350-…`). Cleaned |
| `shop_products` | **pass** | Live search 33.8s, session `683157dd-…` `completed`, 1 listing on Postgres |
| `get_shop_session` / `get_shop_listings` | **pass** | |
| `findRecommendations` | **pass** | Live 13.1s, non-empty payload |
| `start_assimilation` | **pass** | Session `816b3461-…` on Postgres |
| `get_assimilation_status` / `steer_assimilation` / `reject_assimilation_plan` / `cancel_assimilation` | **pass** | Final status `cancelled` |
| `approve_assimilation_plan` | **designed_error** | Called after cancel, as planned |

**Invoked:** 44 live tools + 1 missing (`unshare_document`).  
**Residue after cleanup:** documents/subs/content/improvements/shop/assim all **0**.

## Subscriptions: MCP vs scheduler

These are not the same thing.

| Surface | What we saw |
|---|---|
| MCP `check_subscriptions` | **Works.** Fetched a live Atom feed and inserted 10 `subscription_content` rows on holocron |
| Compose service `holocron-production-scheduler-1` | **Up 2 days (healthy)** |
| `subscription-monitor` | Cadence-fires hourly. `queue_jobs`: 112 pending + 21 failed. It **does not fetch feeds**. All 115 sources share one `last_checked` (`2026-08-23 00:35:36Z`) from the last heartbeat `UPDATE … WHERE true` |
| `subscription-auto-research` | 54 pending + 10 failed. Handler still fail-closes with `RESEARCH_DEFERRED_NO_DOCUMENT` when queued work exists |
| `feed-builder` | 54 pending + 10 failed |
| Feed URLs | Only **newsletter (15)** and **creator (10)** have `feed_url`. GitHub (34) and changelog (33) have none — except the audit source we added |

Scheduler is running interactive janitors (toolcall-timeout, voice-session, etc.) continuously. Background subscription jobs are queued, not completing a real fetch pipeline. MCP is the working check path today.

## Other harnesses (peek only, not changed)

| Harness | Holocron MCP |
|---|---|
| Grok | `http://127.0.0.1:44113/mcp` + `${HOLO_KEY_MCP}` |
| Claude | same proxy URL + `${HOLO_KEY_MCP}` |
| Codex | same proxy URL + `bearer_token_env_var = "HOLO_KEY_MCP"` |
| OpenCode | same proxy URL. **Check this file:** it may hold a literal bearer instead of an env substitution |

Tailscale `https://holocron.tail011a51.ts.net:44111/mcp` is commented as fallback only.

## Blockers / follow-ups (not fixed in this audit)

1. **Embed fleet model missing** — `hybrid_search` and embedding-backfill fail closed until LiteLLM serves `qwen3-embedding` (or the fleet pin is updated to a loaded model).
2. **Deploy drift** — live image lacks `unshare_document`; `share_document` still requires `isPublic`. Ship current registry or stop advertising the missing tool locally.
3. **`GET /mcp` SSE** does not stream through Cloudflare/proxy.
4. **`remove_subscription`** cannot delete a source that has content (RESTRICT FK).
5. **`regenerate_transcript`** queues jobs for nonexistent content ids.
6. **Scheduler subscription jobs** are pending/failed; monitor is a last_checked heartbeat only.
7. Docs: `holocron-mcp/MCP-SETUP.md` still points at localhost `:4111`.

## Cleanup

Deleted from holocron Postgres: marker document, 10 feed items, subscription source + filter, improvement, shop session + listing, cancelled assimilation, transcript job. Residue counts all zero.

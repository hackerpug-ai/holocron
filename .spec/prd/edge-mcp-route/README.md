# Plan: Fix public + private MCP deep-research by adding an /mcp route to the edge (Caddy)

Status: PLANNED
Date: 2026-08-25
Owner: goal mt85o0ka-8t6p20 (deep-research MCP validation loop, cycle 1)

## 1. Root cause

The `mcp__holocron_deep_research` MCP tool fails at the transport layer: the MCP
client cannot even connect to the holocron MCP server ("MCP server holocron not
available", "endpoint returned an untyped response (200) — this URL does not
appear to speak MCP").

Path traced end-to-end:

1. Harness → `http://127.0.0.1:44113/mcp` (holocron-mcp-access-proxy, adds
   Cloudflare Access JWT, strips Origin/Referer) → `https://mcp.holocrnlib.com/mcp`
   (cloudflared tunnel `holocron-article-origin`) → `http://127.0.0.1:44111`
   (edge container, Caddy) → mastra:4111.
2. Every hop is healthy EXCEPT the edge: the Caddyfile inline config
   (`edge-caddyfile` in `services/platform/deploy/compose/compose.yaml`) only
   contains:
   ```
   :44111 {
     handle /health { reverse_proxy mastra:4111 }
     respond / "holocron edge ready" 200
   }
   ```
   There is **no `/mcp` route**, so all MCP traffic (POST JSON-RPC and SSE
   `GET /mcp`) is swallowed by the catch-all `respond /` → **200 with an empty
   body**. Hence "untyped response (200)".
3. The platform itself is healthy: mastra returns 401 for unkeyed /mcp
   (auth working), /health reports every subsystem ready, and the deployment
   record (`.tmp/REDHAT-FIX-S29-DEPLOY/deployment-record.json`) confirms the
   current release (image `localhost:5000/holocron-platform@sha256:79133d66…`,
   sourceRevision `bcb59e84`, composeSha256 `49617cec…`).

This blocks ALL three MCP paths: harness → local access proxy, public
`https://mcp.holocrnlib.com/mcp` via tunnel, and private
`https://holocron.tail011a51.ts.net:44111/mcp` via Tailscale.

## 2. Minimal change (limited, single root cause)

Add an `/mcp` route to the `edge-caddyfile` inline config in
`services/platform/deploy/compose/compose.yaml` (top-level `configs:` block),
placed BEFORE the catch-all `respond /`:

```yaml
  edge-caddyfile:
    content: |
      {
        auto_https off
        admin off
      }
      :44111 {
        handle /health {
          reverse_proxy mastra:4111
        }
        handle /mcp* {
          reverse_proxy mastra:4111 {
            flush_interval -1
          }
        }
        respond / "holocron edge ready" 200
      }
```

Rationale / correctness:
- Caddy path matcher `/mcp*` is a prefix match → covers `/mcp` and `/mcp/*`.
- `flush_interval -1` = unbuffered streaming, required for the long-lived SSE
  `GET /mcp` transport (matches the deploy README rule: do NOT set
  `disableChunkedEncoding: true`; SSE must stream).
- Caddy passes the `Authorization: Bearer $HOLO_KEY_MCP` header through by
  default; mastra's scoped-key middleware already enforces it (401 unkeyed,
  403 foreign Origin).
- `handle` blocks are mutually exclusive, so `/health` and `/mcp*` are exact;
  everything else keeps the existing catch-all 200.
- NO changes to: cloudflared config (~/.cloudflared/config.yml is already
  correct), tunnel ingress, Access app, compose ports, mastra image, secrets.

Files to touch: exactly ONE file — `services/platform/deploy/compose/compose.yaml`.

## 3. Deploy (from the holocron host — it owns Docker CLI, .env, secrets)

Host facts (verified): checkout at `~/Projects/holocron` on commit `bcb59e84`
== `origin/main` (git tree clean); Docker Desktop present; `.env` present;
staging release from the previous deploy at `/tmp/CUTOVER-RELEASE-001/stage-bcb59e84/`.

Steps:
1. Locally: create branch `fix/edge-mcp-route` from `origin/main` (NOT from the
   stale local `main`, which is 2 commits ahead / 3 behind), apply the
   compose.yaml edit, run gates, commit, push.
2. Host: `git fetch origin && git checkout fix/edge-mcp-route`
   (= origin/main + 1 commit; keeps host's deploy fixes).
3. Host: regenerate the release lock — new `composeSha256` because compose.yaml
   changed (deploy:apply refuses on sha mismatch):
   ```bash
   bun services/platform/src/cli/holo.ts deploy:package \
     --image localhost:5000/holocron-platform@sha256:79133d6618ca9379f59552bab23b04d9ab9fc154a03c49f4c37b5ce03ca565a8 \
     --previous-image localhost:5000/holocron-platform@sha256:02be2e7f33cf350a03d24def6885c37063c402c2821ff16998c9e7c2ac203ec5
   ```
   (current + previous digests taken from deployment-record.json; writes new
   lock to `services/platform/deploy/compose/image-lock.json`).
4. Dry-run first, then apply:
   ```bash
   bash scripts/deploy-holocron.sh --authorize --dry-run
   bash scripts/deploy-holocron.sh --authorize
   ```
   (script: sources `.env`, resolves secrets, base URL
   `https://holocron.tail011a51.ts.net:44111`, runs
   `holo deploy:apply --authorize --release <lock> --base-url … --target holocron`.)
   Cold recreate of all 12 services; named volumes preserved (no `-v`), memory
   plan within the 50 GiB ceiling.
5. `bun services/platform/src/cli/holo.ts deploy:verify --release <lock> --base-url https://holocron.tail011a51.ts.net:44111`

## 4. Verification

1. Direct edge (host): `curl -si -H "Authorization: Bearer $HOLO_KEY_MCP" http://127.0.0.1:44111/mcp` → JSON-RPC response (not empty).
2. MCP initialize + tools/list through each path (expect the 44-tool registry surface, incl. `deep_research`):
   - host → edge:44111
   - public: `cloudflared access curl` / proxied `https://mcp.holocrnlib.com/mcp`
   - harness local proxy: `http://127.0.0.1:44113/mcp`
3. Re-run the baseline: `mcp__holocron_deep_research` (small factual topic) →
   poll `mcp__holocron_deep_research_result` → must complete with evidence-gated
   findings (quotes/citations, no tool error).
4. SSE sanity: `GET /mcp` streams (optional).
5. `deploy:verify` external identity/readiness certification passes.

## 5. Rollback

If the deploy regresses: `holo deploy:rollback-preflight` against the previous
lock, or restore the pre-edit compose.yaml (lock sha mismatch forces a clean
re-apply). Volumes were never touched. The previous release lock + record are
preserved under `/tmp/CUTOVER-RELEASE-001/` and `.tmp/REDHAT-FIX-S29-DEPLOY/`.

## 6. Out of scope (observed but not part of this fix)

- `otel-collector` container reports `unhealthy` — separate observability
  issue, addressed by host-HEAD commit bcb59e84's healthcheck fix on next
  natural deploy; not the /mcp blocker.
- The holocron-mcp access proxy (bun, :44113) and cloudflared tunnel: no changes.

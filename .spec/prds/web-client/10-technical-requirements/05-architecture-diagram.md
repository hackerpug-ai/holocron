---
stability: CONSTITUTION
last_validated: 2026-08-29
prd_version: 1.0.1
---

# Architecture Diagram

```
                                  READERS                        OPERATOR
                          (no account, ever)                 (one identity)
                                     |                              |
                                     v                              v
    ┌───────────────────────────── docs.holocrnlib.com ─────────────────────────────┐
    │                    Next.js 16 on Cloudflare Workers (vinext)                   │
    │                                                                                │
    │   app/(public)/                              app/(app)/  +  app/(auth)/        │
    │   ├── /d/[token]            Server Comp.     ├── /chats/[[...id]]   client     │
    │   │     no auth · no tRPC · own headers      ├── /library          server+isle │
    │   ├── /d/[token]/assets/[id]  Route Handler  ├── /library/[id]     server+isle │
    │   └── not-found · error                      └── /sign-in                      │
    │        ▲                                            │                          │
    │        │ NO session read, NO Set-Cookie,             │  BetterAuth session      │
    │        │ NO Vary: Cookie  ── structural ──           │  (protectedProcedure)    │
    │        │                                            v                          │
    │   ┌────┴──────────────┐                    ┌────────────────────┐              │
    │   │ caches.default    │                    │  tRPC BFF router   │              │
    │   │ 60s · 200 AND 404 │                    │  documents · lib   │              │
    │   │ Cache-Control +   │                    │  research · chat   │              │
    │   │ CF-CDN-Cache-Ctrl │                    │  conversations     │              │
    │   └───────────────────┘                    │  device.status     │              │
    │                                            └─────────┬──────────┘              │
    │                                                      │                         │
    │                                    ┌─────────────────┴──────────────┐          │
    │                                    │  AI SDK agent loop (streamText)│          │
    │                                    │  + MCP client (Streamable HTTP)│          │
    │                                    └─────────────────┬──────────────┘          │
    └──────────────────────────────────────────────────────┼─────────────────────────┘
                                                           │
                  CF Access service token  +  scoped bearer key (DISJOINT scopes)
                                                           │
    ┌──────────────────────────── origin-docs.holocrnlib.com ─────────────────────────┐
    │                    Hono on the holocron device  —  IT SLEEPS                     │
    │                                                                                  │
    │   /article/:token          ← public reader   (returns HTML today — see §API)     │
    │   /article/:token/assets/:id  ← already correct, previously unreachable          │
    │   /mcp, /mcp/*             ← stateless Streamable HTTP MCP gateway   [mcp scope] │
    │   /api/*                   ← documents · publish · chat-runs        [rn scope]  │
    │                                                                                  │
    │   Postgres: documents (FTS + vector) · conversations · researchSessions          │
    │             file_objects · document_assets · BlobStore on disk                   │
    └──────────────────────────────────────────────────────────────────────────────────┘

    {external}  Anthropic API (from the Worker)   ·   LiteLLM fleet 127.0.0.1:4545
                                                      UNREACHABLE from the edge
    {retired}   packages/docs-reader        ·   {untouched} Expo app + Zero sync
```

## Reading the diagram

**The public path never crosses the auth boundary.** `/d/[token]` and its asset route sit in a
route group whose layout chain contains no session read. That is why a stranger never sees a
sign-in, and also why the edge cache works at all — a `Set-Cookie` or `Vary: Cookie` on that
response would silently fragment the cache per user and collapse the hit rate.

**Everything crosses the tunnel with two credentials, not one.** Cloudflare Access authenticates the
Worker to the origin; a scoped bearer key authorises the specific surface. The scopes are
**disjoint** — an `mcp`-scoped key on `/api/*` returns 403 and vice versa.

**The device sleeps.** Every arrow crossing into the origin box is a call that can time out. That is
why `device.status` exists and why it is the only procedure permitted to resolve on failure.

---

_Composed from the `system_components` blocks of all five architecture lenses._

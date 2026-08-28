# Holocron Web Client — Design Brief

**Status:** brainstorm output, pre-PRD
**Date:** 2026-08-28
**Stack:** Next.js on Cloudflare Workers via vinext · tRPC (BFF) · shadcn/ui + AI Elements · AI SDK agent loop · platform-on-device over the tunnel

---

## 1. Decisions

| # | Question | Decision |
|---|---|---|
| 1 | Who loads it? | **Operator cockpit behind auth + edge-cached public read pages**, one codebase, two faces |
| 2 | What's it for? | Reading/searching the archive, talking to the agent, packaging research to send. **Feed/triage cut** until a real recommendation engine exists |
| 3 | Shape? | **Two destinations: Chats + Library.** Mobile app is the functional reference, not the design reference |
| 4 | Agent ceremony? | **It answers and executes.** Tools = the MCP surface, Claude-Code-style inline feel. No plan/confirm/approve ladder |
| 5 | Share unit? | **One document, one link** |
| 6 | Look & feel? | **Holocron — lean into the name**, governed by the chrome-vs-column rule (§6) |
| 7 | Auth? | **BetterAuth**, tables in the platform Postgres |
| 8 | Data transport? | **tRPC as BFF** — requests + TanStack Query caching. Zero stays mobile-only |
| 9 | Agent location? | **AI SDK loop runs in the BFF**, calling the device's MCP gateway over the tunnel |
| 10 | Domain? | **The Next app envelops `docs.holocrnlib.com`** — existing share links keep working unchanged |

**Scope:** complete UI/UX rewrite. Non-visual backend logic lifted only where it earns its place.

---

## 2. Architecture

```
                          docs.holocrnlib.com          ← Next.js on Cloudflare Workers
                          ├─ /d/<token>                PUBLIC. Server Component, no auth, no tRPC.
                          │                            Edge-cached 60s. Renders markdown + assets.
                          └─ /*                        OPERATOR. BetterAuth. tRPC + TanStack Query.
                               ├─ tRPC router          the BFF
                               │   ├─ queries          documents, search, conversations
                               │   └─ chat.stream      async generator → httpBatchStreamLink
                               └─ AI SDK agent loop    streamText + MCP tools

                                        │ tunnel (CF Access service token)
                                        ▼
                          origin-docs.holocrnlib.com   ← Hono on the holocron device
                          ├─ /mcp, /mcp/*              Streamable HTTP MCP gateway (stateless)
                          ├─ /api/*                    documents, research, uploads, publish
                          └─ Postgres                  documents, conversations, sessions, BetterAuth
```

### Hosting — vinext, not OpenNext

Cloudflare's **default** Workers path for Next.js is **vinext**, a Vite plugin that reimplements the Next.js API surface. `app/`, `pages/`, `next.config.js` and `public/` stay as they are; no Cloudflare-specific template. OpenNext (`@opennextjs/cloudflare`) is now the fallback for existing apps that can't migrate — **not** the default for new work, whatever older guides say.

```bash
npx vinext check            # compatibility gate — run this before committing to the stack
npx vinext init             # choose Cloudflare Workers
npx @vinext/cloudflare deploy
```

**vinext is in beta.** Run the check and read the compatibility dashboard before treating this as settled.

Three consequences that reach into the design:

- **Bindings are server-only.** `import { env } from 'cloudflare:workers'`, never from a Client Component.
- **Image optimization is only partial.** The public reader must serve document assets straight from the origin asset route rather than leaning on `next/image` optimization — which is fine, because that route already exists and already carries the correct `is_public` join.
- **`middleware.ts` and `proxy.ts` are both supported**, so BetterAuth route protection has a normal home.

### Component libraries are Open Code

shadcn/ui and AI Elements are **not importable packages**. Their CLIs copy source into the repo — `components/ui/` and `components/ai-elements/` — and you edit the copies. AI Elements is a shadcn *registry*, not a second design system, installed with `npx ai-elements@latest` (which wraps the shadcn CLI). React 19, Tailwind v4 (`@import "shadcn/tailwind.css"`).

This matters more than it looks: the holocron design language in §6 is implemented **by editing the copied components**, not by wrapping or overriding a vendored library. There is no upstream to fight.

### The domain envelopment

Today `docs.holocrnlib.com` is a standalone Worker (`holocron-docs-reader`) that serves exactly `^/d/<token>$`. The Next app takes over that hostname; the standalone Worker retires.

**Hard constraint: `/d/<token>` URLs must keep working, byte for byte.** They are already in the wild, and more importantly the MCP `share_document` tool *promises that URL shape in its description* to every agent session that calls it — see `holocron-mcp/src/mastra/stdio.ts:213` and `services/platform/src/tools/registry.ts:196`. The constant is duplicated in two files carrying an explicit lockstep comment:

- `services/platform/src/public-docs.ts` → `PUBLIC_DOCS_ORIGIN` + `buildPublicShareUrl()`
- `app/zero/platform.ts` → `PUBLIC_DOCS_ORIGIN`

Neither changes. Only what answers the request changes.

**Carry these cache semantics over verbatim** — they are easy to lose and expensive to lose:

- `Cache-Control: public, max-age=60, s-maxage=60`
- `Cloudflare-CDN-Cache-Control: max-age=60` — this exists specifically to beat the free-plan zone's **7200s edge TTL floor**. Drop it and unsharing takes two hours to take effect.
- **Cache 404s too.** Unshare → origin 404 → cached "no longer shared" page. This is what keeps revocation cheap instead of hammering the device.
- 60s is simultaneously the freshness window and the revocation SLA. That's the deal; it's a good deal; don't renegotiate it accidentally.

**Public pages do not go through tRPC.** `/d/[token]` is a Server Component that queries the device directly and sets its own cache headers. tRPC exists for the authenticated app, where TanStack Query's cache is the point. Routing public traffic through tRPC adds a serialization layer and fights the caching model for zero benefit.

### The agent

The BFF runs the AI SDK loop and attaches to the device's MCP gateway as an MCP client over Streamable HTTP.

This works because the gateway already exists and is already stateless: `createMcpServer()` registers every tool from `listTools()` — the same registry, the same schemas, the same executor that Claude Code talks to. `sessionIdGenerator: undefined`, `enableJsonResponse` toggled by the `Accept` header, progress notifications forwarded. Mounted at `app.all('/mcp')` and `app.all('/mcp/*')`.

**One thing to verify on first contact:** the transport sets `allowedOrigins: [request.url origin]` with `enableDnsRebindingProtection: true`. Server-to-server calls from a Worker normally send no `Origin` header, so this should pass — but prove it with a real call before building on it.

### Streaming through tRPC

`httpBatchStreamLink` + an async-generator procedure. Verified against the reference you gave:

> **tRPC #6103 (closed, unresolved):** tRPC transforms every output, so you cannot hand back the raw HTTP response the AI SDK expects. Streaming works by combining tRPC streaming with the `ai` package — but **`useChat` and `useCompletion` are unavailable.**

That cost is bounded, because **AI Elements do not require `useChat`.** Verified from the component API: `ToolHeader` takes `type` and `state` (`input-streaming | input-available | output-available | output-error`), `ToolInput` takes `input`, `ToolOutput` takes `output` and `errorText`; the docs state the components can be driven independently of the hook.

So: keep client state in AI SDK's `UIMessage` shape, fold streamed parts into it with a reducer (~150 lines), and every AI Element renders natively. You trade one hook for full end-to-end type safety across the whole app.

### Data flow rule that kills the duplicate-card bug

> **The stream carries invalidations. The query carries truth.**

A card renders from `trpc.documents.byId` / `trpc.research.byId`, keyed by record id. The chat stream never carries a card's contents — it carries "record X changed," and the client invalidates that query. A card cannot double, because there is only ever one of it and it has one source.

---

## 3. What already exists — do not rebuild

Verified in the repo, not recalled.

**MCP gateway** — `src/mcp/gateway.ts` + `src/mcp/executor.ts` (75KB). Stateless Streamable HTTP, shared registry. The BFF agent's entire tool surface.

**The Library is one table.** `documents` carries `title`, `content`, `category`, `status`, `researchType`, `iterations`, `isPublic`, `shareToken`, `publishedAt`, plus a generated `search_vector` with a GIN index. Research outputs, transcripts, and digests all land here. Hybrid search (FTS + vector) exists server-side.

**The share flow** — `POST /api/documents/:id/publish` flips `is_public` and mints `share-<uuid>`. Origin `GET /article/:shareToken` and `GET /article/:shareToken/assets/:fileObjectId` both exist with correct `is_public` joins. The asset route is *already written* — it has simply never been reachable (§4).

**Convex is gone and enforced.** `bun run verify:no-convex-client` → `zero convex/react client imports (clean)`, plus a `verify-no-convex-env` build gate. Only `legacyConvexId` columns remain. Nothing to migrate.

**Zero stays on mobile.** `app/zero/schema.ts` syncs 19 tables for the RN app. The web client does not use it — tRPC replaces it there. Don't delete it; don't extend it for web.

**The platform chat pipeline stays on mobile.** `POST /api/chat-runs`, `GET /api/chat-runs/:id/events` (SSE with `Last-Event-ID` replay), `POST /api/chat-runs/:id/cancel`. Web does not use it (see §7).

---

## 4. Verified defects — fixed by the rewrite, deliberately

Both confirmed by executing the real code.

### Images vanish from every shared document

The public renderer has **no image rule**:

```
"![Chart](https://example.com/a.png)"
  => <p>!<a href="https://example.com/a.png" rel="noopener noreferrer">Chart</a></p>

"![Local](/article/share-abc/assets/f123)"
  => <p>!<a href="#" rel="noopener noreferrer">Local</a></p>
```

The link regex swallows the `[alt](url)` half and leaves a literal `!`. Relative paths collapse to `href="#"` because the sanitizer only permits `http`-prefixed URLs.

### The Worker cannot serve assets

Route regex is `^/d/([^/]+)$`. Ran the real handler:

```
/d/share-1111…1111              => 200  (origin fetched)
/d/share-1111…1111/assets/abc   => 404  "No longer shared"
```

The origin implements the asset route correctly; nothing on the public domain routes to it.

**Combined: every shared document is silently text-only** — charts, screenshots and diagrams replaced by a stray `!` and a dead link, no error anywhere.

Both die when Next renders `/d/[token]`: a real markdown renderer handles images, and `/d/[token]/assets/[id]` is just another route proxying the origin endpoint that already works.

### Duplicate cards

Root cause: **a card is currently both a message row and a live view of a record, and both render.** The backend writes `message_type: 'result_card' | 'agent_plan' | 'tool_approval'` rows into `chatMessages`, while components like `DeepResearchLoadingCardWithPolling` separately watch the record in Zero. `MessageBubble.tsx` (30KB) already contains a literal *"Suppress iteration cards entirely"* branch and an *"if renderResultCard returns null, suppress the entire message"* path — symptom patches.

Structurally impossible under the §2 rule: stream carries invalidations, query carries truth.

---

## 5. MVP — two surfaces

### Chats

ChatGPT-shaped. Conversation list left, thread center.

- `chat.stream` tRPC procedure: async generator, `httpBatchStreamLink`, yielding `UIMessage` parts.
- AI SDK agent loop in the BFF; tools from the device MCP gateway.
- Tool calls render inline and unceremonious — one collapsed `<Tool>` per call (`searched holocron · 12 results`), expandable for input/output. Claude Code's register: terse, factual, no approval gate.
- **Commands carry over** (`/research`, `/deep-research`, `/search`, `/browse`, `/stats`, `/help`) via `PromptInput` with a `⌘K` palette. Execution feel matches a local Claude Code run.
- Cards render from records, keyed by id, refreshed by stream invalidations.
- Cancel always available on an in-flight run.
- **Long research runs stay device jobs.** The agent kicks off a `researchSession` and returns; the card polls. A twenty-minute run must never live inside a Worker request.

### Library

Everything in `documents`, one searchable surface.

- Hybrid search (FTS + vector), already server-side — needs a tRPC procedure and a query surface.
- Filter chips over `category`, `researchType`, `status`, shared/not-shared.
- Document view: clean reading column, working images, citations, heading anchors.
- **Share:** toggle public → `https://docs.holocrnlib.com/d/<token>` → copy. Unshare kills it in ≤60s. Share state visible on the row, so "what have I published" is answerable at a glance.
- Select text → *Ask about this* → opens Chats with the passage quoted. **The only AI affordance in the Library.**

### Public reader — `/d/[token]`

Server Component, no auth, no tRPC, own cache headers. Real markdown, working images, OG tags, fast. Same design identity in header and edges; calm paper in the body.

### Out of MVP

Feed/triage · collections · shared chat threads · narration & TTS · subscriptions management · toolbelt · improvements tracker · shop · assimilation UI · voice · podcast transcription UI · multi-user accounts.

Most stay reachable **through commands in chat** rather than as nav destinations. That's the payoff of wiring the MCP surface in: the verticals don't each need a screen.

### On lifting from mobile

**Keep the reader's substance, drop the rig.** `article-detail.tsx` is 900+ lines dominated by narration — per-paragraph highlight maps, playback progress per document, a control bar. That value is *walking around with headphones*; it doesn't transfer to a desktop browser. Keep markdown rendering, citations, heading anchors, text selection. Leave narration on mobile.

**Worth lifting:** markdown→AST utilities, citation/source extraction, search query shapes, the publish/share flow.
**Not worth lifting:** anything under `components/` (Paper, NativeWind, mobile idioms), and the card rendering in `MessageBubble`/`ChatThread` — that's the code carrying the duplicate-card defect.

---

## 6. Look & feel — "the shell is a holocron, the page is paper"

Deep dark field, luminous edges, crystalline geometry, one or two vivid accents, motion on state change.

The failure mode is obvious — sci-fi chrome versus 4,000-word research documents. One rule resolves it:

> **Identity lives in the chrome. Calm lives in the column.**

| Holocron treatment | Stays quiet |
|---|---|
| Nav rail, conversation list, headers | The reading column |
| Chat surface, message frames, streaming cursor | Long-form body text |
| Cards (research, documents, tools) | Search result text |
| Loading, progress, state transitions | The public page body |
| Empty states, edges, focus rings | Anything over ~500 words |

A research card can glow at its edges and animate as it fills; the 4,000 words inside the document it produced sit in a high-contrast, generously-spaced column with no chrome inside the measure. The public page keeps the identity in a slim header and its edges and is otherwise a well-set essay — a stranger with no context needs legibility, not atmosphere.

Dark is default and native. Light must be genuinely good: shared links get opened in daylight on other people's screens.

Token names carry over from the existing shadcn-style CSS variables (`--background`, `--foreground`, `--primary`, `--card`, `--muted`, …). New values, same contract.

---

## 7. Accepted costs

Consequences of running the agent in the BFF. All chosen deliberately; recorded so they don't get rediscovered as surprises.

**Two agents.** The BFF agent serves web; the platform's Mastra chat-run pipeline continues serving mobile. They will drift — prompts, tool selection, memory. Accepted. Revisit if mobile is ever migrated to the same BFF.

**A tunnel round trip per tool call.** A six-tool turn pays six Worker→device round trips. Mitigation if it bites: batch or coarsen tools at the registry level, which benefits Claude Code too.

**No reload-resume.** The platform's durable event log with `Last-Event-ID` replay stays on the device and serves mobile; a stateless Worker has no equivalent. Drop the connection mid-answer and the turn is gone. Cheapest later fix: write agent events back through tRPC (batched — not per token) and accept a cursor in `chat.stream`. Second option: a Durable Object per run.

**Workers Paid is probably required.** An agent loop needs real CPU; Workers Free allows 10ms per request. Time spent awaiting `fetch` doesn't count against CPU, so a long streaming turn is fine on Paid. **Confirm the account's Workers plan before building** — note the existing Worker's comment implies a *free zone* plan, which is a separate thing from the Workers plan and doesn't answer this.

**No offline Library.** Zero's local cache was the thing that made the library browsable while the device slept; tRPC has no equivalent. Public links still survive on edge cache for their 60s window.

---

## 8. Open decisions

1. **Does the RN app stay maintained?** Determines whether lifted logic needs a shared home or the web client can fork freely.
2. **Does `/deep-research` need any supervision affordance** beyond cancel, given a run can burn 20 minutes and real API spend?
3. **Should the apex `holocrnlib.com` also bind to the app**, with `docs.` kept as a permanent alias? Costs nothing, and "docs" is an odd name for what is now the whole product.
4. **Where do BetterAuth sessions live** if you ever want to log in while the device is asleep. Default for now: platform Postgres with the session cookie cache enabled, so ordinary navigation doesn't round-trip.

---

## 9. Build order

0. **`npx vinext check`** — before anything else. vinext is beta and it either supports this app shape or it doesn't; finding out after step 3 is expensive.
1. **`/d/<token>` in Next, at full URL compatibility** — real markdown, working images served from the origin asset route, `/assets/[id]`, and the exact cache semantics from §2. Retire `worker-docs-reader`. Fixes both live defects; independently shippable; touches nothing else.
2. **Shell + auth** — Next on Workers, BetterAuth, two destinations, the holocron design system with the chrome/column rule enforced from the first component.
3. **tRPC BFF + Library** — router, TanStack Query, hybrid search, filters, document view, share toggle.
4. **Chats** — `chat.stream` generator, AI SDK loop, MCP client attach, the `UIMessage` reducer, AI Elements, commands, record-keyed cards.
5. **Ask-about-this** — the single bridge from Library into Chats.

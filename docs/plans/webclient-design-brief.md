# Holocron Web Client — Design Brief

**Status:** brainstorm output, pre-PRD
**Date:** 2026-08-28
**Stack:** Next.js + shadcn/ui + AI Elements, deployed on Cloudflare Workers, reaching the holocron device over the existing tunnel

---

## 1. The six decisions

| # | Question | Decision |
|---|---|---|
| 1 | Who loads it? | **Operator cockpit behind auth + edge-cached public read pages**, one codebase, two faces |
| 2 | What's it for? | Reading/searching the archive, talking to the agent, packaging research to send — **feed/triage cut** until a real recommendation engine exists |
| 3 | Shape? | **Two destinations: Chats + Library.** No feed. Mobile app is the functional reference, not the design reference |
| 4 | Agent ceremony? | **It answers and executes.** Tools = the MCP surface, executed with Claude-Code-style inline feel. No plan/confirm/approve ladder |
| 5 | Share unit? | **One document, one link.** No collections, no shared chat threads |
| 6 | Look & feel? | **Holocron — lean into the name.** Governed by the discipline rule in §6 |

**Auth:** BetterAuth (not Cloudflare Access) for the operator side.

**Scope:** complete UI/UX rewrite. Non-visual backend logic may be lifted where it earns its place.

---

## 2. What already exists — do not rebuild

Verified in the repo, not recalled.

### Zero sync covers the whole data layer

`app/zero/schema.ts` already syncs 19 tables: `conversations`, `chatMessages`, `toolCalls`, `agentPlans`, `agentPlanSteps`, `researchSessions`, `researchIterations`, `documents`, `audioJobs`, `audioSegments`, `feedItems`, `subscriptionSources`, `subscriptionContent`, `whatsNewReports`, `appSettings`, `improvementRequests`, `assimilationSessions`, `notifications`, `fileObjects`.

Zero has a first-class browser client. The web app reuses this exact schema instead of inventing a REST layer — and gets reactive updates plus a local IndexedDB cache for free. **Consequence: the Library stays browsable when your device is asleep.**

### The Library is essentially one table

`documents` carries `title`, `content`, `category`, `status`, `researchType`, `iterations`, `isPublic`, `shareToken`, `publishedAt`, plus a generated `search_vector` with a GIN index. Research outputs, transcripts, and digests all land here. Hybrid search (FTS + vector) already exists server-side.

"Browse the library" is **one well-indexed surface**, not eight verticals.

### The public read path is built

```
docs.holocrnlib.com/d/<token>          Cloudflare Worker `holocron-docs-reader`
  ├─ caches.default hit → return (60s TTL)
  └─ miss → origin-docs.holocrnlib.com/article/<token>
             with CF-Access-Client-Id/Secret service headers, 10s timeout
             → Hono on the device → Postgres WHERE share_token = ? AND is_public = true
             → self-contained HTML
```

Notable details worth preserving:

- The Worker sets `Cloudflare-CDN-Cache-Control: max-age=60` specifically to beat the free-plan zone's 7200s edge TTL floor. **60s is simultaneously the freshness window and the revocation SLA.**
- 404s are cached too, so unsharing propagates in ≤60s and doesn't hammer origin.
- Token shapes accepted: `share-<uuid>`, `mcp-<uuid>`, bare uuid, `share-word-word`.

### Chat is a durable run with a replayable event log

- `POST /api/chat-runs` → creates a run
- `GET /api/chat-runs/:id/events` → SSE, honours `Last-Event-ID`, replays from `listChatEvents(runId, cursor)`, 30s window per connection
- `POST /api/chat-runs/:id/cancel` → cancel

This is materially better than a raw provider stream: **reload the page mid-answer and it resumes from the event log.** The web client must not throw this away by adopting a transport that assumes a single unrepeatable stream.

### MCP tools are already server-side

`src/mcp/executor.ts` (75KB) + `src/mcp/gateway.ts`. The agent's tool surface already exists and is already the same surface Claude Code sees. The web client does not define its own tools.

---

## 3. What's broken — verified by execution

### Defect 1: images vanish from every shared document

The public renderer's markdown converter has **no image rule**. Ran against the real function:

```
"![Chart](https://example.com/a.png)"
  => <p>!<a href="https://example.com/a.png" rel="noopener noreferrer">Chart</a></p>

"![Local](/article/share-abc/assets/f123)"
  => <p>!<a href="#" rel="noopener noreferrer">Local</a></p>
```

The link regex swallows the `[alt](url)` half and leaves a literal `!`. Relative paths collapse to `href="#"` because the sanitizer only permits `http`-prefixed URLs.

### Defect 2: the Worker cannot serve assets

Route regex is `^/d/([^/]+)$`. Ran the real handler:

```
/d/share-1111…1111              => 200  (origin fetched)
/d/share-1111…1111/assets/abc   => 404  "No longer shared"
```

The origin *does* implement `GET /article/:shareToken/assets/:fileObjectId` with a correct `is_public` join — but it's behind Access on the tunnel and nothing on the public domain routes to it.

**Combined impact: every shared document is silently text-only.** Charts, screenshots, and diagrams are replaced by a stray `!` and a dead link, with no error surfaced anywhere. This is in the MVP, not the backlog.

### Defect 3: duplicate cards (the mobile jank you named)

Root cause, plainly: **a card is currently both a message row and a live view of a record, and both render.**

The backend writes `message_type: 'result_card' | 'agent_plan' | 'tool_approval'` rows into `chatMessages`. Separately, components like `DeepResearchLoadingCardWithPolling` watch the underlying `researchSessions` record in Zero and render their own card. Two sources of truth for one fact.

The code already knows: `MessageBubble.tsx` (30KB) contains a literal *"Suppress iteration cards entirely — they're consolidated in DeepResearchLoadingCard"* branch and an *"if renderResultCard returns null, suppress the entire message"* path. Those are symptom patches.

**The rewrite rule that fixes it structurally:**

> A card renders **from the record**, keyed by its id. A message row holds only a *reference* to a record. A card can never double, because there is only ever one of it.

---

## 4. MVP — two surfaces

### Chats

ChatGPT-shaped. Conversation list on the left, thread in the center.

- Streaming answers over the existing chat-run SSE, with **resume after reload** (the `Last-Event-ID` path already supports this — use it).
- Tool execution inline and unceremonious: one collapsed line per tool (`searched holocron · 12 results`), expandable to see arguments and output. Claude Code's register — terse, factual, no approval gate.
- Tools are the **MCP surface**, unmodified.
- **Commands carry over** from mobile (`/research`, `/deep-research`, `/search`, `/browse`, `/stats`, `/help`) with a `⌘K`-style palette in the composer. Execution feel matches a local Claude Code run: the command echoes, streams, and lands as a result.
- **Cards render from records.** Deep research and returned documents get one card each, keyed by session/document id, live-updating via Zero.
- Cancel is always available on an in-flight run.

### Library

Everything in `documents`, one searchable surface.

- Hybrid search (FTS + vector) — already server-side, just needs a query surface.
- Filter chips over `category`, `researchType`, `status`, and shared/not-shared.
- Document view: clean markdown reading column, working images, citations, headings with anchors.
- **Share:** toggle public → get `docs.holocrnlib.com/d/<token>` → copy. Unshare kills it in ≤60s. Show the share state on the row so "what have I published" is answerable at a glance.
- Select text → *Ask about this* → opens Chats with the passage quoted as context. **This is the only AI affordance in the Library.**

### Public page

The reader a stranger sees. Same design identity in header and edges, calm paper for the body. Fixes Defects 1 and 2. Real markdown renderer, working images, OG tags, fast.

### Explicitly out of MVP

Feed / triage · collections · shared chat threads · narration & TTS · subscriptions management · toolbelt · improvements tracker · shop · assimilation UI · voice · podcast transcription UI · multi-user accounts.

Most of these stay reachable **through commands in chat** rather than as nav destinations. That is the point of wiring the MCP surface in: the verticals don't each need a screen.

### Recommendations on the two things you left open

**The reader — keep the substance, drop the rig.** `article-detail.tsx` is 900+ lines dominated by narration: per-paragraph highlight maps, playback progress persisted per document, a control bar. That value is *walking around with headphones*; almost none of it transfers to a desktop browser. Keep markdown rendering, citations, heading anchors, and text selection. Leave narration on mobile where it earns its keep.

**Lift these, rewrite the rest.** Worth lifting: the markdown→AST utilities, citation/source extraction, search query shapes, and the share/publish flow. Not worth lifting: any component under `components/` (mobile idioms, Paper, NativeWind) and the card rendering in `MessageBubble`/`ChatThread` — that's the code carrying Defect 3.

---

## 5. Look & feel — "the shell is a holocron, the page is paper"

The chosen direction leans into the name: deep dark field, luminous edges, crystalline geometry, one or two vivid accents, motion on state change.

The obvious failure mode is that sci-fi chrome and 4,000-word research documents fight each other. One rule resolves it:

> **Identity lives in the chrome. Calm lives in the column.**

| Gets the holocron treatment | Stays quiet |
|---|---|
| Nav rail, conversation list, headers | The reading column |
| Chat surface, message frames, streaming cursor | Long-form body text |
| Cards (research, documents, tools) | Search results text |
| Loading, progress, state transitions | The public page body |
| Empty states, edges, focus rings | Anything over ~500 words |

Concretely: a research card can glow at its edges and animate as it fills; the 4,000 words inside the document it produced are set in a high-contrast, generously-spaced column with no chrome inside the measure. The public page keeps the identity in a slim header and its edges, and is otherwise a well-set essay — because a stranger with no context needs legibility, not atmosphere.

Dark is the default and the native register. Light exists and must be genuinely good, because shared links get opened in daylight on other people's screens.

Token names carry over from the existing shadcn-style CSS variables (`--background`, `--foreground`, `--primary`, `--card`, `--muted`, …). New values, same contract — so the mobile app and web client stay conceptually aligned without sharing components.

---

## 6. Architecture

```
Browser
 ├─ Next.js app (Cloudflare Workers)      operator UI, BetterAuth, route handlers
 ├─ Zero client (WebSocket → tunnel)      documents, conversations, messages, records
 └─ SSE (via Next route handler → tunnel) in-flight chat run events only

docs.holocrnlib.com/d/<token>             existing Worker, public read (+ new assets route)
```

**Zero is truth. SSE is in-flight only.**
Message rows, documents, research sessions, and tool calls all arrive via Zero. The SSE stream carries only tokens and progress for a run that is currently executing. Once a run completes, the stream contributes nothing Zero doesn't already have. This split is what makes Defect 3 structurally impossible to reintroduce.

**AI Elements as presentation.** AI Elements are shadcn-style components; they don't require AI SDK's default transport. Recommended: implement a small custom `ChatTransport` mapping the platform's chat-run SSE events into AI SDK UI message parts (~100 lines), which lets `useChat` own message state and lets AI Elements render tool parts natively. Alternative if that fights back: drive the components from a hand-rolled hook over the SSE. **Do not** adopt a transport that assumes an unrepeatable single stream — that discards the `Last-Event-ID` resume the platform already gives you.

**BetterAuth tables in the platform Postgres.** One database, one migration system (Drizzle is already there), no new infrastructure. Enable BetterAuth's session cookie cache so ordinary navigation doesn't round-trip to the device.
*Skipped: an edge session store (D1/hosted Postgres). Add it when you actually want to log in while the device is asleep — noting that logging into an empty app is of limited use, since Zero's local cache already covers read-only browsing of what you've already synced.*

**Two auth mechanisms, deliberately.** The operator app uses BetterAuth. The public reader Worker keeps its Cloudflare Access service token to reach origin. These are separate paths with separate threat models; that's fine as long as it's written down. It is now.

**Device offline:** Library browsable from Zero's local cache; chat unavailable with an honest banner; public links keep serving from edge cache for their 60s window and then fail.

---

## 7. Open decisions

1. **Does the RN app stay maintained?** If yes, lifted logic needs to live somewhere both consume. If it's headed for retirement, the web client can fork freely and move faster.
2. **Which commands survive the port**, and does `/deep-research` need *any* supervision affordance given a run can burn 20 minutes and real API spend? Cancel exists; the question is whether cancel is sufficient.
3. **Custom `ChatTransport` vs hand-rolled hook** — decide after one spike against the real SSE endpoint.
4. **Does the public page get its own design pass or inherit the operator document view?** Leaning: shares the reading column, differs in header and navigation.

---

## 8. Build order

1. **Fix public sharing** — real markdown renderer with images, `/d/<token>/assets/<id>` route on the Worker. Smallest diff, largest visible gain, independently shippable today.
2. **Shell + auth** — Next.js on Workers, BetterAuth, two destinations, the holocron design system with the chrome/column rule enforced from the first component.
3. **Library** — Zero-backed list, hybrid search, filters, document view, share toggle.
4. **Chats** — SSE transport with resume, MCP tool lines, commands, record-keyed cards.
5. **Ask-about-this** — the single bridge from Library into Chats.

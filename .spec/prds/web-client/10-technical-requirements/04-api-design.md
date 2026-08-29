---
stability: CONSTITUTION
last_validated: 2026-08-29
prd_version: 1.0.1
---

# API Design

Three distinct surfaces, with different auth and different caching:

1. **Public HTTP** — `/d/<token>` and `/d/<token>/assets/<id>`. No auth, edge-cached, own headers.
2. **The tRPC BFF** — every authenticated operator operation, including the streaming chat turn.
3. **Device calls** — what the BFF issues over the tunnel: the MCP gateway and `/api/*`.

## The tRPC BFF surface

| Kind | Procedure | Purpose | Auth |
|---|---|---|---|
| `stream` | `chat.stream` | Run one agent turn. Streaming MUTATION (async function*). Hosts the AI SDK loop with the device MCP tool surface attached; yields text/reasoning/tool  | protectedProcedure - BetterAuth session required. Tool calls execute under the B |
| `query` | `documents.byId` | THE truth source for a document card and the document reading view. Every document card in the transcript renders from this, keyed by id. | protectedProcedure. Device call: MCP get_document. |
| `query` | `documents.search` | Hybrid FTS+vector search over the whole documents table with filter chips applied server-side. The Library's primary retrieval surface. | protectedProcedure. Device call: MCP hybrid_search. Requires the device-side sch |
| `query` | `documents.list` | Default (no-query) Library browse and the shared audit view. Cursor-paginated infinite query. | protectedProcedure. Device call: MCP list_documents. nextCursor: null is REQUIRE |
| `mutation` | `documents.share` | Flip a document public and return the canonical share URL for copy. | protectedProcedure. Device call: MCP share_document. shareUrl is passed through  |
| `mutation` | `documents.unshare` | Revoke a public link. Returns the stated propagation bound so the UI can say '<=60s', not 'soon'. | protectedProcedure. Device call: MCP unshare_document (NOT share_document with i |
| `query` | `research.byId` | THE truth source for a research card. Carries REAL progress fields so the card's animation is driven by run state and never by a timer, plus the serve | protectedProcedure. Device call: MCP deep_research_result with waitMs: 0 (never  |
| `mutation` | `research.cancel` | Cancel a device research job. REQUIRED as a distinct surface: aborting the chat stream aborts the turn, NOT a job the turn already dispatched to the d | protectedProcedure. Device call: MCP deep_research_control with action: 'cancel' |
| `query` | `conversations.list` | The Chats sidebar. Cursor-paginated. | protectedProcedure. BLOCKED on FR-BFF-12 - no device endpoint exists today. |
| `query` | `conversations.byId` | Load a thread's persisted history on navigation or reload. Returns messages already in UIMessage shape so the reducer's initial state is a straight as | protectedProcedure. BLOCKED on FR-BFF-12. |
| `mutation` | `conversations.rename` | Rename a thread. | protectedProcedure. Device call: REST PATCH /api/conversations/:id (exists today |
| `mutation` | `conversations.delete` | Delete a thread. | protectedProcedure. Device call: REST DELETE /api/conversations/:id (exists toda |
| `query` | `device.status` | Short-timeout reachability probe so the shell can show an honest 'device is asleep' banner without every Library query first burning a 10s timeout. | protectedProcedure. Device call: REST GET /health with a 3000ms timeout. This pr |

### Contracts

#### `chat.stream` (stream)

Run one agent turn. Streaming MUTATION (async function*). Hosts the AI SDK loop with the device MCP tool surface attached; yields text/reasoning/tool parts, record placements, and cache invalidations. Never yields a record's contents.

**Request**
```
z.object({ clientTurnId: z.uuid(), conversationId: z.uuid().nullable(), message: z.object({ text: z.string().min(1).max(32_000) }), quote: z.object({ documentId: z.uuid(), text: z.string().min(1).max(4_000), anchor: z.string().max(200).optional() }).optional() })
```

**Response**
```
AsyncGenerator<ChatStreamPart> where ChatStreamPart = discriminated union on `type`: 'turn-start' {conversationId,messageId,clientTurnId} | 'text-delta' {id,delta} | 'reasoning-delta' {id,delta} | 'tool-input-start' {toolCallId,toolName} | 'tool-input-available' {toolCallId,toolName,input:unknown} | 'tool-output-available' {toolCallId,output:unknown} | 'tool-output-error' {toolCallId,errorText} | 'record-ref' {kind:'document'|'research', id} | 'invalidate' {kind:'document'|'research'|'documentList', id?} | 'turn-finish' {messageId,finishReason,usage?} | 'turn-error' {code,message,retriable}
```

**Auth.** protectedProcedure - BetterAuth session required. Tool calls execute under the BFF's HOLO_KEY_MCP credential, never a user-supplied one.

---

#### `documents.byId` (query)

THE truth source for a document card and the document reading view. Every document card in the transcript renders from this, keyed by id.

**Request**
```
z.object({ id: z.uuid() })
```

**Response**
```
z.object({ id, title, content, category, researchType, status, isPublic, shareToken, shareUrl, publishedAt, createdAt, updatedAt })
```

**Auth.** protectedProcedure. Device call: MCP get_document.

---

#### `documents.search` (query)

Hybrid FTS+vector search over the whole documents table with filter chips applied server-side. The Library's primary retrieval surface.

**Request**
```
z.object({ query: z.string().min(1).max(512), filters: z.object({ category, researchType, status, isPublic }).default({}), limit: z.number().int().min(1).max(50).default(20) })
```

**Response**
```
z.object({ results: z.array(DocumentRow), totalResults, searchMethod }) where DocumentRow = { id, title, snippet, score, category, researchType, status, isPublic, updatedAt } - every field the row must render, so no per-row N+1 back over the tunnel.
```

**Auth.** protectedProcedure. Device call: MCP hybrid_search. Requires the device-side schema extension in FR-BFF-11. query is capped at 512 chars so a GET batch never overflows maxURLLength.

---

#### `documents.list` (query)

Default (no-query) Library browse and the shared audit view. Cursor-paginated infinite query.

**Request**
```
z.object({ filters: {...}, limit: 1-50 default 25, cursor: z.string().nullish() })
```

**Response**
```
z.object({ documents: z.array(DocumentRow), nextCursor: z.string().nullable() })
```

**Auth.** protectedProcedure. Device call: MCP list_documents. nextCursor: null is REQUIRED to be returned at the end - getNextPageParam maps it to undefined so the list terminates.

---

#### `documents.share` (mutation)

Flip a document public and return the canonical share URL for copy.

**Request**
```
z.object({ id: z.uuid() })
```

**Response**
```
z.object({ documentId, isPublic: z.literal(true), shareToken, shareUrl, revocationSlaSeconds: z.literal(60) })
```

**Auth.** protectedProcedure. Device call: MCP share_document. shareUrl is passed through from the device VERBATIM - the BFF must never construct or rewrite it (PUBLIC_DOCS_ORIGIN lockstep constant; the MCP share_document description promises this URL shape to agent sessions).

---

#### `documents.unshare` (mutation)

Revoke a public link. Returns the stated propagation bound so the UI can say '<=60s', not 'soon'.

**Request**
```
z.object({ id: z.uuid() })
```

**Response**
```
z.object({ documentId, isPublic: z.literal(false), revocationSlaSeconds: z.literal(60) })
```

**Auth.** protectedProcedure. Device call: MCP unshare_document (NOT share_document with isPublic:false - the device schema rejects that with INVALID_ARGUMENT).

---

#### `research.byId` (query)

THE truth source for a research card. Carries REAL progress fields so the card's animation is driven by run state and never by a timer, plus the server-directed poll interval.

**Request**
```
z.object({ sessionId: z.uuid() })
```

**Response**
```
z.object({ sessionId, status, phase?, terminal, mode, progress: { round, maxRounds, subQuestionsTotal, subQuestionsClosed, findingsVerified, elapsedMs }, summary?, documentId?, partial?, stopReason?, nextPollAfterMs })
```

**Auth.** protectedProcedure. Device call: MCP deep_research_result with waitMs: 0 (never long-poll from a Worker request).

---

#### `research.cancel` (mutation)

Cancel a device research job. REQUIRED as a distinct surface: aborting the chat stream aborts the turn, NOT a job the turn already dispatched to the device.

**Request**
```
z.object({ sessionId: z.uuid(), controlRequestKey: z.string().min(1) })
```

**Response**
```
z.object({ sessionId, accepted, status })
```

**Auth.** protectedProcedure. Device call: MCP deep_research_control with action: 'cancel'. controlRequestKey is client-generated for idempotency so a double-click cannot double-cancel.

---

#### `conversations.list` (query)

The Chats sidebar. Cursor-paginated.

**Request**
```
z.object({ limit: 1-50 default 30, cursor })
```

**Response**
```
z.object({ conversations: [{ id, title, updatedAt, messageCount }], nextCursor })
```

**Auth.** protectedProcedure. BLOCKED on FR-BFF-12 - no device endpoint exists today.

---

#### `conversations.byId` (query)

Load a thread's persisted history on navigation or reload. Returns messages already in UIMessage shape so the reducer's initial state is a straight assignment.

**Request**
```
z.object({ id, limit: 1-200 default 100, cursor })
```

**Response**
```
z.object({ conversation: { id, title, createdAt, updatedAt }, messages: z.array(UIMessageSchema), nextCursor })
```

**Auth.** protectedProcedure. BLOCKED on FR-BFF-12.

---

#### `conversations.rename` (mutation)

Rename a thread.

**Request**
```
z.object({ id, title: 1-200 chars })
```

**Response**
```
z.object({ id, title })
```

**Auth.** protectedProcedure. Device call: REST PATCH /api/conversations/:id (exists today).

---

#### `conversations.delete` (mutation)

Delete a thread.

**Request**
```
z.object({ id })
```

**Response**
```
z.object({ id, deleted: z.literal(true) })
```

**Auth.** protectedProcedure. Device call: REST DELETE /api/conversations/:id (exists today).

---

#### `device.status` (query)

Short-timeout reachability probe so the shell can show an honest 'device is asleep' banner without every Library query first burning a 10s timeout.

**Request**
```
z.object({})
```

**Response**
```
z.object({ reachable, state: 'ok'|'unreachable'|'auth_failed'|'degraded', latencyMs, checkedAt })
```

**Auth.** protectedProcedure. Device call: REST GET /health with a 3000ms timeout. This procedure RESOLVES on failure (it reports the failure) - it is the only device-touching procedure that does not reject when the device is down.

---

## Public and device endpoints

| Method | Path | Purpose | Auth |
|---|---|---|---|
| `GET` | `origin /article/:shareToken (Accept: application/json)` | BLOCKING PREREQUISITE, does not exist today. Return the SharedDocument as JSON so the Next Server Component can render markdown it | None at the URL level (public article routes are the sole unauthentica |
| `GET` | `/d/:token` | Public reader page. Frozen URL shape. | None. |
| `GET` | `/d/:token/assets/:id` | New asset proxy Route Handler. Fixes the second half of the silent-text-only defect. | None public-facing; Access service token on the origin hop. |
| `GET` | `origin /article/:shareToken/assets/:fileObjectId` | Already implemented and correct on the origin; simply unreachable today. | is_public join enforced in selectPublicArticleAsset(). The no-store he |
| `POST` | `/api/trpc/[trpc]` | BFF surface. documents.list/search/byId, research.byId, conversations.*, chat.stream. | BetterAuth session verified in the tRPC context on every protectedProc |
| `ALL` | `/api/auth/[...all]` | BetterAuth handler mount. | n/a (this is the auth surface). |
| `GET` | `/d/:token` | Public document reader - retired Worker's sole route, now a Next Server Component with full markdown/image rendering. | None (public). Origin call authenticated by the Worker via CF-Access-C |
| `GET` | `/d/:token/assets/:fileObjectId` | New route proxying the origin's existing, previously-unreachable asset endpoint. Fixes the silent-text-only defect. | None (public). Same Access service-token pattern as the HTML route. |
| `ALL` | `/api/trpc/[trpc] (inferred - exact mount path not settled in the brief)` | tRPC BFF surface: documents, search, conversations queries and mutations. | BetterAuth session, enforced in middleware.ts/proxy.ts ahead of the tR |
| `POST (Streamable HTTP)` | `https://origin-docs.holocrnlib.com/mcp` | MCP tool discovery (initialize + tools/list) and tool execution (tools/call) for the agent loop's entire tool surface | Cloudflare Access service token (CF_ACCESS_CLIENT_ID/SECRET) added as  |
| `ALL` | `/api/auth/[...all]` | The single BetterAuth mount. Every auth endpoint below is served by this handler. | public route; individual endpoints enforce their own rules |
| `POST` | `/api/auth/sign-in/email` | The only sign-in path the operator ever uses. | none (this is the authentication act); Origin checked against trustedO |
| `POST` | `/api/auth/sign-out` | Revokes the session row and clears both cookies. | session cookie |
| `GET` | `/api/auth/get-session` | Client-side session read behind authClient.useSession(). | session cookie; served from the cookie cache when fresh |
| `POST` | `/api/auth/sign-up/email` | Account creation - DISABLED in the deployed config. | unreachable in production; exercised only by the bootstrap script with |
| `POST` | `/api/auth/request-password-reset, /api/auth/reset-password` | DISABLED. Enabling them would introduce an email-provider dependency and a second credential-recovery path for a single-operator a | n/a - recovery is the bootstrap script against the store |
| `GET` | `/sign-in` | The sign-in page. Public but identity-bearing - distinct from /d/*. | none; MUST NOT be in the guard matcher (redirect loop) and MUST redire |
| `GET` | `/d/:token` | Public reader. Renders the shared document. | NONE. Never gated, never redirected, never sets a cookie. Access contr |
| `GET` | `/d/:token/assets/:fileObjectId` | Public asset subroute - the route that does not exist today and is why every shared document is silently text-only. | NONE. Same rules as /d/:token. This subroute is the single most likely |
| `POST` | `/api/trpc/*` | The BFF. Every operator query, mutation, and the chat stream. | session cookie resolved in createContext; enforced per-procedure by pr |

## Blocking prerequisite — the origin returns HTML, not markdown

`GET /article/:shareToken` calls `articleHtml(article)` unconditionally, with no content
negotiation (verified at `packages/platform/src/http/hono-app.ts:148`). A Next Server Component that
renders markdown cannot start from that response, and must not parse the origin's HTML back into an
AST. The fix is roughly five lines — `selectPublicArticle()` already returns the exact shape needed —
but **the entire public reader is blocked until someone owns it**, and the HTML branch must stay
alive until the Next route is verified against production data.

---

_Merged from the `api_endpoints` blocks of all architecture lenses; the tRPC surface is reproduced
in full because it is the contract the client is typed against._

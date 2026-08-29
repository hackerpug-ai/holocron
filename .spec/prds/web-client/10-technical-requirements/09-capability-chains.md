---
stability: CONSTITUTION
last_validated: 2026-08-28
prd_version: 1.0.0
---

# Capability Chains

15 chains cross a real boundary — the tunnel, the edge cache, the model provider, or the
auth surface. Each records its promise, its ordered hops, the contracts that must hold at each
boundary, how it fails, and what counts as real-service proof.

| ID | Promise | Lens |
|---|---|---|
| `CAP-BFF-01` | The operator types a question and the agent answers, executing tools inline with no approval gate, with tool lines appearing as work happens rather th | `trpc-planner` |
| `CAP-BFF-02` | A research or document card appears exactly once in the transcript and always shows current state. | `trpc-planner` |
| `CAP-BFF-03` | A 20-minute research run survives navigation, shows honest progress, and can actually be stopped. | `trpc-planner` |
| `CAP-BFF-04` | Search a remembered fragment, see the type and share state on the row, share it, and get back a link whose shape has not changed. | `trpc-planner` |
| `CAP-BFF-05` | When the device is asleep, the app says so instead of looking empty or broken. | `trpc-planner` |
| `CAP-BFF-06` | Select a passage in a document, ask about it, and the answer addresses that passage in that document. | `trpc-planner` |
| `CAP-AGENT-01` | The operator types a plain question in Chats and gets a streamed answer that used the device's real tools when needed. | `aisdk-planner` |
| `CAP-AGENT-02` | The operator types /deep-research <topic> and the agent hands off to a device job within the same fast turn, instead of the Worker blocking for 20 min | `aisdk-planner` |
| `CAP-EDGE-01` | A shared document renders completely (text + images) within a bounded, honest latency, and revocation takes effect within 60 seconds everywhere. | `cloudflare-workers-planner` |
| `CAP-EDGE-02` | An operator's chat turn that calls multiple device tools completes and streams back without the Worker running out of CPU budget or silently truncatin | `cloudflare-workers-planner` |
| `CAP-AUTH-01` | The operator opens the app on a cold laptop and reaches the cockpit shell in one sign-in, whether or not the device is awake. | `betterauth-planner` |
| `CAP-AUTH-02` | A stranger with no cookies opens a forwarded link on a phone and gets the complete document - images included - having handed over no identity. | `betterauth-planner` |
| `CAP-AUTH-03` | Operator data cannot be read without a session, even if the middleware guard is wrong or absent. | `betterauth-planner` |
| `CAP-AUTH-04` | Signing out actually ends the session, with a stated and bounded lag. | `betterauth-planner` |
| `CAP-AUTH-05` | A hostile share token cannot make the Worker call a privileged origin path with the CF Access service token attached. | `betterauth-planner` |

---

## CAP-BFF-01

**Promise.** The operator types a question and the agent answers, executing tools inline with no approval gate, with tool lines appearing as work happens rather than after it.

**Trigger.** Submit in the chat composer.

**Owning lens.** `trpc-planner`

### Hops

1. Client calls trpcClient.chat.stream.mutate(input, { signal }) on the isolated unbatched link
2. Next.js route handler -> fetchRequestHandler -> createContext resolves the BetterAuth session and constructs the bound DeviceClient
3. protectedProcedure middleware rejects UNAUTHORIZED if session is null
4. Generator opens an MCP client to origin-docs.holocrnlib.com/mcp (CF Access headers + Bearer mcp key), performs initialize + tools/list
5. streamText runs with the device tool set; each AI SDK part is translated to a ChatStreamPart and yielded
6. httpBatchStreamLink delivers each chunk; the reducer folds it into UIMessage state; AI Elements render from plain props

### Boundary contracts

- MCP tool result structuredContent is Zod-parsed before it is yielded as tool-output-available
- A device tool error yields tool-output-error { toolCallId, errorText }, never a thrown generator
- The turn holds its own HTTP request; no other operation is batched onto it

### Failure modes

- Device asleep -> turn-error { code: 'DEVICE_UNREACHABLE', retriable: true } after the tool call's 10s budget; partial text retained
- CF Access rejection returns an HTML login page -> DeviceClient must not JSON.parse it; surfaces DEVICE_AUTH_FAILED
- Wrong scoped key on /mcp -> device 403 -> DEVICE_AUTH_FAILED (distinct from asleep)
- Worker CPU limit hit mid-turn -> connection drops; turn lost (accepted cost, no resume)

### Real-service proof

Real Worker (wrangler dev / vinext dev) -> real Cloudflare tunnel -> real device Hono + Postgres -> real MCP gateway -> real model provider. Assert: >=2 distinct chunk arrival timestamps (proving incremental streaming, not a buffered single flush), >=1 real tool-output-available whose payload matches a row actually present in Postgres, and a turn-finish. A mocked device or a mocked provider does not satisfy this chain.

---

## CAP-BFF-02

**Promise.** A research or document card appears exactly once in the transcript and always shows current state.

**Trigger.** The agent produces or updates a record during a turn.

**Owning lens.** `trpc-planner`

### Hops

1. Tool completes on the device and returns a record id
2. Generator yields record-ref { kind, id } (placement) and invalidate { kind, id } (freshness) - both id-only
3. Reducer inserts the part, deduped by (kind, id)
4. Coalescer calls queryClient.invalidateQueries(trpc.documents.byId.queryFilter({ id }))
5. The card component's useQuery(trpc.documents.byId.queryOptions({ id })) refetches and re-renders

### Boundary contracts

- No ChatStreamPart variant may contain record contents - enforced by the union type and asserted in test
- Card components take an id prop only; they may not accept record data as props

### Failure modes

- Same record referenced by two tool calls in one turn -> reducer dedupe prevents a second card
- Invalidation storm from a chatty tool loop -> 250ms coalescing window
- Record fetch fails while the stream succeeds -> the card shows its own error state; the transcript stays intact

### Real-service proof

Real turn that produces the SAME document id twice (e.g. store then update). Assert exactly one card node in the DOM, that it reflects the post-update content fetched from Postgres, and that a grep of the captured stream frames finds zero occurrences of the document body text.

---

## CAP-BFF-03

**Promise.** A 20-minute research run survives navigation, shows honest progress, and can actually be stopped.

**Trigger.** /deep-research <topic> in the composer.

**Owning lens.** `trpc-planner`

### Hops

1. Agent calls MCP deep_research -> device returns { sessionId, pollAfterMs, estimatedMs } and the turn ENDS
2. Generator yields record-ref { kind:'research', id: sessionId } and turn-finish
3. Card mounts research.byId, polling at the device's nextPollAfterMs until terminal === true
4. Cancel -> research.cancel -> MCP deep_research_control { action:'cancel' }
5. On completion the card's documentId links into the Library

### Boundary contracts

- The turn never awaits run completion - a Worker request must not hold a 20-minute job
- deep_research_result is always called with waitMs: 0 from a Worker
- research.cancel is idempotent on controlRequestKey

### Failure modes

- Poll continues after terminal -> burns tunnel round trips forever; terminal must stop the interval
- Navigating away kills the run (would happen if the loop awaited it in-request - the reason for the fire-and-return contract)
- Cancel accepted by the BFF but not by the device -> accepted:false must be surfaced, not swallowed
- Finished run's document never appears in the Library -> invalidate { kind:'documentList' } on terminal

### Real-service proof

Real deep_research kickoff on the real device. Assert progress counters MOVE across at least two polls (round or subQuestionsClosed strictly increases - a timer-driven animation cannot pass this), then issue a real cancel and assert the device-side session status reaches a cancelled terminal state in Postgres.

---

## CAP-BFF-04

**Promise.** Search a remembered fragment, see the type and share state on the row, share it, and get back a link whose shape has not changed.

**Trigger.** Typing in Library search; clicking the share toggle.

**Owning lens.** `trpc-planner`

### Hops

1. documents.search -> MCP hybrid_search with filters
2. Rows render type chip and share badge from DocumentRow fields
3. Share toggle -> documents.share -> MCP share_document
4. Device returns shareUrl; BFF passes it through verbatim
5. documents.byId and documents.list invalidated so the row's badge flips

### Boundary contracts

- shareUrl is passed through, never constructed
- Unshare uses unshare_document (the device rejects share_document with isPublic:false)
- revocationSlaSeconds: 60 is returned so the UI states the bound as a fact

### Failure modes

- Search returns rows without isPublic/researchType (today's schema) -> badges unimplementable; blocked on FR-BFF-11
- Optimistic toggle without rollback -> a failed share shows as shared
- Long search query overflows the batch GET URL -> query capped at 512 chars

### Real-service proof

Real search against real Postgres returning a known document by a phrase fragment, real share, then a real unauthenticated curl of the returned shareUrl returning 200 - followed by a real unshare and the same URL returning the withdrawn page within 60s.

---

## CAP-BFF-05

**Promise.** When the device is asleep, the app says so instead of looking empty or broken.

**Trigger.** Any authenticated surface loads while the device is unreachable.

**Owning lens.** `trpc-planner`

### Hops

1. device.status probes GET /health with a 3s timeout and RESOLVES with { reachable:false, state:'unreachable' }
2. Shell renders one device banner
3. Concurrent documents.list / search REJECT with TIMEOUT + DEVICE_UNREACHABLE
4. Surfaces render their error state, not an empty state

### Boundary contracts

- No device-touching procedure other than device.status may resolve on device failure
- unreachable and auth_failed are distinct states - the second is an operator config bug, not a sleeping machine
- Client-facing error messages carry no device internals

### Failure modes

- Empty-array-on-failure - explicitly forbidden by FR-BFF-08
- CF Access HTML login page parsed as JSON, producing a nonsense error
- Every query waiting a full 10s before the banner appears - the reason device.status has its own short budget

### Real-service proof

Real device stopped (service down, tunnel up) and then real tunnel down. Both produce the honest banner and rejecting queries; verify by capturing actual TRPCError codes, not by simulating a fetch failure in a mock. Never accomplish this by disconnecting the host from the network.

---

## CAP-BFF-06

**Promise.** Select a passage in a document, ask about it, and the answer addresses that passage in that document.

**Trigger.** 'Ask about this' on a text selection in the reading column.

**Owning lens.** `trpc-planner`

### Hops

1. Selection -> chat.stream with quote { documentId, text, anchor }
2. turn-start echoes the quote so the transcript records the source
3. Agent receives the quote plus the document id and may call get_document for surrounding context
4. Answer streams; any produced record arrives as a record-ref

### Boundary contracts

- quote.text bounded at 4,000 chars and always accompanied by documentId
- The quote is echoed in turn-start, not reconstructed client-side

### Failure modes

- Quote truncated without its document id -> answer addresses the wrong thing
- Quote large enough to blow the request budget -> Zod cap rejects at the boundary with a legible message

### Real-service proof

Real selection in a real document, real turn, assert the persisted assistant message references the same documentId in Postgres and that the answer's tool calls targeted that id.

---

## CAP-AGENT-01

**Promise.** The operator types a plain question in Chats and gets a streamed answer that used the device's real tools when needed.

**Trigger.** POST to chat.stream tRPC procedure with the user's message

**Owning lens.** `aisdk-planner`

### Hops

1. tRPC procedure handler (edge) constructs AgentTurnContext
2. createMCPClient({transport: {type:'http', url:'https://origin-docs.holocrnlib.com/mcp', headers: CF Access token}}) - Worker -> Cloudflare Tunnel -> device Hono gateway
3. mcpClient.tools() - MCP tools/list JSON-RPC round trip, schemas inferred from listTools() registry
4. streamText({model: anthropic(...), tools, stopWhen: isStepCount(N), abortSignal}) - Anthropic API call from the Worker
5. on each tool-call: MCP tools/call JSON-RPC round trip back through the same tunnel to the device executor
6. BFF maps result.stream parts (+ injected data-invalidate parts) into the tRPC async generator
7. httpBatchStreamLink delivers parts to the client UIMessage reducer
8. AI Elements render Tool/Response/Reasoning components; TanStack Query re-fetches any invalidated record

### Boundary contracts

- MCP gateway's allowedOrigins/enableDnsRebindingProtection must accept a Worker-to-origin call with no Origin header - UNPROVEN, must be verified with a real call before this chain can be trusted
- Every tool-call part must resolve to a tool-result part before the next model step (AI SDK v7 hard rule)
- CF Access service token headers on the MCP transport config are the tunnel's own auth boundary, independent of BetterAuth

### Failure modes

- Device asleep / tunnel down -> MCP tools/list or tools/call fails -> the tool-call must surface as tool-output-error, not hang the stream
- Anthropic API error/timeout -> top-level error stream part, thread shows a terse failure, no partial-success fiction
- Workers CPU/time limit hit mid-turn -> stream truncates; client has no resume mechanism (accepted cost, no reload-resume) - the reducer must treat an abrupt stream end as an error state, not silently stop

### Real-service proof

AC must be verified with a REAL streamText call against the real Anthropic API AND a real MCP tools/call round-trip through the real Cloudflare Tunnel to the real device gateway - no MockLanguageModelV4 as the primary evidence, per this KB's integration-first rule and the project's Supreme Rule against stubbed core logic.

---

## CAP-AGENT-02

**Promise.** The operator types /deep-research <topic> and the agent hands off to a device job within the same fast turn, instead of the Worker blocking for 20 minutes.

**Trigger.** Slash-command interpreter matches /deep-research on the submitted PromptInput text

**Owning lens.** `aisdk-planner`

### Hops

1. Deterministic parser extracts the command + topic, bypassing the general model turn
2. Single MCP tools/call to a research-session-start tool over the same Worker-to-tunnel-to-device path as CAP-AGENT-01
3. Device returns a researchSession id synchronously (job creation, not job completion)
4. BFF yields a data-invalidate/data-research-started part (custom data-* part) carrying the new researchSession id and ends the turn
5. Client renders a polling card keyed to that id via trpc.research.byId - polling is entirely outside the AI SDK loop

### Boundary contracts

- The agent turn MUST terminate (finish-step/finish) immediately after the hand-off tool call - no subsequent model step waits on the job
- The researchSession id round-trips through a custom data-* part, not through the model's own text output, so it's structurally typed rather than parsed out of prose

### Failure modes

- Device job creation itself fails (device asleep) -> tool-output-error, no researchSession id emitted, no polling card created
- Operator cancels mid-research -> cancel only aborts the BFF's Worker request if it's still in flight; once the job hand-off succeeded, cancelling the chat turn does NOT cancel the device job - that's a separate cancel affordance the device platform (mastra) must expose

### Real-service proof

AC must be verified by watching a real device job actually get created (a real researchSession row appears) from a real tool call issued by a real agent turn - not a stub that fabricates a session id.

---

## CAP-EDGE-01

**Promise.** A shared document renders completely (text + images) within a bounded, honest latency, and revocation takes effect within 60 seconds everywhere.

**Trigger.** A GET request to docs.holocrnlib.com/d/<token> (and its /assets/<id> children) from any client, authenticated or not.

**Owning lens.** `cloudflare-workers-planner`

### Hops

1. Client to Cloudflare edge PoP (custom domain route)
2. Worker checks caches.default for the exact request URL
3. On MISS: Worker to origin-docs.holocrnlib.com/article/<token>[/assets/<id>] over the CF Access-authenticated tunnel, bounded by AbortSignal.timeout
4. Worker rewrites response headers (60s + Cloudflare-CDN-Cache-Control), writes to caches.default, returns to client
5. On HIT: PoP serves directly from Cache API, zero origin round trip

### Boundary contracts

- URL shape ^/d/([^/]+)$ and ^/d/([^/]+)/assets/([^/]+)$ must be preserved exactly
- Both cache headers must be present on every cacheable response, 200 or 404
- Origin's own Cache-Control header on the asset endpoint (no-store) must be discarded, never forwarded

### Failure modes

- Device asleep or origin timeout -> 502 'temporarily unavailable', explicitly no-store so the client retries rather than getting stuck on a bad cached failure
- Cloudflare-CDN-Cache-Control dropped by a proxy/config regression -> silent 2-hour revocation instead of 60s, with no error surfaced anywhere
- Asset route forwards origin's no-store -> images work but never cache, defeating the point without breaking correctness

### Real-service proof

Exercise via a real wrangler dev/deployed Worker: publish a canary document, GET /d/<token> twice (assert second is a cache HIT via CF-Cache-Status or timing), unshare, wait 61s, GET again and assert 404 - this is the concrete verification the design brief's SLA claim depends on.

---

## CAP-EDGE-02

**Promise.** An operator's chat turn that calls multiple device tools completes and streams back without the Worker running out of CPU budget or silently truncating.

**Trigger.** Operator sends a message in Chats; the AI SDK loop decides to call N MCP tools against the device gateway.

**Owning lens.** `cloudflare-workers-planner`

### Hops

1. Client to Worker (chat.stream tRPC procedure) over httpBatchStreamLink
2. Worker's AI SDK loop calls the model provider (external, not Workers AI)
3. Model requests a tool call -> Worker's MCP client -> origin-docs.holocrnlib.com/mcp over the same CF Access tunnel (repeat per tool call)
4. Worker folds each streamed part into the response, forwarded to the client as UIMessage parts

### Boundary contracts

- Each tool round trip is bounded by its own timeout, distinct from the page-load 10s budget
- await fetch time (the tunnel round trips) does not count against Workers CPU - only the JSON marshalling/unmarshalling and reducer work per chunk does
- Workers Paid plan (30s CPU default) assumed, not Free (10ms)

### Failure modes

- Device sleeps mid-turn -> tool call times out -> turn should surface a legible 'device unreachable' state, not hang or silently drop
- A pathological multi-tool turn with large tool outputs (e.g. big search result sets) accumulates enough JSON-marshal CPU across many tool calls to approach the 30s CPU budget even though no single step is expensive
- Connection drop mid-stream loses the turn outright - no reload-resume exists (accepted cost per design brief section 7)

### Real-service proof

Exercise against the real device MCP gateway (not a mock): drive a chat turn that calls 3+ real tools, capture Worker CPU time via wrangler tail / Workers Logs, and confirm the tunnel's allowedOrigins/DNS-rebinding-protection setting actually passes for a server-to-server Worker call - the design brief itself flags this as unverified.

---

## CAP-AUTH-01

**Promise.** The operator opens the app on a cold laptop and reaches the cockpit shell in one sign-in, whether or not the device is awake.

**Trigger.** Navigate to https://docs.holocrnlib.com/ with no cookies

**Owning lens.** `betterauth-planner`

### Hops

1. middleware matcher matches / -> no session -> 302 to /sign-in?callbackURL=/
2. browser POSTs /api/auth/sign-in/email
3. BetterAuth handler verifies the scrypt hash from the account row in D1
4. session row written to D1; Set-Cookie session_token + session_data
5. redirect to /; middleware validates session_data from the signed cookie with no store read
6. cockpit shell renders; tRPC queries then reach the device over the tunnel and may fail independently

### Boundary contracts

- Origin header in trustedOrigins or the request is refused
- Set-Cookie carries httpOnly + secure + sameSite=lax + no Domain attribute
- sign-in path is rate limited
- no hop in this chain crosses the Cloudflare Tunnel

### Failure modes

- scrypt exceeds the Workers CPU ceiling -> sign-in times out with no useful error (measure real CPU on a real sign-in)
- nodejs_compat missing -> hashing throws at runtime, never in a type-check
- BETTER_AUTH_URL / baseURL mismatched with the deployed hostname -> cookie set on the wrong host, sign-in appears to succeed then immediately bounces
- vinext middleware contract differs from Next -> the redirect never happens and the shell renders an empty cockpit instead of a sign-in page

### Real-service proof

Deployed Worker (or wrangler dev with a real D1 binding): curl -i the sign-in POST with the real credential, assert 200 + both Set-Cookie headers with the expected flags, then replay the cookie against /api/auth/get-session and assert the user id. Run it with the device mini powered down to prove FR-AUTH-09.

---

## CAP-AUTH-02

**Promise.** A stranger with no cookies opens a forwarded link on a phone and gets the complete document - images included - having handed over no identity.

**Trigger.** GET /d/<token> from a fresh browser context, and GET /d/<token>/assets/<id> for each figure

**Owning lens.** `betterauth-planner`

### Hops

1. request reaches the Worker; path is not in the guard matcher, so no auth code executes
2. token shape validated by isOriginShareToken; malformed -> cacheable 404
3. edge cache lookup on the normalized key ${origin}/d/${token} (query string dropped)
4. miss -> origin GET /article/<token> with CF-Access-Client-Id/Secret
5. origin joins on is_public and returns the document or 404
6. response rebuilt with a fresh Headers object; cache headers applied; cached for 60s
7. each figure repeats the chain through /d/<token>/assets/<id> -> origin /article/<token>/assets/<id>

### Boundary contracts

- response contains zero Set-Cookie headers
- response contains no redirect to /sign-in at any status code
- Cache-Control: public, max-age=60, s-maxage=60 AND Cloudflare-CDN-Cache-Control: max-age=60
- 404s are cacheable so revocation does not hammer the device
- Referrer-Policy: no-referrer; X-Robots-Tag: noindex
- the CF Access credential never appears in the response or in logs

### Failure modes

- guard matcher captures /d -> stranger hits a sign-in wall; the highest-volume path in the product dies silently
- a stray Set-Cookie (an auth provider leaking into the public layout) -> Cloudflare stops caching, cache hit ratio collapses, every expired-link visit reaches a sleeping device
- asset subroute added to the matcher but the page route not -> text renders, every figure 302s to sign-in, and the document is text-only again - the exact defect the rewrite exists to fix
- token grammar narrowed during the lift -> live mcp- and bare-uuid links start 404ing as 'no longer shared', which is indistinguishable from deliberate revocation

### Real-service proof

Playwright with a cookie-free browser.newContext() against the deployed hostname: assert 200, assert response.headers()['set-cookie'] is absent on the page AND on every asset request, assert no navigation to /sign-in, assert every img resolves 200. Repeat as a raw curl -sI with a Slackbot user-agent to prove the unfurl path is ungated. Repeat with a deliberately malformed token and assert 404 with no origin request in the device logs.

---

## CAP-AUTH-03

**Promise.** Operator data cannot be read without a session, even if the middleware guard is wrong or absent.

**Trigger.** POST /api/trpc/documents.byId with no cookies

**Owning lens.** `betterauth-planner`

### Hops

1. tRPC fetch adapter builds context
2. createContext calls auth.api.getSession({ headers })
3. session is null
4. protectedProcedure throws TRPCError UNAUTHORIZED
5. 401 returned; no device call is made

### Boundary contracts

- every operator procedure is protectedProcedure
- no publicProcedure exists in the router
- the device is never contacted for an unauthenticated request - the tunnel round trip is not spent on a rejected caller

### Failure modes

- a procedure written as t.procedure instead of protectedProcedure - invisible in review, invisible in types
- createContext swallowing the getSession error and returning a truthy context
- the chat.stream generator authenticating on first yield rather than in context, leaving a window where the MCP loop has already started

### Real-service proof

Integration test against a real running app + real D1: enumerate the router's procedure names at runtime and assert every one is protected; then curl each with no cookie and assert 401 and assert the device access log recorded zero requests for that window.

---

## CAP-AUTH-04

**Promise.** Signing out actually ends the session, with a stated and bounded lag.

**Trigger.** authClient.signOut()

**Owning lens.** `betterauth-planner`

### Hops

1. POST /api/auth/sign-out with the session cookie
2. session row deleted from D1
3. both cookies expired via Set-Cookie
4. subsequent requests carry no cookie -> 401 / redirect

### Boundary contracts

- the session row is gone, not merely the cookie
- any other live tab still holding a valid session_data cookie remains authenticated for at most the cookie-cache maxAge (300s), then fails closed

### Failure modes

- cookie cleared client-side only, leaving a live session row that a captured cookie could replay
- cookie-cache maxAge raised for latency reasons without anyone re-deciding the revocation lag it buys

### Real-service proof

Two real browser contexts sharing one session: sign out in A, assert the D1 session row is deleted by direct query, then poll B and assert it fails closed within maxAge.

---

## CAP-AUTH-05

**Promise.** A hostile share token cannot make the Worker call a privileged origin path with the CF Access service token attached.

**Trigger.** GET /d/..%2F..%2Fapi%2Fdocuments and GET /d/<valid-token>/assets/../../secrets

**Owning lens.** `betterauth-planner`

### Hops

1. route param extracted
2. isOriginShareToken (and uuid check on fileObjectId) rejects
3. cacheable 404 returned
4. no origin fetch is constructed at all

### Boundary contracts

- validation happens BEFORE string interpolation into the origin URL, not after
- the origin base is a constant, never derived from request input
- even on a validation miss, the origin independently enforces is_public

### Failure modes

- validation moved after URL construction 'for readability'
- the asset subroute validating the token but not the fileObjectId - the new route is the one with no incumbent implementation to copy
- Next's route-param decoding differing from the raw pathname match the old Worker did, so an encoded traversal survives to the interpolation

### Real-service proof

Table-driven test against the running app with the device's access log tailing: for each hostile input assert 404 AND assert zero corresponding entries in the origin log - proving the request was never made, not merely that it failed.

---

_Merged from the `capability_chains` blocks of the architecture lenses._

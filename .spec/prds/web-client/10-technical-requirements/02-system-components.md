---
stability: CONSTITUTION
last_validated: 2026-08-29
prd_version: 1.0.1
---

# System Components

| Component | Layer | Role | Proposed by |
|---|---|---|---|
| **packages/web (Next.js App Router package)** | `edge` | The single Next.js application serving both faces. Replaces the private `@holocron/web` placeholder that the monorepo migration already created and enrolled via the `packages/*` glob — no pnpm-workspace.yaml edit. Owns its own app/, components/, tsconfig.json, tailwind.config, components.json and next.config.ts, as every package under packages/* does. | `nextjs-planner` |
| **Route group (public)** | `edge` | Contains exactly one route family: /d/[token] and /d/[token]/assets/[id]. No layout in this group imports the auth module, reads a session, or calls cookies()/headers(). | `nextjs-planner` |
| **Route group (app)** | `app` | Operator cockpit: /chats, /chats/[conversationId], /library, /library/[documentId]. Its layout performs the server-side session check and redirect(). | `nextjs-planner` |
| **DocumentBody (shared server component)** | `app` | The single markdown-to-React renderer used by BOTH /d/[token] and /library/[documentId]. Parameterised only by assetBase (the URL prefix rewritten onto document-relative asset paths). Same measure, same type scale, same figure treatment by construction. | `nextjs-planner` |
| **Markdown pipeline (server-only module)** | `app` | react-markdown driving remark-parse + remark-gfm + remark-rehype (allowDangerousHtml: false) + rehypeHolocronAnchors + rehypeAssetUrls + rehype-sanitize, rendered through a components map that maps img to a Figure element and h2..h6 to hover-revealed anchor headings. | `nextjs-planner` |
| **rehypeAssetUrls (local rehype plugin, ~20 lines)** | `app` | Rewrites document-relative asset references from the origin's shape /article/<token>/assets/<id> to the public shape /d/<token>/assets/<id> on both img.src and a.href, before sanitisation runs. | `nextjs-planner` |
| **rehypeHolocronAnchors (local rehype plugin, ~15 lines)** | `app` | Applies the EXISTING slugifyText() from packages/platform/src/http/article.ts to heading ids and to in-document '#'-prefixed link targets. | `nextjs-planner` |
| **lib/env.server.ts** | `edge` | The single module that performs import { env } from 'cloudflare:workers'. Begins with import 'server-only'. | `nextjs-planner` |
| **proxy.ts (Next 16 rename of middleware.ts)** | `edge` | Edge-cache mediation for public routes only. Matcher is ['/d/:path*']. Contains no auth code whatsoever. | `nextjs-planner` |
| **tRPC + TanStack Query provider island** | `app` | A 'use client' providers.tsx mounted by the (app) layout, holding QueryClient and the tRPC client with httpBatchStreamLink. | `nextjs-planner` |
| **tRPC BFF router (server/trpc/routers/_app.ts)** | `edge` | The single data path for the authenticated operator app. Composed from five namespace routers (documents, research, conversations, chat, device) via mergeRouters. Every procedure declares an explicit Zod input and output schema; no procedure returns a raw device payload. | `trpc-planner` |
| **DeviceClient (bound tunnel client)** | `edge` | The ONLY thing in tRPC context that can talk to the device. Constructed per request with the CF Access service-token pair and the scoped bearer key already closed over, so procedures hold a capability, never credentials. | `trpc-planner` |
| **MCP client attach (server/device/mcp.ts)** | `edge` | Streamable-HTTP MCP client the BFF opens against origin-docs.holocrnlib.com/mcp. Serves BOTH the AI SDK agent tool loop AND the Library/research read procedures - one transport, one credential, zero new device endpoints for anything the tool registry already covers. | `trpc-planner` |
| **chat.stream async-generator procedure** | `edge` | The chat turn. A tRPC MUTATION whose resolver is an async function*, hosting the AI SDK streamText loop and yielding a discriminated ChatStreamPart union. Per trpc#6103 the AI SDK's raw response cannot be returned through tRPC, so this procedure owns the translation from AI SDK stream parts to our own wire union. | `trpc-planner` |
| **UIMessage reducer (lib/chat/reducer.ts)** | `app` | Client-side fold of ChatStreamPart values into AI SDK UIMessage shape, consumed directly by AI Elements (which take plain props). Replaces useChat, which is unavailable here. | `trpc-planner` |
| **TanStack Query client + @trpc/tanstack-react-query options proxy** | `app` | The cache that carries truth. createTRPCContext<AppRouter>() yields TRPCProvider + useTRPC; components call raw useQuery(trpc.documents.byId.queryOptions({ id })). | `trpc-planner` |
| **Link chain (lib/trpc/client.ts)** | `app` | loggerLink -> splitLink -> two httpBatchStreamLink instances. Everything terminates in a streaming-capable link; chat.stream is isolated onto its own unbatched request. | `trpc-planner` |
| **Holocron device (Hono + Postgres) behind origin-docs.holocrnlib.com** | `device` | System of record. Serves /mcp (tool registry) and /api/* (chat-runs, documents byId, publish, uploads). Sleeps. | `trpc-planner` |
| **AgentLoopModule** | `edge` | Server-only module in the Next.js route/procedure layer that constructs and runs the AI SDK agent turn: builds the MCP client, resolves tools, calls streamText/ToolLoopAgent, and yields UIMessage-shaped stream chunks to the tRPC generator. | `aisdk-planner` |
| **MCP client attach (per-request)** | `edge` | createMCPClient({ transport: { type: 'http', url: 'https://origin-docs.holocrnlib.com/mcp', headers: {...CF Access service token...} } }) from @ai-sdk/mcp, created fresh at the start of each agent turn and closed in onEnd/finally. | `aisdk-planner` |
| **streamText / ToolLoopAgent turn** | `edge` | Runs the model+tool loop for one chat turn. Model = Anthropic direct (@ai-sdk/anthropic). Tools = the object returned by mcpClient.tools(), passed straight through (schemas inferred from the gateway's registry, no compile-time TOOL_SCHEMAS needed since tool names/shapes are dynamic). | `aisdk-planner` |
| **Slash-command interpreter** | `edge` | A pure function that runs BEFORE the agent turn starts: inspects the first token of the user's submitted text for /research, /deep-research, /search, /browse, /stats, /help; on match, short-circuits to a direct tool call or canned response instead of an open-ended model turn. | `aisdk-planner` |
| **Long-run device-job dispatcher** | `edge` | For /deep-research (and other long verticals), calls a single MCP tool (e.g. start_research_session) that returns a researchSession id immediately, then ends the agent turn - it does NOT loop waiting for the device job to finish. | `aisdk-planner` |
| **chat.stream tRPC procedure (async generator)** | `edge` | Owned by trpc-planner/implementer, but the AI SDK boundary is: this procedure calls AgentLoopModule, iterates result.stream, and yields each part (mapped, not raw) to httpBatchStreamLink. | `aisdk-planner` |
| **Client UIMessage reducer** | `app` | ~150-line reducer (per the design brief) that folds streamed parts into UIMessage shape client-side, since useChat/useCompletion are unavailable over tRPC streaming (trpc#6103). | `aisdk-planner` |
| **MCP gateway (existing, unmodified)** | `device` | origin-docs.holocrnlib.com/mcp - the device's Streamable HTTP MCP server. Consumed, not built, by this lens. | `aisdk-planner` |
| **docs.holocrnlib.com Worker (Next.js via vinext)** | `edge` | Single Cloudflare Worker hosting the entire product: public /d/[token] reader, operator app (BetterAuth), tRPC BFF, and the AI SDK agent loop. Bound to the custom domain via routes: [{ pattern: "docs.holocrnlib.com", custom_domain: true }], replacing docs-reader's wrangler.jsonc 1:1 on that binding. | `cloudflare-workers-planner` |
| **Public reader route - GET /d/[token]** | `edge` | Server Component, no auth, no tRPC, sets its own cache headers. Must match the existing regex contract ^/d/([^/]+)$ byte-for-byte at the URL level (Next dynamic segment [token] satisfies this) since the MCP share_document tool description promises this exact shape to every agent session. | `cloudflare-workers-planner` |
| **Asset proxy route - GET /d/[token]/assets/[id]** | `edge` | New route (does not exist today) that proxies the origin's already-correct GET /article/:shareToken/assets/:fileObjectId endpoint. Fixes the CONFIRMED defect where every shared document is silently text-only. | `cloudflare-workers-planner` |
| **tRPC BFF router** | `app` | Authenticated app surface: documents/search/conversations queries plus the chat.stream async-generator procedure via httpBatchStreamLink. Mounted under the operator (/*) side, BetterAuth-protected via middleware.ts/proxy.ts. | `cloudflare-workers-planner` |
| **AI SDK agent loop + MCP client** | `app` | Runs streamText in the Worker, attached as an MCP client over Streamable HTTP to the device's stateless gateway at ${ORIGIN_BASE_URL}/mcp. | `cloudflare-workers-planner` |
| **Edge Cache API (caches.default)** | `edge` | Per-PoP cache for the public reader HTML and its assets. Not a wrangler binding - a runtime global (globalThis.caches.default), same as the retiring Worker's resolveCache(). | `cloudflare-workers-planner` |
| **origin-docs.holocrnlib.com (Hono, on-device)** | `device` | Source of truth: documents, MCP gateway (/mcp, /mcp/*), /api/*, Postgres (documents, conversations, sessions, BetterAuth tables). The /article/:shareToken and /article/:shareToken/assets/:fileObjectId routes are exempt from the origin's own scoped-key gate - Cloudflare Access is the ONLY auth on this egress today. | `cloudflare-workers-planner` |
| **auth (BetterAuth server instance)** | `app` | The single betterAuth({...}) instance for the whole app. Owns config, plugins, cookie policy, and the identity store binding. Exported from lib/auth.ts, imported only by server code (route handler, middleware, tRPC context, Server Components). | `betterauth-planner` |
| **BetterAuth route handler** | `app` | Mounts every BetterAuth endpoint under /api/auth/* via a single catch-all route: app/api/auth/[...all]/route.ts exporting toNextJsHandler(auth) from better-auth/next-js (export const { POST, GET } = toNextJsHandler(auth)). | `betterauth-planner` |
| **authClient (BetterAuth client instance)** | `app` | createAuthClient() from better-auth/react in lib/auth-client.ts. The only auth surface the browser ever imports. Provides signIn.email, signOut, useSession. | `betterauth-planner` |
| **Identity store (Cloudflare D1)** | `edge` | Holds the four BetterAuth tables. Bound to the Worker as a D1 binding and passed directly as betterAuth({ database: env.DB }) - the built-in Kysely adapter speaks D1 natively, so no ORM adapter and no connection pooling is involved. | `betterauth-planner` |
| **Route guard (middleware.ts, positive allowlist matcher)** | `app` | Redirects unauthenticated navigation on the cockpit routes to /sign-in. A UX affordance, NOT the security boundary. | `betterauth-planner` |
| **Route-group isolation (app/(app) vs app/(public))** | `app` | Structural separation: the authed cockpit lives in app/(app)/ with the auth-aware layout and the tRPC provider; the public reader lives in app/(public)/d/[token]/ with a layout that imports neither. | `betterauth-planner` |
| **tRPC session context + protectedProcedure** | `app` | The actual authorization boundary. createContext calls auth.api.getSession({ headers: req.headers }); protectedProcedure throws TRPCError({ code: 'UNAUTHORIZED' }) when ctx.session is null. | `betterauth-planner` |
| **Public reader routes (/d/[token], /d/[token]/assets/[id])** | `app` | Server Component + route handler that proxy the device origin and render/serve the shared document. No session read, no cookie write, own cache headers. | `betterauth-planner` |
| **Share-token shape validator** | `app` | Rejects any token that does not match the existing origin token grammar BEFORE an origin URL is constructed with the CF Access service token attached. | `betterauth-planner` |
| **CF Access service token (Worker to origin)** | `edge` | The second, entirely separate auth mechanism: CF-Access-Client-Id / CF-Access-Client-Secret headers on every Worker-to-device call, public reader and BFF alike. | `betterauth-planner` |
| **Origin is_public enforcement** | `device` | The device checks documents.is_public + share_token on GET /article/:shareToken and GET /article/:shareToken/assets/:fileObjectId. This is the access control for public reads. | `betterauth-planner` |
| **Auth bootstrap script** | `app` | One-shot `bun run auth:bootstrap` that calls auth.api.signUpEmail(...) against the same D1 database to create the single operator account. | `betterauth-planner` |

## Notes carried from the lenses

### packages/web (Next.js App Router package) — `nextjs-planner`

Non-negotiable placement finding: this PRD assumes the monorepo migration (imp-migrate-repo-monorepo-structure-1788024693) has landed, so the Expo app and its app/, components/, components.json, global.css, tailwind.config.js and tsconfig.json live at packages/mobile, and the repo root is a thin workspace orchestrator owning no product code. The Next app is therefore a sibling package, not a root scaffold. The shadcn and ai-elements CLIs must be run with cwd=packages/web so copied source lands in packages/web/components/ui and packages/web/components/ai-elements — a root-level init writes config the thin root has no business owning, and a run from packages/mobile drops Tailwind-v4 web source onto the Tailwind-v3 RN component tree.

### Route group (public) — `nextjs-planner`

The auth boundary is structural, not conditional. Public routes are provably outside auth because (a) they live under a route group whose layout chain contains no session read, and (b) proxy.ts's matcher is a positive allowlist that fails closed into public rather than a negative lookahead that fails open into auth.

### Route group (app) — `nextjs-planner`

The layout redirect is UX, not the security boundary. Layouts do not re-render on every client navigation, so authorization is enforced per-call in the tRPC context (protectedProcedure verifies the BetterAuth session on every procedure). Both belts are required; only the second is load-bearing.

### DocumentBody (shared server component) — `nextjs-planner`

Directly implements the staged design constraint that operator view and public page must be identical. Making it one module rather than two means 'preview' can be a link that opens the real public URL, because there is no second renderer that could drift. A snapshot test renders the same markdown through both call sites and diffs the HTML.

### Markdown pipeline (server-only module) — `nextjs-planner`

Runs only on the server; ships zero bytes to the client. Replaces markdownToHtml/inlineMarkdown in packages/platform/src/http/article.ts, which has no image rule at all and whose entire href sanitiser is href.startsWith('http').

### rehypeAssetUrls (local rehype plugin, ~20 lines) — `nextjs-planner`

This is the piece that actually makes images resolve. The origin's asset contract is /article/:shareToken/assets/:fileObjectId (packages/platform/src/http/hono-app.ts:169, and pinned in packages/platform/src/sync/client-data-contract-author.ts:74) but the public domain serves /d/. Without the rewrite the image markdown parses correctly and still 404s.

### rehypeHolocronAnchors (local rehype plugin, ~15 lines) — `nextjs-planner`

Chosen over rehype-slug + github-slugger deliberately. github-slugger produces different slugs (unicode retention, -1 dedupe suffixes) which would silently break intra-document anchor links inside already-published research documents. Porting the existing function verbatim is both smaller and lossless.

### lib/env.server.ts — `nextjs-planner`

Enforcement mechanism for the server-only binding rule: an accidental import from a Client Component becomes a build-time error naming the file, rather than a runtime mystery or a secret in the client bundle. Pair with a CI grep asserting cloudflare:workers appears in exactly this one file.

### proxy.ts (Next 16 rename of middleware.ts) — `nextjs-planner`

Exists for one reason the declarative next.config headers() cannot serve: status-conditional caching. Only 200 and 404 responses are written to caches.default; 5xx (device asleep) never is. Next 16 renamed middleware.ts to proxy.ts and proxy runs on the Node.js runtime with edge unsupported - a vinext compatibility item, see FR-NEXT-14.

### tRPC + TanStack Query provider island — `nextjs-planner`

Server layout renders Providers around children. This is the only place the client transport is constructed. The (public) group never mounts it.

### tRPC BFF router (server/trpc/routers/_app.ts) — `trpc-planner`

Runs inside a Next.js route handler at app/api/trpc/[trpc]/route.ts using fetchRequestHandler from @trpc/server/adapters/fetch - the only adapter valid on Workers. initTRPC.context<Ctx>().create({ isDev: false, errorFormatter }); errorFormatter strips stack and any device diagnostic fields before the shape reaches the client.

### DeviceClient (bound tunnel client) — `trpc-planner`

Exposes exactly two methods: client.mcp.call(toolName, input, { signal }) (Streamable HTTP to /mcp, Authorization: Bearer HOLO_KEY_MCP) and client.rest(path, init) (/api/*, Authorization: Bearer HOLO_KEY_RN). VERIFIED in packages/platform/src/http/middleware/scoped-key.ts: these are DISJOINT scopes - an mcp-scoped key on /api/* returns 403 and an rn-scoped key on /mcp returns 403. Sending one key to both surfaces is a build-breaking mistake. Both calls additionally carry CF-Access-Client-Id / CF-Access-Client-Secret (pattern already proven in packages/docs-reader/src/reader.ts).

### MCP client attach (server/device/mcp.ts) — `trpc-planner`

The device tool registry (VERIFIED in packages/platform/src/tools/registry.ts) already exposes hybrid_search, list_documents, get_document, share_document, unshare_document, deep_research, quick_research, deep_research_result, deep_research_control, get_research_session. The Library therefore needs NO new REST surface. The gateway forwards extra.signal into executePostgresMcpTool, so an aborted tRPC request aborts the device-side tool execution (device raises code CANCELLED). A Worker is stateless, so a client is created per request and pays an initialize + tools/list handshake - see technical_risks.

### chat.stream async-generator procedure — `trpc-planner`

Streaming mutations are officially supported: the tRPC v10-to-v11 migration guide states query and mutation resolvers may be AsyncGenerators over httpBatchStreamLink. Mutation (not query) is deliberate - a query would be GET-shaped, TanStack-cacheable, and refetch-on-focus would re-run and re-bill the turn.

### UIMessage reducer (lib/chat/reducer.ts) — `trpc-planner`

Dedupes record-ref parts by (kind, id) within a turn - this is the mechanical guarantee that a card cannot render twice. Holds ONLY placement and text; a card's contents come from documents.byId / research.byId.

### TanStack Query client + @trpc/tanstack-react-query options proxy — `trpc-planner`

The new TanStack-native client, not the classic @trpc/react-query hooks - TanStack Query v5.90 is already in the repo and there is no legacy tRPC to migrate. queryFilter/queryKey factories give the reducer a typed way to invalidate exactly one record.

### Link chain (lib/trpc/client.ts) — `trpc-planner`

Isolating the turn is load-bearing: invalidation-driven refetches fired DURING a turn must not be attached to the HTTP request that the turn is holding open for 60s.

### Holocron device (Hono + Postgres) behind origin-docs.holocrnlib.com — `trpc-planner`

Not built by this lens. Three gaps the BFF cannot paper over are recorded as FR-BFF-11/12/13.

### AgentLoopModule — `aisdk-planner`

Never imported into a Client Component. Holds ANTHROPIC_API_KEY via `import { env } from 'cloudflare:workers'` per the vinext binding rule. Lives under something like `app/server/agent/run-turn.ts`, owned by aisdk + trpc jointly - aisdk owns the file's internals, trpc owns the procedure wrapper.

### MCP client attach (per-request) — `aisdk-planner`

NOT ai-sdk/rsc, NOT bundled in `ai` core - confirmed by reading the installed ai@7.0.28 docs bundle (node_modules/ai/docs/07-reference/01-ai-sdk-core/23-create-mcp-client.mdx), which is more current than this KB's fact-graph. @ai-sdk/mcp is not yet an installed dependency anywhere in this repo - it must be added to the web client's package.json.

### streamText / ToolLoopAgent turn — `aisdk-planner`

Use streamText (not bare ToolLoopAgent) so the tRPC procedure can yield result.stream chunks directly - ToolLoopAgent's .stream() returns the same underlying stream shape but adds no value here since there is no second agent-level orchestration need beyond the tool loop streamText already provides.

### Slash-command interpreter — `aisdk-planner`

Deterministic, not agentic - per this project's Deterministic vs Probabilistic rule, command routing must never be left to the model to decide by prompt alone, since a slash command has to reliably mean the same thing every time (e.g. /deep-research MUST kick off a device job, not sometimes get answered inline by the model).

### Long-run device-job dispatcher — `aisdk-planner`

This is the mechanism that keeps a 20-minute run out of the Worker request. The agent's only job is the hand-off call; polling happens client-side against trpc.research.byId, per the stream-carries-invalidations rule.

### chat.stream tRPC procedure (async generator) — `aisdk-planner`

AI SDK's job stops at handing back an AsyncIterable of UIMessage-shaped parts; tRPC's job is transporting that iterable. Do not let the AI SDK layer know about tRPC serialization - keep run-turn.ts framework-agnostic so it stays testable with a real Anthropic call and a real MCP client without spinning up tRPC.

### Client UIMessage reducer — `aisdk-planner`

This is the AI SDK UI-shape contract the BFF must honor even though the hook itself can't run: every part type documented below must be exactly what @ai-sdk/react's reducer would have produced, so AI Elements render unmodified.

### MCP gateway (existing, unmodified) — `aisdk-planner`

Stateless (sessionIdGenerator: undefined), so the AI SDK MCP client's session-reattach options (initialSessionId, onSessionExpired, etc.) are irrelevant here - there is no session to reattach. enableDnsRebindingProtection + allowedOrigins must be proven against a real Worker-to-tunnel call before this plan's tasks can close (see capability chain below).

### docs.holocrnlib.com Worker (Next.js via vinext) — `cloudflare-workers-planner`

Deployed with `npx @vinext/cloudflare deploy`. `npx vinext check` must pass before this topology is committed to (settled as build-order step 0, not yet evidenced as run in this repo). Retires the standalone holocron-docs-reader Worker outright - no service-binding chain to it; the Next app absorbs its route directly.

### Public reader route - GET /d/[token] — `cloudflare-workers-planner`

Token validation (ORIGIN_SHARE_TOKEN_RE in the retiring reader.ts) should be ported as-is - it's the one piece of real logic in the current Worker worth keeping verbatim, not rebuilding.

### Asset proxy route - GET /d/[token]/assets/[id] — `cloudflare-workers-planner`

Origin returns Cache-Control: no-store on this endpoint (packages/platform/src/http/hono-app.ts asset handler) - the Worker must NOT pass that header through. It must apply the same applyReaderCacheHeaders(true) rewrite the HTML route uses, or the asset never enters the edge cache and every image request round-trips the tunnel.

### tRPC BFF router — `cloudflare-workers-planner`

Never serves /d/[token] - routing public traffic through tRPC would add a serialization layer and fight the Cache API model for zero benefit (per design brief section 2).

### AI SDK agent loop + MCP client — `cloudflare-workers-planner`

Server-only - import { env } from 'cloudflare:workers' for ORIGIN_BASE_URL / CF_ACCESS_CLIENT_ID / CF_ACCESS_CLIENT_SECRET, never from a Client Component. Long research runs (researchSession) must NOT execute inline in this Worker - kick off the device job and return; a 20-minute run inside a Worker request is out of scope regardless of CPU budget.

### Edge Cache API (caches.default) — `cloudflare-workers-planner`

PER-DATACENTER, not globally replicated. See cache_design.sla for what this means for the 60s revocation bound.

### origin-docs.holocrnlib.com (Hono, on-device) — `cloudflare-workers-planner`

The device sleeps. Current reader uses AbortSignal.timeout(10_000) on the origin fetch; this budget needs re-examination per call type (see cache_design and technical_risks).

### auth (BetterAuth server instance) — `betterauth-planner`

One instance, never one-per-route. Must be constructed where the D1 binding is reachable - import { env } from 'cloudflare:workers' at module scope under vinext; fall back to a lazy getAuth() singleton if the binding is not available at module init. lib/auth.ts carries import 'server-only'.

### BetterAuth route handler — `betterauth-planner`

This is the ONLY place auth endpoints exist. Do not hand-mount individual endpoints. Lives under app/(app)/ group semantics only nominally - API routes are outside route-group layouts, so the guard exclusion is by matcher, not by layout.

### authClient (BetterAuth client instance) — `betterauth-planner`

No client plugins are needed because no server plugin exposing client methods is enabled. If passkey is added later, passkeyClient() must be added here in the same change.

### Identity store (Cloudflare D1) — `betterauth-planner`

RECOMMENDED over the brief's default (device Postgres). See open_questions and technical_risks for the full argument and the Hyperdrive fallback. Chosen because BetterAuth's tables have zero foreign keys into the holocron schema and nothing in the holocron schema references a user id.

### Route guard (middleware.ts, positive allowlist matcher) — `betterauth-planner`

config.matcher is a POSITIVE list of gated paths ('/', '/chats/:path*', '/library/:path*'), never a negative lookahead. A negative matcher such as /((?!api|_next|d).*) is the classic bug that also excludes every future route beginning with the letter d. New routes are public-by-default here; that is deliberate, because the real authorization lives in the data layer.

### Route-group isolation (app/(app) vs app/(public)) — `betterauth-planner`

This is the greppable half of the public boundary: app/(public)/** must contain zero imports of lib/auth-client, lib/auth, or the tRPC provider. Cheap to enforce as a test in the existing pre-commit vitest run.

### tRPC session context + protectedProcedure — `betterauth-planner`

Every operator-facing query and mutation is a protectedProcedure. publicProcedure should not exist in this router at all - the public surface does not use tRPC (brief section 2). If a publicProcedure is ever needed, it is a design smell worth a second look.

### Public reader routes (/d/[token], /d/[token]/assets/[id]) — `betterauth-planner`

Excluded from the middleware matcher AND structurally isolated by route group. Responses are built with a fresh new Headers() so an origin Set-Cookie can never pass through - this is exactly what packages/docs-reader/src/reader.ts does today and the behaviour must survive the rewrite.

### Share-token shape validator — `betterauth-planner`

This already exists - isOriginShareToken() in packages/docs-reader/src/reader.ts, regex ^(?:mcp-|share-)?<uuid>$|^share-[A-Za-z0-9]+-[A-Za-z0-9]+$. LIFT IT VERBATIM. Re-deriving it will break live links (bare-UUID and mcp- prefixed tokens both exist in the wild) and losing it hands an attacker a path-traversal into privileged origin endpoints with the Worker's service token attached.

### CF Access service token (Worker to origin) — `betterauth-planner`

Wrangler secrets, never vars, never referenced from a Client Component. Existing worker comment 'Never log Access headers' carries over. This credential authorizes the WORKER to the device; it says nothing about which document a reader may see.

### Origin is_public enforcement — `betterauth-planner`

Already implemented and verified (brief section 3). Must stay authoritative even for service-token callers, so a Worker bug cannot leak a private document through the public reader path.

### Auth bootstrap script — `betterauth-planner`

Gated by an env flag (AUTH_ALLOW_BOOTSTRAP) that is never set on the deployed Worker, so the deployed app has no code path that can create an account. Credential recorded in the operator's password manager; the credential NAME goes in the AGENTS.md secret index, never the value.

---

_Merged verbatim from the `system_components` blocks of the five architecture lenses._

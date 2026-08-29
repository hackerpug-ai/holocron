---
stability: CONSTITUTION
last_validated: 2026-08-28
prd_version: 1.0.0
---

# External Dependencies

| Dependency | Purpose | Version / constraint | Proposed by |
|---|---|---|---|
| **next** | App Router framework for both faces. | 16.x - note middleware.ts is renamed proxy.ts, params/searchParams are Promises, | `nextjs-planner` |
| **react-markdown** | The markdown renderer for both the public page and the operator document view. | ^10 | `nextjs-planner` |
| **remark-gfm** | Tables, strikethrough, autolinks, task lists - parity with what the current hand-rolled renderer supports for  | ^4 | `nextjs-planner` |
| **rehype-sanitize** | Schema-based sanitisation on the hast tree, replacing the current href.startsWith('http') string check. | ^6 | `nextjs-planner` |
| **@trpc/client + @trpc/server + @tanstack/react-query** | BFF transport and client cache for the authed app. | v11 | `nextjs-planner` |
| **shadcn/ui + ai-elements** | Copied component source, not imported packages. CLIs must be run with cwd=services/web. | React 19 + Tailwind v4 | `nextjs-planner` |
| **server-only** | Turns an accidental client import of the bindings module into a build error. | latest | `nextjs-planner` |
| **@trpc/server** | Router, procedures, async-generator streaming, fetchRequestHandler adapter (the only Workers-valid adapter). | ^11 (v11 required - streaming mutations/queries over httpBatchStreamLink land in | `trpc-planner` |
| **@trpc/client** | createTRPCClient, httpBatchStreamLink, splitLink, loggerLink, TRPCClientError. | ^11, version-locked to @trpc/server | `trpc-planner` |
| **@trpc/tanstack-react-query** | createTRPCContext -> TRPCProvider + useTRPC; queryOptions/mutationOptions/queryKey/queryFilter factories. | ^11, version-locked to @trpc/server | `trpc-planner` |
| **@tanstack/react-query** | The client cache that carries truth; invalidation target for stream invalidate parts. | ^5.90.21 - ALREADY INSTALLED | `trpc-planner` |
| **zod** | Every procedure input and output schema. | 4.4.3 - ALREADY INSTALLED AND PINNED | `trpc-planner` |
| **@modelcontextprotocol/sdk (client side)** | Streamable-HTTP MCP client the BFF opens against the device gateway - the Library's read path AND the agent's  | 1.30.0 - ALREADY INSTALLED (device side); same version for the client | `trpc-planner` |
| **ai (Vercel AI SDK)** | streamText agent loop inside chat.stream; source of the stream parts the BFF translates into ChatStreamPart. | ^6.0.116 - ALREADY INSTALLED | `trpc-planner` |
| **Cloudflare Access service token** | Tunnel authentication to origin-docs.holocrnlib.com. | CF_ACCESS_CLIENT_ID + CF_ACCESS_CLIENT_SECRET as Worker secrets | `trpc-planner` |
| **Device scoped API keys (HOLO_KEY_MCP, HOLO_KEY_RN)** | Second auth layer inside the tunnel. /mcp accepts only mcp scope; /api/* accepts only rn scope. | Two distinct bearer tokens, Worker secrets | `trpc-planner` |
| **ai** | Core AI SDK - streamText, ToolLoopAgent, UIMessage stream part types, tool-result pairing enforcement | ^7.0.28 (installed-version truth in this repo's services/platform; NOT the stale | `aisdk-planner` |
| **@ai-sdk/mcp** | MCP client (createMCPClient) - as of ai@7.0.28 this is a SEPARATE package from `ai` core, confirmed by reading | VERIFY exact version against ai@^7.0.28 peer range at implementation time - not  | `aisdk-planner` |
| **@ai-sdk/anthropic** | Direct Anthropic provider for the model call - chosen over the AI Gateway string form because a Cloudflare Wor | match ai@^7.0.28 peer range; exact Anthropic model id to VERIFY at implementatio | `aisdk-planner` |
| **@ai-sdk/mcp/mcp-stdio (Experimental_StdioMCPTransport)** | NOT used here - listed only to rule it out: stdio transport is explicitly local-dev-only per the docs, irrelev | n/a - not a dependency of this feature | `aisdk-planner` |
| **vinext** | Vite plugin reimplementing the Next.js API surface for deployment as a Cloudflare Worker; the settled hosting  | beta - `npx vinext check` is a gating prerequisite, not yet evidenced as run in  | `cloudflare-workers-planner` |
| **@vinext/cloudflare** | Deploy CLI wrapping wrangler for the vinext output. | beta, tracks vinext | `cloudflare-workers-planner` |
| **wrangler** | CLI for dev/deploy/secrets against the Worker. | ^4.81.0 (per existing worker-docs-reader/wrangler.jsonc $schema pin - carry forw | `cloudflare-workers-planner` |
| **Cloudflare Access (service tokens)** | Origin auth for every Worker-to-device call (reader, assets, tRPC-to-origin, MCP client) via CF-Access-Client- | n/a | `cloudflare-workers-planner` |
| **Cloudflare Tunnel (cloudflared) to origin-docs.holocrnlib.com** | The only network path from the Worker to the device. | n/a | `cloudflare-workers-planner` |
| **better-auth** | The auth framework itself: server instance, handler, session management, cookie policy. | pin an exact version in package.json; re-read the docs at implementation time -  | `betterauth-planner` |
| **better-auth/next-js** | toNextJsHandler(auth) for the catch-all mount; nextCookies() plugin if Server Actions are ever used. | same package as better-auth | `betterauth-planner` |
| **auth CLI (`npx auth@latest generate` / `migrate`)** | Generates the four-table schema. With the built-in Kysely/D1 adapter it emits SQL. | run pinned to the installed better-auth version | `betterauth-planner` |
| **Cloudflare D1** | Identity store binding for the Worker. | binding added to wrangler.jsonc; no existing D1 binding in services/worker-docs- | `betterauth-planner` |
| **Workers nodejs_compat compatibility flag** | Node crypto surface for BetterAuth's default scrypt password hashing. | compatibility_flags: ["nodejs_compat"] alongside a current compatibility_date | `betterauth-planner` |
| **Cloudflare Access service tokens (existing)** | Worker-to-device origin auth for both the public reader and the BFF. CF_ACCESS_CLIENT_ID / CF_ACCESS_CLIENT_SE | already provisioned; names already in the AGENTS.md secret index | `betterauth-planner` |
| **vinext (middleware.ts support)** | The route guard's home. | beta - brief build order step 0 is `npx vinext check` | `betterauth-planner` |
| **isOriginShareToken (in-repo, services/worker-docs-reader/src/reader.ts)** | Share-token grammar validator that must be lifted into the Next public routes. | copy the regex verbatim: ^(?:mcp-|share-)?<uuid>$|^share-[A-Za-z0-9]+-[A-Za-z0-9 | `betterauth-planner` |
| **shadcn/ui (v6, Base UI flavour)** | Product chrome for the operator shell, Library and Share lifecycle: sidebar, command palette, rows, chips, car | - | `shadcn-ai-elements-planner` |
| **AI Elements (Vercel, v6)** | The chat surface only: Conversation scroller, Message frames, PromptInput with submit/stop, collapsed Tool row | - | `shadcn-ai-elements-planner` |
| **shadcn typeset** | The mechanism that makes the chrome-vs-column rule structural instead of a habit. One owned CSS file styles al | - | `shadcn-ai-elements-planner` |
| **Tailwind CSS v4** | Token layer for services/web. @theme inline maps the CSS variables below to utilities. | - | `shadcn-ai-elements-planner` |
| **lucide-react** | Icon set for both registries. | - | `shadcn-ai-elements-planner` |

## Risk notes and documentation

### next

**Docs.** https://nextjs.org/docs

**Purpose.** App Router framework for both faces.

**Version.** 16.x - note middleware.ts is renamed proxy.ts, params/searchParams are Promises, and next lint is removed (use ESLint directly).

**Risk.** Low on its own. The interaction surface with vinext beta is where the risk lives, not in Next itself.

_Proposed by `nextjs-planner`._

---

### react-markdown

**Docs.** https://github.com/remarkjs/react-markdown

**Purpose.** The markdown renderer for both the public page and the operator document view.

**Version.** ^10

**Risk.** Low. Chosen over marked+DOMPurify because DOMPurify needs a DOM (jsdom) which is a poor fit for workerd and adds weight; the unified pipeline is a pure AST transform with no DOM dependency. It emits React elements rather than an HTML string, which is what lets img become a real Figure component with a caption slot - a design requirement, not a nicety - and it never uses dangerouslySetInnerHTML.

_Proposed by `nextjs-planner`._

---

### remark-gfm

**Docs.** https://github.com/remarkjs/remark-gfm

**Purpose.** Tables, strikethrough, autolinks, task lists - parity with what the current hand-rolled renderer supports for tables.

**Version.** ^4

**Risk.** Low.

_Proposed by `nextjs-planner`._

---

### rehype-sanitize

**Docs.** https://github.com/rehypejs/rehype-sanitize

**Purpose.** Schema-based sanitisation on the hast tree, replacing the current href.startsWith('http') string check.

**Version.** ^6

**Risk.** Medium and it is the security-load-bearing choice, so the reasoning matters. The current check is simultaneously too permissive (any http:// URL passes) and too restrictive (every relative asset path collapses to href='#', which is half of why images are broken). Schema sanitisation on the parsed tree is the correct posture: extend the GitHub base schema to permit img with src/alt/title/width/height, id on headings, and an explicit protocol allowlist of http/https/mailto for href and https plus same-origin-relative for src. Sanitisation runs AFTER rehypeAssetUrls so the rewritten paths are what gets validated. Raw HTML is never enabled at all (allowDangerousHtml stays false). Document content is AI-generated and folds in scraped web text, so it is untrusted input.

_Proposed by `nextjs-planner`._

---

### @trpc/client + @trpc/server + @tanstack/react-query

**Docs.** https://trpc.io/docs

**Purpose.** BFF transport and client cache for the authed app.

**Version.** v11

**Risk.** Medium. httpBatchStreamLink requires genuinely unbuffered chunked responses through vinext; this is the single Next-layer feature most likely to be broken by the beta host and the entire Chats surface depends on it.

_Proposed by `nextjs-planner`._

---

### shadcn/ui + ai-elements

**Docs.** https://ui.shadcn.com/docs/cli

**Purpose.** Copied component source, not imported packages. CLIs must be run with cwd=services/web.

**Version.** React 19 + Tailwind v4

**Risk.** Medium at install time only: the root already has a components.json and tailwind.config.js belonging to the RN app, and running either CLI from the repo root would write into the React Native component tree.

_Proposed by `nextjs-planner`._

---

### server-only

**Docs.** https://www.npmjs.com/package/server-only

**Purpose.** Turns an accidental client import of the bindings module into a build error.

**Version.** latest

**Risk.** Low. This is the enforcement mechanism for the cloudflare:workers rule, so its absence is the risk, not its presence.

_Proposed by `nextjs-planner`._

---

### @trpc/server

**Docs.** https://trpc.io/docs/server/adapters/fetch

**Purpose.** Router, procedures, async-generator streaming, fetchRequestHandler adapter (the only Workers-valid adapter).

**Version.** ^11 (v11 required - streaming mutations/queries over httpBatchStreamLink land in v11)

**Risk.** Not yet installed in the repo. Must be validated against the pinned zod@4.4.3 (v11 accepts Standard Schema validators; verify with one real procedure before the router is built out).

_Proposed by `trpc-planner`._

---

### @trpc/client

**Docs.** https://trpc.io/docs/client/links/httpBatchStreamLink

**Purpose.** createTRPCClient, httpBatchStreamLink, splitLink, loggerLink, TRPCClientError.

**Version.** ^11, version-locked to @trpc/server

**Risk.** Response streaming must survive the Worker + vinext route-handler path unbuffered. Prove with a trivial 3-chunk generator before building the agent loop on it.

_Proposed by `trpc-planner`._

---

### @trpc/tanstack-react-query

**Docs.** https://trpc.io/docs/client/tanstack-react-query/setup

**Purpose.** createTRPCContext -> TRPCProvider + useTRPC; queryOptions/mutationOptions/queryKey/queryFilter factories.

**Version.** ^11, version-locked to @trpc/server

**Risk.** Deliberately chosen over the classic @trpc/react-query hooks. Low risk (no legacy tRPC to migrate) but it is the newer of the two integrations.

_Proposed by `trpc-planner`._

---

### @tanstack/react-query

**Docs.** https://tanstack.com/query/latest/docs/framework/react/overview

**Purpose.** The client cache that carries truth; invalidation target for stream invalidate parts.

**Version.** ^5.90.21 - ALREADY INSTALLED

**Risk.** None.

_Proposed by `trpc-planner`._

---

### zod

**Docs.** https://zod.dev

**Purpose.** Every procedure input and output schema.

**Version.** 4.4.3 - ALREADY INSTALLED AND PINNED

**Risk.** Device tool schemas are already Zod 4, so BFF output schemas can be derived from them rather than hand-copied. Pin drift between BFF and device schemas is the real hazard, not the library.

_Proposed by `trpc-planner`._

---

### @modelcontextprotocol/sdk (client side)

**Docs.** https://modelcontextprotocol.io/docs/concepts/transports

**Purpose.** Streamable-HTTP MCP client the BFF opens against the device gateway - the Library's read path AND the agent's tool surface.

**Version.** 1.30.0 - ALREADY INSTALLED (device side); same version for the client

**Risk.** The device transport sets enableDnsRebindingProtection: true with allowedOrigins: [request.url origin]. Worker-to-device calls normally send no Origin header, which should pass - PROVE IT WITH A REAL CALL before the router depends on it (the brief flags this as first-contact verification).

_Proposed by `trpc-planner`._

---

### ai (Vercel AI SDK)

**Docs.** https://ai-sdk.dev/docs/ai-sdk-core/generating-text

**Purpose.** streamText agent loop inside chat.stream; source of the stream parts the BFF translates into ChatStreamPart.

**Version.** ^6.0.116 - ALREADY INSTALLED

**Risk.** useChat/useCompletion are UNAVAILABLE by design (trpc#6103). Do not add @ai-sdk/react hooks to the chat surface.

_Proposed by `trpc-planner`._

---

### Cloudflare Access service token

**Docs.** https://developers.cloudflare.com/cloudflare-one/identity/service-tokens/

**Purpose.** Tunnel authentication to origin-docs.holocrnlib.com.

**Version.** CF_ACCESS_CLIENT_ID + CF_ACCESS_CLIENT_SECRET as Worker secrets

**Risk.** Server-only. A CF Access rejection returns an HTML login page, not JSON - the DeviceClient must detect this and surface auth_failed, not a JSON parse error.

_Proposed by `trpc-planner`._

---

### Device scoped API keys (HOLO_KEY_MCP, HOLO_KEY_RN)

**Docs.** services/platform/src/http/middleware/scoped-key.ts

**Purpose.** Second auth layer inside the tunnel. /mcp accepts only mcp scope; /api/* accepts only rn scope.

**Version.** Two distinct bearer tokens, Worker secrets

**Risk.** There is no web scope today, so the BFF would reuse the mobile app's rn key - shared credential, no independent revocation, and /api/chat-runs ownership is keyed on scope. See FR-BFF-13.

_Proposed by `trpc-planner`._

---

### ai

**Docs.** https://ai-sdk.dev/docs

**Purpose.** Core AI SDK - streamText, ToolLoopAgent, UIMessage stream part types, tool-result pairing enforcement

**Version.** ^7.0.28 (installed-version truth in this repo's services/platform; NOT the stale 6.0.116 sitting in the repo root node_modules - the new web client package.json must pin ^7.x explicitly, do not inherit a hoisted v6)

**Risk.** Root-level node_modules/ai resolving to v6 is a real hazard if the web client's package isn't given its own explicit ai@^7 dependency and a workspace resolution that doesn't accidentally hoist the stale v6 install.

_Proposed by `aisdk-planner`._

---

### @ai-sdk/mcp

**Docs.** https://ai-sdk.dev/docs/reference/ai-sdk-core/create-mcp-client

**Purpose.** MCP client (createMCPClient) - as of ai@7.0.28 this is a SEPARATE package from `ai` core, confirmed by reading the installed docs bundle, not the fact-graph (which doesn't list it). This is a gap in this KB worth flagging upstream.

**Version.** VERIFY exact version against ai@^7.0.28 peer range at implementation time - not currently installed anywhere in this repo, must be added fresh

**Risk.** Not yet proven against this repo's actual gateway. Also: the client explicitly does NOT support receiving server notifications (including MCP progress notifications) - this directly conflicts with the design brief's claim that 'progress notifications forwarded' by the gateway will reach the agent. They will reach the gateway's stdio/Claude-Code-style consumers, but NOT this AI SDK MCP client. See open_questions.

_Proposed by `aisdk-planner`._

---

### @ai-sdk/anthropic

**Docs.** https://ai-sdk.dev/providers/ai-sdk-providers/anthropic

**Purpose.** Direct Anthropic provider for the model call - chosen over the AI Gateway string form because a Cloudflare Worker cannot reach the tailnet-only LiteLLM fleet (127.0.0.1:4545) at all, and the settled decision already puts model credentials in the BFF

**Version.** match ai@^7.0.28 peer range; exact Anthropic model id to VERIFY at implementation time via the claude-api skill/docs rather than assumed here

**Risk.** Every web-client turn now costs real Anthropic API spend with no local-fleet offset, on top of the already-accepted Workers Paid CPU cost - two new line items stacking, not previously priced together in the brief's section 7 accepted costs.

_Proposed by `aisdk-planner`._

---

### @ai-sdk/mcp/mcp-stdio (Experimental_StdioMCPTransport)

**Docs.** https://ai-sdk.dev/docs/reference/ai-sdk-core/mcp-stdio-transport

**Purpose.** NOT used here - listed only to rule it out: stdio transport is explicitly local-dev-only per the docs, irrelevant to a Worker talking to a remote gateway over Streamable HTTP

**Version.** n/a - not a dependency of this feature

**Risk.** none - flagged only to prevent an implementer from reaching for the wrong transport

_Proposed by `aisdk-planner`._

---

### vinext

**Docs.** https://developers.cloudflare.com/workers/frameworks/framework-guides/nextjs/

**Purpose.** Vite plugin reimplementing the Next.js API surface for deployment as a Cloudflare Worker; the settled hosting path for this app.

**Version.** beta - `npx vinext check` is a gating prerequisite, not yet evidenced as run in this repo

**Risk.** Beta status is the single biggest edge-layer risk in this whole plan. A Next.js API surface this app depends on (streaming responses, middleware, custom-domain routing) not yet covered by vinext blocks the entire hosting decision, not just one feature.

_Proposed by `cloudflare-workers-planner`._

---

### @vinext/cloudflare

**Docs.** https://developers.cloudflare.com/workers/frameworks/framework-guides/nextjs/

**Purpose.** Deploy CLI wrapping wrangler for the vinext output.

**Version.** beta, tracks vinext

**Risk.** Same beta-maturity risk as vinext itself; deploy-time behavior (custom domain binding, secrets injection) unverified against this app's shape.

_Proposed by `cloudflare-workers-planner`._

---

### wrangler

**Docs.** https://developers.cloudflare.com/workers/wrangler/

**Purpose.** CLI for dev/deploy/secrets against the Worker.

**Version.** ^4.81.0 (per existing worker-docs-reader/wrangler.jsonc $schema pin - carry forward or bump deliberately, not silently)

**Risk.** Low - mature, stable tool.

_Proposed by `cloudflare-workers-planner`._

---

### Cloudflare Access (service tokens)

**Docs.** https://developers.cloudflare.com/cloudflare-one/identity/service-tokens/

**Purpose.** Origin auth for every Worker-to-device call (reader, assets, tRPC-to-origin, MCP client) via CF-Access-Client-Id/Secret headers.

**Version.** n/a

**Risk.** Medium - token rotation isn't tested against this design; see technical_risks.

_Proposed by `cloudflare-workers-planner`._

---

### Cloudflare Tunnel (cloudflared) to origin-docs.holocrnlib.com

**Docs.** https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/

**Purpose.** The only network path from the Worker to the device.

**Version.** n/a

**Risk.** Medium - HTTP-only today; if BetterAuth needs Hyperdrive/TCP Postgres, that's a second tunnel surface that doesn't exist yet.

_Proposed by `cloudflare-workers-planner`._

---

### better-auth

**Docs.** https://better-auth.com/docs/introduction

**Purpose.** The auth framework itself: server instance, handler, session management, cookie policy.

**Version.** pin an exact version in package.json; re-read the docs at implementation time - the library moves fast and the planner KB is pinned to 2026-08

**Risk.** Version drift between the config surface used here and the installed release. Mitigation: pin exact, and let `npx auth@latest generate` be the only source of the schema.

_Proposed by `betterauth-planner`._

---

### better-auth/next-js

**Docs.** https://better-auth.com/docs/integrations/next

**Purpose.** toNextJsHandler(auth) for the catch-all mount; nextCookies() plugin if Server Actions are ever used.

**Version.** same package as better-auth

**Risk.** vinext reimplements the Next API surface rather than being Next; the Next adapter must be proved against a real vinext build, not assumed. This is a first-contact verification item.

_Proposed by `betterauth-planner`._

---

### auth CLI (`npx auth@latest generate` / `migrate`)

**Docs.** https://better-auth.com/docs/concepts/cli

**Purpose.** Generates the four-table schema. With the built-in Kysely/D1 adapter it emits SQL.

**Version.** run pinned to the installed better-auth version

**Risk.** Low. Generated SQL is applied with `wrangler d1 migrations apply`, giving a normal reviewable migration file.

_Proposed by `betterauth-planner`._

---

### Cloudflare D1

**Docs.** https://developers.cloudflare.com/d1/

**Purpose.** Identity store binding for the Worker.

**Version.** binding added to wrangler.jsonc; no existing D1 binding in services/worker-docs-reader/wrangler.jsonc today

**Risk.** Adds a second store to the mental model and is outside the existing pgbackrest/restic-to-R2 backup. Mitigated by the fact that the recoverable content is one user row - recovery is re-bootstrap, not restore.

_Proposed by `betterauth-planner`._

---

### Workers nodejs_compat compatibility flag

**Docs.** https://developers.cloudflare.com/workers/runtime-apis/nodejs/

**Purpose.** Node crypto surface for BetterAuth's default scrypt password hashing.

**Version.** compatibility_flags: ["nodejs_compat"] alongside a current compatibility_date

**Risk.** scrypt is deliberately CPU-expensive. Sign-in may exceed the Workers Free 10ms CPU ceiling. Must be measured with a real sign-in under wrangler dev/deployed, not assumed. Cross-references brief section 7 'Workers Paid is probably required'.

_Proposed by `betterauth-planner`._

---

### Cloudflare Access service tokens (existing)

**Docs.** https://developers.cloudflare.com/cloudflare-one/identity/service-tokens/

**Purpose.** Worker-to-device origin auth for both the public reader and the BFF. CF_ACCESS_CLIENT_ID / CF_ACCESS_CLIENT_SECRET.

**Version.** already provisioned; names already in the AGENTS.md secret index

**Risk.** This is the highest-value credential in the system - it is the device's front door. Worker secrets only. Never vars, never logged, never reachable from a Client Component.

_Proposed by `betterauth-planner`._

---

### vinext (middleware.ts support)

**Docs.** https://developers.cloudflare.com/workers/framework-guides/web-apps/nextjs/

**Purpose.** The route guard's home.

**Version.** beta - brief build order step 0 is `npx vinext check`

**Risk.** If middleware.ts behaves differently under vinext than under Next, the guard silently no-ops. This is survivable BECAUSE the real gate is protectedProcedure - but the redirect UX would break. Verify with a real cookie-free request to /library under a real build.

_Proposed by `betterauth-planner`._

---

### isOriginShareToken (in-repo, services/worker-docs-reader/src/reader.ts)

**Docs.** https://github.com/

**Purpose.** Share-token grammar validator that must be lifted into the Next public routes.

**Version.** copy the regex verbatim: ^(?:mcp-|share-)?<uuid>$|^share-[A-Za-z0-9]+-[A-Za-z0-9]+$

**Risk.** Re-deriving it as share-<uuid> breaks bare-UUID and mcp- prefixed tokens already in the wild, violating the brief's byte-for-byte URL compatibility constraint.

_Proposed by `betterauth-planner`._

---

### shadcn/ui (v6, Base UI flavour)

**Docs.** https://ui.shadcn.com/docs

**Purpose.** Product chrome for the operator shell, Library and Share lifecycle: sidebar, command palette, rows, chips, cards, empty states, toasts. Provides the CSS-variable token contract the holocron identity is expressed in.

**Notes.** Open Code: the CLI COPIES source into services/web/components/ui/. There is no npm component package. Every invocation must carry cwd=services/web - the repo root already has components.json (RN/Tailwind v3, style 'default', baseColor slate) and a bare root init would overwrite it and break the Expo app. Root tailwind.config.js globs ./app ./components ./lib only, so it will not reach services/web; the two Tailwind majors coexist because the packages are separate. Root uses the v3 hsl(var(--x)) convention - do not carry hsl() wrappers into the v4 file.

_Proposed by `shadcn-ai-elements-planner`._

---

### AI Elements (Vercel, v6)

**Docs.** https://ai-sdk.dev/elements/overview

**Purpose.** The chat surface only: Conversation scroller, Message frames, PromptInput with submit/stop, collapsed Tool rows, Reasoning disclosure. Renders the ChatStreamPart union after the reducer folds it into UIMessage shape.

**Notes.** A shadcn REGISTRY, not a second design system - same Open Code mechanism, lands in services/web/components/ai-elements/. The npm 'ai-elements' package is the CLI, never an import source. Auto-installs shadcn/ui if absent, which is why shadcn init must run FIRST with the intended base and style, or the registry picks defaults for us. Markdown in chat arrives via MessageResponse (Streamdown, remark-gfm + math + katex) inside the message item - do not add a separate response/markdown item.

_Proposed by `shadcn-ai-elements-planner`._

---

### shadcn typeset

**Docs.** https://ui.shadcn.com/docs/typeset

**Purpose.** The mechanism that makes the chrome-vs-column rule structural instead of a habit. One owned CSS file styles all long-form prose inside a .typeset container via --typeset-size / --typeset-leading / --typeset-flow, with not-typeset as the opt-out and typeset-scroll for over-wide tables.

**Notes.** Typeset lives in the components layer and uses :where(), so Tailwind utilities still win without !important. A .typeset-doc preset holds the ONE measure/type-scale/figure treatment shared by /d/[token] and /library/[documentId] - the design lens requires them identical, and a shared preset is cheaper to keep identical than two stylesheets.

_Proposed by `shadcn-ai-elements-planner`._

---

### Tailwind CSS v4

**Docs.** https://tailwindcss.com/docs

**Purpose.** Token layer for services/web. @theme inline maps the CSS variables below to utilities.

**Notes.** OPEN RISK: vinext is a Vite plugin, so Tailwind v4 normally integrates via @tailwindcss/vite, while shadcn's -t next template writes a PostCSS config. Resolve this at scaffold time, not at step 3. Root package stays on Tailwind v3 - untouched.

_Proposed by `shadcn-ai-elements-planner`._

---

### lucide-react

**Docs.** https://lucide.dev

**Purpose.** Icon set for both registries.

**Notes.** Set iconLibrary at init; changing it later means running shadcn migrate icons across the whole ui/ tree.

_Proposed by `shadcn-ai-elements-planner`._

---


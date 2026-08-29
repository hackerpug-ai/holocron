---
stability: CONSTITUTION
last_validated: 2026-08-28
prd_version: 1.0.0
---

# Routing & Views

## Principle and discriminator

A new **route** exists only where a product *seam* is crossed — where the whole frame composition
changes. Everything else is a **state** of an existing view. A candidate that differs from an
existing route only by overlay, content or input state is a state, and is recorded in that route's
States column rather than given a path of its own.

Applying that discriminator to 20 use cases yields **9 routes**. Route proliferation was rejected in
three places: the withdrawn document is a *state* of `/d/[token]` (same frame, different content),
the Library's selection affordance is a *state* of `/library/[documentId]`, and the audit view is a
*state* of `/library` reached by a filter chip, not a `/library/shared` route.

## Router decision

Next.js App Router file-based routing, with **route groups carrying the auth boundary**:
`(public)` for the reader, `(app)` for the cockpit, `(auth)` for sign-in. The boundary is structural
— `(public)`'s layout chain performs no session read — rather than conditional on a matcher, so a
new route added under `(public)` cannot accidentally acquire auth, and a new route under `(app)`
cannot accidentally lose it.

## Route map

| Route | Path | Kind | Rendering | States | Primary UCs | Enter when |
|---|---|---|---|---|---|---|
| `/d/[token]` | `app/(public)/d/[token]/page.tsx` | public | server-component | document (200, text visible on first paint, figures inline) · withdrawn (404, calm 'no longer shared' page) · device unreachable (500/502, 'temporaril | `UC-READ-01`, `UC-READ-02`, `UC-READ-03`, `UC-READ-04`, `UC-READ-06` | Any GET to docs.holocrnlib.com/d/<token> from any client. URL shape is frozen: the MCP share_document tool des |
| `/d/[token] not-found` | `app/(public)/d/[token]/not-found.tsx` | public | server-component | withdrawn by author | `UC-READ-01`, `UC-READ-02`, `UC-READ-03`, `UC-READ-04`, `UC-READ-06` | Origin returns 404 for the share token (is_public flipped false, or token never existed) and the page calls no |
| `/d/[token] error` | `app/(public)/d/[token]/error.tsx` | public | client-component | device asleep / origin timeout / Access token rejected | `UC-READ-01`, `UC-READ-02`, `UC-READ-03`, `UC-READ-04`, `UC-READ-06` | The origin fetch throws or returns 5xx. Distinct from 404 on purpose: caching a transient sleep as 'withdrawn' |
| `/d/[token]/assets/[id]` | `app/(public)/d/[token]/assets/[id]/route.ts` | public | route-handler | 200 binary · 404 (unshared or asset not on this token) · 502 (origin unreachable) | `UC-READ-01`, `UC-READ-02`, `UC-READ-03`, `UC-READ-04`, `UC-READ-06` | The browser requests an image src emitted by rehypeAssetUrls. This route does not exist today - the origin imp |
| `/` | `app/(app)/page.tsx` | authed | server-component | redirect to /chats | `UC-READ-01`, `UC-READ-02`, `UC-READ-03`, `UC-READ-04`, `UC-READ-06` | Authenticated operator hits the apex path. |
| `/chats and /chats/[conversationId]` | `app/(app)/chats/[[...conversationId]]/page.tsx` | authed | client-component | empty (no conversation) · idle thread · streaming turn · tool call in flight · device unreachable · cancelled | — | Operator opens Chats, or arrives from the Library's 'Ask about this' with a quoted passage in the URL/router s |
| `/library` | `app/(app)/library/page.tsx` | authed | server-component | results · empty archive · no matches for query · device asleep (shell renders, results panel degrades) | `UC-LIB-01`, `UC-LIB-02`, `UC-SHARE-02` | Operator opens the Library or edits search/filter state, which is held in URL searchParams so a search is link |
| `/library/[documentId]` | `app/(app)/library/[documentId]/page.tsx` | authed | server-component | document · not found · device asleep | `UC-LIB-01`, `UC-LIB-02`, `UC-SHARE-02` | Operator opens a document from the Library. |
| `/sign-in` | `app/(auth)/sign-in/page.tsx` | public | client-component | form · submitting · invalid credentials · auth backend unreachable | `UC-SHELL-01` | Unauthenticated request to any (app) route redirects here. Lives in its own (auth) route group so it is not wr |
| `/api/trpc/[trpc]` | `app/api/trpc/[trpc]/route.ts` | authed | route-handler | ok · unauthorised · device unreachable | — | Every tRPC call from the operator app, including the chat.stream async-generator procedure. |
| `/api/auth/[...all]` | `app/api/auth/[...all]/route.ts` | public | route-handler | ok · error | — | BetterAuth handler mount. Public route by necessity (sign-in must be reachable unauthenticated) but not in the |

## Route contract

| Route | Cache posture |
|---|---|
| `/d/[token]` | public, max-age=60, s-maxage=60 + Cloudflare-CDN-Cache-Control: max-age=60, asserted via next.config headers() on source '/d/:token' and written to caches.default by proxy.ts for status 200 and 404 only. Deliberately does NOT rely on Next ISR / the incremental |
| `/d/[token] not-found` | Same 60s pair as the 200 path - negative caching is what keeps revocation cheap instead of hammering a sleeping device. MUST return HTTP status 404, not 200; the edge caches on status and a 200-with-404-content would be cached as a valid document. |
| `/d/[token] error` | Cache-Control: no-store. proxy.ts must skip cache.put for any non-200/404 status. This is the only 'use client' file in the entire (public) tree and it renders no interactivity beyond a retry link. |
| `/d/[token]/assets/[id]` | Route Handlers own their Response headers directly, so both cache headers are set in code here rather than via next.config. The origin emits Cache-Control: no-store on this endpoint (hono-app.ts:189) and that header MUST be discarded, never forwarded. Stream t |
| `/` | private, no-store |
| `/chats and /chats/[conversationId]` | private, no-store. Client Component because the UIMessage reducer folding streamed parts is client state; useChat is unavailable through tRPC (issue #6103) and AI Elements are driven directly via their state props instead. |
| `/library` | private, no-store. Server Component shell + server-side tRPC prefetch into a HydrationBoundary so first paint is results rather than a spinner; a Client island owns the search input and filter chips. |
| `/library/[documentId]` | private, no-store. Renders the SAME DocumentBody module as /d/[token] with assetBase pointing at the authed asset path. A small Client island listens for text selection and renders the single 'Ask about this' affordance - the Library's only AI surface. |
| `/sign-in` | private, no-store |
| `/api/trpc/[trpc]` | Cache-Control: private, no-store set explicitly on every response. This surface must never touch caches.default - the Workers Cache API has no per-user partitioning. |
| `/api/auth/[...all]` | private, no-store |

## Guards and persistence

- **Guard mechanism.** `proxy.ts` (Next 16's rename of `middleware.ts`) with a **positive
  allowlist** matcher naming only gated paths. Never a negative lookahead — `/((?!api|_next|d).*)`
  excludes every path beginning with the letter `d`, a one-character bug that would gate or ungate
  the wrong half of the product.
- **The guard is UX, not the boundary.** Authorization is enforced per call in the tRPC context.
  A layout does not re-render on every client navigation, so a layout check is not an authorization
  boundary for data.
- **Persistence.** Library search and filter state lives in URL `searchParams`, so a filtered search
  is linkable and back/forward works. The reading position is restored when returning from
  "Ask about this".

## Route Delta — v1.0.0

Every route is NEW at v1.0.0; the delta table exists so later versions record change rather than
restating the map.

| Route | Change | Detail | Discriminator rationale |
|---|---|---|---|
| `/d/[token]` | NEW | public · server-component | initial map |
| `/d/[token] not-found` | NEW | public · server-component | initial map |
| `/d/[token] error` | NEW | public · client-component | initial map |
| `/d/[token]/assets/[id]` | NEW | public · route-handler | initial map |
| `/` | NEW | authed · server-component | initial map |
| `/chats and /chats/[conversationId]` | NEW | authed · client-component | initial map |
| `/library` | NEW | authed · server-component | initial map |
| `/library/[documentId]` | NEW | authed · server-component | initial map |
| `/sign-in` | NEW | public · client-component | initial map |
| `/api/trpc/[trpc]` | NEW | authed · route-handler | initial map |
| `/api/auth/[...all]` | NEW | public · route-handler | initial map |

## UI-facing UC coverage

19 of 20 use cases are UI-facing; each maps to a route above.
`UC-READ-06` (preserve every circulating share link) is deliberately **not** UI-facing — it is a URL
contract asserted by tests, not a screen.

---

_Route map merged from `nextjs-planner.architecture.json` (`routes`) and
`shadcn-ai-elements-planner.ui-infra.json` (`route_map_draft`)._

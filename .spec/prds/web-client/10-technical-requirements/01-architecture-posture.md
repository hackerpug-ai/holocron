---
stability: CONSTITUTION
last_validated: 2026-08-29
prd_version: 1.0.1
---

# Architecture Posture

Seven stances that everything else follows from.

### 1. One Next.js application, two faces, one hostname

The app envelops the existing `docs.holocrnlib.com`. Public routes live under a `(public)` route
group whose entire layout chain performs no session read and imports no auth module; the operator
cockpit lives under `(app)`. The boundary is **structural**, not conditional.

### 2. `packages/web` is a first-class workspace package — never the repo root

This PRD is written against the **post-monorepo** layout
(`imp-migrate-repo-monorepo-structure-1788024693`, assumed landed): every installable module lives
under `packages/*` and the repo root is a **thin pnpm workspace orchestrator** that owns no product
code. Verified on branch
`improvement/imp-migrate-repo-monorepo-structure-1788024693-migrate-repo-monorepo-structure`:

| Path | Package name (`pnpm --filter` target) | Contents |
|---|---|---|
| `packages/web` | `@holocron/web` | **This PRD's Next.js app.** Today a placeholder — `package.json` + README, no app code. |
| `packages/mobile` | `@holocron/mobile` | The Expo client. Owns `app/`, `components/`, `components.json`, `global.css`, `tailwind.config.js`, `tsconfig.json`. Live Expo config is `app.config.cjs`. |
| `packages/platform` | `platform` *(unscoped — not `@holocron/platform`)* | Hono/Mastra backend, Fulcrum in-process. Secrets at `packages/platform/config/secrets.yaml`. |
| `packages/mcp` | `@holocron/mcp-unified` | MCP server. |
| `packages/docs-reader` | `holocron-docs-reader` | The Worker this PRD's public reader replaces. |

`pnpm-workspace.yaml` is `packages/*` only. Root `package.json` is private and delegates
(`pnpm --filter @holocron/mobile …`). `.e2e/` (Maestro), `.maestro/`, `scripts/`, `tools/`,
`tests/`, `design/`, `docs/` and `vitest.workspace.ts` stay at the repo root.

`packages/web` therefore already exists as the private `@holocron/web` placeholder and is already
enrolled by the `packages/*` glob; this PRD's work **replaces that placeholder with the real Next.js
app**. Nothing is added to `pnpm-workspace.yaml`.

The `cwd` discipline survives the migration for a different reason than before. Each package owns
its own `tsconfig.json`, `tailwind.config`, `components.json` and `global.css`, so every `shadcn`
and `ai-elements` CLI invocation carries `cwd=packages/web` — a root-level `init` writes a
config the thin root has no business owning, and a run from `packages/mobile` would copy web
components on top of the React Native tree. `packages/web/tsconfig.json` declares its own
`paths { "@/*": ["./*"] }` resolving inside `packages/web` only.

### 3. vinext, not OpenNext

Cloudflare's current default path for Next.js is **vinext**; `@opennextjs/cloudflare` is the
migration fallback and explicitly not for new work. vinext is **beta** — `npx vinext check` is
build-order step zero, and a negative result is a blocking architecture decision, not a task to work
around.

### 4. tRPC is the BFF, and only for the authenticated app

The public reader is a Server Component that queries the device directly and owns its own cache
headers. Routing public traffic through tRPC would add a serialization layer and fight the caching
model for no benefit.

### 5. The stream carries invalidations; the query carries truth

No `ChatStreamPart` variant may carry a record's contents. Placement is `record-ref {kind, id}`;
freshness is `invalidate {kind, id}`. Cards render exclusively from `documents.byId` /
`research.byId`. This is the structural kill for the duplicate-card defect: if contents cannot
travel on the stream, a second copy has no channel to exist on.

### 6. Authorization lives in the data layer

Every operator-facing tRPC procedure is a `protectedProcedure` verifying the session per call. The
middleware matcher is a **positive allowlist** of gated paths and contains no auth logic — a
negative lookahead fails *open* into the auth path when a route is added, which would ship a
sign-in wall to strangers.

### 7. Two auth mechanisms, deliberately

BetterAuth guards the operator surface. Cloudflare Access service tokens authenticate every
Worker→device call. Separate paths, separate threat models, written down so the split is deliberate
rather than accidental.

---

_Merged from the `system_components` and `functional_requirements` blocks of all five architecture
lenses._

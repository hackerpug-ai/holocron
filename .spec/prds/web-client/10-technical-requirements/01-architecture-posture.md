---
stability: CONSTITUTION
last_validated: 2026-08-28
prd_version: 1.0.0
---

# Architecture Posture

Seven stances that everything else follows from.

### 1. One Next.js application, two faces, one hostname

The app envelops the existing `docs.holocrnlib.com`. Public routes live under a `(public)` route
group whose entire layout chain performs no session read and imports no auth module; the operator
cockpit lives under `(app)`. The boundary is **structural**, not conditional.

### 2. `services/web` is a nested workspace package — never the repo root

Verified: six of seven default Next scaffold paths are already occupied at the repo root by the
Expo app (`app/`, `components/`, `components.json`, `global.css`, `tailwind.config.js`,
`tsconfig.json`). Every `shadcn` and `ai-elements` CLI invocation carries `cwd=services/web`, and
`services/web` must be added to `pnpm-workspace.yaml`, which today lists only `.` and
`services/platform`.

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

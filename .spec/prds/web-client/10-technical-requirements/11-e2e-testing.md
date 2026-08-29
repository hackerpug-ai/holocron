---
stability: CONSTITUTION
last_validated: 2026-08-29
prd_version: 1.0.1
---

# E2E Harness Constitution

## Reality Gate — infrastructure per surface

| Surface | Stack | Status | Framework | Action |
|---|---|---|---|---|
| mobile | expo-rn | **PRESENT** | maestro | none — mobile is out of scope for this PRD |
| web | nextjs-on-cloudflare-workers (vinext) | **MISSING** | — | PROVISION — browser e2e must be installed from scratch. Becomes a leading INFRA sprint that every feature sprint depends on (Reality Gate, fail-closed |
| service | bun-hono-postgres (device platform) | **PRESENT** | vitest | reuse — BFF↔platform contract tests belong in the integration/live lanes against the real device platform, not in the browser harness |

**Any surface missing:** YES — the web surface must be provisioned. This is
fail-closed, not advisory: a leading INFRA sprint provisions the harness, and every feature sprint
depends on it.

Evidence, verified by execution rather than assumed: no @playwright/test, cypress, or puppeteer in dependencies or devDependencies; .e2e/ contains only maestro/; detector reports no web surface because the app does not exist yet

## Framework

**@playwright/test, provisioned in packages/web with specs at packages/web/e2e/ and config at packages/web/playwright.config.ts. Chromium blocking; WebKit at iPhone viewport for the public reader only.**

Three requirements decide this and only Playwright satisfies all three. (1) The highest-value assertions are HTTP-response assertions on the document navigation itself - exact Cache-Control plus Cloudflare-CDN-Cache-Control strings, HTTP 404 on a withdrawn document, binary content-type on the asset route, absence of Vary: Cookie. Playwright exposes the main navigation's Response object with headers() and status() in the same test file as the browser context; Cypress cannot assert headers on its own document navigation. (2) The number-one landmine is buffered streaming under vinext beta - a failure that renders correctly and only shows up as chunk timing. Cypress proxies and buffers all traffic, which makes that failure STRUCTURALLY UNDETECTABLE from inside Cypress; Playwright's request fixture hands back a real ReadableStream so the suite can count distinct flushes. That single point is disqualifying for the alternative. (3) The cold-reader persona is a phone in daylight - emulateMedia({colorScheme:'light'}) plus a device descriptor, first-class in Playwright. Puppeteer has no runner, no fixtures, no trace viewer, and a no-retry flake policy needs trace/video from one run. Nothing is being migrated, so this is a free choice made on merit.

**Provisioning.** pnpm --filter @holocron/web add -D @playwright/test, then pnpm exec playwright install chromium webkit, all with cwd=packages/web. retries: 0 set EXPLICITLY (Playwright defaults to 2 in CI and that default silently violates the flake policy). Deliberately NOT placed at repo-root .e2e/ - that tree is Maestro's mobile surface and stays untouched. A one-line pointer in .e2e/README records the split.

## The determinism seam

This is an agentic product: the chat surface streams from a real model whose prose varies per run.
"Real services, no mocks" and "deterministic assertions" both have to hold, and they do — because
they apply at different layers.

### Fixtured — exactly one boundary

- The model HTTP endpoint, and NOTHING else. The AI SDK provider baseURL points at a local fixture server replaying recorded responses matched on (user message, model, tool-result hash). @copilotkit/aimock is the proven implementation; fallback is a ~60-line Hono fixture server.
- The fixture's streaming profile - chunk size and inter-chunk delay pinned so chunk-count and first-flush-before-last assertions are stable rather than racing a real provider's tokenizer.
- Wall-clock in date-formatted assertions: the seeded document's created_at is fixed by the seeder, so the seam is the SEED, not a clock mock.
- The operator session: signed in once in a global setup project and persisted as Playwright storageState. A separate EMPTY storageState is used for every public-reader test.

### Real — everything else

- Postgres - real, seeded by the existing pnpm seed:e2e.
- The origin Hono app - real process, real /article/:shareToken and asset handlers, real is_public joins, real BlobStore reads.
- The Next app running as a BUILT worker, not next dev. Real markdown pipeline, real sanitizer, real asset-URL rewrite, real Route Handlers, real proxy.ts, real response headers.
- The MCP gateway and every tool execution. The fixture tells the model to call a tool; the tool itself runs for real through the real MCP client against real seeded Postgres and returns real rows.
- The AI SDK agent loop, the tRPC async-generator procedure, httpBatchStreamLink, and the client-side UIMessage reducer.
- BetterAuth session issuance and verification.
- Cloudflare Access, the tunnel and the real edge cache - real, but only in the non-blocking tunnel lane.

### Assert engine outcomes, never model prose

- Image actually rendered: img.naturalWidth > 0. NOT 'img element exists', NOT 'src attribute is correct' - naturalWidth proves the bytes arrived over /d/<token>/assets/<id> and decoded. This is the only assertion that proves the headline defect is fixed.
- Text-first, no spinner: fetch /d/<token> through the request fixture with NO JavaScript and assert the raw HTML body already contains the document's first heading. Server-rendered text is a string property of the response, not a timing race.
- Cache headers: exact string equality on both headers, asserted on the 200 AND the 404.
- Withdrawn document: response.status() === 404. The visible 'no longer shared' text alone passes on a build that returns 200, which is precisely the silent failure.
- Public route outside auth: same URL fetched with and without the operator storageState returns a byte-identical body, no Set-Cookie, no Vary: Cookie.
- Asset route header discipline: the origin's Cache-Control: no-store is ABSENT from the proxied response and the 60s pair is present.
- Tool was called: a real side effect - a DB row or the rendered Tool row's type/state props - never the sentence the model wrote about calling it.
- Record created: a documents or research_sessions row exists with the expected id.
- Card rendered exactly once: toHaveCount(1) on the record-keyed card testid. The duplicate-card regression test, entirely prose-free.
- Stream is unbuffered: reading the tRPC stream yields >=2 distinct chunks separated in time, with the fixture's inter-chunk delay making the separation deterministic.
- Cancel: an in-flight run transitions to cancelled state in the record, not 'the assistant said it stopped'.

**Rationale.** Both rules hold simultaneously because they apply at different layers. No business logic is stubbed anywhere: agent loop, tool execution, persistence, transport, rendering and caching all run against real components, which is what 'real services, no mocks' demands. The single replaced component is the external LLM service - the one boundary an integration test is licensed to pin. Everything downstream of that seam is a deterministic engine whose outcomes are byte-stable given the same fixtured input, so 'run once, failures are real' is achievable for an agentic product. Two consequences worth stating flatly. First, the public reader needs NO seam at all: /d/[token] is a pure function of database state, so the reference flow is 100% real with zero fixtures - a large part of why it IS the reference flow. Second, prose quality is not measured here at all; it belongs to a separate eval lane, and letting fixture-determinism substitute for eval coverage would answer the wrong question.

## Turnkey runner

```
pnpm e2e:web   (plus pnpm e2e:web:tunnel for the non-blocking lane)
```

**Starts**

1. Preflight: assert Postgres reachable on a NON-PRODUCTION DATABASE_URL, browsers installed, built worker artifact current - each failure exits with a named remedy, never a stack trace.
2. Reset + seed: shells out to the EXISTING pnpm seed:e2e --reset --json, parses the JSON, asserts the seed_fingerprint matches. Not reimplemented.
3. The origin Hono process on a local port.
4. The model fixture server on a local port.
5. The Next app as a BUILT worker - vinext build then wrangler dev --local - via Playwright's webServer block. NEVER next dev, because the header, cache and streaming behaviours this suite exists to prove are exactly the ones that differ between dev and a built worker under a beta host.
6. Global setup: signs in once against real BetterAuth, writes operator storageState; also writes an explicitly EMPTY storageState for the public lane.

**Human prerequisites**

- Postgres running with DATABASE_URL pointing at a non-production database. The seeder already refuses production-like URLs - that guard is the safety net, not the plan.
- pnpm exec playwright install chromium webkit, once.
- For the tunnel lane ONLY: CF_ACCESS_CLIENT_ID and CF_ACCESS_CLIENT_SECRET in env, and the device awake with its tunnel up.
- Nothing else. No manual server starts, no manual seeding, no manual sign-in - a flow that needs a human step does not count as covered.

**Cold boot.** From a clean checkout with Postgres up: pnpm install, pnpm exec playwright install chromium webkit (cwd=packages/web), then pnpm e2e:web. Idempotent and self-healing - seed:e2e --reset is already proven idempotent to a stable fingerprint, so re-running after a failure converges rather than accumulating state. Default mode is local: no tunnel, no Access, no CDN. Everything else real. Tunnel mode swaps in the real origin and exercises the real edge cache; it cannot run without secrets or while the device sleeps, which is why it is a separate NON-BLOCKING lane.

## Landmine ledger

| # | Landmine | Symptom | Avoidance |
|---|---|---|---|
| 1 | THE SEEDER GAP. The seeder produces 17 public documents with stable share tokens but ZERO document_assets, ZERO blobs and no image markdown (seed-e2e.ts:616-655). The exact defect  | A fully green web suite that never once renders an image. The headline defect ships again, silently, exactly as it did for the past year. | BLOCKING PREREQUISITE for the reference flow: extend seed:e2e so one EXISTING seeded document carries both a document-relative image backed by real document_assets + file_objects rows and a real blob on disk, and a remote https im |
| 2 | Buffered streaming under vinext beta. | Chat renders the complete answer correctly and feels dead. Any assertion of the form 'the answer text appears' passes. Invisible to the naked eye in local dev where laten | Assert >=2 distinct chunk flushes separated in time, using the fixture's pinned inter-chunk delay, reading the tRPC stream through Playwright's request fixture. Against the BUILT worker only - dev-server behaviour is not evidence. |
| 3 | The Cloudflare edge Cache API is per-datacenter, not globally replicated. | A cache-HIT assertion passes locally and fails intermittently in CI because the second request landed on a different PoP. Reads as flake, gets retried around, rots the su | NEVER assert HIT/MISS in a blocking lane. The blocking lane asserts header PRESENCE and exact values, which is deterministic and is what FR-EDGE-02 actually requires. HIT/MISS lives in the nightly tunnel lane, warmed with two sequ |
| 4 | The device sleeps. | Tunnel-lane failures are indistinguishable from real regressions; the suite starts crying wolf and people stop reading it. | Tunnel-lane preflight pings origin /health and, on no response, SKIPS with an explicit printed reason. This is the ONLY sanctioned skip in the entire suite and it exists only in the non-blocking lane. A skip in the blocking lane i |
| 5 | The 60s cache TTL makes a naive revocation assertion flaky or slow. | Test unshares then immediately GETs, expects 404, gets the cached 200 - or sleeps 61 seconds and blows the per-PR budget. | The blocking local lane runs with NO CDN in front, so revocation is immediate and asserted directly on status 404 with both cache headers present. The 60-second SLA itself is asserted exactly once, in the nightly tunnel lane, with |
| 6 | Cloudflare Access returns HTML, not JSON, when a service token is wrong or expired. | A naive res.json() throws a parse error and the failure reads as 'the origin is broken' or 'the device is asleep' - three different causes collapsing into one indistingui | The origin client asserts content-type: application/json before parsing and raises a distinct access_rejected error carrying the upstream status. An explicit negative test proves a deliberately bad token yields access_rejected, no |
| 7 | not-found.tsx returning HTTP 200 with 404-shaped content. | Browser shows the calm 'no longer shared' page and a human tester signs off. The edge caches it as a valid 200 document and revocation quietly does nothing for everyone e | Every withdrawn-document test asserts response.status() === 404 IN ADDITION to the visible text. The text assertion alone passes on a broken build, so it is never sufficient on its own. |
| 8 | Vary: Cookie appearing on the public response. | ZERO visible change. The page renders perfectly for every reader while the edge cache fragments per cookie value and the hit rate collapses to nothing. | Explicit header-ABSENCE assertion on /d/[token], run in the same test that fetches the URL with an operator session cookie and diffs the body byte-for-byte. |
| 9 | next dev and the deployed worker diverge under vinext beta, specifically on response headers, caches.default reachability, and stream buffering. | Green locally, broken in production, on precisely the three properties the suite exists to protect. | The webServer block builds and serves a real worker. next dev is NEVER the system under test for any header, cache or streaming assertion. |
| 10 | Running the Playwright, shadcn or ai-elements CLI from the repo root or from packages/mobile. | From the root, scaffolding lands on the thin workspace orchestrator that owns no product code; from packages/mobile it lands on top of the Expo app's app/, components/, components.json, global.css or tailwind.config.js, overwriting or shadowing live mobile code. | Every install and CLI invocation carries cwd=packages/web, and the runner script cds explicitly rather than relying on the caller's shell. |
| 11 | Asserting the model's prose in an e2e test. | Passes for a week, then someone regenerates a fixture or bumps a model and a dozen tests fail on wording with no product regression behind them. | Prose assertions are BANNED outright in the e2e lane, by policy, reviewable in a diff. Word quality is measured on the eval lane, not asserted here. |
| 12 | BlobStore writes to disk via defaultBlobRoot(), and CI containers may not have that root writable or cleaned between runs. | Asset route returns 404 in CI only, because blobStore.exists(content_hash) is false - reads as an application bug rather than an environment one. | Preflight asserts the blob root is writable and that seed:e2e --reset removes seeded blobs; the asset test asserts on the seeded content hash so a missing blob fails with a legible message naming the path. |

## Flake policy

**Run once. Failures are real. NO retries, ever, in any lane including CI.**

- **Enforcement.** retries: 0 set EXPLICITLY in playwright.config.ts. This is NOT the default - Playwright ships retries: 2 under CI, which would silently violate this policy the day the config is generated. A PR raising retries above zero is rejected on sight.
- **Evidence from one run.** trace: 'on-first-retry' is wrong under a no-retry policy. Use trace: 'retain-on-failure', video: 'retain-on-failure', and record a HAR on failure - one run must carry enough evidence to diagnose without reproducing.
- **Skips.** ONE sanctioned skip in the whole suite: the tunnel lane skipping when origin /health does not answer, with the reason printed. Every other skip requires a named owner and a linked issue, reviewed weekly. An unowned skip is deleted, not tolerated.
- **On a flaky flow.** A flow that fails intermittently is a BROKEN flow. Fix the flow or fix the product, within the sprint that discovered it. If neither is possible, delete the flow and record the coverage gap explicitly - a deleted test is honest, a retried test is a lie that compounds.
- **Quarantine.** There is NO quarantine lane. Quarantine is how a suite rots into noise while still reporting green.

## CI lanes

| Lane | Runs | Where | Budget |
|---|---|---|---|
| `unit (EXISTING vitest project)` | vitest run --project unit. Gains packages/web/**/*.{test,spec}.{ts,tsx} via an include addition - markdown golden-file corpus, sanitizer schema, slug-compatibility, asset-URL-rewrite. None needs a bro | Every PR, no infra. | Blocking. Under ~2 min; it already runs pre-commit. |
| `integration (EXISTING vitest project)` | vitest run --project integration, PLATFORM_IT-gated. Unchanged in scope. | Every PR, with Postgres. | Blocking. Existing budget unchanged. |
| `live (EXISTING vitest project)` | vitest run --project live. Gains the origin JSON contract test: GET /article/:shareToken with Accept: application/json returns the ArticleDoc shape, and without that header still returns HTML during t | PR, with Postgres. | Blocking. Existing budget unchanged. |
| `e2e:web:local (NEW, Playwright)` | Full web suite against a built worker, real origin Hono, real Postgres, fixtured model, no tunnel, no CDN. Public reader end-to-end, auth boundary, asset route, withdrawn path, Library, and the chat s | Every PR touching packages/web or packages/platform/src/http. | BLOCKING. Hard ceiling 5 minutes. |
| `e2e:web:tunnel (NEW, Playwright)` | Cache-behaviour subset ONLY: real Access, real tunnel, real edge cache. Cache HIT after warm-up, the 60s revocation SLA end-to-end, the access_rejected negative test. | Nightly, and manually before any deploy touching caching or the origin contract. NEVER on  | NON-BLOCKING. 15 minutes, including a deliberate 65-second wait. Skips with a printed reas |
| `maestro (EXISTING, mobile)` | .e2e/maestro/** exactly as today. No new flows, no edits, no shared helpers with the web suite. | Unchanged trigger. | Unchanged. |
| `evals (separate)` | Model prose and answer quality against the real provider - measured, scored and trended, NEVER asserted. | Scheduled. | NON-BLOCKING. Named here only so nobody mistakes fixture-determinism for eval coverage; th |

## The proven-reference-flow gate — BLOCKING

**This constitution is INCOMPLETE until the reference flow is proven green in a spike.**

**Flow.** packages/web/e2e/reference-flow.spec.ts - 'A seeded public document with images renders end-to-end, and revocation takes it away.' Through pnpm e2e:web with NO manual steps: (1) seed:e2e --reset --json exits 0 with the expected fingerprint and the new document_assets count; (2) GET /d/e2e-share-token-...0001 through the request fixture with NO JavaScript returns 200 and the raw HTML already contains the first heading; (3) both cache headers present on that 200; (4) in WebKit at iPhone viewport with colorScheme 'light', BOTH the document-relative and the remote image report naturalWidth > 0; (5) the document-relative image was fetched from /d/<token>/assets/<id>, its response carries the seeded mime type and the 60s pair, and the origin's no-store is ABSENT; (6) the same page URL fetched with the operator storageState returns a byte-identical body with no Set-Cookie and no Vary: Cookie; (7) is_public flipped false through the real publish endpoint and the next GET returns status 404 with the withdrawn page and both cache headers still present; (8) GET /d/<unknown-token> returns 404 with no stack trace and no sign-in prompt.

**Proves.** Every substrate piece the rest of the suite stands on, with ZERO fixtures anywhere in the flow: the seeder as reset+seed mechanism and its stable-token contract; the origin JSON endpoint that unblocks the Server Component; the vinext build-and-serve path against a real worker; the full markdown pipeline including remark-gfm, the sanitizer schema, the slug port and the asset-URL rewrite; the new asset Route Handler and its header discipline; header and status correctness on BOTH 200 and 404, which is the whole revocation contract; the auth-boundary property as an executable assertion rather than a design intention; and the Playwright substrate itself. It is deliberately the flow that fixes the confirmed live defect and is build-order step 1, independently shippable and touching nothing else. The model seam is proven separately in a second, NON-BLOCKING spike covering the chat lane.

## Reuse — what is NOT rebuilt

- **Vitest lanes.** No new test runner and no fourth vitest project. The three existing projects keep their names, gates and CI wiring. Web-side tests that do not need a browser join the existing unit project via a single include addition. The origin JSON contract test joins the existing live project, which already provisions real Postgres and calls seed:e2e. Playwright owns exactly one thing: assertions that need a real browser or a real HTTP response object. Anything else staying in Playwright is duplication and should be pushed down to vitest. The existing scripts/check-test-lanes.ts file-count guard continues to police the boundary.
- **Seeder.** pnpm seed:e2e is invoked by Playwright global setup, NEVER reimplemented. It already delivers idempotency to a stable fingerprint, --json machine-readability, and refusal of production-like DATABASE_URL - each already asserted by seed-e2e.test.ts. Most valuable: it already mints deterministic share tokens, so the web suite derives its public URLs from that constant instead of discovering tokens at runtime - an entire class of ordering flake removed for free. EXACTLY ONE change required: attach a real document_assets row, a real file_objects row, a real blob and image markdown to an EXISTING seeded document, so document counts stay at 17 and existing assertions keep holding.
- **Mobile untouched.** .e2e/maestro/** receives no edits, no new flows and no shared helpers. Web specs live under packages/web/e2e/, a different tree with a different runner and config. The Maestro CI lane keeps its trigger and budget. The only artifact both surfaces consume is seed:e2e, read-only. That shared dependency is protected by an existing guard rather than by discipline: seed-e2e.test.ts asserts exact counts (17 documents, 5 conversations, 5 feed items, 4 subscription sources, 3 research sessions) in both the JSON self-report and a live psql count, so any seeder change that would disturb mobile expectations fails that test FIRST. This is why the image asset attaches to an existing document instead of adding an eighteenth.

## Determinism seam for the scenario suite

The suite that runs on this harness: **133 scenarios** across 20 use cases — 41 `visible` (carrying
the structured Scenario Contract, validator-clean) and 92 `holdout` (plain prose, different framing,
4-5 per UC). Flow coverage: every UC has at least one `happy_path` plus all five edge flows; the
deterministic gate reports `PRD ok — 20 use case(s) each have core + edge flows`.

---

_From `nextjs-planner.e2e-harness-constitution.json`, obtained by re-ask. Reality Gate from
`reality-gate.json` (deterministic tool output + verified repo inspection)._

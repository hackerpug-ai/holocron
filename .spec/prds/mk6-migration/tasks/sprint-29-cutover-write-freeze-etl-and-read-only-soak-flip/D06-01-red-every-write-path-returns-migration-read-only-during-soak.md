# D06-01: RED: every write path returns migration_read_only during soak
> Status: ✅ Completed
> Commit: d62c570e83fc38bbd021d92d4c760be136e1a23d
> Reviewer: product-manager+code-reviewer
> Completed: 2026-08-01T23:08:45Z

> **Task ID:** D06-01
> **Sprint:** [Sprint 29 — Cutover](./SPRINT.md)
> **Agent:** `red-test-generator`
> **Estimate:** 90 min
> **Type:** FEATURE
> **Priority:** P0 · **Effort:** M
> **Proposed By:** `red-test-generator`
> **TDD_MODE:** `red_first` · **RED_GREEN_REQUIRED:** yes
> Status: Backlog

**Capabilities:** CAP-CUT-01
**PRD refs:** UC-SYNC-03, T-SYNC-010

## Specification

**Objective.** Author a failing (RED) integration test suite that inventories every production write path in the current tree — Postgres-backed Hono mutation routes, MCP gateway mutation tools, Convex mutations, and the durable job/queue write path — and asserts each one currently accepts a write (proving reachability), then asserts each one FAILS to return a migration_read_only rejection today because no runtime fence exists. In doing so the suite pins the exact fence contract (HOLO_MIGRATION_READ_ONLY env var; HTTP 423 { error: 'migration_read_only' }; MCP 'MIGRATION_READ_ONLY:' error prefix; Convex 'migration_read_only:' error prefix; JobRunResult.ok=false shape) that D06-03 must implement and D06-05 must verify at soak-flip time.

**Success state.** `PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint29-write-fence-red.test.ts` collects and executes cleanly (zero import/type/collection errors) against HEAD c7873378, and FAILS (non-zero exit) with failure output naming every discovered write-path id (hono route METHOD+path, mcp tool_id, convex function name, job name) whose fenced-case assertion (AC-2/4/6/8) did not observe a migration_read_only rejection. The suite's reachability cases (AC-1/3/5/7) all PASS today, isolating the red-ness to the fence assertions only — proof the suite is testing the fence's absence, not a broken harness.

## Critical Constraints

- **MUST** — MUST author a test suite that FAILS (non-zero exit, real assertion failures — not a collection error) against the current tree at SHA c7873378, where migration_read_only exists ONLY as a declared token in services/platform/src/sync/client-data-contract-{author,verify}.ts and no runtime write fence exists anywhere.
- **MUST** — MUST derive every write-surface inventory from LIVE source at test-run time — Hono routes via the real app.routes table (RouterRoute[]), MCP mutation tools via buildMutationsReport(loadManifest(defaultManifestPath())) cross-checked against toolsAsRecord(), Convex functions by direct real invocation, queue jobs via MIGRATED_JOBS — NEVER a hardcoded path/tool-id array literal in the test file, so a NEW write path added later is picked up automatically without a test-code change.
- **MUST** — MUST pair every fenced-rejection assertion (AC-2, AC-4, AC-6, AC-8) with a positive pre-fence assertion on the exact same code path (AC-1, AC-3, AC-5, AC-7) — an assertion that 'no write succeeded' is worthless if the path was never reachable in the first place.
- **NEVER** — NEVER modify production source: services/platform/src/**, convex/**, or holocron-mcp/src/** are read-only for this task. This is a test-authoring RED bead; D06-03 and D06-05 own the fence implementation that turns it green.
- **STRICTLY** — STRICTLY use real infrastructure: real Postgres via PLATFORM_IT=1/DATABASE_URL=holocron_nonprod, the real createHonoApp() instance, the real executePostgresMcpTool()/createMcpServer(), a real Convex dev deployment via ConvexHttpClient(process.env.EXPO_PUBLIC_CONVEX_URL), and the real runJob() — never a mocked DB, HTTP client, or Convex client.

## Acceptance Criteria

#### AC-1

- **GIVEN** the live Hono app's route table (app.routes) introspected from a real createHonoApp() instance with HOLO_MIGRATION_READ_ONLY unset, backed by real Postgres (PLATFORM_IT=1, DATABASE_URL=holocron_nonprod)
- **WHEN** the suite issues one authenticated request per discovered POST/PUT/PATCH/DELETE /api/* route (fx-hono-write-inventory) using fx-hono-min-bodies
- **THEN** at least 23 distinct routes are discovered and every discovered route returns an HTTP status other than 423, proving the write surface is live and reachable today

`test_tier: integration` · `service: real createHonoApp() instance (services/platform/src/http/hono-app.ts) over real Postgres (PLATFORM_IT=1, DATABASE_URL=holocron_nonprod)` · `flow_ref: T-SYNC-010`

<details><summary>Scenario (topology: single-node)</summary>

**Negative control — would fail if:** stub, empty, mock, static, disconnect
**Evidence:** api_response (capture required: True)

*Case 1* — start: `fx-hono-write-inventory`
  1. Construct createHonoApp({ keys: DEFAULT_KEYS }) with process.env.HOLO_MIGRATION_READ_ONLY unset
  1. Compute fx-hono-write-inventory by filtering app.routes to method in {POST,PUT,PATCH,DELETE} and path starting with /api/
  1. For each discovered route, call app.request(path, { method, headers: { authorization: 'Bearer ' + DEFAULT_KEYS.rn }, body: fx-hono-min-bodies[route] })
  - **must observe:** 23 or more routes discovered from app.routes; every discovered route responds with an HTTP status other than 423
  - **must NOT observe:** 0 routes discovered; any discovered route returning HTTP 423

</details>
#### AC-2

- **GIVEN** the same fx-hono-write-inventory route table, with a fresh createHonoApp() instance constructed AFTER setting process.env.HOLO_MIGRATION_READ_ONLY='1'
- **WHEN** the suite re-issues the identical request (same fx-hono-min-bodies) for every discovered route
- **THEN** every route returns HTTP 423 with JSON body { "error": "migration_read_only" }, and the Postgres row count for every table touched by the AC-1 pass (documents, subscription_sources, improvement_requests, chat_messages, etc.) is unchanged from its post-AC-1 value

`test_tier: integration` · `service: real createHonoApp() instance over real Postgres (PLATFORM_IT=1)`

<details><summary>Scenario (topology: single-node)</summary>

**Negative control — would fail if:** stub, empty, mock, static, disconnect
**Evidence:** api_response (capture required: True)

*Case 1* — start: `fx-hono-write-inventory`
  1. Set process.env.HOLO_MIGRATION_READ_ONLY = '1'
  1. Construct a fresh createHonoApp({ keys: DEFAULT_KEYS }) instance
  1. Re-issue the identical request (same fx-hono-min-bodies) for every route in fx-hono-write-inventory
  1. Capture the pre-fence (AC-1) and post-fence row counts for documents/subscription_sources/improvement_requests via SELECT count(*)
  - **must observe:** every discovered route responds with HTTP 423; every response body deep-equals { "error": "migration_read_only" }
  - **must NOT observe:** HTTP 200 status on any discovered route (the AC-1 pre-fence signature); 0 routes returning HTTP 423; any response body lacking the migration_read_only error code

</details>
#### AC-3

- **GIVEN** the manifest-derived mutation tool list (fx-mcp-write-inventory, 21 tool ids, side_effects != null) cross-checked 1:1 against the live services/platform/src/tools/registry.ts ids, with HOLO_MIGRATION_READ_ONLY unset
- **WHEN** the suite calls executePostgresMcpTool(toolId, minimalValidInput) (services/platform/src/mcp/executor.ts) for each of the 21 tools against real Postgres
- **THEN** exactly 21 tool ids are discovered, every one exists in Object.keys(toolsAsRecord()), and every call resolves without throwing a MIGRATION_READ_ONLY-prefixed error

`test_tier: integration` · `service: real executePostgresMcpTool() (services/platform/src/mcp/executor.ts) over real Postgres (PLATFORM_IT=1)`

<details><summary>Scenario (topology: single-node)</summary>

**Negative control — would fail if:** stub, empty, mock, static, disconnect
**Evidence:** api_response (capture required: True)

*Case 1* — start: `fx-mcp-write-inventory`
  1. Compute fx-mcp-write-inventory via buildMutationsReport(loadManifest(defaultManifestPath()))
  1. Assert every discovered tool_id is present in Object.keys(toolsAsRecord())
  1. For each of the 21 tool ids call executePostgresMcpTool(toolId, minimalValidInput) with HOLO_MIGRATION_READ_ONLY unset, capturing fx-mcp-seed-doc from the store_document call
  - **must observe:** 21 mutation tool ids discovered; all 21 ids present in toolsAsRecord(); 21 of 21 executePostgresMcpTool calls resolve without throwing; the store_document call returns a document id string matching /^[0-9a-f-]{36}$/; a follow-up SELECT id FROM documents WHERE title = 's29-d0601-<run_id>-doc' returns exactly 1 row
  - **must NOT observe:** 0 mutation tool ids discovered; fewer than 21 of 21 calls resolving without throwing; any call rejecting with a MIGRATION_READ_ONLY-prefixed error; 0 rows returned by the follow-up SELECT for the seeded document

</details>
#### AC-4

- **GIVEN** the same 21-tool fx-mcp-write-inventory, with process.env.HOLO_MIGRATION_READ_ONLY='1' set before each call
- **WHEN** the suite re-calls executePostgresMcpTool(toolId, sameInput) for each tool directly, AND routes at least one of them (store_document) through the real createMcpServer() registered handler (services/platform/src/mcp/gateway.ts)
- **THEN** every direct call rejects with an Error whose message starts with 'MIGRATION_READ_ONLY:', and the createMcpServer()-routed call returns { isError: true } with JSON content whose parsed code equals 'MIGRATION_READ_ONLY'

`test_tier: integration` · `service: real executePostgresMcpTool() + createMcpServer() over real Postgres (PLATFORM_IT=1)`

<details><summary>Scenario (topology: single-node)</summary>

**Negative control — would fail if:** stub, empty, mock, static, disconnect
**Evidence:** api_response (capture required: True)

*Case 1* — start: `fx-mcp-write-inventory`
  1. Set process.env.HOLO_MIGRATION_READ_ONLY = '1'
  1. Re-call executePostgresMcpTool(toolId, sameInput) for each of the 21 tool ids in fx-mcp-write-inventory
  1. Route the store_document tool call through createMcpServer()'s registered handler via the MCP SDK transport and inspect isError + parsed content code
  - **must observe:** 21 of 21 executePostgresMcpTool calls reject with an Error message starting 'MIGRATION_READ_ONLY:'; the createMcpServer()-routed store_document call returns isError:true with parsed code MIGRATION_READ_ONLY
  - **must NOT observe:** 0 of the 21 calls rejecting with a MIGRATION_READ_ONLY-prefixed error; any of the 21 calls resolving successfully (the AC-3 pre-fence signature); the createMcpServer()-routed call returning isError:false

</details>
#### AC-5

- **GIVEN** a real Convex dev deployment reachable via ConvexHttpClient(process.env.EXPO_PUBLIC_CONVEX_URL) with no read-only gate set
- **WHEN** the suite calls the real api.documents.mutations.create mutation and the real api.subscriptions.mutations.add mutation (fx-convex-functions) with minimal valid args
- **THEN** both calls resolve successfully, api.documents.mutations.create returns a non-null Convex document id and api.subscriptions.mutations.add returns a non-null subscription id, proving the Convex write surface is live and reachable from this harness

`test_tier: integration` · `service: real Convex dev deployment via ConvexHttpClient (convex/browser), PLATFORM_IT=1`

<details><summary>Scenario (topology: single-node)</summary>

**Negative control — would fail if:** stub, empty, mock, static, disconnect
**Evidence:** api_response (capture required: True)

*Case 1* — start: `fx-convex-functions`
  1. const client = new ConvexHttpClient(process.env.EXPO_PUBLIC_CONVEX_URL)
  1. await client.mutation(api.documents.mutations.create, { title: 's29-d0601-<run_id>-convex-doc', content: 'red-fence probe', category: 'general', embedding: [0,0,0] })
  1. await client.mutation(api.subscriptions.mutations.add, { sourceType: 'github', identifier: 's29-d0601-<run_id>-sub', name: 's29-d0601-<run_id>-sub' })
  - **must observe:** api.documents.mutations.create returns a Convex document id string matching the 32-character base-32 Convex id shape /^[a-z0-9]{32}$/; a follow-up Convex query for documents where title = 's29-d0601-<run_id>-convex-doc' returns exactly 1 row; api.subscriptions.mutations.add returns a Convex subscriptionSources id string matching /^[a-z0-9]{32}$/; a follow-up Convex query for subscriptionSources where identifier = 's29-d0601-<run_id>-sub' returns exactly 1 row
  - **must NOT observe:** either call rejecting with an error; 0 documents rows matching title 's29-d0601-<run_id>-convex-doc'; 0 subscriptionSources rows matching identifier 's29-d0601-<run_id>-sub'

</details>
#### AC-6

- **GIVEN** the same Convex deployment with a read-only gate enabled by setting the deployment env var HOLO_MIGRATION_READ_ONLY=true (via npx convex env set, mirroring the existing ALLOW_CLEAR_ALL gate pattern already live in convex/documents/mutations.ts:210-212)
- **WHEN** the suite re-calls api.documents.mutations.create and api.subscriptions.mutations.add with the same args
- **THEN** both calls reject with an error whose message starts with 'migration_read_only:', and no new documents/subscriptionSources row is created (row counts equal their post-AC-5 values)

`test_tier: integration` · `service: real Convex dev deployment via ConvexHttpClient (convex/browser), PLATFORM_IT=1`

<details><summary>Scenario (topology: single-node)</summary>

**Negative control — would fail if:** stub, empty, mock, static, disconnect
**Evidence:** api_response (capture required: True)

*Case 1* — start: `fx-convex-functions`
  1. Run `npx convex env set HOLO_MIGRATION_READ_ONLY true` against the dev deployment
  1. Re-call client.mutation(api.documents.mutations.create, sameArgs) and client.mutation(api.subscriptions.mutations.add, sameArgs)
  1. Query documents/subscriptionSources row counts via a follow-up Convex query and compare to the post-AC-5 counts
  - **must observe:** both calls reject with an error message starting 'migration_read_only:'; documents row count for title 's29-d0601-<run_id>-convex-doc' equals 1 (unchanged from its post-AC-5 value); subscriptionSources row count for identifier 's29-d0601-<run_id>-sub' equals 1 (unchanged from its post-AC-5 value)
  - **must NOT observe:** either call resolving successfully (the AC-5 pre-fence signature); documents row count greater than 1 (0 additional rows allowed) for that title; subscriptionSources row count greater than 1 (0 additional rows allowed) for that identifier

</details>
#### AC-7

- **GIVEN** the real task-timeout-worker entry from MIGRATED_JOBS (fx-job, services/platform/src/queue/jobs-registry.ts:32) with HOLO_MIGRATION_READ_ONLY unset
- **WHEN** the suite calls runJob(job, { databaseUrl }) (services/platform/src/queue/jobs-runner.ts:62)
- **THEN** runJob returns { ok: true, error: null } and exactly one new job_runs row is inserted with job_name='task-timeout-worker'

`test_tier: integration` · `service: real runJob() (services/platform/src/queue/jobs-runner.ts) over real Postgres (PLATFORM_IT=1)`

<details><summary>Scenario (topology: single-node)</summary>

**Negative control — would fail if:** stub, empty, mock, static, disconnect
**Evidence:** db_query (capture required: True)

*Case 1* — start: `fx-job`
  1. const job = MIGRATED_JOBS.find(j => j.name === 'task-timeout-worker')
  1. SELECT count(*) AS before FROM job_runs WHERE job_name = 'task-timeout-worker'
  1. await runJob(job, { databaseUrl: DEFAULT_DATABASE_URL })
  1. SELECT count(*) AS after FROM job_runs WHERE job_name = 'task-timeout-worker'
  - **must observe:** runJob returns { ok: true, error: null }; job_runs row count for task-timeout-worker increases by exactly 1 (after == before + 1)
  - **must NOT observe:** runJob returns ok: false; job_runs row count unchanged after the call (0 new rows, after == before)

</details>
#### AC-8

- **GIVEN** the same fx-job with process.env.HOLO_MIGRATION_READ_ONLY='1' set
- **WHEN** the suite re-calls runJob(job, { databaseUrl, runId: newRunId })
- **THEN** runJob returns { ok: false, error: <string starting with 'migration_read_only:'> } and the job_runs row count is unchanged from its post-AC-7 value (no additional row inserted)

`test_tier: integration` · `service: real runJob() over real Postgres (PLATFORM_IT=1)`

<details><summary>Scenario (topology: single-node)</summary>

**Negative control — would fail if:** stub, empty, mock, static, disconnect
**Evidence:** db_query (capture required: True)

*Case 1* — start: `fx-job`
  1. Set process.env.HOLO_MIGRATION_READ_ONLY = '1'
  1. SELECT count(*) AS before FROM job_runs WHERE job_name = 'task-timeout-worker'
  1. await runJob(job, { databaseUrl: DEFAULT_DATABASE_URL, runId: newRunId })
  1. SELECT count(*) AS after FROM job_runs WHERE job_name = 'task-timeout-worker'
  - **must observe:** runJob returns { ok: false, error: <string starting with 'migration_read_only:'> }; job_runs row count unchanged after the call (0 new rows, after == before, matching the post-AC-7 value)
  - **must NOT observe:** runJob returns ok: true; job_runs row count increased by 1 (after == before + 1, the AC-7 pre-fence signature)

</details>

## Test Criteria

| ID | Boolean statement | Maps to | Verify |
|----|-------------------|---------|--------|
| TC-1 | Discovered Hono write-route count is 23 or greater when app.routes is filtered to POST/PUT/PATCH/DELETE /api/* paths. | AC-1 | `PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint29-write-fence-red.test.ts -t "TC-1"` |
| TC-2 | Every discovered Hono write route returns a non-423 HTTP status when HOLO_MIGRATION_READ_ONLY is unset. | AC-1 | `PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint29-write-fence-red.test.ts -t "TC-2"` |
| TC-3 | Every discovered Hono write route returns HTTP 423 when HOLO_MIGRATION_READ_ONLY is set to '1'. | AC-2 | `PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint29-write-fence-red.test.ts -t "TC-3"` |
| TC-4 | Every fenced Hono write-route response body equals { error: 'migration_read_only' } when HOLO_MIGRATION_READ_ONLY is set to '1'. | AC-2 | `PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint29-write-fence-red.test.ts -t "TC-4"` |
| TC-5 | MCP mutation-tool inventory count equals 21 when derived from the manifest side_effects field. | AC-3 | `PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint29-write-fence-red.test.ts -t "TC-5"` |
| TC-6 | Every MCP mutation tool id exists in the live tools/registry.ts record when cross-checked against buildMutationsReport output. | AC-3 | `PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint29-write-fence-red.test.ts -t "TC-6"` |
| TC-7 | executePostgresMcpTool resolves without a MIGRATION_READ_ONLY-prefixed error for every mutation tool id when HOLO_MIGRATION_READ_ONLY is unset. | AC-3 | `PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint29-write-fence-red.test.ts -t "TC-7"` |
| TC-8 | executePostgresMcpTool rejects with a MIGRATION_READ_ONLY-prefixed error for every mutation tool id when HOLO_MIGRATION_READ_ONLY is set to '1'. | AC-4 | `PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint29-write-fence-red.test.ts -t "TC-8"` |
| TC-9 | createMcpServer's registered store_document handler returns isError true with parsed code MIGRATION_READ_ONLY when HOLO_MIGRATION_READ_ONLY is set to '1'. | AC-4 | `PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint29-write-fence-red.test.ts -t "TC-9"` |
| TC-10 | The real api.documents.mutations.create call returns a non-null document id when the Convex read-only gate is unset. | AC-5 | `PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint29-write-fence-red.test.ts -t "TC-10"` |
| TC-11 | The real api.subscriptions.mutations.add call returns a non-null subscription id when the Convex read-only gate is unset. | AC-5 | `PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint29-write-fence-red.test.ts -t "TC-11"` |
| TC-12 | The real api.documents.mutations.create call rejects with a migration_read_only-prefixed error message when the Convex read-only gate is set. | AC-6 | `PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint29-write-fence-red.test.ts -t "TC-12"` |
| TC-13 | The real api.subscriptions.mutations.add call rejects with a migration_read_only-prefixed error message when the Convex read-only gate is set. | AC-6 | `PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint29-write-fence-red.test.ts -t "TC-13"` |
| TC-14 | runJob returns ok true and inserts exactly one job_runs row for task-timeout-worker when HOLO_MIGRATION_READ_ONLY is unset. | AC-7 | `PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint29-write-fence-red.test.ts -t "TC-14"` |
| TC-15 | runJob returns ok false with an error message starting migration_read_only when HOLO_MIGRATION_READ_ONLY is set to '1'. | AC-8 | `PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint29-write-fence-red.test.ts -t "TC-15"` |
| TC-16 | job_runs row count after the fenced task-timeout-worker call equals the row count after the unfenced call when HOLO_MIGRATION_READ_ONLY is set to '1'. | AC-8 | `PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint29-write-fence-red.test.ts -t "TC-16"` |

## Reading List

- `.spec/prds/mk6-migration/08-uc-sync.md` — lines 44-59 — UC-SYNC-03 AC-3 exact wording ('every production write path returns migration_read_only') + UC-SYNC-04 rollback boundary this RED bead must not violate.
- `.spec/prds/mk6-migration/11-e2e-testing-criteria.md` — lines 205-215 — T-SYNC-010 tier binding: e2e-automated, flipped stack, app+44 tools+/article+crons pass while app/MCP/upload/job/mission writes return migration_read_only.
- `.spec/prds/mk6-migration/10-technical-requirements/09-capability-chains.md` — lines 22-31 — CAP-CUT-01 boundary_contracts and failure_modes — the negative-control clause this task must encode.
- `services/platform/src/sync/client-data-contract-author.ts` — lines 44-244,620-763 — HONO_ROUTES literal (STALE — omits /api/documents, /api/voice-sessions, /api/improvements, /api/subscriptions/:id, /api/feed-items/:id/feedback, /api/assimilations/:id, /api/documents/:id/{import,publish,narration}); HONO_ERROR_SHAPE/rejection() already declares migration_read_only as HTTP 423 terminal — reuse this exact shape, do not invent a new one.
- `services/platform/src/http/hono-app.ts` — lines 1-60,225-1075 — Live route table (createHonoApp, app.post/put/patch/delete/all calls) — the ground truth for AC-1/2's inventory; scoped-key middleware mount point at app.use('*', ...) is where D06-03's fence will likely attach.
- `services/platform/src/mcp/gateway.ts` — lines 1-79 — createMcpServer's error-prefix-to-code parsing (lines 37-52) that AC-4/TC-9 depends on — 'MIGRATION_READ_ONLY:' prefix already round-trips correctly with zero source changes.
- `services/platform/src/mcp/executor.ts` — lines 164-260,780-803 — executePostgresMcpTool's switch/case shape and its existing PREFIX: message error convention (e.g. RECOMMENDATION_ERROR:, RETAILER_ERROR:) that AC-3/4 must match.
- `services/platform/src/mcp/list-mutations.ts` — lines 1-46 — buildMutationsReport — the exact function fx-mcp-write-inventory calls.
- `services/platform/src/mcp/manifest-loader.ts` — lines 1-89 — loadManifest/defaultManifestPath — manifest is at .spec/prds/mk6-migration/10-technical-requirements/14-mcp-compatibility-manifest.yaml, 44 tools, side_effects field per tool.
- `services/platform/src/tools/registry.ts` — lines 103-374,579-591 — The 44-tool ENTRIES array + toolsAsRecord()/toolCount() — the live registry AC-3's cross-check asserts against.
- `convex/documents/mutations.ts` — lines 1-30,205-231 — The `create` mutation (fx-convex-functions target) and the ALLOW_CLEAR_ALL env-gate precedent (process.env check inside handler) AC-6's fence design should mirror.
- `convex/subscriptions/mutations.ts` — lines 1-70 — The `add` mutation (second fx-convex-functions target) — no external I/O, deterministic.
- `convex/http.ts` — lines 1-40 — Confirms the only Convex httpAction is GET /article/ (read-only) — no dedicated Convex write-webhook exists at this SHA, so 'uploads/webhooks' fence coverage for Convex folds into the mutations/actions surface this sprint.
- `holocron-mcp/src/convex/client.ts` — lines 1-15 — The actual 'src/convex/client.ts' referenced by UC-SYNC-03 AC-4 (imports convex/browser) — read-only reference, do not touch.
- `scripts/migrate-all.ts` — lines 20-83 — Real-deployment ConvexHttpClient connection pattern via EXPO_PUBLIC_CONVEX_URL/VITE_CONVEX_HTTP_URL — reuse this exact env-var resolution order.
- `services/platform/src/queue/jobs-registry.ts` — lines 1-60 — MIGRATED_JOBS array including task-timeout-worker (fx-job).
- `services/platform/src/queue/jobs-runner.ts` — lines 44-115 — runJob()/JobRunResult shape — { ok, error } contract AC-7/8 assert against.
- `services/platform/src/queue/durable-effect.ts` — lines 103-160 — beginEffect/dispatchAndAck — underlying primitives runJob composes; useful if AC-7/8 need lower-level assertions.
- `services/platform/tests/integration/sprint19-mcp-rehost.test.ts` — lines 1-70 — Existing integration-test convention to match: PLATFORM_IT harness import, createHonoApp({keys}), executePostgresMcpTool, defaultManifestPath/loadManifest, toolsAsRecord, afterAll DELETE-by-title-prefix cleanup.
- `tests/integration/service/harness.ts` — lines 1-45 — PLATFORM_IT / DEFAULT_KEYS / DEFAULT_DATABASE_URL exports to reuse rather than re-declare.
- `vitest.workspace.ts` — lines 1-40,78-100 — The 'integration' project's include glob (services/platform/tests/integration/**) — confirms where the NEW test file must land to be collected by PLATFORM_IT=1 pnpm vitest run --project integration.

## Guardrails

**WRITE-ALLOWED**

- services/platform/tests/integration/sprint29-write-fence-red.test.ts (NEW — the RED suite)
- services/platform/tests/integration/write-fence-red.helpers.ts (NEW — inventory-derivation helpers: Hono route filter, MCP mutation cross-check, Convex client factory, min-body builders; mirrors the existing mission-red.helpers.ts convention)
- .tmp/D06-01/*.json (NEW — RED evidence capture artifacts, e.g. red-suite-run.json, per the .tmp/D05-01/ and .tmp/D05-04/ naming convention already in the tree)

**WRITE-PROHIBITED**

- services/platform/src/** (all production source — Hono routes, MCP executor/gateway/registry, uploads, queue, mission runtime; this RED bead must not implement any fence)
- convex/** (all Convex mutations/actions/http/schema — including the ALLOW_CLEAR_ALL precedent file, which is read-only reference)
- holocron-mcp/src/** (the src/convex/client.ts AC-4 target — out of scope for this bead)
- .spec/prds/mk6-migration/** (PRD and manifest are reference-only; do not edit 14-mcp-compatibility-manifest.yaml or 13-client-callsite-inventory.json)
- services/platform/tests/integration/sprint19-mcp-rehost.test.ts and any other existing test file (no editing existing tests to make this suite pass — add new files only)
- .env.example, package.json, vitest.workspace.ts (no environment/tooling changes to force a pass)

## Design / Code Pattern

**Pattern.** Inventory-then-pair: for each of the four write surfaces (Hono routes, MCP tools, Convex mutations, queue jobs) derive the member list LIVE from its source-of-truth registry, then for every discovered member run one positive (HOLO_MIGRATION_READ_ONLY unset) request/call proving reachability immediately followed by one negative (HOLO_MIGRATION_READ_ONLY='1') request/call proving fenced rejection in the exact shape already declared in client-data-contract-author.ts.

**Pattern source.** `services/platform/tests/integration/sprint19-mcp-rehost.test.ts (real-service PLATFORM_IT harness) + services/platform/src/mcp/list-mutations.ts (manifest-derived inventory, already exists — reuse, do not reimplement)`

**Anti-pattern.** Do NOT hardcode the write-route/tool/job list as a literal array in the test file. This exact bug already exists in production: HONO_ROUTES in client-data-contract-author.ts is a stale literal that omits at least 8 live write routes (/api/documents, /api/documents/:id/narration, /api/documents/:id/import, /api/documents/:id/publish, /api/voice-sessions, /api/voice-sessions/:id/end, /api/improvements, /api/improvements/:id, /api/subscriptions/:id, /api/feed-items/:id/feedback, /api/assimilations/:id) that exist on the live hono-app.ts. Always derive from app.routes / buildMutationsReport+toolsAsRecord / MIGRATED_JOBS at test-run time so this suite cannot silently under-cover.

**References**

- services/platform/tests/integration/sprint19-mcp-rehost.test.ts — PLATFORM_IT harness + real executor/registry usage + title-prefix DB cleanup pattern
- services/platform/tests/integration/mission-red.helpers.ts — precedent for a RED-bead companion helper module
- services/platform/src/sync/client-data-contract-author.ts rejection()/HONO_ERROR_SHAPE — the already-declared migration_read_only rejection shape (HTTP 423) this suite must assert against verbatim, not reinvent
- convex/documents/mutations.ts:205-231 (ALLOW_CLEAR_ALL) — the existing precedent for an env-var-gated Convex mutation handler

## Verification Gates

- `PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint29-write-fence-red.test.ts` → RED: the suite collects and executes with zero import/type/collection errors, but exits non-zero on HEAD c7873378. Failure output enumerates every write-path id (Hono METHOD+path, MCP tool_id, Convex function name, job name) whose AC-2/4/6/8 fenced assertion did not observe a migration_read_only rejection. AC-1/3/5/7 reachability assertions PASS.
- `pnpm tsgo --noEmit` → 0 type errors across the new test + helper files.
- `pnpm test:lanes` → PASS — sprint29-write-fence-red.test.ts is collected under the 'integration' vitest project only (services/platform/tests/integration/** glob), not under unit or live.
- `PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint19-mcp-rehost.test.ts` → PASS unchanged — this RED bead reuses the same registry/executor/manifest modules as the Sprint 19 baseline and must not regress it.

## Capability Chain

- **Provides:** write-fence-contract:HOLO_MIGRATION_READ_ONLY (env flag name + per-surface rejection shape) that D06-03/D06-05 must implement; write-path-inventory:hono-routes+mcp-tools+convex-mutations+queue-jobs (RED evidence enumerating every currently-unfenced write path at SHA c7873378)
- **Consumes:** services/platform/src/tools/registry.ts (44-tool ENTRIES, toolsAsRecord()); services/platform/src/mcp/manifest-loader.ts + list-mutations.ts (side_effects-derived mutation inventory); services/platform/src/queue/jobs-registry.ts (MIGRATED_JOBS); services/platform/src/sync/client-data-contract-author.ts (already-declared migration_read_only rejection shape: HTTP 423, code migration_read_only)
- **Boundary contracts:** HTTP 423 { "error": "migration_read_only" } on every fenced Hono POST/PUT/PATCH/DELETE /api/* route; MCP: executePostgresMcpTool throws Error(message) where message starts with 'MIGRATION_READ_ONLY:'; createMcpServer's handler surfaces { isError: true, content: [{ text: '{"code":"MIGRATION_READ_ONLY",...}' }] } per the existing prefix-parsing convention in services/platform/src/mcp/gateway.ts:37-52; Convex: fenced mutations reject with an Error whose message starts with 'migration_read_only:' (mirrors the existing ALLOW_CLEAR_ALL env-gate precedent in convex/documents/mutations.ts:210-212); Queue/job: runJob() returns JobRunResult { ok: false, error: string starting with 'migration_read_only:' } rather than throwing (matches jobs-runner.ts's existing 'never silently drop a failed job' contract, jobs-runner.ts:52-55)

## Agent Assignment

`red-test-generator` — This bead requires deriving a complete write-surface inventory from four independent live registries (Hono app.routes route table, MCP manifest+tools/registry.ts, the Convex mutation tree, and the queue jobs-registry) and pairing each discovered member with a positive (unfenced/reachable) + negative (fenced/rejected) control against real infrastructure — exactly the anti-fakeability discipline red-test-generator enforces. It must NOT implement the fence itself (guardrail-critical: a RED bead that 'fixes' what it tests is not RED).

## Dependencies

- **Depends on:** —
- **Blocks:** D06-03, D06-05

## Coding Standards

- TypeScript strict, no `any`; reuse PLATFORM_IT/DEFAULT_KEYS/DEFAULT_DATABASE_URL from tests/integration/service/harness.ts rather than re-declaring them.
- Every it()/test() title MUST be prefixed with its TC-<n> id exactly (e.g. it('TC-1: discovers >= 23 live Hono write routes', ...)) so each test_criteria.verify command's `-t "TC-n"` filter isolates that one assertion.
- afterAll cleanup scoped by the run_id prefix (DELETE ... WHERE title/identifier/description LIKE 's29-d0601-%'), matching the title-prefix DELETE convention in sprint19-mcp-rehost.test.ts.
- No it.skip/test.skip anywhere in this suite — a RED bead that self-skips on a fresh checkout is not RED evidence; the suite must actually execute and fail.
- Reuse the Zod schemas already exported from services/platform/src/tools/registry.ts / schemas/index.ts to build minimal valid MCP tool inputs — no hand-rolled duplicate schemas.
- Convex calls go through `convex/browser`'s ConvexHttpClient exactly as scripts/migrate-all.ts does; do not add a new Convex client wrapper.
- Biome lint clean (`pnpm lint` / repo's configured biome check) on both new files.

## Notes

Expanded by `red-test-generator` from handoff `s29-red.json`. Fakeability audit: `validate_scenario.py` reports **0 CRITICAL** across every behavioral AC (task-level `fixtures` resolve each `start_ref`).

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "D06-01",
  "tdd_mode": "red_first",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": true,
    "requires_seeded_evidence": true
  },
  "fixtures": {
    "run_id": {
      "description": "s29-d0601-<randomUUID()> generated once in beforeAll via node:crypto randomUUID(); every seeded row/tool-call carries this prefix in a title/description/identifier field so afterAll cleanup and evidence capture are unambiguous.",
      "seed_method": "public_api",
      "records": [
        "s29-d0601-<uuid>"
      ]
    },
    "fx-hono-write-inventory": {
      "description": "Computed live as app.routes.filter(r => ['POST','PUT','PATCH','DELETE'].includes(r.method) && r.path.startsWith('/api/')) from a real createHonoApp({ keys: DEFAULT_KEYS }) instance (services/platform/src/http/hono-app.ts) \u2014 NEVER a literal path array. At planning SHA c7873378 this yields at least 23 routes.",
      "seed_method": "public_api",
      "records": [
        "POST /api/chat-runs",
        "POST /api/chat-runs/:id/cancel",
        "PATCH /api/conversations/:id",
        "DELETE /api/conversations/:id",
        "POST /api/documents",
        "POST /api/documents/:id/narration",
        "POST /api/documents/:id/import",
        "POST /api/documents/:id/publish",
        "POST /api/voice-sessions",
        "POST /api/voice-sessions/:id/end",
        "POST /api/improvements",
        "PATCH /api/improvements/:id",
        "DELETE /api/improvements/:id",
        "PATCH /api/subscriptions/:id",
        "DELETE /api/subscriptions/:id",
        "POST /api/feed-items/:id/feedback",
        "PATCH /api/assimilations/:id",
        "POST /api/uploads",
        "PUT /api/uploads/:id",
        "POST /api/uploads/:id/finalize",
        "POST /api/missions",
        "POST /api/missions/:id/verdicts",
        "POST /api/missions/:id/steer"
      ]
    },
    "fx-mcp-write-inventory": {
      "description": "buildMutationsReport(loadManifest(defaultManifestPath())).mutations.map(m => m.tool_id) (services/platform/src/mcp/list-mutations.ts + manifest-loader.ts) \u2014 at SHA c7873378 this yields 21 tool ids, each cross-checked against Object.keys(toolsAsRecord()) from services/platform/src/tools/registry.ts. Setup throws in beforeAll if any id is missing from the live registry (fail-closed, not a soft skip).",
      "seed_method": "public_api",
      "records": [
        "store_document",
        "update_document",
        "share_document",
        "add_subscription",
        "remove_subscription",
        "check_subscriptions",
        "set_subscription_filter",
        "store_tool",
        "update_tool",
        "remove_tool",
        "shop_products",
        "start_assimilation",
        "approve_assimilation_plan",
        "reject_assimilation_plan",
        "cancel_assimilation",
        "steer_assimilation",
        "assimilate_creator",
        "regenerate_transcript",
        "add_improvement",
        "close_improvement",
        "set_improvement_status"
      ]
    },
    "fx-convex-functions": {
      "description": "Two real, currently-live Convex mutations with no external I/O dependency: api.documents.mutations.create (convex/documents/mutations.ts:8, embedding: v.array(v.float64()) \u2014 pass a 3-element zero vector) and api.subscriptions.mutations.add (convex/subscriptions/mutations.ts:7). Invoked via new ConvexHttpClient(process.env.EXPO_PUBLIC_CONVEX_URL) against a real Convex dev deployment \u2014 the same connection pattern as scripts/migrate-all.ts:27,63,83.",
      "seed_method": "public_api",
      "records": [
        "api.documents.mutations.create",
        "api.subscriptions.mutations.add"
      ]
    },
    "fx-job": {
      "description": "MIGRATED_JOBS.find(j => j.name === 'task-timeout-worker') from services/platform/src/queue/jobs-registry.ts:32 \u2014 a real migrated cron job with no external I/O, executed via the real runJob() entrypoint in services/platform/src/queue/jobs-runner.ts.",
      "seed_method": "public_api",
      "records": [
        "task-timeout-worker"
      ]
    },
    "fx-mcp-seed-doc": {
      "description": "Document id returned by the AC-3 positive-control call to store_document (title 's29-d0601-<run_id>-doc'), produced via the real executePostgresMcpTool('store_document', ...) entrypoint \u2014 reused as the target id for the AC-3/4 update_document/share_document calls so those two tools operate on a real row instead of a synthetic id.",
      "seed_method": "public_api",
      "records": [
        "s29-d0601-<run_id>-doc (document id captured at runtime)"
      ]
    },
    "fx-hono-min-bodies": {
      "description": "One minimal-valid JSON request body per route in fx-hono-write-inventory, built from each route's documented required fields in services/platform/src/http/hono-app.ts (e.g. POST /api/documents needs { title, content }). Lives in the NEW helper file as a Record<route-key, body>, not hardcoded inline per test.",
      "seed_method": "public_api",
      "records": [
        "POST /api/documents -> { title: 's29-d0601-<run_id>-doc', content: 'red-fence probe', category: 'general' }",
        "POST /api/uploads -> { idempotencyKey: 's29-d0601-<run_id>-upload', filename: 'probe.txt', contentType: 'text/plain', size: 4 }"
      ]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "primary": true,
      "flow_ref": "T-SYNC-010",
      "description": "GIVEN the live Hono app.routes table with HOLO_MIGRATION_READ_ONLY unset WHEN the suite issues one authenticated request per discovered POST/PUT/PATCH/DELETE /api/* route THEN at least 23 routes are discovered and every discovered route returns an HTTP status other than 423",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint29-write-fence-red.test.ts -t \"AC-1|TC-1|TC-2\"",
      "maps_to_ac": null,
      "test_tier": "integration",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "postgres",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "stub empty mock of app.routes returning a static hardcoded path array instead of live introspection",
            "disconnect from real createHonoApp so no request is issued",
            "inventory filtered to GET-only leaving an empty write surface"
          ]
        },
        "evidence": {
          "artifact_type": "api_response",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "fx-hono-write-inventory",
            "action": {
              "actor": "test_suite",
              "steps": [
                "Construct createHonoApp({ keys: DEFAULT_KEYS }) with process.env.HOLO_MIGRATION_READ_ONLY unset",
                "Compute fx-hono-write-inventory by filtering app.routes to method in {POST,PUT,PATCH,DELETE} and path starting with /api/",
                "For each discovered route, call app.request(path, { method, headers: { authorization: 'Bearer ' + DEFAULT_KEYS.rn }, body: fx-hono-min-bodies[route] })"
              ]
            },
            "end_state": {
              "must_observe": [
                "23 or more routes discovered from app.routes (count >= 23)",
                "every discovered route responds with an HTTP status other than 423"
              ],
              "must_not_observe": [
                "0 routes discovered (empty inventory)",
                "any discovered route returning HTTP 423"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-2",
      "type": "acceptance_criterion",
      "primary": false,
      "flow_ref": "T-SYNC-010",
      "description": "GIVEN the same fx-hono-write-inventory with a fresh createHonoApp() constructed AFTER setting HOLO_MIGRATION_READ_ONLY='1' WHEN the suite re-issues the identical request for every discovered route THEN every route returns HTTP 423 with JSON body { error: 'migration_read_only' } and Postgres row counts are unchanged from post-AC-1",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint29-write-fence-red.test.ts -t \"AC-2|TC-3|TC-4\"",
      "maps_to_ac": null,
      "test_tier": "integration",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "postgres",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "stub fence middleware that never actually sets status 423",
            "mock response body hardcoding migration_read_only without running the real route table",
            "static disconnect leaving 0 routes exercised"
          ]
        },
        "evidence": {
          "artifact_type": "api_response",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "fx-hono-write-inventory",
            "action": {
              "actor": "test_suite",
              "steps": [
                "Set process.env.HOLO_MIGRATION_READ_ONLY = '1'",
                "Construct a fresh createHonoApp({ keys: DEFAULT_KEYS }) instance",
                "Re-issue the identical request (same fx-hono-min-bodies) for every route in fx-hono-write-inventory",
                "Capture the pre-fence (AC-1) and post-fence row counts for documents/subscription_sources/improvement_requests via SELECT count(*)"
              ]
            },
            "end_state": {
              "must_observe": [
                "every discovered route responds with HTTP 423",
                "every response body deep-equals { \"error\": \"migration_read_only\" }",
                "documents/subscription_sources/improvement_requests row counts equal their post-AC-1 values (delta == 0)"
              ],
              "must_not_observe": [
                "HTTP 200 status on any discovered route (the AC-1 pre-fence signature)",
                "0 routes returning HTTP 423",
                "any response body lacking the migration_read_only error code"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-3",
      "type": "acceptance_criterion",
      "primary": false,
      "flow_ref": "T-SYNC-010",
      "description": "GIVEN the manifest-derived mutation tool list (fx-mcp-write-inventory, 21 tool ids) cross-checked against toolsAsRecord() with HOLO_MIGRATION_READ_ONLY unset WHEN the suite calls executePostgresMcpTool for each of the 21 tools THEN exactly 21 tool ids are discovered, every one exists in toolsAsRecord(), and every call resolves without a MIGRATION_READ_ONLY-prefixed error",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint29-write-fence-red.test.ts -t \"AC-3|TC-5|TC-6|TC-7\"",
      "maps_to_ac": null,
      "test_tier": "integration",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "postgres",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "stub empty mock of buildMutationsReport returning a static hardcoded tool list",
            "disconnect from real Postgres so store_document never inserts a row",
            "mock executePostgresMcpTool that always resolves without hitting the DB"
          ]
        },
        "evidence": {
          "artifact_type": "api_response",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "fx-mcp-write-inventory",
            "action": {
              "actor": "test_suite",
              "steps": [
                "Compute fx-mcp-write-inventory via buildMutationsReport(loadManifest(defaultManifestPath()))",
                "Assert every discovered tool_id is present in Object.keys(toolsAsRecord())",
                "For each of the 21 tool ids call executePostgresMcpTool(toolId, minimalValidInput) with HOLO_MIGRATION_READ_ONLY unset, capturing fx-mcp-seed-doc from the store_document call"
              ]
            },
            "end_state": {
              "must_observe": [
                "21 mutation tool ids discovered from the manifest side_effects field",
                "all 21 ids present in toolsAsRecord()",
                "21 of 21 executePostgresMcpTool calls resolve without throwing",
                "store_document returns a document id string matching `/^[0-9a-f-]{36}$/`",
                "follow-up SELECT id FROM documents WHERE title = 's29-d0601-<run_id>-doc' returns exactly 1 row"
              ],
              "must_not_observe": [
                "0 mutation tool ids discovered (empty inventory)",
                "fewer than 21 of 21 calls resolving without throwing",
                "any call rejecting with a MIGRATION_READ_ONLY-prefixed error",
                "0 rows returned by the follow-up SELECT for the seeded document"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-4",
      "type": "acceptance_criterion",
      "primary": false,
      "flow_ref": "T-SYNC-010",
      "description": "GIVEN the same 21-tool fx-mcp-write-inventory with HOLO_MIGRATION_READ_ONLY='1' WHEN the suite re-calls executePostgresMcpTool for each tool AND routes store_document through createMcpServer() THEN every direct call rejects with Error message starting 'MIGRATION_READ_ONLY:' and the gateway-routed call returns isError:true with parsed code MIGRATION_READ_ONLY",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint29-write-fence-red.test.ts -t \"AC-4|TC-8|TC-9\"",
      "maps_to_ac": null,
      "test_tier": "integration",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "postgres",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "stub error throw that never checks HOLO_MIGRATION_READ_ONLY",
            "mock createMcpServer handler that hardcodes isError without routing through the real prefix parser",
            "static disconnect leaving 0 tools exercised"
          ]
        },
        "evidence": {
          "artifact_type": "api_response",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "fx-mcp-write-inventory",
            "action": {
              "actor": "test_suite",
              "steps": [
                "Set process.env.HOLO_MIGRATION_READ_ONLY = '1'",
                "Re-call executePostgresMcpTool(toolId, sameInput) for each of the 21 tool ids in fx-mcp-write-inventory",
                "Route the store_document tool call through createMcpServer()'s registered handler via the MCP SDK transport and inspect isError + parsed content code"
              ]
            },
            "end_state": {
              "must_observe": [
                "21 of 21 executePostgresMcpTool calls reject with an Error message starting 'MIGRATION_READ_ONLY:'",
                "createMcpServer()-routed store_document call returns isError:true with parsed code `MIGRATION_READ_ONLY`"
              ],
              "must_not_observe": [
                "0 of the 21 calls rejecting with a MIGRATION_READ_ONLY-prefixed error",
                "any of the 21 calls resolving successfully (the AC-3 pre-fence signature)",
                "createMcpServer()-routed call returning isError:false"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-5",
      "type": "acceptance_criterion",
      "primary": false,
      "flow_ref": "T-SYNC-010",
      "description": "GIVEN a real Convex dev deployment via ConvexHttpClient(EXPO_PUBLIC_CONVEX_URL) with no read-only gate WHEN the suite calls api.documents.mutations.create and api.subscriptions.mutations.add THEN both resolve successfully with non-null Convex ids proving the write surface is live",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint29-write-fence-red.test.ts -t \"AC-5|TC-10|TC-11\"",
      "maps_to_ac": null,
      "test_tier": "integration",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "convex",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "stub mock ConvexHttpClient that returns a hardcoded id without a real mutation",
            "disconnect from EXPO_PUBLIC_CONVEX_URL so no real deployment is contacted",
            "static empty query result accepted as success"
          ]
        },
        "evidence": {
          "artifact_type": "api_response",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "fx-convex-functions",
            "action": {
              "actor": "test_suite",
              "steps": [
                "const client = new ConvexHttpClient(process.env.EXPO_PUBLIC_CONVEX_URL)",
                "await client.mutation(api.documents.mutations.create, { title: 's29-d0601-<run_id>-convex-doc', content: 'red-fence probe', category: 'general', embedding: [0,0,0] })",
                "await client.mutation(api.subscriptions.mutations.add, { sourceType: 'github', identifier: 's29-d0601-<run_id>-sub', name: 's29-d0601-<run_id>-sub' })"
              ]
            },
            "end_state": {
              "must_observe": [
                "api.documents.mutations.create returns a Convex document id matching `/^[a-z0-9]{32}$/`",
                "follow-up Convex query for documents where title = 's29-d0601-<run_id>-convex-doc' returns exactly 1 row",
                "api.subscriptions.mutations.add returns a Convex subscriptionSources id matching `/^[a-z0-9]{32}$/`",
                "follow-up Convex query for subscriptionSources where identifier = 's29-d0601-<run_id>-sub' returns exactly 1 row"
              ],
              "must_not_observe": [
                "either call rejecting with an error",
                "0 documents rows matching title 's29-d0601-<run_id>-convex-doc'",
                "0 subscriptionSources rows matching identifier 's29-d0601-<run_id>-sub'"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-6",
      "type": "acceptance_criterion",
      "primary": false,
      "flow_ref": "T-SYNC-010",
      "description": "GIVEN the same Convex deployment with HOLO_MIGRATION_READ_ONLY=true set via npx convex env set WHEN the suite re-calls documents.create and subscriptions.add THEN both reject with message starting 'migration_read_only:' and row counts equal their post-AC-5 values",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint29-write-fence-red.test.ts -t \"AC-6|TC-12|TC-13\"",
      "maps_to_ac": null,
      "test_tier": "integration",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "convex",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "stub env-gate check that never runs inside the mutation handler body",
            "mock Convex client that always throws migration_read_only without contacting the deployment",
            "static disconnect leaving mutations uninvoked"
          ]
        },
        "evidence": {
          "artifact_type": "api_response",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "fx-convex-functions",
            "action": {
              "actor": "test_suite",
              "steps": [
                "Run `npx convex env set HOLO_MIGRATION_READ_ONLY true` against the dev deployment",
                "Re-call client.mutation(api.documents.mutations.create, sameArgs) and client.mutation(api.subscriptions.mutations.add, sameArgs)",
                "Query documents/subscriptionSources row counts via a follow-up Convex query and compare to the post-AC-5 counts"
              ]
            },
            "end_state": {
              "must_observe": [
                "both calls reject with an error message starting 'migration_read_only:'",
                "documents row count for title 's29-d0601-<run_id>-convex-doc' equals 1 (unchanged from post-AC-5)",
                "subscriptionSources row count for identifier 's29-d0601-<run_id>-sub' equals 1 (unchanged from post-AC-5)"
              ],
              "must_not_observe": [
                "either call resolving successfully (the AC-5 pre-fence signature)",
                "documents row count greater than 1 (0 additional rows allowed) for that title",
                "subscriptionSources row count greater than 1 (0 additional rows allowed) for that identifier"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-7",
      "type": "acceptance_criterion",
      "primary": false,
      "flow_ref": "T-SYNC-010",
      "description": "GIVEN the real task-timeout-worker entry from MIGRATED_JOBS (fx-job) with HOLO_MIGRATION_READ_ONLY unset WHEN the suite calls runJob(job, { databaseUrl }) THEN runJob returns { ok: true, error: null } and exactly one new job_runs row is inserted",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint29-write-fence-red.test.ts -t \"AC-7|TC-14\"",
      "maps_to_ac": null,
      "test_tier": "integration",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "postgres",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "stub runJob that returns ok:true without inserting a job_runs row",
            "mock MIGRATED_JOBS empty array so the job is never found",
            "disconnect from real Postgres leaving after == before with no insert"
          ]
        },
        "evidence": {
          "artifact_type": "db_query",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "fx-job",
            "action": {
              "actor": "test_suite",
              "steps": [
                "const job = MIGRATED_JOBS.find(j => j.name === 'task-timeout-worker')",
                "SELECT count(*) AS before FROM job_runs WHERE job_name = 'task-timeout-worker'",
                "await runJob(job, { databaseUrl: DEFAULT_DATABASE_URL })",
                "SELECT count(*) AS after FROM job_runs WHERE job_name = 'task-timeout-worker'"
              ]
            },
            "end_state": {
              "must_observe": [
                "runJob returns { ok: true, error: null }",
                "job_runs row count for task-timeout-worker increases by exactly 1 (after == before + 1)"
              ],
              "must_not_observe": [
                "runJob returns ok: false",
                "job_runs row count unchanged after the call (0 new rows, after == before)"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-8",
      "type": "acceptance_criterion",
      "primary": false,
      "flow_ref": "T-SYNC-010",
      "description": "GIVEN the same fx-job with HOLO_MIGRATION_READ_ONLY='1' WHEN the suite re-calls runJob(job, { databaseUrl, runId: newRunId }) THEN runJob returns { ok: false, error: <string starting with 'migration_read_only:'> } and job_runs row count is unchanged from post-AC-7",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint29-write-fence-red.test.ts -t \"AC-8|TC-15|TC-16\"",
      "maps_to_ac": null,
      "test_tier": "integration",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "postgres",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "stub fence that returns ok:false without the migration_read_only: prefix",
            "mock runJob that never consults HOLO_MIGRATION_READ_ONLY and still inserts a row",
            "static empty disconnect leaving the job uninvoked"
          ]
        },
        "evidence": {
          "artifact_type": "db_query",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "fx-job",
            "action": {
              "actor": "test_suite",
              "steps": [
                "Set process.env.HOLO_MIGRATION_READ_ONLY = '1'",
                "SELECT count(*) AS before FROM job_runs WHERE job_name = 'task-timeout-worker'",
                "await runJob(job, { databaseUrl: DEFAULT_DATABASE_URL, runId: newRunId })",
                "SELECT count(*) AS after FROM job_runs WHERE job_name = 'task-timeout-worker'"
              ]
            },
            "end_state": {
              "must_observe": [
                "runJob returns { ok: false, error: <string starting with 'migration_read_only:'> }",
                "job_runs row count unchanged after the call (0 new rows, after == before, matching the post-AC-7 value)"
              ],
              "must_not_observe": [
                "runJob returns ok: true",
                "job_runs row count increased by 1 (after == before + 1, the AC-7 pre-fence signature)",
                "0 migration_read_only rejections observed (empty fence surface)"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "TC-1",
      "type": "test_criterion",
      "description": "Discovered Hono write-route count is 23 or greater when app.routes is filtered to POST/PUT/PATCH/DELETE /api/* paths.",
      "statement": "Discovered Hono write-route count is 23 or greater when app.routes is filtered to POST/PUT/PATCH/DELETE /api/* paths.",
      "maps_to_ac": "AC-1",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint29-write-fence-red.test.ts -t \"TC-1\""
    },
    {
      "id": "TC-2",
      "type": "test_criterion",
      "description": "Every discovered Hono write route returns a non-423 HTTP status when HOLO_MIGRATION_READ_ONLY is unset.",
      "statement": "Every discovered Hono write route returns a non-423 HTTP status when HOLO_MIGRATION_READ_ONLY is unset.",
      "maps_to_ac": "AC-1",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint29-write-fence-red.test.ts -t \"TC-2\""
    },
    {
      "id": "TC-3",
      "type": "test_criterion",
      "description": "Every discovered Hono write route returns HTTP 423 when HOLO_MIGRATION_READ_ONLY is set to '1'.",
      "statement": "Every discovered Hono write route returns HTTP 423 when HOLO_MIGRATION_READ_ONLY is set to '1'.",
      "maps_to_ac": "AC-2",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint29-write-fence-red.test.ts -t \"TC-3\""
    },
    {
      "id": "TC-4",
      "type": "test_criterion",
      "description": "Every fenced Hono write-route response body equals { error: 'migration_read_only' } when HOLO_MIGRATION_READ_ONLY is set to '1'.",
      "statement": "Every fenced Hono write-route response body equals { error: 'migration_read_only' } when HOLO_MIGRATION_READ_ONLY is set to '1'.",
      "maps_to_ac": "AC-2",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint29-write-fence-red.test.ts -t \"TC-4\""
    },
    {
      "id": "TC-5",
      "type": "test_criterion",
      "description": "MCP mutation-tool inventory count equals 21 when derived from the manifest side_effects field.",
      "statement": "MCP mutation-tool inventory count equals 21 when derived from the manifest side_effects field.",
      "maps_to_ac": "AC-3",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint29-write-fence-red.test.ts -t \"TC-5\""
    },
    {
      "id": "TC-6",
      "type": "test_criterion",
      "description": "Every MCP mutation tool id exists in the live tools/registry.ts record when cross-checked against buildMutationsReport output.",
      "statement": "Every MCP mutation tool id exists in the live tools/registry.ts record when cross-checked against buildMutationsReport output.",
      "maps_to_ac": "AC-3",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint29-write-fence-red.test.ts -t \"TC-6\""
    },
    {
      "id": "TC-7",
      "type": "test_criterion",
      "description": "executePostgresMcpTool resolves without a MIGRATION_READ_ONLY-prefixed error for every mutation tool id when HOLO_MIGRATION_READ_ONLY is unset.",
      "statement": "executePostgresMcpTool resolves without a MIGRATION_READ_ONLY-prefixed error for every mutation tool id when HOLO_MIGRATION_READ_ONLY is unset.",
      "maps_to_ac": "AC-3",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint29-write-fence-red.test.ts -t \"TC-7\""
    },
    {
      "id": "TC-8",
      "type": "test_criterion",
      "description": "executePostgresMcpTool rejects with a MIGRATION_READ_ONLY-prefixed error for every mutation tool id when HOLO_MIGRATION_READ_ONLY is set to '1'.",
      "statement": "executePostgresMcpTool rejects with a MIGRATION_READ_ONLY-prefixed error for every mutation tool id when HOLO_MIGRATION_READ_ONLY is set to '1'.",
      "maps_to_ac": "AC-4",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint29-write-fence-red.test.ts -t \"TC-8\""
    },
    {
      "id": "TC-9",
      "type": "test_criterion",
      "description": "createMcpServer's registered store_document handler returns isError true with parsed code MIGRATION_READ_ONLY when HOLO_MIGRATION_READ_ONLY is set to '1'.",
      "statement": "createMcpServer's registered store_document handler returns isError true with parsed code MIGRATION_READ_ONLY when HOLO_MIGRATION_READ_ONLY is set to '1'.",
      "maps_to_ac": "AC-4",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint29-write-fence-red.test.ts -t \"TC-9\""
    },
    {
      "id": "TC-10",
      "type": "test_criterion",
      "description": "The real api.documents.mutations.create call returns a non-null document id when the Convex read-only gate is unset.",
      "statement": "The real api.documents.mutations.create call returns a non-null document id when the Convex read-only gate is unset.",
      "maps_to_ac": "AC-5",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint29-write-fence-red.test.ts -t \"TC-10\""
    },
    {
      "id": "TC-11",
      "type": "test_criterion",
      "description": "The real api.subscriptions.mutations.add call returns a non-null subscription id when the Convex read-only gate is unset.",
      "statement": "The real api.subscriptions.mutations.add call returns a non-null subscription id when the Convex read-only gate is unset.",
      "maps_to_ac": "AC-5",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint29-write-fence-red.test.ts -t \"TC-11\""
    },
    {
      "id": "TC-12",
      "type": "test_criterion",
      "description": "The real api.documents.mutations.create call rejects with a migration_read_only-prefixed error message when the Convex read-only gate is set.",
      "statement": "The real api.documents.mutations.create call rejects with a migration_read_only-prefixed error message when the Convex read-only gate is set.",
      "maps_to_ac": "AC-6",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint29-write-fence-red.test.ts -t \"TC-12\""
    },
    {
      "id": "TC-13",
      "type": "test_criterion",
      "description": "The real api.subscriptions.mutations.add call rejects with a migration_read_only-prefixed error message when the Convex read-only gate is set.",
      "statement": "The real api.subscriptions.mutations.add call rejects with a migration_read_only-prefixed error message when the Convex read-only gate is set.",
      "maps_to_ac": "AC-6",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint29-write-fence-red.test.ts -t \"TC-13\""
    },
    {
      "id": "TC-14",
      "type": "test_criterion",
      "description": "runJob returns ok true and inserts exactly one job_runs row for task-timeout-worker when HOLO_MIGRATION_READ_ONLY is unset.",
      "statement": "runJob returns ok true and inserts exactly one job_runs row for task-timeout-worker when HOLO_MIGRATION_READ_ONLY is unset.",
      "maps_to_ac": "AC-7",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint29-write-fence-red.test.ts -t \"TC-14\""
    },
    {
      "id": "TC-15",
      "type": "test_criterion",
      "description": "runJob returns ok false with an error message starting migration_read_only when HOLO_MIGRATION_READ_ONLY is set to '1'.",
      "statement": "runJob returns ok false with an error message starting migration_read_only when HOLO_MIGRATION_READ_ONLY is set to '1'.",
      "maps_to_ac": "AC-8",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint29-write-fence-red.test.ts -t \"TC-15\""
    },
    {
      "id": "TC-16",
      "type": "test_criterion",
      "description": "job_runs row count after the fenced task-timeout-worker call equals the row count after the unfenced call when HOLO_MIGRATION_READ_ONLY is set to '1'.",
      "statement": "job_runs row count after the fenced task-timeout-worker call equals the row count after the unfenced call when HOLO_MIGRATION_READ_ONLY is set to '1'.",
      "maps_to_ac": "AC-8",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint29-write-fence-red.test.ts -t \"TC-16\""
    }
  ]
}
-->

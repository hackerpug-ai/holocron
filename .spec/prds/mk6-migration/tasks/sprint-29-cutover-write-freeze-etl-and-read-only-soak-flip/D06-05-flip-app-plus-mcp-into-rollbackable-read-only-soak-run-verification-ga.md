# D06-05: Flip app plus MCP into rollbackable read-only soak, run verification gates

> **Task ID:** D06-05
> **Sprint:** [Sprint 29 — Cutover](./SPRINT.md)
> **Agent:** `devops-engineer`
> **Estimate:** 150 min
> **Type:** FEATURE
> **Priority:** P0 · **Effort:** L
> **Proposed By:** `devops-engineer`
> **TDD_MODE:** `red_first` · **RED_GREEN_REQUIRED:** yes
> Status: Backlog

**Capabilities:** CAP-CUT-01
**PRD refs:** UC-SYNC-03, T-SYNC-010, T-SYNC-011, UC-SYNC-04

## Specification

**Objective.** Engage the pinned HOLO_MIGRATION_READ_ONLY fence at every new-backend write chokepoint, then run one aggregate verification gate proving reads, all 44 MCP tools, real /article/ byte-parity, and every migrated job pass while every write path visibly blocks — UC-SYNC-03 AC-3/AC-4, T-SYNC-010, T-SYNC-011.

**Success state.** `holo cutover:flip` refuses unless D06-04's reconciliation is green, then durably sets HOLO_MIGRATION_READ_ONLY=1; `holo cutover:verify-soak --json` reports overall.ok==true only when all manifest-derived MCP tools are accounted, Postgres read counts match the ETL baseline, the real Hono-served /article/ route byte-matches D06-03's baseline, a Hono/MCP/queue write sweep is uniformly blocked with unchanged row counts, and all registry-derived migrated jobs are accounted.

## Critical Constraints

- **MUST** — MUST implement the SAME pinned D06-01 contract: HOLO_MIGRATION_READ_ONLY=='1' checked fresh (never cached at process start) at every new-backend write chokepoint — Hono, MCP executor, queue runJob() — no second mechanism, no new Postgres table
- **MUST** — MUST return exactly: Hono → HTTP 423 with body `{"error":"migration_read_only","code":"migration_read_only"}` (both keys present — `error` satisfies D06-01's pinned RED assertion, `code` satisfies the existing sync/client-data-contract-author.ts CI verifier at lines 634/643/658; neither field is dropped in favor of the other); MCP → throw `Error('MIGRATION_READ_ONLY: <reason>')` (uppercase prefix, gateway.ts's existing prefix parser derives code unchanged); queue → `runJob()` returns `{ok:false, error:'migration_read_only: <reason>'}` rather than throwing
- **MUST** — MUST make cutover:verify-soak fail loudly, not silently omit, on the Zero client write path: at c7873378 there is no landed Zero mutator/write surface, so the aggregate report MUST include an explicit zeroWritePath entry with status 'NOT_LANDED' (never simply absent from the report) and overall.ok computation MUST NOT treat a missing/NOT_LANDED zeroWritePath as an implicit pass
- **MUST** — MUST invoke all 44 MCP tools over the real /mcp HTTP endpoint (handleMcpRequest), never executePostgresMcpTool directly in-process
- **MUST** — MUST derive toolsTotal from the live manifest's tool count and jobsTotal from MIGRATED_JOBS.length at runtime — never hardcode 44 or 16
- **MUST** — MUST compare /article/ bytes against D06-03's real pre-freeze article-baseline.json — never against the static article:compat stub
- **NEVER** — NEVER let a write path return migration_read_only in its response while the underlying INSERT/UPDATE/DELETE still commits — every write-block AC MUST assert the targeted table's row count is literally unchanged
- **NEVER** — NEVER count a tool or job as passed if its invocation was stubbed or never reached
- **NEVER** — NEVER touch app/, components/, hooks/, screens/, or convex/ — RN flip is Sprint 24's scope and Convex stays untouched post-D06-03
- **STRICTLY** — STRICTLY HOLO_MIGRATION_READ_ONLY requires no code deletion to reverse — Sprint 30 owns exercising that reversal
- **STRICTLY** — STRICTLY cutover:flip refuses unless D06-04's reconciliation is green

## Acceptance Criteria

#### AC-1 (PRIMARY)

- **GIVEN** etl_reconciled_green
- **WHEN** operator runs cutover:flip --json
- **THEN** HOLO_MIGRATION_READ_ONLY is durably set to 1 only when reconciliation is green; a variance>0 retry refuses

`test_tier: integration` · `service: postgres` · `flow_ref: T-SYNC-010`
#### AC-2

- **GIVEN** soak_engaged
- **WHEN** operator runs cutover:verify-tools --json over real /mcp
- **THEN** manifest-derived toolsTotal all accounted, mutation tools blocked with MIGRATION_READ_ONLY

`test_tier: e2e` · `service: mcp-gateway` · `flow_ref: T-SYNC-010`
#### AC-3

- **GIVEN** soak_engaged
- **WHEN** operator runs cutover:verify-reads --json
- **THEN** Postgres zero_pub table counts match the D06-04 watermark baseline exactly

`test_tier: e2e` · `service: postgres` · `flow_ref: T-SYNC-010`
#### AC-4

- **GIVEN** soak_engaged and article_baseline_available
- **WHEN** operator GETs /article/:shareToken from the real running Hono server
- **THEN** response bytes sha256-match D06-03's real baseline exactly

`test_tier: e2e` · `service: hono` · `flow_ref: T-SYNC-010`
#### AC-5

- **GIVEN** soak_engaged
- **WHEN** operator issues a real POST /api/documents
- **THEN** HTTP 423 with body error==migration_read_only AND code==migration_read_only, unchanged row count

`test_tier: e2e` · `service: hono` · `flow_ref: T-SYNC-010`
#### AC-6

- **GIVEN** soak_engaged
- **WHEN** operator runs cutover:verify-soak --json (aggregating AC-2..AC-5 plus every registry-derived migrated job via runJob())
- **THEN** jobsTotal/jobsAccounted match MIGRATED_JOBS.length, write-producing jobs return ok:false migration_read_only:, overall.ok is the AND of every sub-report

`test_tier: e2e` · `service: postgres` · `flow_ref: T-SYNC-010`

## Test Criteria

| ID | Boolean statement | Maps to | Verify |
|----|-------------------|---------|--------|
| TC-1 | cutover:flip exits non-zero when the reconciliation report is not green | AC-1 | `holo cutover:flip against a variance>0 fixture; echo $?` |
| TC-2 | HOLO_MIGRATION_READ_ONLY reads 1 after a reconciled-green flip | AC-1 | `holo cutover:flip --json; jq .engaged_at` |
| TC-3 | toolsTotal equals the live manifest's tool count | AC-2 | `holo cutover:verify-tools --json; jq .toolsTotal` |
| TC-4 | every mutation tool response carries the code MIGRATION_READ_ONLY | AC-2 | `jq '[.tools[] | select(.is_mutation)] | all(.code=="MIGRATION_READ_ONLY")'` |
| TC-5 | Postgres documents count equals the watermark baseline documents count exactly | AC-3 | `holo cutover:verify-reads --json; jq .perTableCounts.documents` |
| TC-6 | the real article response sha256 equals article-baseline.json's sha256 | AC-4 | `curl /article/:token | sha256sum; jq -r .sha256 article-baseline.json` |
| TC-7 | a POST /api/documents attempt returns HTTP 423 with error equal to migration_read_only | AC-5 | `curl -i -X POST /api/documents -d '{...}'` |
| TC-8 | jobsAccounted equals MIGRATED_JOBS.length | AC-6 | `holo cutover:verify-soak --json; jq .jobsAccounted` |
| TC-9 | report.zeroWritePath.status equals NOT_LANDED rather than being absent from the report | AC-6 | `holo cutover:verify-soak --json; jq .zeroWritePath.status` |

## Reading List

- `services/platform/src/http/hono-app.ts` — lines 133-1076 — the full write-route surface plus the /mcp handler at 1062-1074, single chokepoint for app.use('*', soakFenceMiddleware)
- `services/platform/src/mcp/executor.ts` — lines 164-177 — executePostgresMcpTool switch dispatch — insertion point for the mutation-tool fence check
- `services/platform/src/mcp/gateway.ts` — lines 36-52,63-75 — error-prefix parsing (unchanged) and handleMcpRequest — the real transport verify-tools must call through
- `services/platform/src/mcp/list-mutations.ts` — lines 1-46 — side_effects-derived mutation-tool classification
- `services/platform/src/queue/jobs-runner.ts` — lines 1-62 — runJob() — insertion point for the fence check before beginEffect/dispatchAndAck, returning {ok:false, error:'migration_read_only: ...'}
- `services/platform/src/queue/jobs-registry.ts` — lines 1-60 — MIGRATED_JOBS registry this task's aggregate gate derives jobsTotal from
- `services/platform/src/http/article.ts` — lines 1-40 — selectPublicArticle/articleHtml — the byte-comparable render this task's parity check invokes against D06-03's real baseline
- `convex/documents/mutations.ts` — lines 207-224 — same env-gate precedent reused across surfaces for contract consistency

## Guardrails

**WRITE-ALLOWED**

- `services/platform/src/cutover/soak-fence.ts` — NEW — HOLO_MIGRATION_READ_ONLY read/persist helper, no new DB tables
- `services/platform/src/http/hono-app.ts` — MODIFY — add fence middleware for non-GET /api/* routes
- `services/platform/src/mcp/executor.ts` — MODIFY — check fence before dispatch for mutation-tool ids
- `services/platform/src/queue/jobs-runner.ts` — MODIFY — check fence in runJob() before beginEffect, return {ok:false,error:...} instead of throwing
- `services/platform/src/cli/holo.ts` — MODIFY — add cutover:flip, cutover:verify-tools, cutover:verify-reads, cutover:verify-soak cases
- `services/platform/tests/integration/sprint29-soak-flip.test.ts` — NEW

**WRITE-PROHIBITED**

- `app/, components/, hooks/, screens/` — RN app-side flip is Sprint 24's scope
- `convex/**` — Convex is already fenced by D06-03 and stays live/un-deleted for rollback
- `services/platform/src/db/migrations/` — the pinned fence contract is a single env var, not a new Postgres table — no schema change needed
- `services/platform/src/queue/durable-effect.ts` — the fence check is scoped to jobs-runner.ts's runJob() per the pinned D06-01 contract, not the lower-level outbox primitive

## Design / Code Pattern

**Pattern.** The same pinned HOLO_MIGRATION_READ_ONLY env var, read fresh at every new-backend write chokepoint (Hono middleware, MCP executor dispatch, queue runJob()), with per-surface rejection shapes fixed by D06-01

**Pattern source.** `D06-01's RED test contract`

**Anti-pattern.** A second fencing mechanism (e.g. a Postgres cutover_soak table) instead of the single pinned env var; a fence that only guards the HTTP response layer while MCP/queue bypass it; a verify-tools report that hardcodes 44 instead of reading the manifest; using the static article:compat stub as the parity oracle

**References**

- convex/documents/mutations.ts:207-224 (same env-gate contract, cross-surface)
- services/platform/src/mcp/gateway.ts:36-52 (unchanged prefix parser)

## Verification Gates

- `pnpm biome check --no-errors-on-unmatched --diagnostic-level=error services/platform/src/cutover/soak-fence.ts services/platform/src/http/hono-app.ts services/platform/src/mcp/executor.ts services/platform/src/queue/jobs-runner.ts services/platform/src/cli/holo.ts` → exit 0
- `pnpm tsgo --noEmit` → exit 0
- `PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint29-soak-flip.test.ts` → exit 0
- `pnpm vitest run --project live services/platform/tests/integration/sprint29-soak-flip.test.ts` → exit 0
- `pnpm test:lanes` → exit 0
- `bun services/platform/src/cli/holo.ts cutover:verify-soak --json` → overall.ok == true

## Capability Chain

- **Provides:** services/platform/src/cutover/soak-fence.ts (HOLO_MIGRATION_READ_ONLY read/persist helper); holo cutover:flip; holo cutover:verify-tools / cutover:verify-reads / cutover:verify-soak
- **Consumes:** D06-04 reconciliation-green precondition; D06-03 article-baseline.json; services/platform/src/http/hono-app.ts; services/platform/src/mcp/{executor,gateway,list-mutations}.ts; services/platform/src/queue/jobs-runner.ts + jobs-registry.ts; 14-mcp-compatibility-manifest.yaml
- **Boundary contracts:** CAP-CUT-01: 'end-to-end pass across app reads, all 44 MCP tools, /article/, every cron; all production write paths visibly return migration_read_only during soak'; CAP-CUT-01 idempotency: 'the read-only flip is config-reversible'

## Agent Assignment

`devops-engineer` — Engaging the new-backend read-only soak fence across Hono/MCP/queue and running the aggregate verification gate is the operator-facing flip surface CAP-CUT-01 assigns to devops-engineer.

## Dependencies

- **Depends on:** D06-01, D06-04
- **Blocks:** —

## Coding Standards

- RULES.md
- biome.json

## Notes

Expanded by `devops-engineer` from handoff `s29-devops.json`. Fakeability audit: `validate_scenario.py` reports **0 CRITICAL** across every behavioral AC (task-level `fixtures` resolve each `start_ref`).

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
 "version": "1",
 "task_id": "D06-05",
 "tdd_mode": "red_first",
 "verification_policy": {
  "requires_tests": true,
  "requires_red_evidence": true,
  "requires_seeded_evidence": true
 },
 "fixtures": {
  "etl_reconciled_green": {
   "description": "D06-04's cutover:run-etl completed with unexplainedVariance==0.",
   "seed_method": "cli",
   "records": [
    "holo cutover:run-etl --json reports unexplainedVariance:0",
    "watermark-report.json exists with a real runId"
   ]
  },
  "soak_engaged": {
   "description": "HOLO_MIGRATION_READ_ONLY durably set to '1' via holo cutover:flip, read fresh by the running Hono/MCP/queue processes.",
   "seed_method": "cli",
   "records": [
    "holo cutover:flip --json exits 0",
    "the running Hono process's process.env.HOLO_MIGRATION_READ_ONLY reads '1' on the next request",
    "flip report engaged_at is a real ISO timestamp"
   ]
  },
  "article_baseline_available": {
   "description": "article-baseline.json produced by D06-03's cutover:capture-article-baseline, containing a real sha256+byteLength for a sampled public shareToken now present in the ETL-loaded Postgres documents table.",
   "seed_method": "recorded_external",
   "records": [
    "article-baseline.json exists with sha256 and byteLength fields",
    "the sampled shareToken's document exists in the Postgres documents table"
   ]
  }
 },
 "requirements": [
  {
   "id": "AC-1",
   "type": "acceptance_criterion",
   "primary": true,
   "flow_ref": "T-SYNC-010",
   "description": "GIVEN etl reconciled green WHEN cutover:flip runs THEN HOLO_MIGRATION_READ_ONLY becomes 1 durably before verification, refusing on unreconciled state",
   "verify": "holo cutover:flip --json; retry against variance>0 fixture expect non-zero exit",
   "maps_to_ac": null,
   "test_tier": "integration",
   "scenario": {
    "tier": "visible",
    "test_tier": "integration",
    "verification_service": "postgres",
    "topology": "single-node",
    "negative_control": {
     "would_fail_if": [
      "flip succeeds despite unexplainedVariance>0 (a stub precondition check)",
      "verification gates run before the env var is actually set (mock ordering)"
     ]
    },
    "evidence": {
     "artifact_type": "db_query",
     "required_capture": true
    },
    "cases": [
     {
      "start_ref": "etl_reconciled_green",
      "action": {
       "actor": "operator",
       "steps": [
        "run holo cutover:flip --json",
        "read the running process's env var directly",
        "attempt cutover:flip again against a synthetic variance>0 fixture"
       ]
      },
      "end_state": {
       "must_observe": [
        "engaged_at matches `^\\d{4}-\\d{2}-\\d{2}T`",
        "flip report references the D06-04 etl runId (non-empty string)",
        "the variance>0 retry exits with a non-zero code"
       ],
       "must_not_observe": [
        "flip succeeds (exit 0) against a variance>0 state",
        "engaged_at is empty or none"
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
   "description": "GIVEN soak engaged WHEN verify-tools runs over real /mcp THEN manifest-derived tools accounted, mutations blocked",
   "verify": "holo cutover:verify-tools --json; jq .toolsTotal; jq .toolsPassed",
   "maps_to_ac": null,
   "test_tier": "e2e",
   "scenario": {
    "tier": "visible",
    "test_tier": "e2e",
    "verification_service": "mcp-gateway",
    "topology": "single-node",
    "negative_control": {
     "would_fail_if": [
      "toolsTotal is hardcoded to 44 instead of read from the manifest",
      "a tool is counted as passed without actually invoking it over /mcp",
      "a mutation tool returns a real success"
     ]
    },
    "evidence": {
     "artifact_type": "api_response",
     "required_capture": true
    },
    "cases": [
     {
      "start_ref": "soak_engaged",
      "action": {
       "actor": "operator",
       "steps": [
        "run holo cutover:verify-tools --json (invokes every manifest tool over real /mcp)",
        "inspect per-tool results"
       ]
      },
      "end_state": {
       "must_observe": [
        "toolsTotal equals manifest.tools.length re-derived at runtime (e.g. 44)",
        "toolsPassed == toolsTotal (both == manifest.tools.length, >= 44)",
        "every mutation-tool response isError is true with code equal to the literal 'MIGRATION_READ_ONLY'",
        "toolsStubbed equals the literal 0"
       ],
       "must_not_observe": [
        "toolsTotal equals 0 (empty manifest read)",
        "toolsStubbed greater than 0",
        "any mutation-tool response isError equals false (write succeeded)"
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
   "description": "GIVEN soak engaged WHEN verify-reads runs THEN Postgres read counts match the ETL baseline exactly",
   "verify": "holo cutover:verify-reads --json; jq .perTableCounts",
   "maps_to_ac": null,
   "test_tier": "e2e",
   "scenario": {
    "tier": "visible",
    "test_tier": "e2e",
    "verification_service": "postgres",
    "topology": "single-node",
    "negative_control": {
     "would_fail_if": [
      "a table count mismatch is silently ignored",
      "counts are asserted non-empty without comparing to the concrete baseline"
     ]
    },
    "evidence": {
     "artifact_type": "db_query",
     "required_capture": true
    },
    "cases": [
     {
      "start_ref": "soak_engaged",
      "action": {
       "actor": "operator",
       "steps": [
        "run holo cutover:verify-reads --json",
        "compare each sampled table count to watermark-report.loadedByTable"
       ]
      },
      "end_state": {
       "must_observe": [
        "documents count equals watermark-report.loadedByTable.documents exactly (e.g. 10==10)",
        "conversations count equals watermark-report.loadedByTable.conversations exactly (e.g. 5==5)",
        "3rd sampled table count == its baseline (all 3 counts > 0)"
       ],
       "must_not_observe": [
        "any of the 3 table counts equals 0 while the baseline count is nonzero",
        "any table count mismatches its baseline"
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
   "description": "GIVEN soak engaged and a real pre-freeze baseline WHEN operator GETs the real /article/ route THEN bytes match exactly",
   "verify": "curl -s /article/:token | sha256sum; jq -r .sha256 article-baseline.json",
   "maps_to_ac": null,
   "test_tier": "e2e",
   "scenario": {
    "tier": "visible",
    "test_tier": "e2e",
    "verification_service": "hono",
    "topology": "single-node",
    "negative_control": {
     "would_fail_if": [
      "the comparison uses the static article:compat stub instead of a real fetch",
      "byte comparison is skipped/assumed to match"
     ]
    },
    "evidence": {
     "artifact_type": "api_response",
     "required_capture": true
    },
    "cases": [
     {
      "start_ref": "article_baseline_available",
      "action": {
       "actor": "operator",
       "steps": [
        "GET /article/:shareToken from the real running Hono server for the same sampled token as D06-03's baseline",
        "compute the response sha256 and byteLength"
       ]
      },
      "end_state": {
       "must_observe": [
        "response sha256 equals article-baseline.json.sha256 exactly (64-hex match)",
        "response byteLength equals article-baseline.json.byteLength exactly (e.g. 4821==4821)",
        "HTTP status equals the literal 200"
       ],
       "must_not_observe": [
        "response sha256 differs from the baseline",
        "HTTP status equals 404",
        "response byteLength equals 0 (empty body)"
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
   "description": "GIVEN soak engaged WHEN a real Hono POST write is attempted THEN it is blocked with 423 and zero side effects",
   "verify": "curl -i -X POST /api/documents -d '{\"title\":\"x\",\"content\":\"y\"}'",
   "maps_to_ac": null,
   "test_tier": "e2e",
   "scenario": {
    "tier": "visible",
    "test_tier": "e2e",
    "verification_service": "hono",
    "topology": "single-node",
    "negative_control": {
     "would_fail_if": [
      "the response body says migration_read_only while the underlying INSERT still commits (a mock body over a real write)",
      "the endpoint returns 201 despite the fence being engaged (a stub middleware that never actually intercepts)"
     ]
    },
    "evidence": {
     "artifact_type": "db_query",
     "required_capture": true
    },
    "cases": [
     {
      "start_ref": "soak_engaged",
      "action": {
       "actor": "operator",
       "steps": [
        "capture the documents table row count",
        "POST /api/documents with a valid body",
        "re-capture the documents table row count"
       ]
      },
      "end_state": {
       "must_observe": [
        "HTTP status equals the literal 423",
        "response body error field equals the literal string 'migration_read_only'",
        "response body code field equals the literal string 'migration_read_only'",
        "documents row count identical before and after (e.g. 10==10)"
       ],
       "must_not_observe": [
        "HTTP status equals 201 (write succeeded)",
        "documents row count increases (e.g. 10 -> 11)",
        "response body error field is empty or none",
        "response body code field is empty or none"
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
   "description": "GIVEN soak engaged WHEN verify-soak aggregates tools/reads/article/hono-sweep plus every registry-derived migrated job THEN overall.ok reflects the true AND and jobs are fully accounted",
   "verify": "holo cutover:verify-soak --json; jq .overall.ok; jq .jobsTotal; jq .jobsAccounted",
   "maps_to_ac": null,
   "test_tier": "e2e",
   "scenario": {
    "tier": "visible",
    "test_tier": "e2e",
    "verification_service": "postgres",
    "topology": "single-node",
    "negative_control": {
     "would_fail_if": [
      "jobsTotal is hardcoded to 16 instead of MIGRATED_JOBS.length",
      "overall.ok is true while a sub-report is false",
      "a job is silently skipped and still counted as accounted"
     ]
    },
    "evidence": {
     "artifact_type": "file_artifact",
     "required_capture": true
    },
    "cases": [
     {
      "start_ref": "soak_engaged",
      "action": {
       "actor": "operator",
       "steps": [
        "run holo cutover:verify-soak --json",
        "inspect the aggregate report and per-job runJob() results"
       ]
      },
      "end_state": {
       "must_observe": [
        "jobsTotal equals MIGRATED_JOBS.length re-derived at runtime (e.g. 16)",
        "jobsAccounted == jobsTotal (both == MIGRATED_JOBS.length, >= 16)",
        "every write-producing job result has ok equal to the literal false with error starting with the literal string 'migration_read_only:'",
        "overall.ok == true and all 5 sub-report .ok values == true",
        "report.zeroWritePath.status equals the literal string 'NOT_LANDED' (no landed Zero mutator at c7873378 \u2014 surfaced loudly, never silently absent from the report)"
       ],
       "must_not_observe": [
        "jobsAccounted equals 0 while jobsTotal is nonzero (an empty/broken registry read)",
        "overall.ok equals true while any sub-report.ok equals false",
        "any write-producing job result.ok equals true (write succeeded)",
        "report.zeroWritePath key is absent/none (silently omitted rather than reported NOT_LANDED)"
       ]
      }
     }
    ]
   }
  },
  {
   "id": "TC-1",
   "type": "test_criterion",
   "description": "cutover:flip exits non-zero on an unreconciled state",
   "maps_to_ac": "AC-1",
   "verify": "holo cutover:flip against variance>0 fixture; echo $?"
  },
  {
   "id": "TC-2",
   "type": "test_criterion",
   "description": "flip report engaged_at is a real timestamp",
   "maps_to_ac": "AC-1",
   "verify": "jq .engaged_at"
  },
  {
   "id": "TC-3",
   "type": "test_criterion",
   "description": "toolsTotal is manifest-derived",
   "maps_to_ac": "AC-2",
   "verify": "jq .toolsTotal"
  },
  {
   "id": "TC-4",
   "type": "test_criterion",
   "description": "mutation tools carry code MIGRATION_READ_ONLY",
   "maps_to_ac": "AC-2",
   "verify": "jq '[.tools[] | select(.is_mutation)] | all(.code==\"MIGRATION_READ_ONLY\")'"
  },
  {
   "id": "TC-5",
   "type": "test_criterion",
   "description": "documents count matches the watermark baseline exactly",
   "maps_to_ac": "AC-3",
   "verify": "jq .perTableCounts.documents"
  },
  {
   "id": "TC-6",
   "type": "test_criterion",
   "description": "the real article response sha256 matches the baseline",
   "maps_to_ac": "AC-4",
   "verify": "curl /article/:token | sha256sum"
  },
  {
   "id": "TC-7",
   "type": "test_criterion",
   "description": "a Hono write attempt returns 423 with error migration_read_only",
   "maps_to_ac": "AC-5",
   "verify": "curl -i -X POST /api/documents"
  },
  {
   "id": "TC-8",
   "type": "test_criterion",
   "description": "jobsAccounted equals the registry-derived jobsTotal",
   "maps_to_ac": "AC-6",
   "verify": "jq .jobsAccounted; jq .jobsTotal"
  },
  {
   "id": "TC-9",
   "type": "test_criterion",
   "description": "the report surfaces the unlanded Zero write path as NOT_LANDED rather than omitting it",
   "maps_to_ac": "AC-6",
   "verify": "jq .zeroWritePath.status"
  }
 ]
}
-->

# D06-03: Durable write-fence + cron/queue drain + quiet interval

> **Task ID:** D06-03
> **Sprint:** [Sprint 29 — Cutover](./SPRINT.md)
> **Agent:** `devops-engineer`
> **Estimate:** 150 min
> **Type:** FEATURE
> **Priority:** P0 · **Effort:** L
> **Proposed By:** `devops-engineer`
> **TDD_MODE:** `red_first` · **RED_GREEN_REQUIRED:** yes
> Status: Backlog

**Capabilities:** CAP-CUT-01
**PRD refs:** UC-SYNC-03, T-SYNC-009, UC-SYNC-04

## Specification

**Objective.** Durably fence every Convex mutation/action/httpAction via the pinned HOLO_MIGRATION_READ_ONLY env-var contract, capture a real pre-freeze article baseline, drain crons, and prove a quiet interval — UC-SYNC-03 AC-2 / T-SYNC-009.

**Success state.** `holo cutover:capture-article-baseline` persists a real sha256 baseline; `holo cutover:freeze` sets HOLO_MIGRATION_READ_ONLY=1 durably and refuses without a baseline; a subsequent write to any wrapped surface throws `migration_read_only: ...` with zero rows added; `holo cutover:quiet-check` reports acceptedWriteCount=0 with rejectedWriteCount>0; `holo verify:convex-fence-coverage` proves zero unfenced imports remain.

## Critical Constraints

- **MUST** — MUST implement the fence as the SINGLE pinned contract from D06-01: the env var HOLO_MIGRATION_READ_ONLY=='1', read via `npx convex env get/set` at the deployment level (durable across restarts) — this is the ONLY fencing mechanism; do not invent a second one
- **MUST** — MUST throw `new Error('migration_read_only: <reason>')` (lowercase prefix) from every wrapped mutation/action/httpAction when the env var is set, mirroring the ALLOW_CLEAR_ALL precedent at convex/documents/mutations.ts:209-217 exactly
- **MUST** — MUST fence mutation/action/httpAction entry points via one shared convex-helpers wrapper, applied repo-wide via a mechanical codemod (import swap only), never hand-editing handler bodies
- **MUST** — MUST capture a real pre-freeze article baseline (sha256 + byteLength of the live Convex-served /article/:shareToken route) BEFORE engaging the fence, since holo article:compat (holo.ts:5311) is a static stub with no real comparison and cannot serve as the later parity oracle
- **MUST** — MUST record a lightweight audit row (accepted vs rejected) for every write attempt after fence engagement so quiet-check has a concrete, queryable oracle — the audit table is observability only; the env var remains the sole enforcement mechanism
- **NEVER** — NEVER delete any convex/ module, dependency, or the Convex cloud deployment — Sprint 31's job
- **NEVER** — NEVER let cutover:freeze proceed if no article baseline has been captured — it MUST exit non-zero with error.code=='ARTICLE_BASELINE_MISSING'
- **NEVER** — NEVER treat 'crons stopped running' as proof of drain — must show a positive rejected-write audit trail
- **STRICTLY** — STRICTLY the env-var check is the FIRST statement inside every wrapped handler
- **STRICTLY** — STRICTLY this remains config/flag-driven and reversible — Sprint 30 exercises un-fencing it as the rollback drill, this task does not

## Acceptance Criteria

#### AC-1 (PRIMARY)

- **GIVEN** convex_dev_deployment_writes_enabled
- **WHEN** operator runs cutover:freeze after a baseline capture
- **THEN** HOLO_MIGRATION_READ_ONLY becomes '1' durably and documents.create throws migration_read_only: with zero row-count change

`test_tier: integration` · `service: convex` · `flow_ref: T-SYNC-009`
#### AC-2

- **GIVEN** convex_dev_deployment_frozen
- **WHEN** operator sweeps mutation/action/httpAction/upload
- **THEN** all 4 reject with the migration_read_only: prefix

`test_tier: integration` · `service: convex` · `flow_ref: T-SYNC-009`
#### AC-3

- **GIVEN** convex_dev_deployment_frozen
- **WHEN** operator runs cutover:quiet-check after real crons fire
- **THEN** acceptedWriteCount is 0 and rejectedWriteCount is nonzero

`test_tier: integration` · `service: convex` · `flow_ref: T-SYNC-009`
#### AC-4

- **GIVEN** the convex/ tree post-codemod
- **WHEN** operator runs verify:convex-fence-coverage
- **THEN** zero unfenced imports remain with a nonzero files_scanned count

`test_tier: integration` · `service: convex` · `flow_ref: T-SYNC-009`
#### AC-5

- **GIVEN** pre_freeze_live_deployment
- **WHEN** operator runs cutover:capture-article-baseline before freeze
- **THEN** a real sha256/byteLength baseline persists and freeze refuses without it

`test_tier: integration` · `service: convex` · `flow_ref: T-SYNC-009`

## Test Criteria

| ID | Boolean statement | Maps to | Verify |
|----|-------------------|---------|--------|
| TC-1 | HOLO_MIGRATION_READ_ONLY equals '1' after cutover:freeze runs | AC-1 | `npx convex env get HOLO_MIGRATION_READ_ONLY` |
| TC-2 | documents.create throws an Error whose message starts with migration_read_only: while frozen | AC-1 | `call documents.create; catch Error; check message prefix` |
| TC-3 | all 4 sampled surfaces reject with the migration_read_only: prefix while frozen | AC-2 | `invoke sampled mutation, action, http.ts route, upload action while frozen` |
| TC-4 | acceptedWriteCount equals zero after the quiet-check observation window | AC-3 | `holo cutover:quiet-check --window-seconds 30 --json; jq .acceptedWriteCount` |
| TC-5 | rejectedWriteCount is greater than zero after the quiet-check observation window | AC-3 | `jq .rejectedWriteCount` |
| TC-6 | verify:convex-fence-coverage reports zero unfenced import matches | AC-4 | `holo verify:convex-fence-coverage --json; jq .matches` |
| TC-7 | article-baseline.json contains a 64-hex sha256 and a nonzero byteLength | AC-5 | `jq '.sha256, .byteLength' article-baseline.json` |
| TC-8 | cutover:freeze exits non-zero with error.code ARTICLE_BASELINE_MISSING when the baseline file is absent | AC-5 | `rm article-baseline.json; holo cutover:freeze; echo $?` |

## Reading List

- `convex/documents/mutations.ts` — lines 207-224 — ALLOW_CLEAR_ALL env-gate precedent (process.env check then throw new Error(...)) — the exact pattern the migration_read_only wrapper mirrors
- `services/platform/src/mcp/gateway.ts` — lines 36-52 — existing error-prefix parsing (uppercase code extraction before ':') that MCP-side fencing in D06-05 relies on unchanged
- `services/platform/src/cli/holo.ts` — lines 5311-5330 — article:compat — confirmed STATIC payload with no real fetch/compare; this is why D06-03 must capture a real baseline instead
- `services/platform/src/http/middleware/scoped-key.ts` — lines 1-40 — single-chokepoint Hono middleware pattern as design precedent for a uniformly-checked gate
- `convex/http.ts` — lines 1-20 — httpAction import + http.route() registration pattern the codemod must rewrite
- `.spec/prds/mk6-migration/08-uc-sync.md` — lines 56-63 — UC-SYNC-04 rollback boundary: fence must stay config-reversible

## Guardrails

**WRITE-ALLOWED**

- `convex/lib/migrationFence.ts` — NEW
- `convex/schema.ts` — MODIFY — add migrationFenceAudit table only (observability, not the fence mechanism)
- `convex/**/*.ts` — MODIFY — codemod-only mechanical import rewrite; NEVER hand-edit handler bodies
- `scripts/cutover/apply-convex-fence.ts` — NEW
- `services/platform/src/cutover/convex-fence-client.ts` — NEW
- `services/platform/src/cutover/article-baseline.ts` — NEW
- `services/platform/src/cli/holo.ts` — MODIFY — add cutover:freeze, cutover:quiet-check, cutover:capture-article-baseline, verify:convex-fence-coverage cases
- `services/platform/tests/integration/sprint29-convex-fence.test.ts` — NEW

**WRITE-PROHIBITED**

- `convex/_generated/**` — generated, never hand-edited
- `convex/ (deletion of any module/dependency/deployment)` — Sprint 31 owns decommission
- `services/platform/src/http/hono-app.ts` — new-backend fencing is D06-05's scope
- `services/platform/src/mcp/**` — MCP-side fencing is D06-05's scope
- `services/platform/src/queue/**` — queue fencing on the new backend is D06-05's scope

## Design / Code Pattern

**Pattern.** A convex-helpers customFunction wrapper checking process.env.HOLO_MIGRATION_READ_ONLY==='1' as the first statement, applied repo-wide via a mechanical import-swap codemod, mirroring the ALLOW_CLEAR_ALL env-gate precedent already used in this codebase

**Pattern source.** `convex/documents/mutations.ts:207-224`

**Anti-pattern.** Inventing a second fencing mechanism (e.g. a Postgres/Convex table as the gate) instead of the pinned single env var; hand-editing individual mutation bodies; treating cron silence as proof of drain instead of a positive rejected-write audit trail; relying on the static article:compat stub as a parity oracle

**References**

- convex/documents/mutations.ts:207-224
- services/platform/src/http/middleware/scoped-key.ts

## Verification Gates

- `pnpm biome check --no-errors-on-unmatched --diagnostic-level=error convex/lib/migrationFence.ts scripts/cutover/apply-convex-fence.ts services/platform/src/cutover/convex-fence-client.ts services/platform/src/cutover/article-baseline.ts services/platform/src/cli/holo.ts` → exit 0
- `pnpm tsgo --noEmit` → exit 0
- `PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint29-convex-fence.test.ts` → exit 0
- `pnpm test:lanes` → exit 0
- `bun services/platform/src/cli/holo.ts verify:convex-fence-coverage --json` → matches.length == 0

## Capability Chain

- **Provides:** convex/lib/migrationFence.ts (fencedMutation/fencedAction/fencedHttpAction, HOLO_MIGRATION_READ_ONLY env-var gate); holo cutover:freeze; holo cutover:quiet-check; holo cutover:capture-article-baseline; holo verify:convex-fence-coverage
- **Consumes:** convex/_generated/server; convex/crons.ts + convex/taskCrons.ts; convex/schema.ts; convex/documents/mutations.ts ALLOW_CLEAR_ALL env-gate precedent (lines 209-217)
- **Boundary contracts:** CAP-CUT-01 hop: 'durable freeze + drain' precedes ETL (CAP-MIG-01); CAP-CUT-01 failure mode: Sev-1 re-point via config — the fence MUST stay a single reversible flag

## Agent Assignment

`devops-engineer` — Fencing the live Convex production deployment, draining its crons, and proving a quiet interval is deployment/runtime-cutover infrastructure work devops-engineer owns per CAP-CUT-01.

## Dependencies

- **Depends on:** D06-01, D06-02
- **Blocks:** D06-04, D06-05

## Coding Standards

- RULES.md
- biome.json

## Notes

Expanded by `devops-engineer` from handoff `s29-devops.json`. Fakeability audit: `validate_scenario.py` reports **0 CRITICAL** across every behavioral AC (task-level `fixtures` resolve each `start_ref`).

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
 "version": "1",
 "task_id": "D06-03",
 "tdd_mode": "red_first",
 "verification_policy": {
  "requires_tests": true,
  "requires_red_evidence": true,
  "requires_seeded_evidence": true
 },
 "fixtures": {
  "convex_dev_deployment_writes_enabled": {
   "description": "Real Convex dev deployment reachable, HOLO_MIGRATION_READ_ONLY unset or '0'; a baseline mutation succeeds and inserts a real row.",
   "seed_method": "public_api",
   "records": [
    "npx convex env get HOLO_MIGRATION_READ_ONLY returns '' or '0'",
    "documents.create returns a new _id and documents row count increases by 1 (e.g. from 12 to 13)"
   ]
  },
  "pre_freeze_live_deployment": {
   "description": "Convex deployment still serving reads/writes with at least one document marked isPublic=true and a real shareToken, before the fence is engaged.",
   "seed_method": "public_api",
   "records": [
    "a sampled document has isPublic=true and a non-null shareToken",
    "the live Convex-served /article/:shareToken route returns HTTP 200 with real HTML bytes (length > 0)"
   ]
  },
  "convex_dev_deployment_frozen": {
   "description": "Fence engaged via holo cutover:freeze against the real deployment after a baseline capture; HOLO_MIGRATION_READ_ONLY='1'.",
   "seed_method": "cli",
   "records": [
    "holo cutover:capture-article-baseline --token <token> exits 0 first",
    "holo cutover:freeze --reason 'sprint-29 cutover drill' exits 0",
    "npx convex env get HOLO_MIGRATION_READ_ONLY returns '1'"
   ]
  }
 },
 "requirements": [
  {
   "id": "AC-1",
   "type": "acceptance_criterion",
   "primary": true,
   "flow_ref": "T-SYNC-009",
   "description": "GIVEN writes enabled WHEN operator runs cutover:freeze THEN HOLO_MIGRATION_READ_ONLY becomes 1 durably and a real mutation is rejected with zero side effects",
   "verify": "holo cutover:capture-article-baseline --token <t>; holo cutover:freeze --reason drill; call documents.create; expect message prefix migration_read_only:; documents count unchanged",
   "maps_to_ac": null,
   "test_tier": "integration",
   "scenario": {
    "tier": "visible",
    "test_tier": "integration",
    "verification_service": "convex",
    "topology": "single-node",
    "negative_control": {
     "would_fail_if": [
      "the env var flips but the wrapped mutation still executes its handler body and inserts a row (a stub fence check)",
      "the env-var check runs after the handler body instead of before it (mock ordering)"
     ]
    },
    "evidence": {
     "artifact_type": "api_response",
     "required_capture": true
    },
    "cases": [
     {
      "start_ref": "convex_dev_deployment_writes_enabled",
      "action": {
       "actor": "operator",
       "steps": [
        "run holo cutover:capture-article-baseline --token <sampled-token>",
        "run holo cutover:freeze --reason drill",
        "call documents.create against the real deployment",
        "re-query the documents table row count"
       ]
      },
      "end_state": {
       "must_observe": [
        "npx convex env get HOLO_MIGRATION_READ_ONLY returns the literal string '1'",
        "documents.create throws an Error whose message starts with the literal 'migration_read_only:'",
        "documents row count identical before/after the attempt (e.g. 12 before, 12 after)"
       ],
       "must_not_observe": [
        "HOLO_MIGRATION_READ_ONLY returns '0' or empty after freeze",
        "documents.create returns a new _id",
        "documents row count increases by 1 (was 12, now 13)"
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
   "flow_ref": "T-SYNC-009",
   "description": "GIVEN fence engaged WHEN a mutation/action/httpAction/upload sweep runs THEN all four reject uniformly",
   "verify": "invoke one mutation, one action, the http.ts route, and an upload action while frozen; expect 4/4 migration_read_only: prefix",
   "maps_to_ac": null,
   "test_tier": "integration",
   "scenario": {
    "tier": "visible",
    "test_tier": "integration",
    "verification_service": "convex",
    "topology": "single-node",
    "negative_control": {
     "would_fail_if": [
      "the codemod fenced mutations but missed actions/httpAction/uploads (a static/incomplete rewrite)",
      "one of the four surfaces still succeeds (mock handler bypasses the check)"
     ]
    },
    "evidence": {
     "artifact_type": "api_response",
     "required_capture": true
    },
    "cases": [
     {
      "start_ref": "convex_dev_deployment_frozen",
      "action": {
       "actor": "operator",
       "steps": [
        "call the sampled mutation",
        "call the sampled action",
        "POST to the http.ts webhook route",
        "call the upload-intent action"
       ]
      },
      "end_state": {
       "must_observe": [
        "4 of 4 sampled surfaces throw/return an error message starting with the literal 'migration_read_only:'",
        "the 4 targeted table row counts are unchanged as equal pairs (e.g. 12==12, 3==3, 5==5, 2==2)"
       ],
       "must_not_observe": [
        "fewer than 4 of 4 surfaces reject (0 additional successes tolerated)",
        "any targeted table row count increases (e.g. 12 -> 13)"
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
   "flow_ref": "T-SYNC-009",
   "description": "GIVEN fence engaged and crons firing WHEN quiet-check runs THEN acceptedWriteCount is 0 and rejectedWriteCount is nonzero",
   "verify": "holo cutover:quiet-check --window-seconds 30 --json; jq .acceptedWriteCount == 0; jq .rejectedWriteCount > 0",
   "maps_to_ac": null,
   "test_tier": "integration",
   "scenario": {
    "tier": "visible",
    "test_tier": "integration",
    "verification_service": "convex",
    "topology": "single-node",
    "negative_control": {
     "would_fail_if": [
      "quiet-check reports acceptedWriteCount==0 with rejectedWriteCount also 0 (an empty/degenerate idle window, not proof of blocking)",
      "acceptedWriteCount is nonzero (a stub check that never actually blocks a write)"
     ]
    },
    "evidence": {
     "artifact_type": "db_query",
     "required_capture": true
    },
    "cases": [
     {
      "start_ref": "convex_dev_deployment_frozen",
      "action": {
       "actor": "operator",
       "steps": [
        "wait for at least one real Convex cron to fire within the window",
        "run holo cutover:quiet-check --window-seconds 30 --json"
       ]
      },
      "end_state": {
       "must_observe": [
        "acceptedWriteCount equals the literal 0",
        "rejectedWriteCount is greater than 0 (e.g. 3)"
       ],
       "must_not_observe": [
        "acceptedWriteCount greater than 0",
        "rejectedWriteCount equals 0 (empty/degenerate idle window)"
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
   "flow_ref": "T-SYNC-009",
   "description": "GIVEN the codemod applied WHEN verify:convex-fence-coverage runs THEN zero unfenced imports remain",
   "verify": "holo verify:convex-fence-coverage --json; jq .matches | length == 0; jq .files_scanned > 0",
   "maps_to_ac": null,
   "test_tier": "integration",
   "scenario": {
    "tier": "visible",
    "test_tier": "integration",
    "verification_service": "convex",
    "topology": "single-node",
    "negative_control": {
     "would_fail_if": [
      "the scan reports files_scanned==0 (a static/stub scan that never walks the filesystem)",
      "a raw import is missed and the scan still reports 0 matches (empty result masking a real miss)"
     ]
    },
    "evidence": {
     "artifact_type": "stdout",
     "required_capture": true
    },
    "cases": [
     {
      "start_ref": "convex_dev_deployment_frozen",
      "action": {
       "actor": "operator",
       "steps": [
        "run holo verify:convex-fence-coverage --json"
       ]
      },
      "end_state": {
       "must_observe": [
        "matches.length equals the literal 0",
        "files_scanned is greater than 0 (e.g. 41)"
       ],
       "must_not_observe": [
        "matches.length greater than 0",
        "files_scanned equals 0 (empty scan)"
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
   "flow_ref": "T-SYNC-009",
   "description": "GIVEN a pre-freeze live deployment WHEN operator captures the article baseline before freeze THEN a real baseline persists and freeze fail-closes without one",
   "verify": "holo cutover:capture-article-baseline --token <t>; jq '.sha256,.byteLength' article-baseline.json; rm article-baseline.json; holo cutover:freeze; echo $?",
   "maps_to_ac": null,
   "test_tier": "integration",
   "scenario": {
    "tier": "visible",
    "test_tier": "integration",
    "verification_service": "convex",
    "topology": "single-node",
    "negative_control": {
     "would_fail_if": [
      "the baseline is synthesized/hardcoded instead of fetched from the live route",
      "cutover:freeze proceeds (exit 0) with no baseline file present"
     ]
    },
    "evidence": {
     "artifact_type": "file_artifact",
     "required_capture": true
    },
    "cases": [
     {
      "start_ref": "pre_freeze_live_deployment",
      "action": {
       "actor": "operator",
       "steps": [
        "run holo cutover:capture-article-baseline --token <sampled-token>",
        "inspect article-baseline.json",
        "delete article-baseline.json",
        "run holo cutover:freeze --reason drill"
       ]
      },
      "end_state": {
       "must_observe": [
        "article-baseline.json sha256 matches ^[0-9a-f]{64}$",
        "byteLength is greater than 0 (e.g. 4821)",
        "the freeze attempt without a baseline exits with a non-zero code and error.code equal to the literal 'ARTICLE_BASELINE_MISSING'"
       ],
       "must_not_observe": [
        "sha256 is an empty string",
        "byteLength equals 0",
        "the baseline-less freeze exits 0 (0 = success despite missing baseline)"
       ]
      }
     }
    ]
   }
  },
  {
   "id": "TC-1",
   "type": "test_criterion",
   "description": "HOLO_MIGRATION_READ_ONLY equals '1' after freeze",
   "maps_to_ac": "AC-1",
   "verify": "npx convex env get HOLO_MIGRATION_READ_ONLY"
  },
  {
   "id": "TC-2",
   "type": "test_criterion",
   "description": "documents.create throws migration_read_only: while frozen",
   "maps_to_ac": "AC-1",
   "verify": "call documents.create; catch Error; check message prefix"
  },
  {
   "id": "TC-3",
   "type": "test_criterion",
   "description": "all 4 sampled surfaces reject while frozen",
   "maps_to_ac": "AC-2",
   "verify": "invoke mutation/action/httpAction/upload while frozen"
  },
  {
   "id": "TC-4",
   "type": "test_criterion",
   "description": "acceptedWriteCount is zero after quiet-check window",
   "maps_to_ac": "AC-3",
   "verify": "jq .acceptedWriteCount == 0"
  },
  {
   "id": "TC-5",
   "type": "test_criterion",
   "description": "rejectedWriteCount is greater than zero after quiet-check window",
   "maps_to_ac": "AC-3",
   "verify": "jq .rejectedWriteCount > 0"
  },
  {
   "id": "TC-6",
   "type": "test_criterion",
   "description": "fence coverage scan reports zero unfenced matches",
   "maps_to_ac": "AC-4",
   "verify": "jq .matches | length == 0"
  },
  {
   "id": "TC-7",
   "type": "test_criterion",
   "description": "article baseline has a real sha256 and byteLength",
   "maps_to_ac": "AC-5",
   "verify": "jq '.sha256,.byteLength' article-baseline.json"
  },
  {
   "id": "TC-8",
   "type": "test_criterion",
   "description": "freeze without a baseline exits non-zero with ARTICLE_BASELINE_MISSING",
   "maps_to_ac": "AC-5",
   "verify": "rm article-baseline.json; holo cutover:freeze; echo $?"
  }
 ]
}
-->

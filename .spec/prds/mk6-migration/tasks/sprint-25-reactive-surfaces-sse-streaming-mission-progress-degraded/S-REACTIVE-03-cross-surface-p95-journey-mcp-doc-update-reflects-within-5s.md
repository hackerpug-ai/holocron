# S-REACTIVE-03: Cross-surface p95 journey — MCP doc update reflects on app within 5s
> Status: ✅ Completed
> Commit: 58d8129c3002cff27da4c8e5993b70bbccfb7022
> Reviewer: dual-lens
> Completed: 2026-07-25T15:17:37Z

- **Sprint:** [Sprint 25: Reactive Surfaces — SSE Streaming, Mission Progress, Degraded](./SPRINT.md)
- **Task Type:** `FEATURE`
- **Status:** `Backlog`
- **Priority:** `P0`
- **Effort:** `L`
- **Estimate:** `150 minutes`
- **Agent:** `red-test-generator`
- **Reviewer:** `react-native-ui-reviewer`
- **Proposed By:** `react-native-ui-planner`
- **TDD Mode:** `red_first`
- **RED/GREEN Required:** `yes`

## Outcome
A Maestro e2e journey + timing helpers proving that a document update made via the MCP gateway reflects on the app at p95 within the declared 5s sync SLO, through real Zero reactive propagation — no mocked MCP call, no single-sample timing.

## Background
This is Sprint 25 (UC-SYNC-02; T-SYNC-007). Sprint 24 rewired the MCP tools to write to the Postgres `documents` table and the app to read it via Zero. UC-SYNC-02 declares that a change made on one surface (e.g. the MCP gateway updates a document) reflects on the app at p95 within 5 seconds on a healthy tailnet without a manual refresh. This task authors the e2e journey that proves that SLO by measuring the actual wall-clock time from a **real** MCP `updateDocument` call to the app's Zero-driven reflection, with p95 computed over `>=5` iterations. It is a red-test-generator task (it authors the Maestro flow + timing helpers); the surfaces it exercises (S-REACTIVE-01/02/04) must exist first. The "real MCP call" and "no view-injection seeding" guarantees are encoded directly as AC-1's negative controls (stub/mock), so the journey is non-fakeable without redundant grep ACs.

## Specification
- **Objective:** Author a Maestro e2e journey proving an MCP-gateway document update reflects on the app within p95 ≤ 5s via Zero, with timing helpers that compute p95 over `>=5` iterations.
- **Success state:** Running the journey against seeded Postgres + real MCP gateway + Zero shows the app reflecting the new title within `<=5000ms` at p95 over `>=5` iterations, with the MCP call real (not mocked) and seeding via `holo seed:e2e --reset` (not view-injection).

## Critical Constraints
### MUST
- MUST call the **real** MCP gateway `updateDocument` tool — never a mocked/stubbed call
- MUST seed the document via `holo seed:e2e --reset` (real Postgres row) — never view-injection
- MUST measure actual wall-clock time from the MCP write to the app reflection
- MUST compute p95 over `>=5` iterations — never a single sample
- MUST assert the p95 against the `<=5000ms` SLO
### NEVER
- NEVER mock the MCP gateway tool call
- NEVER hardcode the document title/content or the SLO threshold to pass
- NEVER use a single-sample timing
- NEVER test against an in-memory / view-injected document store
### STRICTLY
- STRICTLY the update path is real: MCP gateway → Postgres → Zero push → app reflection
- STRICTLY the PRIMARY AC is `test_tier: e2e`, `tier: visible`, bound to UC-SYNC-02 / T-SYNC-007
- STRICTLY the journey runs on a named iOS Simulator after `holo seed:e2e --reset`

## Capability Chain
- **Touches:** CAP-SYNC-01
- **Provides:** `cross-surface-p95-e2e-journey`, `sync-timing-helpers`
- **Consumes:** `mcp-gateway-updateDocument` (Sprint 24), `zero-reactive-documents-sync` (Sprint 04/24)
- **Boundary contracts:** the MCP gateway `updateDocument` writes the Postgres `documents` row (Sprint 24); the `documents` table is reactive over `zero_pub`; p95 ≤ 5s SLO from UC-SYNC-02

## Acceptance Criteria
### AC-1: MCP doc update reflects on the app within the 5s sync SLO [PRIMARY]
> **[mastra-reviewer PASS — verified real end-to-end]** MCP gateway path is genuinely real: `mcp-sync-server.py:85-128` POSTs a real JSON-RPC `tools/call` to `${PLATFORM}/mcp`; routes to `executor.ts:777-786` `case 'update_document'` → real `UPDATE documents SET title`; `documents` is a full-table zero_pub member (zero-pub.ts:24, migration 0002:54) with REPLICA IDENTITY DEFAULT (0002:13) so the write WAL-replicates to the RN client. p95 computed nearest-rank over >=5 samples (mcp-sync-server.py:55-62,208-236). Strongest AC in the sprint.
- **GIVEN:** a document exists in Postgres seeded by `holo seed:e2e --reset` and the app document list is open
- **WHEN:** the MCP gateway calls `updateDocument` to change the title
- **THEN:** the updated title appears on the app within 5s via Zero reactive sync
- **Test tier:** `e2e` · **Verification service:** `MCP gateway+Zero+seeded Postgres` · **Flow ref:** `UC-SYNC-02`
- **Verify:** `holo seed:e2e --reset && maestro test .maestro/reactive/cross-surface-sync-slo.yml`
- **Scenario:** tier `visible` · test_tier `e2e` · topology `single-node`
  - **Negative control — would fail if:** stub — the app shows a hardcoded updated title with no MCP call; mock — the MCP tool is mocked to skip the actual Postgres write; disconnect — Zero sync disabled, the app never reflects the update
  - **Evidence:** artifact `screenshot`, required_capture=True
  - **Case 1** — start_ref `seeded-document-for-sync`: actor `mcp_gateway`; steps: call `updateDocument` with title `'Updated via MCP'`, record the write timestamp `t0`, the flow observes the app document list → MUST observe the title changes to `Updated via MCP` on the app, the change occurs within `<=5000ms` of `t0`, the `documents` row has title `Updated via MCP`, a Zero `useQuery` returns the row with the new title; MUST NOT observe the title unchanged after `>5000ms` (`0` changes), a manual refresh required (`>0`), or the app showing the stale old title with `0` reactive update

### AC-2: p95 timing measured over >=5 iterations (not a single sample)
- **GIVEN:** the cross-surface sync journey runs multiple iterations for p95 confidence
- **WHEN:** the verifier inspects the timing helpers
- **THEN:** the helpers compute p95 over `>=5` iterations and assert it against `<=5000ms`
- **Test tier:** `integration` · **Verification service:** `code review` · **Flow ref:** `UC-SYNC-02`
- **Verify:** `grep -rnE 'p95|percentile|for.*[56]' .maestro/reactive/ scripts/ | head`
- **Scenario:** tier `visible` · test_tier `integration` · topology `single-node`
  - **Negative control — would fail if:** stub — a single sample only; mock — p95 hardcoded to a passing value; disconnect — no p95 calculation
  - **Evidence:** artifact `file_artifact`, required_capture=True
  - **Case 1** — start_ref `seeded-document-for-sync`: actor `cli_user`; steps: grep the helpers for the p95/loop implementation → MUST observe the helpers implement a p95 calculation over `>=5` iterations, a `for`/`repeat` loop is present (`>=5` runs), the threshold is asserted against `<=5000ms`; MUST NOT observe a single sample only (`1` run), p95 not calculated (`0` percentile logic), or the threshold hardcoded to pass (`0` real assertion)

## Test Criteria
| ID | Statement | Maps to | Verify |
|---|---|---|---|
| TC-1 | The MCP doc update reflects on the app within the 5s sync SLO | AC-1 | `maestro test .maestro/reactive/cross-surface-sync-slo.yml` |
| TC-2 | The journey computes p95 over `>=5` iterations and asserts `<=5000ms` | AC-2 | `grep -rnE 'p95|percentile' .maestro/reactive/ scripts/` |
| TC-3 | The MCP call is real (no mock/stub patterns in the flow) | AC-1 | `grep -rnE 'mockMCP|stubUpdate|fakeDocument' .maestro/reactive/cross-surface-sync-slo.yml` → `0` matches |
| TC-4 | Type check clean | AC-1 | `pnpm tsc --noEmit` |
| TC-5 | Lint pass | AC-1 | `pnpm lint` |
| TC-6 | Scenario fakeability | AC-1 | `python3 ~/Projects/brain/tools/validate-scenario/validate_scenario.py .validate-payloads/S-REACTIVE-03.json` |

## Reading List
- `.spec/prds/mk6-migration/08-uc-sync.md` — UC-SYNC-02 (cross-surface SLO)
- `.spec/prds/mk6-migration/11-e2e-testing-criteria.md` — T-SYNC-007
- `app/zero/schema.ts` — `documents` table; `app/zero/queries.ts` — document queries (Zero reflection target)
- `services/platform/src/http/` — the MCP gateway `updateDocument` tool surface (Sprint 24)
- `RULES.md` — Maestro e2e conventions + named iOS Simulator usage
- existing `.maestro/` flows for the journey pattern

## Guardrails
**Write allowed:**
- `.maestro/reactive/cross-surface-sync-slo.yml (NEW)`
- `.maestro/reactive/helpers/ (NEW)` — timing helpers
- `scripts/verify-sync-slo.sh (NEW)` — p95 driver, if needed
**Write prohibited:**
- Any mocked MCP tool call in the journey
- Hardcoded document titles/content or a hardcoded SLO threshold
- View-injection seeding; single-sample timing
- Modifying the app implementation or the MCP gateway (this task authors the journey + helpers only)

## Design
**References:** `./SPRINT.md`; `.spec/prds/mk6-migration/08-uc-sync.md`; `.spec/prds/mk6-migration/11-e2e-testing-criteria.md`
**Interaction notes:**
- Journey seeds the document via `holo seed:e2e --reset` (real Postgres row); the MCP gateway calls the real `updateDocument` tool and records `t0`; the app document list observes the Zero-reactive change; helpers measure the wall-clock delta and assert p95 ≤ 5000ms over `>=5` iterations.
**Pattern:** Maestro e2e flow: real MCP `updateDocument` → `t0` capture → Zero-sync observation → timing helper → p95 calc over `>=5` runs.
**Pattern source:** UC-SYNC-02; T-SYNC-007.
**Anti-pattern:** mocked MCP calls; view-injection seeding; single-sample timing; a hardcoded SLO threshold.

## Verification Gates
- **Cross-surface sync meets the 5s SLO (PRIMARY)** — `holo seed:e2e --reset && maestro test .maestro/reactive/cross-surface-sync-slo.yml` → Exit 0
- **p95 computed over >=5 iterations** — `grep -rnE 'p95|percentile' .maestro/reactive/ scripts/` → Exit 0
- **Real MCP call (no mock/stub)** — `grep -rnE 'mockMCP|stubUpdate|fakeDocument' .maestro/reactive/` → `0` matches
- **Type check clean** — `pnpm tsc --noEmit` → Exit 0
- **Lint pass** — `pnpm lint` → Exit 0
- **Scenario fakeability** — `python3 ~/Projects/brain/tools/validate-scenario/validate_scenario.py .validate-payloads/S-REACTIVE-03.json` → Exit 0

## Agent Assignment
- **Agent:** `red-test-generator` — owns Maestro e2e journey authoring + timing helpers
- **Reviewer:** `react-native-ui-reviewer` — validates the journey exercises a real MCP→Postgres→Zero path

## Evidence Gates
- RED-against-start for the behavioral AC (tdd_mode `red_first`): `True`
- Real-services (seeded Postgres + real MCP gateway + Zero, Maestro e2e) proof required: `True`
- Fakeability: `validate_scenario.py` exit 0 on every behavioral AC (independently re-verified)

## Review Criteria
- The journey calls the real MCP `updateDocument` (no mocks/stubs); seeds via `holo seed:e2e --reset` (no view-injection)
- p95 is computed over `>=5` iterations and asserted against `<=5000ms` (not a single sample, not a hardcoded pass)
- The update path is real: MCP → Postgres → Zero → app

## Dependencies
- **Depends on:** S-REACTIVE-01, S-REACTIVE-02, S-REACTIVE-04 (the reactive surfaces this journey exercises)
- **Blocks:** S-REACTIVE-05

## Coding Standards
- `RULES.md` — Maestro e2e conventions, named iOS Simulator
- `brain/docs/kanban/TASK-TEMPLATE.md`; `brain/docs/TDD-METHODOLOGY.md`

## Notes
- Generated by /kb-sprint-tasks-plan on 2026-07-24. Proposed by `react-native-ui-planner`; consolidated by the orchestrator (collapsed five redundant grep-ACs into two non-fakeable ACs — the real-MCP-call / no-view-injection guarantees are encoded as AC-1's negative controls; p95-over-iterations as AC-2; stable AC-N/TC-N IDs; scenario hardening). `validate_scenario.py` exit 0 on this task's contract.
- PRD refs: UC-SYNC-02, T-SYNC-007.

<!-- REQUIREMENT-CONTRACT v1
-->
<!--
{
  "version": "1",
  "task_id": "S-REACTIVE-03",
  "tdd_mode": "red_first",
  "verification_policy": { "requires_tests": true, "requires_red_evidence": true, "requires_seeded_evidence": true },
  "fixtures": {
    "seeded-document-for-sync": {
      "description": "A document seeded by holo seed:e2e --reset in Postgres, reactive over Zero, that the MCP gateway updateDocument tool mutates",
      "seed_method": "public_api",
      "records": [
        "1 document row exists in the documents table after holo seed:e2e --reset",
        "the documents table is reactive over zero_pub and surfaced by a Zero useQuery",
        "the MCP gateway updateDocument tool writes to this same documents row"
      ]
    }
  },
  "requirements": [
    {"id":"AC-1","type":"acceptance_criterion","primary":true,"description":"GIVEN a document exists in Postgres seeded by holo seed:e2e --reset and the app document list is open WHEN the MCP gateway calls updateDocument to change the title THEN the updated title appears on the app within 5 seconds via Zero reactive sync","verify":"holo seed:e2e --reset && maestro test .maestro/reactive/cross-surface-sync-slo.yml","maps_to_ac":null,"scenario":{"tier":"visible","test_tier":"e2e","verification_service":"MCP gateway+Zero+seeded Postgres","topology":"single-node","negative_control":{"would_fail_if":["stub — app shows a hardcoded updated title with no MCP call","mock — MCP tool mocked to skip the actual Postgres write","disconnect — Zero sync disabled, app never reflects the update"]},"evidence":{"artifact_type":"screenshot","required_capture":true},"cases":[{"start_ref":"seeded-document-for-sync","action":{"actor":"mcp_gateway","steps":["call the updateDocument tool with new title 'Updated via MCP'","record the MCP write timestamp (t0)","the Maestro flow observes the app document list"]},"end_state":{"must_observe":["the document title changes to `Updated via MCP` on the app","the change occurs within `<=5000ms` of the MCP write timestamp","the documents table row in Postgres has title `Updated via MCP`","a Zero useQuery returns the row with title `Updated via MCP`"],"must_not_observe":["the title unchanged after `>5000ms` (`0` changes reflected)","a manual refresh required (refresh count `>0`)","the app showing the stale old title with `0` reactive update"]}}]}},
    {"id":"AC-2","type":"acceptance_criterion","primary":false,"description":"GIVEN the cross-surface sync journey runs multiple iterations for p95 confidence WHEN the verifier inspects the timing helpers THEN the helpers compute p95 over >=5 iterations and assert it against <=5000ms","verify":"grep -rnE 'p95|percentile|for.*[56]' .maestro/reactive/ scripts/","maps_to_ac":null,"scenario":{"tier":"visible","test_tier":"integration","verification_service":"code review","topology":"single-node","negative_control":{"would_fail_if":["stub — a single sample only","mock — p95 hardcoded to a passing value","disconnect — no p95 calculation"]},"evidence":{"artifact_type":"file_artifact","required_capture":true},"cases":[{"start_ref":"seeded-document-for-sync","action":{"actor":"cli_user","steps":["grep .maestro/reactive/helpers and scripts for the p95 / loop implementation"]},"end_state":{"must_observe":["the helpers implement a p95 calculation over `>=5` iterations","a `for`/`repeat` loop pattern is present in the journey (`>=5` runs)","the p95 threshold is asserted against `<=5000ms`"],"must_not_observe":["a single sample only (`1` run, no loop)","p95 not calculated (`0` percentile logic)","the threshold hardcoded to pass (`0` real assertion)"]}}]}},
    {"id":"TC-1","type":"test_criterion","description":"The MCP doc update reflects on the app within the 5s sync SLO","verify":"maestro test .maestro/reactive/cross-surface-sync-slo.yml","maps_to_ac":"AC-1"},
    {"id":"TC-2","type":"test_criterion","description":"The journey computes p95 over >=5 iterations and asserts <=5000ms","verify":"grep -rnE 'p95|percentile' .maestro/reactive/ scripts/","maps_to_ac":"AC-2"}
  ]
}
-->

---

## Reviewer Verdict — mcp-reviewer red-team (MCP gateway lens)

**Date:** 2026-07-25 · **Reviewer:** mcp-reviewer · **Verdict:** **APPROVED**

Core question resolved: **YES** — the title update traveled through the real MCP
gateway. The Maestro helper does NOT bypass the gateway.

### AC verdict table

| AC | Result | Evidence |
|----|--------|----------|
| AC-1 MCP doc update reflects on app within 5s [PRIMARY] | **PASS** | Real JSON-RPC `tools/call` `update_document` from `mcp-sync-server.py:85-128` → POST `http://127.0.0.1:4111/mcp` (Streamable HTTP) → `hono-app.ts:1072` mount → `gateway.ts:63` `handleMcpRequest` → `gateway.ts:15` `server.registerTool('update_document', …)` → `executor.ts:777` parameterized UPDATE → `documents` in `zero_pub` (`zero-pub.ts:24`, `0002_zero_pub.sql:13,54`) → Zero push → app. Maestro log `.tmp/S-REACTIVE-05/logs/cross-surface-sync-slo.txt` shows all 5 `assertVisible "Updated via MCP #N"` COMPLETED, EXIT 0. |
| AC-2 p95 over >=5 iterations, asserted <=5000ms | **PASS** | `mcp-sync-server.py:55-62` `_percentile_nearest_rank`; `assert-p95-slo.js:45` enforces `n>=5`; `verify-sync-slo.sh:65-90` independently recomputes p95 from `timings.json`. Measured: `p95_ms=1242.0` over `n=5` samples (`.tmp/S-REACTIVE-03/timings.json`). |
| TC-1 maestro exit 0 | **PASS** | `.tmp/S-REACTIVE-05/logs/cross-surface-sync-slo.txt` ends `EXIT:0`. |
| TC-2 p95 grep hit | **PASS** | `mcp-sync-server.py`, `assert-p95-slo.js`, `verify-sync-slo.sh` all contain p95/percentile logic. |
| TC-3 no mock patterns | **PASS** | `rg 'mockMCP\|stubUpdate\|fakeDocument' .maestro/reactive/` → exit 1 (no matches). |
| TC-4 typecheck clean | **PARTIAL** (pre-existing) | `pnpm typecheck` exit 2 on `services/platform/src/uploads/service.ts` — unrelated to S-REACTIVE-03 surface (no TS in the journey; Python+JS helpers+YAML+bash). Non-blocking. |
| TC-5 lint pass | **PARTIAL** (pre-existing) | `pnpm lint` exit 1 — pre-existing biome debt, unrelated to this task's surface. Non-blocking. |
| TC-6 scenario fakeability | **PASS** | `validate_scenario.py .validate-payloads/S-REACTIVE-03.json` → `ok:true, scenario_count:2, violations:[]`, exit 0. |

### No critical / high findings. Three LOW defense-in-depth notes (non-blocking):

1. `updateDocumentInputSchema.documentId` is `z.string().min(1)` not `z.string().uuid()` (`documents.ts:18`). Malformed UUIDs fail at the Postgres `::uuid` cast (`executor.ts:780`) and are returned as `isError: true` via `gateway.ts:37-51` — fail-closed, but a Zod `.uuid()` would yield a cleaner 400-style envelope.
2. `title` has no max-length cap (`documents.ts:19`). Parameterized, so no SQL injection; only flows into a SQL column and Zero→UI text. No path/shell use in the call path. Defense-in-depth only.
3. `mcp-sync-server.py` is a test-only HTTP shim (Maestro can only emit GET via `http.get`). It performs a real JSON-RPC `tools/call` POST to the production `/mcp` endpoint — NOT a stub, NOT a bypass. Architectural note only.

# REDHAT-FIX-H1 — Unify escape never-cloud: refuse runBudgetedEscape when process or DB degraded; route CLI --escape through the same choke point (fresh red-hat H1: escape dual-path bypass)

## What this does

Close red-hat H1 by making runBudgetedEscape and CLI --escape honor the same never-cloud degraded refuse that resolveModel already applies, so budget-allowed escapes cannot hit Anthropic while the process is degraded.

Provides: escape-never-cloud-single-choke, runBudgetedEscape-degraded-refuse, cli-escape-shares-resolveModel-never-cloud, assertEscapeNotDegraded-helper.

## Why

- MUST Introduce a single shared helper (e.g. assertEscapeNotDegraded / isEscapeBlockedByDegraded) used by both resolveModel(allowEscape) and runBudgetedEscape
- MUST Refuse runBudgetedEscape when isProcessInDegradedMode() is true BEFORE any Anthropic SDK construction or generateText
- MUST Keep CLI infer:call --escape on runBudgetedEscape so the choke covers the operator surface (no resolve-only dual path)
- MUST Extend/add PLATFORM_IT=1 integration tests: process degraded + runBudgetedEscape → zero Anthropic host contact
- MUST Write RED evidence under .tmp/ and/or .spec/evidence/redhat-fix-h1* showing pre-fix dual-path would contact Anthropic or lack guard
- MUST Preserve non-degraded within-budget escape operability (do not break human step-5 path)
- NEVER leave runBudgetedEscape without a degraded check while resolveModel alone enforces never-cloud
- NEVER add a second CLI escape path that bypasses the shared choke
- NEVER prove never-cloud with mocked/stubbed anthropic client or hard-coded anthropicCount:0 without real network_capture
- NEVER implement H4 Postgres durable read as a substitute for this task's process/shared choke — that is REDHAT-FIX-H4
- NEVER use vitest-only controller tests as the sole proof for runBudgetedEscape
- STRICTLY single choke point — resolveModel and runBudgetedEscape call the same helper
- STRICTLY behavioral proof uses PLATFORM_IT=1 + installNetworkCapture / real globalThis.fetch wrap
- STRICTLY must_observe includes anthropicCount:0 or anthropicHits:0 and a concrete degraded refuse code/message literal
- STRICTLY red_first: failing test + red artifact before green implementation
- Grounded in: UC-INFER-01, UC-INFER-04, UC-INFER-05, T-INFER-011, T-INFER-013, T-INFER-014, CAP-INF-01

## How to verify

- `PLATFORM_IT=1 pnpm vitest run tests/integration/service/infer-escape-degraded-choke.test.ts tests/integration/service/infer-red-degraded-no-cloud.test.ts tests/integration/service/infer-degraded-no-cloud.test.ts tests/integration/service/infer-cli-infer-call.test.ts tests/integration/service/infer-escape-telemetry.test.ts` → Exit 0
- `pnpm tsgo --noEmit` → Exit 0
- `pnpm biome check .` → Exit 0

## Scope

Writes: services/platform/src/inference/budget-ledger.ts (MODIFY) · services/platform/src/inference/resolve-model.ts (MODIFY) · services/platform/src/inference/degraded-process-flag.ts (MODIFY — shared helper surface) · services/platform/src/inference/escape-degraded-guard.ts (NEW optional) · services/platform/src/cli/holo.ts (MODIFY only if needed to ensure shared path) · tests/integration/service/infer-escape-degraded-choke.test.ts (NEW) · tests/integration/service/infer-red-degraded-no-cloud.test.ts (MODIFY) · tests/integration/service/infer-degraded-no-cloud.test.ts (MODIFY) · tests/integration/service/infer-cli-infer-call.test.ts (MODIFY) · .tmp/redhat-fix-h1*/** (NEW evidence) · .spec/evidence/redhat-fix-h1* (NEW evidence)

Prohibited: app/** — out of sprint scope · services/platform/src/db/migrations/** — H1 is process/shared choke only; durable DB read is H4 · services/platform/src/compat/** — H3 owns structural wiring · .spec/prds/mk6-migration/tasks/sprint-08-*/SPRINT.md human steps — H2 owns gate honesty rewrite

<details>
<summary>▸ Full agent specification (TASK-TEMPLATE v5.2 — required reading for implementer + reviewer)</summary>

================================================================================
TASK: REDHAT-FIX-H1 — Unify escape never-cloud: refuse runBudgetedEscape when process or DB degraded; route CLI --escape through the same choke point (fresh red-hat H1: escape dual-path bypass)
================================================================================

TASK_TYPE:  FEATURE
STATUS:     Backlog
PRIORITY:   P0
EFFORT:     S  (120 min)
AGENT:      implementer=mastra-implementer | reviewer=mastra-reviewer
PROPOSED-BY: mastra-planner
TDD_MODE:   red_first     RED_GREEN_REQUIRED: yes     (requires_seeded_evidence: true)
CAPABILITY: CAP-INF-01
SPRINT:     [Sprint 8 — Role Router, Local-First and Degraded Modes](./SPRINT.md)

RUNTIME_COMMANDS:
  test:      PLATFORM_IT=1 pnpm vitest run <path>
  typecheck: pnpm tsgo --noEmit
  lint:      pnpm biome check .

--------------------------------------------------------------------------------
OUTCOME
--------------------------------------------------------------------------------
With process degraded active, runBudgetedEscape and holo infer:call --escape fail closed with a degraded/never-cloud error, network capture shows anthropicHits:0, and non-degraded budgeted escape still meters a real Anthropic call when intentionally allowed.

--------------------------------------------------------------------------------
🚫 CRITICAL CONSTRAINTS (Never tier)
--------------------------------------------------------------------------------
- MUST Introduce a single shared helper (e.g. assertEscapeNotDegraded / isEscapeBlockedByDegraded) used by both resolveModel(allowEscape) and runBudgetedEscape
- MUST Refuse runBudgetedEscape when isProcessInDegradedMode() is true BEFORE any Anthropic SDK construction or generateText
- MUST Keep CLI infer:call --escape on runBudgetedEscape so the choke covers the operator surface (no resolve-only dual path)
- MUST Extend/add PLATFORM_IT=1 integration tests: process degraded + runBudgetedEscape → zero Anthropic host contact
- MUST Write RED evidence under .tmp/ and/or .spec/evidence/redhat-fix-h1* showing pre-fix dual-path would contact Anthropic or lack guard
- MUST Preserve non-degraded within-budget escape operability (do not break human step-5 path)
- NEVER leave runBudgetedEscape without a degraded check while resolveModel alone enforces never-cloud
- NEVER add a second CLI escape path that bypasses the shared choke
- NEVER prove never-cloud with mocked/stubbed anthropic client or hard-coded anthropicCount:0 without real network_capture
- NEVER implement H4 Postgres durable read as a substitute for this task's process/shared choke — that is REDHAT-FIX-H4
- NEVER use vitest-only controller tests as the sole proof for runBudgetedEscape
- STRICTLY single choke point — resolveModel and runBudgetedEscape call the same helper
- STRICTLY behavioral proof uses PLATFORM_IT=1 + installNetworkCapture / real globalThis.fetch wrap
- STRICTLY must_observe includes anthropicCount:0 or anthropicHits:0 and a concrete degraded refuse code/message literal
- STRICTLY red_first: failing test + red artifact before green implementation

--------------------------------------------------------------------------------
BOUNDARY CONTRACTS
--------------------------------------------------------------------------------
- Any production path that can contact Anthropic (runBudgetedEscape, resolveModel allowEscape, CLI infer:call --escape) MUST share one never-cloud choke that refuses when degraded
- runBudgetedEscape MUST throw fail-closed degraded error BEFORE createAnthropic/generateText when process degraded (H4 will extend same choke to DB)
- CLI --escape MUST NOT be a second, ungated Anthropic entry point
- Never-cloud proof is network_capture with anthropicCount/anthropicHits=0 against real fetch path — not mocked fetch returning zero

--------------------------------------------------------------------------------
DONE WHEN
--------------------------------------------------------------------------------
- [ ] AC-1: runBudgetedEscape refuses under process degraded (PRIMARY)
- [ ] AC-2: CLI --escape shares choke (zero Anthropic while degraded)
- [ ] AC-3: Single shared never-cloud helper
- [ ] AC-4: Non-degraded within-budget escape still operable
- [ ] AC-5: RED evidence for dual-path bypass archived
- [ ] Verification gates green + typecheck + lint (only SCOPE.writeAllowed files modified)

--------------------------------------------------------------------------------
ACCEPTANCE CRITERIA (TDD beads — RED before GREEN, proven by real services)
--------------------------------------------------------------------------------
AC-1 runBudgetedEscape refuses under process degraded [PRIMARY] (flow_ref T-INFER-014)
  GIVEN: Process is in degraded mode (isProcessInDegradedMode()===true) and escape budget remaining would allow estimatedCostUsd
  WHEN:  Caller invokes runBudgetedEscape({ prompt, reason, estimatedCostUsd, role:'divergent' }) with network capture installed
  THEN:  Call throws/fails closed with degraded never-cloud refuse (RoleUnavailableError or equivalent degraded code); anthropicHits:0 / anthropicCount:0; no generateText Anthropic POST
  TEST_TIER: integration · VERIFICATION_SERVICE: anthropic · TDD_STATE: none
  VERIFY: PLATFORM_IT=1 pnpm vitest run tests/integration/service/infer-red-degraded-no-cloud.test.ts tests/integration/service/infer-degraded-no-cloud.test.ts tests/integration/service/infer-escape-degraded-choke.test.ts
  SCENARIO — start_ref: process-degraded-surface-unavailable · evidence: network_capture
    NEGATIVE_CONTROL: would fail if runBudgetedEscape still has zero degraded checks (red-hat H1 dual path); stub/mock generateText that never hits network; hard-coded anthropicCount:0 without installNetworkCapture; only resolveModel tested while runBudgetedEscape remains ungated; process-flag cleared before escape call so test is vacuous
    EVIDENCE: network_capture (required_capture=True)
    CASE[0] start_ref: process-degraded-surface-unavailable
      actor: operator
      - Install network capture on globalThis.fetch
      - setProcessDegradedState('surface-unavailable')
      - Confirm remaining budget would allow estimate
      - await runBudgetedEscape({ prompt:'pong', reason:'h1-degraded', estimatedCostUsd:0.05, role:'divergent' })
      - Capture thrown error code/message and anthropicHits
      MUST_OBSERVE:
        - escape refused with message containing 'degraded' OR 'never-cloud'
        - anthropicCount:0 OR anthropicHits:0
        - thrown error name RoleUnavailableError OR code ESCAPE_DEGRADED_REFUSED / equivalent non-empty refuse code
      MUST_NOT_OBSERVE:
        - api.anthropic.com host contact
        - anthropicHostContacted:true
        - ledger escape row with check_type='escape' cost>0 from this attempt
        - empty/start signature success { ok:true } without refuse
AC-2 CLI --escape shares choke (zero Anthropic while degraded) (flow_ref UC-INFER-05)
  GIVEN: Process degraded flag set in the same process as holo infer:call --escape (or CLI path that sets degraded before escape)
  WHEN:  Operator runs infer:call --escape --cost 0.05 (or test harness invoking the CLI case handler) with network capture
  THEN:  CLI fails closed; JSON/stdout reports degraded refuse; anthropicHits:0
  TEST_TIER: integration · VERIFICATION_SERVICE: cli · TDD_STATE: none
  VERIFY: PLATFORM_IT=1 pnpm vitest run tests/integration/service/infer-cli-infer-call.test.ts tests/integration/service/infer-escape-degraded-choke.test.ts
  SCENARIO — start_ref: process-degraded-surface-unavailable · evidence: network_capture
    NEGATIVE_CONTROL: would fail if CLI still calls runBudgetedEscape without choke and posts to Anthropic; CLI reimplements a separate escape that skips assertEscapeNotDegraded; test only greps source for isProcessInDegradedMode without executing CLI path; mock/stub anthropic in CLI test
    EVIDENCE: network_capture (required_capture=True)
    CASE[0] start_ref: process-degraded-surface-unavailable
      actor: operator
      - Set process degraded
      - Invoke CLI infer:call --escape path with capture
      - Read exit/error payload and anthropicHits
      MUST_OBSERVE:
        - anthropicHits:0
        - CLI error or ok:false with degraded/never-cloud refuse literal
        - mode remains runBudgetedEscape or explicit degraded refuse (not silent success)
      MUST_NOT_OBSERVE:
        - api.anthropic.com contact
        - ok:true with escape.tokens>0 while degraded
        - empty anthropicHits field without capture installed
AC-3 Single shared never-cloud helper (flow_ref T-INFER-011)
  GIVEN: Code after fix in resolve-model.ts and budget-ledger.ts
  WHEN:  Reviewer inspects call graph for escape refuse
  THEN:  Both resolveModel(allowEscape) and runBudgetedEscape call the same exported helper; no duplicate ad-hoc if(isProcessInDegradedMode) only on one path
  TEST_TIER: integration · VERIFICATION_SERVICE: filesystem · TDD_STATE: none
  VERIFY: PLATFORM_IT=1 pnpm vitest run tests/integration/service/infer-escape-degraded-choke.test.ts
  SCENARIO — start_ref: process-degraded-surface-unavailable · evidence: file_artifact
    NEGATIVE_CONTROL: would fail if dual escape paths with independent degraded checks that can drift; helper exists but only resolveModel imports it; TS-only comments without runtime call
    EVIDENCE: file_artifact (required_capture=True)
    CASE[0] start_ref: process-degraded-surface-unavailable
      actor: adversary
      - Grep production sources for runBudgetedEscape body and resolveModel escape branch
      - Assert shared helper symbol is invoked on both paths (import + call)
      - Run behavioral dual-entry refuse test for both APIs
      MUST_OBSERVE:
        - shared helper export name present (assertEscapeNotDegraded OR isEscapeBlockedByDegraded OR equivalent)
        - budget-ledger.ts and resolve-model.ts both reference helper
        - both APIs refuse with same degraded semantic
      MUST_NOT_OBSERVE:
        - runBudgetedEscape without helper call
        - second independent degraded predicate only in CLI
        - stub helper always returning allow
AC-4 Non-degraded within-budget escape still operable (flow_ref UC-INFER-04)
  GIVEN: process-normal-budget-ok fixture; ANTHROPIC_API_KEY available
  WHEN:  runBudgetedEscape invoked with honest estimatedCostUsd>0 within remaining ceiling
  THEN:  Escape may contact Anthropic; ledgerId non-empty; cost>0; anthropicHostContacted:true (operability control)
  TEST_TIER: integration · VERIFICATION_SERVICE: anthropic · TDD_STATE: none
  VERIFY: PLATFORM_IT=1 pnpm vitest run tests/integration/service/infer-escape-telemetry.test.ts tests/integration/service/infer-budget-precheck.test.ts
  SCENARIO — start_ref: process-normal-budget-ok · evidence: api_response
    NEGATIVE_CONTROL: would fail if choke always refuses even when not degraded; stub success without real Anthropic; ledger write skipped so ledgerId empty
    EVIDENCE: api_response (required_capture=True)
    CASE[0] start_ref: process-normal-budget-ok
      actor: operator
      - resetProcessDegradedFlag()
      - runBudgetedEscape within budget
      - Assert ledgerId and cost
      MUST_OBSERVE:
        - ledgerId matches UUID format xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx OR non-empty ledger id string
        - cost > 0
        - anthropicHostContacted:true OR anthropicHits>=1 on operability path
      MUST_NOT_OBSERVE:
        - degraded refuse while process normal
        - cost:0 with tokens>0 without fail-closed (H5 owns hard fail-closed; here only operability)
        - empty text+empty ledgerId success fiction
AC-5 RED evidence for dual-path bypass archived (flow_ref T-INFER-014)
  GIVEN: Pre-fix or deliberately ungated path evidence collected during red_first
  WHEN:  Implementer records red evidence then greens the choke
  THEN:  .tmp/ and/or .spec/evidence/redhat-fix-h1* contains red artifact proving dual-path risk and green artifact after fix
  TEST_TIER: integration · VERIFICATION_SERVICE: filesystem · TDD_STATE: none
  VERIFY: PLATFORM_IT=1 pnpm vitest run tests/integration/service/infer-escape-degraded-choke.test.ts
  SCENARIO — start_ref: process-degraded-surface-unavailable · evidence: file_artifact
    NEGATIVE_CONTROL: would fail if no red artifact written; green-only claim without red_first; empty evidence file
    EVIDENCE: file_artifact (required_capture=True)
    CASE[0] start_ref: process-degraded-surface-unavailable
      actor: operator
      - Write red evidence showing pre-fix runBudgetedEscape lacks degraded guard OR red test failure log
      - After fix write green evidence with anthropicCount:0 under degraded
      MUST_OBSERVE:
        - artifact path under .tmp/ or .spec/evidence/ matching redhat-fix-h1*
        - green capture includes anthropicCount:0 or anthropicHits:0 literal
      MUST_NOT_OBSERVE:
        - empty evidence file
        - evidence that only tests resolveModel and ignores runBudgetedEscape

--------------------------------------------------------------------------------
TEST CRITERIA (boolean statements mapping to ACs)
--------------------------------------------------------------------------------
| ID | Statement | Maps to | Verify | Type |
|----|-----------|---------|--------|------|
| TC-1 | When process degraded and budget would allow, runBudgetedEscape throws and network capture anthropicHits===0 | AC-1 | `PLATFORM_IT=1 pnpm vitest run tests/integration/service/infer-escape-degraded-choke.test.ts` | negative |
| TC-2 | CLI infer:call --escape under process degraded yields refuse and anthropicHits===0 | AC-2 | `PLATFORM_IT=1 pnpm vitest run tests/integration/service/infer-cli-infer-call.test.ts tests/integration/service/infer-escape-degraded-choke.test.ts` | negative |
| TC-3 | resolveModel(allowEscape) and runBudgetedEscape both invoke the shared assertEscapeNotDegraded (or equivalent) helper | AC-3 | `PLATFORM_IT=1 pnpm vitest run tests/integration/service/infer-escape-degraded-choke.test.ts` | invariant |
| TC-4 | Non-degraded within-budget runBudgetedEscape still returns ledgerId and cost>0 with real Anthropic contact | AC-4 | `PLATFORM_IT=1 pnpm vitest run tests/integration/service/infer-escape-telemetry.test.ts` | happy_path |
| TC-5 | RED/green evidence artifacts exist under .tmp/ or .spec/evidence/redhat-fix-h1* | AC-5 | `PLATFORM_IT=1 pnpm vitest run tests/integration/service/infer-escape-degraded-choke.test.ts` | red_evidence |

--------------------------------------------------------------------------------
SCOPE (file-level write permissions)
--------------------------------------------------------------------------------

writeAllowed:
- services/platform/src/inference/budget-ledger.ts (MODIFY)
- services/platform/src/inference/resolve-model.ts (MODIFY)
- services/platform/src/inference/degraded-process-flag.ts (MODIFY — shared helper surface)
- services/platform/src/inference/escape-degraded-guard.ts (NEW optional)
- services/platform/src/cli/holo.ts (MODIFY only if needed to ensure shared path)
- tests/integration/service/infer-escape-degraded-choke.test.ts (NEW)
- tests/integration/service/infer-red-degraded-no-cloud.test.ts (MODIFY)
- tests/integration/service/infer-degraded-no-cloud.test.ts (MODIFY)
- tests/integration/service/infer-cli-infer-call.test.ts (MODIFY)
- .tmp/redhat-fix-h1*/** (NEW evidence)
- .spec/evidence/redhat-fix-h1* (NEW evidence)

writeProhibited:
- app/** — out of sprint scope
- services/platform/src/db/migrations/** — H1 is process/shared choke only; durable DB read is H4
- services/platform/src/compat/** — H3 owns structural wiring
- .spec/prds/mk6-migration/tasks/sprint-08-*/SPRINT.md human steps — H2 owns gate honesty rewrite

--------------------------------------------------------------------------------
READING LIST
--------------------------------------------------------------------------------
- `.spec/reviews/red-hat-2026-07-16T03-47-51Z-sprint08.md` (H1 section) — Binding finding: escape dual-path bypasses degraded never-cloud
- `services/platform/src/inference/resolve-model.ts` (250-320) — Existing process-flag never-cloud on allowEscape (pattern to share)
- `services/platform/src/inference/budget-ledger.ts` (499-568) — runBudgetedEscape currently has ZERO degraded checks
- `services/platform/src/cli/holo.ts` (1278-1294) — CLI --escape calls runBudgetedEscape only
- `services/platform/src/inference/degraded-process-flag.ts` (all) — Process-memory flag API used by resolveModel today
- `tests/integration/service/infer-red-degraded-no-cloud.test.ts` (all) — Existing RED covers controller/resolveModel — extend for runBudgetedEscape
- `tests/integration/service/infer-network-capture.ts` (all) — Required network_capture helper for never-cloud proofs

--------------------------------------------------------------------------------
DESIGN / PATTERN
--------------------------------------------------------------------------------
References: .spec/reviews/red-hat-2026-07-16T03-47-51Z-sprint08.md, .spec/prds/mk6-migration/tasks/sprint-08-role-router-local-first-and-degraded-modes/SPRINT.md, UC-INFER-05, T-INFER-014
- H4 will extend the same helper to read Postgres degraded_mode — design helper so DB read can be added without a second choke
- H5 also edits budget-ledger.ts — land H1 first; H5 depends_on H1 to avoid write thrash
Pattern: Reuse resolveModel never-cloud process-flag guard as a shared assertEscapeNotDegraded called at the top of runBudgetedEscape and resolveModel escape branch
Pattern source: services/platform/src/inference/resolve-model.ts:258-267
Anti-pattern: Dual escape paths; TS-only comments; testing only resolveModel while CLI/runBudgetedEscape bypass remains; mocked Anthropic for never-cloud proof

--------------------------------------------------------------------------------
AGENT ASSIGNMENT
--------------------------------------------------------------------------------
Implementer: mastra-implementer — Production TypeScript escape path + CLI wiring + integration RED for never-cloud; matches mastra-implementer ownership of resolveModel/budget-ledger seams.
Reviewer: mastra-reviewer
Proposed by: mastra-planner

--------------------------------------------------------------------------------
VERIFICATION GATES
--------------------------------------------------------------------------------
- All Tests Pass: `PLATFORM_IT=1 pnpm vitest run tests/integration/service/infer-escape-degraded-choke.test.ts tests/integration/service/infer-red-degraded-no-cloud.test.ts tests/integration/service/infer-degraded-no-cloud.test.ts tests/integration/service/infer-cli-infer-call.test.ts tests/integration/service/infer-escape-telemetry.test.ts` → Exit 0
- Typecheck: `pnpm tsgo --noEmit` → Exit 0
- Lint: `pnpm biome check .` → Exit 0

--------------------------------------------------------------------------------
DEPENDENCIES
--------------------------------------------------------------------------------
depends_on: []
blocks: ["REDHAT-FIX-H4", "REDHAT-FIX-H5", "REDHAT-FIX-H2"]

--------------------------------------------------------------------------------
CODING STANDARDS
--------------------------------------------------------------------------------
- RULES.md
- brain/docs/mastra/README.md

--------------------------------------------------------------------------------
FIXTURES (shared seed map for scenario start_ref)
--------------------------------------------------------------------------------
- process-degraded-surface-unavailable: Process degraded flag set to surface-unavailable (or controller-forced degraded) with budget ceiling high enough that budget alone would allow escape [seed_method=public_api]
  - setProcessDegradedState('surface-unavailable') OR DegradedModeController force degraded
  - budget_ceiling remaining >> estimatedCostUsd (e.g. ceiling 10, spent 0, estimate 0.05)
- process-normal-budget-ok: Process not degraded; escape budget configured so within-budget escape remains operable [seed_method=db_seed]
  - resetProcessDegradedFlag()
  - budget_ceiling id=1 ceiling>=1
  - ANTHROPIC_API_KEY present for operability case only

</details>

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "REDHAT-FIX-H1",
  "tdd_mode": "red_first",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": true,
    "requires_seeded_evidence": true
  },
  "fixtures": {
    "process-degraded-surface-unavailable": {
      "description": "Process degraded flag set to surface-unavailable (or controller-forced degraded) with budget ceiling high enough that budget alone would allow escape",
      "seed_method": "public_api",
      "records": [
        "setProcessDegradedState('surface-unavailable') OR DegradedModeController force degraded",
        "budget_ceiling remaining >> estimatedCostUsd (e.g. ceiling 10, spent 0, estimate 0.05)"
      ]
    },
    "process-normal-budget-ok": {
      "description": "Process not degraded; escape budget configured so within-budget escape remains operable",
      "seed_method": "db_seed",
      "records": [
        "resetProcessDegradedFlag()",
        "budget_ceiling id=1 ceiling>=1",
        "ANTHROPIC_API_KEY present for operability case only"
      ]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "description": "GIVEN process degraded and budget would allow WHEN runBudgetedEscape THEN refuse never-cloud with anthropicCount:0",
      "verify": "PLATFORM_IT=1 pnpm vitest run tests/integration/service/infer-escape-degraded-choke.test.ts",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "anthropic",
        "negative_control": {
          "would_fail_if": [
            "runBudgetedEscape still has zero degraded checks (red-hat H1 dual path)",
            "stub/mock generateText that never hits network",
            "hard-coded anthropicCount:0 without installNetworkCapture",
            "only resolveModel tested while runBudgetedEscape remains ungated",
            "process-flag cleared before escape call so test is vacuous"
          ]
        },
        "evidence": {
          "artifact_type": "network_capture",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "process-degraded-surface-unavailable",
            "action": {
              "actor": "operator",
              "steps": [
                "Install network capture on globalThis.fetch",
                "setProcessDegradedState('surface-unavailable')",
                "Confirm remaining budget would allow estimate",
                "await runBudgetedEscape({ prompt:'pong', reason:'h1-degraded', estimatedCostUsd:0.05, role:'divergent' })",
                "Capture thrown error code/message and anthropicHits"
              ]
            },
            "end_state": {
              "must_observe": [
                "escape refused with message containing 'degraded' OR 'never-cloud'",
                "anthropicCount:0 OR anthropicHits:0",
                "thrown error name RoleUnavailableError OR code ESCAPE_DEGRADED_REFUSED / equivalent non-empty refuse code"
              ],
              "must_not_observe": [
                "api.anthropic.com host contact",
                "anthropicHostContacted:true",
                "ledger escape row with check_type='escape' cost>0 from this attempt",
                "empty/start signature success { ok:true } without refuse"
              ]
            }
          }
        ]
      },
      "test_tier": "integration",
      "verification_service": "anthropic",
      "flow_ref": "T-INFER-014"
    },
    {
      "id": "AC-2",
      "type": "acceptance_criterion",
      "description": "GIVEN process degraded WHEN CLI infer:call --escape THEN refuse with anthropicHits:0",
      "verify": "PLATFORM_IT=1 pnpm vitest run tests/integration/service/infer-cli-infer-call.test.ts tests/integration/service/infer-escape-degraded-choke.test.ts",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "cli",
        "negative_control": {
          "would_fail_if": [
            "CLI still calls runBudgetedEscape without choke and posts to Anthropic",
            "CLI reimplements a separate escape that skips assertEscapeNotDegraded",
            "test only greps source for isProcessInDegradedMode without executing CLI path",
            "mock/stub anthropic in CLI test"
          ]
        },
        "evidence": {
          "artifact_type": "network_capture",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "process-degraded-surface-unavailable",
            "action": {
              "actor": "operator",
              "steps": [
                "Set process degraded",
                "Invoke CLI infer:call --escape path with capture",
                "Read exit/error payload and anthropicHits"
              ]
            },
            "end_state": {
              "must_observe": [
                "anthropicHits:0",
                "CLI error or ok:false with degraded/never-cloud refuse literal",
                "mode remains runBudgetedEscape or explicit degraded refuse (not silent success)"
              ],
              "must_not_observe": [
                "api.anthropic.com contact",
                "ok:true with escape.tokens>0 while degraded",
                "empty anthropicHits field without capture installed"
              ]
            }
          }
        ]
      },
      "test_tier": "integration",
      "verification_service": "cli",
      "flow_ref": "UC-INFER-05"
    },
    {
      "id": "AC-3",
      "type": "acceptance_criterion",
      "description": "GIVEN fixed sources WHEN inspecting escape paths THEN single shared degraded choke is used by resolveModel and runBudgetedEscape",
      "verify": "PLATFORM_IT=1 pnpm vitest run tests/integration/service/infer-escape-degraded-choke.test.ts",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "filesystem",
        "negative_control": {
          "would_fail_if": [
            "dual escape paths with independent degraded checks that can drift",
            "helper exists but only resolveModel imports it",
            "TS-only comments without runtime call"
          ]
        },
        "evidence": {
          "artifact_type": "file_artifact",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "process-degraded-surface-unavailable",
            "action": {
              "actor": "adversary",
              "steps": [
                "Grep production sources for runBudgetedEscape body and resolveModel escape branch",
                "Assert shared helper symbol is invoked on both paths (import + call)",
                "Run behavioral dual-entry refuse test for both APIs"
              ]
            },
            "end_state": {
              "must_observe": [
                "shared helper export name present (assertEscapeNotDegraded OR isEscapeBlockedByDegraded OR equivalent)",
                "budget-ledger.ts and resolve-model.ts both reference helper",
                "both APIs refuse with same degraded semantic"
              ],
              "must_not_observe": [
                "runBudgetedEscape without helper call",
                "second independent degraded predicate only in CLI",
                "stub helper always returning allow"
              ]
            }
          }
        ]
      },
      "test_tier": "integration",
      "verification_service": "filesystem",
      "flow_ref": "T-INFER-011"
    },
    {
      "id": "AC-4",
      "type": "acceptance_criterion",
      "description": "GIVEN process normal and budget OK WHEN runBudgetedEscape THEN real escape meters cost>0 and ledgerId non-empty",
      "verify": "PLATFORM_IT=1 pnpm vitest run tests/integration/service/infer-escape-telemetry.test.ts",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "anthropic",
        "negative_control": {
          "would_fail_if": [
            "choke always refuses even when not degraded",
            "stub success without real Anthropic",
            "ledger write skipped so ledgerId empty"
          ]
        },
        "evidence": {
          "artifact_type": "api_response",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "process-normal-budget-ok",
            "action": {
              "actor": "operator",
              "steps": [
                "resetProcessDegradedFlag()",
                "runBudgetedEscape within budget",
                "Assert ledgerId and cost"
              ]
            },
            "end_state": {
              "must_observe": [
                "ledgerId matches UUID format xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx OR non-empty ledger id string",
                "cost > 0",
                "anthropicHostContacted:true OR anthropicHits>=1 on operability path"
              ],
              "must_not_observe": [
                "degraded refuse while process normal",
                "cost:0 with tokens>0 without fail-closed (H5 owns hard fail-closed; here only operability)",
                "empty text+empty ledgerId success fiction"
              ]
            }
          }
        ]
      },
      "test_tier": "integration",
      "verification_service": "anthropic",
      "flow_ref": "UC-INFER-04"
    },
    {
      "id": "AC-5",
      "type": "acceptance_criterion",
      "description": "GIVEN red_first WHEN task completes THEN redhat-fix-h1* evidence artifacts capture red and green never-cloud proof",
      "verify": "PLATFORM_IT=1 pnpm vitest run tests/integration/service/infer-escape-degraded-choke.test.ts",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "filesystem",
        "negative_control": {
          "would_fail_if": [
            "no red artifact written",
            "green-only claim without red_first",
            "empty evidence file"
          ]
        },
        "evidence": {
          "artifact_type": "file_artifact",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "process-degraded-surface-unavailable",
            "action": {
              "actor": "operator",
              "steps": [
                "Write red evidence showing pre-fix runBudgetedEscape lacks degraded guard OR red test failure log",
                "After fix write green evidence with anthropicCount:0 under degraded"
              ]
            },
            "end_state": {
              "must_observe": [
                "artifact path under .tmp/ or .spec/evidence/ matching redhat-fix-h1*",
                "green capture includes anthropicCount:0 or anthropicHits:0 literal"
              ],
              "must_not_observe": [
                "empty evidence file",
                "evidence that only tests resolveModel and ignores runBudgetedEscape"
              ]
            }
          }
        ]
      },
      "test_tier": "integration",
      "verification_service": "filesystem",
      "flow_ref": "T-INFER-014"
    },
    {
      "id": "TC-1",
      "type": "test_criterion",
      "description": "runBudgetedEscape under process degraded \u2192 anthropicHits===0",
      "maps_to_ac": "AC-1",
      "verify": "PLATFORM_IT=1 pnpm vitest run tests/integration/service/infer-escape-degraded-choke.test.ts"
    },
    {
      "id": "TC-2",
      "type": "test_criterion",
      "description": "CLI --escape under process degraded \u2192 anthropicHits===0",
      "maps_to_ac": "AC-2",
      "verify": "PLATFORM_IT=1 pnpm vitest run tests/integration/service/infer-cli-infer-call.test.ts tests/integration/service/infer-escape-degraded-choke.test.ts"
    },
    {
      "id": "TC-3",
      "type": "test_criterion",
      "description": "Shared helper used by resolveModel and runBudgetedEscape",
      "maps_to_ac": "AC-3",
      "verify": "PLATFORM_IT=1 pnpm vitest run tests/integration/service/infer-escape-degraded-choke.test.ts"
    },
    {
      "id": "TC-4",
      "type": "test_criterion",
      "description": "Non-degraded escape still operable with ledgerId and cost>0",
      "maps_to_ac": "AC-4",
      "verify": "PLATFORM_IT=1 pnpm vitest run tests/integration/service/infer-escape-telemetry.test.ts"
    },
    {
      "id": "TC-5",
      "type": "test_criterion",
      "description": "RED/green evidence under redhat-fix-h1*",
      "maps_to_ac": "AC-5",
      "verify": "PLATFORM_IT=1 pnpm vitest run tests/integration/service/infer-escape-degraded-choke.test.ts"
    }
  ],
  "proposed_by": "mastra-planner",
  "dependencies": {
    "depends_on": [],
    "blocks": [
      "REDHAT-FIX-H4",
      "REDHAT-FIX-H5",
      "REDHAT-FIX-H2"
    ]
  },
  "touches_capabilities": [
    "CAP-INF-01"
  ],
  "provides": [
    "escape-never-cloud-single-choke",
    "runBudgetedEscape-degraded-refuse",
    "cli-escape-shares-resolveModel-never-cloud",
    "assertEscapeNotDegraded-helper"
  ],
  "consumes": [
    "isProcessInDegradedMode",
    "DegradedModeController",
    "runBudgetedEscape",
    "resolveModel-escape-guard",
    "infer-network-capture"
  ],
  "boundary_contracts": [
    "Any production path that can contact Anthropic (runBudgetedEscape, resolveModel allowEscape, CLI infer:call --escape) MUST share one never-cloud choke that refuses when degraded",
    "runBudgetedEscape MUST throw fail-closed degraded error BEFORE createAnthropic/generateText when process degraded (H4 will extend same choke to DB)",
    "CLI --escape MUST NOT be a second, ungated Anthropic entry point",
    "Never-cloud proof is network_capture with anthropicCount/anthropicHits=0 against real fetch path \u2014 not mocked fetch returning zero"
  ]
}
-->

# REDHAT-FIX-H4 — Durable degraded gate: escape/resolve must read Postgres degraded_mode so multi-process/CLI re-invocations honor fleet-down (fresh red-hat H4: process-local degraded flag)

## What this does

Close red-hat H4 by making the shared escape never-cloud choke honor durable Postgres degraded_mode so multi-process and fresh CLI invocations cannot hit Anthropic while fleet-down is recorded.

Provides: durable-degraded-escape-gate, postgres-degraded_mode-read-on-escape, multi-process-never-cloud, isDegradedMode-db-backed.

## Why

- MUST Extend H1 shared helper to read Postgres degraded_mode (global row) when deciding escape allow
- MUST Prove multi-process: seed DB degraded without setting process flag → runBudgetedEscape refuses; anthropicCount:0
- MUST resolveModel(allowEscape) also honors DB degraded via same helper
- MUST Fail closed if degraded_mode cannot be read when required (prefer refuse escape over allow-on-DB-error for escape path)
- MUST Controller still writes durable state; close()/reset clears DB when resetToNormal so operability restored
- MUST RED evidence under .spec/evidence/redhat-fix-h4* showing process-only flag would allow escape while DB degraded
- NEVER leave escape gating process-memory only for multi-process/CLI re-invocation
- NEVER require DegradedModeController instance to be constructed in the escaping process solely for the flag
- NEVER mock Postgres client for durable degraded proof
- NEVER skip H1 choke — this task extends it, does not fork a second path
- STRICTLY depends_on REDHAT-FIX-H1
- STRICTLY durable source of truth is Postgres degraded_mode (or shared durable flag backed by it)
- STRICTLY network never-cloud proof with anthropicHits:0 on DB-degraded fresh process
- STRICTLY red_first
- Grounded in: UC-INFER-01, UC-INFER-04, UC-INFER-05, T-INFER-011, T-INFER-014, T-INFER-015, CAP-INF-01

## How to verify

- `PLATFORM_IT=1 pnpm vitest run tests/integration/service/infer-degraded-durable-escape.test.ts tests/integration/service/infer-escape-degraded-choke.test.ts tests/integration/service/infer-red-degraded-no-cloud.test.ts` → Exit 0
- `pnpm tsgo --noEmit` → Exit 0
- `pnpm biome check .` → Exit 0

## Scope

Writes: services/platform/src/inference/degraded-process-flag.ts (MODIFY) · services/platform/src/inference/escape-degraded-guard.ts (NEW/MODIFY — shared helper) · services/platform/src/inference/budget-ledger.ts (MODIFY — call extended helper) · services/platform/src/inference/resolve-model.ts (MODIFY — call extended helper) · services/platform/src/inference/degraded-mode-controller.ts (MODIFY if needed for read helpers/export) · tests/integration/service/infer-degraded-durable-escape.test.ts (NEW) · tests/integration/service/infer-red-degraded-no-cloud.test.ts (MODIFY) · tests/integration/service/infer-escape-degraded-choke.test.ts (MODIFY) · .tmp/redhat-fix-h4*/** (NEW) · .spec/evidence/redhat-fix-h4* (NEW)

Prohibited: services/platform/src/compat/** — H3 scope · .spec/prds/**/SPRINT.md human steps — H2 scope · app/** — out of scope · Softening never-cloud to warn-only

<details>
<summary>▸ Full agent specification (TASK-TEMPLATE v5.2 — required reading for implementer + reviewer)</summary>

================================================================================
TASK: REDHAT-FIX-H4 — Durable degraded gate: escape/resolve must read Postgres degraded_mode so multi-process/CLI re-invocations honor fleet-down (fresh red-hat H4: process-local degraded flag)
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
With degraded_mode.degraded_state != 'normal' in Postgres and process flag false, runBudgetedEscape and resolveModel(allowEscape) refuse with anthropicHits:0; after DB reset to normal, within-budget escape works again.

--------------------------------------------------------------------------------
🚫 CRITICAL CONSTRAINTS (Never tier)
--------------------------------------------------------------------------------
- MUST Extend H1 shared helper to read Postgres degraded_mode (global row) when deciding escape allow
- MUST Prove multi-process: seed DB degraded without setting process flag → runBudgetedEscape refuses; anthropicCount:0
- MUST resolveModel(allowEscape) also honors DB degraded via same helper
- MUST Fail closed if degraded_mode cannot be read when required (prefer refuse escape over allow-on-DB-error for escape path)
- MUST Controller still writes durable state; close()/reset clears DB when resetToNormal so operability restored
- MUST RED evidence under .spec/evidence/redhat-fix-h4* showing process-only flag would allow escape while DB degraded
- NEVER leave escape gating process-memory only for multi-process/CLI re-invocation
- NEVER require DegradedModeController instance to be constructed in the escaping process solely for the flag
- NEVER mock Postgres client for durable degraded proof
- NEVER skip H1 choke — this task extends it, does not fork a second path
- STRICTLY depends_on REDHAT-FIX-H1
- STRICTLY durable source of truth is Postgres degraded_mode (or shared durable flag backed by it)
- STRICTLY network never-cloud proof with anthropicHits:0 on DB-degraded fresh process
- STRICTLY red_first

--------------------------------------------------------------------------------
BOUNDARY CONTRACTS
--------------------------------------------------------------------------------
- Shared escape choke MUST treat process degraded OR durable DB degraded_mode non-normal as refuse
- Fresh process with process flag false but DB degraded_state != 'normal' MUST refuse escape with anthropicHits:0
- DB read uses real Postgres (PLATFORM_IT=1), not only process memory
- When DB and process are normal, within-budget escape remains operable

--------------------------------------------------------------------------------
DONE WHEN
--------------------------------------------------------------------------------
- [ ] AC-1: DB degraded + process flag false refuses runBudgetedEscape (PRIMARY)
- [ ] AC-2: resolveModel(allowEscape) honors DB degraded
- [ ] AC-3: Shared helper is the DB-aware choke
- [ ] AC-4: DB normal restores operability
- [ ] AC-5: RED multi-process evidence archived
- [ ] Verification gates green + typecheck + lint (only SCOPE.writeAllowed files modified)

--------------------------------------------------------------------------------
ACCEPTANCE CRITERIA (TDD beads — RED before GREEN, proven by real services)
--------------------------------------------------------------------------------
AC-1 DB degraded + process flag false refuses runBudgetedEscape [PRIMARY] (flow_ref T-INFER-014)
  GIVEN: db-degraded-process-flag-false fixture and budget would allow escape
  WHEN:  Fresh logic path calls runBudgetedEscape with network capture
  THEN:  Refuse never-cloud; anthropicHits:0; no Anthropic POST
  TEST_TIER: integration · VERIFICATION_SERVICE: postgres · TDD_STATE: none
  VERIFY: PLATFORM_IT=1 pnpm vitest run tests/integration/service/infer-degraded-durable-escape.test.ts
  SCENARIO — start_ref: db-degraded-process-flag-false · evidence: network_capture
    NEGATIVE_CONTROL: would fail if process-flag-only without DB read (H4 unfixed); stub/mock postgres returning normal always; empty start without seeding degraded_mode; disconnect from DB and allow escape on read failure (if fail-open)
    EVIDENCE: network_capture (required_capture=True)
    CASE[0] start_ref: db-degraded-process-flag-false
      actor: operator
      - Seed DB degraded_mode non-normal
      - resetProcessDegradedFlag()
      - Confirm isProcessInDegradedMode()===false
      - runBudgetedEscape with capture
      - Assert refuse + anthropicHits:0
      MUST_OBSERVE:
        - isProcessInDegradedMode() === false before call
        - DB degraded_state is surface-unavailable OR fail-closed OR queue-and-retry OR sense-only (non-normal literal)
        - escape refuse message contains degraded OR never-cloud
        - anthropicCount:0 OR anthropicHits:0
      MUST_NOT_OBSERVE:
        - api.anthropic.com contact
        - anthropicHostContacted:true
        - success with tokens>0 while DB degraded
AC-2 resolveModel(allowEscape) honors DB degraded (flow_ref UC-INFER-05)
  GIVEN: Same db-degraded-process-flag-false fixture
  WHEN:  resolveModel('divergent', { allowEscape:true, estimatedCostUsd:0.05 })
  THEN:  Throws RoleUnavailableError / degraded refuse before Anthropic probe; anthropicHits:0
  TEST_TIER: integration · VERIFICATION_SERVICE: postgres · TDD_STATE: none
  VERIFY: PLATFORM_IT=1 pnpm vitest run tests/integration/service/infer-degraded-durable-escape.test.ts tests/integration/service/infer-red-degraded-no-cloud.test.ts
  SCENARIO — start_ref: db-degraded-process-flag-false · evidence: network_capture
    NEGATIVE_CONTROL: would fail if resolveModel only checks process flag; escape probe still hits Anthropic; mock resolveModel
    EVIDENCE: network_capture (required_capture=True)
    CASE[0] start_ref: db-degraded-process-flag-false
      actor: adversary
      - reset process flag
      - resolveModel allowEscape true with capture
      - Assert throw and no anthropic host
      MUST_OBSERVE:
        - RoleUnavailableError OR degraded refuse thrown
        - anthropicHits:0
      MUST_NOT_OBSERVE:
        - provider: anthropic resolved model returned
        - api.anthropic.com contact
AC-3 Shared helper is the DB-aware choke (flow_ref T-INFER-011)
  GIVEN: H1 helper extended
  WHEN:  Inspecting implementation
  THEN:  Single helper performs process OR DB check; runBudgetedEscape and resolveModel both call it
  TEST_TIER: integration · VERIFICATION_SERVICE: filesystem · TDD_STATE: none
  VERIFY: PLATFORM_IT=1 pnpm vitest run tests/integration/service/infer-degraded-durable-escape.test.ts
  SCENARIO — start_ref: db-degraded-process-flag-false · evidence: file_artifact
    NEGATIVE_CONTROL: would fail if second parallel DB check only on one path; DB read only in controller not in choke; TS comment without SELECT
    EVIDENCE: file_artifact (required_capture=True)
    CASE[0] start_ref: db-degraded-process-flag-false
      actor: operator
      - Assert helper reads degraded_mode via real SQL
      - Both escape APIs refuse under DB-only degraded
      MUST_OBSERVE:
        - helper issues SELECT against degraded_mode (or repository method proven via integration)
        - both resolveModel and runBudgetedEscape refuse under same fixture
      MUST_NOT_OBSERVE:
        - only process flag consulted
        - dual inconsistent predicates
AC-4 DB normal restores operability (flow_ref T-INFER-016)
  GIVEN: db-normal-process-normal and within-budget config
  WHEN:  runBudgetedEscape after clearing degraded_mode to normal
  THEN:  Escape may proceed (operability); not spuriously refused for degraded
  TEST_TIER: integration · VERIFICATION_SERVICE: anthropic · TDD_STATE: none
  VERIFY: PLATFORM_IT=1 pnpm vitest run tests/integration/service/infer-degraded-durable-escape.test.ts tests/integration/service/infer-escape-telemetry.test.ts
  SCENARIO — start_ref: db-normal-process-normal · evidence: api_response
    NEGATIVE_CONTROL: would fail if DB normal still refuses always; stale process flag not considered separately from DB (both normal required); stub success without real path
    EVIDENCE: api_response (required_capture=True)
    CASE[0] start_ref: db-normal-process-normal
      actor: operator
      - Set degraded_mode normal
      - reset process flag
      - runBudgetedEscape within budget
      MUST_OBSERVE:
        - no degraded refuse error
        - ledgerId non-empty OR anthropicHostContacted:true on full escape
      MUST_NOT_OBSERVE:
        - degraded mode active — Claude escape refused while DB normal
        - empty success fiction without budget/anthropic path
AC-5 RED multi-process evidence archived (flow_ref T-INFER-014)
  GIVEN: red_first demonstration of process-only gap
  WHEN:  Evidence written
  THEN:  .spec/evidence/redhat-fix-h4* shows process flag false + DB degraded would allow pre-fix and green refuses with anthropicCount:0
  TEST_TIER: integration · VERIFICATION_SERVICE: filesystem · TDD_STATE: none
  VERIFY: PLATFORM_IT=1 pnpm vitest run tests/integration/service/infer-degraded-durable-escape.test.ts
  SCENARIO — start_ref: db-degraded-process-flag-false · evidence: file_artifact
    NEGATIVE_CONTROL: would fail if no evidence; evidence only process-flag tests; empty file
    EVIDENCE: file_artifact (required_capture=True)
    CASE[0] start_ref: db-degraded-process-flag-false
      actor: operator
      - Write red multi-process gap artifact
      - Write green durable refuse + anthropicCount:0
      MUST_OBSERVE:
        - artifact path matches redhat-fix-h4*
        - green includes anthropicCount:0 and processFlag:false and dbDegraded:true
      MUST_NOT_OBSERVE:
        - empty evidence
        - process-flag-only green without dbDegraded field

--------------------------------------------------------------------------------
TEST CRITERIA (boolean statements mapping to ACs)
--------------------------------------------------------------------------------
| ID | Statement | Maps to | Verify | Type |
|----|-----------|---------|--------|------|
| TC-1 | DB degraded + process flag false → runBudgetedEscape refuses with anthropicHits===0 | AC-1 | `PLATFORM_IT=1 pnpm vitest run tests/integration/service/infer-degraded-durable-escape.test.ts` | negative |
| TC-2 | resolveModel(allowEscape) under DB-only degraded throws and anthropicHits===0 | AC-2 | `PLATFORM_IT=1 pnpm vitest run tests/integration/service/infer-degraded-durable-escape.test.ts` | negative |
| TC-3 | Shared H1 helper reads degraded_mode and gates both APIs | AC-3 | `PLATFORM_IT=1 pnpm vitest run tests/integration/service/infer-degraded-durable-escape.test.ts` | invariant |
| TC-4 | DB+process normal allows within-budget escape (no spurious degraded refuse) | AC-4 | `PLATFORM_IT=1 pnpm vitest run tests/integration/service/infer-degraded-durable-escape.test.ts tests/integration/service/infer-escape-telemetry.test.ts` | happy_path |
| TC-5 | redhat-fix-h4* red/green multi-process evidence exists | AC-5 | `PLATFORM_IT=1 pnpm vitest run tests/integration/service/infer-degraded-durable-escape.test.ts` | red_evidence |

--------------------------------------------------------------------------------
SCOPE (file-level write permissions)
--------------------------------------------------------------------------------

writeAllowed:
- services/platform/src/inference/degraded-process-flag.ts (MODIFY)
- services/platform/src/inference/escape-degraded-guard.ts (NEW/MODIFY — shared helper)
- services/platform/src/inference/budget-ledger.ts (MODIFY — call extended helper)
- services/platform/src/inference/resolve-model.ts (MODIFY — call extended helper)
- services/platform/src/inference/degraded-mode-controller.ts (MODIFY if needed for read helpers/export)
- tests/integration/service/infer-degraded-durable-escape.test.ts (NEW)
- tests/integration/service/infer-red-degraded-no-cloud.test.ts (MODIFY)
- tests/integration/service/infer-escape-degraded-choke.test.ts (MODIFY)
- .tmp/redhat-fix-h4*/** (NEW)
- .spec/evidence/redhat-fix-h4* (NEW)

writeProhibited:
- services/platform/src/compat/** — H3 scope
- .spec/prds/**/SPRINT.md human steps — H2 scope
- app/** — out of scope
- Softening never-cloud to warn-only

--------------------------------------------------------------------------------
READING LIST
--------------------------------------------------------------------------------
- `.spec/reviews/red-hat-2026-07-16T03-47-51Z-sprint08.md` (H4 section) — Process-local degraded flag multi-process escape gap
- `services/platform/src/inference/degraded-process-flag.ts` (all) — Module memory only — insufficient for multi-process
- `services/platform/src/inference/degraded-mode-controller.ts` (113-161, 250-310, 734-748) — Postgres degraded_mode schema/load/persist; close clears process flag
- `services/platform/src/inference/budget-ledger.ts` (499-568) — runBudgetedEscape choke insertion point (post-H1)
- `services/platform/src/inference/resolve-model.ts` (256-268) — Escape never-cloud call site to share DB-aware helper

--------------------------------------------------------------------------------
DESIGN / PATTERN
--------------------------------------------------------------------------------
References: .spec/reviews/red-hat-2026-07-16T03-47-51Z-sprint08.md, UC-INFER-05, T-INFER-014
- Builds on H1 shared choke — implement DB read inside assertEscapeNotDegraded / isEscapeBlockedByDegraded
- Prefer fail-closed on DB read errors for escape path
Pattern: Process flag OR durable SELECT degraded_mode.degraded_state != 'normal' inside single escape choke
Pattern source: degraded-mode-controller.ts loadGlobalState + H1 assertEscapeNotDegraded
Anti-pattern: Process-only degraded for multi-process; dual paths; mock postgres; allow-on-DB-error for escape

--------------------------------------------------------------------------------
AGENT ASSIGNMENT
--------------------------------------------------------------------------------
Implementer: mastra-implementer — Extend shared never-cloud choke from H1 to read durable Postgres degraded_mode so fresh CLI processes honor fleet-down.
Reviewer: mastra-reviewer
Proposed by: mastra-planner

--------------------------------------------------------------------------------
VERIFICATION GATES
--------------------------------------------------------------------------------
- All Tests Pass: `PLATFORM_IT=1 pnpm vitest run tests/integration/service/infer-degraded-durable-escape.test.ts tests/integration/service/infer-escape-degraded-choke.test.ts tests/integration/service/infer-red-degraded-no-cloud.test.ts` → Exit 0
- Typecheck: `pnpm tsgo --noEmit` → Exit 0
- Lint: `pnpm biome check .` → Exit 0

--------------------------------------------------------------------------------
DEPENDENCIES
--------------------------------------------------------------------------------
depends_on: ["REDHAT-FIX-H1"]
blocks: ["REDHAT-FIX-H2"]

--------------------------------------------------------------------------------
CODING STANDARDS
--------------------------------------------------------------------------------
- RULES.md

--------------------------------------------------------------------------------
FIXTURES (shared seed map for scenario start_ref)
--------------------------------------------------------------------------------
- db-degraded-process-flag-false: Postgres degraded_mode global row set to surface-unavailable (or fail-closed); process flag explicitly reset to normal [seed_method=db_seed]
  - UPDATE degraded_mode SET degraded_state='surface-unavailable' WHERE id=global
  - resetProcessDegradedFlag() so isProcessInDegradedMode()===false
- db-normal-process-normal: Both DB and process normal; budget configured [seed_method=db_seed]
  - degraded_state='normal'
  - resetProcessDegradedFlag()
  - budget ceiling > 0

</details>

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "REDHAT-FIX-H4",
  "tdd_mode": "red_first",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": true,
    "requires_seeded_evidence": true
  },
  "fixtures": {
    "db-degraded-process-flag-false": {
      "description": "Postgres degraded_mode global row set to surface-unavailable (or fail-closed); process flag explicitly reset to normal",
      "seed_method": "db_seed",
      "records": [
        "UPDATE degraded_mode SET degraded_state='surface-unavailable' WHERE id=global",
        "resetProcessDegradedFlag() so isProcessInDegradedMode()===false"
      ]
    },
    "db-normal-process-normal": {
      "description": "Both DB and process normal; budget configured",
      "seed_method": "db_seed",
      "records": [
        "degraded_state='normal'",
        "resetProcessDegradedFlag()",
        "budget ceiling > 0"
      ]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "description": "GIVEN DB degraded and process flag false WHEN runBudgetedEscape THEN refuse with anthropicHits:0",
      "verify": "PLATFORM_IT=1 pnpm vitest run tests/integration/service/infer-degraded-durable-escape.test.ts",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "postgres",
        "negative_control": {
          "would_fail_if": [
            "process-flag-only without DB read (H4 unfixed)",
            "stub/mock postgres returning normal always",
            "empty start without seeding degraded_mode",
            "disconnect from DB and allow escape on read failure (if fail-open)"
          ]
        },
        "evidence": {
          "artifact_type": "network_capture",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "db-degraded-process-flag-false",
            "action": {
              "actor": "operator",
              "steps": [
                "Seed DB degraded_mode non-normal",
                "resetProcessDegradedFlag()",
                "Confirm isProcessInDegradedMode()===false",
                "runBudgetedEscape with capture",
                "Assert refuse + anthropicHits:0"
              ]
            },
            "end_state": {
              "must_observe": [
                "isProcessInDegradedMode() === false before call",
                "DB degraded_state is surface-unavailable OR fail-closed OR queue-and-retry OR sense-only (non-normal literal)",
                "escape refuse message contains degraded OR never-cloud",
                "anthropicCount:0 OR anthropicHits:0"
              ],
              "must_not_observe": [
                "api.anthropic.com contact",
                "anthropicHostContacted:true",
                "success with tokens>0 while DB degraded"
              ]
            }
          }
        ]
      },
      "test_tier": "integration",
      "verification_service": "postgres",
      "flow_ref": "T-INFER-014"
    },
    {
      "id": "AC-2",
      "type": "acceptance_criterion",
      "description": "GIVEN DB degraded process flag false WHEN resolveModel allowEscape THEN throw never-cloud; anthropicHits:0",
      "verify": "PLATFORM_IT=1 pnpm vitest run tests/integration/service/infer-degraded-durable-escape.test.ts",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "postgres",
        "negative_control": {
          "would_fail_if": [
            "resolveModel only checks process flag",
            "escape probe still hits Anthropic",
            "mock resolveModel"
          ]
        },
        "evidence": {
          "artifact_type": "network_capture",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "db-degraded-process-flag-false",
            "action": {
              "actor": "adversary",
              "steps": [
                "reset process flag",
                "resolveModel allowEscape true with capture",
                "Assert throw and no anthropic host"
              ]
            },
            "end_state": {
              "must_observe": [
                "RoleUnavailableError OR degraded refuse thrown",
                "anthropicHits:0"
              ],
              "must_not_observe": [
                "provider: anthropic resolved model returned",
                "api.anthropic.com contact"
              ]
            }
          }
        ]
      },
      "test_tier": "integration",
      "verification_service": "postgres",
      "flow_ref": "UC-INFER-05"
    },
    {
      "id": "AC-3",
      "type": "acceptance_criterion",
      "description": "GIVEN H1 choke WHEN extended THEN single helper reads process OR DB for both escape APIs",
      "verify": "PLATFORM_IT=1 pnpm vitest run tests/integration/service/infer-degraded-durable-escape.test.ts",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "filesystem",
        "negative_control": {
          "would_fail_if": [
            "second parallel DB check only on one path",
            "DB read only in controller not in choke",
            "TS comment without SELECT"
          ]
        },
        "evidence": {
          "artifact_type": "file_artifact",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "db-degraded-process-flag-false",
            "action": {
              "actor": "operator",
              "steps": [
                "Assert helper reads degraded_mode via real SQL",
                "Both escape APIs refuse under DB-only degraded"
              ]
            },
            "end_state": {
              "must_observe": [
                "helper issues SELECT against degraded_mode (or repository method proven via integration)",
                "both resolveModel and runBudgetedEscape refuse under same fixture"
              ],
              "must_not_observe": [
                "only process flag consulted",
                "dual inconsistent predicates"
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
      "description": "GIVEN DB and process normal WHEN runBudgetedEscape within budget THEN no degraded refuse; operability restored",
      "verify": "PLATFORM_IT=1 pnpm vitest run tests/integration/service/infer-degraded-durable-escape.test.ts tests/integration/service/infer-escape-telemetry.test.ts",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "anthropic",
        "negative_control": {
          "would_fail_if": [
            "DB normal still refuses always",
            "stale process flag not considered separately from DB (both normal required)",
            "stub success without real path"
          ]
        },
        "evidence": {
          "artifact_type": "api_response",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "db-normal-process-normal",
            "action": {
              "actor": "operator",
              "steps": [
                "Set degraded_mode normal",
                "reset process flag",
                "runBudgetedEscape within budget"
              ]
            },
            "end_state": {
              "must_observe": [
                "no degraded refuse error",
                "ledgerId non-empty OR anthropicHostContacted:true on full escape"
              ],
              "must_not_observe": [
                "degraded mode active \u2014 Claude escape refused while DB normal",
                "empty success fiction without budget/anthropic path"
              ]
            }
          }
        ]
      },
      "test_tier": "integration",
      "verification_service": "anthropic",
      "flow_ref": "T-INFER-016"
    },
    {
      "id": "AC-5",
      "type": "acceptance_criterion",
      "description": "GIVEN red_first WHEN complete THEN redhat-fix-h4* evidence documents multi-process gap closed",
      "verify": "PLATFORM_IT=1 pnpm vitest run tests/integration/service/infer-degraded-durable-escape.test.ts",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "filesystem",
        "negative_control": {
          "would_fail_if": [
            "no evidence",
            "evidence only process-flag tests",
            "empty file"
          ]
        },
        "evidence": {
          "artifact_type": "file_artifact",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "db-degraded-process-flag-false",
            "action": {
              "actor": "operator",
              "steps": [
                "Write red multi-process gap artifact",
                "Write green durable refuse + anthropicCount:0"
              ]
            },
            "end_state": {
              "must_observe": [
                "artifact path matches redhat-fix-h4*",
                "green includes anthropicCount:0 and processFlag:false and dbDegraded:true"
              ],
              "must_not_observe": [
                "empty evidence",
                "process-flag-only green without dbDegraded field"
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
      "description": "DB-only degraded refuses runBudgetedEscape",
      "maps_to_ac": "AC-1",
      "verify": "PLATFORM_IT=1 pnpm vitest run tests/integration/service/infer-degraded-durable-escape.test.ts"
    },
    {
      "id": "TC-2",
      "type": "test_criterion",
      "description": "DB-only degraded refuses resolveModel allowEscape",
      "maps_to_ac": "AC-2",
      "verify": "PLATFORM_IT=1 pnpm vitest run tests/integration/service/infer-degraded-durable-escape.test.ts"
    },
    {
      "id": "TC-3",
      "type": "test_criterion",
      "description": "Single DB-aware shared choke",
      "maps_to_ac": "AC-3",
      "verify": "PLATFORM_IT=1 pnpm vitest run tests/integration/service/infer-degraded-durable-escape.test.ts"
    },
    {
      "id": "TC-4",
      "type": "test_criterion",
      "description": "Normal DB restores escape operability",
      "maps_to_ac": "AC-4",
      "verify": "PLATFORM_IT=1 pnpm vitest run tests/integration/service/infer-degraded-durable-escape.test.ts"
    },
    {
      "id": "TC-5",
      "type": "test_criterion",
      "description": "redhat-fix-h4* evidence present",
      "maps_to_ac": "AC-5",
      "verify": "PLATFORM_IT=1 pnpm vitest run tests/integration/service/infer-degraded-durable-escape.test.ts"
    }
  ],
  "proposed_by": "mastra-planner",
  "dependencies": {
    "depends_on": [
      "REDHAT-FIX-H1"
    ],
    "blocks": [
      "REDHAT-FIX-H2"
    ]
  },
  "touches_capabilities": [
    "CAP-INF-01"
  ],
  "provides": [
    "durable-degraded-escape-gate",
    "postgres-degraded_mode-read-on-escape",
    "multi-process-never-cloud",
    "isDegradedMode-db-backed"
  ],
  "consumes": [
    "REDHAT-FIX-H1 assertEscapeNotDegraded choke",
    "degraded_mode Postgres table",
    "DegradedModeController.persistGlobal",
    "runBudgetedEscape",
    "resolveModel"
  ],
  "boundary_contracts": [
    "Shared escape choke MUST treat process degraded OR durable DB degraded_mode non-normal as refuse",
    "Fresh process with process flag false but DB degraded_state != 'normal' MUST refuse escape with anthropicHits:0",
    "DB read uses real Postgres (PLATFORM_IT=1), not only process memory",
    "When DB and process are normal, within-budget escape remains operable"
  ]
}
-->

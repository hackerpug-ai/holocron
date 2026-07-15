# infer-5 — Review local-first structural integrity + escape leakage

## What this does

Adversarial review of infer-1/2/3/4 to block stubbed router that still reaches cloud, escape path with no budget pre-check, degraded mode that silently falls back to cloud, and fakeable network assertions

Provides: Adversarial review evidence, Stub detection report, Escape leakage findings, Network assertion validation.


## Why

- MUST Router implementation NEVER reaches cloud via stub — grep match count = 0 for stub patterns
- MUST Escape path ALWAYS has budget pre-check — budget_ledger row count ≥ 1, holo budget:status spent > 0
- MUST Degraded mode NEVER falls back to cloud — degraded-state field = 'surface-unavailable', resume-state field = 'normal'
- MUST Network assertions UN-FAKEABLE — grep 'mock.*network.*capture' match count = 0, assertions contain 'api.anthropic.com' literal
- MUST Review uses ONLY grep/db queries — no mocking, no stub-implementation assumptions
- NEVER Assume router is correct without grep verification
- NEVER Trust network assertions without checking for mocks
- NEVER Accept degraded mode without verifying no-cloud enforcement
- NEVER Skip budget pre-check verification on escape path
- STRICTLY All verification uses real source code grep (no assumptions)
- STRICTLY All database queries use real Postgres (PLATFORM_IT=1)
- STRICTLY All network assertions check for concrete literals (no weak assertions)
- STRICTLY Review evidence written to .spec/evidence/infer-5-review-*.json (read-only on source, write-allowed on evidence)

- Grounded in: UC-INFER-01, UC-INFER-04, UC-INFER-05

## How to verify

- `grep -rE 'stub|mock|fake' services/platform/src/inference/resolve-model.ts | wc -l` → Exit 0 with output = 0
- `bun services/platform/src/cli/holo.ts verify:no-provider-refs` → Exit 0
- `PLATFORM_IT=1 psql -c "SELECT COUNT(*) FROM budget_ledger WHERE check_type = 'pre-check'"` → Exit 0 with count ≥ 1
- `PLATFORM_IT=1 psql -c 'SELECT degraded_state FROM degraded_mode'` → Exit 0 with degraded_state = 'surface-unavailable'
- `grep -r 'mock.*network.*capture' tests/integration/service/infer-red-*.test.ts | wc -l` → Exit 0 with output = 0

## Scope

Writes: .spec/evidence/infer-5-review-*.json (NEW)

Prohibited: Any source code modification - reason: Review is read-only on implementation · Any fake evidence - reason: All evidence must come from real grep/db queries


<details>
<summary>▸ Full agent specification (TASK-TEMPLATE v5.2 — required reading for implementer + reviewer)</summary>

================================================================================
TASK: infer-5 — Review local-first structural integrity + escape leakage
================================================================================

TASK_TYPE:  FEATURE
STATUS:     Backlog
PRIORITY:   P0
EFFORT:     M  (90 min)
AGENT:      mastra-reviewer
PROPOSED-BY: mastra-planner
TDD_MODE:   skipped     RED_GREEN_REQUIRED: no     (requires_seeded_evidence: true)
CAPABILITY: CAP-INF-01
SPRINT:     [Sprint 8 — Role Router, Local-First and Degraded Modes](./SPRINT.md)

RUNTIME_COMMANDS:
  test:      PLATFORM_IT=1 pnpm vitest run <path>
  typecheck: pnpm tsgo --noEmit
  lint:      pnpm biome check .

--------------------------------------------------------------------------------
OUTCOME
--------------------------------------------------------------------------------
Adversarial review of infer-1/2/3/4 to block stubbed router that still reaches cloud, escape path with no budget pre-check, degraded mode that silently falls back to cloud, and fakeable network assertions
Grep shows 0 stub matches in router source; budget_ledger shows ≥ 1 pre-check row; degraded-state shows 'surface-unavailable' with no-cloud proof; network assertions contain 'api.anthropic.com' literal with 0 mock matches; review evidence written to .spec/evidence/infer-5-review-*.json

--------------------------------------------------------------------------------
🚫 CRITICAL CONSTRAINTS (Never tier)
--------------------------------------------------------------------------------
- MUST Router implementation NEVER reaches cloud via stub — grep match count = 0 for stub patterns
- MUST Escape path ALWAYS has budget pre-check — budget_ledger row count ≥ 1, holo budget:status spent > 0
- MUST Degraded mode NEVER falls back to cloud — degraded-state field = 'surface-unavailable', resume-state field = 'normal'
- MUST Network assertions UN-FAKEABLE — grep 'mock.*network.*capture' match count = 0, assertions contain 'api.anthropic.com' literal
- MUST Review uses ONLY grep/db queries — no mocking, no stub-implementation assumptions
- NEVER Assume router is correct without grep verification
- NEVER Trust network assertions without checking for mocks
- NEVER Accept degraded mode without verifying no-cloud enforcement
- NEVER Skip budget pre-check verification on escape path
- STRICTLY All verification uses real source code grep (no assumptions)
- STRICTLY All database queries use real Postgres (PLATFORM_IT=1)
- STRICTLY All network assertions check for concrete literals (no weak assertions)
- STRICTLY Review evidence written to .spec/evidence/infer-5-review-*.json (read-only on source, write-allowed on evidence)

--------------------------------------------------------------------------------
DONE WHEN
--------------------------------------------------------------------------------
- [ ] AC-1: Router never reaches cloud via stub — grep match count = 0, holo verify:no-provider-refs exit 0 (flow_ref T-INFER-001,T-INFER-002)
- [ ] AC-2: Escape path has budget pre-check — budget_ledger row count ≥ 1, holo budget:status spent > 0 (flow_ref T-INFER-011,T-INFER-012)
- [ ] AC-3: Degraded mode never falls back to cloud — degraded-state = 'surface-unavailable', resume-state = 'normal' (flow_ref T-INFER-014,T-INFER-015,T-INFER-016)
- [ ] AC-4: Network assertions un-fakeable — grep mock count = 0, assertions contain 'api.anthropic.com' literal (flow_ref T-INFER-001,T-INFER-013)
- [ ] `grep -rE 'stub|mock|fake' services/platform/src/inference/resolve-model.ts | wc -l` green + `pnpm tsgo --noEmit` clean + `pnpm biome check .` clean (only SCOPE.writeAllowed files modified)

--------------------------------------------------------------------------------
ACCEPTANCE CRITERIA (TDD beads — RED before GREEN, proven by real services)
--------------------------------------------------------------------------------
AC-1 Router never reaches cloud via stub — grep match count = 0, holo verify:no-provider-refs exit 0 (flow_ref T-INFER-001,T-INFER-002)
  GIVEN: implemented-router source from infer-1; holo CLI available
  WHEN:  Running grep -r 'stub|mock|fake' over router source; running holo verify:no-provider-refs
  THEN:  Grep match count = 0; holo verify:no-provider-refs exits with code 0; direct-provider count = 0
  TEST_TIER: e2e · VERIFICATION_SERVICE: litellm-fleet · TDD_STATE: red→green
  SCENARIO — start_ref: implemented-router · evidence: stdout
    NEGATIVE_CONTROL: would fail if Router contains stub that returns fake endpoint without fleet call (stub impl); Router contains mock that always returns cloud provider (static cloud); Grep pattern omits stub variants so stubs undetected (omitted pattern)
    MUST_OBSERVE: grep match count equals 0; holo verify:no-provider-refs exit code equals 0; holo verify:no-provider-refs stdout contains '0 direct provider references'
    MUST_NOT_OBSERVE: grep match count greater than 0 (stub present); holo verify:no-provider-refs exit code not equal to 0 (failure); holo verify:no-provider-refs stdout contains 'claudeFlash' or 'claudePro' (direct refs)

AC-2 Escape path has budget pre-check — budget_ledger row count ≥ 1, holo budget:status spent > 0 (flow_ref T-INFER-011,T-INFER-012)
  GIVEN: implemented-budget-ledger from infer-2; Postgres with budget_ledger table
  WHEN:  Querying budget_ledger for pre-check records; running holo budget:status
  THEN:  budget_ledger row count ≥ 1 for pre-check type; holo budget:status shows spent > 0
  TEST_TIER: e2e · VERIFICATION_SERVICE: postgres · TDD_STATE: red→green
  SCENARIO — start_ref: implemented-budget-ledger · evidence: db_query
    NEGATIVE_CONTROL: would fail if Escape path calls Anthropic without budget check (no pre-check); budget_ledger table empty or missing pre-check rows (empty table); checkBudget function stubbed to always return true (static true)
    MUST_OBSERVE: budget_ledger row count for check_type = 'pre-check' greater than or equal to 1; holo budget:status spent field greater than 0; budget_ledger contains record with role 'divergent' and allowEscape = true
    MUST_NOT_OBSERVE: budget_ledger row count for check_type = 'pre-check' equals 0 (no pre-check); holo budget:status spent equals 0 (zero spent); budget_ledger missing records with allowEscape = true (no escape)

AC-3 Degraded mode never falls back to cloud — degraded-state = 'surface-unavailable', resume-state = 'normal' (flow_ref T-INFER-014,T-INFER-015,T-INFER-016)
  GIVEN: implemented-degraded-mode from infer-3; network capture table; degraded-mode state fields
  WHEN:  Reviewing degraded-mode implementation; querying degraded-state field; checking network capture during degraded mode
  THEN:  degraded-state field = 'surface-unavailable'; resume-state field = 'normal'; network capture shows 0 api.anthropic.com requests
  TEST_TIER: e2e · VERIFICATION_SERVICE: litellm-fleet · TDD_STATE: red→green
  SCENARIO — start_ref: implemented-degraded-mode · evidence: db_query
    NEGATIVE_CONTROL: would fail if Degraded mode stub fallback to api.anthropic.com so cloud leakage (stub fallback); degraded-state field missing or set to 'normal' during fleet down (wrong state); Network capture static so cloud requests undetected (static capture)
    MUST_OBSERVE: degraded_state field equals 'surface-unavailable'; resume_state field equals 'normal'; network_capture row count for host = 'api.anthropic.com' equals 0
    MUST_NOT_OBSERVE: degraded_state field equals 'normal' during fleet down (no degraded); resume_state field equals 'surface-unavailable' after resume (stuck degraded); network_capture row count for host = 'api.anthropic.com' greater than 0 (cloud present)

AC-4 Network assertions un-fakeable — grep mock count = 0, assertions contain 'api.anthropic.com' literal (flow_ref T-INFER-001,T-INFER-013)
  GIVEN: implemented-red-suite from infer-4; RED test files with network assertions
  WHEN:  Running grep -r 'mock.*network.*capture' over test files; reviewing assertions for 'api.anthropic.com' literal
  THEN:  Grep match count = 0; assertions contain 'api.anthropic.com' literal with row count = 0
  TEST_TIER: e2e · VERIFICATION_SERVICE: litellm-fleet · TDD_STATE: red→green
  SCENARIO — start_ref: implemented-red-suite · evidence: stdout
    NEGATIVE_CONTROL: would fail if RED tests mock network capture to always return zero (fake capture); Network assertions stub patterns so always return zero (static pattern); Assertions omit 'api.anthropic.com' literal so cloud leaks undetected (missing check)
    MUST_OBSERVE: grep 'mock.*network.*capture' match count equals 0; grep 'api.anthropic.com' match count greater than or equal to 1; Assertions contain 'api.anthropic.com' with row count = 0
    MUST_NOT_OBSERVE: grep 'mock.*network.*capture' match count greater than 0 (mocks present); grep 'api.anthropic.com' match count equals 0 (literal missing); Assertions use only ':4545' without 'api.anthropic.com' literal (incomplete)

--------------------------------------------------------------------------------
SCOPE (writeAllowed)
--------------------------------------------------------------------------------
- .spec/evidence/infer-5-review-*.json (NEW)
writeProhibited: Any source code modification - reason: Review is read-only on implementation, Any fake evidence - reason: All evidence must come from real grep/db queries

--------------------------------------------------------------------------------
READING LIST
--------------------------------------------------------------------------------
1. services/platform/src/inference/resolve-model.ts lines 126-184
   - focus: Router implementation for stub detection
2. services/platform/src/inference/budget-ledger.ts lines 1-50
   - focus: Budget pre-check implementation
3. services/platform/src/inference/degraded-mode-controller.ts lines 1-50
   - focus: Degraded mode no-cloud enforcement
4. tests/integration/service/infer-red-*.test.ts lines 1-50
   - focus: Network assertion patterns

--------------------------------------------------------------------------------
EVIDENCE GATES
--------------------------------------------------------------------------------
- Router grep shows 0 stub matches: `grep -rE 'stub|mock|fake' services/platform/src/inference/resolve-model.ts | wc -l` → Exit 0 with output = 0
- holo verify:no-provider-refs passes: `bun services/platform/src/cli/holo.ts verify:no-provider-refs` → Exit 0
- budget_ledger has pre-check records: `PLATFORM_IT=1 psql -c "SELECT COUNT(*) FROM budget_ledger WHERE check_type = 'pre-check'"` → Exit 0 with count ≥ 1
- degraded_state shows surface-unavailable: `PLATFORM_IT=1 psql -c 'SELECT degraded_state FROM degraded_mode'` → Exit 0 with degraded_state = 'surface-unavailable'
- RED tests have 0 mock network capture: `grep -r 'mock.*network.*capture' tests/integration/service/infer-red-*.test.ts | wc -l` → Exit 0 with output = 0

--------------------------------------------------------------------------------
DESIGN NOTES
--------------------------------------------------------------------------------
- Review uses ONLY grep and db queries — no assumptions
- Evidence written to .spec/evidence/infer-5-review-*.json for audit trail
- Each AC verified independently with concrete observables
- pattern: Grep source → count matches → query database → verify fields → capture evidence
- pattern_source: brain/docs/e2e-testing-rules/README.md:1-50
- anti_pattern: Assuming implementation is correct without grep verification

--------------------------------------------------------------------------------
DEPENDENCIES
--------------------------------------------------------------------------------
Depends on: infer-1, infer-2, infer-3, infer-4 · Blocks: none

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "infer-5",
  "proposed_by": "mastra-planner",
  "tdd_mode": "skipped",
  "verification_policy": {
    "requires_tests": false,
    "requires_red_evidence": false,
    "requires_seeded_evidence": true
  },
  "fixtures": {
    "implemented-router": {
      "description": "resolveModel implementation from infer-1 with fleet routing and RoleUnavailableError",
      "seed_method": "public_api",
      "records": [
        "services/platform/src/inference/resolve-model.ts contains resolveModel function",
        "resolveModel routes to fleet endpoints via loadFleetManifest",
        "resolveModel throws RoleUnavailableError on endpoint failure"
      ]
    },
    "implemented-budget-ledger": {
      "description": "Budget ledger implementation from infer-2 with checkBudget and pre-check records",
      "seed_method": "public_api",
      "records": [
        "budget_ledger table exists with check_type column",
        "checkBudget function queries budget_ledger before allowing escape",
        "budget_ledger contains records with check_type = 'pre-check'"
      ]
    },
    "implemented-degraded-mode": {
      "description": "Degraded mode controller implementation from infer-3 with state transitions",
      "seed_method": "public_api",
      "records": [
        "degraded_mode table exists with degraded_state and resume_state columns",
        "DegradedModeController catches RoleUnavailableError",
        "degraded_state = 'surface-unavailable' during fleet down"
      ]
    },
    "implemented-red-suite": {
      "description": "RED test suite from infer-4 with network assertions",
      "seed_method": "public_api",
      "records": [
        "tests/integration/service/infer-red-*.test.ts files exist",
        "RED tests contain network capture assertions",
        "RED tests assert row count for api.anthropic.com = 0"
      ]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "primary": true,
      "description": "GIVEN implemented-router source from infer-1; holo CLI available WHEN Running grep -r 'stub|mock|fake' over router source; running holo verify:no-provider-refs THEN Grep match count = 0; holo verify:no-provider-refs exits with code 0; direct-provider count = 0",
      "verify": "grep -rE 'stub|mock|fake' services/platform/src/inference/resolve-model.ts | wc -l; bun services/platform/src/cli/holo.ts verify:no-provider-refs",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "e2e",
        "verification_service": "litellm-fleet",
        "negative_control": {
          "would_fail_if": [
            "Router contains stub that returns fake endpoint without fleet call (stub impl)",
            "Router contains mock that always returns cloud provider (static cloud)",
            "Grep pattern omits stub variants so stubs undetected (omitted pattern)"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "implemented-router",
            "action": {
              "actor": "mastra-reviewer",
              "steps": [
                "grep -rE 'stub|mock|fake' services/platform/src/inference/resolve-model.ts",
                "Count matches with wc -l",
                "Run holo verify:no-provider-refs",
                "Capture exit code"
              ]
            },
            "end_state": {
              "must_observe": [
                "grep match count equals 0",
                "holo verify:no-provider-refs exit code equals 0",
                "holo verify:no-provider-refs stdout contains '0 direct provider references'"
              ],
              "must_not_observe": [
                "grep match count greater than 0 (stub present)",
                "holo verify:no-provider-refs exit code not equal to 0 (failure)",
                "holo verify:no-provider-refs stdout contains 'claudeFlash' or 'claudePro' (direct refs)"
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
      "description": "GIVEN implemented-budget-ledger from infer-2; Postgres with budget_ledger table WHEN Querying budget_ledger for pre-check records; running holo budget:status THEN budget_ledger row count \u2265 1 for pre-check type; holo budget:status shows spent > 0",
      "verify": "PLATFORM_IT=1 psql -c \"SELECT COUNT(*) FROM budget_ledger WHERE check_type = 'pre-check'\"; bun services/platform/src/cli/holo.ts budget:status",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "e2e",
        "verification_service": "postgres",
        "negative_control": {
          "would_fail_if": [
            "Escape path calls Anthropic without budget check (no pre-check)",
            "budget_ledger table empty or missing pre-check rows (empty table)",
            "checkBudget function stubbed to always return true (static true)"
          ]
        },
        "evidence": {
          "artifact_type": "db_query",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "implemented-budget-ledger",
            "action": {
              "actor": "mastra-reviewer",
              "steps": [
                "Query budget_ledger for pre-check records",
                "Run holo budget:status",
                "Capture spent amount"
              ]
            },
            "end_state": {
              "must_observe": [
                "budget_ledger row count for check_type = 'pre-check' greater than or equal to 1",
                "holo budget:status spent field greater than 0",
                "budget_ledger contains record with role 'divergent' and allowEscape = true"
              ],
              "must_not_observe": [
                "budget_ledger row count for check_type = 'pre-check' equals 0 (no pre-check)",
                "holo budget:status spent equals 0 (zero spent)",
                "budget_ledger missing records with allowEscape = true (no escape)"
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
      "description": "GIVEN implemented-degraded-mode from infer-3; network capture table; degraded-mode state fields WHEN Reviewing degraded-mode implementation; querying degraded-state field; checking network capture during degraded mode THEN degraded-state field = 'surface-unavailable'; resume-state field = 'normal'; network capture shows 0 api.anthropic.com requests",
      "verify": "PLATFORM_IT=1 psql -c \"SELECT degraded_state, resume_state FROM degraded_mode; SELECT COUNT(*) FROM network_capture WHERE host = 'api.anthropic.com'\";",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "e2e",
        "verification_service": "litellm-fleet",
        "negative_control": {
          "would_fail_if": [
            "Degraded mode stub fallback to api.anthropic.com so cloud leakage (stub fallback)",
            "degraded-state field missing or set to 'normal' during fleet down (wrong state)",
            "Network capture static so cloud requests undetected (static capture)"
          ]
        },
        "evidence": {
          "artifact_type": "db_query",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "implemented-degraded-mode",
            "action": {
              "actor": "mastra-reviewer",
              "steps": [
                "Query degraded_mode table for degraded_state and resume_state",
                "Query network_capture table for api.anthropic.com hosts",
                "Verify degraded-state = 'surface-unavailable' during fleet down"
              ]
            },
            "end_state": {
              "must_observe": [
                "degraded_state field equals 'surface-unavailable'",
                "resume_state field equals 'normal'",
                "network_capture row count for host = 'api.anthropic.com' equals 0"
              ],
              "must_not_observe": [
                "degraded_state field equals 'normal' during fleet down (no degraded)",
                "resume_state field equals 'surface-unavailable' after resume (stuck degraded)",
                "network_capture row count for host = 'api.anthropic.com' greater than 0 (cloud present)"
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
      "description": "GIVEN implemented-red-suite from infer-4; RED test files with network assertions WHEN Running grep -r 'mock.*network.*capture' over test files; reviewing assertions for 'api.anthropic.com' literal THEN Grep match count = 0; assertions contain 'api.anthropic.com' literal with row count = 0",
      "verify": "grep -r 'mock.*network.*capture' tests/integration/service/infer-red-*.test.ts | wc -l; grep -r 'api.anthropic.com' tests/integration/service/infer-red-*.test.ts",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "e2e",
        "verification_service": "litellm-fleet",
        "negative_control": {
          "would_fail_if": [
            "RED tests mock network capture to always return zero (fake capture)",
            "Network assertions stub patterns so always return zero (static pattern)",
            "Assertions omit 'api.anthropic.com' literal so cloud leaks undetected (missing check)"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "implemented-red-suite",
            "action": {
              "actor": "mastra-reviewer",
              "steps": [
                "grep -r 'mock.*network.*capture' tests/integration/service/infer-red-*.test.ts",
                "Count matches with wc -l",
                "grep -r 'api.anthropic.com' tests/integration/service/infer-red-*.test.ts",
                "Verify assertions contain literal"
              ]
            },
            "end_state": {
              "must_observe": [
                "grep 'mock.*network.*capture' match count equals 0",
                "grep 'api.anthropic.com' match count greater than or equal to 1",
                "Assertions contain 'api.anthropic.com' with row count = 0"
              ],
              "must_not_observe": [
                "grep 'mock.*network.*capture' match count greater than 0 (mocks present)",
                "grep 'api.anthropic.com' match count equals 0 (literal missing)",
                "Assertions use only ':4545' without 'api.anthropic.com' literal (incomplete)"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "TC-1",
      "type": "test_criterion",
      "description": "Router grep shows 0 stub/mock/fake matches",
      "verify": "grep -rE 'stub|mock|fake' services/platform/src/inference/resolve-model.ts | wc -l",
      "maps_to_ac": "AC-1"
    },
    {
      "id": "TC-2",
      "type": "test_criterion",
      "description": "holo verify:no-provider-refs exits with code 0",
      "verify": "bun services/platform/src/cli/holo.ts verify:no-provider-refs",
      "maps_to_ac": "AC-1"
    },
    {
      "id": "TC-3",
      "type": "test_criterion",
      "description": "budget_ledger has \u2265 1 pre-check row",
      "verify": "PLATFORM_IT=1 psql -c \"SELECT COUNT(*) FROM budget_ledger WHERE check_type = 'pre-check'\"",
      "maps_to_ac": "AC-2"
    },
    {
      "id": "TC-4",
      "type": "test_criterion",
      "description": "holo budget:status shows spent > 0",
      "verify": "bun services/platform/src/cli/holo.ts budget:status",
      "maps_to_ac": "AC-2"
    },
    {
      "id": "TC-5",
      "type": "test_criterion",
      "description": "degraded_state = 'surface-unavailable' during fleet down",
      "verify": "PLATFORM_IT=1 psql -c 'SELECT degraded_state FROM degraded_mode'",
      "maps_to_ac": "AC-3"
    },
    {
      "id": "TC-6",
      "type": "test_criterion",
      "description": "network_capture shows 0 api.anthropic.com in degraded mode",
      "verify": "PLATFORM_IT=1 psql -c \"SELECT COUNT(*) FROM network_capture WHERE host = 'api.anthropic.com'\"",
      "maps_to_ac": "AC-3"
    },
    {
      "id": "TC-7",
      "type": "test_criterion",
      "description": "RED tests have 0 mock network capture",
      "verify": "grep -r 'mock.*network.*capture' tests/integration/service/infer-red-*.test.ts | wc -l",
      "maps_to_ac": "AC-4"
    },
    {
      "id": "TC-8",
      "type": "test_criterion",
      "description": "RED assertions contain 'api.anthropic.com' literal",
      "verify": "grep -r 'api.anthropic.com' tests/integration/service/infer-red-*.test.ts",
      "maps_to_ac": "AC-4"
    }
  ]
}
-->
</details>

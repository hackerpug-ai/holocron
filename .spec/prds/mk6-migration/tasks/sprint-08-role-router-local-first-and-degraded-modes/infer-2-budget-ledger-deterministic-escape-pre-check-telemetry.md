# infer-2 — Budget ledger + deterministic escape pre-check + per-escape telemetry

## What this does

Implement a budget ledger with deterministic pre-check that blocks over-budget Claude escapes before they fire and logs every successful escape with reason/tokens/cost to real Postgres

Provides: budget_ledger table + migrations, checkBudget() pre-check function, logEscape() telemetry function, holo budget:* operator commands.


## Why

- MUST Budget ledger table stores escape records with reason/tokens/cost/timestamp
- MUST checkBudget() pre-check blocks over-budget calls BEFORE Anthropic API fires
- MUST logEscape() writes ledger record AFTER successful Anthropic call
- MUST Every AC uses real Postgres (PLATFORM_IT=1) and real Anthropic API for escape test
- NEVER Allow an Anthropic call without passing checkBudget() first
- NEVER Record a ledger entry for a blocked (over-budget) call
- NEVER Stub the Anthropic API with fake success (must use real @ai-sdk/anthropic)
- STRICTLY All operations use real Postgres (PLATFORM_IT=1)
- STRICTLY Escape test uses real Anthropic API key (one budgeted call)
- STRICTLY Integration tests run against real Mastra server (mastra dev)

- Grounded in: UC-INFER-04

## How to verify

- `PLATFORM_IT=1 pnpm vitest run tests/integration/service/infer-budget-*.test.ts` → Exit 0 with 1 real Anthropic request made and logged
- `pnpm tsgo --noEmit` → Exit 0
- `pnpm biome check .` → Exit 0
- `PLATFORM_IT=1 pnpm vitest run tests/integration/service/infer-budget-precheck.test.ts` → Exit 0 with over-budget case showing 0 Anthropic network requests

## Scope

Writes: services/platform/src/db/migrations/0004_budget_ledger.sql (NEW) · services/platform/src/inference/budget-ledger.ts (NEW) · services/platform/src/inference/resolve-model.ts (MODIFY) · services/platform/src/cli/holo.ts (MODIFY) · tests/integration/service/infer-budget-*.test.ts (NEW)

Prohibited: services/platform/src/db/migrations/000*.sql where < 0004 - reason: Prior migrations locked · services/platform/src/db/schema/evidence.ts - reason: Evidence schema complete (UC-DATA-02) · Any stub that allows Anthropic call without passing checkBudget() - reason: Default-deny invariant


<details>
<summary>▸ Full agent specification (TASK-TEMPLATE v5.2 — required reading for implementer + reviewer)</summary>

================================================================================
TASK: infer-2 — Budget ledger + deterministic escape pre-check + per-escape telemetry
================================================================================

TASK_TYPE:  FEATURE
STATUS:     Backlog
PRIORITY:   P0
EFFORT:     M  (210 min)
AGENT:      mastra-implementer
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
Implement a budget ledger with deterministic pre-check that blocks over-budget Claude escapes before they fire and logs every successful escape with reason/tokens/cost to real Postgres
checkBudget() returns false for over-budget calls and true for within-budget; logEscape() writes ledger record with all required fields; holo infer:call --escape --cost 999 is blocked; one real holo infer:call --escape --highStakes within budget succeeds and logs; network capture shows Anthropic request only for successful escape

--------------------------------------------------------------------------------
🚫 CRITICAL CONSTRAINTS (Never tier)
--------------------------------------------------------------------------------
- MUST Budget ledger table stores escape records with reason/tokens/cost/timestamp
- MUST checkBudget() pre-check blocks over-budget calls BEFORE Anthropic API fires
- MUST logEscape() writes ledger record AFTER successful Anthropic call
- MUST Every AC uses real Postgres (PLATFORM_IT=1) and real Anthropic API for escape test
- NEVER Allow an Anthropic call without passing checkBudget() first
- NEVER Record a ledger entry for a blocked (over-budget) call
- NEVER Stub the Anthropic API with fake success (must use real @ai-sdk/anthropic)
- STRICTLY All operations use real Postgres (PLATFORM_IT=1)
- STRICTLY Escape test uses real Anthropic API key (one budgeted call)
- STRICTLY Integration tests run against real Mastra server (mastra dev)

--------------------------------------------------------------------------------
DONE WHEN
--------------------------------------------------------------------------------
- [ ] AC-1: Budget ledger table stores escape records with reason/tokens/cost (flow_ref T-INFER-012)
- [ ] AC-2: checkBudget() pre-check blocks over-budget escapes before API call (flow_ref T-INFER-011)
- [ ] AC-3: logEscape() records telemetry after successful Anthropic call (flow_ref T-INFER-012)
- [ ] AC-4: CLI operator commands holo budget:* query ledger and set ceiling (flow_ref T-INFER-012)
- [ ] `PLATFORM_IT=1 pnpm vitest run tests/integration/service/infer-budget-*.test.ts` green + `pnpm tsgo --noEmit` clean + `pnpm biome check .` clean (only SCOPE.writeAllowed files modified)

--------------------------------------------------------------------------------
ACCEPTANCE CRITERIA (TDD beads — RED before GREEN, proven by real services)
--------------------------------------------------------------------------------
AC-1 Budget ledger table stores escape records with reason/tokens/cost (flow_ref T-INFER-012)
  GIVEN: Drizzle migrations applied; budget_ledger table exists; Postgres running
  WHEN:  Inserting escape record via logEscape() after successful Anthropic call
  THEN:  Ledger row written with reason/tokens/cost/timestamp/runId/stepId; query returns 1 row with non-zero cost
  TEST_TIER: integration · VERIFICATION_SERVICE: postgres · TDD_STATE: red→green
  SCENARIO — start_ref: seeded-postgres · evidence: db_query
    NEGATIVE_CONTROL: would fail if budget_ledger table not created so migration missing/failed; logEscape() stubbed so no real INSERT; Fields missing or wrong type so schema drift
    MUST_OBSERVE: budget_ledger table exists with column reason data_type = 'text'; logEscape() INSERT exits with code 0; Query row count for budget_ledger = 1; Query result cost > 0
    MUST_NOT_OBSERVE: budget_ledger table missing so query fails with 'relation does not exist'; INSERT fails so row count = 0; Query result cost = 0 or NULL

AC-2 checkBudget() pre-check blocks over-budget escapes before API call (flow_ref T-INFER-011)
  GIVEN: Budget ledger with $10 ceiling; ledger shows $9 spent; network capture active
  WHEN:  Calling checkBudget($2) vs checkBudget($1) before Anthropic call
  THEN:  checkBudget($2) returns false (over-budget by $1); checkBudget($1) returns true (within-budget); Anthropic API never called for over-budget case
  TEST_TIER: integration · VERIFICATION_SERVICE: litellm-fleet · TDD_STATE: red→green
  SCENARIO — start_ref: seeded-budget-ledger · evidence: stdout
    NEGATIVE_CONTROL: would fail if checkBudget() stubbed to always return true so over-budget calls proceed; Pre-check skipped so allowEscape=true bypasses budget; Network capture mocked so shows no API call but real call occurred
    MUST_OBSERVE: checkBudget($2) returns false; checkBudget($1) returns true; network-capture row count for api.anthropic.com = 0
    MUST_NOT_OBSERVE: checkBudget($2) returns true; network-capture row count for api.anthropic.com > 0

AC-3 logEscape() records telemetry after successful Anthropic call (flow_ref T-INFER-012)
  GIVEN: Budget ledger exists; Anthropic API key valid; network capture active
  WHEN:  Making successful Anthropic call with reason/tokens/cost captured
  THEN:  logEscape() writes ledger row with reason/tokens/cost from response; network capture shows 1 Anthropic request; query confirms record
  TEST_TIER: integration · VERIFICATION_SERVICE: postgres · TDD_STATE: red→green
  SCENARIO — start_ref: seeded-budget-ledger · evidence: db_query
    NEGATIVE_CONTROL: would fail if logEscape() not called after Anthropic success; Anthropic response stubbed so fake tokens/cost; Network capture mocked so shows request but fake response
    MUST_OBSERVE: network-capture row count for api.anthropic.com ≥ 1; budget_ledger row count after logEscape() = 1; Query result cost > 0 matching response; Query result tokens > 0 matching response
    MUST_NOT_OBSERVE: logEscape() fails so no row in ledger; Record has cost = 0 or NULL; Record has tokens = 0 or NULL; network-capture row count for api.anthropic.com = 0

AC-4 CLI operator commands holo budget:* query ledger and set ceiling (flow_ref T-INFER-012)
  GIVEN: Budget ledger populated; Postgres running
  WHEN:  Running holo budget:status, holo budget:set --ceiling 50
  THEN:  holo budget:status shows total spent/remaining/ceiling; holo budget:set updates ceiling; query confirms change
  TEST_TIER: integration · VERIFICATION_SERVICE: postgres · TDD_STATE: red→green
  SCENARIO — start_ref: seeded-budget-ledger · evidence: stdout
    NEGATIVE_CONTROL: would fail if CLI commands not registered in holo.ts so stub/empty; Argument parsing stubbed so no real ceiling value; Database query mocked so fake status
    MUST_OBSERVE: stdout for budget:status contains '15'; holo budget:set exits with code 0; Query result ceiling = 50
    MUST_NOT_OBSERVE: stdout for budget:status shows total spent = 0; holo budget:set exits with code ≠ 0; Query result ceiling ≠ 50

--------------------------------------------------------------------------------
SCOPE (writeAllowed)
--------------------------------------------------------------------------------
- services/platform/src/db/migrations/0004_budget_ledger.sql (NEW)
- services/platform/src/inference/budget-ledger.ts (NEW)
- services/platform/src/inference/resolve-model.ts (MODIFY)
- services/platform/src/cli/holo.ts (MODIFY)
- tests/integration/service/infer-budget-*.test.ts (NEW)
writeProhibited: services/platform/src/db/migrations/000*.sql where < 0004 - reason: Prior migrations locked, services/platform/src/db/schema/evidence.ts - reason: Evidence schema complete (UC-DATA-02), Any stub that allows Anthropic call without passing checkBudget() - reason: Default-deny invariant

--------------------------------------------------------------------------------
READING LIST
--------------------------------------------------------------------------------
1. services/platform/src/db/migrate.ts lines 1-50
   - focus: Drizzle migration pattern for budget_ledger table
2. services/platform/src/db/probe.ts lines 1-80
   - focus: db:probe pattern for budget queries
3. services/platform/src/inference/budget-ledger.ts lines 1-80
   - focus: checkBudget and logEscape implementation
4. services/platform/src/cli/holo.ts lines 100-150
   - focus: CLI command pattern for holo budget:*
5. services/platform/src/inference/resolve-model.ts lines 126-184
   - focus: resolveModel integration point for budget pre-check

--------------------------------------------------------------------------------
EVIDENCE GATES
--------------------------------------------------------------------------------
- Integration tests pass: `PLATFORM_IT=1 pnpm vitest run tests/integration/service/infer-budget-*.test.ts` → Exit 0 with 1 real Anthropic request made and logged
- Typecheck passes: `pnpm tsgo --noEmit` → Exit 0
- Lint passes: `pnpm biome check .` → Exit 0
- Over-budget call blocked: `PLATFORM_IT=1 pnpm vitest run tests/integration/service/infer-budget-precheck.test.ts` → Exit 0 with over-budget case showing 0 Anthropic network requests

--------------------------------------------------------------------------------
DESIGN NOTES
--------------------------------------------------------------------------------
- resolveModel() (infer-1) calls checkBudget() before allowEscape=true proceeds
- logEscape() called only after successful Anthropic response
- Degraded-mode controller (infer-3) independent of budget checks
- pattern: checkBudget(cost) → boolean → if false block; if true allow Anthropic → logEscape(tokens,cost) → ledger INSERT
- pattern_source: services/platform/src/inference/budget-ledger.ts:1-80
- anti_pattern: Allow Anthropic call without pre-check or post-telemetry (breaks default-deny invariant)

--------------------------------------------------------------------------------
DEPENDENCIES
--------------------------------------------------------------------------------
Depends on: infer-1 · Blocks: infer-3, infer-4, infer-5

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "infer-2",
  "proposed_by": "mastra-planner",
  "tdd_mode": "red_first",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": true,
    "requires_seeded_evidence": true
  },
  "fixtures": {
    "seeded-postgres": {
      "description": "Postgres with all migrations applied, including budget_ledger table",
      "seed_method": "public_api",
      "records": [
        "Run holo db:migrate to apply migrations",
        "budget_ledger table exists with columns id/reason/tokens/cost/timestamp/runId/stepId",
        "budget_ceiling table exists with column ceiling"
      ]
    },
    "seeded-budget-ledger": {
      "description": "Budget ledger with 3 escape records totaling $15 spent, ceiling $10",
      "seed_method": "public_api",
      "records": [
        "INSERT 3 records into budget_ledger with costs $5, $5, $5",
        "Total spent = $15 (over default $10 ceiling)",
        "All records have timestamp, reason, runId, stepId populated"
      ]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "primary": true,
      "description": "GIVEN Drizzle migrations applied; budget_ledger table exists; Postgres running WHEN Inserting escape record via logEscape() after successful Anthropic call THEN Ledger row written with reason/tokens/cost/timestamp/runId/stepId; query returns 1 row with non-zero cost",
      "verify": "PLATFORM_IT=1 pnpm vitest run tests/integration/service/infer-budget-ledger-persistence.test.ts",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "postgres",
        "negative_control": {
          "would_fail_if": [
            "budget_ledger table not created so migration missing/failed",
            "logEscape() stubbed so no real INSERT",
            "Fields missing or wrong type so schema drift"
          ]
        },
        "evidence": {
          "artifact_type": "db_query",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "seeded-postgres",
            "action": {
              "actor": "operator",
              "steps": [
                "Run holo db:migrate to apply budget_ledger table",
                "Make real Anthropic call with allowEscape=true and sufficient budget",
                "Call logEscape() with reason/tokens/cost",
                "Query budget_ledger table"
              ]
            },
            "end_state": {
              "must_observe": [
                "budget_ledger table exists with column reason data_type = 'text'",
                "logEscape() INSERT exits with code 0",
                "Query row count for budget_ledger = 1",
                "Query result cost > 0"
              ],
              "must_not_observe": [
                "budget_ledger table missing so query fails with 'relation does not exist'",
                "INSERT fails so row count = 0",
                "Query result cost = 0 or NULL"
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
      "description": "GIVEN Budget ledger with $10 ceiling; ledger shows $9 spent; network capture active WHEN Calling checkBudget($2) vs checkBudget($1) before Anthropic call THEN checkBudget($2) returns false (over-budget by $1); checkBudget($1) returns true (within-budget); Anthropic API never called for over-budget case",
      "verify": "PLATFORM_IT=1 pnpm vitest run tests/integration/service/infer-budget-precheck.test.ts",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "litellm-fleet",
        "negative_control": {
          "would_fail_if": [
            "checkBudget() stubbed to always return true so over-budget calls proceed",
            "Pre-check skipped so allowEscape=true bypasses budget",
            "Network capture mocked so shows no API call but real call occurred"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "seeded-budget-ledger",
            "action": {
              "actor": "operator",
              "steps": [
                "Seed budget_ledger with $9 spent (ceiling $10)",
                "Call checkBudget($2) and capture result",
                "Call checkBudget($1) and capture result",
                "Review network capture for Anthropic requests"
              ]
            },
            "end_state": {
              "must_observe": [
                "checkBudget($2) returns false",
                "checkBudget($1) returns true",
                "network-capture row count for api.anthropic.com = 0"
              ],
              "must_not_observe": [
                "checkBudget($2) returns true",
                "network-capture row count for api.anthropic.com > 0"
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
      "description": "GIVEN Budget ledger exists; Anthropic API key valid; network capture active WHEN Making successful Anthropic call with reason/tokens/cost captured THEN logEscape() writes ledger row with reason/tokens/cost from response; network capture shows 1 Anthropic request; query confirms record",
      "verify": "PLATFORM_IT=1 pnpm vitest run tests/integration/service/infer-escape-telemetry.test.ts",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "postgres",
        "negative_control": {
          "would_fail_if": [
            "logEscape() not called after Anthropic success",
            "Anthropic response stubbed so fake tokens/cost",
            "Network capture mocked so shows request but fake response"
          ]
        },
        "evidence": {
          "artifact_type": "db_query",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "seeded-budget-ledger",
            "action": {
              "actor": "operator",
              "steps": [
                "Run holo infer:call --escape --highStakes with sufficient budget",
                "Capture Anthropic response tokens/cost",
                "Call logEscape() with response data",
                "Query budget_ledger for latest record"
              ]
            },
            "end_state": {
              "must_observe": [
                "network-capture row count for api.anthropic.com \u2265 1",
                "budget_ledger row count after logEscape() = 1",
                "Query result cost > 0 matching response",
                "Query result tokens > 0 matching response"
              ],
              "must_not_observe": [
                "logEscape() fails so no row in ledger",
                "Record has cost = 0 or NULL",
                "Record has tokens = 0 or NULL",
                "network-capture row count for api.anthropic.com = 0"
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
      "description": "GIVEN Budget ledger populated; Postgres running WHEN Running holo budget:status, holo budget:set --ceiling 50 THEN holo budget:status shows total spent/remaining/ceiling; holo budget:set updates ceiling; query confirms change",
      "verify": "PLATFORM_IT=1 pnpm vitest run tests/integration/service/infer-budget-cli.test.ts",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "postgres",
        "negative_control": {
          "would_fail_if": [
            "CLI commands not registered in holo.ts so stub/empty",
            "Argument parsing stubbed so no real ceiling value",
            "Database query mocked so fake status"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "seeded-budget-ledger",
            "action": {
              "actor": "operator",
              "steps": [
                "Seed budget_ledger with 3 escape records totaling $15",
                "Run holo budget:status and capture output",
                "Run holo budget:set --ceiling 50 and capture output",
                "Query budget ceiling table"
              ]
            },
            "end_state": {
              "must_observe": [
                "stdout for budget:status contains '15'",
                "holo budget:set exits with code 0",
                "Query result ceiling = 50"
              ],
              "must_not_observe": [
                "stdout for budget:status shows total spent = 0",
                "holo budget:set exits with code \u2260 0",
                "Query result ceiling \u2260 50"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "TC-1",
      "type": "test_criterion",
      "description": "Budget ledger table persists escape records with reason/tokens/cost",
      "verify": "PLATFORM_IT=1 pnpm vitest run tests/integration/service/infer-budget-ledger-persistence.test.ts",
      "maps_to_ac": "AC-1"
    },
    {
      "id": "TC-2",
      "type": "test_criterion",
      "description": "checkBudget pre-check returns false for over-budget calls",
      "verify": "PLATFORM_IT=1 pnpm vitest run tests/integration/service/infer-budget-precheck.test.ts",
      "maps_to_ac": "AC-2"
    },
    {
      "id": "TC-3",
      "type": "test_criterion",
      "description": "checkBudget pre-check returns true for within-budget calls",
      "verify": "PLATFORM_IT=1 pnpm vitest run tests/integration/service/infer-budget-precheck.test.ts",
      "maps_to_ac": "AC-2"
    },
    {
      "id": "TC-4",
      "type": "test_criterion",
      "description": "logEscape records telemetry after successful Anthropic call",
      "verify": "PLATFORM_IT=1 pnpm vitest run tests/integration/service/infer-escape-telemetry.test.ts",
      "maps_to_ac": "AC-3"
    },
    {
      "id": "TC-5",
      "type": "test_criterion",
      "description": "holo budget:status shows total spent and ceiling",
      "verify": "PLATFORM_IT=1 pnpm vitest run tests/integration/service/infer-budget-cli.test.ts",
      "maps_to_ac": "AC-4"
    },
    {
      "id": "TC-6",
      "type": "test_criterion",
      "description": "holo budget:set updates ceiling in database",
      "verify": "PLATFORM_IT=1 pnpm vitest run tests/integration/service/infer-budget-cli.test.ts",
      "maps_to_ac": "AC-4"
    }
  ]
}
-->
</details>

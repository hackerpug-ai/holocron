# REDHAT-FIX-H5 — Hard budget pre-check: reject estimatedCostUsd <= 0 for real escapes, transactional reserve, consistent ceiling source, fail-closed ledger write (fresh red-hat H5: soft/gameable budget)

## What this does

Close red-hat H5 by making budget pre-check a hard spend control: reject non-positive estimates, transactional reserve against the ceiling, consistent ceiling source, and fail-closed ledger writes after escape success.

Provides: hard-budget-precheck, reject-zero-estimatedCostUsd, transactional-budget-reserve, consistent-ceiling-source, fail-closed-post-escape-ledger.

## Why

- MUST Reject estimatedCostUsd <= 0 for real escape pre-check (BUDGET_INVALID_ESTIMATE or equivalent) before Anthropic
- MUST Implement transactional reserve (BEGIN; lock ceiling/spent; check; optional reservation row; COMMIT) in checkBudget/runBudgetedEscape path
- MUST ake ceiling source consistent between checkBudget and getBudgetStatus (fix env override reporting or stop env overriding without status visibility)
- MUST Fail closed if post-generateText logEscape/ledger write fails after a successful model call
- MUST Preserve pre-check audit rows (check_type='pre-check', cost=0) behavior from infer-5
- MUST Prove with PLATFORM_IT=1: --cost 0 / estimatedCostUsd:0 does not contact Anthropic; concurrent or sequential tiny remaining cannot pass zero estimate
- MUST RED evidence under .spec/evidence/redhat-fix-h5*
- NEVER allow estimatedCostUsd=0 to pass when remaining is tiny but positive
- NEVER keep soft coerce of invalid estimates to 0 that opens the gate
- NEVER report success when ledger write failed after Anthropic spend
- NEVER mock Postgres for budget invariant proofs
- NEVER parallel-edit budget-ledger.ts against H1 without sequencing — depends_on H1
- STRICTLY depends_on REDHAT-FIX-H1 (same file conflict on budget-ledger.ts)
- STRICTLY real Postgres PLATFORM_IT=1 for spend proofs
- STRICTLY network capture shows anthropicHits:0 for zero/invalid estimate and over-budget
- STRICTLY red_first
- Grounded in: UC-INFER-01, UC-INFER-04, UC-INFER-05, T-INFER-011, T-INFER-012, CAP-INF-01

## How to verify

- `PLATFORM_IT=1 pnpm vitest run tests/integration/service/infer-budget-hard-precheck.test.ts tests/integration/service/infer-budget-precheck.test.ts tests/integration/service/infer-budget-cli.test.ts tests/integration/service/infer-budget-ledger-persistence.test.ts tests/integration/service/infer-red-over-budget.test.ts tests/integration/service/infer-escape-telemetry.test.ts` → Exit 0
- `pnpm tsgo --noEmit` → Exit 0
- `pnpm biome check .` → Exit 0

## Scope

Writes: services/platform/src/inference/budget-ledger.ts (MODIFY — sequential after H1) · services/platform/src/cli/holo.ts (MODIFY — reject --cost <=0 for escape; status fields if needed) · services/platform/src/db/migrations/*budget* (NEW only if reservation table/columns required) · services/platform/src/db/migrations/meta/** (MODIFY if migration added) · tests/integration/service/infer-budget-hard-precheck.test.ts (NEW) · tests/integration/service/infer-budget-precheck.test.ts (MODIFY) · tests/integration/service/infer-budget-cli.test.ts (MODIFY) · tests/integration/service/infer-budget-ledger-persistence.test.ts (MODIFY) · tests/integration/service/infer-red-over-budget.test.ts (MODIFY) · .tmp/redhat-fix-h5*/** (NEW) · .spec/evidence/redhat-fix-h5* (NEW)

Prohibited: services/platform/src/compat/** — H3 · Weakening H1/H4 never-cloud while editing budget-ledger · app/** — out of scope · Mocked postgres budget proofs

<details>
<summary>▸ Full agent specification (TASK-TEMPLATE v5.2 — required reading for implementer + reviewer)</summary>

================================================================================
TASK: REDHAT-FIX-H5 — Hard budget pre-check: reject estimatedCostUsd <= 0 for real escapes, transactional reserve, consistent ceiling source, fail-closed ledger write (fresh red-hat H5: soft/gameable budget)
================================================================================

TASK_TYPE:  FEATURE
STATUS:     Backlog
PRIORITY:   P0
EFFORT:     M  (150 min)
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
estimatedCostUsd<=0 is refused with zero Anthropic; concurrent-safe reserve prevents double-spend of remaining; status and gate share ceiling truth; post-escape ledger failure does not report clean success that undercounts spend.

--------------------------------------------------------------------------------
🚫 CRITICAL CONSTRAINTS (Never tier)
--------------------------------------------------------------------------------
- MUST Reject estimatedCostUsd <= 0 for real escape pre-check (BUDGET_INVALID_ESTIMATE or equivalent) before Anthropic
- MUST Implement transactional reserve (BEGIN; lock ceiling/spent; check; optional reservation row; COMMIT) in checkBudget/runBudgetedEscape path
- MUST ake ceiling source consistent between checkBudget and getBudgetStatus (fix env override reporting or stop env overriding without status visibility)
- MUST Fail closed if post-generateText logEscape/ledger write fails after a successful model call
- MUST Preserve pre-check audit rows (check_type='pre-check', cost=0) behavior from infer-5
- MUST Prove with PLATFORM_IT=1: --cost 0 / estimatedCostUsd:0 does not contact Anthropic; concurrent or sequential tiny remaining cannot pass zero estimate
- MUST RED evidence under .spec/evidence/redhat-fix-h5*
- NEVER allow estimatedCostUsd=0 to pass when remaining is tiny but positive
- NEVER keep soft coerce of invalid estimates to 0 that opens the gate
- NEVER report success when ledger write failed after Anthropic spend
- NEVER mock Postgres for budget invariant proofs
- NEVER parallel-edit budget-ledger.ts against H1 without sequencing — depends_on H1
- STRICTLY depends_on REDHAT-FIX-H1 (same file conflict on budget-ledger.ts)
- STRICTLY real Postgres PLATFORM_IT=1 for spend proofs
- STRICTLY network capture shows anthropicHits:0 for zero/invalid estimate and over-budget
- STRICTLY red_first

--------------------------------------------------------------------------------
BOUNDARY CONTRACTS
--------------------------------------------------------------------------------
- Real escapes MUST reject estimatedCostUsd <= 0 (CLI --cost 0 cannot game remaining tiny ceiling)
- Budget check/reserve MUST be transactional (SELECT FOR UPDATE or equivalent) to prevent concurrent TOCTOU double-spend of ceiling
- Ceiling source for gate and budget:status MUST be consistent (document and implement single source of truth — prefer DB ceiling with env only as explicit override reflected in status)
- If generateText succeeds but ledger write fails, path MUST fail closed (surface error; do not report silent success that undercounts spend)

--------------------------------------------------------------------------------
DONE WHEN
--------------------------------------------------------------------------------
- [ ] AC-1: Reject estimatedCostUsd <= 0 for real escapes (PRIMARY)
- [ ] AC-2: Transactional reserve against ceiling
- [ ] AC-3: Consistent ceiling source for gate and status
- [ ] AC-4: Fail-closed if ledger write fails after successful generateText
- [ ] AC-5: Honest within-budget estimate still works with pre-check audit
- [ ] AC-6: RED soft-budget evidence archived
- [ ] Verification gates green + typecheck + lint (only SCOPE.writeAllowed files modified)

--------------------------------------------------------------------------------
ACCEPTANCE CRITERIA (TDD beads — RED before GREEN, proven by real services)
--------------------------------------------------------------------------------
AC-1 Reject estimatedCostUsd <= 0 for real escapes [PRIMARY] (flow_ref T-INFER-011)
  GIVEN: tiny-remaining-ceiling or any configured ceiling>0
  WHEN:  checkBudget / runBudgetedEscape / CLI --escape --cost 0 with estimatedCostUsd<=0
  THEN:  Refuse with BUDGET_INVALID_ESTIMATE (or equivalent); anthropicHits:0; pre-check audit may record fail
  TEST_TIER: integration · VERIFICATION_SERVICE: postgres · TDD_STATE: none
  VERIFY: PLATFORM_IT=1 pnpm vitest run tests/integration/service/infer-budget-hard-precheck.test.ts tests/integration/service/infer-budget-precheck.test.ts
  SCENARIO — start_ref: tiny-remaining-ceiling · evidence: network_capture
    NEGATIVE_CONTROL: would fail if estimatedCostUsd=0 coerced and passes when remaining>0; CLI --cost 0 contacts Anthropic; stub checkBudget always ok; empty estimate treated as free escape
    EVIDENCE: network_capture (required_capture=True)
    CASE[0] start_ref: tiny-remaining-ceiling
      actor: adversary
      - Install network capture
      - checkBudget({ estimatedCostUsd:0, allowEscape:true, role:'divergent' })
      - runBudgetedEscape with estimatedCostUsd:0
      - CLI path --cost 0 if covered
      MUST_OBSERVE:
        - result.ok === false OR throw BudgetExceededError/BudgetInvalidEstimate
        - code BUDGET_INVALID_ESTIMATE OR reason containing invalid/non-positive estimate
        - anthropicCount:0 OR anthropicHits:0
      MUST_NOT_OBSERVE:
        - ok:true for estimatedCostUsd:0 real escape
        - api.anthropic.com contact
        - escape check_type='escape' spend row from zero-estimate success
AC-2 Transactional reserve against ceiling (flow_ref UC-INFER-04)
  GIVEN: Ceiling and spent such that only one of two concurrent estimatedCostUsd near remaining can succeed
  WHEN:  Two checkBudget/reserve or runBudgetedEscape attempts race with estimates that sum above remaining
  THEN:  At most one succeeds; second gets BUDGET_EXCEEDED; no double-spend beyond ceiling by more than one reserved estimate (invariant: spent+reserved <= ceiling after serialization)
  TEST_TIER: integration · VERIFICATION_SERVICE: postgres · TDD_STATE: none
  VERIFY: PLATFORM_IT=1 pnpm vitest run tests/integration/service/infer-budget-hard-precheck.test.ts
  SCENARIO — start_ref: tiny-remaining-ceiling · evidence: db_query
    NEGATIVE_CONTROL: would fail if no SELECT FOR UPDATE / transactional lock — both pass TOCTOU; soft pre-check without reservation; mock sql client serializing artificially without proving lock
    EVIDENCE: db_query (required_capture=True)
    CASE[0] start_ref: tiny-remaining-ceiling
      actor: adversary
      - Set remaining such that estimate A and B each alone fit but A+B exceed
      - Run two concurrent reserves/pre-checks
      - Count successes and final spent/reserved
      MUST_OBSERVE:
        - success_count === 1 OR (success_count<=1 with second code BUDGET_EXCEEDED)
        - transactional lock path executed (evidence: serialization or reservation row count)
        - SUM(cost of escape rows) + active reserves does not exceed ceiling by full second estimate
      MUST_NOT_OBSERVE:
        - success_count === 2 for mutually exclusive estimates
        - both ok:true without lock
AC-3 Consistent ceiling source for gate and status (flow_ref T-INFER-012)
  GIVEN: env-ceiling-override-mismatch fixture
  WHEN:  Operator calls getBudgetStatus / budget:status and checkBudget
  THEN:  Reported ceiling used for decisions is consistent and visible (either both use env override and status shows effective ceiling, or env no longer silently overrides DB-only status)
  TEST_TIER: integration · VERIFICATION_SERVICE: postgres · TDD_STATE: none
  VERIFY: PLATFORM_IT=1 pnpm vitest run tests/integration/service/infer-budget-hard-precheck.test.ts tests/integration/service/infer-budget-cli.test.ts
  SCENARIO — start_ref: env-ceiling-override-mismatch · evidence: db_query
    NEGATIVE_CONTROL: would fail if HOLO_ESCAPE_BUDGET_USD overrides checkBudget while budget:status still reports only DB ceiling without effectiveCeiling field; silent dual ceilings; stub status
    EVIDENCE: db_query (required_capture=True)
    CASE[0] start_ref: env-ceiling-override-mismatch
      actor: operator
      - Read getBudgetStatus()
      - Run checkBudget with small estimate
      - Assert effective ceiling fields match the gate used
      MUST_OBSERVE:
        - status.ceiling OR status.effectiveCeiling equals checkBudget.ceilingUsd used for decision
        - non-empty numeric ceiling value documented as source env|db
      MUST_NOT_OBSERVE:
        - gate uses 999 while status shows 1 with no effectiveCeiling disclosure
        - empty ceiling fields
AC-4 Fail-closed if ledger write fails after successful generateText (flow_ref UC-INFER-04)
  GIVEN: within-budget-honest-estimate and a fault injection that makes logEscape fail after generateText (e.g. broken DATABASE_URL only for post-write, or test hook)
  WHEN:  runBudgetedEscape completes model call then fails ledger insert
  THEN:  API throws/fails closed; does not return clean success that undercounts spend; operator-visible error
  TEST_TIER: integration · VERIFICATION_SERVICE: postgres · TDD_STATE: none
  VERIFY: PLATFORM_IT=1 pnpm vitest run tests/integration/service/infer-budget-hard-precheck.test.ts
  SCENARIO — start_ref: within-budget-honest-estimate · evidence: api_response
    NEGATIVE_CONTROL: would fail if post-generateText log failure still returns { text, cost, ledgerId } success undercounting spend; swallowed logEscape error; stub generateText without real path when claiming fail-closed after success
    EVIDENCE: api_response (required_capture=True)
    CASE[0] start_ref: within-budget-honest-estimate
      actor: adversary
      - Inject ledger write failure after model success (test-only hook or forced logEscape throw)
      - Invoke runBudgetedEscape
      - Capture thrown error; assert no clean success payload with empty ledgerId treated as ok
      MUST_OBSERVE:
        - thrown error or ok:false with ledger/budget write failure reason non-empty
        - no returned ledgerId UUID for a path that claims success
      MUST_NOT_OBSERVE:
        - return { ok:true, ledgerId:'', cost:0 } after real tokens when write failed
        - silent undercount success
AC-5 Honest within-budget estimate still works with pre-check audit (flow_ref T-INFER-012)
  GIVEN: within-budget-honest-estimate
  WHEN:  runBudgetedEscape with estimatedCostUsd=0.05
  THEN:  Pre-check audit row exists; escape may succeed with cost>0 and ledgerId; anthropic may be contacted
  TEST_TIER: integration · VERIFICATION_SERVICE: anthropic · TDD_STATE: none
  VERIFY: PLATFORM_IT=1 pnpm vitest run tests/integration/service/infer-budget-precheck.test.ts tests/integration/service/infer-escape-telemetry.test.ts tests/integration/service/infer-budget-hard-precheck.test.ts
  SCENARIO — start_ref: within-budget-honest-estimate · evidence: db_query
    NEGATIVE_CONTROL: would fail if hard pre-check blocks all positive estimates; pre-check audit rows disappear; stub success without ledger
    EVIDENCE: db_query (required_capture=True)
    CASE[0] start_ref: within-budget-honest-estimate
      actor: operator
      - runBudgetedEscape estimatedCostUsd=0.05
      - Query budget_ledger for pre-check and escape rows
      MUST_OBSERVE:
        - pre-check audit row check_type='pre-check' with cost=0 count >= 1
        - escape success cost > 0 and ledgerId non-empty
        - estimatedCostUsd 0.05 accepted (ok path)
      MUST_NOT_OBSERVE:
        - BUDGET_INVALID_ESTIMATE for positive 0.05
        - pre-check rows missing after checkBudget
AC-6 RED soft-budget evidence archived (flow_ref UC-INFER-04)
  GIVEN: red_first showing estimatedCostUsd=0 pass and/or TOCTOU/soft undercount
  WHEN:  Task completes
  THEN:  .spec/evidence/redhat-fix-h5* has red gameability artifact and green hard-precheck proof
  TEST_TIER: integration · VERIFICATION_SERVICE: filesystem · TDD_STATE: none
  VERIFY: PLATFORM_IT=1 pnpm vitest run tests/integration/service/infer-budget-hard-precheck.test.ts
  SCENARIO — start_ref: tiny-remaining-ceiling · evidence: file_artifact
    NEGATIVE_CONTROL: would fail if no red evidence; green-only; empty artifact
    EVIDENCE: file_artifact (required_capture=True)
    CASE[0] start_ref: tiny-remaining-ceiling
      actor: operator
      - Write red: estimatedCostUsd=0 would pass soft gate
      - Write green: invalid estimate refused + anthropicHits:0 + consistent ceiling note
      MUST_OBSERVE:
        - artifact path matches redhat-fix-h5*
        - green includes BUDGET_INVALID_ESTIMATE or invalid estimate refuse for 0
        - green includes anthropicCount:0 for zero-estimate attempt
      MUST_NOT_OBSERVE:
        - empty evidence
        - green claiming hard budget without zero-estimate case

--------------------------------------------------------------------------------
TEST CRITERIA (boolean statements mapping to ACs)
--------------------------------------------------------------------------------
| ID | Statement | Maps to | Verify | Type |
|----|-----------|---------|--------|------|
| TC-1 | estimatedCostUsd<=0 is refused and anthropicHits===0 | AC-1 | `PLATFORM_IT=1 pnpm vitest run tests/integration/service/infer-budget-hard-precheck.test.ts` | negative |
| TC-2 | Concurrent mutually exclusive estimates yield at most one success under transactional reserve | AC-2 | `PLATFORM_IT=1 pnpm vitest run tests/integration/service/infer-budget-hard-precheck.test.ts` | invariant |
| TC-3 | budget:status effective ceiling matches checkBudget ceilingUsd decision source | AC-3 | `PLATFORM_IT=1 pnpm vitest run tests/integration/service/infer-budget-hard-precheck.test.ts tests/integration/service/infer-budget-cli.test.ts` | invariant |
| TC-4 | Ledger write failure after generateText fails closed (no clean undercount success) | AC-4 | `PLATFORM_IT=1 pnpm vitest run tests/integration/service/infer-budget-hard-precheck.test.ts` | negative |
| TC-5 | Honest estimatedCostUsd=0.05 still meters escape with pre-check audit row present | AC-5 | `PLATFORM_IT=1 pnpm vitest run tests/integration/service/infer-budget-hard-precheck.test.ts tests/integration/service/infer-budget-precheck.test.ts tests/integration/service/infer-escape-telemetry.test.ts` | happy_path |
| TC-6 | redhat-fix-h5* red/green evidence artifacts exist | AC-6 | `PLATFORM_IT=1 pnpm vitest run tests/integration/service/infer-budget-hard-precheck.test.ts` | red_evidence |

--------------------------------------------------------------------------------
SCOPE (file-level write permissions)
--------------------------------------------------------------------------------

writeAllowed:
- services/platform/src/inference/budget-ledger.ts (MODIFY — sequential after H1)
- services/platform/src/cli/holo.ts (MODIFY — reject --cost <=0 for escape; status fields if needed)
- services/platform/src/db/migrations/*budget* (NEW only if reservation table/columns required)
- services/platform/src/db/migrations/meta/** (MODIFY if migration added)
- tests/integration/service/infer-budget-hard-precheck.test.ts (NEW)
- tests/integration/service/infer-budget-precheck.test.ts (MODIFY)
- tests/integration/service/infer-budget-cli.test.ts (MODIFY)
- tests/integration/service/infer-budget-ledger-persistence.test.ts (MODIFY)
- tests/integration/service/infer-red-over-budget.test.ts (MODIFY)
- .tmp/redhat-fix-h5*/** (NEW)
- .spec/evidence/redhat-fix-h5* (NEW)

writeProhibited:
- services/platform/src/compat/** — H3
- Weakening H1/H4 never-cloud while editing budget-ledger
- app/** — out of scope
- Mocked postgres budget proofs

--------------------------------------------------------------------------------
READING LIST
--------------------------------------------------------------------------------
- `.spec/reviews/red-hat-2026-07-16T03-47-51Z-sprint08.md` (H5 section) — Soft/gameable budget: zero estimate, no FOR UPDATE, env/DB ceiling split, log failure undercount
- `services/platform/src/inference/budget-ledger.ts` (124-200, 326-568) — readEnvCeilingUsd, getBudgetStatus DB-only ceiling note, checkBudget coerce, runBudgetedEscape logEscape after generateText
- `services/platform/src/cli/holo.ts` (1233-1294, 1578-1634) — CLI --cost parsing defaults; budget:status / budget:set
- `tests/integration/service/infer-budget-precheck.test.ts` (all) — Extend existing budget pre-check suite
- `tests/integration/service/infer-red-over-budget.test.ts` (all) — Over-budget RED patterns

--------------------------------------------------------------------------------
DESIGN / PATTERN
--------------------------------------------------------------------------------
References: .spec/reviews/red-hat-2026-07-16T03-47-51Z-sprint08.md, UC-INFER-04, T-INFER-011, T-INFER-012
- FILE CONFLICT: budget-ledger.ts also touched by H1 — H5 depends_on H1 and lands after
- Keep pre-check audit INSERT fail-closed behavior from c856514
- Optional reservation row: budget_ledger check_type='reserve' or dedicated table — implementer chooses with real SQL lock
Pattern: Hard reject non-positive estimates; BEGIN+SELECT FOR UPDATE spent/ceiling; consistent effective ceiling; throw if logEscape fails after generateText
Pattern source: budget-ledger.ts checkBudget + runBudgetedEscape
Anti-pattern: estimatedCostUsd=0 pass; soft coerce; env/DB ceiling dual truth; silent log failure undercount; non-transactional TOCTOU

--------------------------------------------------------------------------------
AGENT ASSIGNMENT
--------------------------------------------------------------------------------
Implementer: mastra-implementer — Hardens checkBudget/runBudgetedEscape spend control on real Postgres budget ledger; sequential after H1 due to shared budget-ledger.ts writes.
Reviewer: mastra-reviewer
Proposed by: mastra-planner

--------------------------------------------------------------------------------
VERIFICATION GATES
--------------------------------------------------------------------------------
- All Tests Pass: `PLATFORM_IT=1 pnpm vitest run tests/integration/service/infer-budget-hard-precheck.test.ts tests/integration/service/infer-budget-precheck.test.ts tests/integration/service/infer-budget-cli.test.ts tests/integration/service/infer-budget-ledger-persistence.test.ts tests/integration/service/infer-red-over-budget.test.ts tests/integration/service/infer-escape-telemetry.test.ts` → Exit 0
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
- tiny-remaining-ceiling: budget_ceiling set so remaining is small positive (e.g. ceiling 0.10, spent 0.09 → remaining 0.01) [seed_method=db_seed]
  - budget_ceiling id=1 ceiling=0.10
  - budget_ledger rows totaling spent≈0.09 OR controlled spent fixture
  - unset HOLO_ESCAPE_BUDGET_USD unless testing env consistency
- within-budget-honest-estimate: Ceiling high enough; estimatedCostUsd=0.05 honest [seed_method=db_seed]
  - ceiling>=1
  - spent near 0
  - ANTHROPIC_API_KEY for success-path fail-closed ledger tests
- env-ceiling-override-mismatch: HOLO_ESCAPE_BUDGET_USD differs from DB budget_ceiling for consistency tests [seed_method=public_api]
  - env HOLO_ESCAPE_BUDGET_USD=999
  - DB ceiling=1

</details>

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "REDHAT-FIX-H5",
  "tdd_mode": "red_first",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": true,
    "requires_seeded_evidence": true
  },
  "fixtures": {
    "tiny-remaining-ceiling": {
      "description": "budget_ceiling set so remaining is small positive (e.g. ceiling 0.10, spent 0.09 \u2192 remaining 0.01)",
      "seed_method": "db_seed",
      "records": [
        "budget_ceiling id=1 ceiling=0.10",
        "budget_ledger rows totaling spent\u22480.09 OR controlled spent fixture",
        "unset HOLO_ESCAPE_BUDGET_USD unless testing env consistency"
      ]
    },
    "within-budget-honest-estimate": {
      "description": "Ceiling high enough; estimatedCostUsd=0.05 honest",
      "seed_method": "db_seed",
      "records": [
        "ceiling>=1",
        "spent near 0",
        "ANTHROPIC_API_KEY for success-path fail-closed ledger tests"
      ]
    },
    "env-ceiling-override-mismatch": {
      "description": "HOLO_ESCAPE_BUDGET_USD differs from DB budget_ceiling for consistency tests",
      "seed_method": "public_api",
      "records": [
        "env HOLO_ESCAPE_BUDGET_USD=999",
        "DB ceiling=1"
      ]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "description": "GIVEN any ceiling WHEN estimatedCostUsd<=0 THEN refuse invalid estimate with anthropicHits:0",
      "verify": "PLATFORM_IT=1 pnpm vitest run tests/integration/service/infer-budget-hard-precheck.test.ts",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "postgres",
        "negative_control": {
          "would_fail_if": [
            "estimatedCostUsd=0 coerced and passes when remaining>0",
            "CLI --cost 0 contacts Anthropic",
            "stub checkBudget always ok",
            "empty estimate treated as free escape"
          ]
        },
        "evidence": {
          "artifact_type": "network_capture",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "tiny-remaining-ceiling",
            "action": {
              "actor": "adversary",
              "steps": [
                "Install network capture",
                "checkBudget({ estimatedCostUsd:0, allowEscape:true, role:'divergent' })",
                "runBudgetedEscape with estimatedCostUsd:0",
                "CLI path --cost 0 if covered"
              ]
            },
            "end_state": {
              "must_observe": [
                "result.ok === false OR throw BudgetExceededError/BudgetInvalidEstimate",
                "code BUDGET_INVALID_ESTIMATE OR reason containing invalid/non-positive estimate",
                "anthropicCount:0 OR anthropicHits:0"
              ],
              "must_not_observe": [
                "ok:true for estimatedCostUsd:0 real escape",
                "api.anthropic.com contact",
                "escape check_type='escape' spend row from zero-estimate success"
              ]
            }
          }
        ]
      },
      "test_tier": "integration",
      "verification_service": "postgres",
      "flow_ref": "T-INFER-011"
    },
    {
      "id": "AC-2",
      "type": "acceptance_criterion",
      "description": "GIVEN tiny remaining WHEN two concurrent exclusive estimates THEN at most one succeeds via transactional reserve",
      "verify": "PLATFORM_IT=1 pnpm vitest run tests/integration/service/infer-budget-hard-precheck.test.ts",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "postgres",
        "negative_control": {
          "would_fail_if": [
            "no SELECT FOR UPDATE / transactional lock \u2014 both pass TOCTOU",
            "soft pre-check without reservation",
            "mock sql client serializing artificially without proving lock"
          ]
        },
        "evidence": {
          "artifact_type": "db_query",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "tiny-remaining-ceiling",
            "action": {
              "actor": "adversary",
              "steps": [
                "Set remaining such that estimate A and B each alone fit but A+B exceed",
                "Run two concurrent reserves/pre-checks",
                "Count successes and final spent/reserved"
              ]
            },
            "end_state": {
              "must_observe": [
                "success_count === 1 OR (success_count<=1 with second code BUDGET_EXCEEDED)",
                "transactional lock path executed (evidence: serialization or reservation row count)",
                "SUM(cost of escape rows) + active reserves does not exceed ceiling by full second estimate"
              ],
              "must_not_observe": [
                "success_count === 2 for mutually exclusive estimates",
                "both ok:true without lock"
              ]
            }
          }
        ]
      },
      "test_tier": "integration",
      "verification_service": "postgres",
      "flow_ref": "UC-INFER-04"
    },
    {
      "id": "AC-3",
      "type": "acceptance_criterion",
      "description": "GIVEN env vs DB ceiling mismatch WHEN status and checkBudget run THEN effective ceiling is consistent and visible",
      "verify": "PLATFORM_IT=1 pnpm vitest run tests/integration/service/infer-budget-hard-precheck.test.ts tests/integration/service/infer-budget-cli.test.ts",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "postgres",
        "negative_control": {
          "would_fail_if": [
            "HOLO_ESCAPE_BUDGET_USD overrides checkBudget while budget:status still reports only DB ceiling without effectiveCeiling field",
            "silent dual ceilings",
            "stub status"
          ]
        },
        "evidence": {
          "artifact_type": "db_query",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "env-ceiling-override-mismatch",
            "action": {
              "actor": "operator",
              "steps": [
                "Read getBudgetStatus()",
                "Run checkBudget with small estimate",
                "Assert effective ceiling fields match the gate used"
              ]
            },
            "end_state": {
              "must_observe": [
                "status.ceiling OR status.effectiveCeiling equals checkBudget.ceilingUsd used for decision",
                "non-empty numeric ceiling value documented as source env|db"
              ],
              "must_not_observe": [
                "gate uses 999 while status shows 1 with no effectiveCeiling disclosure",
                "empty ceiling fields"
              ]
            }
          }
        ]
      },
      "test_tier": "integration",
      "verification_service": "postgres",
      "flow_ref": "T-INFER-012"
    },
    {
      "id": "AC-4",
      "type": "acceptance_criterion",
      "description": "GIVEN post-generateText ledger write failure WHEN runBudgetedEscape THEN fail closed no undercount success",
      "verify": "PLATFORM_IT=1 pnpm vitest run tests/integration/service/infer-budget-hard-precheck.test.ts",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "postgres",
        "negative_control": {
          "would_fail_if": [
            "post-generateText log failure still returns { text, cost, ledgerId } success undercounting spend",
            "swallowed logEscape error",
            "stub generateText without real path when claiming fail-closed after success"
          ]
        },
        "evidence": {
          "artifact_type": "api_response",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "within-budget-honest-estimate",
            "action": {
              "actor": "adversary",
              "steps": [
                "Inject ledger write failure after model success (test-only hook or forced logEscape throw)",
                "Invoke runBudgetedEscape",
                "Capture thrown error; assert no clean success payload with empty ledgerId treated as ok"
              ]
            },
            "end_state": {
              "must_observe": [
                "thrown error or ok:false with ledger/budget write failure reason non-empty",
                "no returned ledgerId UUID for a path that claims success"
              ],
              "must_not_observe": [
                "return { ok:true, ledgerId:'', cost:0 } after real tokens when write failed",
                "silent undercount success"
              ]
            }
          }
        ]
      },
      "test_tier": "integration",
      "verification_service": "postgres",
      "flow_ref": "UC-INFER-04"
    },
    {
      "id": "AC-5",
      "type": "acceptance_criterion",
      "description": "GIVEN honest 0.05 estimate WHEN escape runs THEN pre-check audit + metered escape still work",
      "verify": "PLATFORM_IT=1 pnpm vitest run tests/integration/service/infer-budget-hard-precheck.test.ts tests/integration/service/infer-budget-precheck.test.ts",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "anthropic",
        "negative_control": {
          "would_fail_if": [
            "hard pre-check blocks all positive estimates",
            "pre-check audit rows disappear",
            "stub success without ledger"
          ]
        },
        "evidence": {
          "artifact_type": "db_query",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "within-budget-honest-estimate",
            "action": {
              "actor": "operator",
              "steps": [
                "runBudgetedEscape estimatedCostUsd=0.05",
                "Query budget_ledger for pre-check and escape rows"
              ]
            },
            "end_state": {
              "must_observe": [
                "pre-check audit row check_type='pre-check' with cost=0 count >= 1",
                "escape success cost > 0 and ledgerId non-empty",
                "estimatedCostUsd 0.05 accepted (ok path)"
              ],
              "must_not_observe": [
                "BUDGET_INVALID_ESTIMATE for positive 0.05",
                "pre-check rows missing after checkBudget"
              ]
            }
          }
        ]
      },
      "test_tier": "integration",
      "verification_service": "anthropic",
      "flow_ref": "T-INFER-012"
    },
    {
      "id": "AC-6",
      "type": "acceptance_criterion",
      "description": "GIVEN red_first WHEN complete THEN redhat-fix-h5* evidence archived",
      "verify": "PLATFORM_IT=1 pnpm vitest run tests/integration/service/infer-budget-hard-precheck.test.ts",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "filesystem",
        "negative_control": {
          "would_fail_if": [
            "no red evidence",
            "green-only",
            "empty artifact"
          ]
        },
        "evidence": {
          "artifact_type": "file_artifact",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "tiny-remaining-ceiling",
            "action": {
              "actor": "operator",
              "steps": [
                "Write red: estimatedCostUsd=0 would pass soft gate",
                "Write green: invalid estimate refused + anthropicHits:0 + consistent ceiling note"
              ]
            },
            "end_state": {
              "must_observe": [
                "artifact path matches redhat-fix-h5*",
                "green includes BUDGET_INVALID_ESTIMATE or invalid estimate refuse for 0",
                "green includes anthropicCount:0 for zero-estimate attempt"
              ],
              "must_not_observe": [
                "empty evidence",
                "green claiming hard budget without zero-estimate case"
              ]
            }
          }
        ]
      },
      "test_tier": "integration",
      "verification_service": "filesystem",
      "flow_ref": "UC-INFER-04"
    },
    {
      "id": "TC-1",
      "type": "test_criterion",
      "description": "Zero estimate refused; anthropicHits===0",
      "maps_to_ac": "AC-1",
      "verify": "PLATFORM_IT=1 pnpm vitest run tests/integration/service/infer-budget-hard-precheck.test.ts"
    },
    {
      "id": "TC-2",
      "type": "test_criterion",
      "description": "Transactional reserve serializes exclusive estimates",
      "maps_to_ac": "AC-2",
      "verify": "PLATFORM_IT=1 pnpm vitest run tests/integration/service/infer-budget-hard-precheck.test.ts"
    },
    {
      "id": "TC-3",
      "type": "test_criterion",
      "description": "Ceiling source consistent between status and gate",
      "maps_to_ac": "AC-3",
      "verify": "PLATFORM_IT=1 pnpm vitest run tests/integration/service/infer-budget-hard-precheck.test.ts"
    },
    {
      "id": "TC-4",
      "type": "test_criterion",
      "description": "Fail-closed on ledger write failure after generateText",
      "maps_to_ac": "AC-4",
      "verify": "PLATFORM_IT=1 pnpm vitest run tests/integration/service/infer-budget-hard-precheck.test.ts"
    },
    {
      "id": "TC-5",
      "type": "test_criterion",
      "description": "Honest estimate still meters with pre-check audit",
      "maps_to_ac": "AC-5",
      "verify": "PLATFORM_IT=1 pnpm vitest run tests/integration/service/infer-budget-hard-precheck.test.ts tests/integration/service/infer-budget-precheck.test.ts"
    },
    {
      "id": "TC-6",
      "type": "test_criterion",
      "description": "redhat-fix-h5* evidence present",
      "maps_to_ac": "AC-6",
      "verify": "PLATFORM_IT=1 pnpm vitest run tests/integration/service/infer-budget-hard-precheck.test.ts"
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
    "hard-budget-precheck",
    "reject-zero-estimatedCostUsd",
    "transactional-budget-reserve",
    "consistent-ceiling-source",
    "fail-closed-post-escape-ledger"
  ],
  "consumes": [
    "budget_ledger table",
    "budget_ceiling table",
    "checkBudget",
    "runBudgetedEscape",
    "logEscape",
    "recordPreCheckAudit"
  ],
  "boundary_contracts": [
    "Real escapes MUST reject estimatedCostUsd <= 0 (CLI --cost 0 cannot game remaining tiny ceiling)",
    "Budget check/reserve MUST be transactional (SELECT FOR UPDATE or equivalent) to prevent concurrent TOCTOU double-spend of ceiling",
    "Ceiling source for gate and budget:status MUST be consistent (document and implement single source of truth \u2014 prefer DB ceiling with env only as explicit override reflected in status)",
    "If generateText succeeds but ledger write fails, path MUST fail closed (surface error; do not report silent success that undercounts spend)"
  ]
}
-->

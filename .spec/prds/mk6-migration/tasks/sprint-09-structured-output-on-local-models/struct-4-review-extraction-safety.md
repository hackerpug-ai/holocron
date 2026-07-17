# struct-4 — Review extraction safety
> Status: ✅ Completed
> Cycle: 1
> Commit: pending
> Reviewer: mastra-reviewer (self-review APPROVED)
> Completed: 2026-07-17T03:05:16Z

## What this does

Adversarially review struct-1/2/3 to validate the never-silently-accept invariant: real Zod validation (no z.any()), bounded repair loop, tripwire coverage, typed terminal outcomes, and no unsafe DB commit. Build-gate review of repo + processor fixture (T-INFER-010).

Provides: review report (.spec/reviews/struct-4-extraction-safety-review.md) with APPROVED/NEEDS_FIXES + file:line feedback

## Why

- MUST Validate every extraction call site validates against a real Zod schema (no z.any()) with a capped retry
- MUST Confirm malformed/tripwire output reaches a typed terminal (ExtractionFailedError/BlockedError) with no unsafe DB commit
- MUST Confirm struct-1/2 passed RED→GREEN→REFACTOR with real-fleet evidence (PLATFORM_IT=1, network assertions)
- MUST Confirm the probe uses real generateObject, fails-closed on unreachable
- NEVER Approve code with z.any() or stubbed schemas
- NEVER Accept implementation without RED evidence
- NEVER Allow an unbounded repair loop or missing MAX_REPAIR_ATTEMPTS
- NEVER Approve silent success on validation failure or unsafe-commit paths
- NEVER Modify implementation during review (review-only)
- STRICTLY Grep every extraction call site for tripwire handling (result.tripwire, finishReason)
- STRICTLY Verify every generateObject call is real via network assertions
- STRICTLY Review struct-3 RED evidence matches expected failure signatures
- Grounded in: UC-INFER-03 (T-INFER-010)

## How to verify

- `test -f .spec/reviews/struct-4-extraction-safety-review.md` → Exit 0 with APPROVED or NEEDS_FIXES
- `grep -c 'z.any()' services/platform/src/inference/extract-structured.ts` → 0
- `grep -c 'MAX_REPAIR_ATTEMPTS' services/platform/src/inference/extract-structured.ts` → ≥2
- `grep -c 'ExtractionFailedError\|BlockedError' services/platform/src/inference/extract-structured.ts` → ≥2
- `git diff --name-only -- services/platform/src` → Empty
- Typecheck: `pnpm tsgo --noEmit` → Exit 0
- Lint: `pnpm biome check .` → Exit 0

## Scope

Writes: .spec/reviews/struct-4-extraction-safety-review.md (NEW) — APPROVED/NEEDS_FIXES report

Prohibited: services/platform/src/inference/extract-structured.ts - REVIEW ONLY, do not modify, services/platform/src/inference/probe-capability.ts - REVIEW ONLY, do not modify, tests/integration/service/struct-*.test.ts - REVIEW ONLY, do not modify, Any implementation code - REVIEW task must not write code

<details>
<summary>▸ Full agent specification (TASK-TEMPLATE v5.2 — required reading for implementer + reviewer)</summary>

================================================================================
TASK: struct-4 — Review extraction safety
================================================================================

TASK_TYPE:  REVIEW
STATUS:     Backlog
PRIORITY:   P0
EFFORT:     M  (75 min)
AGENT:      mastra-reviewer
PROPOSED-BY: mastra-planner
TDD_MODE:   skipped     RED_GREEN_REQUIRED: no     (requires_seeded_evidence: true)
CAPABILITY: CAP-INF-01
SPRINT:     [Sprint 9 — Structured Output on Local Models](./SPRINT.md)

RUNTIME_COMMANDS:
  test:      PLATFORM_IT=1 pnpm vitest run <path>
  typecheck: pnpm tsgo --noEmit
  lint:      pnpm biome check .

--------------------------------------------------------------------------------
OUTCOME
--------------------------------------------------------------------------------
Adversarially review struct-1/2/3 to validate extraction-safety invariants: real Zod validation, bounded repair loop, tripwire coverage, typed terminals, no unsafe commit
Review report at .spec/reviews/struct-4-extraction-safety-review.md shows APPROVED with evidence (all call sites Zod-validated, repair bounded, failures typed, no unsafe commit) — or NEEDS_FIXES with specific file:line feedback

--------------------------------------------------------------------------------
🚫 CRITICAL CONSTRAINTS (Never tier)
--------------------------------------------------------------------------------
- MUST Validate every extraction call site validates against a real Zod schema (no z.any()) with a capped retry
- MUST Confirm malformed/tripwire output reaches a typed terminal (ExtractionFailedError/BlockedError) with no unsafe DB commit
- MUST Confirm struct-1/2 passed RED→GREEN→REFACTOR with real-fleet evidence (PLATFORM_IT=1, network assertions)
- MUST Confirm the probe uses real generateObject, fails-closed on unreachable
- NEVER Approve code with z.any() or stubbed schemas
- NEVER Accept implementation without RED evidence
- NEVER Allow an unbounded repair loop or missing MAX_REPAIR_ATTEMPTS
- NEVER Approve silent success on validation failure or unsafe-commit paths
- NEVER Modify implementation during review (review-only)
- STRICTLY Grep every extraction call site for tripwire handling (result.tripwire, finishReason)

- STRICTLY Verify every generateObject call is real via network assertions

- STRICTLY Review struct-3 RED evidence matches expected failure signatures

--------------------------------------------------------------------------------
DONE WHEN
--------------------------------------------------------------------------------
- [ ] AC-1: every extraction call site validates against real Zod schema (no z.any()); MAX_REPAIR_ATTEMPTS defined+used; repair loop bounded (flow_ref T-INFER-010)
- [ ] AC-2: malformed/tripwire output reaches typed terminal outcome (ExtractionFailedError/BlockedError) with no unsafe DB commit (flow_ref T-INFER-010)
- [ ] AC-3: confirms RED→GREEN→REFACTOR with real-fleet evidence (PLATFORM_IT=1, network assertions) (flow_ref T-INFER-010)
- [ ] AC-4: confirms probe uses real generateObject (not /health proxy, not static cache), fails-closed on unreachable (flow_ref T-INFER-010)
- [ ] `test -f .spec/reviews/struct-4-extraction-safety-review.md` green + `pnpm tsgo --noEmit` clean + `pnpm biome check .` clean (only SCOPE.writeAllowed files modified)

--------------------------------------------------------------------------------
ACCEPTANCE CRITERIA (TDD beads — RED before GREEN, proven by real services)
--------------------------------------------------------------------------------
AC-1 every extraction call site validates against real Zod schema (no z.any()); MAX_REPAIR_ATTEMPTS defined+used; repair loop bounded (PRIMARY) (flow_ref T-INFER-010)
  GIVEN: struct-1 implementation
  WHEN:  reviewing
  THEN:  every extraction call site validates against real Zod schema (no z.any()); MAX_REPAIR_ATTEMPTS defined+used; repair loop bounded
  TEST_TIER: integration · VERIFICATION_SERVICE: litellm-fleet · TDD_STATE: red→green
  SCENARIO — start_ref: struct-1-implementation · evidence: file_artifact
    NEGATIVE_CONTROL: would fail if review accepts grep returning >=1 for "z.any()", review skips checking MAX_REPAIR_ATTEMPTS usage, review accepts unbounded repair loop, review accepts z.any() schemas, review is a no-op that accepts stubbed implementations
    CASE[0] start_ref=struct-1-implementation · actor=reviewer
      ACTION: Grep extract-structured.ts for 'z.any()' usage → Grep extract-structured.ts for 'MAX_REPAIR_ATTEMPTS' definition and usage → Verify repair loop enforces MAX_REPAIR_ATTEMPTS bound → Verify all schemas are real Zod schemas (not z.any())
      MUST_OBSERVE: grep count for "z.any()" in extract-structured.ts = 0 | grep count for "MAX_REPAIR_ATTEMPTS" in extract-structured.ts >= 2 | repair loop contains "attempts <= MAX_REPAIR_ATTEMPTS" | grep count for "z.object(" in extract-structured.ts >= 1
      MUST_NOT_OBSERVE: grep returns ≥1 lines with 'z.any()' | grep returns 0 lines for 'MAX_REPAIR_ATTEMPTS' | repair loop runs unbounded (no max check) | Schema defined as z.any() or z.unknown() | empty grep results (no review performed)

AC-2 malformed/tripwire output reaches typed terminal outcome (ExtractionFailedError/BlockedError) with no unsafe DB commit (flow_ref T-INFER-010)
  GIVEN: struct-1 implementation
  WHEN:  reviewing
  THEN:  malformed/tripwire output reaches typed terminal outcome (ExtractionFailedError/BlockedError) with no unsafe DB commit
  TEST_TIER: integration · VERIFICATION_SERVICE: litellm-fleet · TDD_STATE: red→green
  SCENARIO — start_ref: struct-1-implementation · evidence: file_artifact
    NEGATIVE_CONTROL: would fail if Review allows generic Error instead of typed errors, Review fails to verify no-unsafe-commit logic, Review passes without checking error handling paths, Review allows silent failures (no error thrown), review is a no-op that accepts stubbed implementations
    CASE[0] start_ref=struct-1-implementation · actor=reviewer
      ACTION: Grep extract-structured.ts for ExtractionFailedError definition and usage → Grep extract-structured.ts for BlockedError handling → Verify error paths throw typed errors (not generic Error) → Verify no DB commit occurs after error thrown
      MUST_OBSERVE: grep count for 'ExtractionFailedError' ≥ 2 (class definition + throw) | grep count for 'BlockedError' ≥ 1 (handling path) | grep count for 'throw new ExtractionFailedError' ≥ 1 | Error path contains 'return' or 'throw' before any commit logic
      MUST_NOT_OBSERVE: Error path throws generic Error('extraction failed') | Error path allows DB commit after malformed output | Tripwire path returns without throwing error | No typed error classes defined | no error handling verified (empty review)

AC-3 confirms RED→GREEN→REFACTOR with real-fleet evidence (PLATFORM_IT=1, network assertions) (flow_ref T-INFER-010)
  GIVEN: struct-1/2/3
  WHEN:  reviewing
  THEN:  confirms RED→GREEN→REFACTOR with real-fleet evidence (PLATFORM_IT=1, network assertions)
  TEST_TIER: integration · VERIFICATION_SERVICE: litellm-fleet · TDD_STATE: red→green
  SCENARIO — start_ref: struct-3-red-evidence · evidence: file_artifact
    NEGATIVE_CONTROL: would fail if Review accepts GREEN without RED evidence, Review allows mocked fleet evidence instead of real PLATFORM_IT=1, Review passes without checking network assertions, Review accepts tests that never ran against real fleet, review is a no-op that accepts stubbed implementations
    CASE[0] start_ref=struct-3-red-evidence · actor=reviewer
      ACTION: Read .tmp/struct-3-red-output.txt and verify RED failure signatures → Run PLATFORM_IT=1 pnpm vitest run tests/integration/service/struct-*.test.ts → Verify tests pass GREEN against real fleet → Verify network assertions show real :4545 traffic, zero cloud
      MUST_OBSERVE: .tmp/struct-3-red-output.txt contains RED failure for all 4 test files | vitest run exits with code 0 (GREEN) | Test output shows 'PLATFORM_IT=1' environment variable | Test output contains network assertions for :4545 traffic
      MUST_NOT_OBSERVE: .tmp/struct-3-red-output.txt missing or empty | vitest run exits with non-zero code | Tests use mocked fleet or endpointOverride | Network assertions missing or always return zero without real capture | no RED evidence verified (empty review)

AC-4 confirms probe uses real generateObject (not /health proxy, not static cache), fails-closed on unreachable (flow_ref T-INFER-010)
  GIVEN: struct-2 probe-capability.ts
  WHEN:  reviewing
  THEN:  confirms probe uses real generateObject (not /health proxy, not static cache), fails-closed on unreachable
  TEST_TIER: integration · VERIFICATION_SERVICE: litellm-fleet · TDD_STATE: red→green
  SCENARIO — start_ref: struct-1-implementation · evidence: file_artifact
    NEGATIVE_CONTROL: would fail if Review allows /health proxy instead of generateObject, Review fails to verify fail-closed behavior, Review allows static cached capability data, Review passes without checking probe implementation, review is a no-op that accepts stubbed implementations
    CASE[0] start_ref=struct-1-implementation · actor=reviewer
      ACTION: Grep probe-capability.ts for 'generateObject' usage → Grep probe-capability.ts for '/health' proxy usage (should be 0) → Grep probe-capability.ts for 'fail-closed' or 'failClosed' logic → Verify probe calls real endpoint, not static cache
      MUST_OBSERVE: grep count for "generateObject" in probe-capability.ts >= 1 | grep count for "/health" in probe-capability.ts = 0 | grep count for "fail-closed" or "failClosed" in probe-capability.ts >= 1 | grep count for "z.object(" in probe-capability.ts >= 1
      MUST_NOT_OBSERVE: grep returns 0 for 'generateObject' | grep returns ≥1 for '/health' (proxy usage) | No fail-closed handling present | Probe uses cached data without real call | no grep checks run (empty review)

--------------------------------------------------------------------------------
TEST CRITERIA
--------------------------------------------------------------------------------
- TC-1 [Review confirms zero z.any() schemas in extract-structured.ts] (maps_to_ac AC-1)
- TC-2 [Review confirms MAX_REPAIR_ATTEMPTS defined and used] (maps_to_ac AC-1)
- TC-3 [Review confirms typed errors (ExtractionFailedError/BlockedError)] (maps_to_ac AC-2)
- TC-4 [Review confirms RED→GREEN evidence exists] (maps_to_ac AC-3)
- TC-5 [Review confirms probe uses real generateObject not /health proxy] (maps_to_ac AC-4)
- TC-6 [Review confirms probe fails-closed on unreachable] (maps_to_ac AC-4)

--------------------------------------------------------------------------------
SCOPE (writeAllowed)
--------------------------------------------------------------------------------
- .spec/reviews/struct-4-extraction-safety-review.md (NEW) — APPROVED/NEEDS_FIXES report
writeProhibited: services/platform/src/inference/extract-structured.ts - REVIEW ONLY, do not modify, services/platform/src/inference/probe-capability.ts - REVIEW ONLY, do not modify, tests/integration/service/struct-*.test.ts - REVIEW ONLY, do not modify, Any implementation code - REVIEW task must not write code

--------------------------------------------------------------------------------
READING LIST
--------------------------------------------------------------------------------
1. services/platform/src/inference/extract-structured.ts lines 1-50
   - focus: extractStructured — Zod validation + repair loop + typed errors
2. services/platform/src/inference/probe-capability.ts lines 1-50
   - focus: probeRoleCapability — real generateObject + fail-closed
3. .tmp/struct-3-red-output.txt lines 1-50
   - focus: RED evidence for TDD-cycle verification
4. tests/integration/service/struct-*.test.ts lines 1-50
   - focus: GREEN tests for real-fleet verification

--------------------------------------------------------------------------------
EVIDENCE GATES
--------------------------------------------------------------------------------
- Review report saved: `test -f .spec/reviews/struct-4-extraction-safety-review.md` → Exit 0 with APPROVED or NEEDS_FIXES
- Zero z.any() in extract-structured.ts: `grep -c 'z.any()' services/platform/src/inference/extract-structured.ts` → 0
- MAX_REPAIR_ATTEMPTS defined and used: `grep -c 'MAX_REPAIR_ATTEMPTS' services/platform/src/inference/extract-structured.ts` → ≥2
- Typed terminal errors present: `grep -c 'ExtractionFailedError\|BlockedError' services/platform/src/inference/extract-structured.ts` → ≥2
- No implementation modified during review: `git diff --name-only -- services/platform/src` → Empty

--------------------------------------------------------------------------------
DESIGN NOTES
--------------------------------------------------------------------------------
- pattern: Grep call sites → validate Zod + retry cap → check tripwire handling → verify typed errors + no unsafe commit → review TDD evidence → approve or feedback
- pattern_source: brain/docs/mastra/README.md + tests/integration/service/infer-router-*.test.ts
- anti_pattern: Review without grepping actual code; accepting without RED evidence; missing tripwire-coverage check; ignoring unsafe-commit paths
- agent_rationale: Adversarial extraction-safety review — validates stub/tripwire leakage, never-silently-accept, typed terminals, and unsafe-commit prevention (security + TDD-compliance specialist)
- composes resolveModel(role) from Sprint 08; owns the CAP-INF-01 extraction segment

--------------------------------------------------------------------------------
DEPENDENCIES
--------------------------------------------------------------------------------
Depends on: struct-1, struct-2, struct-3 · Blocks: none

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "struct-4",
  "proposed_by": "mastra-planner",
  "tdd_mode": "skipped",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": false,
    "requires_seeded_evidence": true
  },
  "fixtures": {
    "struct-1-implementation": {
      "description": "Implementation of extract-structured.ts from struct-1",
      "seed_method": "public_api",
      "records": [
        "services/platform/src/inference/extract-structured.ts exists",
        "extractStructured function defined with repair loop",
        "MAX_REPAIR_ATTEMPTS constant defined",
        "ExtractionFailedError class defined",
        "BlockedError handling for tripwires"
      ]
    },
    "struct-3-red-evidence": {
      "description": "RED test evidence from struct-3",
      "seed_method": "migration_fixture",
      "records": [
        ".tmp/struct-3-red-output.txt exists",
        "File contains RED test failure output for all 4 test files",
        "File contains 'ReferenceError' or similar failure signatures",
        "File shows tests ran against empty implementation"
      ]
    },
    "struct-repo-state": {
      "description": "Repo state after struct-1/2/3 completion",
      "seed_method": "public_api",
      "records": [
        "tests/integration/service/struct-repair-loop.test.ts exists",
        "tests/integration/service/struct-explicit-fail.test.ts exists",
        "tests/integration/service/struct-tripwire-blocked.test.ts exists",
        "tests/integration/service/struct-boot-probe.test.ts exists",
        "tests/fixtures/struct-fixtures.ts exists"
      ]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "primary": true,
      "description": "GIVEN struct-1 implementation WHEN reviewing THEN every extraction call site validates against real Zod schema (no z.any()); MAX_REPAIR_ATTEMPTS defined+used; repair loop bounded",
      "verify": "grep -r 'z.any()' services/platform/src/inference/extract-structured.ts | grep -c '0' && grep -c 'MAX_REPAIR_ATTEMPTS' services/platform/src/inference/extract-structured.ts | grep -c '≥2'",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "litellm-fleet",
        "negative_control": {
          "would_fail_if": [
            "review accepts grep returning >=1 for \"z.any()\"",
            "review skips checking MAX_REPAIR_ATTEMPTS usage",
            "review accepts unbounded repair loop",
            "review accepts z.any() schemas",
            "review is a no-op that accepts stubbed implementations"
          ]
        },
        "evidence": {
          "artifact_type": "file_artifact",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "struct-1-implementation",
            "action": {
              "actor": "reviewer",
              "steps": [
                "Grep extract-structured.ts for 'z.any()' usage",
                "Grep extract-structured.ts for 'MAX_REPAIR_ATTEMPTS' definition and usage",
                "Verify repair loop enforces MAX_REPAIR_ATTEMPTS bound",
                "Verify all schemas are real Zod schemas (not z.any())"
              ]
            },
            "end_state": {
              "must_observe": [
                "grep count for \"z.any()\" in extract-structured.ts = 0",
                "grep count for \"MAX_REPAIR_ATTEMPTS\" in extract-structured.ts >= 2",
                "repair loop contains \"attempts <= MAX_REPAIR_ATTEMPTS\"",
                "grep count for \"z.object(\" in extract-structured.ts >= 1"
              ],
              "must_not_observe": [
                "grep returns ≥1 lines with 'z.any()'",
                "grep returns 0 lines for 'MAX_REPAIR_ATTEMPTS'",
                "repair loop runs unbounded (no max check)",
                "Schema defined as z.any() or z.unknown()",
                "empty grep results (no review performed)"
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
      "description": "GIVEN struct-1 implementation WHEN reviewing THEN malformed/tripwire output reaches typed terminal outcome (ExtractionFailedError/BlockedError) with no unsafe DB commit",
      "verify": "grep -c 'ExtractionFailedError' services/platform/src/inference/extract-structured.ts && grep -c 'BlockedError' services/platform/src/inference/extract-structured.ts && grep -c 'throw new ExtractionFailedError' services/platform/src/inference/extract-structured.ts",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "litellm-fleet",
        "negative_control": {
          "would_fail_if": [
            "Review allows generic Error instead of typed errors",
            "Review fails to verify no-unsafe-commit logic",
            "Review passes without checking error handling paths",
            "Review allows silent failures (no error thrown)",
            "review is a no-op that accepts stubbed implementations"
          ]
        },
        "evidence": {
          "artifact_type": "file_artifact",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "struct-1-implementation",
            "action": {
              "actor": "reviewer",
              "steps": [
                "Grep extract-structured.ts for ExtractionFailedError definition and usage",
                "Grep extract-structured.ts for BlockedError handling",
                "Verify error paths throw typed errors (not generic Error)",
                "Verify no DB commit occurs after error thrown"
              ]
            },
            "end_state": {
              "must_observe": [
                "grep count for 'ExtractionFailedError' ≥ 2 (class definition + throw)",
                "grep count for 'BlockedError' ≥ 1 (handling path)",
                "grep count for 'throw new ExtractionFailedError' ≥ 1",
                "Error path contains 'return' or 'throw' before any commit logic"
              ],
              "must_not_observe": [
                "Error path throws generic Error('extraction failed')",
                "Error path allows DB commit after malformed output",
                "Tripwire path returns without throwing error",
                "No typed error classes defined",
                "no error handling verified (empty review)"
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
      "description": "GIVEN struct-1/2/3 WHEN reviewing THEN confirms RED→GREEN→REFACTOR with real-fleet evidence (PLATFORM_IT=1, network assertions)",
      "verify": "cat .tmp/struct-3-red-output.txt && PLATFORM_IT=1 pnpm vitest run tests/integration/service/struct-*.test.ts",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "litellm-fleet",
        "negative_control": {
          "would_fail_if": [
            "Review accepts GREEN without RED evidence",
            "Review allows mocked fleet evidence instead of real PLATFORM_IT=1",
            "Review passes without checking network assertions",
            "Review accepts tests that never ran against real fleet",
            "review is a no-op that accepts stubbed implementations"
          ]
        },
        "evidence": {
          "artifact_type": "file_artifact",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "struct-3-red-evidence",
            "action": {
              "actor": "reviewer",
              "steps": [
                "Read .tmp/struct-3-red-output.txt and verify RED failure signatures",
                "Run PLATFORM_IT=1 pnpm vitest run tests/integration/service/struct-*.test.ts",
                "Verify tests pass GREEN against real fleet",
                "Verify network assertions show real :4545 traffic, zero cloud"
              ]
            },
            "end_state": {
              "must_observe": [
                ".tmp/struct-3-red-output.txt contains RED failure for all 4 test files",
                "vitest run exits with code 0 (GREEN)",
                "Test output shows 'PLATFORM_IT=1' environment variable",
                "Test output contains network assertions for :4545 traffic"
              ],
              "must_not_observe": [
                ".tmp/struct-3-red-output.txt missing or empty",
                "vitest run exits with non-zero code",
                "Tests use mocked fleet or endpointOverride",
                "Network assertions missing or always return zero without real capture",
                "no RED evidence verified (empty review)"
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
      "description": "GIVEN struct-2 probe-capability.ts WHEN reviewing THEN confirms probe uses real generateObject (not /health proxy, not static cache), fails-closed on unreachable",
      "verify": "grep -c 'generateObject' services/platform/src/inference/probe-capability.ts && grep -c '/health' services/platform/src/inference/probe-capability.ts | grep -c '0' && grep -c 'fail-closed\\|failClosed' services/platform/src/inference/probe-capability.ts",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "litellm-fleet",
        "negative_control": {
          "would_fail_if": [
            "Review allows /health proxy instead of generateObject",
            "Review fails to verify fail-closed behavior",
            "Review allows static cached capability data",
            "Review passes without checking probe implementation",
            "review is a no-op that accepts stubbed implementations"
          ]
        },
        "evidence": {
          "artifact_type": "file_artifact",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "struct-1-implementation",
            "action": {
              "actor": "reviewer",
              "steps": [
                "Grep probe-capability.ts for 'generateObject' usage",
                "Grep probe-capability.ts for '/health' proxy usage (should be 0)",
                "Grep probe-capability.ts for 'fail-closed' or 'failClosed' logic",
                "Verify probe calls real endpoint, not static cache"
              ]
            },
            "end_state": {
              "must_observe": [
                "grep count for \"generateObject\" in probe-capability.ts >= 1",
                "grep count for \"/health\" in probe-capability.ts = 0",
                "grep count for \"fail-closed\" or \"failClosed\" in probe-capability.ts >= 1",
                "grep count for \"z.object(\" in probe-capability.ts >= 1"
              ],
              "must_not_observe": [
                "grep returns 0 for 'generateObject'",
                "grep returns ≥1 for '/health' (proxy usage)",
                "No fail-closed handling present",
                "Probe uses cached data without real call",
                "no grep checks run (empty review)"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "TC-1",
      "type": "test_criterion",
      "description": "Review confirms zero z.any() schemas in extract-structured.ts",
      "verify": "grep -r 'z.any()' services/platform/src/inference/extract-structured.ts | grep -c '0'",
      "maps_to_ac": "AC-1"
    },
    {
      "id": "TC-2",
      "type": "test_criterion",
      "description": "Review confirms MAX_REPAIR_ATTEMPTS defined and used",
      "verify": "grep -c 'MAX_REPAIR_ATTEMPTS' services/platform/src/inference/extract-structured.ts | grep -c '≥2'",
      "maps_to_ac": "AC-1"
    },
    {
      "id": "TC-3",
      "type": "test_criterion",
      "description": "Review confirms typed errors (ExtractionFailedError/BlockedError)",
      "verify": "grep -c 'ExtractionFailedError' services/platform/src/inference/extract-structured.ts && grep -c 'BlockedError' services/platform/src/inference/extract-structured.ts",
      "maps_to_ac": "AC-2"
    },
    {
      "id": "TC-4",
      "type": "test_criterion",
      "description": "Review confirms RED→GREEN evidence exists",
      "verify": "cat .tmp/struct-3-red-output.txt && PLATFORM_IT=1 pnpm vitest run tests/integration/service/struct-*.test.ts",
      "maps_to_ac": "AC-3"
    },
    {
      "id": "TC-5",
      "type": "test_criterion",
      "description": "Review confirms probe uses real generateObject not /health proxy",
      "verify": "grep -c 'generateObject' services/platform/src/inference/probe-capability.ts && grep -c '/health' services/platform/src/inference/probe-capability.ts | grep -c '0'",
      "maps_to_ac": "AC-4"
    },
    {
      "id": "TC-6",
      "type": "test_criterion",
      "description": "Review confirms probe fails-closed on unreachable",
      "verify": "grep -c 'fail-closed\\|failClosed' services/platform/src/inference/probe-capability.ts",
      "maps_to_ac": "AC-4"
    }
  ]
}
-->
</details>

# gate-4: RED tests: uncited-kill rejected, WIP=1, unprobed-advance refused, steering-next-cycle, ASSAY≠CHALLENGE
> Status: ⬜ Pending

- **Sprint:** [Sprint 23: Deterministic Human Gate, Steering and Fulcrum Seams](./SPRINT.md)
- **Task Type:** `FEATURE`
- **Status:** `Backlog`
- **Priority:** `P0`
- **Effort:** `M`
- **Estimate:** `180 minutes`
- **Agent:** `red-test-generator` — RED test generation specialist for TDD-first workflow
- **Reviewer:** `mastra-reviewer`
- **Proposed By:** `mastra-planner`
- **TDD Mode:** `red_first`
- **RED/GREEN Required:** `yes`

## Outcome
Write the RED test suite for gate-1 (deterministic human-gate handlers) and gate-2 (mid-run steering + ASSAY≠CHALLENGE) before implementation begins. Tests must fail on real Postgres with concrete row counts, status codes, and instance IDs. Each test follows the existing mission-engine-red.test.ts pattern.

## Background
This task is part of Sprint 23: Deterministic Human Gate, Steering and Fulcrum Seams (UC-SVC-05; T-SVC-017…020). Write the RED test suite for gate-1 (deterministic human-gate handlers) and gate-2 (mid-run steering + ASSAY≠CHALLENGE) before implementation begins. Tests must fail on real Postgres with concrete row counts, status codes, and instance IDs. Each test follows the existing mission-engine-red.test.ts pattern. The deterministic human-gate handlers and mid-run steering live in `services/platform/src/http/missions.ts` (routes in `services/platform/src/http/hono-app.ts`), backed by the `mission_verdicts`/`mission_steering`/`mission_runs` tables in `services/platform/src/db/schema/mission.ts` and enforced against the append-only ledger in `services/platform/src/db/schema/evidence.ts`. The ASSAY≠CHALLENGE distinct-instance seam and pure-TS evidence gate live in `services/platform/src/research/`. This sprint *hardens* existing surfaces — it does not recreate them.

## Specification
- **Objective:** Write the RED test suite for gate-1 (deterministic human-gate handlers) and gate-2 (mid-run steering + ASSAY≠CHALLENGE) before implementation begins. Tests must fail on real Postgres with concrete row counts, status codes, and instance IDs. Each test follows the existing mission-engine-red.test.ts pattern.
- **Success state:** A complete RED test suite exists in services/platform/tests/integration/mission-engine-red.test.ts with 8 tests (4 for gate-1, 4 for gate-2). Each test fails when run against real Postgres (PLATFORM_IT=1) with concrete assertion failures. RED output is captured in .tmp/{task_id}/red-output.txt.

## Critical Constraints
### MUST
- MUST Write RED tests BEFORE any implementation starts for gate-1 and gate-2
- MUST Every RED test must fail with concrete assertion failures (not errors)
- MUST RED tests must use real Postgres with PLATFORM_IT=1
- MUST Each test must assert concrete values (row counts, status codes, instance IDs)
- MUST Tests must follow the existing pattern in mission-engine-red.test.ts lines 2399-2456
### NEVER
- Never write tests that pass on empty/stub implementations
- Never use mock databases or in-memory SQLite
- Never assert only 0/empty values without concrete non-degenerate expectations
- Never skip RED phase — tests must be seen failing before GREEN begins
### STRICTLY
- STRICTLY Every test must have at least one non-degenerate MUST_OBSERVE value
- STRICTLY RED output must be captured and show the exact failure
- STRICTLY Tests must be grouped by gate (gate-1 suite, gate-2 suite)

## Capability Chain
- **Touches:** CAP-INF-01
**Provides:**
- red-test-suite-gate-1
- red-test-suite-gate-2
- red-tests-for-all-deterministic-rules
**Consumes:**
- mission-engine-red-test-pattern
- existing-test-fixtures
**Boundary contracts:**
- Every RED test fails on real Postgres with concrete row counts before implementation
- RED tests follow existing mission-engine-red.test.ts pattern (lines 2399-2456)

## Acceptance Criteria
### AC-1: RED tests written for gate-1 deterministic rules [PRIMARY] [PRIMARY]
- **GIVEN:** Empty or stub implementations of uncited-kill rejection, WIP=1 check, and probe-gated advance
- **WHEN:** Test suite runs with PLATFORM_IT=1 against real Postgres
- **THEN:** All 4 gate-1 tests fail with concrete failures: uncited-kill test shows verdict inserted (should be 0), WIP=1 test shows second run created (should be 403), unprobed-advance test shows verdict inserted (should be 403), rollback test shows partial rows (should be 0).
- **Test tier:** `integration`
- **Verification service:** `platform-test-runner + Postgres`
- **Flow ref:** `UC-SVC-05/AC-1`
- **Verify:** `PLATFORM_IT=1 bun test --grep 'gate-1' services/platform/tests/integration/mission-engine-red.test.ts > .tmp/gate-4/red-output.txt; exit 1`
- **Scenario:**
  - **Tier:** `visible` · **Test tier:** `integration`
  - **Verification service:** `platform-test-runner + Postgres`
  - **Topology:** `single-node`
  - **Negative control — would fail if:
    - tests pass on empty/stub implementations
    - tests use mock database
    - tests assert only 0/empty without concrete values
  - **Evidence:** artifact `file_artifact`, required_capture=True
  - **Case 1** — start_ref `stub-gate-1-handlers`:
    - actor: `background_job`
    - step: Run test suite with PLATFORM_IT=1
    - step: Capture RED output showing 4 failures
    - step: Verify each failure has concrete row count/status code assertion
    - MUST observe:
      - Exit code 1
      - 4 test failures with concrete assertions
      - Each failure shows expected != actual with specific values (e.g., 'Expected: 0 rows, Actual: 1 row')
      - File .tmp/gate-4/red-output.txt contains captured failures
    - MUST NOT observe:
      - tests passing (tests fail in RED phase)
      - errors instead of assertion failures (no failures before fix)
      - vague 'test failed' without concrete values (no failures before fix)

### AC-2: RED tests written for gate-2 steering and instances
- **GIVEN:** Stub implementations that ignore steering or use same instance IDs
- **WHEN:** Test suite runs with PLATFORM_IT=1 against real Postgres and real fleet
- **THEN:** All 4 gate-2 tests fail with concrete failures: steering test shows instruction not applied (cycle output unchanged), distinct-instances test shows equal instance IDs, admission-parity test shows refuting claims filtered, CLI test shows placeholder instance IDs.
- **Test tier:** `integration`
- **Verification service:** `platform-test-runner + Postgres + fleet`
- **Flow ref:** `UC-SVC-05/AC-2,AC-3`
- **Verify:** `PLATFORM_IT=1 bun test --grep 'gate-2' services/platform/tests/integration/mission-engine-red.test.ts >> .tmp/gate-4/red-output.txt; exit 1`
- **Scenario:**
  - **Tier:** `visible` · **Test tier:** `integration`
  - **Verification service:** `platform-test-runner + Postgres + fleet`
  - **Topology:** `single-node`
  - **Negative control — would fail if:
    - tests pass on stub implementations
    - instance IDs are hardcoded to different values (cheating the inequality)
    - tests mock fleet responses
  - **Evidence:** artifact `file_artifact`, required_capture=True
  - **Case 1** — start_ref `stub-gate-2-implementations`:
    - actor: `background_job`
    - step: Run test suite with PLATFORM_IT=1
    - step: Append RED output to .tmp/gate-4/red-output.txt
    - step: Verify 4 failures with concrete instance ID assertions
    - MUST observe:
      - Exit code 1
      - 4 test failures with concrete assertions
      - Distinct-instances failure shows equal IDs (e.g., 'Expected: different, Actual: both inst-123')
      - Steering failure shows cycle output missing instruction constraint — output lacks "recent papers" pattern
    - MUST NOT observe:
      - tests passing (tests fail in RED phase)
      - errors instead of assertion failures (no failures before fix)
      - vague 'instance IDs different' without concrete values (no concrete inequality)

### AC-3: Tests follow existing mission-engine-red pattern
- **GIVEN:** The existing test pattern in mission-engine-red.test.ts lines 2399-2456
- **WHEN:** Reviewer inspects the new gate-1 and gate-2 test sections
- **THEN:** New tests follow the same structure: seed data via public_api, action through real HTTP surface, assert concrete MUST_OBSERVE values (row counts, status codes), assert MUST_NOT_OBSERVE empty signatures. Tests are integration-tier with real Postgres.
- **Test tier:** `integration`
- **Verification service:** `code-review`
- **Flow ref:** `TEST-PATTERN-CONSISTENCY`
- **Verify:** `grep -A 20 'gate-1.*uncited-kill' services/platform/tests/integration/mission-engine-red.test.ts | grep -E 'GIVEN|WHEN|THEN|MUST_OBSERVE'`
- **Scenario:**
  - **Tier:** `visible` · **Test tier:** `integration`
  - **Verification service:** `code-review`
  - **Topology:** `single-node`
  - **Negative control — would fail if:
    - tests use different structure (e.g., unit-test style) (static)
    - tests lack GIVEN-WHEN-THEN comments (static)
    - tests assert only exit codes without row counts (static)
  - **Evidence:** artifact `code-query`, required_capture=True
  - **Case 1** — start_ref `existing-red-test-pattern`:
    - actor: `code-reviewer`
    - step: Read mission-engine-red.test.ts lines 2399-2456
    - step: Compare with new gate-1 and gate-2 test sections
    - step: Verify pattern consistency
    - MUST observe:
      - New tests have GIVEN/WHEN/THEN comments — 4 comments per test (GIVEN, WHEN, THEN, SCENARIO)
      - New tests seed via public_api (not direct INSERT) — 0 direct INSERT statements
      - New tests assert row counts and concrete values — assertions like "COUNT(*) == 1"
      - New tests include MUST_NOT_OBSERVE assertions — 2+ MUST_NOT_OBSERVE per test
    - MUST NOT observe:
      - Pattern deviation from existing tests (empty/start signature missing)
      - Missing MUST_NOT_OBSERVE sections (empty/start signature missing)
      - Direct database manipulation in tests (empty/start signature missing)

### AC-4: RED output captured for all tests
- **GIVEN:** All 8 RED tests (4 gate-1 + 4 gate-2) written and failing
- **WHEN:** Test suite runs with PLATFORM_IT=1
- **THEN:** RED output file .tmp/gate-4/red-output.txt contains 8 distinct test failures with concrete assertion details. File size > 1KB. Implementer can read this file to understand exactly what each test expects.
- **Test tier:** `integration`
- **Verification service:** `file-system`
- **Flow ref:** `RED-EVIDENCE-CAPTURE`
- **Verify:** `cat .tmp/gate-4/red-output.txt | grep -c 'FAIL' | grep 8`
- **Scenario:**
  - **Tier:** `visible` · **Test tier:** `integration`
  - **Verification service:** `file-system`
  - **Topology:** `single-node`
  - **Negative control — would fail if:
    - RED output file is missing (static)
    - file contains fewer than 8 failures (static)
    - file has only summary without concrete failures (static)
  - **Evidence:** artifact `file_artifact`, required_capture=True
  - **Case 1** — start_ref `complete-red-test-suite`:
    - actor: `background_job`
    - step: Run PLATFORM_IT=1 bun test --grep 'gate-1|gate-2'
    - step: Redirect output to .tmp/gate-4/red-output.txt
    - step: Count FAIL lines and verify file size
    - MUST observe:
      - File .tmp/gate-4/red-output.txt exists and size > 1KB
      - File contains 8 'FAIL' lines (one per test)
      - Each FAIL includes expected vs actual with concrete values — "Expected: 0, Actual: 1" format
      - File includes assertion error messages (e.g., 'Expected: 0, Actual: 1')
    - MUST NOT observe:
      - Empty RED output file (file has content)
      - Fewer than 8 FAIL lines (no failures before fix)
      - Generic 'test failed' without concrete values (no failures before fix)

## Test Criteria
| ID | Statement | Maps to | Verify |
|---|---|---|---|
| TC-1 | RED tests fail on real Postgres | AC-1 | `PLATFORM_IT=1 bun test --grep 'gate-1|gate-2' services/platform/tests/integration/mission-engine-red.test.ts; exit 1` |
| TC-2 | 8 test failures captured in RED output | AC-4 | `grep -c 'FAIL' .tmp/gate-4/red-output.txt | grep 8` |
| TC-3 | Tests use real Postgres fixtures | AC-1 | `grep -c 'PLATFORM_IT=1|public_api' services/platform/tests/integration/mission-engine-red.test.ts | grep -E '[0-9]+'` |
| TC-4 | No mock or stub databases in tests | AC-1 | `! grep -r 'mock.*database|:memory:.*sqlite' services/platform/tests/integration/mission-engine-red.test.ts` |

## Reading List
- `services/platform/tests/integration/mission-engine-red.test.ts` (2399-2456) — Existing RED test pattern with concrete assertions and GIVEN-WHEN-THEN structure
- `/Users/inference1/Projects/brain/docs/TDD-METHODOLOGY.md` (RED phase requirements) — RED test must fail with concrete assertions before implementation
- `/Users/inference1/Projects/brain/docs/TESTING-HIERARCHY.md` (Integration test definition) — Integration tests use real services (Postgres, fleet) not mocks
- `/Users/inference1/Projects/brain/docs/kanban/SCENARIO-CONTRACT-V1.md` (Negative control and MUST_OBSERVE requirements) — Every test must have negative control and concrete MUST_OBSERVE values
- `services/platform/tests/integration/mission-engine-red.test.ts` (1-100) — Test file structure and fixture patterns

## Guardrails
**Write allowed:**
- `services/platform/tests/integration/mission-engine-red.test.ts (MODIFY for gate-1 and gate-2 RED tests)`
- `.tmp/gate-4/ (NEW for RED output capture)`
- `services/platform/tests/fixtures/* (NEW for shared test fixtures)`
**Write prohibited:**
- `Any implementation code — this is RED-FIRST, no GREEN yet`
- `services/platform/src/http/* — no handler modifications in RED phase`
- `services/platform/src/mission/* — no runtime modifications in RED phase`

## Design
**References:**
- Existing mission-engine-red.test.ts lines 2399-2456 for pattern
- Sprint 22 RED test generation approach (write failing tests first)
**Interaction notes:**
- T
- e
- s
- t
- s
-  
- m
- u
- s
- t
-  
- b
- e
-  
- r
- u
- n
- n
- a
- b
- l
- e
-  
- i
- n
- d
- e
- p
- e
- n
- d
- e
- n
- t
- l
- y
-  
- (
- b
- u
- n
-  
- t
- e
- s
- t
-  
- -
- -
- g
- r
- e
- p
-  
- '
- g
- a
- t
- e
- -
- 1
- '
-  
- o
- r
-  
- '
- g
- a
- t
- e
- -
- 2
- '
- )
- .
-  
- F
- i
- x
- t
- u
- r
- e
- s
-  
- s
- h
- o
- u
- l
- d
-  
- b
- e
-  
- s
- h
- a
- r
- e
- d
-  
- v
- i
- a
-  
- s
- e
- r
- v
- i
- c
- e
- s
- /
- p
- l
- a
- t
- f
- o
- r
- m
- /
- t
- e
- s
- t
- s
- /
- f
- i
- x
- t
- u
- r
- e
- s
- /
-  
- t
- o
-  
- a
- v
- o
- i
- d
-  
- d
- u
- p
- l
- i
- c
- a
- t
- i
- o
- n
- .
- **Pattern:** RED-FIRST TDD: Write failing tests with concrete assertions against real Postgres, capture RED output, then hand off to implementer for GREEN phase
- **Pattern source:** `global TDD methodology + existing mission-engine-red.test.ts pattern`
- **Anti-pattern:** Writing implementation before tests, or tests that pass on stubs

## Verification Gates
- **RED tests fail with concrete assertions**
  - command: `PLATFORM_IT=1 bun test --grep 'gate-1|gate-2' services/platform/tests/integration/mission-engine-red.test.ts; exit 1`
  - expected: Exit 1 with 8 test failures, each showing concrete expected vs actual values
- **RED output captured**
  - command: `cat .tmp/gate-4/red-output.txt | wc -c | grep -E '[0-9]{4,}'`
  - expected: File size > 1000 bytes (8 failures with details)
- **Tests follow existing pattern**
  - command: `grep -c 'GIVEN|WHEN|THEN|MUST_OBSERVE' services/platform/tests/integration/mission-engine-red.test.ts | grep -E '[0-9]{3,}'`
  - expected: Multiple GIVEN-WHEN-THEN-MUST_OBSERVE comments (pattern compliance)
- **No implementation code written**
  - command: `git diff --name-only services/platform/src`
  - expected: Empty (no src files modified in RED phase)

## Agent Assignment
- **Agent:** `red-test-generator` — RED test generation specialist for TDD-first workflow
- **Reviewer:** `mastra-reviewer` — adversarial seam-sufficiency + determinism review

## Evidence Gates
- RED-against-start for every behavioral AC (tdd_mode `red_first`): True
- Real-services (Postgres + fleet) integration proof required: `True`
- Fakeability: `validate_scenario.py` exit 0 on every behavioral AC (independently re-verified)

## Review Criteria
- Deterministic rules are Postgres-enforced (CHECK / SECURITY DEFINER / unique index), not handler-only
- ASSAY≠CHALLENGE uses real fleet instance ids, not hardcoded strings
- Fulcrum is an alias/instantiation of evidence-research — zero new platform code
- Every behavioral AC's scenario passes `validate_scenario.py` with zero CRITICAL/HIGH

## Dependencies
- **Depends on:** none
- **Blocks:** gate-1, gate-2

## Coding Standards
- `brain/docs/coding-standards/testing.md`
- `brain/docs/TDD-METHODOLOGY.md`
- `brain/docs/TESTING-HIERARCHY.md`

## Notes
- Generated by /kb-sprint-tasks-plan on 2026-07-21. Topological order in SPRINT.md: gate-4 (RED first) → gate-1 ∥ gate-2 → gate-3 (capstone) → gate-5 (review).
- PRD refs: UC-SVC-05, T-SVC-017, T-SVC-018, T-SVC-019.

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "gate-4",
  "tdd_mode": "red_first",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": true,
    "requires_seeded_evidence": true
  },
  "fixtures": {
    "stub-gate-1-handlers": {
      "description": "Stub implementations that ignore all three deterministic rules (for RED tests to fail against)",
      "seed_method": "recorded_external",
      "records": [
        "Handlers exist but skip all rule checks before INSERT"
      ]
    },
    "stub-gate-2-implementations": {
      "description": "Stub implementations that ignore steering and use same instance IDs for assay/challenge",
      "seed_method": "recorded_external",
      "records": [
        "Steering write succeeds but is never read",
        "Instance IDs hardcoded to same value"
      ]
    },
    "existing-red-test-pattern": {
      "description": "Reference pattern from lines 2399-2456 of mission-engine-red.test.ts",
      "seed_method": "recorded_external",
      "records": [
        "Read existing test structure for pattern consistency"
      ]
    },
    "complete-red-test-suite": {
      "description": "All 8 RED tests written and ready to run",
      "seed_method": "recorded_external",
      "records": [
        "4 gate-1 tests + 4 gate-2 tests in mission-engine-red.test.ts"
      ]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "description": "GIVEN: Empty or stub implementations of uncited-kill rejection, WIP=1 check, and probe-gated advance. WHEN: Test suite runs with PLATFORM_IT=1 against real Postgres. THEN: All 4 gate-1 tests fail with concrete failures: uncited-kill test shows verdict inserted (should be 0), WIP=1 test shows second run created (should be 403), unprobed-advance test shows verdict inserted (should be 403), rollback test shows partial rows (should be 0).",
      "verify": "PLATFORM_IT=1 bun test --grep 'gate-1' services/platform/tests/integration/mission-engine-red.test.ts > .tmp/gate-4/red-output.txt; exit 1"
    },
    {
      "id": "AC-2",
      "type": "acceptance_criterion",
      "description": "GIVEN: Stub implementations that ignore steering or use same instance IDs. WHEN: Test suite runs with PLATFORM_IT=1 against real Postgres and real fleet. THEN: All 4 gate-2 tests fail with concrete failures: steering test shows instruction not applied (cycle output unchanged), distinct-instances test shows equal instance IDs, admission-parity test shows refuting claims filtered, CLI test shows placeholder instance IDs.",
      "verify": "PLATFORM_IT=1 bun test --grep 'gate-2' services/platform/tests/integration/mission-engine-red.test.ts >> .tmp/gate-4/red-output.txt; exit 1"
    },
    {
      "id": "AC-3",
      "type": "acceptance_criterion",
      "description": "GIVEN: The existing test pattern in mission-engine-red.test.ts lines 2399-2456. WHEN: Reviewer inspects the new gate-1 and gate-2 test sections. THEN: New tests follow the same structure: seed data via public_api, action through real HTTP surface, assert concrete MUST_OBSERVE values (row counts, status codes), assert MUST_NOT_OBSERVE empty signatures. Tests are integration-tier with real Postgres.",
      "verify": "grep -A 20 'gate-1.*uncited-kill' services/platform/tests/integration/mission-engine-red.test.ts | grep -E 'GIVEN|WHEN|THEN|MUST_OBSERVE'"
    },
    {
      "id": "AC-4",
      "type": "acceptance_criterion",
      "description": "GIVEN: All 8 RED tests (4 gate-1 + 4 gate-2) written and failing. WHEN: Test suite runs with PLATFORM_IT=1. THEN: RED output file .tmp/gate-4/red-output.txt contains 8 distinct test failures with concrete assertion details. File size > 1KB. Implementer can read this file to understand exactly what each test expects.",
      "verify": "cat .tmp/gate-4/red-output.txt | grep -c 'FAIL' | grep 8"
    },
    {
      "id": "TC-1",
      "type": "test_criterion",
      "description": "RED tests fail on real Postgres",
      "verify": "PLATFORM_IT=1 bun test --grep 'gate-1|gate-2' services/platform/tests/integration/mission-engine-red.test.ts; exit 1",
      "maps_to_ac": "AC-1"
    },
    {
      "id": "TC-2",
      "type": "test_criterion",
      "description": "8 test failures captured in RED output",
      "verify": "grep -c 'FAIL' .tmp/gate-4/red-output.txt | grep 8",
      "maps_to_ac": "AC-4"
    },
    {
      "id": "TC-3",
      "type": "test_criterion",
      "description": "Tests use real Postgres fixtures",
      "verify": "grep -c 'PLATFORM_IT=1|public_api' services/platform/tests/integration/mission-engine-red.test.ts | grep -E '[0-9]+'",
      "maps_to_ac": "AC-1"
    },
    {
      "id": "TC-4",
      "type": "test_criterion",
      "description": "No mock or stub databases in tests",
      "verify": "! grep -r 'mock.*database|:memory:.*sqlite' services/platform/tests/integration/mission-engine-red.test.ts",
      "maps_to_ac": "AC-1"
    }
  ]
}
-->

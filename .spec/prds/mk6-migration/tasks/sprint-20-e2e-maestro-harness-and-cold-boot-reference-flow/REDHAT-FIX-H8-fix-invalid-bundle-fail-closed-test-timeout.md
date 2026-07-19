# REDHAT-FIX-H8 — Fix the invalid-bundle fail-closed boundary test so the real PLATFORM_IT lane completes without timeout
> Status: Backlog
> Sprint: [Sprint 20 — E2E Maestro Harness and Cold-Boot Reference Flow](./SPRINT.md)
> Agent: red-test-generator
> Estimate: 45 min
> Type: FEATURE
> Priority: P0
> Proposed by: red-test-generator
> TDD_MODE: red_first · RED_GREEN_REQUIRED: yes · SEEDED_EVIDENCE_REQUIRED: yes
> Source finding: `.spec/reviews/red-hat-sprint-20-20260719T204500Z.md` H8 (High)

## Outcome

`tests/integration/sprint20-maestro-harness.test.ts:88` ("fails closed when EXPO_DEV_BUILD_PATH is not a real bundle") completes within an explicit per-test timeout that accommodates the real boot→install cycle (zero-cache readiness wait + simulator bootstatus + `xcrun simctl install` failure), and the full `PLATFORM_IT` lane (`sprint20-maestro-harness.test.ts` + `sprint20-maestro-harness-artifacts.test.ts` + `sprint20-zero-builder-query.test.ts`) reports 18 passed / 0 failed with no timeout. The boundary assertions still catch a regression that would let an invalid bundle through.

**Success state:** `PLATFORM_IT=1 pnpm exec vitest run tests/integration/sprint20-maestro-harness.test.ts tests/integration/sprint20-maestro-harness-artifacts.test.ts tests/integration/sprint20-zero-builder-query.test.ts` exits 0 with all 18 tests passing; the invalid-bundle case itself runs in ≤ 120s wall-clock (well under its declared timeout) AND still asserts non-zero exit + the install-attempted/rejected-as-missing invariant.

## Background

- **Specialist rationale:** Red-hat H8 (High) shows a fresh `PLATFORM_IT=1 pnpm exec vitest run tests/integration/sprint20-maestro-harness.test.ts tests/integration/sprint20-maestro-harness-artifacts.test.ts tests/integration/sprint20-zero-builder-query.test.ts` produced 17 passed / 1 failed; the failing case at `tests/integration/sprint20-maestro-harness.test.ts:88` ("fails closed when EXPO_DEV_BUILD_PATH is not a real bundle") timed out after 5000ms. The test invokes `scripts/e2e/run-maestro-reference-flow.sh --run` against an empty directory, which legitimately drives the harness's full boot path — zero-cache readiness wait (`run-maestro-reference-flow.sh:70-81`, up to 30 one-second polls), `xcrun simctl bootstatus` (line 87), and the real `xcrun simctl install` against the bad bundle (line 93). Vitest's default 5s test timeout cannot accommodate that real-service path.
- **Planning rationale:** This task unblocks D03-01 AC-1/TC-2 (FAIL → PASS). It is test-only remediation; the harness script's behavior is correct — the test was undersized for the real cycle it exercises. The fix is to declare an explicit per-test timeout that matches reality AND prove the test still catches a regression via a RED-then-GREEN check against a fixture that disables the `[[ -d "$app_path" ]]` guard.
- **How to verify (human):** Run the three-file `PLATFORM_IT` lane and observe 18 passed / 0 failed / no timeouts; inspect the test file and confirm the invalid-bundle `it(...)` declares a `120_000` ms (or larger) timeout.
- **Scope:** One existing test file. Does NOT modify `scripts/e2e/run-maestro-reference-flow.sh` (owned by D03-03 / REDHAT-FIX-H3) — if a fast-fail structural check is desired there, that's a follow-up under H3's scope.
- **PRD refs:** UC-SYNC-02, 10-e2e-testing, D03-01 AC-1/TC-2

## Critical Constraints

### MUST
- MUST declare an explicit per-test timeout on the invalid-bundle `it(...)` case (`{ timeout: 120_000 }` or the third positional `it(name, fn, 120_000)` form) large enough to absorb the real zero-cache readiness wait (≤ 30s) + `simctl bootstatus` (highly variable) + `xcrun simctl install` (1–10s on a booted simulator)
- MUST preserve the existing boundary assertions: (a) the harness exits non-zero, (b) EITHER stderr contains `'Expo development build does not exist'` OR `$E2E_ARTIFACT_DIR/simctl-install.txt` exists (proving the install was attempted and failed), (c) `junit.xml` is NOT written before the failure, (d) stderr does not contain `'"status":"OK"'`
- MUST prove the test still catches a regression via a RED-then-GREEN comparison: against a deliberately weakened harness fixture (one that strips the `[[ -d "$app_path" ]]` guard at `run-maestro-reference-flow.sh:43`), the test fails RED naming the missing guard; against the real harness, it passes GREEN

### NEVER
- NEVER remove or weaken the boundary assertions to make the test pass faster — that converts a real boundary into a tautology
- NEVER split the invalid-bundle case into a `--check`-only variant that bypasses the real boot+install path; `--check` exits before the install attempt and cannot satisfy D03-01 AC-1 case 2 ("`--run` exits non-zero via a real xcrun install failure")
- NEVER introduce a `vitest.config.ts` global timeout override that masks other slow tests — the timeout MUST be scoped to this one `it(...)`

### STRICTLY
- STRICTLY the per-test timeout MUST be declared at the `it(...)` level (not `describe`, not config) so it is obvious to reviewers that this single case owns the long real-service path

## Specification

**Objective:** Fix the invalid-bundle test timeout so the `PLATFORM_IT` lane completes with 18 passed / 0 failed, while preserving the boundary assertions and proving the test still catches regressions.

**Success state:** All three test files pass; the invalid-bundle case declares a 120s+ timeout; the regression-RED fixture fails the test; the real harness passes the test.

## Acceptance Criteria

### AC-1: Invalid-bundle test passes within an explicit per-test timeout [PRIMARY]
**GIVEN:** `PLATFORM_IT=1` is set and the real harness at `scripts/e2e/run-maestro-reference-flow.sh` is on `main`
**WHEN:** the operator runs `PLATFORM_IT=1 pnpm exec vitest run tests/integration/sprint20-maestro-harness.test.ts`
**THEN:** all cases pass (including "fails closed when EXPO_DEV_BUILD_PATH is not a real bundle"), the invalid-bundle case itself completes in ≤ 120s wall-clock, and `rg -n 'timeout.*120_?000|120_?000.*timeout' tests/integration/sprint20-maestro-harness.test.ts` finds the explicit per-test timeout declaration
**VERIFY:** `PLATFORM_IT=1 pnpm exec vitest run tests/integration/sprint20-maestro-harness.test.ts -t 'not a real bundle' && rg -n '120.?000' tests/integration/sprint20-maestro-harness.test.ts`
**TEST_TIER:** integration
**VERIFICATION_SERVICE:** vitest + real harness + real xcrun simctl install failure
**TDD_STATE:** none
**UNIT_TEST_JUSTIFIED:** None
#### Scenario contract
```json
{
  "tier": "visible",
  "test_tier": "integration",
  "verification_service": "vitest + real harness + real xcrun simctl install failure",
  "topology": "single-node",
  "negative_control": { "would_fail_if": ["stub", "empty", "mock", "static", "short-timeout", "weakened-assertion", "missing-guard"] },
  "evidence": { "artifact_type": "stdout", "required_capture": true },
  "cases": [
    {
      "start_ref": "platform_it_lane_with_real_harness",
      "action": { "actor": "operator", "steps": ["Run pnpm exec vitest run tests/integration/sprint20-maestro-harness.test.ts -t 'not a real bundle'.", "Inspect the test report and wall-clock duration."] },
      "end_state": {
        "must_observe": ["test status: passed (exitCode: 0)", "wall-clock duration <= 120 seconds", "rg '120.?000' matches >= 1 occurrence in the test source (per-test timeout >= 120000 ms)", "harness exitCode captured by the test: != 0", "existsSync(junit.xml) === false (junit.xml NOT written before failure)"],
        "must_not_observe": ["empty/start signature: test timed out at 5000 ms", "test passes by removing the boundary assertions", "global vitest config timeout override"]
      }
    }
  ]
}
```

### AC-2: Test catches a regression — RED against a weakened harness fixture, GREEN against the real harness
**GIVEN:** `tests/integration/fixtures/run-maestro-reference-flow.weakened-guard.sh` exists and is a copy of the real harness with the `[[ -d "$app_path" ]] || fail "Expo development build does not exist: $app_path"` guard at line 43 stripped (so an empty directory sails past the precondition)
**WHEN:** the operator runs the test's regression-RED case against the weakened fixture, then re-runs AC-1 against the real harness
**THEN:** the regression-RED case exits non-zero (the test detects the harness accepted the invalid bundle — e.g. by asserting the harness reached the maestro step OR by asserting the absence of the fail-closed stderr line); the GREEN case against the real harness exits 0
**VERIFY:** `PLATFORM_IT=1 pnpm exec vitest run tests/integration/sprint20-maestro-harness.test.ts -t 'regression-RED'; test $? -ne 0 && PLATFORM_IT=1 pnpm exec vitest run tests/integration/sprint20-maestro-harness.test.ts -t 'not a real bundle'`
**TEST_TIER:** integration
**VERIFICATION_SERVICE:** vitest + fixture comparison + real harness
**TDD_STATE:** none
**UNIT_TEST_JUSTIFIED:** None
#### Scenario contract
```json
{
  "tier": "visible",
  "test_tier": "integration",
  "verification_service": "vitest + fixture comparison + real harness",
  "topology": "single-node",
  "negative_control": { "would_fail_if": ["stub", "mock", "static", "always-pass", "no-fixture"] },
  "evidence": { "artifact_type": "stdout", "required_capture": true },
  "cases": [
    {
      "start_ref": "weakened_harness_fixture_present",
      "action": { "actor": "operator", "steps": ["Run the regression-RED case against tests/integration/fixtures/run-maestro-reference-flow.weakened-guard.sh.", "Run the AC-1 case against the real scripts/e2e/run-maestro-reference-flow.sh."] },
      "end_state": {
        "must_observe": ["regression-RED against weakened fixture: exitCode != 0 AND stderr contains 'missing guard'", "AC-1 against real harness: exitCode: 0"],
        "must_not_observe": ["empty/start signature: both runs pass", "regression-RED passes against the weakened fixture"]
      }
    }
  ]
}
```

### AC-3: Full PLATFORM_IT lane (3 files, 18 tests) reports 18 passed / 0 failed
**GIVEN:** AC-1 and AC-2 are implemented and the harness substrate (simulator, zero-cache spawn path, real nonprod Postgres) is available
**WHEN:** the operator runs `PLATFORM_IT=1 pnpm exec vitest run tests/integration/sprint20-maestro-harness.test.ts tests/integration/sprint20-maestro-harness-artifacts.test.ts tests/integration/sprint20-zero-builder-query.test.ts`
**THEN:** vitest reports 18 passed / 0 failed / 0 skipped with no timeout; the red-hat H8 regression is closed
**VERIFY:** `PLATFORM_IT=1 pnpm exec vitest run tests/integration/sprint20-maestro-harness.test.ts tests/integration/sprint20-maestro-harness-artifacts.test.ts tests/integration/sprint20-zero-builder-query.test.ts 2>&1 | rg -q '18 passed'`
**TEST_TIER:** integration
**VERIFICATION_SERVICE:** vitest PLATFORM_IT lane + real harness + real xcrun + real nonprod Postgres
**TDD_STATE:** none
**UNIT_TEST_JUSTIFIED:** None
#### Scenario contract
```json
{
  "tier": "visible",
  "test_tier": "integration",
  "verification_service": "vitest PLATFORM_IT lane + real harness + real xcrun + real nonprod Postgres",
  "topology": "single-node",
  "negative_control": { "would_fail_if": ["stub", "empty", "mock", "static", "timeout", "1-failed"] },
  "evidence": { "artifact_type": "stdout", "required_capture": true },
  "cases": [
    {
      "start_ref": "platform_it_lane_with_real_harness",
      "action": { "actor": "operator", "steps": ["Run pnpm exec vitest run across all three Sprint 20 harness test files with PLATFORM_IT=1.", "Inspect the final summary line."] },
      "end_state": {
        "must_observe": ["summary: 18 passed", "summary: 0 failed", "vitest stdout: 0 occurrences of 'Test timed out'"],
        "must_not_observe": ["empty/start signature: 17 passed / 1 failed", "Test timed out in 5000ms"]
      }
    }
  ]
}
```

## Test Criteria

| ID | Statement | Maps to | Verify | Type |
|----|-----------|---------|--------|------|
| TC-1 | Invalid-bundle test passes within an explicit ≥120s per-test timeout | AC-1 | `PLATFORM_IT=1 pnpm exec vitest run tests/integration/sprint20-maestro-harness.test.ts -t 'not a real bundle' && rg -n '120.?000' tests/integration/sprint20-maestro-harness.test.ts` | happy_path |
| TC-2 | Test fails RED against the weakened-guard fixture, passes GREEN against the real harness | AC-2 | `PLATFORM_IT=1 pnpm exec vitest run tests/integration/sprint20-maestro-harness.test.ts -t 'regression-RED'; test $? -ne 0 && PLATFORM_IT=1 pnpm exec vitest run tests/integration/sprint20-maestro-harness.test.ts -t 'not a real bundle'` | error |
| TC-3 | Full PLATFORM_IT lane reports 18 passed / 0 failed with no timeout | AC-3 | `PLATFORM_IT=1 pnpm exec vitest run tests/integration/sprint20-maestro-harness.test.ts tests/integration/sprint20-maestro-harness-artifacts.test.ts tests/integration/sprint20-zero-builder-query.test.ts 2>&1 \| rg -q '18 passed'` | happy_path |

## Reading List

1. `tests/integration/sprint20-maestro-harness.test.ts` (1-164) [PRIMARY PATTERN] — the test under remediation; line 88 is the failing case, lines 15-30 define the `validHarnessEnv` baseline
2. `scripts/e2e/run-maestro-reference-flow.sh` (1-124) — the harness under test; lines 39-46 are the precondition guards (incl. `[[ -d "$app_path" ]]`), lines 56-81 are the zero-cache boot path that drives the wall-clock duration, line 93 is the `xcrun simctl install` failure point
3. `tests/integration/sprint20-maestro-harness-artifacts.test.ts` (full) — companion test file in the PLATFORM_IT lane; confirms 17-of-18 baseline
4. `tests/integration/sprint20-zero-builder-query.test.ts` (full) — companion test file in the PLATFORM_IT lane
5. `.github/workflows/ci-e2e.yml` (1-93) — CI consumer contract; documents the env block the test must mirror
6. `.spec/prds/mk6-migration/tasks/sprint-20-e2e-maestro-harness-and-cold-boot-reference-flow/D03-01-red-maestro-harness-fails-closed-without-simulator-build-backend.md` (88-124,139-143) — original D03-01 AC-1/TC-2 contract this task remediates
7. `.spec/reviews/red-hat-sprint-20-20260719T204500Z.md` (71-75) — H8 finding: 17 passed / 1 failed timeout

## Guardrails

### WRITE-ALLOWED
- tests/integration/sprint20-maestro-harness.test.ts (MODIFY — add explicit `it(..., 120_000)` per-test timeout to the invalid-bundle case; add the regression-RED case)
- tests/integration/fixtures/run-maestro-reference-flow.weakened-guard.sh (NEW — deliberately weakened fixture for the RED case)

### WRITE-PROHIBITED
- scripts/e2e/run-maestro-reference-flow.sh — owned by D03-03 / REDHAT-FIX-H3; this task only consumes its exit code and artifact directory
- vitest.config.ts — NO global timeout override; the timeout MUST be declared at the `it(...)` level
- .github/workflows/ci-e2e.yml — out of scope; CI timing is downstream of the test fix
- tests/integration/sprint20-maestro-harness-artifacts.test.ts — companion file, out of scope

### Boundaries
- **always:** Declare the per-test timeout at the `it(...)` level; preserve the existing boundary assertions; prove the test still catches a regression via the weakened-guard fixture
- **ask_first:** Adding a fast `--check`-mode preflight in the harness that structurally rejects an empty directory (e.g. `Info.plist` presence) — that's an H3 follow-up, not this task
- **never:** Removing the boundary assertions; splitting the case into a `--check`-only variant that bypasses the real boot path; introducing a global vitest config timeout

## Design

- **references:** tests/integration/sprint20-maestro-harness.test.ts, scripts/e2e/run-maestro-reference-flow.sh
- **pattern:** Vitest per-test timeout via the third positional arg: `it('fails closed when EXPO_DEV_BUILD_PATH is not a real bundle', () => { ... }, 120_000)`. Add a `regression-RED` case that points the same `runHarness` helper at `tests/integration/fixtures/run-maestro-reference-flow.weakened-guard.sh` (a copy with the `[[ -d "$app_path" ]] || fail ...` guard stripped) and asserts the harness reaches a downstream step (e.g. zero-cache log file exists OR stderr lacks the fail-closed message) — proving the boundary is enforced by the guard the test asserts against.
- **pattern_source:** tests/integration/sprint20-maestro-harness.test.ts:15-30 (existing validHarnessEnv + runHarness helpers)
- **anti_pattern:** A global `vitest.config.ts` `testTimeout: 120_000` that silently applies to every test in the suite — masks other slow tests and defeats the reviewer-visibility goal.

## Agent Assignment

- **implementer:** red-test-generator — extends the existing fail-closed test suite (same as D03-01)
- **reviewer:** mastra-reviewer — verifies the boundary assertions still catch a regression; verifies the timeout is per-test, not global

## Verification Gates

- **AC-1 timeout declared + test passes:** `PLATFORM_IT=1 pnpm exec vitest run tests/integration/sprint20-maestro-harness.test.ts -t 'not a real bundle'` → Exit 0; `rg -n '120.?000' tests/integration/sprint20-maestro-harness.test.ts` → match
- **AC-2 RED-then-GREEN:** regression-RED against fixture (non-zero) AND AC-1 against real harness (zero)
- **AC-3 full lane:** `PLATFORM_IT=1 pnpm exec vitest run tests/integration/sprint20-maestro-harness.test.ts tests/integration/sprint20-maestro-harness-artifacts.test.ts tests/integration/sprint20-zero-builder-query.test.ts 2>&1 | rg -q '18 passed'` → Exit 0
- **Scope compliance:** `git diff --name-only | sort -u` → Only guardrails.write_allowed paths

## Coding Standards

- RULES.md
- brain/docs/kanban/TASK-TEMPLATE.md
- brain/docs/kanban/SCENARIO-CONTRACT-V1.md
- brain/docs/RED-FIRST-TEST-GATE.md

## Dependencies

- **depends_on:** D03-01 (defines the contract this test fulfills), D03-03 (owns the harness under test; the harness is correct as-is — this task does NOT modify it)
- **blocks:** D03-01 AC-1/TC-2 (FAIL → PASS), the Sprint-20 close handshake

## Notes

The red-hat reviewer's fresh run showed the harness behavior is correct — the test was undersized. Vitest's default 5s test timeout cannot accommodate the real boot path: zero-cache readiness alone can take up to 30s (`run-maestro-reference-flow.sh:70-79` polls once per second for 30 iterations), and `xcrun simctl bootstatus` is variable. A 120s per-test timeout is generous headroom; the test typically completes in 20-60s on a booted simulator. The regression-RED fixture is the proof that the boundary assertions are still load-bearing — a follow-up that "refactors" the test by removing assertions would be caught.

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "REDHAT-FIX-H8",
  "proposed_by": "red-test-generator",
  "tdd_mode": "red_first",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": true,
    "requires_seeded_evidence": true
  },
  "fixtures": {
    "platform_it_lane_with_real_harness": {
      "description": "PLATFORM_IT=1 is set; scripts/e2e/run-maestro-reference-flow.sh is on main with its precondition guards intact; the named simulator and real nonprod Postgres are available.",
      "seed_method": "cli",
      "records": [
        "PLATFORM_IT=1 set",
        "scripts/e2e/run-maestro-reference-flow.sh:43 [[ -d \"$app_path\" ]] guard present",
        "xcrun simctl list devices available includes MAESTRO_DEVICE",
        "DATABASE_URL targets holocron_nonprod"
      ]
    },
    "weakened_harness_fixture_present": {
      "description": "tests/integration/fixtures/run-maestro-reference-flow.weakened-guard.sh is a copy of the real harness with the [[ -d \"$app_path\" ]] || fail guard at line 43 stripped, so an empty directory passes the precondition and reaches downstream steps.",
      "seed_method": "recorded_external",
      "records": [
        "tests/integration/fixtures/run-maestro-reference-flow.weakened-guard.sh exists",
        "fixture's precondition section lacks the Expo-development-build-does-not-exist guard"
      ]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "primary": true,
      "description": "GIVEN PLATFORM_IT=1 and the real harness WHEN the invalid-bundle test runs THEN it passes within an explicit >= 120s per-test timeout with all boundary assertions preserved.",
      "verify": "PLATFORM_IT=1 pnpm exec vitest run tests/integration/sprint20-maestro-harness.test.ts -t 'not a real bundle' && rg -n '120.?000' tests/integration/sprint20-maestro-harness.test.ts",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "vitest + real harness + real xcrun simctl install failure",
        "topology": "single-node",
        "negative_control": { "would_fail_if": ["stub", "empty", "mock", "static", "short-timeout", "weakened-assertion", "missing-guard"] },
        "evidence": { "artifact_type": "stdout", "required_capture": true },
        "cases": [
          {
            "start_ref": "platform_it_lane_with_real_harness",
            "action": { "actor": "operator", "steps": ["Run pnpm exec vitest run tests/integration/sprint20-maestro-harness.test.ts -t 'not a real bundle'.", "Inspect the test report and wall-clock duration."] },
            "end_state": {
              "must_observe": ["test status: passed (exitCode: 0)", "wall-clock duration <= 120 seconds", "rg '120.?000' matches >= 1 occurrence in the test source (per-test timeout >= 120000 ms)", "harness exitCode captured by the test: != 0", "existsSync(junit.xml) === false (junit.xml NOT written before failure)"],
              "must_not_observe": ["empty/start signature: test timed out at 5000 ms", "test passes by removing the boundary assertions", "global vitest config timeout override"]
            }
          }
        ]
      }
    },
    {
      "id": "AC-2",
      "type": "acceptance_criterion",
      "description": "GIVEN a weakened harness fixture WHEN regression-RED runs against it THEN it fails non-zero, then AC-1 against the real harness passes zero.",
      "verify": "PLATFORM_IT=1 pnpm exec vitest run tests/integration/sprint20-maestro-harness.test.ts -t 'regression-RED'; test $? -ne 0 && PLATFORM_IT=1 pnpm exec vitest run tests/integration/sprint20-maestro-harness.test.ts -t 'not a real bundle'",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "vitest + fixture comparison + real harness",
        "topology": "single-node",
        "negative_control": { "would_fail_if": ["stub", "mock", "static", "always-pass", "no-fixture"] },
        "evidence": { "artifact_type": "stdout", "required_capture": true },
        "cases": [
          {
            "start_ref": "weakened_harness_fixture_present",
            "action": { "actor": "operator", "steps": ["Run the regression-RED case against tests/integration/fixtures/run-maestro-reference-flow.weakened-guard.sh.", "Run the AC-1 case against the real scripts/e2e/run-maestro-reference-flow.sh."] },
            "end_state": {
              "must_observe": ["regression-RED against weakened fixture: exitCode != 0 AND stderr contains 'missing guard'", "AC-1 against real harness: exitCode: 0"],
              "must_not_observe": ["empty/start signature: both runs pass", "regression-RED passes against the weakened fixture"]
            }
          }
        ]
      }
    },
    {
      "id": "AC-3",
      "type": "acceptance_criterion",
      "description": "GIVEN AC-1 and AC-2 implemented WHEN the full 3-file PLATFORM_IT lane runs THEN vitest reports 18 passed / 0 failed with no timeout.",
      "verify": "PLATFORM_IT=1 pnpm exec vitest run tests/integration/sprint20-maestro-harness.test.ts tests/integration/sprint20-maestro-harness-artifacts.test.ts tests/integration/sprint20-zero-builder-query.test.ts 2>&1 | rg -q '18 passed'",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "vitest PLATFORM_IT lane + real harness + real xcrun + real nonprod Postgres",
        "topology": "single-node",
        "negative_control": { "would_fail_if": ["stub", "empty", "mock", "static", "timeout", "1-failed"] },
        "evidence": { "artifact_type": "stdout", "required_capture": true },
        "cases": [
          {
            "start_ref": "platform_it_lane_with_real_harness",
            "action": { "actor": "operator", "steps": ["Run pnpm exec vitest run across all three Sprint 20 harness test files with PLATFORM_IT=1.", "Inspect the final summary line."] },
            "end_state": {
              "must_observe": ["summary: 18 passed", "summary: 0 failed", "vitest stdout: 0 occurrences of 'Test timed out'"],
              "must_not_observe": ["empty/start signature: 17 passed / 1 failed", "Test timed out in 5000ms"]
            }
          }
        ]
      }
    },
    {
      "id": "TC-1",
      "type": "test_criterion",
      "description": "Invalid-bundle test passes within an explicit >=120s per-test timeout",
      "verify": "PLATFORM_IT=1 pnpm exec vitest run tests/integration/sprint20-maestro-harness.test.ts -t 'not a real bundle' && rg -n '120.?000' tests/integration/sprint20-maestro-harness.test.ts",
      "maps_to_ac": "AC-1"
    },
    {
      "id": "TC-2",
      "type": "test_criterion",
      "description": "Test RED against weakened-guard fixture, GREEN against real harness",
      "verify": "PLATFORM_IT=1 pnpm exec vitest run tests/integration/sprint20-maestro-harness.test.ts -t 'regression-RED'; test $? -ne 0 && PLATFORM_IT=1 pnpm exec vitest run tests/integration/sprint20-maestro-harness.test.ts -t 'not a real bundle'",
      "maps_to_ac": "AC-2"
    },
    {
      "id": "TC-3",
      "type": "test_criterion",
      "description": "Full PLATFORM_IT lane reports 18 passed / 0 failed with no timeout",
      "verify": "PLATFORM_IT=1 pnpm exec vitest run tests/integration/sprint20-maestro-harness.test.ts tests/integration/sprint20-maestro-harness-artifacts.test.ts tests/integration/sprint20-zero-builder-query.test.ts 2>&1 | rg -q '18 passed'",
      "maps_to_ac": "AC-3"
    }
  ]
}
-->

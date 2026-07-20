# REDHAT-FIX-H9 — Add explicit forced-failure coverage proving harness cleanup and artifact preservation, and strengthen lifecycle artifact assertions
> Status: ✅ Completed
> Sprint: [Sprint 20 — E2E Maestro Harness and Cold-Boot Reference Flow](./SPRINT.md)
> Agent: devops-engineer
> Estimate: 120 min
> Type: FEATURE
> Priority: P0
> Proposed by: devops-engineer
> TDD_MODE: red_first · RED_GREEN_REQUIRED: yes · SEEDED_EVIDENCE_REQUIRED: yes
> Source findings: `.spec/reviews/red-hat-sprint-20-20260719T204500Z.md` M1 (Medium) + M3 (High)

## Outcome

Two gaps in the D03-03 artifact/cleanup proof are closed: (M3) the missing `.tmp/forced-failure-flow.yaml` fixture and its TC-4 test are added, proving the harness captures `final.png` + `reference-flow.mov` and tears down zero-cache even when the main Maestro flow is deliberately broken; (M1) the weak `rg -l . file1 file2` oracle (which passes when only one of `simctl-uninstall.txt`/`simctl-install.txt` is non-empty) is replaced with a per-file non-empty assertion that proves BOTH lifecycle operations were captured. The current 0-byte `simctl-uninstall.txt` artifact is surfaced as a regression to fix in D03-03/REDHAT-FIX-H3, not hidden by a weak oracle.

**Success state:** `PLATFORM_IT=1 pnpm vitest run tests/integration/sprint20-maestro-harness-artifacts.test.ts -t 'TC-4'` passes against a real forced-failure run; `tests/fixtures/forced-failure-flow.yaml` exists and asserts on a testID that never appears (forcing the main flow to fail mid-run); `tests/integration/sprint20-maestro-harness-artifacts.test.ts` now asserts `simctl-uninstall.txt` AND `simctl-install.txt` are EACH non-empty (per-file, not aggregated); running the same suite against a fixture where `simctl-uninstall.txt` is deliberately empty fails RED, proving the strengthened oracle catches the M1 regression.

## Background

- **Specialist rationale:** Red-hat M3 (High) shows `D03-03:139-163,176` requires `.tmp/forced-failure-flow.yaml` and a TC-4 test; `test -e .tmp/forced-failure-flow.yaml` fails, and `rg 'TC-4|forced-failure|lsof' tests/integration/sprint20-maestro-harness-artifacts.test.ts` finds no TC-4 or forced-failure implementation. The current `cleanup()` source at `run-maestro-reference-flow.sh:109-115` is source-only evidence — it is never exercised by a forced failing run, so a regression that skips the trap (e.g. `set -e` early-exit, `kill 0` in a child) would not be caught. Red-hat M1 (Medium) shows `D03-03:83,173-176,218-221` uses `rg -l . file1 file2`, which succeeds when only one file is non-empty; current `simctl-uninstall.txt` is 0 bytes while `simctl-install.txt` is non-empty — this oracle does not prove both lifecycle operations were captured, and a future regression that silently empty-installs would not be caught either.
- **Planning rationale:** This task closes D03-03 AC-2 (PARTIAL → PASS, via the strengthened oracle) and AC-4 (FAIL → PASS, via the forced-failure TC-4). It is downstream of REDHAT-FIX-H3 (the cleanup trap must actually finalize video and tear down zero-cache) — if H3's fix surfaces an empty `simctl-uninstall.txt` as a real harness bug, this task's strengthened oracle is what surfaces it. Without M1's fix, a 0-byte uninstall artifact passes; without M3's fix, the cleanup-on-failure contract is untested.
- **How to verify (human):** Run the forced-failure TC-4 case and confirm `final.png` + `reference-flow.mov` are non-zero bytes AND `lsof -i :4848` returns no listener; then run the lifecycle-assertion case with a planted empty `simctl-uninstall.txt` and confirm the test fails RED.
- **Scope:** One new fixture, one new TC-4 test case, and one strengthened existing test case. Does NOT modify `scripts/e2e/run-maestro-reference-flow.sh` — that is REDHAT-FIX-H3's job (and the harness cleanup logic is correct as-is; the gap is the test coverage).
- **PRD refs:** UC-SYNC-02, 10-e2e-testing, D03-03 AC-2/AC-4

## Critical Constraints

### MUST
- MUST add `tests/fixtures/forced-failure-flow.yaml` (committed, not `.tmp/`) that is a copy of `.e2e/maestro/reference-flow.yaml` with a `waitFor`/`assertVisible` on a testID that never appears (e.g. `id: does-not-exist-forced-failure`), forcing the main Maestro test to fail mid-run deterministically
- MUST add a TC-4 test case to `tests/integration/sprint20-maestro-harness-artifacts.test.ts` that runs `MAESTRO_FLOW=tests/fixtures/forced-failure-flow.yaml scripts/e2e/run-maestro-reference-flow.sh --run` and asserts: (a) the harness exits non-zero, (b) `.tmp/maestro-reference-flow/final.png` is non-zero bytes, (c) `reference-flow.mov` is non-zero bytes (REDHAT-FIX-H3 owns the recorder fix; this test asserts the result), (d) `! lsof -i :4848` returns no listener (zero-cache torn down)
- MUST strengthen the existing lifecycle oracle: assert `simctl-terminate.txt`, `simctl-uninstall.txt`, AND `simctl-install.txt` are EACH non-empty via per-file `test -s` checks, NOT via the aggregate `rg -l . file1 file2` form; document the M1 weakness in a comment
- MUST include a RED-then-GREEN gate for the strengthened oracle: a fixture that plants an empty `simctl-uninstall.txt` MUST fail the oracle; the real run MUST pass it

### NEVER
- NEVER substitute a `maestro test --format JUNIT` mock or a synthetic junit.xml for the real forced-failure flow — the cleanup trap is what's under test and it only fires when the real `maestro` process exits
- NEVER silence the harness's non-zero exit code in the TC-4 assertions — the test asserts BOTH "harness exited non-zero" AND "cleanup ran anyway"; treating the non-zero exit as the only signal is the bug M3 exists to fix
- NEVER weaken the per-file lifecycle oracle back to the aggregate form to absorb a 0-byte uninstall artifact — that is the bug M1 exists to fix

### STRICTLY
- STRICTLY the TC-4 test must run with `PLATFORM_IT=1` and assert ALL of: non-zero harness exit, non-empty `final.png`, non-empty `reference-flow.mov`, no orphaned zero-cache listener — a partial assertion (e.g. exit code only) is the source of the current gap

## Specification

**Objective:** Add `.tmp/forced-failure-flow.yaml` (via committed `tests/fixtures/forced-failure-flow.yaml`) and TC-4 forced-failure coverage; strengthen the lifecycle oracle from `rg -l .` aggregate to per-file `test -s`.

**Success state:** Forced-failure TC-4 case passes against real harness; lifecycle oracle catches a planted empty uninstall artifact via RED-then-GREEN.

## Acceptance Criteria

### AC-1: Forced-failure TC-4 test exists and proves cleanup + artifact preservation [PRIMARY]
**GIVEN:** `tests/fixtures/forced-failure-flow.yaml` is committed and asserts on a testID that never appears; the real D03-02 substrate (simulator, nonprod Postgres, zero-cache spawn path) is available under `PLATFORM_IT=1`
**WHEN:** the operator runs `MAESTRO_FLOW=tests/fixtures/forced-failure-flow.yaml scripts/e2e/run-maestro-reference-flow.sh --run` via the TC-4 test case
**THEN:** the harness exits non-zero, `.tmp/maestro-reference-flow/final.png` is non-zero bytes, `.tmp/maestro-reference-flow/reference-flow.mov` is non-zero bytes (per REDHAT-FIX-H3's recorder fix), AND `lsof -i :4848` returns no listener after exit (zero-cache torn down by the trap)
**VERIFY:** `PLATFORM_IT=1 pnpm vitest run tests/integration/sprint20-maestro-harness-artifacts.test.ts -t 'TC-4'`
**TEST_TIER:** integration
**VERIFICATION_SERVICE:** macos-runner+ios-simulator+real-zero-cache+maestro-cli+forced-failure-flow
**TDD_STATE:** none
**UNIT_TEST_JUSTIFIED:** None
#### Scenario contract
```json
{
  "tier": "visible",
  "test_tier": "integration",
  "verification_service": "macos-runner+ios-simulator+real-zero-cache+maestro-cli+forced-failure-flow",
  "topology": "single-node",
  "negative_control": { "would_fail_if": ["stub", "empty", "mock", "static", "no-cleanup-trap", "swallowed-exit-code", "orphaned-zero-cache"] },
  "evidence": { "artifact_type": "file_artifact", "required_capture": true },
  "cases": [
    {
      "start_ref": "forced_failure_flow_fixture_committed",
      "action": { "actor": "operator", "steps": ["Set MAESTRO_FLOW=tests/fixtures/forced-failure-flow.yaml.", "Run scripts/e2e/run-maestro-reference-flow.sh --run.", "Inspect exit code, final.png, reference-flow.mov, and lsof -i :4848."] },
      "end_state": {
        "must_observe": ["harness exitCode: != 0", "stat -f%z final.png: > 0", "stat -f%z reference-flow.mov: > 0", "lsof -i :4848 line count: 0 (zero-cache torn down)"],
        "must_not_observe": ["empty/start signature: final.png missing OR 0 bytes", "orphaned zero-cache process still listening on 4848", "harness exitCode: 0 (regression that swallowed the failure)"]
      }
    }
  ]
}
```

### AC-2: Strengthened lifecycle oracle catches a planted empty uninstall artifact (RED-then-GREEN)
**GIVEN:** the existing lifecycle assertion in `tests/integration/sprint20-maestro-harness-artifacts.test.ts` has been rewritten to use per-file `test -s` checks (one each for `simctl-terminate.txt`, `simctl-uninstall.txt`, `simctl-install.txt`), AND a regression-fixture run plants an empty `simctl-uninstall.txt`
**WHEN:** the strengthened oracle runs against the regression fixture (empty uninstall artifact), then re-runs against a real harness artifact directory
**THEN:** the regression-fixture run fails RED with a message naming `simctl-uninstall.txt` as the offending empty file; the real-harness run passes GREEN with all three files non-empty — proving the M1 weakness is closed
**VERIFY:** `PLATFORM_IT=1 pnpm vitest run tests/integration/sprint20-maestro-harness-artifacts.test.ts -t 'lifecycle-regression-RED'; test $? -ne 0 && PLATFORM_IT=1 pnpm vitest run tests/integration/sprint20-maestro-harness-artifacts.test.ts -t 'lifecycle'`
**TEST_TIER:** integration
**VERIFICATION_SERVICE:** vitest + planted-artifact fixture comparison
**TDD_STATE:** none
**UNIT_TEST_JUSTIFIED:** None
#### Scenario contract
```json
{
  "tier": "visible",
  "test_tier": "integration",
  "verification_service": "vitest + planted-artifact fixture comparison",
  "topology": "single-node",
  "negative_control": { "would_fail_if": ["stub", "mock", "static", "aggregate-oracle-rg-l", "always-pass"] },
  "evidence": { "artifact_type": "stdout", "required_capture": true },
  "cases": [
    {
      "start_ref": "empty_uninstall_artifact_planted",
      "action": { "actor": "operator", "steps": ["Plant a 0-byte simctl-uninstall.txt in the artifact dir.", "Run the strengthened lifecycle oracle (lifecycle-regression-RED).", "Run the oracle against the real artifact dir (lifecycle)."] },
      "end_state": {
        "must_observe": ["lifecycle-regression-RED: exitCode != 0 AND message contains 'simctl-uninstall.txt'", "lifecycle against real run: exitCode: 0 AND test -s returns 0 for all 3 files"],
        "must_not_observe": ["empty/start signature: both runs pass (the M1 aggregate-oracle weakness)", "lifecycle-regression-RED passes against the empty uninstall artifact"]
      }
    }
  ]
}
```

### AC-3: Forced-failure fixture is deterministic and reproducible
**GIVEN:** `tests/fixtures/forced-failure-flow.yaml` exists in the repository (committed, not `.tmp/`)
**WHEN:** the operator inspects the fixture and runs maestro against it directly with `maestro test tests/fixtures/forced-failure-flow.yaml`
**THEN:** the fixture asserts on a testID that does not exist in the real app (e.g. `id: does-not-exist-forced-failure`), maestro exits non-zero with a "not found" failure, and the fixture is byte-identical across runs (no timestamp/random token)
**VERIFY:** `test -f tests/fixtures/forced-failure-flow.yaml && rg -q 'does-not-exist-forced-failure' tests/fixtures/forced-failure-flow.yaml && git diff --exit-code tests/fixtures/forced-failure-flow.yaml`
**TEST_TIER:** integration
**VERIFICATION_SERVICE:** git + maestro-cli
**TDD_STATE:** none
**UNIT_TEST_JUSTIFIED:** None
#### Scenario contract
```json
{
  "tier": "visible",
  "test_tier": "integration",
  "verification_service": "git + maestro-cli",
  "topology": "single-node",
  "negative_control": { "would_fail_if": ["stub", "empty", "mock", "static", "missing-fixture", "nondeterministic"] },
  "evidence": { "artifact_type": "file_artifact", "required_capture": true },
  "cases": [
    {
      "start_ref": "forced_failure_flow_fixture_committed",
      "action": { "actor": "operator", "steps": ["Inspect tests/fixtures/forced-failure-flow.yaml.", "Run maestro test tests/fixtures/forced-failure-flow.yaml.", "git diff --exit-code tests/fixtures/forced-failure-flow.yaml."] },
      "end_state": {
        "must_observe": ["fixture asserts on testID 'does-not-exist-forced-failure' (1 assertion)", "maestro exitCode: != 0", "git diff --exit-code returns 0 (fixture unchanged)"],
        "must_not_observe": ["empty/start signature: fixture absent", "fixture contains a real testID that would let maestro pass", "fixture contains a timestamp or random token"]
      }
    }
  ]
}
```

## Test Criteria

| ID | Statement | Maps to | Verify | Type |
|----|-----------|---------|--------|------|
| TC-1 | TC-4 forced-failure case proves cleanup + artifact preservation | AC-1 | `PLATFORM_IT=1 pnpm vitest run tests/integration/sprint20-maestro-harness-artifacts.test.ts -t 'TC-4'` | error |
| TC-2 | Strengthened lifecycle oracle catches an empty `simctl-uninstall.txt` regression (RED-then-GREEN) | AC-2 | `PLATFORM_IT=1 pnpm vitest run tests/integration/sprint20-maestro-harness-artifacts.test.ts -t 'lifecycle-regression-RED'; test $? -ne 0 && PLATFORM_IT=1 pnpm vitest run tests/integration/sprint20-maestro-harness-artifacts.test.ts -t 'lifecycle'` | error |
| TC-3 | `tests/fixtures/forced-failure-flow.yaml` is committed, deterministic, and asserts on a nonexistent testID | AC-3 | `test -f tests/fixtures/forced-failure-flow.yaml && rg -q 'does-not-exist-forced-failure' tests/fixtures/forced-failure-flow.yaml && git diff --exit-code tests/fixtures/forced-failure-flow.yaml` | happy_path |
| TC-4 | Per-file lifecycle oracle replaces the aggregate `rg -l .` form for `simctl-terminate/uninstall/install.txt` | AC-2 | `rg -q 'test -s.*simctl-uninstall\\.txt' tests/integration/sprint20-maestro-harness-artifacts.test.ts && ! rg -q 'rg -l \\.' tests/integration/sprint20-maestro-harness-artifacts.test.ts` | happy_path |

## Reading List

1. `tests/integration/sprint20-maestro-harness-artifacts.test.ts` (full) [PRIMARY PATTERN] — the existing artifact-assertion test file to extend with TC-4 and the strengthened lifecycle oracle
2. `scripts/e2e/run-maestro-reference-flow.sh` (109-124) — the cleanup() trap on EXIT and the post-trap maestro invocation; this is what TC-4 exercises
3. `.e2e/maestro/reference-flow.yaml` (full) — the real flow; the forced-failure fixture is a copy with a `waitFor` on a nonexistent testID
4. `.tmp/maestro-reference-flow/simctl-uninstall.txt` — the current 0-byte artifact evidencing the M1 oracle weakness
5. `.spec/prds/mk6-migration/tasks/sprint-20-e2e-maestro-harness-and-cold-boot-reference-flow/D03-03-build-maestro-runner-harness-boot-install-execute-capture.md` (139-163,173-176,218-221) — original D03-03 AC-2/AC-4 contract this task fulfills
6. `.spec/reviews/red-hat-sprint-20-20260719T204500Z.md` (79-92) — M1 + M3 findings: weak oracle + absent TC-4

## Guardrails

### WRITE-ALLOWED
- tests/integration/sprint20-maestro-harness-artifacts.test.ts (MODIFY — add TC-4 forced-failure case; rewrite the lifecycle oracle from aggregate `rg -l .` to per-file `test -s`; add the lifecycle-regression-RED case)
- tests/fixtures/forced-failure-flow.yaml (NEW — deterministic copy of reference-flow.yaml asserting on a nonexistent testID)

### WRITE-PROHIBITED
- scripts/e2e/run-maestro-reference-flow.sh — owned by D03-03 / REDHAT-FIX-H3; the cleanup trap is correct as-is; the gap is test coverage, not the trap
- .e2e/maestro/reference-flow.yaml — the real flow; out of scope
- .github/workflows/** — out of scope; CI consumer of the test, not the producer
- app/** — RN app code out of scope

### Boundaries
- **always:** Run TC-4 against the real harness via `MAESTRO_FLOW=tests/fixtures/forced-failure-flow.yaml`; assert non-zero exit AND cleanup artifacts; assert per-file lifecycle non-emptiness
- **ask_first:** Any change to `scripts/e2e/run-maestro-reference-flow.sh` suggested by a TC-4 failure (escalate to REDHAT-FIX-H3)
- **never:** Asserting only the harness exit code without asserting cleanup; using `rg -l . file1 file2` aggregate form (the M1 weakness); substituting a synthetic junit.xml for the real forced-failure maestro run

## Design

- **references:** tests/integration/sprint20-maestro-harness-artifacts.test.ts, scripts/e2e/run-maestro-reference-flow.sh, .e2e/maestro/reference-flow.yaml
- **pattern:** (1) `tests/fixtures/forced-failure-flow.yaml`: copy `.e2e/maestro/reference-flow.yaml` and replace the final `waitFor`/`assertVisible` step with `assertVisible: { id: does-not-exist-forced-failure }` so maestro deterministically fails mid-run. (2) TC-4 test: `spawnSync('scripts/e2e/run-maestro-reference-flow.sh', ['--run'], { env: { ...validHarnessEnv(), MAESTRO_FLOW: 'tests/fixtures/forced-failure-flow.yaml' }, timeout: 180_000 })`; assert `status !== 0`, `stat -f%z final.png: > 0`, `stat -f%z reference-flow.mov: > 0`, `! lsof -i :4848`. (3) Strengthened lifecycle oracle: replace `rg -l . simctl-uninstall.txt simctl-install.txt` with three per-file `test -s` checks (one each for `simctl-terminate.txt`, `simctl-uninstall.txt`, `simctl-install.txt`). (4) Regression-RED case: plant a 0-byte `simctl-uninstall.txt` in a temp artifact dir and assert the strengthened oracle fails naming the file.
- **pattern_source:** tests/integration/sprint20-maestro-harness-artifacts.test.ts (existing TC-1/TC-2 pattern)
- **anti_pattern:** Asserting only the harness exit code for the forced-failure case — that proves the flow failed, NOT that cleanup ran. The cleanup-on-failure contract is the entire point of D03-03 AC-4.

## Agent Assignment

- **implementer:** devops-engineer — owns the harness artifact/cleanup proof (same as D03-03)
- **reviewer:** mastra-reviewer — verifies the cleanup assertions are real (not exit-code-only); verifies the per-file oracle catches the M1 regression

## Verification Gates

- **AC-1 TC-4 forced-failure:** `PLATFORM_IT=1 pnpm vitest run tests/integration/sprint20-maestro-harness-artifacts.test.ts -t 'TC-4'` → Exit 0
- **AC-2 strengthened oracle RED-then-GREEN:** regression-RED (non-zero) AND real-run (zero)
- **AC-3 fixture deterministic:** `test -f tests/fixtures/forced-failure-flow.yaml && rg -q 'does-not-exist-forced-failure' tests/fixtures/forced-failure-flow.yaml && git diff --exit-code tests/fixtures/forced-failure-flow.yaml` → Exit 0
- **Scope compliance:** `git diff --name-only | sort -u` → Only guardrails.write_allowed paths

## Coding Standards

- RULES.md
- brain/docs/kanban/TASK-TEMPLATE.md
- brain/docs/kanban/SCENARIO-CONTRACT-V1.md

## Dependencies

- **depends_on:** D03-03 (defines the AC-2/AC-4 contract this task fulfills), REDHAT-FIX-H3 (the recorder must finalize `reference-flow.mov` on a forced-failure run for TC-4 to assert non-zero bytes)
- **blocks:** D03-03 AC-2 (PARTIAL → PASS) + AC-4 (FAIL → PASS), the Sprint-20 close handshake

## Notes

The M1 finding (`rg -l .` aggregate) and M3 finding (missing TC-4) are paired: M1 is the silent-failure mode where a weak oracle masks a real bug (0-byte uninstall artifact); M3 is the missing-coverage mode where the cleanup-on-failure contract is untested. Together they're the "silent pass" failure mode the red-hat reviewer flagged. The fix here is structural: each lifecycle artifact gets its own assertion, and the cleanup-on-failure contract gets its own test. If REDHAT-FIX-H3's recorder fix surfaces the empty uninstall as a real harness bug, this task's strengthened oracle is what makes that visible — without M1's fix, the regression would pass silently.

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "REDHAT-FIX-H9",
  "proposed_by": "devops-engineer",
  "tdd_mode": "red_first",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": true,
    "requires_seeded_evidence": true
  },
  "fixtures": {
    "forced_failure_flow_fixture_committed": {
      "description": "tests/fixtures/forced-failure-flow.yaml is committed and asserts on a testID that never appears in the real app, so maestro deterministically fails mid-run when MAESTRO_FLOW points at it.",
      "seed_method": "recorded_external",
      "records": [
        "tests/fixtures/forced-failure-flow.yaml exists in git",
        "fixture contains assertVisible with id: does-not-exist-forced-failure",
        "PLATFORM_IT=1 and D03-02 substrate available"
      ]
    },
    "empty_uninstall_artifact_planted": {
      "description": "A 0-byte simctl-uninstall.txt is planted in a temp artifact directory alongside non-zero simctl-terminate.txt and simctl-install.txt, to prove the strengthened per-file oracle catches the M1 regression.",
      "seed_method": "recorded_external",
      "records": [
        "temp artifact dir has simctl-uninstall.txt size 0",
        "temp artifact dir has simctl-terminate.txt size > 0",
        "temp artifact dir has simctl-install.txt size > 0"
      ]
    },
    "harness_prereqs_ready": {
      "description": "D03-02 substrate is online: e2e runner, named simulator, Expo dev build, real nonprod Postgres, real fleet, and zero-cache deployable.",
      "seed_method": "cli",
      "records": [
        "holo ci runner:status --json --lane e2e reports online:true",
        "DATABASE_URL targets holocron_nonprod",
        "FLEET_URL is a real http endpoint"
      ]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "primary": true,
      "description": "GIVEN the forced-failure fixture committed WHEN TC-4 runs the harness against it THEN harness exits non-zero AND final.png + reference-flow.mov are non-zero bytes AND no zero-cache listener remains.",
      "verify": "PLATFORM_IT=1 pnpm vitest run tests/integration/sprint20-maestro-harness-artifacts.test.ts -t 'TC-4'",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "macos-runner+ios-simulator+real-zero-cache+maestro-cli+forced-failure-flow",
        "topology": "single-node",
        "negative_control": { "would_fail_if": ["stub", "empty", "mock", "static", "no-cleanup-trap", "swallowed-exit-code", "orphaned-zero-cache"] },
        "evidence": { "artifact_type": "file_artifact", "required_capture": true },
        "cases": [
          {
            "start_ref": "forced_failure_flow_fixture_committed",
            "action": { "actor": "operator", "steps": ["Set MAESTRO_FLOW=tests/fixtures/forced-failure-flow.yaml.", "Run scripts/e2e/run-maestro-reference-flow.sh --run.", "Inspect exit code, final.png, reference-flow.mov, and lsof -i :4848."] },
            "end_state": {
              "must_observe": ["harness exitCode: != 0", "stat -f%z final.png: > 0", "stat -f%z reference-flow.mov: > 0", "lsof -i :4848 line count: 0 (zero-cache torn down)"],
              "must_not_observe": ["empty/start signature: final.png missing OR 0 bytes", "orphaned zero-cache process still listening on 4848", "harness exitCode: 0 (regression that swallowed the failure)"]
            }
          }
        ]
      }
    },
    {
      "id": "AC-2",
      "type": "acceptance_criterion",
      "description": "GIVEN the strengthened per-file lifecycle oracle WHEN run against a planted empty uninstall artifact THEN it fails RED, then against the real run passes GREEN.",
      "verify": "PLATFORM_IT=1 pnpm vitest run tests/integration/sprint20-maestro-harness-artifacts.test.ts -t 'lifecycle-regression-RED'; test $? -ne 0 && PLATFORM_IT=1 pnpm vitest run tests/integration/sprint20-maestro-harness-artifacts.test.ts -t 'lifecycle'",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "vitest + planted-artifact fixture comparison",
        "topology": "single-node",
        "negative_control": { "would_fail_if": ["stub", "mock", "static", "aggregate-oracle-rg-l", "always-pass"] },
        "evidence": { "artifact_type": "stdout", "required_capture": true },
        "cases": [
          {
            "start_ref": "empty_uninstall_artifact_planted",
            "action": { "actor": "operator", "steps": ["Plant a 0-byte simctl-uninstall.txt in the artifact dir.", "Run the strengthened lifecycle oracle (lifecycle-regression-RED).", "Run the oracle against the real artifact dir (lifecycle)."] },
            "end_state": {
              "must_observe": ["lifecycle-regression-RED: exitCode != 0 AND message contains 'simctl-uninstall.txt'", "lifecycle against real run: exitCode: 0 AND test -s returns 0 for all 3 files"],
              "must_not_observe": ["empty/start signature: both runs pass (the M1 aggregate-oracle weakness)", "lifecycle-regression-RED passes against the empty uninstall artifact"]
            }
          }
        ]
      }
    },
    {
      "id": "AC-3",
      "type": "acceptance_criterion",
      "description": "GIVEN the forced-failure fixture is committed WHEN inspected THEN it asserts on a nonexistent testID and is byte-identical across runs (deterministic).",
      "verify": "test -f tests/fixtures/forced-failure-flow.yaml && rg -q 'does-not-exist-forced-failure' tests/fixtures/forced-failure-flow.yaml && git diff --exit-code tests/fixtures/forced-failure-flow.yaml",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "git + maestro-cli",
        "topology": "single-node",
        "negative_control": { "would_fail_if": ["stub", "empty", "mock", "static", "missing-fixture", "nondeterministic"] },
        "evidence": { "artifact_type": "file_artifact", "required_capture": true },
        "cases": [
          {
            "start_ref": "forced_failure_flow_fixture_committed",
            "action": { "actor": "operator", "steps": ["Inspect tests/fixtures/forced-failure-flow.yaml.", "Run maestro test tests/fixtures/forced-failure-flow.yaml.", "git diff --exit-code tests/fixtures/forced-failure-flow.yaml."] },
            "end_state": {
              "must_observe": ["fixture asserts on testID 'does-not-exist-forced-failure' (1 assertion)", "maestro exitCode: != 0", "git diff --exit-code returns 0 (fixture unchanged)"],
              "must_not_observe": ["empty/start signature: fixture absent", "fixture contains a real testID that would let maestro pass", "fixture contains a timestamp or random token"]
            }
          }
        ]
      }
    },
    {
      "id": "TC-1",
      "type": "test_criterion",
      "description": "TC-4 forced-failure case proves cleanup + artifact preservation",
      "verify": "PLATFORM_IT=1 pnpm vitest run tests/integration/sprint20-maestro-harness-artifacts.test.ts -t 'TC-4'",
      "maps_to_ac": "AC-1"
    },
    {
      "id": "TC-2",
      "type": "test_criterion",
      "description": "Strengthened lifecycle oracle catches an empty simctl-uninstall.txt regression (RED-then-GREEN)",
      "verify": "PLATFORM_IT=1 pnpm vitest run tests/integration/sprint20-maestro-harness-artifacts.test.ts -t 'lifecycle-regression-RED'; test $? -ne 0 && PLATFORM_IT=1 pnpm vitest run tests/integration/sprint20-maestro-harness-artifacts.test.ts -t 'lifecycle'",
      "maps_to_ac": "AC-2"
    },
    {
      "id": "TC-3",
      "type": "test_criterion",
      "description": "tests/fixtures/forced-failure-flow.yaml is committed, deterministic, asserts on a nonexistent testID",
      "verify": "test -f tests/fixtures/forced-failure-flow.yaml && rg -q 'does-not-exist-forced-failure' tests/fixtures/forced-failure-flow.yaml && git diff --exit-code tests/fixtures/forced-failure-flow.yaml",
      "maps_to_ac": "AC-3"
    },
    {
      "id": "TC-4",
      "type": "test_criterion",
      "description": "Per-file lifecycle oracle replaces the aggregate rg -l . form",
      "verify": "rg -q 'test -s.*simctl-uninstall\\.txt' tests/integration/sprint20-maestro-harness-artifacts.test.ts && ! rg -q 'rg -l \\.' tests/integration/sprint20-maestro-harness-artifacts.test.ts",
      "maps_to_ac": "AC-2"
    }
  ]
}
-->

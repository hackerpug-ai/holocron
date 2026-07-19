# D03-01 — RED: Maestro harness fails closed without simulator/build/backend
> Status: ✅ Completed
> Completed: 2026-07-19T09:03:02Z
> Sprint: [Sprint 20 — E2E Maestro Harness and Cold-Boot Reference Flow](./SPRINT.md)
> Agent: red-test-generator
> Estimate: 60 min
> Type: FEATURE
> Priority: P0
> Proposed by: red-test-generator
> TDD_MODE: red_first · RED_GREEN_REQUIRED: yes · SEEDED_EVIDENCE_REQUIRED: yes

## Outcome

Prove the already-implemented Maestro harness fails closed — with the correct, specific stderr message — for every precondition besides the already-covered missing-simulator case: a missing or non-bundle Expo dev build, and a missing or unsafe (non-nonprod) backend.

**Success state:** `tests/integration/sprint20-maestro-harness.test.ts` asserts nonzero exit + exact fail() message text for dev-build-missing, dev-build-invalid-bundle (caught at real `xcrun simctl install`), DATABASE_URL-missing, FLEET_URL-missing, and DATABASE_URL-non-nonprod-pattern, with no zero-cache/simulator/maestro process ever spawned in the fail path.

## Background

- **Specialist rationale:** Extends the already-GREEN `tests/integration/sprint20-maestro-harness.test.ts` (which only covers MAESTRO_DEVICE-missing) with the two still-untested fail-closed preconditions (dev build, backend) named in the sprint gate's Test Deliverable step 5 — pure negative-control test authoring, no implementation gap.
- **Planning rationale:** `scripts/e2e/run-maestro-reference-flow.sh` already implements `[[ ]] || fail` guards for MAESTRO_DEVICE, DATABASE_URL, `*holocron_nonprod*` pattern, FLEET_URL, platform URL, RN_API_KEY, REFERENCE_FLOW flag, ZERO_ADMIN_PASSWORD, maestro/xcrun binaries, flow file, and EXPO_DEV_BUILD_PATH. Only the simulator-missing branch has a test today; this task closes the coverage gap for dev-build and backend branches.
- **How to verify (human):** Run `pnpm exec vitest run tests/integration/sprint20-maestro-harness.test.ts` and confirm all fail-closed cases (simulator, dev-build, backend) pass, each asserting the specific stderr text, not just a nonzero exit code.
- **Scope:** Test-only. Does not modify `scripts/e2e/run-maestro-reference-flow.sh` — a failing assertion here is signal to escalate as a separate fix task, not to silently patch the script under test.
- **PRD refs:** UC-SYNC-01

## Critical Constraints

### MUST
- MUST exercise the real `scripts/e2e/run-maestro-reference-flow.sh` via spawnSync, matching the existing `sprint20-maestro-harness.test.ts` pattern — never assert against a copy of the script's logic

### NEVER
- NEVER modify `scripts/e2e/run-maestro-reference-flow.sh`'s fail() checks to make a new test pass in this RED task
- NEVER point a test's DATABASE_URL at a real reachable database when proving the nonprod-pattern guard — the guard must reject on string pattern alone, before any connection is attempted

### STRICTLY
- STRICTLY every new case asserts on the harness's literal stderr fail message text, not merely a nonzero exit code, so a regression that changes error semantics is caught

## Specification

**Objective:** Prove the already-implemented Maestro harness fails closed — with the correct, specific stderr message — for every precondition besides the already-covered missing-simulator case: a missing or non-bundle Expo dev build, and a missing or unsafe (non-nonprod) backend.

**Success state:** tests/integration/sprint20-maestro-harness.test.ts asserts nonzero exit + exact fail() message text for dev-build-missing, dev-build-invalid-bundle, DATABASE_URL-missing, FLEET_URL-missing, and DATABASE_URL-non-nonprod-pattern, with no zero-cache/simulator/maestro process ever spawned in the fail path.

## Acceptance Criteria

### AC-1: Harness fails closed when the Expo dev build is missing or not a real bundle [PRIMARY]
**GIVEN:** valid harness env with EXPO_DEV_BUILD_PATH unset (case 1) or pointing at an existing-but-empty directory (case 2)
**WHEN:** `scripts/e2e/run-maestro-reference-flow.sh --check` (case 1) or `--run` (case 2) executes
**THEN:** the harness exits non-zero with a specific message and never reaches the maestro test invocation
**VERIFY:** `pnpm exec vitest run tests/integration/sprint20-maestro-harness.test.ts -t "Expo development build"`
**TEST_TIER:** e2e
**VERIFICATION_SERVICE:** bash-harness+xcrun+maestro-cli
**TDD_STATE:** none
**UNIT_TEST_JUSTIFIED:** None
#### Scenario contract
```json
{
  "tier": "visible",
  "test_tier": "e2e",
  "verification_service": "bash-harness+xcrun+maestro-cli",
  "topology": "single-node",
  "negative_control": {
    "would_fail_if": [
      "the [[ -d \"$app_path\" ]] directory-exists check is removed or short-circuited",
      "the harness silently falls back to Expo Go instead of refusing",
      "the EXPO_DEV_BUILD_PATH check is stubbed to always pass"
    ]
  },
  "evidence": { "artifact_type": "stdout", "required_capture": true },
  "cases": [
    {
      "start_ref": "valid_harness_env",
      "action": { "actor": "cli_user", "steps": ["unset EXPO_DEV_BUILD_PATH; run scripts/e2e/run-maestro-reference-flow.sh --check"] },
      "end_state": {
        "must_observe": ["exit code != 0", "\"Expo development build does not exist\" or \"EXPO_DEV_BUILD_PATH is required\" in stderr"],
        "must_not_observe": ["exit code 0", "\"ok\":true", "junit.xml present under $E2E_ARTIFACT_DIR"]
      }
    },
    {
      "start_ref": "empty_bundle_directory",
      "action": { "actor": "cli_user", "steps": ["set EXPO_DEV_BUILD_PATH to an existing but empty directory; run scripts/e2e/run-maestro-reference-flow.sh --run"] },
      "end_state": {
        "must_observe": ["exit code != 0", "a real xcrun simctl install failure recorded in $E2E_ARTIFACT_DIR/simctl-install.txt"],
        "must_not_observe": ["junit.xml written before the install failure", "\"status\":\"OK\"", "empty/start signature: exit code 0"]
      }
    }
  ]
}
```

### AC-2: Harness fails closed when the backend is missing or unsafe
**GIVEN:** valid harness env with DATABASE_URL unset (case 1), FLEET_URL unset (case 2), or DATABASE_URL set to a non-nonprod-pattern URL (case 3)
**WHEN:** `scripts/e2e/run-maestro-reference-flow.sh --check` executes
**THEN:** the harness exits non-zero naming the missing or unsafe backend contract, before any zero-cache/simulator process spawns
**VERIFY:** `pnpm exec vitest run tests/integration/sprint20-maestro-harness.test.ts -t "backend"`
**TEST_TIER:** e2e
**VERIFICATION_SERVICE:** bash-harness+postgres-url-pattern-guard
**TDD_STATE:** none
**UNIT_TEST_JUSTIFIED:** None
#### Scenario contract
```json
{
  "tier": "visible",
  "test_tier": "e2e",
  "verification_service": "bash-harness+postgres-url-pattern-guard",
  "topology": "single-node",
  "negative_control": {
    "would_fail_if": [
      "the DATABASE_URL/FLEET_URL presence checks are removed",
      "the script defaults to a stub Postgres/fleet URL instead of failing",
      "the *holocron_nonprod* pattern match is removed, allowing a prod-looking URL through to holo namespace reset"
    ]
  },
  "evidence": { "artifact_type": "stdout", "required_capture": true },
  "cases": [
    {
      "start_ref": "valid_harness_env",
      "action": { "actor": "cli_user", "steps": ["unset DATABASE_URL; run scripts/e2e/run-maestro-reference-flow.sh --check"] },
      "end_state": { "must_observe": ["exit code != 0", "\"DATABASE_URL is required; no database substitute is allowed\" in stderr"], "must_not_observe": ["exit code 0"] }
    },
    {
      "start_ref": "valid_harness_env",
      "action": { "actor": "cli_user", "steps": ["unset FLEET_URL; run scripts/e2e/run-maestro-reference-flow.sh --check"] },
      "end_state": { "must_observe": ["exit code != 0", "\"FLEET_URL is required; no inference substitute is allowed\" in stderr"], "must_not_observe": ["exit code 0"] }
    },
    {
      "start_ref": "valid_harness_env",
      "action": { "actor": "cli_user", "steps": ["set DATABASE_URL=postgres://127.0.0.1:5432/holocron_prod; run scripts/e2e/run-maestro-reference-flow.sh --check"] },
      "end_state": { "must_observe": ["exit code != 0", "\"DATABASE_URL must target holocron_nonprod\" in stderr"], "must_not_observe": ["exit code 0", "any TCP connection attempt to the prod-looking host"] }
    }
  ]
}
```

## Test Criteria

| ID | Statement | Maps to | Verify | Type |
|----|-----------|---------|--------|------|
| TC-1 | --check exits non-zero with the Expo-build-missing message when EXPO_DEV_BUILD_PATH is unset | AC-1 | `pnpm exec vitest run tests/integration/sprint20-maestro-harness.test.ts -t "build path is missing"` | happy_path |
| TC-2 | --run exits non-zero via a real xcrun install failure when EXPO_DEV_BUILD_PATH is an empty non-bundle directory, before junit.xml is written | AC-1 | `pnpm exec vitest run tests/integration/sprint20-maestro-harness.test.ts -t "not a real bundle"` | boundary |
| TC-3 | --check exits non-zero with the DATABASE_URL-required message when DATABASE_URL is unset | AC-2 | `pnpm exec vitest run tests/integration/sprint20-maestro-harness.test.ts -t "DATABASE_URL is required"` | happy_path |
| TC-4 | --check exits non-zero with the FLEET_URL-required message when FLEET_URL is unset | AC-2 | `pnpm exec vitest run tests/integration/sprint20-maestro-harness.test.ts -t "FLEET_URL is required"` | boundary |
| TC-5 | --check exits non-zero with the nonprod-pattern message when DATABASE_URL does not match holocron_nonprod | AC-2 | `pnpm exec vitest run tests/integration/sprint20-maestro-harness.test.ts -t "holocron_nonprod"` | boundary |

## Reading List

- `scripts/e2e/run-maestro-reference-flow.sh` (24-46) — existing fail() guard ordering and exact message text new cases must assert against verbatim
- `tests/integration/sprint20-maestro-harness.test.ts` (1-22) — the existing spawnSync pattern for the simulator-missing case to extend
- `.github/workflows/ci-e2e.yml` (41-56) — real env var names/shapes the harness expects in CI
- `brain/docs/RED-FIRST-TEST-GATE.md` — RED-FIRST gate discipline
- `brain/docs/kanban/SCENARIO-CONTRACT-V1.md` — negative_control / non-degenerate case rules

## Guardrails

### WRITE-ALLOWED
- tests/integration/sprint20-maestro-harness.test.ts (MODIFY) — add dev-build and backend fail-closed cases

### WRITE-PROHIBITED
- scripts/e2e/run-maestro-reference-flow.sh — RED phase proves current script behavior without editing the script under test
- .github/workflows/ci-e2e.yml — CI wiring already correct, out of scope

### Boundaries
- **always:** Assert the harness's own stderr text, Run against the real script via spawnSync
- **ask_first:** Modifying the harness script if a real gap is found
- **never:** Reimplementing fail() message strings as a duplicate regex instead of asserting the real stderr

## Design

- **references:** (none)
- **pattern:** `spawnSync(harness, ['--check'|'--run'], { env: {...process.env, VAR: '' } })` matching the existing simulator-missing test
- **pattern_source:** tests/integration/sprint20-maestro-harness.test.ts
- **anti_pattern:** reimplementing the fail() message strings as a duplicate regex instead of asserting the harness's own stderr

## Agent Assignment

- **implementer:** red-test-generator — extends the existing fail-closed test suite
- **reviewer:** mastra-reviewer — verifies negative-control rigor and no script edits under test

## Verification Gates

- **Missing dev-build fails closed at --check:** `pnpm exec vitest run tests/integration/sprint20-maestro-harness.test.ts -t "build path is missing"` → Exit 0 (test asserts harness exit != 0)
- **Invalid dev-build bundle fails closed at --run install:** `pnpm exec vitest run tests/integration/sprint20-maestro-harness.test.ts -t "not a real bundle"` → Exit 0 (test asserts harness exit != 0 before junit.xml)
- **Missing/unsafe backend fails closed:** `pnpm exec vitest run tests/integration/sprint20-maestro-harness.test.ts -t "backend"` → Exit 0 (all 3 cases assert harness exit != 0)
- **Full harness test file:** `pnpm exec vitest run tests/integration/sprint20-maestro-harness.test.ts` → Exit 0

## Coding Standards

- brain/docs/RED-FIRST-TEST-GATE.md
- brain/docs/kanban/SCENARIO-CONTRACT-V1.md
- brain/docs/TESTING-HIERARCHY.md

## Dependencies

- **depends_on:** —
- **blocks:** S-COLDBOOT-03

## Notes

Extends the already-GREEN `tests/integration/sprint20-maestro-harness.test.ts` (currently covers only the MAESTRO_DEVICE-missing case) — this is coverage-completion of an already-correct harness, not new implementation.

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "D03-01",
  "proposed_by": "red-test-generator",
  "tdd_mode": "red_first",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": true,
    "requires_seeded_evidence": true
  },
  "fixtures": {
    "valid_harness_env": {
      "description": "all scripts/e2e/run-maestro-reference-flow.sh preconditions valid except the single variable under test, mirroring .github/workflows/ci-e2e.yml's env block",
      "seed_method": "cli",
      "records": [
        "baseline env matches .github/workflows/ci-e2e.yml lines 41-56"
      ]
    },
    "empty_bundle_directory": {
      "description": "EXPO_DEV_BUILD_PATH pointing at a real, existing, but empty directory \u2014 passes a bare -d test, is not an installable .app bundle",
      "seed_method": "cli",
      "records": [
        "mkdir -p $TMPDIR/not-a-real-build (0 files inside)"
      ]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "primary": true,
      "description": "GIVEN valid preconditions except a missing or non-bundle Expo dev build WHEN --check/--run executes THEN the harness fails closed with a specific message before any maestro test runs",
      "verify": "pnpm exec vitest run tests/integration/sprint20-maestro-harness.test.ts -t \"Expo development build\"",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "e2e",
        "verification_service": "bash-harness+xcrun+maestro-cli",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "the [[ -d \"$app_path\" ]] directory-exists check is removed or short-circuited",
            "the harness silently falls back to Expo Go instead of refusing",
            "the EXPO_DEV_BUILD_PATH check is stubbed to always pass"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "valid_harness_env",
            "action": {
              "actor": "cli_user",
              "steps": [
                "unset EXPO_DEV_BUILD_PATH; run scripts/e2e/run-maestro-reference-flow.sh --check"
              ]
            },
            "end_state": {
              "must_observe": [
                "exit code != 0",
                "\"Expo development build does not exist\" or \"EXPO_DEV_BUILD_PATH is required\" in stderr"
              ],
              "must_not_observe": [
                "exit code 0",
                "\"ok\":true",
                "junit.xml present under $E2E_ARTIFACT_DIR"
              ]
            }
          },
          {
            "start_ref": "empty_bundle_directory",
            "action": {
              "actor": "cli_user",
              "steps": [
                "set EXPO_DEV_BUILD_PATH to an existing but empty directory; run scripts/e2e/run-maestro-reference-flow.sh --run"
              ]
            },
            "end_state": {
              "must_observe": [
                "exit code != 0",
                "a real xcrun simctl install failure recorded in $E2E_ARTIFACT_DIR/simctl-install.txt"
              ],
              "must_not_observe": [
                "junit.xml written before the install failure",
                "\"status\":\"OK\"",
                "empty/start signature: exit code 0"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-2",
      "type": "acceptance_criterion",
      "description": "GIVEN valid preconditions except a missing or unsafe backend WHEN --check executes THEN the harness fails closed before any zero-cache/simulator process spawns",
      "verify": "pnpm exec vitest run tests/integration/sprint20-maestro-harness.test.ts -t \"backend\"",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "e2e",
        "verification_service": "bash-harness+postgres-url-pattern-guard",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "the DATABASE_URL/FLEET_URL presence checks are removed",
            "the script defaults to a stub Postgres/fleet URL instead of failing",
            "the *holocron_nonprod* pattern match is removed, allowing a prod-looking URL through to holo namespace reset"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "valid_harness_env",
            "action": {
              "actor": "cli_user",
              "steps": [
                "unset DATABASE_URL; run scripts/e2e/run-maestro-reference-flow.sh --check"
              ]
            },
            "end_state": {
              "must_observe": [
                "exit code != 0",
                "\"DATABASE_URL is required; no database substitute is allowed\" in stderr"
              ],
              "must_not_observe": [
                "exit code 0"
              ]
            }
          },
          {
            "start_ref": "valid_harness_env",
            "action": {
              "actor": "cli_user",
              "steps": [
                "unset FLEET_URL; run scripts/e2e/run-maestro-reference-flow.sh --check"
              ]
            },
            "end_state": {
              "must_observe": [
                "exit code != 0",
                "\"FLEET_URL is required; no inference substitute is allowed\" in stderr"
              ],
              "must_not_observe": [
                "exit code 0"
              ]
            }
          },
          {
            "start_ref": "valid_harness_env",
            "action": {
              "actor": "cli_user",
              "steps": [
                "set DATABASE_URL=postgres://127.0.0.1:5432/holocron_prod; run scripts/e2e/run-maestro-reference-flow.sh --check"
              ]
            },
            "end_state": {
              "must_observe": [
                "exit code != 0",
                "\"DATABASE_URL must target holocron_nonprod\" in stderr"
              ],
              "must_not_observe": [
                "exit code 0",
                "any TCP connection attempt to the prod-looking host"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "TC-1",
      "type": "test_criterion",
      "description": "missing EXPO_DEV_BUILD_PATH fails --check",
      "verify": "pnpm exec vitest run tests/integration/sprint20-maestro-harness.test.ts -t \"build path is missing\"",
      "maps_to_ac": "AC-1"
    },
    {
      "id": "TC-2",
      "type": "test_criterion",
      "description": "empty non-bundle directory fails --run at real xcrun install",
      "verify": "pnpm exec vitest run tests/integration/sprint20-maestro-harness.test.ts -t \"not a real bundle\"",
      "maps_to_ac": "AC-1"
    },
    {
      "id": "TC-3",
      "type": "test_criterion",
      "description": "missing DATABASE_URL fails --check",
      "verify": "pnpm exec vitest run tests/integration/sprint20-maestro-harness.test.ts -t \"DATABASE_URL is required\"",
      "maps_to_ac": "AC-2"
    },
    {
      "id": "TC-4",
      "type": "test_criterion",
      "description": "missing FLEET_URL fails --check",
      "verify": "pnpm exec vitest run tests/integration/sprint20-maestro-harness.test.ts -t \"FLEET_URL is required\"",
      "maps_to_ac": "AC-2"
    },
    {
      "id": "TC-5",
      "type": "test_criterion",
      "description": "non-nonprod DATABASE_URL pattern fails --check",
      "verify": "pnpm exec vitest run tests/integration/sprint20-maestro-harness.test.ts -t \"holocron_nonprod\"",
      "maps_to_ac": "AC-2"
    }
  ]
}
-->

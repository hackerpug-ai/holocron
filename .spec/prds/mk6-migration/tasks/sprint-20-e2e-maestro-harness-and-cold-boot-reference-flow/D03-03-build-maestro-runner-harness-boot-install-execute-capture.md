# D03-03 — Build Maestro runner harness (boot, install, execute, capture artifacts)
> Status: ✅ Completed
> Completed: 2026-07-19T09:03:02Z
> Sprint: [Sprint 20 — E2E Maestro Harness and Cold-Boot Reference Flow](./SPRINT.md)
> Agent: devops-engineer
> Estimate: 180 min
> Type: FEATURE
> Priority: P0
> Proposed by: devops-engineer
> TDD_MODE: red_first · RED_GREEN_REQUIRED: yes · SEEDED_EVIDENCE_REQUIRED: yes

## Outcome

Prove the existing Maestro harness script performs a real boot→install→execute→capture cycle against the real D03-02 substrate, hardening the fresh-install and failure-cleanup paths.

**Success state:** `scripts/e2e/run-maestro-reference-flow.sh --run` against real D03-02 substrate produces junit.xml, a screenshot, a non-zero-byte video, and namespace-reset.json every time, including on a deliberately failing flow.

## Background

- **Specialist rationale:** Owns the harness that boots the simulator, installs the fresh Expo build, executes the Maestro flow, and captures the JUnit/screenshot/video artifacts against the D03-02 substrate.
- **Planning rationale:** `scripts/e2e/run-maestro-reference-flow.sh` (161 lines) is already fully implemented: it resets the namespace, deploys Zero permissions, boots a real zero-cache, boots/terminates/uninstalls/installs the simulator app, runs a dev-client setup fallback chain, records video/screenshot, and executes the main flow with an EXIT trap. This task is hardening/proof work against real D03-02 substrate, not a rewrite: strengthen the reinstall-proof and ensure cleanup survives a failing run.
- **How to verify (human):** Run `scripts/e2e/run-maestro-reference-flow.sh --run` twice with a stale app already installed and confirm both runs produce complete artifacts and a fresh reinstall each time.
- **Scope:** Harden the existing harness script + add artifact/cleanup regression tests. Does not modify `.e2e/maestro/reference-flow.yaml`/dev-client-*.yaml content, `.github/workflows/**`, or the RN app.
- **PRD refs:** T-PLAT-019, 10-e2e-testing, UC-SYNC-02

## Critical Constraints

### MUST
- MUST terminate + uninstall + reinstall the app bundle before every run so a stale prior build cannot produce a false pass
- MUST capture junit.xml, a final screenshot, and a finalized (non-zero-byte) video for both PASS and FAIL runs
- MUST tear down the zero-cache process and any orphaned port listener on exit regardless of flow outcome

### NEVER
- NEVER substitute a mock app, backend, fleet, or simulator for the real ones (already enforced in the script header — do not weaken it)
- NEVER let cleanup silently swallow a failed video/screenshot capture without surfacing it in artifacts

### STRICTLY
- STRICTLY this task does not modify .e2e/maestro/reference-flow.yaml or dev-client-*.yaml content — only the harness script that drives them

## Specification

**Objective:** Prove the existing Maestro harness script performs a real boot→install→execute→capture cycle against the real D03-02 substrate, hardening the fresh-install and failure-cleanup paths.

**Success state:** scripts/e2e/run-maestro-reference-flow.sh --run against real D03-02 substrate produces junit.xml, a screenshot, a non-zero-byte video, and namespace-reset.json every time, including on a deliberately failing flow.

## Acceptance Criteria

### AC-1: Harness completes boot, install, execute, capture on real substrate [PRIMARY]
**GIVEN:** real D03-02 substrate is online
**WHEN:** the operator runs `scripts/e2e/run-maestro-reference-flow.sh --run`
**THEN:** the artifact directory contains namespace-reset.json, zero-cache.log showing a ready keepalive, junit.xml, a reference-flow.mov video, and final.png, none mocked or empty
**VERIFY:** `scripts/e2e/run-maestro-reference-flow.sh --run && test -s .tmp/maestro-reference-flow/junit.xml && test -s .tmp/maestro-reference-flow/reference-flow.mov`
**TEST_TIER:** e2e
**VERIFICATION_SERVICE:** macos-runner+ios-simulator+real-postgres+real-fleet+real-zero-cache
**TDD_STATE:** none
**UNIT_TEST_JUSTIFIED:** None
#### Scenario contract
```json
{
  "tier": "visible",
  "test_tier": "e2e",
  "verification_service": "macos-runner+ios-simulator+real-postgres+real-fleet+real-zero-cache",
  "topology": "single-node",
  "negative_control": { "would_fail_if": ["disconnect", "stub", "empty", "mock", "static", "missing-build", "missing-simulator"] },
  "evidence": { "artifact_type": "file_artifact", "required_capture": true },
  "cases": [
    {
      "start_ref": "harness_prereqs_ready",
      "action": { "actor": "operator", "steps": ["Run scripts/e2e/run-maestro-reference-flow.sh --run.", "Inspect the artifact directory."] },
      "end_state": {
        "must_observe": ["junit.xml file size > 0", "reference-flow.mov file size > 0", "`test -s final.png` exit code: 0", "`test -s namespace-reset.json` exit code: 0"],
        "must_not_observe": ["empty/start signature: `junit.xml missing` OR count: 0", "empty/start signature: `reference-flow.mov 0 bytes` OR count: 0"]
      }
    }
  ]
}
```

### AC-2: Stale app install cannot produce a false pass
**GIVEN:** the simulator already has a prior build installed
**WHEN:** the harness runs
**THEN:** simctl-terminate.txt, simctl-uninstall.txt, and simctl-install.txt evidence a real terminate→uninstall→install of the fresh app_path before the flow executes
**VERIFY:** `scripts/e2e/run-maestro-reference-flow.sh --run && rg -l . .tmp/maestro-reference-flow/simctl-uninstall.txt .tmp/maestro-reference-flow/simctl-install.txt`
**TEST_TIER:** integration
**VERIFICATION_SERVICE:** xcrun simctl + real iOS Simulator
**TDD_STATE:** none
**UNIT_TEST_JUSTIFIED:** None
#### Scenario contract
```json
{
  "tier": "visible",
  "test_tier": "integration",
  "verification_service": "xcrun simctl + real iOS Simulator",
  "negative_control": { "would_fail_if": ["disconnect", "stub", "empty", "mock", "static"] },
  "evidence": { "artifact_type": "file_artifact", "required_capture": true },
  "cases": [
    {
      "start_ref": "stale_app_installed",
      "action": { "actor": "operator", "steps": ["Install an old build manually.", "Run the harness.", "Inspect simctl-uninstall.txt and simctl-install.txt."] },
      "end_state": {
        "must_observe": ["`test -s simctl-uninstall.txt` exit code: 0", "simctl-install.txt contains the literal fresh `$app_path` string and exit code: 0"],
        "must_not_observe": ["empty/start signature: `simctl-install.txt missing` OR count: 0", "stale build still running"]
      }
    }
  ]
}
```

### AC-3: Dev-client setup fallback chain records the actual session mode
**GIVEN:** the simulator's Expo dev client is already on the ready launcher screen
**WHEN:** the harness runs its setup sequence
**THEN:** dev-client-setup.json records a valid mode (e.g. already-running) and the main flow proceeds without failing on the tutorial-only path
**VERIFY:** `scripts/e2e/run-maestro-reference-flow.sh --run && rg -o '"mode":"[a-z-]+"' .tmp/maestro-reference-flow/dev-client-setup.json`
**TEST_TIER:** integration
**VERIFICATION_SERVICE:** maestro CLI + real Expo dev client on simulator
**TDD_STATE:** none
**UNIT_TEST_JUSTIFIED:** None
#### Scenario contract
```json
{
  "tier": "visible",
  "test_tier": "integration",
  "verification_service": "maestro CLI + real Expo dev client on simulator",
  "negative_control": { "would_fail_if": ["disconnect", "stub", "empty", "mock", "static"] },
  "evidence": { "artifact_type": "file_artifact", "required_capture": true },
  "cases": [
    {
      "start_ref": "harness_prereqs_ready",
      "action": { "actor": "operator", "steps": ["Pre-navigate the dev client to the ready launcher screen.", "Run the harness.", "Read dev-client-setup.json."] },
      "end_state": {
        "must_observe": ["dev-client-setup.json \"mode\" field equals one of \"tutorial\"/\"server-list+tutorial\"/\"server-list+already-running\"/\"already-running\"", "`test -s junit.xml` exit code: 0"],
        "must_not_observe": ["empty/start signature: `could not establish an Expo development-client session` OR count: 0", "dev-client-setup.json missing"]
      }
    }
  ]
}
```

### AC-4: Artifacts and cleanup survive a failing flow
**GIVEN:** the main Maestro flow is deliberately broken to fail mid-run
**WHEN:** the harness runs the forced-failure flow
**THEN:** the zero-cache process and port listener are terminated, final.png is still captured, and reference-flow.mov is finalized with non-zero size despite the flow failure
**VERIFY:** `MAESTRO_FLOW=.tmp/forced-failure-flow.yaml scripts/e2e/run-maestro-reference-flow.sh --run; test -s .tmp/maestro-reference-flow/final.png && ! lsof -i :4848`
**TEST_TIER:** integration
**VERIFICATION_SERVICE:** real zero-cache process + xcrun simctl io
**TDD_STATE:** none
**UNIT_TEST_JUSTIFIED:** None
#### Scenario contract
```json
{
  "tier": "visible",
  "test_tier": "integration",
  "verification_service": "real zero-cache process + xcrun simctl io",
  "negative_control": { "would_fail_if": ["disconnect", "stub", "empty", "mock", "static"] },
  "evidence": { "artifact_type": "file_artifact", "required_capture": true },
  "cases": [
    {
      "start_ref": "flow_forced_failure",
      "action": { "actor": "operator", "steps": ["Point MAESTRO_FLOW at the forced-failure flow.", "Run the harness and let the main test fail.", "Check for orphaned zero-cache listener and final.png/video."] },
      "end_state": {
        "must_observe": ["final.png file size > 0", "reference-flow.mov file size > 0", "no process listening on 4848 after exit"],
        "must_not_observe": ["empty/start signature: `final.png missing` OR count: 0", "orphaned zero-cache process still listening"]
      }
    }
  ]
}
```

## Test Criteria

| ID | Statement | Maps to | Verify | Type |
|----|-----------|---------|--------|------|
| TC-1 | A full harness run against real substrate produces non-empty junit.xml, video, and screenshot artifacts | AC-1 | `scripts/e2e/run-maestro-reference-flow.sh --run && test -s .tmp/maestro-reference-flow/junit.xml` | happy_path |
| TC-2 | simctl-uninstall.txt and simctl-install.txt evidence a fresh reinstall over a stale prior build | AC-2 | `rg -l . .tmp/maestro-reference-flow/simctl-uninstall.txt .tmp/maestro-reference-flow/simctl-install.txt` | edge |
| TC-3 | dev-client-setup.json records a valid session mode when the client is pre-navigated to ready | AC-3 | `rg -o '"mode":"[a-z-]+"' .tmp/maestro-reference-flow/dev-client-setup.json` | edge |
| TC-4 | A forced-failure run still finalizes video/screenshot artifacts and tears down zero-cache | AC-4 | `PLATFORM_IT=1 pnpm vitest run tests/integration/sprint20-maestro-harness-artifacts.test.ts -t 'TC-4'` | error |

## Reading List

- `scripts/e2e/run-maestro-reference-flow.sh` (1-161) — the existing boot/install/execute/capture harness to harden
- `tests/integration/sprint20-maestro-harness.test.ts` (1-22) — D03-01's RED fail-closed pattern for this same script
- `.e2e/maestro/reference-flow.yaml` (1-18) — the flow this harness drives (read-only)
- `.github/workflows/ci-e2e.yml` (36-93) — the CI consumer contract (artifact upload paths, env vars) this harness must satisfy
- `brain/docs/kanban/SCENARIO-CONTRACT-V1.md` (160-180) — Mobile/Maestro framework adapter row

## Guardrails

### WRITE-ALLOWED
- scripts/e2e/run-maestro-reference-flow.sh (MODIFY — hardening only: reinstall proof, cleanup robustness)
- tests/integration/sprint20-maestro-harness-artifacts.test.ts (NEW)
- docs/ci/maestro-harness.md (NEW)

### WRITE-PROHIBITED
- .github/workflows/** — D03-05/D03-06 own workflow authorship/review
- app/** — RN app code out of scope
- services/platform/src/db/** — D03-04 owns namespace/seed extension
- .e2e/maestro/reference-flow.yaml, .e2e/maestro/dev-client-*.yaml — flow content owned by S-COLDBOOT-03

### Boundaries
- **always:** Fresh reinstall every run, Cleanup runs regardless of flow outcome
- **ask_first:** Any change that could weaken the real-service header guards
- **never:** Skipping uninstall/reinstall when an app is already present, Letting set -e early-exit skip the cleanup trap

## Design

- **references:** (none)
- **pattern:** Harden the existing bash harness in place: strengthen the terminate/uninstall/install sequence with explicit success assertions, and ensure the EXIT trap always attempts screenshot+video finalization and zero-cache teardown regardless of the main maestro test exit code.
- **pattern_source:** scripts/e2e/run-maestro-reference-flow.sh:94-160
- **anti_pattern:** Skipping uninstall/reinstall when an app is already present, or letting a set -e early-exit skip the cleanup trap.

## Agent Assignment

- **implementer:** devops-engineer — owns the harness script hardening
- **reviewer:** mastra-reviewer — verifies real-service posture and cleanup robustness

## Verification Gates

- **AC-1 full harness run:** `scripts/e2e/run-maestro-reference-flow.sh --run && test -s .tmp/maestro-reference-flow/junit.xml && test -s .tmp/maestro-reference-flow/reference-flow.mov` → Exit 0; both files non-empty
- **AC-2 fresh reinstall:** `rg -l . .tmp/maestro-reference-flow/simctl-uninstall.txt .tmp/maestro-reference-flow/simctl-install.txt` → Both files non-empty
- **AC-3 dev-client mode recorded:** `rg -o '"mode":"[a-z-]+"' .tmp/maestro-reference-flow/dev-client-setup.json` → A valid mode string present
- **AC-4 cleanup on failure:** `test -s .tmp/maestro-reference-flow/final.png && ! lsof -i :4848` → Screenshot present; no orphaned zero-cache listener
- **Scope compliance:** `git diff --name-only | sort -u` → Only guardrails.write_allowed paths

## Coding Standards

- RULES.md
- brain/docs/kanban/TASK-TEMPLATE.md
- brain/docs/kanban/SCENARIO-CONTRACT-V1.md

## Dependencies

- **depends_on:** D03-02
- **blocks:** D03-05, D03-07

## Notes

The harness script already exists and is functionally complete (161 lines, produces junit.xml/video/screenshot/namespace-reset.json). This task is hardening (reinstall proof, cleanup-on-failure robustness) rather than net-new construction — multiple local `.tmp/maestro-reference-flow-official*` runs already show real SUCCESS outcomes.

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "D03-03",
  "proposed_by": "devops-engineer",
  "tdd_mode": "red_first",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": true,
    "requires_seeded_evidence": true
  },
  "fixtures": {
    "harness_prereqs_ready": {
      "description": "D03-02 substrate is online: e2e runner, named simulator, Expo dev build, real nonprod Postgres, real fleet, and zero-cache deployable.",
      "seed_method": "cli",
      "records": [
        "holo ci runner:status --json --lane e2e reports online:true",
        "DATABASE_URL targets holocron_nonprod",
        "FLEET_URL is a real http endpoint"
      ]
    },
    "stale_app_installed": {
      "description": "The named simulator already has a previous build of the app installed before this run.",
      "seed_method": "cli",
      "records": [
        "xcrun simctl install <device> <old-build-path> was run in a prior session"
      ]
    },
    "flow_forced_failure": {
      "description": "A deliberately broken flow file (temp copy) that asserts on a testID that never appears, forcing the main Maestro test to fail mid-run.",
      "seed_method": "cli",
      "records": [
        ".tmp/forced-failure-flow.yaml asserts visible id: does-not-exist"
      ]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "primary": true,
      "description": "GIVEN real D03-02 substrate is online WHEN the harness runs THEN junit.xml/video/screenshot/namespace-reset artifacts are all produced non-empty.",
      "verify": "scripts/e2e/run-maestro-reference-flow.sh --run && test -s .tmp/maestro-reference-flow/junit.xml && test -s .tmp/maestro-reference-flow/reference-flow.mov",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "e2e",
        "verification_service": "macos-runner+ios-simulator+real-postgres+real-fleet+real-zero-cache",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "disconnect",
            "stub",
            "empty",
            "mock",
            "static",
            "missing-build",
            "missing-simulator"
          ]
        },
        "evidence": {
          "artifact_type": "file_artifact",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "harness_prereqs_ready",
            "action": {
              "actor": "operator",
              "steps": [
                "Run scripts/e2e/run-maestro-reference-flow.sh --run.",
                "Inspect the artifact directory."
              ]
            },
            "end_state": {
              "must_observe": [
                "junit.xml file size > 0",
                "reference-flow.mov file size > 0",
                "`test -s final.png` exit code: 0",
                "`test -s namespace-reset.json` exit code: 0"
              ],
              "must_not_observe": [
                "empty/start signature: `junit.xml missing` OR count: 0",
                "empty/start signature: `reference-flow.mov 0 bytes` OR count: 0"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-2",
      "type": "acceptance_criterion",
      "description": "GIVEN a stale app is installed WHEN the harness runs THEN terminate/uninstall/install logs prove a fresh reinstall.",
      "verify": "scripts/e2e/run-maestro-reference-flow.sh --run && rg -l . .tmp/maestro-reference-flow/simctl-uninstall.txt .tmp/maestro-reference-flow/simctl-install.txt",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "xcrun simctl + real iOS Simulator",
        "negative_control": {
          "would_fail_if": [
            "disconnect",
            "stub",
            "empty",
            "mock",
            "static"
          ]
        },
        "evidence": {
          "artifact_type": "file_artifact",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "stale_app_installed",
            "action": {
              "actor": "operator",
              "steps": [
                "Install an old build manually.",
                "Run the harness.",
                "Inspect simctl-uninstall.txt and simctl-install.txt."
              ]
            },
            "end_state": {
              "must_observe": [
                "`test -s simctl-uninstall.txt` exit code: 0",
                "simctl-install.txt contains the literal fresh `$app_path` string and exit code: 0"
              ],
              "must_not_observe": [
                "empty/start signature: `simctl-install.txt missing` OR count: 0",
                "stale build still running"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-3",
      "type": "acceptance_criterion",
      "description": "GIVEN the dev client is pre-navigated to ready WHEN setup runs THEN dev-client-setup.json records a valid mode and the flow proceeds.",
      "verify": "scripts/e2e/run-maestro-reference-flow.sh --run && rg -o '\"mode\":\"[a-z-]+\"' .tmp/maestro-reference-flow/dev-client-setup.json",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "maestro CLI + real Expo dev client on simulator",
        "negative_control": {
          "would_fail_if": [
            "disconnect",
            "stub",
            "empty",
            "mock",
            "static"
          ]
        },
        "evidence": {
          "artifact_type": "file_artifact",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "harness_prereqs_ready",
            "action": {
              "actor": "operator",
              "steps": [
                "Pre-navigate the dev client to the ready launcher screen.",
                "Run the harness.",
                "Read dev-client-setup.json."
              ]
            },
            "end_state": {
              "must_observe": [
                "dev-client-setup.json \"mode\" field equals one of \"tutorial\"/\"server-list+tutorial\"/\"server-list+already-running\"/\"already-running\"",
                "`test -s junit.xml` exit code: 0"
              ],
              "must_not_observe": [
                "empty/start signature: `could not establish an Expo development-client session` OR count: 0",
                "dev-client-setup.json missing"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-4",
      "type": "acceptance_criterion",
      "description": "GIVEN the main flow fails WHEN cleanup runs THEN zero-cache is torn down and screenshot/video are still finalized.",
      "verify": "MAESTRO_FLOW=.tmp/forced-failure-flow.yaml scripts/e2e/run-maestro-reference-flow.sh --run; test -s .tmp/maestro-reference-flow/final.png && ! lsof -i :4848",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "real zero-cache process + xcrun simctl io",
        "negative_control": {
          "would_fail_if": [
            "disconnect",
            "stub",
            "empty",
            "mock",
            "static"
          ]
        },
        "evidence": {
          "artifact_type": "file_artifact",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "flow_forced_failure",
            "action": {
              "actor": "operator",
              "steps": [
                "Point MAESTRO_FLOW at the forced-failure flow.",
                "Run the harness and let the main test fail.",
                "Check for orphaned zero-cache listener and final.png/video."
              ]
            },
            "end_state": {
              "must_observe": [
                "final.png file size > 0",
                "reference-flow.mov file size > 0",
                "no process listening on 4848 after exit"
              ],
              "must_not_observe": [
                "empty/start signature: `final.png missing` OR count: 0",
                "orphaned zero-cache process still listening"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "TC-1",
      "type": "test_criterion",
      "description": "Full harness run produces non-empty JUnit/video/screenshot",
      "verify": "scripts/e2e/run-maestro-reference-flow.sh --run && test -s .tmp/maestro-reference-flow/junit.xml",
      "maps_to_ac": "AC-1"
    },
    {
      "id": "TC-2",
      "type": "test_criterion",
      "description": "Fresh reinstall over stale build is evidenced",
      "verify": "rg -l . .tmp/maestro-reference-flow/simctl-uninstall.txt .tmp/maestro-reference-flow/simctl-install.txt",
      "maps_to_ac": "AC-2"
    },
    {
      "id": "TC-3",
      "type": "test_criterion",
      "description": "Dev-client setup mode recorded correctly",
      "verify": "rg -o '\"mode\":\"[a-z-]+\"' .tmp/maestro-reference-flow/dev-client-setup.json",
      "maps_to_ac": "AC-3"
    },
    {
      "id": "TC-4",
      "type": "test_criterion",
      "description": "Forced-failure run still finalizes artifacts and tears down zero-cache",
      "verify": "PLATFORM_IT=1 pnpm vitest run tests/integration/sprint20-maestro-harness-artifacts.test.ts -t 'TC-4'",
      "maps_to_ac": "AC-4"
    }
  ]
}
-->

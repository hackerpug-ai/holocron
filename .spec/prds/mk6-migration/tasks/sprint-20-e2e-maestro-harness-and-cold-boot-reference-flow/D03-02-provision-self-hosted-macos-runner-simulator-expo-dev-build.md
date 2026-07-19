# D03-02 — Provision self-hosted macOS runner: named iOS Simulator + Expo dev build pipeline
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

Provision a real macOS self-hosted runner that can boot a named iOS Simulator and install a real Expo development build, and extend runner health checking to prove both are present before the e2e lane runs.

**Success state:** `holo ci runner:status --json --lane e2e` reports online:true with labels including e2e, simulator_present:true naming the real device, and build_present:true naming a valid .app bundle; removing either flips the same command non-zero.

## Background

- **Specialist rationale:** Owns macOS host runner registration, iOS Simulator provisioning, and the Expo development-build pipeline that the Maestro harness (D03-03) and capstone (D03-07) consume.
- **Planning rationale:** Audit found `services/platform/src/ci/runner-status.ts` only checks `[self-hosted,holocron,integration]` labels (no e2e/simulator/build probe), even though `.github/workflows/ci-e2e.yml`, `scripts/ci/register-runner.sh` (already defaults `RUNNER_LABELS=self-hosted,holocron,integration,e2e`), and `scripts/e2e/run-maestro-reference-flow.sh` already exist and are wired together. This task closes the two concrete gaps: an e2e-lane runner health probe, and an actual Expo dev-client build pipeline producing `EXPO_DEV_BUILD_PATH` (using the existing `development-simulator` EAS profile in eas.json).
- **How to verify (human):** Run `holo ci runner:status --json --lane e2e` on the registered macOS runner and confirm online:true with simulator_present/build_present true; delete the simulator or unset EXPO_DEV_BUILD_PATH and confirm the same command fails closed.
- **Scope:** Runner health probe extension + simulator/build provisioning scripts. Does not touch `.github/workflows/**` (D03-05/D03-06 own workflow authorship), the RN app, or `.e2e/maestro/**.yaml`.
- **PRD refs:** T-PLAT-019, 10-e2e-testing, UC-SYNC-02

## Critical Constraints

### MUST
- MUST extend the self-hosted runner to advertise the e2e label set [self-hosted, holocron, e2e] alongside the existing integration labels
- MUST provision the named iOS Simulator declared by MAESTRO_DEVICE via a documented, re-runnable script (create if absent, never require manual Simulator.app interaction)
- MUST produce EXPO_DEV_BUILD_PATH via a documented build command (`eas build --profile development-simulator --local`) with no manual Xcode step

### NEVER
- NEVER report runner e2e-lane health as online when the named simulator or the Expo dev build path is missing or stale
- NEVER commit actions-runner credentials, provisioning profiles, or built .app bundles into the repo

### STRICTLY
- STRICTLY the e2e lane health probe is a real command exit code — never a hardcoded true

## Specification

**Objective:** Provision a real macOS self-hosted runner that can boot a named iOS Simulator and install a real Expo development build, and extend runner health checking to prove both are present before the e2e lane runs.

**Success state:** holo ci runner:status --json --lane e2e reports online:true with labels including e2e, simulator_present:true naming the real device, and build_present:true naming a valid .app bundle; removing either flips the same command non-zero.

## Acceptance Criteria

### AC-1: macOS e2e runner online with e2e labels plus simulator+build probe [PRIMARY]
**GIVEN:** the macOS host is registered as a self-hosted runner with labels self-hosted,holocron,e2e, the named simulator has been provisioned, and an Expo dev build has been produced
**WHEN:** the operator runs `holo ci runner:status --json --lane e2e`
**THEN:** the command reports online:true, labels include e2e, simulator_present:true naming MAESTRO_DEVICE, and build_present:true naming a real .app path
**VERIFY:** `bun services/platform/src/cli/holo.ts ci runner:status --json --lane e2e`
**TEST_TIER:** integration
**VERIFICATION_SERVICE:** self-hosted macOS runner + iOS Simulator + Expo dev build
**TDD_STATE:** none
**UNIT_TEST_JUSTIFIED:** None
#### Scenario contract
```json
{
  "tier": "visible",
  "test_tier": "integration",
  "verification_service": "self-hosted macOS runner + iOS Simulator + Expo dev build",
  "topology": "single-node",
  "negative_control": { "would_fail_if": ["disconnect", "stub", "empty", "mock", "static", "missing-build", "missing-simulator"] },
  "evidence": { "artifact_type": "stdout", "required_capture": true },
  "cases": [
    {
      "start_ref": "macos_host_unprovisioned",
      "action": { "actor": "operator", "steps": ["Register the runner with labels self-hosted,holocron,e2e.", "Provision the named simulator.", "Run the Expo dev-client build pipeline.", "Run holo ci runner:status --json --lane e2e."] },
      "end_state": {
        "must_observe": ["online: true", "labels includes 'e2e'", "simulator_present: true", "build_present: true"],
        "must_not_observe": ["empty/start signature: `simulator_present: false` OR count: 0", "empty/start signature: `build_present: false` OR count: 0", "online: false"]
      }
    }
  ]
}
```

### AC-2: Named iOS Simulator provisioned and bootable
**GIVEN:** the named simulator (MAESTRO_DEVICE) does not exist on the host
**WHEN:** the operator runs the documented simulator provisioning script
**THEN:** `xcrun simctl list devices available` includes the named device and it boots successfully
**VERIFY:** `scripts/e2e/provision-ios-simulator.sh && xcrun simctl list devices available | rg -F "$MAESTRO_DEVICE"`
**TEST_TIER:** integration
**VERIFICATION_SERVICE:** xcrun simctl + real iOS Simulator runtime
**TDD_STATE:** none
**UNIT_TEST_JUSTIFIED:** None
#### Scenario contract
```json
{
  "tier": "visible",
  "test_tier": "integration",
  "verification_service": "xcrun simctl + real iOS Simulator runtime",
  "negative_control": { "would_fail_if": ["disconnect", "stub", "empty", "mock", "static"] },
  "evidence": { "artifact_type": "stdout", "required_capture": true },
  "cases": [
    {
      "start_ref": "simulator_absent",
      "action": { "actor": "operator", "steps": ["Run scripts/e2e/provision-ios-simulator.sh.", "List available simulators.", "Boot the named simulator."] },
      "end_state": {
        "must_observe": ["`xcrun simctl list devices available` output contains the literal string \"$MAESTRO_DEVICE\"", "boot exit code: 0"],
        "must_not_observe": ["empty/start signature: `could not find device` OR count: 0", "empty device list (0 devices)"]
      }
    }
  ]
}
```

### AC-3: Expo dev-client build pipeline produces an installable build with no manual step
**GIVEN:** a clean checkout on the macOS runner and EXPO_DEV_BUILD_PATH unset
**WHEN:** the operator runs `scripts/e2e/build-expo-dev-client.sh` (`eas build --platform ios --profile development-simulator --local`)
**THEN:** EXPO_DEV_BUILD_PATH resolves to a valid .app bundle directory installable via `xcrun simctl install`, with build provenance logged
**VERIFY:** `scripts/e2e/build-expo-dev-client.sh && test -d "$EXPO_DEV_BUILD_PATH" && xcrun simctl install "$MAESTRO_DEVICE" "$EXPO_DEV_BUILD_PATH"`
**TEST_TIER:** integration
**VERIFICATION_SERVICE:** eas build --local + xcrun simctl install
**TDD_STATE:** none
**UNIT_TEST_JUSTIFIED:** None
#### Scenario contract
```json
{
  "tier": "visible",
  "test_tier": "integration",
  "verification_service": "eas build --local + xcrun simctl install",
  "negative_control": { "would_fail_if": ["disconnect", "stub", "empty", "mock", "static", "manual-xcode-step"] },
  "evidence": { "artifact_type": "file_artifact", "required_capture": true },
  "cases": [
    {
      "start_ref": "build_path_absent",
      "action": { "actor": "operator", "steps": ["Run scripts/e2e/build-expo-dev-client.sh.", "Resolve EXPO_DEV_BUILD_PATH.", "Install the bundle on the named simulator."] },
      "end_state": {
        "must_observe": ["`test -d \"$EXPO_DEV_BUILD_PATH\"` exit code: 0 and path matches glob `*.app`", "simctl install exit code: 0"],
        "must_not_observe": ["empty/start signature: `EXPO_DEV_BUILD_PATH unset` OR count: 0", "empty/start signature: `no build produced` OR count: 0"]
      }
    }
  ]
}
```

### AC-4: e2e runner health fails closed when simulator or build is missing
**GIVEN:** the runner is registered with e2e labels but the named simulator or Expo dev build is missing
**WHEN:** the operator runs `holo ci runner:status --json --lane e2e`
**THEN:** the command exits non-zero naming the missing prerequisite, never reporting online:true
**VERIFY:** `bun services/platform/src/cli/holo.ts ci runner:status --json --lane e2e; test $? -ne 0`
**TEST_TIER:** integration
**VERIFICATION_SERVICE:** holo CLI + real simulator/build filesystem probe
**TDD_STATE:** none
**UNIT_TEST_JUSTIFIED:** None
#### Scenario contract
```json
{
  "tier": "visible",
  "test_tier": "integration",
  "verification_service": "holo CLI + real simulator/build filesystem probe",
  "negative_control": { "would_fail_if": ["disconnect", "stub", "empty", "mock", "static"] },
  "evidence": { "artifact_type": "stdout", "required_capture": true },
  "cases": [
    {
      "start_ref": "build_path_absent",
      "action": { "actor": "operator", "steps": ["Run holo ci runner:status --json --lane e2e with the build missing.", "Capture exit code and errors array."] },
      "end_state": { "must_observe": ["exitCode: 1", "errors includes 'build'"], "must_not_observe": ["exitCode: 0", "empty/start signature: `online: true` OR count: 0"] }
    }
  ]
}
```

## Test Criteria

| ID | Statement | Maps to | Verify | Type |
|----|-----------|---------|--------|------|
| TC-1 | holo ci runner:status --json --lane e2e reports online:true with e2e in labels when the runner, simulator, and build are all ready | AC-1 | `bun services/platform/src/cli/holo.ts ci runner:status --json --lane e2e` | happy_path |
| TC-2 | The named simulator appears in xcrun simctl list devices available after provisioning | AC-2 | `scripts/e2e/provision-ios-simulator.sh && xcrun simctl list devices available \| rg -F "$MAESTRO_DEVICE"` | happy_path |
| TC-3 | scripts/e2e/build-expo-dev-client.sh produces a directory at EXPO_DEV_BUILD_PATH ending in .app | AC-3 | `scripts/e2e/build-expo-dev-client.sh && test -d "$EXPO_DEV_BUILD_PATH"` | happy_path |
| TC-4 | holo ci runner:status --json --lane e2e exits non-zero when EXPO_DEV_BUILD_PATH is missing | AC-4 | `PLATFORM_IT=1 pnpm vitest run tests/integration/sprint20-macos-runner-status.test.ts -t 'TC-4'` | error |

## Reading List

- `scripts/ci/register-runner.sh` (1-31) — existing runner registration + labels contract (already defaults to self-hosted,holocron,integration,e2e)
- `services/platform/src/ci/runner-status.ts` (1-130) — existing fail-closed integration-lane check to extend with an e2e lane + simulator/build probe
- `scripts/e2e/run-maestro-reference-flow.sh` (1-45) — the MAESTRO_DEVICE/EXPO_DEV_BUILD_PATH contract this task must satisfy for D03-03
- `eas.json` (1-20) — development-simulator build profile (ios.simulator:true) to drive via eas build --local
- `docs/ci/runner-labels.md` (1-20) — existing label contract table to extend with the e2e lane's simulator/build probe

## Guardrails

### WRITE-ALLOWED
- scripts/e2e/provision-ios-simulator.sh (NEW)
- scripts/e2e/build-expo-dev-client.sh (NEW)
- services/platform/src/ci/runner-status.ts (MODIFY — e2e lane + simulator/build probe)
- services/platform/src/cli/holo.ts (MODIFY — ci runner:status --lane flag)
- tests/integration/sprint20-macos-runner-status.test.ts (NEW)
- docs/ci/macos-e2e-runner.md (NEW)
- docs/ci/runner-labels.md (MODIFY — document --lane e2e probe)

### WRITE-PROHIBITED
- .github/workflows/** — D03-05/D03-06 own workflow authorship/review
- app/** — RN app code out of scope
- .e2e/maestro/**.yaml — flow authoring owned by S-COLDBOOT-03
- services/platform/src/db/** — D03-04 owns namespace/seed extension

### Boundaries
- **always:** Real command exit codes for health probes, Documented re-runnable provisioning scripts
- **ask_first:** Any change to eas.json build profiles
- **never:** Committing runner credentials or built .app bundles, Hardcoding simulator_present/build_present to true

## Design

- **references:** (none)
- **pattern:** Extend checkRunnerStatus() with an optional lane param: lane=integration keeps REQUIRED_RUNNER_LABELS unchanged; lane=e2e requires [self-hosted,holocron,e2e] plus a real filesystem/simctl probe of MAESTRO_DEVICE and EXPO_DEV_BUILD_PATH, merged into the same JSON shape as simulator_present/build_present fields.
- **pattern_source:** services/platform/src/ci/runner-status.ts:1-90
- **anti_pattern:** Hardcoding simulator_present/build_present to true, or treating a missing --lane flag as a silent pass.

## Agent Assignment

- **implementer:** devops-engineer — owns macOS runner registration, simulator provisioning, and build pipeline
- **reviewer:** mastra-reviewer — verifies real command exit codes and no hardcoded health fields

## Verification Gates

- **AC-1 e2e runner online:** `bun services/platform/src/cli/holo.ts ci runner:status --json --lane e2e` → online:true; labels include e2e; simulator_present/build_present true
- **AC-2 simulator provisioned:** `scripts/e2e/provision-ios-simulator.sh && xcrun simctl list devices available | rg -F "$MAESTRO_DEVICE"` → Exit 0; device listed
- **AC-3 dev build produced:** `scripts/e2e/build-expo-dev-client.sh && test -d "$EXPO_DEV_BUILD_PATH"` → Exit 0; directory exists
- **AC-4 fail-closed:** `bun services/platform/src/cli/holo.ts ci runner:status --json --lane e2e; test $? -ne 0` → Non-zero when simulator/build missing
- **Scope compliance:** `git diff --name-only | sort -u` → Only guardrails.write_allowed paths

## Coding Standards

- RULES.md
- brain/docs/kanban/TASK-TEMPLATE.md
- brain/docs/kanban/SCENARIO-CONTRACT-V1.md

## Dependencies

- **depends_on:** —
- **blocks:** D03-03

## Notes

`scripts/ci/register-runner.sh` already defaults `RUNNER_LABELS=self-hosted,holocron,integration,e2e` — the runner-registration script itself needs no e2e-label change; the gap is purely the health-probe extension (`--lane e2e`) plus the simulator/build provisioning scripts.

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "D03-02",
  "proposed_by": "devops-engineer",
  "tdd_mode": "red_first",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": true,
    "requires_seeded_evidence": true
  },
  "fixtures": {
    "macos_host_unprovisioned": {
      "description": "macOS host has actions-runner, Xcode CLI tools, and the maestro CLI installed but is registered (if at all) only under Sprint 13's integration labels; no named simulator exists and no Expo dev build has been produced.",
      "seed_method": "cli",
      "records": [
        "uname -a reports macOS/arm64",
        "xcodebuild -version succeeds",
        "maestro --version succeeds",
        "xcrun simctl list devices available does not contain MAESTRO_DEVICE",
        "EXPO_DEV_BUILD_PATH unset"
      ]
    },
    "simulator_absent": {
      "description": "The named simulator has been deleted so it is absent from xcrun simctl list devices available.",
      "seed_method": "cli",
      "records": [
        "xcrun simctl delete deletes the named device from the available list"
      ]
    },
    "build_path_absent": {
      "description": "EXPO_DEV_BUILD_PATH is unset or points at a directory that does not exist.",
      "seed_method": "cli",
      "records": [
        "EXPO_DEV_BUILD_PATH points at a nonexistent path"
      ]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "primary": true,
      "description": "GIVEN the macOS runner is registered with e2e labels, a named simulator, and a real Expo dev build WHEN operator runs holo ci runner:status --json --lane e2e THEN it reports online, e2e label, simulator_present, and build_present all true.",
      "verify": "bun services/platform/src/cli/holo.ts ci runner:status --json --lane e2e",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "self-hosted macOS runner + iOS Simulator + Expo dev build",
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
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "macos_host_unprovisioned",
            "action": {
              "actor": "operator",
              "steps": [
                "Register the runner with labels self-hosted,holocron,e2e.",
                "Provision the named simulator.",
                "Run the Expo dev-client build pipeline.",
                "Run holo ci runner:status --json --lane e2e."
              ]
            },
            "end_state": {
              "must_observe": [
                "online: true",
                "labels includes 'e2e'",
                "simulator_present: true",
                "build_present: true"
              ],
              "must_not_observe": [
                "empty/start signature: `simulator_present: false` OR count: 0",
                "empty/start signature: `build_present: false` OR count: 0",
                "online: false"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-2",
      "type": "acceptance_criterion",
      "description": "GIVEN the named simulator is absent WHEN the provisioning script runs THEN the simulator exists and boots.",
      "verify": "scripts/e2e/provision-ios-simulator.sh && xcrun simctl list devices available | rg -F \"$MAESTRO_DEVICE\"",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "xcrun simctl + real iOS Simulator runtime",
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
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "simulator_absent",
            "action": {
              "actor": "operator",
              "steps": [
                "Run scripts/e2e/provision-ios-simulator.sh.",
                "List available simulators.",
                "Boot the named simulator."
              ]
            },
            "end_state": {
              "must_observe": [
                "`xcrun simctl list devices available` output contains the literal string \"$MAESTRO_DEVICE\"",
                "boot exit code: 0"
              ],
              "must_not_observe": [
                "empty/start signature: `could not find device` OR count: 0",
                "empty device list (0 devices)"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-3",
      "type": "acceptance_criterion",
      "description": "GIVEN EXPO_DEV_BUILD_PATH is unset WHEN the build pipeline runs THEN a valid installable .app bundle is produced.",
      "verify": "scripts/e2e/build-expo-dev-client.sh && test -d \"$EXPO_DEV_BUILD_PATH\"",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "eas build --local + xcrun simctl install",
        "negative_control": {
          "would_fail_if": [
            "disconnect",
            "stub",
            "empty",
            "mock",
            "static",
            "manual-xcode-step"
          ]
        },
        "evidence": {
          "artifact_type": "file_artifact",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "build_path_absent",
            "action": {
              "actor": "operator",
              "steps": [
                "Run scripts/e2e/build-expo-dev-client.sh.",
                "Resolve EXPO_DEV_BUILD_PATH.",
                "Install the bundle on the named simulator."
              ]
            },
            "end_state": {
              "must_observe": [
                "`test -d \"$EXPO_DEV_BUILD_PATH\"` exit code: 0 and path matches glob `*.app`",
                "simctl install exit code: 0"
              ],
              "must_not_observe": [
                "empty/start signature: `EXPO_DEV_BUILD_PATH unset` OR count: 0",
                "empty/start signature: `no build produced` OR count: 0"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-4",
      "type": "acceptance_criterion",
      "description": "GIVEN the simulator or build is missing WHEN e2e runner health runs THEN it exits non-zero naming the gap.",
      "verify": "bun services/platform/src/cli/holo.ts ci runner:status --json --lane e2e; test $? -ne 0",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "holo CLI + real simulator/build filesystem probe",
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
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "build_path_absent",
            "action": {
              "actor": "operator",
              "steps": [
                "Run holo ci runner:status --json --lane e2e with the build missing.",
                "Capture exit code and errors array."
              ]
            },
            "end_state": {
              "must_observe": [
                "exitCode: 1",
                "errors includes 'build'"
              ],
              "must_not_observe": [
                "exitCode: 0",
                "empty/start signature: `online: true` OR count: 0"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "TC-1",
      "type": "test_criterion",
      "description": "e2e lane runner status reports online with e2e label and simulator/build present",
      "verify": "bun services/platform/src/cli/holo.ts ci runner:status --json --lane e2e",
      "maps_to_ac": "AC-1"
    },
    {
      "id": "TC-2",
      "type": "test_criterion",
      "description": "Named simulator provisioned and listed",
      "verify": "scripts/e2e/provision-ios-simulator.sh && xcrun simctl list devices available | rg -F \"$MAESTRO_DEVICE\"",
      "maps_to_ac": "AC-2"
    },
    {
      "id": "TC-3",
      "type": "test_criterion",
      "description": "Expo dev-client build produces installable .app",
      "verify": "scripts/e2e/build-expo-dev-client.sh && test -d \"$EXPO_DEV_BUILD_PATH\"",
      "maps_to_ac": "AC-3"
    },
    {
      "id": "TC-4",
      "type": "test_criterion",
      "description": "e2e runner health fails closed without simulator/build",
      "verify": "PLATFORM_IT=1 pnpm vitest run tests/integration/sprint20-macos-runner-status.test.ts -t 'TC-4'",
      "maps_to_ac": "AC-4"
    }
  ]
}
-->

# GATE-FIX-G1 — Rebuild non-crashing Expo development-simulator holocron.app via eas
> Status: ✅ Completed
> Commit: a4de2dbfaf02d2be93f296130b856651ae616c26
> Reviewer: code-reviewer
> Completed: 2026-07-20T01:45:48Z
> Sprint: [Sprint 20 — E2E Maestro Harness and Cold-Boot Reference Flow](./SPRINT.md)
> Agent: devops-engineer
> Estimate: 150 min
> Type: FEATURE
> Priority: P0
> Proposed by: devops-engineer
> TDD_MODE: red_first · RED_GREEN_REQUIRED: yes · SEEDED_EVIDENCE_REQUIRED: yes
> Human gates: 1, 5
> Source: failing human gates in gate-results.json + sprint-goal-state.json (2026-07-20)

## Outcome

Fresh method=eas holocron.app with build-provenance.json; simctl install on MAESTRO_DEVICE; crash-diagnosis.md; fail-closed probe when eas/auth missing.

**Success state:** FORCE_EAS_BUILD produces method=eas provenance, valid org.name.holocron .app installs on named simulator, probe fails closed with next_input_needed when eas missing.

## Background

- **Specialist rationale (devops-engineer):** Step 1 FAIL / step 5 PARTIAL: Maestro run4 crashed Expo dev client (junit failures=1). EXPO_DEV_BUILD_PATH was worktree D03-02 holocron.app (method reuse-existing). eas CLI not installed. Capstone coldboot_gate=red. Historical SUCCESS must not substitute.
- **Agent rationale:** Owns scripts/e2e/build-expo-dev-client.sh and simulator install; pairs with react-native-ui-implementer only if crash is JS/native after rebuild.
- **Pairing:** react-native-ui-implementer if crash-diagnosis shows ABI/JS mismatch after FORCE rebuild
- **PRD refs:** UC-SYNC-02, T-PLAT-019, D03-02, human-gate-step-1, human-gate-step-5

## Critical Constraints

### MUST
- MUST rebuild with FORCE_EAS_BUILD=1 (or fail closed with next_input_needed)
- MUST write method=eas|eas-local provenance
- MUST prove simctl install on MAESTRO_DEVICE
- MUST write crash-diagnosis.md

### NEVER
- NEVER claim green by reusing D03-02 crashing seed as rebuild
- NEVER hardcode coldboot_gate green
- NEVER commit Expo tokens or binary .app

### STRICTLY
- STRICTLY operator eas login/EXPO_TOKEN are explicit ACs with next_input_needed
- STRICTLY CFBundleIdentifier remains org.name.holocron unless harness updated

## Specification

**Objective:** Force a real eas development-simulator rebuild and prove installability without greenwashing the crashing seed.

**Success state:** FORCE_EAS_BUILD produces method=eas provenance, valid org.name.holocron .app installs on named simulator, probe fails closed with next_input_needed when eas missing.

## Acceptance Criteria

### AC-1: Fail-closed eas/credential probe with next_input_needed [PRIMARY]
**GIVEN:** eas missing or Expo credentials absent and E2E_SEED_APP_PATH unset
**WHEN:** operator runs probe-expo-dev-client-prereqs.sh --check and/or FORCE_EAS_BUILD rebuild
**THEN:** exit non-zero; JSON ok:false; next_input_needed names eas install/login; no silent crashing-seed greenwash
**VERIFY:** `PLATFORM_IT=1 pnpm vitest run tests/integration/sprint20-expo-dev-client-rebuild.test.ts -t 'AC-1'`
**TEST_TIER:** integration
**VERIFICATION_SERVICE:** scripts/e2e/probe-expo-dev-client-prereqs.sh + build-expo-dev-client.sh
**TDD_STATE:** red
**FLOW_REF:** UC-SYNC-02
#### Scenario contract
```json
{
  "tier": "visible",
  "test_tier": "integration",
  "verification_service": "scripts/e2e/probe-expo-dev-client-prereqs.sh + build-expo-dev-client.sh",
  "topology": "single-node",
  "negative_control": {
    "would_fail_if": [
      "stub",
      "empty",
      "mock",
      "static",
      "skip-to-green",
      "silent seed of crashing app"
    ]
  },
  "evidence": {
    "artifact_type": "file_artifact",
    "required_capture": true
  },
  "cases": [
    {
      "start_ref": "eas_cli_missing_or_unauthenticated",
      "action": {
        "actor": "operator",
        "steps": [
          "Unset E2E_SEED_APP_PATH and EXPO_TOKEN",
          "Run probe --check",
          "Optionally FORCE_EAS_BUILD rebuild"
        ]
      },
      "end_state": {
        "must_observe": [
          "exitCode != 0",
          "ok: false",
          "next_input_needed contains \"eas\""
        ],
        "must_not_observe": [
          "exitCode 0",
          "skip-to-green",
          "method reuse-existing treated as eas rebuild"
        ]
      }
    }
  ],
  "id": "inline"
}
```

### AC-2: FORCE_EAS_BUILD produces method=eas provenance
**GIVEN:** eas is authenticated
**WHEN:** FORCE_EAS_BUILD=1 E2E_SEED_APP_PATH= scripts/e2e/build-expo-dev-client.sh
**THEN:** exit 0; valid holocron.app with Info.plist; build-provenance method eas or eas-local; not D03-02 reuse-existing sole evidence
**VERIFY:** `PLATFORM_IT=1 pnpm vitest run tests/integration/sprint20-expo-dev-client-rebuild.test.ts -t 'AC-2'`
**TEST_TIER:** integration
**VERIFICATION_SERVICE:** scripts/e2e/build-expo-dev-client.sh + jq
**TDD_STATE:** red
**FLOW_REF:** UC-SYNC-02
#### Scenario contract
```json
{
  "tier": "visible",
  "test_tier": "integration",
  "verification_service": "scripts/e2e/build-expo-dev-client.sh + jq",
  "topology": "single-node",
  "negative_control": {
    "would_fail_if": [
      "stub",
      "empty",
      "mock",
      "static",
      "reuse-existing false pass"
    ]
  },
  "evidence": {
    "artifact_type": "file_artifact",
    "required_capture": true
  },
  "cases": [
    {
      "start_ref": "eas_authenticated_rebuild_ready",
      "action": {
        "actor": "operator",
        "steps": [
          "export FORCE_EAS_BUILD=1",
          "Run build-expo-dev-client.sh",
          "Inspect provenance + Info.plist"
        ]
      },
      "end_state": {
        "must_observe": [
          "exitCode: 0",
          "Info.plist exists: true",
          "method: \"eas\""
        ],
        "must_not_observe": [
          "method reuse-existing",
          "empty app bundle"
        ]
      }
    }
  ],
  "id": "inline"
}
```

### AC-3: New .app installs on named simulator
**GIVEN:** AC-2 produced EXPO_DEV_BUILD_PATH and MAESTRO_DEVICE available
**WHEN:** simctl uninstall/install of the new .app
**THEN:** install exit 0; installed path is the rebuilt app
**VERIFY:** `PLATFORM_IT=1 pnpm vitest run tests/integration/sprint20-expo-dev-client-rebuild.test.ts -t 'AC-3'`
**TEST_TIER:** integration
**VERIFICATION_SERVICE:** xcrun simctl + named iOS Simulator
**TDD_STATE:** red
**FLOW_REF:** UC-SYNC-02
#### Scenario contract
```json
{
  "tier": "visible",
  "test_tier": "integration",
  "verification_service": "xcrun simctl + named iOS Simulator",
  "topology": "single-node",
  "negative_control": {
    "would_fail_if": [
      "disconnect",
      "stub",
      "empty",
      "mock",
      "static",
      "missing simulator"
    ]
  },
  "evidence": {
    "artifact_type": "file_artifact",
    "required_capture": true
  },
  "cases": [
    {
      "start_ref": "named_simulator_available",
      "action": {
        "actor": "operator",
        "steps": [
          "Boot MAESTRO_DEVICE if needed",
          "simctl install EXPO_DEV_BUILD_PATH"
        ]
      },
      "end_state": {
        "must_observe": [
          "simctl install exitCode: 0",
          "installed_path == EXPO_DEV_BUILD_PATH"
        ],
        "must_not_observe": [
          "install failed",
          "EXPO_DEV_BUILD_PATH unset",
          "empty/start signature: (0) or exitCode: 0 false pass"
        ]
      }
    }
  ],
  "id": "inline"
}
```

### AC-4: Reject crashing seed as rebuild success + write crash diagnosis
**GIVEN:** crashing D03-02 seed with method=reuse-existing exists
**WHEN:** rebuild honesty tests + diagnosis write
**THEN:** tests fail if only reuse-existing seed counts as rebuild; crash-diagnosis.md names root-cause class
**VERIFY:** `PLATFORM_IT=1 pnpm vitest run tests/integration/sprint20-expo-dev-client-rebuild.test.ts -t 'AC-4' && test -s .tmp/e2e/expo-dev-client/crash-diagnosis.md`
**TEST_TIER:** integration
**VERIFICATION_SERVICE:** vitest + build-provenance + failed-this-cycle evidence
**TDD_STATE:** red
**FLOW_REF:** UC-SYNC-02
#### Scenario contract
```json
{
  "tier": "visible",
  "test_tier": "integration",
  "verification_service": "vitest + build-provenance + failed-this-cycle evidence",
  "topology": "single-node",
  "negative_control": {
    "would_fail_if": [
      "stub",
      "empty",
      "mock",
      "static",
      "reuse-existing counted as eas rebuild"
    ]
  },
  "evidence": {
    "artifact_type": "file_artifact",
    "required_capture": true
  },
  "cases": [
    {
      "start_ref": "crashing_seed_app_present",
      "action": {
        "actor": "operator",
        "steps": [
          "Read reuse-existing provenance",
          "Assert rebuild AC fails closed until method=eas",
          "Write crash-diagnosis.md"
        ]
      },
      "end_state": {
        "must_observe": [
          "method != \"eas\" rejected",
          "crash-diagnosis.md bytes > 0",
          "crash-diagnosis contains \"root cause\""
        ],
        "must_not_observe": [
          "pass solely because .app exists",
          "official11 SUCCESS as rebuild proof"
        ]
      }
    }
  ],
  "id": "inline"
}
```

## Test Criteria

| ID | Statement | Maps to | Type | Verify |
|----|-----------|---------|------|--------|
| TC-1 | probe exits non-zero when eas missing or unauthenticated | AC-1 | error_path | `env -u EXPO_TOKEN -u E2E_SEED_APP_PATH PATH=/usr/bin:/bin bash scripts/e2e/probe-expo-dev-client-prereqs.sh --check; test $? -ne 0` |
| TC-2 | build-provenance method is eas or eas-local after FORCE_EAS_BUILD | AC-2 | happy_path | `jq -e '.method=="eas" or .method=="eas-local"' .tmp/e2e/expo-dev-client/build-provenance.json` |
| TC-3 | simctl install of EXPO_DEV_BUILD_PATH succeeds | AC-3 | happy_path | `test -d "$EXPO_DEV_BUILD_PATH" && xcrun simctl install "$MAESTRO_DEVICE" "$EXPO_DEV_BUILD_PATH"` |
| TC-4 | reuse-existing alone fails rebuild honesty + diagnosis exists | AC-4 | error_path | `PLATFORM_IT=1 pnpm vitest run tests/integration/sprint20-expo-dev-client-rebuild.test.ts -t 'AC-4' && test -s .tmp/e2e/expo-dev-client/crash-diagnosis.md` |

## Reading List

- `scripts/e2e/build-expo-dev-client.sh` (1-203) — FORCE_EAS_BUILD, E2E_SEED_APP_PATH, provenance
- `docs/ci/macos-e2e-runner.md` (1-120) — operator runbook
- `.tmp/maestro-reference-flow/failed-this-cycle/coldboot-launch.err` (all) — this-cycle crash next_input_needed
- `.e2e/maestro/reference-flow.yaml` (1-40) — dev client interstitials

## Guardrails

### WRITE-ALLOWED
- scripts/e2e/probe-expo-dev-client-prereqs.sh (NEW)
- scripts/e2e/build-expo-dev-client.sh (MODIFY)
- tests/integration/sprint20-expo-dev-client-rebuild.test.ts (NEW)
- docs/ci/macos-e2e-runner.md (MODIFY)
- .tmp/e2e/expo-dev-client/** (runtime)
- app/** only if crash-diagnosis proves JS/native fix needed (hand to react-native-ui-implementer)

### WRITE-PROHIBITED
- scripts/e2e/capstone-verdict.sh hardcode green
- .tmp/maestro-reference-flow-official11/** promote-to-live
- .github/workflows/ci-e2e.yml
- commit binary holocron.app or Expo tokens

## Design

- **References:** scripts/e2e/build-expo-dev-client.sh, D03-02, docs/ci/macos-e2e-runner.md
- **Note:** GATE-FIX-G2 depends on this .app
- **Note:** Do not claim Maestro green here
- **Pattern:** FORCE_EAS_BUILD=1 build-expo-dev-client.sh → method=eas provenance → simctl install
- **Pattern source:** scripts/e2e/build-expo-dev-client.sh
- **Anti-pattern:** E2E_SEED_APP_PATH=D03-02 crashing app claimed as rebuild

## Verification Gates

- **AC-1 probe:** `PLATFORM_IT=1 pnpm vitest run tests/integration/sprint20-expo-dev-client-rebuild.test.ts -t 'AC-1'` → Exit 0
- **AC-2 rebuild:** `FORCE_EAS_BUILD=1 env -u E2E_SEED_APP_PATH scripts/e2e/build-expo-dev-client.sh && jq -e '.method=="eas" or .method=="eas-local"' .tmp/e2e/expo-dev-client/build-provenance.json` → Exit 0
- **AC-3 install:** `xcrun simctl install "${MAESTRO_DEVICE}" "${EXPO_DEV_BUILD_PATH:-.tmp/e2e/expo-dev-client/holocron.app}"` → Exit 0

## Agent Assignment

- **Implementer:** devops-engineer — Owns scripts/e2e/build-expo-dev-client.sh and simulator install; pairs with react-native-ui-implementer only if crash is JS/native after rebuild.
- **Proposed by:** devops-engineer

## Dependencies

- **Depends on:** D03-02, D03-03
- **Blocks:** GATE-FIX-G2, human-gate-step-1
- **External blockers:**
  - eas-cli install
  - eas login / EXPO_TOKEN
  - Xcode + simctl

## Coding Standards

- RULES.md
- brain/docs/RED-FIRST-TEST-GATE.md
- brain/docs/kanban/SCENARIO-CONTRACT-V1.md

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "GATE-FIX-G1",
  "tdd_mode": "red_first",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": true,
    "requires_seeded_evidence": true
  },
  "fixtures": {
    "eas_cli_missing_or_unauthenticated": {
      "description": "Host without eas or Expo credentials.",
      "seed_method": "cli",
      "records": [
        "command -v eas fails OR eas whoami non-zero",
        "FORCE_EAS_BUILD=1",
        "E2E_SEED_APP_PATH unset"
      ]
    },
    "crashing_seed_app_present": {
      "description": "Known-crashing D03-02 holocron.app with method=reuse-existing.",
      "seed_method": "cli",
      "records": [
        "test -d .worktrees/D03-02/.tmp/e2e/expo-dev-client/holocron.app",
        "failed-this-cycle junit failures=1"
      ]
    },
    "named_simulator_available": {
      "description": "iPhone 17 available via simctl.",
      "seed_method": "cli",
      "records": [
        "xcrun simctl list devices available | grep iPhone 17"
      ]
    },
    "eas_authenticated_rebuild_ready": {
      "description": "eas resolvable and authenticated.",
      "seed_method": "cli",
      "records": [
        "eas whoami or EXPO_TOKEN",
        "FORCE_EAS_BUILD=1"
      ]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "primary": true,
      "description": "GIVEN eas missing or Expo credentials absent and E2E_SEED_APP_PATH unset WHEN operator runs probe-expo-dev-client-prereqs.sh --check and/or FORCE_EAS_BUILD rebuild THEN exit non-zero; JSON ok:false; next_input_needed names eas install/login; no silent crashing-seed greenwash",
      "verify": "PLATFORM_IT=1 pnpm vitest run tests/integration/sprint20-expo-dev-client-rebuild.test.ts -t 'AC-1'",
      "maps_to_ac": null,
      "test_tier": "integration",
      "verification_service": "scripts/e2e/probe-expo-dev-client-prereqs.sh + build-expo-dev-client.sh",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "scripts/e2e/probe-expo-dev-client-prereqs.sh + build-expo-dev-client.sh",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "stub",
            "empty",
            "mock",
            "static",
            "skip-to-green",
            "silent seed of crashing app"
          ]
        },
        "evidence": {
          "artifact_type": "file_artifact",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "eas_cli_missing_or_unauthenticated",
            "action": {
              "actor": "operator",
              "steps": [
                "Unset E2E_SEED_APP_PATH and EXPO_TOKEN",
                "Run probe --check",
                "Optionally FORCE_EAS_BUILD rebuild"
              ]
            },
            "end_state": {
              "must_observe": [
                "exitCode != 0",
                "ok: false",
                "next_input_needed contains \"eas\""
              ],
              "must_not_observe": [
                "exitCode 0",
                "skip-to-green",
                "method reuse-existing treated as eas rebuild"
              ]
            }
          }
        ],
        "id": "AC-1"
      }
    },
    {
      "id": "AC-2",
      "type": "acceptance_criterion",
      "primary": false,
      "description": "GIVEN eas is authenticated WHEN FORCE_EAS_BUILD=1 E2E_SEED_APP_PATH= scripts/e2e/build-expo-dev-client.sh THEN exit 0; valid holocron.app with Info.plist; build-provenance method eas or eas-local; not D03-02 reuse-existing sole evidence",
      "verify": "PLATFORM_IT=1 pnpm vitest run tests/integration/sprint20-expo-dev-client-rebuild.test.ts -t 'AC-2'",
      "maps_to_ac": null,
      "test_tier": "integration",
      "verification_service": "scripts/e2e/build-expo-dev-client.sh + jq",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "scripts/e2e/build-expo-dev-client.sh + jq",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "stub",
            "empty",
            "mock",
            "static",
            "reuse-existing false pass"
          ]
        },
        "evidence": {
          "artifact_type": "file_artifact",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "eas_authenticated_rebuild_ready",
            "action": {
              "actor": "operator",
              "steps": [
                "export FORCE_EAS_BUILD=1",
                "Run build-expo-dev-client.sh",
                "Inspect provenance + Info.plist"
              ]
            },
            "end_state": {
              "must_observe": [
                "exitCode: 0",
                "Info.plist exists: true",
                "method: \"eas\""
              ],
              "must_not_observe": [
                "method reuse-existing",
                "empty app bundle"
              ]
            }
          }
        ],
        "id": "AC-2"
      }
    },
    {
      "id": "AC-3",
      "type": "acceptance_criterion",
      "primary": false,
      "description": "GIVEN AC-2 produced EXPO_DEV_BUILD_PATH and MAESTRO_DEVICE available WHEN simctl uninstall/install of the new .app THEN install exit 0; installed path is the rebuilt app",
      "verify": "PLATFORM_IT=1 pnpm vitest run tests/integration/sprint20-expo-dev-client-rebuild.test.ts -t 'AC-3'",
      "maps_to_ac": null,
      "test_tier": "integration",
      "verification_service": "xcrun simctl + named iOS Simulator",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "xcrun simctl + named iOS Simulator",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "disconnect",
            "stub",
            "empty",
            "mock",
            "static",
            "missing simulator"
          ]
        },
        "evidence": {
          "artifact_type": "file_artifact",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "named_simulator_available",
            "action": {
              "actor": "operator",
              "steps": [
                "Boot MAESTRO_DEVICE if needed",
                "simctl install EXPO_DEV_BUILD_PATH"
              ]
            },
            "end_state": {
              "must_observe": [
                "simctl install exitCode: 0",
                "installed_path == EXPO_DEV_BUILD_PATH"
              ],
              "must_not_observe": [
                "install failed",
                "EXPO_DEV_BUILD_PATH unset",
                "empty/start signature: (0) or exitCode: 0 false pass"
              ]
            }
          }
        ],
        "id": "AC-3"
      }
    },
    {
      "id": "AC-4",
      "type": "acceptance_criterion",
      "primary": false,
      "description": "GIVEN crashing D03-02 seed with method=reuse-existing exists WHEN rebuild honesty tests + diagnosis write THEN tests fail if only reuse-existing seed counts as rebuild; crash-diagnosis.md names root-cause class",
      "verify": "PLATFORM_IT=1 pnpm vitest run tests/integration/sprint20-expo-dev-client-rebuild.test.ts -t 'AC-4' && test -s .tmp/e2e/expo-dev-client/crash-diagnosis.md",
      "maps_to_ac": null,
      "test_tier": "integration",
      "verification_service": "vitest + build-provenance + failed-this-cycle evidence",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "vitest + build-provenance + failed-this-cycle evidence",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "stub",
            "empty",
            "mock",
            "static",
            "reuse-existing counted as eas rebuild"
          ]
        },
        "evidence": {
          "artifact_type": "file_artifact",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "crashing_seed_app_present",
            "action": {
              "actor": "operator",
              "steps": [
                "Read reuse-existing provenance",
                "Assert rebuild AC fails closed until method=eas",
                "Write crash-diagnosis.md"
              ]
            },
            "end_state": {
              "must_observe": [
                "method != \"eas\" rejected",
                "crash-diagnosis.md bytes > 0",
                "crash-diagnosis contains \"root cause\""
              ],
              "must_not_observe": [
                "pass solely because .app exists",
                "official11 SUCCESS as rebuild proof"
              ]
            }
          }
        ],
        "id": "AC-4"
      }
    },
    {
      "id": "TC-1",
      "type": "test_criterion",
      "description": "probe exits non-zero when eas missing or unauthenticated",
      "verify": "env -u EXPO_TOKEN -u E2E_SEED_APP_PATH PATH=/usr/bin:/bin bash scripts/e2e/probe-expo-dev-client-prereqs.sh --check; test $? -ne 0",
      "maps_to_ac": "AC-1"
    },
    {
      "id": "TC-2",
      "type": "test_criterion",
      "description": "build-provenance method is eas or eas-local after FORCE_EAS_BUILD",
      "verify": "jq -e '.method==\"eas\" or .method==\"eas-local\"' .tmp/e2e/expo-dev-client/build-provenance.json",
      "maps_to_ac": "AC-2"
    },
    {
      "id": "TC-3",
      "type": "test_criterion",
      "description": "simctl install of EXPO_DEV_BUILD_PATH succeeds",
      "verify": "test -d \"$EXPO_DEV_BUILD_PATH\" && xcrun simctl install \"$MAESTRO_DEVICE\" \"$EXPO_DEV_BUILD_PATH\"",
      "maps_to_ac": "AC-3"
    },
    {
      "id": "TC-4",
      "type": "test_criterion",
      "description": "reuse-existing alone fails rebuild honesty + diagnosis exists",
      "verify": "PLATFORM_IT=1 pnpm vitest run tests/integration/sprint20-expo-dev-client-rebuild.test.ts -t 'AC-4' && test -s .tmp/e2e/expo-dev-client/crash-diagnosis.md",
      "maps_to_ac": "AC-4"
    }
  ],
  "touches_capabilities": [
    "CAP-SYNC-01",
    "CAP-CUT-01"
  ],
  "provides": [
    "non-crashing-expo-dev-client-app",
    "eas-build-provenance-json"
  ],
  "consumes": [
    "scripts/e2e/build-expo-dev-client.sh",
    "named iOS Simulator"
  ],
  "boundary_contracts": [
    "operator eas credentials to local holocron.app",
    "installable .app to Maestro lane"
  ],
  "proposed_by": "devops-engineer"
}
-->

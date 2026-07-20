# GATE-FIX-G2 — Prove this-cycle Maestro cold-boot green (junit/screenshot/video/capstone) without historical SUCCESS substitution
> Status: ✅ Completed
> Commit: b493dd91f8b6049be148e9d790c47c07404492d7
> Reviewer: orchestrator-reverify
> Completed: 2026-07-20T02:07:25Z
> Sprint: [Sprint 20 — E2E Maestro Harness and Cold-Boot Reference Flow](./SPRINT.md)
> Agent: react-native-ui-implementer
> Estimate: 210 min
> Type: FEATURE
> Priority: P0
> Proposed by: react-native-ui-planner
> TDD_MODE: red_first · RED_GREEN_REQUIRED: yes · SEEDED_EVIDENCE_REQUIRED: yes
> Human gates: 1, 3, 5
> Source: failing human gates in gate-results.json + sprint-goal-state.json (2026-07-20)

## Outcome

run-maestro-reference-flow.sh --run exits 0; junit failures=0; final.png + reference-flow.mov non-empty; coldboot_gate green; regenerate-sprint-gate steps 1+3 PASS and step 5 PASS only with dual evidence.

**Success state:** E2E_ARTIFACT_DIR junit failures=0; screenshot+video non-empty; capstone green; gate steps 1+3 PASS; honesty tests reject official11 substitution.

## Background

- **Specialist rationale (react-native-ui-planner):** Steps 1 FAIL, 3 PARTIAL, 5 PARTIAL. Need this-cycle Maestro --run junit failures=0 + non-empty screenshot/video + capstone green; NEVER promote official11 SUCCESS.
- **Agent rationale:** Owns RN cold-boot surface and chat testIDs; harness orchestration stays devops-owned scripts.
- **Pairing:** devops-engineer for harness/video/regenerate-sprint-gate Step-5 wiring
- **PRD refs:** UC-SYNC-02, T-SYNC-001, D03-03, D03-07, REDHAT-FIX-H1, human-gate-step-1, human-gate-step-3, human-gate-step-5

## Critical Constraints

### MUST
- MUST run real --run against G1 app with real backends
- MUST produce junit failures=0 + non-empty screenshot/video
- MUST capstone green from those artifacts + live Zero/Postgres

### NEVER
- NEVER copy historical SUCCESS into this-cycle dir
- NEVER weaken fail-closed harness checks
- NEVER mark step3 PASS from Zero-only while junit red

### STRICTLY
- STRICTLY use testIDs chat-screen chat-input-field chat-input-send-button chat-assistant-message
- STRICTLY quarantine prior FAIL under failed-this-cycle/

## Specification

**Objective:** Run fail-closed Maestro against GATE-FIX-G1 .app and prove capstone + gate-results from this-cycle evidence only.

**Success state:** E2E_ARTIFACT_DIR junit failures=0; screenshot+video non-empty; capstone green; gate steps 1+3 PASS; honesty tests reject official11 substitution.

## Acceptance Criteria

### AC-1: This-cycle Maestro --run junit failures=0 [PRIMARY] [PRIMARY]
**GIVEN:** GATE-FIX-G1 app, named simulator, real backends, Metro running
**WHEN:** scripts/e2e/run-maestro-reference-flow.sh --run
**THEN:** exit 0; junit failures=0; final.png and reference-flow.mov non-empty; not official11 promotion
**VERIFY:** `PLATFORM_IT=1 pnpm vitest run tests/integration/sprint20-this-cycle-coldboot.test.ts -t 'AC-1'`
**TEST_TIER:** e2e
**VERIFICATION_SERVICE:** scripts/e2e/run-maestro-reference-flow.sh + iOS Simulator + real backends
**TDD_STATE:** red
**FLOW_REF:** UC-SYNC-02
#### Scenario contract
```json
{
  "tier": "visible",
  "test_tier": "e2e",
  "verification_service": "scripts/e2e/run-maestro-reference-flow.sh + iOS Simulator + real backends",
  "topology": "single-node",
  "negative_control": {
    "would_fail_if": [
      "disconnect",
      "stub",
      "empty",
      "mock",
      "static",
      "historical-success-substitution",
      "app crash",
      "missing-video"
    ]
  },
  "evidence": {
    "artifact_type": "file_artifact",
    "required_capture": true
  },
  "cases": [
    {
      "start_ref": "g1_rebuilt_app_and_backends",
      "action": {
        "actor": "operator",
        "steps": [
          "Confirm Metro running",
          "Set EXPO_DEV_BUILD_PATH from G1",
          "run-maestro-reference-flow.sh --run"
        ]
      },
      "end_state": {
        "must_observe": [
          "exitCode: 0",
          "failures=\"0\"",
          "final.png bytes > 0",
          "reference-flow.mov bytes > 0"
        ],
        "must_not_observe": [
          "App crashed",
          "junit failures=1",
          "official11 as E2E_ARTIFACT_DIR",
          "empty/start signature: (0) or exitCode: 0 false pass"
        ]
      }
    }
  ],
  "id": "inline"
}
```

### AC-2: Capstone green from this-cycle artifacts only
**GIVEN:** AC-1 green artifacts + live Postgres/Zero
**WHEN:** scripts/e2e/capstone-verdict.sh
**THEN:** coldboot_gate green; junit_failures 0; evidence sha256s; zero_agent_content_len>=1
**VERIFY:** `scripts/e2e/capstone-verdict.sh && jq -e '.coldboot_gate=="green" and .junit_failures==0' .tmp/maestro-reference-flow/capstone-verdict.json`
**TEST_TIER:** integration
**VERIFICATION_SERVICE:** scripts/e2e/capstone-verdict.sh + Postgres + zero-cache
**TDD_STATE:** red
**FLOW_REF:** UC-SYNC-02
#### Scenario contract
```json
{
  "tier": "visible",
  "test_tier": "e2e",
  "verification_service": "scripts/e2e/capstone-verdict.sh + Postgres + zero-cache",
  "topology": "single-node",
  "negative_control": {
    "would_fail_if": [
      "disconnect",
      "stub",
      "empty",
      "mock",
      "static",
      "hardcoded green",
      "historical-success-substitution"
    ]
  },
  "evidence": {
    "artifact_type": "file_artifact",
    "required_capture": true
  },
  "cases": [
    {
      "start_ref": "this_cycle_green_artifacts",
      "action": {
        "actor": "operator",
        "steps": [
          "Run capstone-verdict.sh",
          "Inspect coldboot_gate and evidence"
        ]
      },
      "end_state": {
        "must_observe": [
          "coldboot_gate: \"green\"",
          "junit_failures: 0",
          "zero_agent_content_len: 1"
        ],
        "must_not_observe": [
          "coldboot_gate red",
          "hardcoded green without evidence",
          "empty/start signature: (0) or exitCode: 0 false pass"
        ]
      }
    }
  ],
  "id": "inline"
}
```

### AC-3: Reject historical official11 SUCCESS as this-cycle green
**GIVEN:** official11 SUCCESS exists and failed-this-cycle red exists
**WHEN:** honesty tests / regenerate policy
**THEN:** tests FAIL if step1 PASS claimed from official11 only; failed-this-cycle remains red under capstone
**VERIFY:** `PLATFORM_IT=1 pnpm vitest run tests/integration/sprint20-this-cycle-coldboot.test.ts -t 'AC-3'`
**TEST_TIER:** integration
**VERIFICATION_SERVICE:** vitest + artifact sha256 honesty checks
**TDD_STATE:** red
**FLOW_REF:** UC-SYNC-02
#### Scenario contract
```json
{
  "tier": "visible",
  "test_tier": "integration",
  "verification_service": "vitest + artifact sha256 honesty checks",
  "topology": "single-node",
  "negative_control": {
    "would_fail_if": [
      "stub",
      "empty",
      "mock",
      "static",
      "historical-success-substitution",
      "skip-to-green"
    ]
  },
  "evidence": {
    "artifact_type": "file_artifact",
    "required_capture": true
  },
  "cases": [
    {
      "start_ref": "historical_official11_success",
      "action": {
        "actor": "operator",
        "steps": [
          "Assert official11-only live dir cannot PASS this-cycle",
          "Capstone against failed-this-cycle stays red"
        ]
      },
      "end_state": {
        "must_observe": [
          "reject_reason contains \"historical\"",
          "coldboot_gate: \"red\" for failed-this-cycle"
        ],
        "must_not_observe": [
          "PASS solely from official11 copy"
        ]
      }
    }
  ],
  "id": "inline"
}
```

### AC-4: regenerate-sprint-gate steps 1 3 5 PASS from this-cycle only
**GIVEN:** AC-1/AC-2 green + PLATFORM_IT harness can run
**WHEN:** PLATFORM_IT harness + regenerate-sprint-gate.sh sprint-20
**THEN:** step1 PASS; step3 PASS; step5 PASS only with suite green + missing-build no-junit (or dual evidence per G6); evidence_path this-cycle
**VERIFY:** `PLATFORM_IT=1 pnpm vitest run tests/integration/sprint20-maestro-harness.test.ts && scripts/e2e/regenerate-sprint-gate.sh sprint-20 && jq -e '[.steps[]|select(.n==1 or .n==3)|.verdict]|all(.=="PASS")' .spec/prds/mk6-migration/tasks/sprint-20-e2e-maestro-harness-and-cold-boot-reference-flow/gate-results.json`
**TEST_TIER:** integration
**VERIFICATION_SERVICE:** regenerate-sprint-gate.sh + PLATFORM_IT harness + this-cycle artifacts
**TDD_STATE:** red
**FLOW_REF:** UC-SYNC-02
#### Scenario contract
```json
{
  "tier": "visible",
  "test_tier": "e2e",
  "verification_service": "regenerate-sprint-gate.sh + PLATFORM_IT harness + this-cycle artifacts",
  "topology": "single-node",
  "negative_control": {
    "would_fail_if": [
      "stub",
      "empty",
      "mock",
      "static",
      "historical-success-substitution",
      "hardcoded PASS"
    ]
  },
  "evidence": {
    "artifact_type": "file_artifact",
    "required_capture": true
  },
  "cases": [
    {
      "start_ref": "this_cycle_green_artifacts",
      "action": {
        "actor": "operator",
        "steps": [
          "Run PLATFORM_IT harness",
          "regenerate-sprint-gate.sh sprint-20",
          "Inspect steps 1,3"
        ]
      },
      "end_state": {
        "must_observe": [
          "step1.verdict: \"PASS\"",
          "step3.verdict: \"PASS\""
        ],
        "must_not_observe": [
          "step1 PASS with failures=1",
          "official11 evidence_path",
          "empty/start signature: (0) or exitCode: 0 false pass"
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
| TC-1 | this-cycle junit failures=0 after --run | AC-1 | happy_path | `python3 -c "import re,sys; t=open('.tmp/maestro-reference-flow/junit.xml').read(); m=re.search(r'failures=\"(\d+)\"', t); sys.exit(0 if m and m.group(1)=='0' else 1)"` |
| TC-2 | capstone coldboot_gate green junit_failures 0 | AC-2 | happy_path | `scripts/e2e/capstone-verdict.sh && jq -e '.coldboot_gate=="green" and .junit_failures==0' .tmp/maestro-reference-flow/capstone-verdict.json` |
| TC-3 | official11 promotion fails honesty tests | AC-3 | error_path | `PLATFORM_IT=1 pnpm vitest run tests/integration/sprint20-this-cycle-coldboot.test.ts -t 'AC-3'` |
| TC-4 | gate-results steps 1 and 3 PASS after regenerate | AC-4 | happy_path | `scripts/e2e/regenerate-sprint-gate.sh sprint-20 && jq -e '[.steps[]|select(.n==1 or .n==3)|.verdict]|all(.=="PASS")' .spec/prds/mk6-migration/tasks/sprint-20-e2e-maestro-harness-and-cold-boot-reference-flow/gate-results.json` |
| TC-5 | missing-build fail-closed still holds | AC-1 | error_path | `PLATFORM_IT=1 pnpm vitest run tests/integration/sprint20-maestro-harness.test.ts -t 'fails closed when the Expo build path is missing'` |

## Reading List

- `.e2e/maestro/reference-flow.yaml` (1-100) — REQUIRED cold-boot interstitials + chat testIDs
- `scripts/e2e/run-maestro-reference-flow.sh` (1-148) — reset/zero/install/video
- `scripts/e2e/capstone-verdict.sh` (1-120) — green derivation
- `app/(drawer)/chat/reference.tsx` (1-140) — chat-screen Zero path
- `components/chat/ChatInput.tsx` (320-370) — chat-input testIDs

## Guardrails

### WRITE-ALLOWED
- .e2e/maestro/reference-flow.yaml (MODIFY only if real interstitial timing needs fix)
- app/(drawer)/chat/reference.tsx
- components/chat/ChatInput.tsx
- app/_layout.tsx
- app/zero/**
- tests/integration/sprint20-this-cycle-coldboot.test.ts (NEW)
- scripts/e2e/regenerate-sprint-gate.sh (MODIFY step honesty)
- .tmp/maestro-reference-flow/** (this-cycle only)
- gate-results.json via regenerate only

### WRITE-PROHIBITED
- Copy official* SUCCESS junit/mov/png into live dir
- Weaken EXPO_DEV_BUILD_PATH fail-closed
- Hardcode coldboot_gate green
- Claim step3 PASS from H5 API-only while junit red

## Design

- **References:** .e2e/maestro/reference-flow.yaml, scripts/e2e/capstone-verdict.sh, SPRINT.md
- **Note:** Depends on GATE-FIX-G1
- **Note:** CI step4 is GATE-FIX-G4
- **Pattern:** harness --run → capstone derives green → regenerate gate
- **Pattern source:** scripts/e2e/run-maestro-reference-flow.sh
- **Anti-pattern:** cp official11/junit.xml into live dir

## Verification Gates

- **Maestro green:** `scripts/e2e/run-maestro-reference-flow.sh --run && rg -q 'failures="0"' .tmp/maestro-reference-flow/junit.xml` → Exit 0
- **Capstone green:** `scripts/e2e/capstone-verdict.sh && jq -e '.coldboot_gate=="green"' .tmp/maestro-reference-flow/capstone-verdict.json` → green
- **Honesty:** `PLATFORM_IT=1 pnpm vitest run tests/integration/sprint20-this-cycle-coldboot.test.ts -t 'AC-3'` → Exit 0

## Agent Assignment

- **Implementer:** react-native-ui-implementer — Owns RN cold-boot surface and chat testIDs; harness orchestration stays devops-owned scripts.
- **Proposed by:** react-native-ui-planner

## Dependencies

- **Depends on:** GATE-FIX-G1, REDHAT-FIX-H1, REDHAT-FIX-H3, S-COLDBOOT-01, S-COLDBOOT-02
- **Blocks:** human-gate-step-1, human-gate-step-3, D03-07-close

## Coding Standards

- RULES.md
- docs/ci/maestro-harness.md
- brain/docs/RED-FIRST-TEST-GATE.md

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "GATE-FIX-G2",
  "tdd_mode": "red_first",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": true,
    "requires_seeded_evidence": true
  },
  "fixtures": {
    "g1_rebuilt_app_and_backends": {
      "description": "GATE-FIX-G1 method=eas app; Metro+backends up.",
      "seed_method": "cli",
      "records": [
        "build-provenance method eas",
        "packager-status:running",
        "DATABASE_URL holocron_nonprod"
      ]
    },
    "this_cycle_failed_junit": {
      "description": "Current failed-this-cycle junit failures=1.",
      "seed_method": "cli",
      "records": [
        ".tmp/maestro-reference-flow/failed-this-cycle/junit.xml"
      ]
    },
    "historical_official11_success": {
      "description": "Historical SUCCESS must not promote.",
      "seed_method": "recorded_external",
      "records": [
        ".tmp/maestro-reference-flow-official11/junit.xml failures=0"
      ]
    },
    "this_cycle_green_artifacts": {
      "description": "Post --run green artifacts.",
      "seed_method": "ui_flow",
      "records": [
        "junit failures=0",
        "final.png >0",
        "reference-flow.mov >0"
      ]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "primary": true,
      "description": "GIVEN GATE-FIX-G1 app, named simulator, real backends, Metro running WHEN scripts/e2e/run-maestro-reference-flow.sh --run THEN exit 0; junit failures=0; final.png and reference-flow.mov non-empty; not official11 promotion",
      "verify": "PLATFORM_IT=1 pnpm vitest run tests/integration/sprint20-this-cycle-coldboot.test.ts -t 'AC-1'",
      "maps_to_ac": null,
      "test_tier": "e2e",
      "verification_service": "scripts/e2e/run-maestro-reference-flow.sh + iOS Simulator + real backends",
      "scenario": {
        "tier": "visible",
        "test_tier": "e2e",
        "verification_service": "scripts/e2e/run-maestro-reference-flow.sh + iOS Simulator + real backends",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "disconnect",
            "stub",
            "empty",
            "mock",
            "static",
            "historical-success-substitution",
            "app crash",
            "missing-video"
          ]
        },
        "evidence": {
          "artifact_type": "file_artifact",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "g1_rebuilt_app_and_backends",
            "action": {
              "actor": "operator",
              "steps": [
                "Confirm Metro running",
                "Set EXPO_DEV_BUILD_PATH from G1",
                "run-maestro-reference-flow.sh --run"
              ]
            },
            "end_state": {
              "must_observe": [
                "exitCode: 0",
                "failures=\"0\"",
                "final.png bytes > 0",
                "reference-flow.mov bytes > 0"
              ],
              "must_not_observe": [
                "App crashed",
                "junit failures=1",
                "official11 as E2E_ARTIFACT_DIR",
                "empty/start signature: (0) or exitCode: 0 false pass"
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
      "description": "GIVEN AC-1 green artifacts + live Postgres/Zero WHEN scripts/e2e/capstone-verdict.sh THEN coldboot_gate green; junit_failures 0; evidence sha256s; zero_agent_content_len>=1",
      "verify": "scripts/e2e/capstone-verdict.sh && jq -e '.coldboot_gate==\"green\" and .junit_failures==0' .tmp/maestro-reference-flow/capstone-verdict.json",
      "maps_to_ac": null,
      "test_tier": "integration",
      "verification_service": "scripts/e2e/capstone-verdict.sh + Postgres + zero-cache",
      "scenario": {
        "tier": "visible",
        "test_tier": "e2e",
        "verification_service": "scripts/e2e/capstone-verdict.sh + Postgres + zero-cache",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "disconnect",
            "stub",
            "empty",
            "mock",
            "static",
            "hardcoded green",
            "historical-success-substitution"
          ]
        },
        "evidence": {
          "artifact_type": "file_artifact",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "this_cycle_green_artifacts",
            "action": {
              "actor": "operator",
              "steps": [
                "Run capstone-verdict.sh",
                "Inspect coldboot_gate and evidence"
              ]
            },
            "end_state": {
              "must_observe": [
                "coldboot_gate: \"green\"",
                "junit_failures: 0",
                "zero_agent_content_len: 1"
              ],
              "must_not_observe": [
                "coldboot_gate red",
                "hardcoded green without evidence",
                "empty/start signature: (0) or exitCode: 0 false pass"
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
      "description": "GIVEN official11 SUCCESS exists and failed-this-cycle red exists WHEN honesty tests / regenerate policy THEN tests FAIL if step1 PASS claimed from official11 only; failed-this-cycle remains red under capstone",
      "verify": "PLATFORM_IT=1 pnpm vitest run tests/integration/sprint20-this-cycle-coldboot.test.ts -t 'AC-3'",
      "maps_to_ac": null,
      "test_tier": "integration",
      "verification_service": "vitest + artifact sha256 honesty checks",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "vitest + artifact sha256 honesty checks",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "stub",
            "empty",
            "mock",
            "static",
            "historical-success-substitution",
            "skip-to-green"
          ]
        },
        "evidence": {
          "artifact_type": "file_artifact",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "historical_official11_success",
            "action": {
              "actor": "operator",
              "steps": [
                "Assert official11-only live dir cannot PASS this-cycle",
                "Capstone against failed-this-cycle stays red"
              ]
            },
            "end_state": {
              "must_observe": [
                "reject_reason contains \"historical\"",
                "coldboot_gate: \"red\" for failed-this-cycle"
              ],
              "must_not_observe": [
                "PASS solely from official11 copy"
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
      "description": "GIVEN AC-1/AC-2 green + PLATFORM_IT harness can run WHEN PLATFORM_IT harness + regenerate-sprint-gate.sh sprint-20 THEN step1 PASS; step3 PASS; step5 PASS only with suite green + missing-build no-junit (or dual evidence per G6); evidence_path this-cycle",
      "verify": "PLATFORM_IT=1 pnpm vitest run tests/integration/sprint20-maestro-harness.test.ts && scripts/e2e/regenerate-sprint-gate.sh sprint-20 && jq -e '[.steps[]|select(.n==1 or .n==3)|.verdict]|all(.==\"PASS\")' .spec/prds/mk6-migration/tasks/sprint-20-e2e-maestro-harness-and-cold-boot-reference-flow/gate-results.json",
      "maps_to_ac": null,
      "test_tier": "integration",
      "verification_service": "regenerate-sprint-gate.sh + PLATFORM_IT harness + this-cycle artifacts",
      "scenario": {
        "tier": "visible",
        "test_tier": "e2e",
        "verification_service": "regenerate-sprint-gate.sh + PLATFORM_IT harness + this-cycle artifacts",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "stub",
            "empty",
            "mock",
            "static",
            "historical-success-substitution",
            "hardcoded PASS"
          ]
        },
        "evidence": {
          "artifact_type": "file_artifact",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "this_cycle_green_artifacts",
            "action": {
              "actor": "operator",
              "steps": [
                "Run PLATFORM_IT harness",
                "regenerate-sprint-gate.sh sprint-20",
                "Inspect steps 1,3"
              ]
            },
            "end_state": {
              "must_observe": [
                "step1.verdict: \"PASS\"",
                "step3.verdict: \"PASS\""
              ],
              "must_not_observe": [
                "step1 PASS with failures=1",
                "official11 evidence_path",
                "empty/start signature: (0) or exitCode: 0 false pass"
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
      "description": "this-cycle junit failures=0 after --run",
      "verify": "python3 -c \"import re,sys; t=open('.tmp/maestro-reference-flow/junit.xml').read(); m=re.search(r'failures=\\\"(\\d+)\\\"', t); sys.exit(0 if m and m.group(1)=='0' else 1)\"",
      "maps_to_ac": "AC-1"
    },
    {
      "id": "TC-2",
      "type": "test_criterion",
      "description": "capstone coldboot_gate green junit_failures 0",
      "verify": "scripts/e2e/capstone-verdict.sh && jq -e '.coldboot_gate==\"green\" and .junit_failures==0' .tmp/maestro-reference-flow/capstone-verdict.json",
      "maps_to_ac": "AC-2"
    },
    {
      "id": "TC-3",
      "type": "test_criterion",
      "description": "official11 promotion fails honesty tests",
      "verify": "PLATFORM_IT=1 pnpm vitest run tests/integration/sprint20-this-cycle-coldboot.test.ts -t 'AC-3'",
      "maps_to_ac": "AC-3"
    },
    {
      "id": "TC-4",
      "type": "test_criterion",
      "description": "gate-results steps 1 and 3 PASS after regenerate",
      "verify": "scripts/e2e/regenerate-sprint-gate.sh sprint-20 && jq -e '[.steps[]|select(.n==1 or .n==3)|.verdict]|all(.==\"PASS\")' .spec/prds/mk6-migration/tasks/sprint-20-e2e-maestro-harness-and-cold-boot-reference-flow/gate-results.json",
      "maps_to_ac": "AC-4"
    },
    {
      "id": "TC-5",
      "type": "test_criterion",
      "description": "missing-build fail-closed still holds",
      "verify": "PLATFORM_IT=1 pnpm vitest run tests/integration/sprint20-maestro-harness.test.ts -t 'fails closed when the Expo build path is missing'",
      "maps_to_ac": "AC-1"
    }
  ],
  "touches_capabilities": [
    "CAP-SYNC-01",
    "CAP-CUT-01"
  ],
  "provides": [
    "this-cycle-green-maestro-artifacts",
    "capstone-coldboot-green"
  ],
  "consumes": [
    "GATE-FIX-G1 holocron.app",
    "live zero-cache",
    "fleet",
    "platform"
  ],
  "boundary_contracts": [
    "Maestro junit to step1",
    "Postgres+Zero+screenshot to step3"
  ],
  "proposed_by": "react-native-ui-planner"
}
-->

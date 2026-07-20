# GATE-FIX-G6 — RED: Human Gate Step-5 PASS only with PLATFORM_IT suite green AND missing-build --run no junit.xml
> Status: ✅ Completed
> Commit: ed410422faed208772ca7b08c3cb5464c461d7da
> Reviewer: code-reviewer
> Completed: 2026-07-20T01:45:48Z
> Sprint: [Sprint 20 — E2E Maestro Harness and Cold-Boot Reference Flow](./SPRINT.md)
> Agent: devops-engineer
> Estimate: 60 min
> Type: FEATURE
> Priority: P0
> Proposed by: red-test-generator
> TDD_MODE: red_first · RED_GREEN_REQUIRED: yes · SEEDED_EVIDENCE_REQUIRED: yes
> Human gates: 5
> Source: failing human gates in gate-results.json + sprint-goal-state.json (2026-07-20)

## Outcome

Harness suite has --run missing-build no-junit case; regenerate-sprint-gate Step-5 PASS only with dual evidence; otherwise PARTIAL/FAIL.

**Success state:** Dual-evidence Step-5 PASS path exists; file-existence alone remains PARTIAL.

## Background

- **Specialist rationale (red-test-generator):** Step 5 PARTIAL: regenerate-sprint-gate sets PARTIAL when test file exists only. Need dual evidence: PLATFORM_IT suite green + missing-build --run leaves no junit.xml.
- **Agent rationale:** Owns harness fail-closed path and regenerate-sprint-gate Step-5 derivation.
- **PRD refs:** D03-01, D03-07, human-gate-step-5

## Critical Constraints

### MUST
- MUST assert --run missing-build leaves no junit.xml
- MUST make Step-5 PASS only with dual evidence
- MUST keep PLATFORM_IT refuse skip-to-green

### NEVER
- NEVER PASS Step-5 from file existence alone
- NEVER require full Maestro green for Step-5
- NEVER mock harness

### STRICTLY
- STRICTLY additive tests
- STRICTLY real script spawn

## Specification

**Objective:** Machine-derive Step-5 PASS only from real fail-closed suite green + missing-build --run no junit.

**Success state:** Dual-evidence Step-5 PASS path exists; file-existence alone remains PARTIAL.

## Acceptance Criteria

### AC-1: Named missing-build --run leaves no junit.xml [PRIMARY] [PRIMARY]
**GIVEN:** PLATFORM_IT=1; EXPO_DEV_BUILD_PATH empty; fresh E2E_ARTIFACT_DIR
**WHEN:** spawn real run-maestro-reference-flow.sh --run
**THEN:** status != 0; junit.xml absent; stderr names missing build
**VERIFY:** `PLATFORM_IT=1 pnpm vitest run tests/integration/sprint20-maestro-harness.test.ts -t 'GATE-FIX-G6 AC-1'`
**TEST_TIER:** integration
**VERIFICATION_SERVICE:** scripts/e2e/run-maestro-reference-flow.sh --run
**TDD_STATE:** red
**FLOW_REF:** UC-SYNC-02
#### Scenario contract
```json
{
  "tier": "visible",
  "test_tier": "integration",
  "verification_service": "scripts/e2e/run-maestro-reference-flow.sh --run",
  "topology": "single-node",
  "negative_control": {
    "would_fail_if": [
      "missing-build",
      "stub",
      "mock",
      "junit-written-on-preflight-fail"
    ]
  },
  "evidence": {
    "artifact_type": "file_artifact",
    "required_capture": true
  },
  "cases": [
    {
      "start_ref": "missing_expo_build_env",
      "action": {
        "actor": "operator",
        "steps": [
          "Create fresh E2E_ARTIFACT_DIR",
          "Clear EXPO_DEV_BUILD_PATH",
          "Run harness --run"
        ]
      },
      "end_state": {
        "must_observe": [
          "exitCode != 0",
          "existsSync(junit.xml) === false",
          "stderr contains \"EXPO_DEV_BUILD_PATH\""
        ],
        "must_not_observe": [
          "junit.xml present",
          "exitCode: 0",
          "\"ok\":true"
        ]
      }
    }
  ],
  "id": "inline"
}
```

### AC-2: Step-5 PASS requires suite green AND missing-build no-junit [PRIMARY]
**GIVEN:** regenerate-sprint-gate Step-5 derivation
**WHEN:** cases: file-only; suite-only; missing-build-only; dual evidence
**THEN:** A/B/C → PARTIAL/FAIL; D dual → PASS with both evidence paths
**VERIFY:** `PLATFORM_IT=1 pnpm vitest run tests/integration/sprint20-gate-step5-pass-contract.test.ts -t 'GATE-FIX-G6 AC-2'`
**TEST_TIER:** integration
**VERIFICATION_SERVICE:** regenerate-sprint-gate.sh + real evidence files
**TDD_STATE:** red
**FLOW_REF:** UC-SYNC-02
#### Scenario contract
```json
{
  "tier": "visible",
  "test_tier": "integration",
  "verification_service": "regenerate-sprint-gate.sh + real evidence files",
  "topology": "single-node",
  "negative_control": {
    "would_fail_if": [
      "file-existence-only-pass",
      "stub",
      "mock",
      "partial-as-pass"
    ]
  },
  "evidence": {
    "artifact_type": "file_artifact",
    "required_capture": true
  },
  "cases": [
    {
      "start_ref": "current_step5_partial_baseline",
      "action": {
        "actor": "operator",
        "steps": [
          "Stage file-only \u2192 regenerator \u2192 not PASS",
          "Stage dual evidence \u2192 regenerator \u2192 PASS"
        ]
      },
      "end_state": {
        "must_observe": [
          "step5.verdict != \"PASS\"",
          "step5.verdict: \"PASS\"",
          "evidence_path contains suite AND missing-build: true"
        ],
        "must_not_observe": [
          "PASS from file existence alone",
          "empty/start signature: (0) or exitCode: 0 false pass"
        ]
      }
    }
  ],
  "id": "inline"
}
```

### AC-3: Existing PLATFORM_IT fail-closed suite remains green
**GIVEN:** current harness suite cases
**WHEN:** PLATFORM_IT=1 full suite
**THEN:** prior cases still pass; --run case additive
**VERIFY:** `PLATFORM_IT=1 pnpm vitest run tests/integration/sprint20-maestro-harness.test.ts`
**TEST_TIER:** integration
**VERIFICATION_SERVICE:** scripts/e2e/run-maestro-reference-flow.sh
**TDD_STATE:** red
**FLOW_REF:** UC-SYNC-02
#### Scenario contract
```json
{
  "tier": "visible",
  "test_tier": "integration",
  "verification_service": "scripts/e2e/run-maestro-reference-flow.sh",
  "topology": "single-node",
  "negative_control": {
    "would_fail_if": [
      "missing-build",
      "disconnect",
      "stub"
    ]
  },
  "evidence": {
    "artifact_type": "file_artifact",
    "required_capture": true
  },
  "cases": [
    {
      "start_ref": "missing_expo_build_env",
      "action": {
        "actor": "operator",
        "steps": [
          "Run full harness suite under PLATFORM_IT=1"
        ]
      },
      "end_state": {
        "must_observe": [
          "suite exitCode: 0",
          "skipped: 0"
        ],
        "must_not_observe": [
          "skip-to-green without PLATFORM_IT"
        ]
      }
    }
  ],
  "id": "inline"
}
```

### AC-4: Missing-build --check no-junit case remains (regression)
**GIVEN:** existing --check missing-build case
**WHEN:** PLATFORM_IT targeted --check case
**THEN:** still passes
**VERIFY:** `PLATFORM_IT=1 pnpm vitest run tests/integration/sprint20-maestro-harness.test.ts -t 'fails closed when the Expo build path is missing'`
**TEST_TIER:** integration
**VERIFICATION_SERVICE:** scripts/e2e/run-maestro-reference-flow.sh --check
**TDD_STATE:** red
**FLOW_REF:** UC-SYNC-02
#### Scenario contract
```json
{
  "tier": "visible",
  "test_tier": "integration",
  "verification_service": "scripts/e2e/run-maestro-reference-flow.sh --check",
  "topology": "single-node",
  "negative_control": {
    "would_fail_if": [
      "stub",
      "mock"
    ]
  },
  "evidence": {
    "artifact_type": "file_artifact",
    "required_capture": true
  },
  "cases": [
    {
      "start_ref": "missing_expo_build_env",
      "action": {
        "actor": "operator",
        "steps": [
          "Run --check missing-build case"
        ]
      },
      "end_state": {
        "must_observe": [
          "test status: passed"
        ],
        "must_not_observe": [
          "case removed",
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
| TC-1 | --run missing-build exits nonzero and no junit | AC-1 | error_path | `PLATFORM_IT=1 pnpm vitest run tests/integration/sprint20-maestro-harness.test.ts -t 'GATE-FIX-G6 AC-1'` |
| TC-2 | Step-5 not PASS when only harness test file exists | AC-2 | error_path | `PLATFORM_IT=1 pnpm vitest run tests/integration/sprint20-gate-step5-pass-contract.test.ts -t 'file-only'` |
| TC-3 | Step-5 PASS only with dual evidence | AC-2 | happy_path | `PLATFORM_IT=1 pnpm vitest run tests/integration/sprint20-gate-step5-pass-contract.test.ts -t 'dual-evidence'` |
| TC-4 | full PLATFORM_IT harness suite still passes | AC-3 | regression | `PLATFORM_IT=1 pnpm vitest run tests/integration/sprint20-maestro-harness.test.ts` |

## Reading List

- `tests/integration/sprint20-maestro-harness.test.ts` (all) — extend with --run missing-build
- `scripts/e2e/run-maestro-reference-flow.sh` (1-120) — when junit is written
- `scripts/e2e/regenerate-sprint-gate.sh` (72-74) — Step-5 PARTIAL only today

## Guardrails

### WRITE-ALLOWED
- tests/integration/sprint20-maestro-harness.test.ts (EXTEND)
- tests/integration/sprint20-gate-step5-pass-contract.test.ts (NEW)
- scripts/e2e/regenerate-sprint-gate.sh (MODIFY Step-5 only)

### WRITE-PROHIBITED
- app/**
- .github/workflows/**
- capstone-verdict.sh (owned by G5)

## Design

- **References:** sprint20-maestro-harness.test.ts, regenerate-sprint-gate.sh
- **Note:** Step-5 is missing-build fail-closed, NOT cold-boot green
- **Note:** G2 may produce suite-green evidence as side effect
- **Pattern:** real harness --run missing-build + dual-evidence Step-5
- **Pattern source:** tests/integration/sprint20-maestro-harness.test.ts
- **Anti-pattern:** s5=PASS when test file exists

## Verification Gates

- **AC-1:** `PLATFORM_IT=1 pnpm vitest run tests/integration/sprint20-maestro-harness.test.ts -t 'GATE-FIX-G6 AC-1'` → Exit 0 after GREEN
- **AC-2:** `PLATFORM_IT=1 pnpm vitest run tests/integration/sprint20-gate-step5-pass-contract.test.ts -t 'GATE-FIX-G6 AC-2'` → Exit 0 after GREEN

## Agent Assignment

- **Implementer:** devops-engineer — Owns harness fail-closed path and regenerate-sprint-gate Step-5 derivation.
- **Proposed by:** red-test-generator

## Dependencies

- **Depends on:** D03-01
- **Blocks:** human-gate-step-5-pass

## Coding Standards

- brain/docs/TDD-METHODOLOGY.md
- brain/docs/kanban/SCENARIO-CONTRACT-V1.md

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "GATE-FIX-G6",
  "tdd_mode": "red_first",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": true,
    "requires_seeded_evidence": true
  },
  "fixtures": {
    "missing_expo_build_env": {
      "description": "EXPO_DEV_BUILD_PATH empty for --run.",
      "seed_method": "cli",
      "records": [
        "EXPO_DEV_BUILD_PATH=",
        "E2E_ARTIFACT_DIR tmp",
        "expect no junit.xml"
      ]
    },
    "platform_it_harness_suite_green_evidence": {
      "description": "Record of PLATFORM_IT harness suite exit 0.",
      "seed_method": "cli",
      "records": [
        ".tmp/maestro-reference-flow/step5-harness-suite.json exit 0"
      ]
    },
    "missing_build_run_evidence": {
      "description": "Artifact dir from missing-build --run with no junit.",
      "seed_method": "cli",
      "records": [
        "junit.xml absent",
        "nonzero exit recorded"
      ]
    },
    "current_step5_partial_baseline": {
      "description": "regenerate-sprint-gate Step-5 PARTIAL on file existence.",
      "seed_method": "cli",
      "records": [
        "s5=PARTIAL on file presence"
      ]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "primary": true,
      "description": "GIVEN PLATFORM_IT=1; EXPO_DEV_BUILD_PATH empty; fresh E2E_ARTIFACT_DIR WHEN spawn real run-maestro-reference-flow.sh --run THEN status != 0; junit.xml absent; stderr names missing build",
      "verify": "PLATFORM_IT=1 pnpm vitest run tests/integration/sprint20-maestro-harness.test.ts -t 'GATE-FIX-G6 AC-1'",
      "maps_to_ac": null,
      "test_tier": "integration",
      "verification_service": "scripts/e2e/run-maestro-reference-flow.sh --run",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "scripts/e2e/run-maestro-reference-flow.sh --run",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "missing-build",
            "stub",
            "mock",
            "junit-written-on-preflight-fail"
          ]
        },
        "evidence": {
          "artifact_type": "file_artifact",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "missing_expo_build_env",
            "action": {
              "actor": "operator",
              "steps": [
                "Create fresh E2E_ARTIFACT_DIR",
                "Clear EXPO_DEV_BUILD_PATH",
                "Run harness --run"
              ]
            },
            "end_state": {
              "must_observe": [
                "exitCode != 0",
                "existsSync(junit.xml) === false",
                "stderr contains \"EXPO_DEV_BUILD_PATH\""
              ],
              "must_not_observe": [
                "junit.xml present",
                "exitCode: 0",
                "\"ok\":true"
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
      "description": "GIVEN regenerate-sprint-gate Step-5 derivation WHEN cases: file-only; suite-only; missing-build-only; dual evidence THEN A/B/C \u2192 PARTIAL/FAIL; D dual \u2192 PASS with both evidence paths",
      "verify": "PLATFORM_IT=1 pnpm vitest run tests/integration/sprint20-gate-step5-pass-contract.test.ts -t 'GATE-FIX-G6 AC-2'",
      "maps_to_ac": null,
      "test_tier": "integration",
      "verification_service": "regenerate-sprint-gate.sh + real evidence files",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "regenerate-sprint-gate.sh + real evidence files",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "file-existence-only-pass",
            "stub",
            "mock",
            "partial-as-pass"
          ]
        },
        "evidence": {
          "artifact_type": "file_artifact",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "current_step5_partial_baseline",
            "action": {
              "actor": "operator",
              "steps": [
                "Stage file-only \u2192 regenerator \u2192 not PASS",
                "Stage dual evidence \u2192 regenerator \u2192 PASS"
              ]
            },
            "end_state": {
              "must_observe": [
                "step5.verdict != \"PASS\"",
                "step5.verdict: \"PASS\"",
                "evidence_path contains suite AND missing-build: true"
              ],
              "must_not_observe": [
                "PASS from file existence alone",
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
      "description": "GIVEN current harness suite cases WHEN PLATFORM_IT=1 full suite THEN prior cases still pass; --run case additive",
      "verify": "PLATFORM_IT=1 pnpm vitest run tests/integration/sprint20-maestro-harness.test.ts",
      "maps_to_ac": null,
      "test_tier": "integration",
      "verification_service": "scripts/e2e/run-maestro-reference-flow.sh",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "scripts/e2e/run-maestro-reference-flow.sh",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "missing-build",
            "disconnect",
            "stub"
          ]
        },
        "evidence": {
          "artifact_type": "file_artifact",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "missing_expo_build_env",
            "action": {
              "actor": "operator",
              "steps": [
                "Run full harness suite under PLATFORM_IT=1"
              ]
            },
            "end_state": {
              "must_observe": [
                "suite exitCode: 0",
                "skipped: 0"
              ],
              "must_not_observe": [
                "skip-to-green without PLATFORM_IT"
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
      "description": "GIVEN existing --check missing-build case WHEN PLATFORM_IT targeted --check case THEN still passes",
      "verify": "PLATFORM_IT=1 pnpm vitest run tests/integration/sprint20-maestro-harness.test.ts -t 'fails closed when the Expo build path is missing'",
      "maps_to_ac": null,
      "test_tier": "integration",
      "verification_service": "scripts/e2e/run-maestro-reference-flow.sh --check",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "scripts/e2e/run-maestro-reference-flow.sh --check",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "stub",
            "mock"
          ]
        },
        "evidence": {
          "artifact_type": "file_artifact",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "missing_expo_build_env",
            "action": {
              "actor": "operator",
              "steps": [
                "Run --check missing-build case"
              ]
            },
            "end_state": {
              "must_observe": [
                "test status: passed"
              ],
              "must_not_observe": [
                "case removed",
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
      "description": "--run missing-build exits nonzero and no junit",
      "verify": "PLATFORM_IT=1 pnpm vitest run tests/integration/sprint20-maestro-harness.test.ts -t 'GATE-FIX-G6 AC-1'",
      "maps_to_ac": "AC-1"
    },
    {
      "id": "TC-2",
      "type": "test_criterion",
      "description": "Step-5 not PASS when only harness test file exists",
      "verify": "PLATFORM_IT=1 pnpm vitest run tests/integration/sprint20-gate-step5-pass-contract.test.ts -t 'file-only'",
      "maps_to_ac": "AC-2"
    },
    {
      "id": "TC-3",
      "type": "test_criterion",
      "description": "Step-5 PASS only with dual evidence",
      "verify": "PLATFORM_IT=1 pnpm vitest run tests/integration/sprint20-gate-step5-pass-contract.test.ts -t 'dual-evidence'",
      "maps_to_ac": "AC-2"
    },
    {
      "id": "TC-4",
      "type": "test_criterion",
      "description": "full PLATFORM_IT harness suite still passes",
      "verify": "PLATFORM_IT=1 pnpm vitest run tests/integration/sprint20-maestro-harness.test.ts",
      "maps_to_ac": "AC-3"
    }
  ],
  "touches_capabilities": [
    "CAP-SYNC-01"
  ],
  "provides": [
    "step5-dual-evidence-contract",
    "missing-build-run-no-junit-test"
  ],
  "consumes": [
    "run-maestro-reference-flow.sh",
    "regenerate-sprint-gate.sh"
  ],
  "boundary_contracts": [
    "missing-build fail-closed to step5",
    "PLATFORM_IT suite green to step5"
  ],
  "proposed_by": "red-test-generator"
}
-->

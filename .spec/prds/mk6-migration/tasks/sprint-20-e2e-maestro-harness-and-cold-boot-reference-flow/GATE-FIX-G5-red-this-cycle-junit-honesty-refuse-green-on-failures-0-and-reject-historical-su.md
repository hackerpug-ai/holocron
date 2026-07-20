# GATE-FIX-G5 — RED: this-cycle junit honesty — refuse green on failures>0 and reject historical SUCCESS substitution
> Status: Backlog
> Sprint: [Sprint 20 — E2E Maestro Harness and Cold-Boot Reference Flow](./SPRINT.md)
> Agent: devops-engineer
> Estimate: 75 min
> Type: FEATURE
> Priority: P0
> Proposed by: red-test-generator
> TDD_MODE: red_first · RED_GREEN_REQUIRED: yes · SEEDED_EVIDENCE_REQUIRED: yes
> Human gates: 1, 3
> Source: failing human gates in gate-results.json + sprint-goal-state.json (2026-07-20)

## Outcome

Integration tests prove coldboot_gate stays red when junit_failures>0 despite healthy Zero/Postgres; gate step1 refuses official11 SUCCESS substitution when failed-this-cycle exists.

**Success state:** PLATFORM_IT suite covers failures>0+healthy-substrate red and official11 checksum swap rejection.

## Background

- **Specialist rationale (red-test-generator):** Capstone already red with junit_failures=1 while PG/Zero healthy, but integration lock for that combination and historical SUCCESS anti-substitution are missing.
- **Agent rationale:** Owns capstone-verdict.sh and regenerate-sprint-gate honesty contracts.
- **PRD refs:** D03-07, 10-e2e-testing, human-gate-step-1, human-gate-step-3

## Critical Constraints

### MUST
- MUST drive real capstone-verdict.sh
- MUST cover failures>0 + healthy PG/Zero → red
- MUST reject official11 SUCCESS checksum swap for step1 PASS

### NEVER
- NEVER mock verifiers
- NEVER treat official11 as this-cycle green

### STRICTLY
- STRICTLY PLATFORM_IT=1 refuse skip-to-green
- STRICTLY extend existing tests

## Specification

**Objective:** Lock fail-closed honesty for this-cycle green claims.

**Success state:** PLATFORM_IT suite covers failures>0+healthy-substrate red and official11 checksum swap rejection.

## Acceptance Criteria

### AC-1: Capstone refuses green when junit_failures>0 despite healthy PG/Zero [PRIMARY] [PRIMARY]
**GIVEN:** staged dir with failures>=1 junit + non-empty media + healthy holocron_nonprod + live Zero
**WHEN:** capstone-verdict.sh under PLATFORM_IT=1
**THEN:** exit non-zero; coldboot_gate red; junit_failures>=1; reasons name failures; durable health does not flip green
**VERIFY:** `PLATFORM_IT=1 DATABASE_URL="${DATABASE_URL:?}" pnpm vitest run tests/integration/sprint20-capstone-verdict.test.ts -t 'GATE-FIX-G5 AC-1'`
**TEST_TIER:** integration
**VERIFICATION_SERVICE:** scripts/e2e/capstone-verdict.sh + real junit + Postgres + Zero
**TDD_STATE:** red
**FLOW_REF:** UC-SYNC-02
#### Scenario contract
```json
{
  "tier": "visible",
  "test_tier": "integration",
  "verification_service": "scripts/e2e/capstone-verdict.sh + real junit + Postgres + Zero",
  "topology": "single-node",
  "negative_control": {
    "would_fail_if": [
      "stub",
      "mock",
      "hardcoded-pass",
      "historical-success-junit-only",
      "ignore-junit-failures"
    ]
  },
  "evidence": {
    "artifact_type": "file_artifact",
    "required_capture": true
  },
  "cases": [
    {
      "start_ref": "this_cycle_failures_junit",
      "action": {
        "actor": "operator",
        "steps": [
          "Stage failures=1 junit + media",
          "Run capstone-verdict.sh",
          "Parse coldboot_gate"
        ]
      },
      "end_state": {
        "must_observe": [
          "exitCode != 0",
          "coldboot_gate: red",
          "junit_failures >= 1",
          "reasons mention failures or junit"
        ],
        "must_not_observe": [
          "coldboot_gate: green",
          "exitCode: 0"
        ]
      }
    }
  ]
}
```

### AC-2: Reject historical SUCCESS junit substitution for this-cycle Step-1 PASS
**GIVEN:** this-cycle dir has official11 SUCCESS junit copy while failed-this-cycle failures=1 remains
**WHEN:** regenerate-sprint-gate / provenance policy under PLATFORM_IT=1
**THEN:** step1 is not PASS solely from substituted SUCCESS
**VERIFY:** `PLATFORM_IT=1 pnpm vitest run tests/integration/sprint20-gate-regenerator-provenance.test.ts -t 'GATE-FIX-G5 AC-2'`
**TEST_TIER:** integration
**VERIFICATION_SERVICE:** regenerate-sprint-gate.sh + real file sha256
**TDD_STATE:** red
**FLOW_REF:** UC-SYNC-02
#### Scenario contract
```json
{
  "tier": "visible",
  "test_tier": "integration",
  "verification_service": "regenerate-sprint-gate.sh + real file sha256",
  "topology": "single-node",
  "negative_control": {
    "would_fail_if": [
      "historical-success-junit-only",
      "checksum-blind-pass",
      "mock",
      "stub"
    ]
  },
  "evidence": {
    "artifact_type": "file_artifact",
    "required_capture": true
  },
  "cases": [
    {
      "start_ref": "historical_official11_success_junit",
      "action": {
        "actor": "operator",
        "steps": [
          "Copy official11 junit into live dir",
          "Retain failed-this-cycle failures=1",
          "Run regenerator"
        ]
      },
      "end_state": {
        "must_observe": [
          "step1 not PASS from substituted SUCCESS",
          "failed-this-cycle still recognized"
        ],
        "must_not_observe": [
          "step1 PASS solely from official11 copy"
        ]
      }
    }
  ]
}
```

### AC-3: Legitimate failures=0 path still can record junit_failures=0 (not always-red)
**GIVEN:** legitimate failures=0 substrate + healthy durable
**WHEN:** capstone-verdict.sh
**THEN:** junit_failures=0 is necessary green condition; suite not permanently always-red
**VERIFY:** `PLATFORM_IT=1 DATABASE_URL="${DATABASE_URL:?}" pnpm vitest run tests/integration/sprint20-capstone-verdict.test.ts -t 'derives coldboot_gate'`
**TEST_TIER:** integration
**VERIFICATION_SERVICE:** scripts/e2e/capstone-verdict.sh
**TDD_STATE:** red
**FLOW_REF:** UC-SYNC-02
#### Scenario contract
```json
{
  "tier": "visible",
  "test_tier": "integration",
  "verification_service": "scripts/e2e/capstone-verdict.sh",
  "topology": "single-node",
  "negative_control": {
    "would_fail_if": [
      "always-red stub",
      "mock",
      "empty junit"
    ]
  },
  "evidence": {
    "artifact_type": "file_artifact",
    "required_capture": true
  },
  "cases": [
    {
      "start_ref": "healthy_durable_substrate",
      "action": {
        "actor": "operator",
        "steps": [
          "Stage legitimate failures=0 junit",
          "Run capstone"
        ]
      },
      "end_state": {
        "must_observe": [
          "junit_failures: 0 necessary for green",
          "evidence includes junit sha256"
        ],
        "must_not_observe": [
          "coldboot_gate green with junit_failures>0"
        ]
      }
    }
  ]
}
```

### AC-4: Existing empty-junit red case remains (regression)
**GIVEN:** existing capstone suite
**WHEN:** PLATFORM_IT empty-junit case
**THEN:** still passes
**VERIFY:** `PLATFORM_IT=1 DATABASE_URL="${DATABASE_URL:?}" pnpm vitest run tests/integration/sprint20-capstone-verdict.test.ts -t 'empty junit'`
**TEST_TIER:** integration
**VERIFICATION_SERVICE:** scripts/e2e/capstone-verdict.sh
**TDD_STATE:** red
**FLOW_REF:** UC-SYNC-02
#### Scenario contract
```json
{
  "tier": "visible",
  "test_tier": "integration",
  "verification_service": "scripts/e2e/capstone-verdict.sh",
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
      "start_ref": "this_cycle_failures_junit",
      "action": {
        "actor": "operator",
        "steps": [
          "Run empty-junit red regression"
        ]
      },
      "end_state": {
        "must_observe": [
          "test passes after suite still includes empty-junit red"
        ],
        "must_not_observe": [
          "regression removed"
        ]
      }
    }
  ]
}
```

## Test Criteria

| ID | Statement | Maps to | Type | Verify |
|----|-----------|---------|------|--------|
| TC-1 | capstone red when failures=1 + healthy PG/Zero | AC-1 | error_path | `PLATFORM_IT=1 DATABASE_URL="${DATABASE_URL:?}" pnpm vitest run tests/integration/sprint20-capstone-verdict.test.ts -t 'GATE-FIX-G5 AC-1'` |
| TC-2 | historical SUCCESS cannot force step1 PASS with failed-this-cycle present | AC-2 | error_path | `PLATFORM_IT=1 pnpm vitest run tests/integration/sprint20-gate-regenerator-provenance.test.ts -t 'GATE-FIX-G5 AC-2'` |
| TC-3 | legitimate green path still possible | AC-3 | happy_path | `PLATFORM_IT=1 DATABASE_URL="${DATABASE_URL:?}" pnpm vitest run tests/integration/sprint20-capstone-verdict.test.ts -t 'derives coldboot_gate'` |
| TC-4 | empty-junit red regression holds | AC-4 | regression | `PLATFORM_IT=1 DATABASE_URL="${DATABASE_URL:?}" pnpm vitest run tests/integration/sprint20-capstone-verdict.test.ts -t 'empty junit'` |

## Reading List

- `scripts/e2e/capstone-verdict.sh` (74-193) — junit_failures parse
- `scripts/e2e/regenerate-sprint-gate.sh` (30-40) — step1 derivation
- `tests/integration/sprint20-capstone-verdict.test.ts` (all) — extend
- `.tmp/maestro-reference-flow/failed-this-cycle/junit.xml` (all) — this-cycle crash junit

## Guardrails

### WRITE-ALLOWED
- tests/integration/sprint20-capstone-verdict.test.ts (EXTEND)
- tests/integration/sprint20-gate-regenerator-provenance.test.ts (NEW)
- scripts/e2e/regenerate-sprint-gate.sh (MODIFY step1 honesty only if required)

### WRITE-PROHIBITED
- app/**
- .github/workflows/**
- services/platform/src/**

## Design

- **References:** capstone-verdict.sh, regenerate-sprint-gate.sh, sprint20-capstone-verdict.test.ts
- **Note:** Does not fix app crash; locks honesty
- **Note:** Works with G2
- **Pattern:** stage real junit fixtures → exec real scripts → assert JSON
- **Pattern source:** tests/integration/sprint20-capstone-verdict.test.ts
- **Anti-pattern:** mocking capstone; treating official11 as this-cycle green

## Verification Gates

- **AC-1:** `PLATFORM_IT=1 DATABASE_URL="${DATABASE_URL:?}" pnpm vitest run tests/integration/sprint20-capstone-verdict.test.ts -t 'GATE-FIX-G5 AC-1'` → Exit 0 after GREEN
- **AC-2:** `PLATFORM_IT=1 pnpm vitest run tests/integration/sprint20-gate-regenerator-provenance.test.ts -t 'GATE-FIX-G5 AC-2'` → Exit 0 after GREEN

## Agent Assignment

- **Implementer:** devops-engineer — Owns capstone-verdict.sh and regenerate-sprint-gate honesty contracts.
- **Proposed by:** red-test-generator

## Dependencies

- **Depends on:** REDHAT-FIX-H1
- **Blocks:** human-gate-step-1-green, human-gate-step-3-green

## Coding Standards

- brain/docs/TDD-METHODOLOGY.md
- brain/docs/kanban/SCENARIO-CONTRACT-V1.md

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "GATE-FIX-G5",
  "tdd_mode": "red_first",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": true,
    "requires_seeded_evidence": true
  },
  "fixtures": {
    "this_cycle_failures_junit": {
      "description": "failures=1 junit from this-cycle crash.",
      "seed_method": "file_copy",
      "records": [
        ".tmp/maestro-reference-flow/failed-this-cycle/junit.xml",
        "sha256 098862ac\u2026"
      ]
    },
    "historical_official11_success_junit": {
      "description": "official11 SUCCESS junit sha a9eb6f7a\u2026",
      "seed_method": "file_copy",
      "records": [
        ".tmp/maestro-reference-flow-official11/junit.xml"
      ]
    },
    "healthy_durable_substrate": {
      "description": "Live holocron_nonprod agent + zero.",
      "seed_method": "cli",
      "records": [
        "postgres agent count >=1",
        "zero ok"
      ]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "primary": true,
      "description": "GIVEN staged dir with failures>=1 junit + non-empty media + healthy holocron_nonprod + live Zero WHEN capstone-verdict.sh under PLATFORM_IT=1 THEN exit non-zero; coldboot_gate red; junit_failures>=1; reasons name failures; durable health does not flip green",
      "verify": "PLATFORM_IT=1 DATABASE_URL=\"${DATABASE_URL:?}\" pnpm vitest run tests/integration/sprint20-capstone-verdict.test.ts -t 'GATE-FIX-G5 AC-1'",
      "maps_to_ac": null,
      "test_tier": "integration",
      "verification_service": "scripts/e2e/capstone-verdict.sh + real junit + Postgres + Zero",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "scripts/e2e/capstone-verdict.sh + real junit + Postgres + Zero",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "stub",
            "mock",
            "hardcoded-pass",
            "historical-success-junit-only",
            "ignore-junit-failures"
          ]
        },
        "evidence": {
          "artifact_type": "file_artifact",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "this_cycle_failures_junit",
            "action": {
              "actor": "operator",
              "steps": [
                "Stage failures=1 junit + media",
                "Run capstone-verdict.sh",
                "Parse coldboot_gate"
              ]
            },
            "end_state": {
              "must_observe": [
                "exitCode != 0",
                "coldboot_gate: red",
                "junit_failures >= 1",
                "reasons mention failures or junit"
              ],
              "must_not_observe": [
                "coldboot_gate: green",
                "exitCode: 0"
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
      "description": "GIVEN this-cycle dir has official11 SUCCESS junit copy while failed-this-cycle failures=1 remains WHEN regenerate-sprint-gate / provenance policy under PLATFORM_IT=1 THEN step1 is not PASS solely from substituted SUCCESS",
      "verify": "PLATFORM_IT=1 pnpm vitest run tests/integration/sprint20-gate-regenerator-provenance.test.ts -t 'GATE-FIX-G5 AC-2'",
      "maps_to_ac": null,
      "test_tier": "integration",
      "verification_service": "regenerate-sprint-gate.sh + real file sha256",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "regenerate-sprint-gate.sh + real file sha256",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "historical-success-junit-only",
            "checksum-blind-pass",
            "mock",
            "stub"
          ]
        },
        "evidence": {
          "artifact_type": "file_artifact",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "historical_official11_success_junit",
            "action": {
              "actor": "operator",
              "steps": [
                "Copy official11 junit into live dir",
                "Retain failed-this-cycle failures=1",
                "Run regenerator"
              ]
            },
            "end_state": {
              "must_observe": [
                "step1 not PASS from substituted SUCCESS",
                "failed-this-cycle still recognized"
              ],
              "must_not_observe": [
                "step1 PASS solely from official11 copy"
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
      "description": "GIVEN legitimate failures=0 substrate + healthy durable WHEN capstone-verdict.sh THEN junit_failures=0 is necessary green condition; suite not permanently always-red",
      "verify": "PLATFORM_IT=1 DATABASE_URL=\"${DATABASE_URL:?}\" pnpm vitest run tests/integration/sprint20-capstone-verdict.test.ts -t 'derives coldboot_gate'",
      "maps_to_ac": null,
      "test_tier": "integration",
      "verification_service": "scripts/e2e/capstone-verdict.sh",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "scripts/e2e/capstone-verdict.sh",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "always-red stub",
            "mock",
            "empty junit"
          ]
        },
        "evidence": {
          "artifact_type": "file_artifact",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "healthy_durable_substrate",
            "action": {
              "actor": "operator",
              "steps": [
                "Stage legitimate failures=0 junit",
                "Run capstone"
              ]
            },
            "end_state": {
              "must_observe": [
                "junit_failures: 0 necessary for green",
                "evidence includes junit sha256"
              ],
              "must_not_observe": [
                "coldboot_gate green with junit_failures>0"
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
      "description": "GIVEN existing capstone suite WHEN PLATFORM_IT empty-junit case THEN still passes",
      "verify": "PLATFORM_IT=1 DATABASE_URL=\"${DATABASE_URL:?}\" pnpm vitest run tests/integration/sprint20-capstone-verdict.test.ts -t 'empty junit'",
      "maps_to_ac": null,
      "test_tier": "integration",
      "verification_service": "scripts/e2e/capstone-verdict.sh",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "scripts/e2e/capstone-verdict.sh",
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
            "start_ref": "this_cycle_failures_junit",
            "action": {
              "actor": "operator",
              "steps": [
                "Run empty-junit red regression"
              ]
            },
            "end_state": {
              "must_observe": [
                "test passes after suite still includes empty-junit red"
              ],
              "must_not_observe": [
                "regression removed"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "TC-1",
      "type": "test_criterion",
      "description": "capstone red when failures=1 + healthy PG/Zero",
      "verify": "PLATFORM_IT=1 DATABASE_URL=\"${DATABASE_URL:?}\" pnpm vitest run tests/integration/sprint20-capstone-verdict.test.ts -t 'GATE-FIX-G5 AC-1'",
      "maps_to_ac": "AC-1"
    },
    {
      "id": "TC-2",
      "type": "test_criterion",
      "description": "historical SUCCESS cannot force step1 PASS with failed-this-cycle present",
      "verify": "PLATFORM_IT=1 pnpm vitest run tests/integration/sprint20-gate-regenerator-provenance.test.ts -t 'GATE-FIX-G5 AC-2'",
      "maps_to_ac": "AC-2"
    },
    {
      "id": "TC-3",
      "type": "test_criterion",
      "description": "legitimate green path still possible",
      "verify": "PLATFORM_IT=1 DATABASE_URL=\"${DATABASE_URL:?}\" pnpm vitest run tests/integration/sprint20-capstone-verdict.test.ts -t 'derives coldboot_gate'",
      "maps_to_ac": "AC-3"
    },
    {
      "id": "TC-4",
      "type": "test_criterion",
      "description": "empty-junit red regression holds",
      "verify": "PLATFORM_IT=1 DATABASE_URL=\"${DATABASE_URL:?}\" pnpm vitest run tests/integration/sprint20-capstone-verdict.test.ts -t 'empty junit'",
      "maps_to_ac": "AC-4"
    }
  ],
  "touches_capabilities": [
    "CAP-SYNC-01"
  ],
  "provides": [
    "junit-honesty-tests",
    "historical-success-anti-substitution"
  ],
  "consumes": [
    "capstone-verdict.sh",
    "regenerate-sprint-gate.sh"
  ],
  "boundary_contracts": [
    "junit failures to coldboot_gate",
    "this-cycle provenance to step1"
  ],
  "proposed_by": "red-test-generator"
}
-->

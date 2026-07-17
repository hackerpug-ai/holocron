# obs-4 — Deterministic-invariant + threshold CI regression gate with bad-fixture proof
> Status: Backlog
> Sprint: [Sprint 12 — Observability, Telemetry and Eval Gate](../SPRINT.md)
> Agent: mastra-evals-implementer
> Reviewer: mastra-reviewer
> Estimate: 180 min
> Type: FEATURE
> Priority: P0
> Proposed by: mastra-evals-implementer
> TDD_MODE: red_first · RED_GREEN_REQUIRED: yes · SEEDED_EVIDENCE_REQUIRED: yes

## Outcome

Implement holo evals:ci as a fail-closed regression gate combining versioned score thresholds with deterministic invariant scorers.

**Success state:** The deliberately-bad fixture exits non-zero below threshold, known-good exits zero at or above baseline, and deterministic invariant regression fails even when model-graded output appears acceptable.

## Background

- **Specialist rationale:** Owns deterministic invariant enforcement, threshold exit semantics, fixture proof, and CI-facing CLI behavior.
- **Planning rationale:** The sprint gate is only meaningful when both probabilistic regression and deterministic invariant failures block the process with machine-verifiable exit semantics.
- **Capability touchpoints:** CAP-INF-01
- **Provides:** non-zero-threshold-regression-exit; deterministic-invariant-gate; known-good-pass-proof; deliberately-bad-failure-proof; ci-readable-eval-verdict
- **Consumes:** obs-3 versioned datasets and baselines; persisted eval scores; local judge scorer; inference telemetry and trace identity

## Critical Constraints

### MUST

- MUST make threshold and deterministic-invariant failures produce a non-zero process exit.
- MUST run the real local judge and deterministic scorers against committed fixtures before returning a verdict.

### NEVER

- NEVER downgrade a regression to a warning or allow a bad fixture to pass because the judge score is high.
- NEVER fall back to the latest mutable baseline, an absent threshold, or a fabricated score.

### STRICTLY

- STRICTLY preserve version identifiers and failure reasons in machine-readable CI output.

## Specification

**Objective:** Implement holo evals:ci as a fail-closed regression gate combining versioned score thresholds with deterministic invariant scorers.

**Success state:** The deliberately-bad fixture exits non-zero below threshold, known-good exits zero at or above baseline, and deterministic invariant regression fails even when model-graded output appears acceptable.

**Boundary contracts:**
- A score below the configured versioned threshold exits non-zero and blocks the lane
- A known-good score at or above baseline exits zero
- Deterministic invariant failures block independently of judge score
- Missing or invalid dataset, baseline, scorer, or threshold configuration fails closed
- CI output names fixture, dataset version, score, baseline, threshold, and failure reason

## Acceptance Criteria

### AC-1: Bad fixture blocks CI [PRIMARY]
**GIVEN:** The versioned deliberately-bad fixture and regression threshold are available.
**WHEN:** The operator runs holo evals:ci with deliberately-bad.
**THEN:** The command exits non-zero and reports the score below threshold with its dataset and baseline versions.
**VERIFY:** `bun services/platform/src/cli/holo.ts evals:ci --fixture deliberately-bad --json`
**TEST_TIER:** integration
**VERIFICATION_SERVICE:** holo CLI + Postgres + local judge fleet
**FLOW_REF:** UC-PLAT-04
**TDD_STATE:** none
**UNIT_TEST_JUSTIFIED:** null
#### Scenario contract
```json
{
  "tier": "visible",
  "test_tier": "integration",
  "verification_service": "holo CLI + Postgres + local judge fleet",
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
      "start_ref": "gate_fixtures",
      "action": {
        "actor": "operator",
        "steps": [
          "Run the public evals:ci command with deliberately-bad.",
          "Capture stdout, stderr, exit status, and persisted eval verdict."
        ]
      },
      "end_state": {
        "must_observe": [
          "exitCode: 1",
          "score: <0.8",
          "threshold: 0.8",
          "datasetVersion: 'research_v1'",
          "baselineVersion: 'research_v1'",
          "failureReason: 'threshold_regression'"
        ],
        "must_not_observe": [
          "exitCode: 0",
          "verdict: 'passed'",
          "empty failure reason"
        ]
      }
    }
  ]
}
```

### AC-2: Known-good fixture passes CI
**GIVEN:** The versioned known-good fixture scores at or above its baseline.
**WHEN:** The operator runs holo evals:ci with known-good.
**THEN:** The command exits zero and reports a passing versioned verdict.
**VERIFY:** `bun services/platform/src/cli/holo.ts evals:ci --fixture known-good --json`
**TEST_TIER:** integration
**VERIFICATION_SERVICE:** holo CLI + Postgres + local judge fleet
**FLOW_REF:** UC-PLAT-04
**TDD_STATE:** none
**UNIT_TEST_JUSTIFIED:** null
#### Scenario contract
```json
{
  "tier": "visible",
  "test_tier": "integration",
  "verification_service": "holo CLI + Postgres + local judge fleet",
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
      "start_ref": "gate_fixtures",
      "action": {
        "actor": "operator",
        "steps": [
          "Run the public evals:ci command with known-good.",
          "Capture stdout, stderr, exit status, and persisted eval verdict."
        ]
      },
      "end_state": {
        "must_observe": [
          "exitCode: 0",
          "verdict: 'passed'",
          "score: >=0.8",
          "baseline: 0.8",
          "datasetVersion: 'research_v1'"
        ],
        "must_not_observe": [
          "exitCode: 1",
          "empty score",
          "missing baseline"
        ]
      }
    }
  ]
}
```

### AC-3: Deterministic invariant blocks regression
**GIVEN:** The deterministic invariant fixture violates a required evidence or citation rule.
**WHEN:** The operator runs holo evals:ci with deterministic-invariant-regression.
**THEN:** The command exits non-zero and names the deterministic invariant failure independently of judge score.
**VERIFY:** `bun services/platform/src/cli/holo.ts evals:ci --fixture deterministic-invariant-regression --json`
**TEST_TIER:** integration
**VERIFICATION_SERVICE:** holo CLI + Postgres + deterministic scorer
**FLOW_REF:** UC-PLAT-04
**TDD_STATE:** none
**UNIT_TEST_JUSTIFIED:** null
#### Scenario contract
```json
{
  "tier": "visible",
  "test_tier": "integration",
  "verification_service": "holo CLI + Postgres + deterministic scorer",
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
      "start_ref": "invariant_regression",
      "action": {
        "actor": "operator",
        "steps": [
          "Run the public evals:ci command with the deterministic invariant fixture.",
          "Inspect the machine-readable gate result."
        ]
      },
      "end_state": {
        "must_observe": [
          "exitCode: 1",
          "deterministicFailures: >=1",
          "invariantId: 'required-citation'",
          "verdict: 'failed'"
        ],
        "must_not_observe": [
          "deterministicFailures: 0",
          "verdict: 'passed'",
          "empty failure reason"
        ]
      }
    }
  ]
}
```

### AC-4: Invalid gate configuration fails closed
**GIVEN:** The gate configuration lacks a required threshold or references an unknown version.
**WHEN:** The operator runs holo evals:ci with invalid-config.
**THEN:** The command exits non-zero with an explicit configuration error and no pass verdict.
**VERIFY:** `bun services/platform/src/cli/holo.ts evals:ci --fixture invalid-config --json`
**TEST_TIER:** integration
**VERIFICATION_SERVICE:** holo CLI + Postgres
**FLOW_REF:** UC-PLAT-04
**TDD_STATE:** none
**UNIT_TEST_JUSTIFIED:** null
#### Scenario contract
```json
{
  "tier": "visible",
  "test_tier": "integration",
  "verification_service": "holo CLI + Postgres",
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
      "start_ref": "invalid_gate_config",
      "action": {
        "actor": "operator",
        "steps": [
          "Run the public evals:ci command with the invalid configuration fixture.",
          "Capture the exit status and structured error."
        ]
      },
      "end_state": {
        "must_observe": [
          "exitCode: 1",
          "errorCode: 'INVALID_THRESHOLD'",
          "verdict: 'failed'"
        ],
        "must_not_observe": [
          "exitCode: 0",
          "fallback baseline",
          "empty configuration error"
        ]
      }
    }
  ]
}
```

### AC-5: CI output is machine-readable
**GIVEN:** A known-good or deliberately-bad gate run has completed.
**WHEN:** The operator requests JSON output from holo evals:ci.
**THEN:** The result includes fixture, dataset, model, prompt, score, baseline, threshold, verdict, and exit reason fields.
**VERIFY:** `PLATFORM_IT=1 pnpm test -- services/platform/tests/integration/evals-ci-gate.test.ts -t 'machine-readable'`
**TEST_TIER:** integration
**VERIFICATION_SERVICE:** holo CLI + Postgres + local judge fleet
**FLOW_REF:** UC-PLAT-04
**TDD_STATE:** none
**UNIT_TEST_JUSTIFIED:** null
#### Scenario contract
```json
{
  "tier": "visible",
  "test_tier": "integration",
  "verification_service": "holo CLI + Postgres + local judge fleet",
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
    "artifact_type": "api_response",
    "required_capture": true
  },
  "cases": [
    {
      "start_ref": "gate_fixtures",
      "action": {
        "actor": "operator",
        "steps": [
          "Run holo evals:ci with JSON output.",
          "Parse the emitted result and compare it to the persisted eval record."
        ]
      },
      "end_state": {
        "must_observe": [
          "fixture: 'known-good'",
          "datasetVersion: 'research_v1'",
          "modelVersion: 'judge_v1'",
          "promptVersion: 'research-quality_v1'",
          "score: >=0.8",
          "threshold: 0.8",
          "verdict: 'passed'"
        ],
        "must_not_observe": [
          "JSON parse errors",
          "missing version fields",
          "empty persisted eval record"
        ]
      }
    }
  ]
}
```

## Test Criteria

- **TC-1** (maps to AC-1) — The CI command exits non-zero when the deliberately-bad score is below threshold. — VERIFY: `bun services/platform/src/cli/holo.ts evals:ci --fixture deliberately-bad --json`
- **TC-2** (maps to AC-2) — The CI command exits zero when the known-good score is at or above baseline. — VERIFY: `bun services/platform/src/cli/holo.ts evals:ci --fixture known-good --json`
- **TC-3** (maps to AC-3) — The CI command exits non-zero when the deterministic invariant scorer fails. — VERIFY: `bun services/platform/src/cli/holo.ts evals:ci --fixture deterministic-invariant-regression --json`
- **TC-4** (maps to AC-4) — The CI command exits non-zero when the threshold configuration is invalid. — VERIFY: `bun services/platform/src/cli/holo.ts evals:ci --fixture invalid-config --json`
- **TC-5** (maps to AC-5) — The CI JSON result contains the configured threshold when a gate run completes. — VERIFY: `PLATFORM_IT=1 pnpm test -- services/platform/tests/integration/evals-ci-gate.test.ts -t 'machine-readable'`

## Requirement Traceability

```json
[
  {
    "id": "AC-1",
    "type": "acceptance_criterion",
    "description": "GIVEN deliberately-bad and a versioned threshold WHEN evals:ci runs THEN it exits non-zero and reports the below-threshold score.",
    "verify": "bun services/platform/src/cli/holo.ts evals:ci --fixture deliberately-bad --json",
    "maps_to_ac": "AC-1",
    "scenario": {
      "tier": "visible",
      "test_tier": "integration",
      "verification_service": "holo CLI + Postgres + local judge fleet",
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
          "start_ref": "gate_fixtures",
          "action": {
            "actor": "operator",
            "steps": [
              "Run the public evals:ci command with deliberately-bad.",
              "Capture stdout, stderr, exit status, and persisted eval verdict."
            ]
          },
          "end_state": {
            "must_observe": [
              "exitCode: 1",
              "score: <0.8",
              "threshold: 0.8",
              "datasetVersion: 'research_v1'",
              "baselineVersion: 'research_v1'",
              "failureReason: 'threshold_regression'"
            ],
            "must_not_observe": [
              "exitCode: 0",
              "verdict: 'passed'",
              "empty failure reason"
            ]
          }
        }
      ]
    }
  },
  {
    "id": "AC-2",
    "type": "acceptance_criterion",
    "description": "GIVEN known-good at or above baseline WHEN evals:ci runs THEN it exits zero with a passing verdict.",
    "verify": "bun services/platform/src/cli/holo.ts evals:ci --fixture known-good --json",
    "maps_to_ac": "AC-2",
    "scenario": {
      "tier": "visible",
      "test_tier": "integration",
      "verification_service": "holo CLI + Postgres + local judge fleet",
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
          "start_ref": "gate_fixtures",
          "action": {
            "actor": "operator",
            "steps": [
              "Run the public evals:ci command with known-good.",
              "Capture stdout, stderr, exit status, and persisted eval verdict."
            ]
          },
          "end_state": {
            "must_observe": [
              "exitCode: 0",
              "verdict: 'passed'",
              "score: >=0.8",
              "baseline: 0.8",
              "datasetVersion: 'research_v1'"
            ],
            "must_not_observe": [
              "exitCode: 1",
              "empty score",
              "missing baseline"
            ]
          }
        }
      ]
    }
  },
  {
    "id": "AC-3",
    "type": "acceptance_criterion",
    "description": "GIVEN a deterministic invariant failure WHEN evals:ci runs THEN it exits non-zero independently of judge score.",
    "verify": "bun services/platform/src/cli/holo.ts evals:ci --fixture deterministic-invariant-regression --json",
    "maps_to_ac": "AC-3",
    "scenario": {
      "tier": "visible",
      "test_tier": "integration",
      "verification_service": "holo CLI + Postgres + deterministic scorer",
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
          "start_ref": "invariant_regression",
          "action": {
            "actor": "operator",
            "steps": [
              "Run the public evals:ci command with the deterministic invariant fixture.",
              "Inspect the machine-readable gate result."
            ]
          },
          "end_state": {
            "must_observe": [
              "exitCode: 1",
              "deterministicFailures: >=1",
              "invariantId: 'required-citation'",
              "verdict: 'failed'"
            ],
            "must_not_observe": [
              "deterministicFailures: 0",
              "verdict: 'passed'",
              "empty failure reason"
            ]
          }
        }
      ]
    }
  },
  {
    "id": "AC-4",
    "type": "acceptance_criterion",
    "description": "GIVEN invalid gate configuration WHEN evals:ci runs THEN it exits non-zero without a pass verdict.",
    "verify": "bun services/platform/src/cli/holo.ts evals:ci --fixture invalid-config --json",
    "maps_to_ac": "AC-4",
    "scenario": {
      "tier": "visible",
      "test_tier": "integration",
      "verification_service": "holo CLI + Postgres",
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
          "start_ref": "invalid_gate_config",
          "action": {
            "actor": "operator",
            "steps": [
              "Run the public evals:ci command with the invalid configuration fixture.",
              "Capture the exit status and structured error."
            ]
          },
          "end_state": {
            "must_observe": [
              "exitCode: 1",
              "errorCode: 'INVALID_THRESHOLD'",
              "verdict: 'failed'"
            ],
            "must_not_observe": [
              "exitCode: 0",
              "fallback baseline",
              "empty configuration error"
            ]
          }
        }
      ]
    }
  },
  {
    "id": "AC-5",
    "type": "acceptance_criterion",
    "description": "GIVEN a completed gate run WHEN JSON output is requested THEN fixture, versions, score, threshold, verdict, and exit reason are present.",
    "verify": "PLATFORM_IT=1 pnpm test -- services/platform/tests/integration/evals-ci-gate.test.ts -t 'machine-readable'",
    "maps_to_ac": "AC-5",
    "scenario": {
      "tier": "visible",
      "test_tier": "integration",
      "verification_service": "holo CLI + Postgres + local judge fleet",
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
        "artifact_type": "api_response",
        "required_capture": true
      },
      "cases": [
        {
          "start_ref": "gate_fixtures",
          "action": {
            "actor": "operator",
            "steps": [
              "Run holo evals:ci with JSON output.",
              "Parse the emitted result and compare it to the persisted eval record."
            ]
          },
          "end_state": {
            "must_observe": [
              "fixture: 'known-good'",
              "datasetVersion: 'research_v1'",
              "modelVersion: 'judge_v1'",
              "promptVersion: 'research-quality_v1'",
              "score: >=0.8",
              "threshold: 0.8",
              "verdict: 'passed'"
            ],
            "must_not_observe": [
              "JSON parse errors",
              "missing version fields",
              "empty persisted eval record"
            ]
          }
        }
      ]
    }
  },
  {
    "id": "TC-1",
    "type": "test_criterion",
    "description": "The CI command exits non-zero when the deliberately-bad score is below threshold.",
    "maps_to_ac": "AC-1",
    "verify": "bun services/platform/src/cli/holo.ts evals:ci --fixture deliberately-bad --json",
    "scenario": {
      "tier": "visible",
      "test_tier": "integration",
      "verification_service": "holo CLI + Postgres + local judge fleet",
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
          "start_ref": "gate_fixtures",
          "action": {
            "actor": "operator",
            "steps": [
              "Run the public evals:ci command with deliberately-bad.",
              "Capture stdout, stderr, exit status, and persisted eval verdict."
            ]
          },
          "end_state": {
            "must_observe": [
              "exitCode: 1",
              "score: <0.8",
              "threshold: 0.8",
              "datasetVersion: 'research_v1'",
              "baselineVersion: 'research_v1'",
              "failureReason: 'threshold_regression'"
            ],
            "must_not_observe": [
              "exitCode: 0",
              "verdict: 'passed'",
              "empty failure reason"
            ]
          }
        }
      ]
    }
  },
  {
    "id": "TC-2",
    "type": "test_criterion",
    "description": "The CI command exits zero when the known-good score is at or above baseline.",
    "maps_to_ac": "AC-2",
    "verify": "bun services/platform/src/cli/holo.ts evals:ci --fixture known-good --json",
    "scenario": {
      "tier": "visible",
      "test_tier": "integration",
      "verification_service": "holo CLI + Postgres + local judge fleet",
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
          "start_ref": "gate_fixtures",
          "action": {
            "actor": "operator",
            "steps": [
              "Run the public evals:ci command with known-good.",
              "Capture stdout, stderr, exit status, and persisted eval verdict."
            ]
          },
          "end_state": {
            "must_observe": [
              "exitCode: 0",
              "verdict: 'passed'",
              "score: >=0.8",
              "baseline: 0.8",
              "datasetVersion: 'research_v1'"
            ],
            "must_not_observe": [
              "exitCode: 1",
              "empty score",
              "missing baseline"
            ]
          }
        }
      ]
    }
  },
  {
    "id": "TC-3",
    "type": "test_criterion",
    "description": "The CI command exits non-zero when the deterministic invariant scorer fails.",
    "maps_to_ac": "AC-3",
    "verify": "bun services/platform/src/cli/holo.ts evals:ci --fixture deterministic-invariant-regression --json",
    "scenario": {
      "tier": "visible",
      "test_tier": "integration",
      "verification_service": "holo CLI + Postgres + deterministic scorer",
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
          "start_ref": "invariant_regression",
          "action": {
            "actor": "operator",
            "steps": [
              "Run the public evals:ci command with the deterministic invariant fixture.",
              "Inspect the machine-readable gate result."
            ]
          },
          "end_state": {
            "must_observe": [
              "exitCode: 1",
              "deterministicFailures: >=1",
              "invariantId: 'required-citation'",
              "verdict: 'failed'"
            ],
            "must_not_observe": [
              "deterministicFailures: 0",
              "verdict: 'passed'",
              "empty failure reason"
            ]
          }
        }
      ]
    }
  },
  {
    "id": "TC-4",
    "type": "test_criterion",
    "description": "The CI command exits non-zero when the threshold configuration is invalid.",
    "maps_to_ac": "AC-4",
    "verify": "bun services/platform/src/cli/holo.ts evals:ci --fixture invalid-config --json",
    "scenario": {
      "tier": "visible",
      "test_tier": "integration",
      "verification_service": "holo CLI + Postgres",
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
          "start_ref": "invalid_gate_config",
          "action": {
            "actor": "operator",
            "steps": [
              "Run the public evals:ci command with the invalid configuration fixture.",
              "Capture the exit status and structured error."
            ]
          },
          "end_state": {
            "must_observe": [
              "exitCode: 1",
              "errorCode: 'INVALID_THRESHOLD'",
              "verdict: 'failed'"
            ],
            "must_not_observe": [
              "exitCode: 0",
              "fallback baseline",
              "empty configuration error"
            ]
          }
        }
      ]
    }
  },
  {
    "id": "TC-5",
    "type": "test_criterion",
    "description": "The CI JSON result contains the configured threshold when a gate run completes.",
    "maps_to_ac": "AC-5",
    "verify": "PLATFORM_IT=1 pnpm test -- services/platform/tests/integration/evals-ci-gate.test.ts -t 'machine-readable'",
    "scenario": {
      "tier": "visible",
      "test_tier": "integration",
      "verification_service": "holo CLI + Postgres + local judge fleet",
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
        "artifact_type": "api_response",
        "required_capture": true
      },
      "cases": [
        {
          "start_ref": "gate_fixtures",
          "action": {
            "actor": "operator",
            "steps": [
              "Run holo evals:ci with JSON output.",
              "Parse the emitted result and compare it to the persisted eval record."
            ]
          },
          "end_state": {
            "must_observe": [
              "fixture: 'known-good'",
              "datasetVersion: 'research_v1'",
              "modelVersion: 'judge_v1'",
              "promptVersion: 'research-quality_v1'",
              "score: >=0.8",
              "threshold: 0.8",
              "verdict: 'passed'"
            ],
            "must_not_observe": [
              "JSON parse errors",
              "missing version fields",
              "empty persisted eval record"
            ]
          }
        }
      ]
    }
  }
]
```

## Scope and Guardrails

### WRITE-ALLOWED

- services/platform/src/evals/ci-gate.ts (NEW)
- services/platform/src/evals/deterministic-scorers.ts (NEW)
- services/platform/src/evals/index.ts (MODIFY)
- services/platform/src/cli/holo.ts (MODIFY, evals:ci only)
- services/platform/evals/thresholds/research_v1.json (NEW)
- services/platform/evals/fixtures/deterministic-invariant-regression.jsonl (NEW)
- services/platform/evals/fixtures/invalid-config.json (NEW)
- services/platform/tests/integration/evals-ci-gate.test.ts (NEW)

### WRITE-PROHIBITED

- .spec/** — planning artifacts are read-only
- .tmp/** — runtime evidence is generated by tests
- services/platform/src/evals/datasets.ts — consume obs-3 dataset registry
- services/platform/src/evals/persistence.ts — consume obs-3 persistence contract
- services/platform/src/inference/** — no router or budget changes
- services/platform/src/mastra.ts — no observability changes
- app/** and components/** — no client changes
- any file not explicitly listed above

## Reading List

1. **services/platform/src/cli/holo.ts** (all) — Existing command parsing, JSON output, and non-zero failure patterns.
2. **services/platform/tests/integration/embed-run.test.ts** (all) — Real-service fixture, negative-control, and evidence-artifact conventions.
3. **services/platform/src/cli/__tests__/fixtures/harness.ts** (all) — Real holo subprocess execution and exit-status assertions.
4. **.spec/prds/mk6-migration/10-technical-requirements/10-e2e-testing.md** (21-41) — Determinism seam, real-service mandate, and CI lane rules.
5. **.spec/prds/mk6-migration/10-technical-requirements/11-runtime-contracts.md** (39-47) — Eval constitution and deliberately-bad fixture failure contract.

## Design

```json
{
  "references": [
    "services/platform/src/cli/holo.ts",
    "services/platform/src/cli/__tests__/fixtures/harness.ts",
    "services/platform/tests/integration/embed-run.test.ts",
    ".spec/prds/mk6-migration/10-technical-requirements/10-e2e-testing.md"
  ],
  "interaction_notes": [
    "The CLI owns process exit semantics; persisted eval records own score evidence.",
    "Deterministic invariants run even when judge scoring succeeds.",
    "JSON output must be sufficient for CI artifact parsing and human diagnosis."
  ],
  "pattern": "Follow the existing real subprocess and JSON CLI patterns, returning exit zero only for a complete passing verdict.",
  "pattern_source": "services/platform/src/cli/__tests__/fixtures/harness.ts:35-84",
  "anti_pattern": "Do not print a warning and exit zero, swallow scorer errors, use latest baseline implicitly, or make deterministic checks dependent on judge prose."
}
```

## Code Pattern

The implementation or review must follow the specialist `pattern`, `pattern_source`, and `anti_pattern` recorded in the Design section above.

## Agent Instructions

Implement only the specialist-defined scope as agent `mastra-evals-implementer`. Preserve every MUST, NEVER, STRICTLY, scenario negative control, and public-command evidence requirement. Do not replace real services with mocks, stubs, static fixtures, or warning-only success paths.

**Assignment rationale:** Owns deterministic invariant enforcement, threshold exit semantics, fixture proof, and CI-facing CLI behavior.

## Coding Standards

- `/Users/inference1/Projects/brain/skills/coding-standards/SKILL.md`
- `/Users/inference1/Projects/brain/docs/TDD-METHODOLOGY.md`
- `/Users/inference1/Projects/brain/docs/TESTING-HIERARCHY.md`
- `/Users/inference1/Projects/brain/docs/CAPABILITY-CHAIN-PLANNING.md`

## Orchestrator Verification Protocol

Verification is evidence-gated: run the specialist gates below, then the repository gates. A green result is invalid if the command did not exercise the named real service or if the required seeded scenario/evidence artifact is absent.

- **Bad fixture failure** — `bun services/platform/src/cli/holo.ts evals:ci --fixture deliberately-bad --json` → Non-zero exit with below-threshold score and versioned failure reason.
- **Known-good pass** — `bun services/platform/src/cli/holo.ts evals:ci --fixture known-good --json` → Exit 0 with score at or above baseline.
- **Deterministic invariant failure** — `bun services/platform/src/cli/holo.ts evals:ci --fixture deterministic-invariant-regression --json` → Non-zero exit naming the deterministic invariant.
- **Lint and typecheck** — `pnpm biome check --write --no-errors-on-unmatched --diagnostic-level=error {staged_files} && pnpm tsgo --noEmit` → Both commands exit 0.
- **Full test suite** — `pnpm test` → Exit 0.

**Repository gates:**
- `pnpm biome check --write --no-errors-on-unmatched --diagnostic-level=error {staged_files}`
- `pnpm tsgo --noEmit`
- `pnpm test`

## Agent Assignment

- **Agent:** mastra-evals-implementer
- **Reviewer:** mastra-reviewer
- **Proposed by:** mastra-evals-implementer
- **Estimate:** 180 minutes
- **Sprint:** Sprint 12

## Evidence Gates

- **Bad fixture failure** — `bun services/platform/src/cli/holo.ts evals:ci --fixture deliberately-bad --json` → Non-zero exit with below-threshold score and versioned failure reason.
- **Known-good pass** — `bun services/platform/src/cli/holo.ts evals:ci --fixture known-good --json` → Exit 0 with score at or above baseline.
- **Deterministic invariant failure** — `bun services/platform/src/cli/holo.ts evals:ci --fixture deterministic-invariant-regression --json` → Non-zero exit naming the deterministic invariant.
- **Lint and typecheck** — `pnpm biome check --write --no-errors-on-unmatched --diagnostic-level=error {staged_files} && pnpm tsgo --noEmit` → Both commands exit 0.
- **Full test suite** — `pnpm test` → Exit 0.

## Review Criteria

- Reviewer verifies all acceptance criteria, test criteria, guardrails, scope compliance, real-service evidence, and the requirement contract.

## Dependencies

```json
{
  "depends_on": [
    "obs-3"
  ],
  "blocks": [
    "Sprint 22"
  ],
  "parallel_with": []
}
```

## Notes

- Preserve the task-level requirement contract and all specialist-proposed evidence obligations through implementation and review.

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "obs-4",
  "proposed_by": "mastra-evals-implementer",
  "tdd_mode": "red_first",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": true,
    "requires_seeded_evidence": true
  },
  "fixtures": {
    "gate_fixtures": {
      "description": "Committed known-good and deliberately-bad samples plus the versioned research_v1 baseline and threshold configuration.",
      "seed_method": "cli",
      "entrypoint": "bun services/platform/src/cli/holo.ts evals:ci --fixture known-good",
      "records": [
        "known-good sample",
        "deliberately-bad sample",
        "dataset: research_v1",
        "baseline: 0.8",
        "threshold: 0.8"
      ]
    },
    "invariant_regression": {
      "description": "A committed fixture whose prose may receive a passing judge score but violates a required deterministic evidence or citation invariant.",
      "seed_method": "cli",
      "entrypoint": "bun services/platform/src/cli/holo.ts evals:ci --fixture deterministic-invariant-regression",
      "records": [
        "deterministicFailures: 1",
        "invariantId: required-citation",
        "process exit: 1",
        "judge score: >=0.8"
      ]
    },
    "invalid_gate_config": {
      "description": "A real gate configuration with a missing threshold or unknown dataset version.",
      "seed_method": "migration_fixture",
      "entrypoint": "bun services/platform/src/cli/holo.ts evals:ci --fixture invalid-config",
      "records": [
        "error code: INVALID_THRESHOLD",
        "process exit: 1",
        "verdict: failed"
      ]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "description": "GIVEN deliberately-bad and a versioned threshold WHEN evals:ci runs THEN it exits non-zero and reports the below-threshold score.",
      "verify": "bun services/platform/src/cli/holo.ts evals:ci --fixture deliberately-bad --json",
      "maps_to_ac": "AC-1",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "holo CLI + Postgres + local judge fleet",
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
            "start_ref": "gate_fixtures",
            "action": {
              "actor": "operator",
              "steps": [
                "Run the public evals:ci command with deliberately-bad.",
                "Capture stdout, stderr, exit status, and persisted eval verdict."
              ]
            },
            "end_state": {
              "must_observe": [
                "exitCode: 1",
                "score: <0.8",
                "threshold: 0.8",
                "datasetVersion: 'research_v1'",
                "baselineVersion: 'research_v1'",
                "failureReason: 'threshold_regression'"
              ],
              "must_not_observe": [
                "exitCode: 0",
                "verdict: 'passed'",
                "empty failure reason"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-2",
      "type": "acceptance_criterion",
      "description": "GIVEN known-good at or above baseline WHEN evals:ci runs THEN it exits zero with a passing verdict.",
      "verify": "bun services/platform/src/cli/holo.ts evals:ci --fixture known-good --json",
      "maps_to_ac": "AC-2",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "holo CLI + Postgres + local judge fleet",
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
            "start_ref": "gate_fixtures",
            "action": {
              "actor": "operator",
              "steps": [
                "Run the public evals:ci command with known-good.",
                "Capture stdout, stderr, exit status, and persisted eval verdict."
              ]
            },
            "end_state": {
              "must_observe": [
                "exitCode: 0",
                "verdict: 'passed'",
                "score: >=0.8",
                "baseline: 0.8",
                "datasetVersion: 'research_v1'"
              ],
              "must_not_observe": [
                "exitCode: 1",
                "empty score",
                "missing baseline"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-3",
      "type": "acceptance_criterion",
      "description": "GIVEN a deterministic invariant failure WHEN evals:ci runs THEN it exits non-zero independently of judge score.",
      "verify": "bun services/platform/src/cli/holo.ts evals:ci --fixture deterministic-invariant-regression --json",
      "maps_to_ac": "AC-3",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "holo CLI + Postgres + deterministic scorer",
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
            "start_ref": "invariant_regression",
            "action": {
              "actor": "operator",
              "steps": [
                "Run the public evals:ci command with the deterministic invariant fixture.",
                "Inspect the machine-readable gate result."
              ]
            },
            "end_state": {
              "must_observe": [
                "exitCode: 1",
                "deterministicFailures: >=1",
                "invariantId: 'required-citation'",
                "verdict: 'failed'"
              ],
              "must_not_observe": [
                "deterministicFailures: 0",
                "verdict: 'passed'",
                "empty failure reason"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-4",
      "type": "acceptance_criterion",
      "description": "GIVEN invalid gate configuration WHEN evals:ci runs THEN it exits non-zero without a pass verdict.",
      "verify": "bun services/platform/src/cli/holo.ts evals:ci --fixture invalid-config --json",
      "maps_to_ac": "AC-4",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "holo CLI + Postgres",
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
            "start_ref": "invalid_gate_config",
            "action": {
              "actor": "operator",
              "steps": [
                "Run the public evals:ci command with the invalid configuration fixture.",
                "Capture the exit status and structured error."
              ]
            },
            "end_state": {
              "must_observe": [
                "exitCode: 1",
                "errorCode: 'INVALID_THRESHOLD'",
                "verdict: 'failed'"
              ],
              "must_not_observe": [
                "exitCode: 0",
                "fallback baseline",
                "empty configuration error"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-5",
      "type": "acceptance_criterion",
      "description": "GIVEN a completed gate run WHEN JSON output is requested THEN fixture, versions, score, threshold, verdict, and exit reason are present.",
      "verify": "PLATFORM_IT=1 pnpm test -- services/platform/tests/integration/evals-ci-gate.test.ts -t 'machine-readable'",
      "maps_to_ac": "AC-5",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "holo CLI + Postgres + local judge fleet",
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
          "artifact_type": "api_response",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "gate_fixtures",
            "action": {
              "actor": "operator",
              "steps": [
                "Run holo evals:ci with JSON output.",
                "Parse the emitted result and compare it to the persisted eval record."
              ]
            },
            "end_state": {
              "must_observe": [
                "fixture: 'known-good'",
                "datasetVersion: 'research_v1'",
                "modelVersion: 'judge_v1'",
                "promptVersion: 'research-quality_v1'",
                "score: >=0.8",
                "threshold: 0.8",
                "verdict: 'passed'"
              ],
              "must_not_observe": [
                "JSON parse errors",
                "missing version fields",
                "empty persisted eval record"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "TC-1",
      "type": "test_criterion",
      "description": "The CI command exits non-zero when the deliberately-bad score is below threshold.",
      "maps_to_ac": "AC-1",
      "verify": "bun services/platform/src/cli/holo.ts evals:ci --fixture deliberately-bad --json",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "holo CLI + Postgres + local judge fleet",
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
            "start_ref": "gate_fixtures",
            "action": {
              "actor": "operator",
              "steps": [
                "Run the public evals:ci command with deliberately-bad.",
                "Capture stdout, stderr, exit status, and persisted eval verdict."
              ]
            },
            "end_state": {
              "must_observe": [
                "exitCode: 1",
                "score: <0.8",
                "threshold: 0.8",
                "datasetVersion: 'research_v1'",
                "baselineVersion: 'research_v1'",
                "failureReason: 'threshold_regression'"
              ],
              "must_not_observe": [
                "exitCode: 0",
                "verdict: 'passed'",
                "empty failure reason"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "TC-2",
      "type": "test_criterion",
      "description": "The CI command exits zero when the known-good score is at or above baseline.",
      "maps_to_ac": "AC-2",
      "verify": "bun services/platform/src/cli/holo.ts evals:ci --fixture known-good --json",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "holo CLI + Postgres + local judge fleet",
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
            "start_ref": "gate_fixtures",
            "action": {
              "actor": "operator",
              "steps": [
                "Run the public evals:ci command with known-good.",
                "Capture stdout, stderr, exit status, and persisted eval verdict."
              ]
            },
            "end_state": {
              "must_observe": [
                "exitCode: 0",
                "verdict: 'passed'",
                "score: >=0.8",
                "baseline: 0.8",
                "datasetVersion: 'research_v1'"
              ],
              "must_not_observe": [
                "exitCode: 1",
                "empty score",
                "missing baseline"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "TC-3",
      "type": "test_criterion",
      "description": "The CI command exits non-zero when the deterministic invariant scorer fails.",
      "maps_to_ac": "AC-3",
      "verify": "bun services/platform/src/cli/holo.ts evals:ci --fixture deterministic-invariant-regression --json",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "holo CLI + Postgres + deterministic scorer",
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
            "start_ref": "invariant_regression",
            "action": {
              "actor": "operator",
              "steps": [
                "Run the public evals:ci command with the deterministic invariant fixture.",
                "Inspect the machine-readable gate result."
              ]
            },
            "end_state": {
              "must_observe": [
                "exitCode: 1",
                "deterministicFailures: >=1",
                "invariantId: 'required-citation'",
                "verdict: 'failed'"
              ],
              "must_not_observe": [
                "deterministicFailures: 0",
                "verdict: 'passed'",
                "empty failure reason"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "TC-4",
      "type": "test_criterion",
      "description": "The CI command exits non-zero when the threshold configuration is invalid.",
      "maps_to_ac": "AC-4",
      "verify": "bun services/platform/src/cli/holo.ts evals:ci --fixture invalid-config --json",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "holo CLI + Postgres",
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
            "start_ref": "invalid_gate_config",
            "action": {
              "actor": "operator",
              "steps": [
                "Run the public evals:ci command with the invalid configuration fixture.",
                "Capture the exit status and structured error."
              ]
            },
            "end_state": {
              "must_observe": [
                "exitCode: 1",
                "errorCode: 'INVALID_THRESHOLD'",
                "verdict: 'failed'"
              ],
              "must_not_observe": [
                "exitCode: 0",
                "fallback baseline",
                "empty configuration error"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "TC-5",
      "type": "test_criterion",
      "description": "The CI JSON result contains the configured threshold when a gate run completes.",
      "maps_to_ac": "AC-5",
      "verify": "PLATFORM_IT=1 pnpm test -- services/platform/tests/integration/evals-ci-gate.test.ts -t 'machine-readable'",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "holo CLI + Postgres + local judge fleet",
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
          "artifact_type": "api_response",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "gate_fixtures",
            "action": {
              "actor": "operator",
              "steps": [
                "Run holo evals:ci with JSON output.",
                "Parse the emitted result and compare it to the persisted eval record."
              ]
            },
            "end_state": {
              "must_observe": [
                "fixture: 'known-good'",
                "datasetVersion: 'research_v1'",
                "modelVersion: 'judge_v1'",
                "promptVersion: 'research-quality_v1'",
                "score: >=0.8",
                "threshold: 0.8",
                "verdict: 'passed'"
              ],
              "must_not_observe": [
                "JSON parse errors",
                "missing version fields",
                "empty persisted eval record"
              ]
            }
          }
        ]
      }
    }
  ]
}
-->

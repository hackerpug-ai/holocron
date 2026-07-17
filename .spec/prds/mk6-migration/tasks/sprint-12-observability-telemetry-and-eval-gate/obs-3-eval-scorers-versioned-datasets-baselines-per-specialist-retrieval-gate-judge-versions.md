# obs-3 — Eval scorers + versioned datasets/baselines per specialist/retrieval/gate + judge versions
> Status: ✅ Completed
> Commit: 6dd9aca0e8dd9a89d0fb074db12ad8ccc732eba0
> Completed: 2026-07-17T23:47:57Z
> Sprint: [Sprint 12 — Observability, Telemetry and Eval Gate](../SPRINT.md)
> Agent: mastra-evals-implementer
> Estimate: 300 min
> Type: FEATURE
> Priority: P0
> Proposed by: mastra-evals-implementer
> TDD_MODE: red_first · RED_GREEN_REQUIRED: yes · SEEDED_EVIDENCE_REQUIRED: yes

## Outcome

Build the versioned local-judge and deterministic eval substrate with immutable datasets, persisted baselines, and longitudinal drift output.

**Success state:** Known-good and deliberately-bad real fixtures receive persisted versioned scores from the local judge, and holo evals:drift reports longitudinal results with dataset, model, rubric, and prompt versions.

## Background

- **Specialist rationale:** Owns versioned datasets, Mastra 1.x scorers, local judge execution, persisted baselines, and drift replay.
- **Planning rationale:** Versioned eval evidence is required before a regression gate can distinguish a real baseline failure from an untraceable score.
- **Capability touchpoints:** CAP-INF-01
- **Provides:** immutable-versioned-eval-datasets; model-graded-and-deterministic-scorers; versioned-baseline-records; persisted-eval-score-records; longitudinal-drift-query
- **Consumes:** self-hosted Langfuse trace and run identity; Postgres inference telemetry; Fleet Role Manifest judge role; real Mastra 1.x eval APIs

## Critical Constraints

### MUST

- MUST keep datasets immutable and commit-versioned with explicit happy-path, adversarial, and regression tags.
- MUST use createScorer and runEvals from @mastra/core/evals with real Zod schemas and a real local judge role.

### NEVER

- NEVER mutate a published dataset or baseline in place.
- NEVER fabricate a score, use a constant score, or treat a stored single judge score as complete eval evidence.

### STRICTLY

- STRICTLY persist dataset, rubric, scorer, judge model, judge prompt, and baseline versions alongside every score.

## Specification

**Objective:** Build the versioned local-judge and deterministic eval substrate with immutable datasets, persisted baselines, and longitudinal drift output.

**Success state:** Known-good and deliberately-bad real fixtures receive persisted versioned scores from the local judge, and holo evals:drift reports longitudinal results with dataset, model, rubric, and prompt versions.

**Boundary contracts:**
- Committed dataset, rubric, scorer, model, prompt, and baseline versions are persisted with every score
- The judge call uses the local judge role through resolveModel and never silently falls back to a cloud provider
- Deterministic invariant scorers remain independent of judge prose
- Historical score rows are immutable and queryable for drift analysis
- Missing dataset, judge, or version metadata fails closed without writing a fabricated score

## Acceptance Criteria

### AC-1: Known-good local judge score [PRIMARY]
**GIVEN:** The committed known-good fixture, versioned rubric, and local judge role are available.
**WHEN:** The operator runs holo evals:run for known-good.
**THEN:** The local judge returns a score at or above the versioned baseline and the score persists.
**VERIFY:** `bun services/platform/src/cli/holo.ts evals:run --sample known-good --json`
**TEST_TIER:** integration
**VERIFICATION_SERVICE:** Mastra + Postgres + local judge fleet
**FLOW_REF:** UC-PLAT-04
**TDD_STATE:** none
**UNIT_TEST_JUSTIFIED:** null
#### Scenario contract
```json
{
  "tier": "visible",
  "test_tier": "integration",
  "verification_service": "Mastra + Postgres + local judge fleet",
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
    "artifact_type": "db_query",
    "required_capture": true
  },
  "cases": [
    {
      "start_ref": "known_good",
      "action": {
        "actor": "operator",
        "steps": [
          "Run the public evals:run command.",
          "Query the persisted eval score by its run ID."
        ]
      },
      "end_state": {
        "must_observe": [
          "judge score: >=0.8",
          "baseline: 0.8",
          "persisted score rows: 1",
          "dataset: 'research_v1'"
        ],
        "must_not_observe": [
          "empty score rows",
          "empty judge response",
          "constant placeholder score"
        ]
      }
    }
  ]
}
```

### AC-2: Deliberately-bad score is below baseline
**GIVEN:** The committed deliberately-bad fixture and the same versioned rubric are available.
**WHEN:** The operator runs holo evals:run for deliberately-bad.
**THEN:** The local judge persists a score below the configured baseline.
**VERIFY:** `bun services/platform/src/cli/holo.ts evals:run --sample deliberately-bad --json`
**TEST_TIER:** integration
**VERIFICATION_SERVICE:** Mastra + Postgres + local judge fleet
**FLOW_REF:** UC-PLAT-04
**TDD_STATE:** none
**UNIT_TEST_JUSTIFIED:** null
#### Scenario contract
```json
{
  "tier": "visible",
  "test_tier": "integration",
  "verification_service": "Mastra + Postgres + local judge fleet",
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
    "artifact_type": "db_query",
    "required_capture": true
  },
  "cases": [
    {
      "start_ref": "deliberately_bad",
      "action": {
        "actor": "operator",
        "steps": [
          "Run the public evals:run command.",
          "Query the persisted score and baseline versions."
        ]
      },
      "end_state": {
        "must_observe": [
          "judge score: <0.8",
          "baseline: 0.8",
          "persisted score rows: 1",
          "tag: 'adversarial'"
        ],
        "must_not_observe": [
          "empty score rows",
          "score >=0.8",
          "empty score"
        ]
      }
    }
  ]
}
```

### AC-3: Version metadata persists with every score
**GIVEN:** Known-good and deliberately-bad eval runs have completed.
**WHEN:** The operator queries their persisted score records.
**THEN:** Each record includes dataset, rubric, scorer, judge model, judge prompt, and baseline versions.
**VERIFY:** `PLATFORM_IT=1 pnpm test -- services/platform/tests/integration/evals-versioning.test.ts -t 'version metadata'`
**TEST_TIER:** integration
**VERIFICATION_SERVICE:** Postgres + local judge fleet
**FLOW_REF:** UC-PLAT-04
**TDD_STATE:** none
**UNIT_TEST_JUSTIFIED:** null
#### Scenario contract
```json
{
  "tier": "visible",
  "test_tier": "integration",
  "verification_service": "Postgres + local judge fleet",
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
    "artifact_type": "db_query",
    "required_capture": true
  },
  "cases": [
    {
      "start_ref": "versioned_history",
      "action": {
        "actor": "operator",
        "steps": [
          "Run the known-good fixture through the public eval command.",
          "Query the persisted score and version columns."
        ]
      },
      "end_state": {
        "must_observe": [
          "score rows checked: >=2",
          "datasetVersion: 'research_v1'",
          "rubricVersion: 'research-quality_v1'",
          "judgeModelVersion: 'judge_v1'",
          "promptVersion: 'research-quality_v1'",
          "baselineVersion: 'research_v1'"
        ],
        "must_not_observe": [
          "empty score rows",
          "null version fields",
          "empty fixture identity"
        ]
      }
    }
  ]
}
```

### AC-4: Drift output is longitudinal
**GIVEN:** At least two real versioned eval score rows exist for the research dataset.
**WHEN:** The operator runs holo evals:drift.
**THEN:** The command returns longitudinal scores grouped by dataset and carrying model and prompt versions.
**VERIFY:** `bun services/platform/src/cli/holo.ts evals:drift --dataset research_v1 --json`
**TEST_TIER:** integration
**VERIFICATION_SERVICE:** Postgres + holo CLI
**FLOW_REF:** UC-PLAT-04
**TDD_STATE:** none
**UNIT_TEST_JUSTIFIED:** null
#### Scenario contract
```json
{
  "tier": "visible",
  "test_tier": "integration",
  "verification_service": "Postgres + holo CLI",
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
      "start_ref": "versioned_history",
      "action": {
        "actor": "operator",
        "steps": [
          "Complete two real eval runs over the committed dataset.",
          "Run holo evals:drift for research_v1."
        ]
      },
      "end_state": {
        "must_observe": [
          "drift entries: >=2",
          "datasetVersion: 'research_v1'",
          "modelVersion: 'judge_v1'",
          "promptVersion: 'research-quality_v1'"
        ],
        "must_not_observe": [
          "empty score rows",
          "latest score only",
          "empty drift output"
        ]
      }
    }
  ]
}
```

### AC-5: Missing evaluator input fails closed
**GIVEN:** The local judge is unavailable or the requested dataset version does not exist.
**WHEN:** The operator runs the eval command.
**THEN:** The command exits non-zero with an explicit evaluator error and persists no score.
**VERIFY:** `PLATFORM_IT=1 pnpm test -- services/platform/tests/integration/evals-versioning.test.ts -t 'fails closed'`
**TEST_TIER:** integration
**VERIFICATION_SERVICE:** Postgres + local judge fleet
**FLOW_REF:** UC-PLAT-04
**TDD_STATE:** none
**UNIT_TEST_JUSTIFIED:** null
#### Scenario contract
```json
{
  "tier": "visible",
  "test_tier": "integration",
  "verification_service": "Postgres + local judge fleet",
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
      "start_ref": "judge_unavailable",
      "action": {
        "actor": "operator",
        "steps": [
          "Stop the declared judge endpoint or request an unknown dataset version.",
          "Run the public evals:run command."
        ]
      },
      "end_state": {
        "must_observe": [
          "process exit: 1",
          "error code: 'JUDGE_UNAVAILABLE'",
          "score rows: 0"
        ],
        "must_not_observe": [
          "new score rows: 1",
          "score rows: 0",
          "fallback cloud judge",
          "fabricated score"
        ]
      }
    }
  ]
}
```

## Test Criteria

- **TC-1** (maps to AC-1) — A known-good score is persisted when the local judge evaluates the known-good fixture. — VERIFY: `bun services/platform/src/cli/holo.ts evals:run --sample known-good --json`
- **TC-2** (maps to AC-2) — A deliberately-bad score is below baseline when the local judge evaluates the deliberately-bad fixture. — VERIFY: `bun services/platform/src/cli/holo.ts evals:run --sample deliberately-bad --json`
- **TC-3** (maps to AC-3) — A persisted score contains a dataset version when an eval run completes. — VERIFY: `PLATFORM_IT=1 pnpm test -- services/platform/tests/integration/evals-versioning.test.ts -t 'version metadata'`
- **TC-4** (maps to AC-4) — The drift command returns multiple versioned score entries when two eval runs exist. — VERIFY: `bun services/platform/src/cli/holo.ts evals:drift --dataset research_v1 --json`
- **TC-5** (maps to AC-5) — No score row is persisted when the judge endpoint or dataset version is unavailable. — VERIFY: `PLATFORM_IT=1 pnpm test -- services/platform/tests/integration/evals-versioning.test.ts -t 'fails closed'`

## Requirement Traceability

```json
[
  {
    "id": "AC-1",
    "type": "acceptance_criterion",
    "description": "GIVEN the known-good fixture WHEN evals:run invokes the local judge THEN a score at or above baseline persists.",
    "verify": "bun services/platform/src/cli/holo.ts evals:run --sample known-good --json",
    "maps_to_ac": "AC-1",
    "scenario": {
      "tier": "visible",
      "test_tier": "integration",
      "verification_service": "Mastra + Postgres + local judge fleet",
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
        "artifact_type": "db_query",
        "required_capture": true
      },
      "cases": [
        {
          "start_ref": "known_good",
          "action": {
            "actor": "operator",
            "steps": [
              "Run the public evals:run command.",
              "Query the persisted eval score by its run ID."
            ]
          },
          "end_state": {
            "must_observe": [
              "judge score: >=0.8",
              "baseline: 0.8",
              "persisted score rows: 1",
              "dataset: 'research_v1'"
            ],
            "must_not_observe": [
              "empty score rows",
              "empty judge response",
              "constant placeholder score"
            ]
          }
        }
      ]
    }
  },
  {
    "id": "AC-2",
    "type": "acceptance_criterion",
    "description": "GIVEN the deliberately-bad fixture WHEN evals:run invokes the local judge THEN a score below baseline persists.",
    "verify": "bun services/platform/src/cli/holo.ts evals:run --sample deliberately-bad --json",
    "maps_to_ac": "AC-2",
    "scenario": {
      "tier": "visible",
      "test_tier": "integration",
      "verification_service": "Mastra + Postgres + local judge fleet",
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
        "artifact_type": "db_query",
        "required_capture": true
      },
      "cases": [
        {
          "start_ref": "deliberately_bad",
          "action": {
            "actor": "operator",
            "steps": [
              "Run the public evals:run command.",
              "Query the persisted score and baseline versions."
            ]
          },
          "end_state": {
            "must_observe": [
              "judge score: <0.8",
              "baseline: 0.8",
              "persisted score rows: 1",
              "tag: 'adversarial'"
            ],
            "must_not_observe": [
              "empty score rows",
              "score >=0.8",
              "empty score"
            ]
          }
        }
      ]
    }
  },
  {
    "id": "AC-3",
    "type": "acceptance_criterion",
    "description": "GIVEN completed evals WHEN score records are queried THEN dataset, rubric, scorer, judge model, judge prompt, and baseline versions exist.",
    "verify": "PLATFORM_IT=1 pnpm test -- services/platform/tests/integration/evals-versioning.test.ts -t 'version metadata'",
    "maps_to_ac": "AC-3",
    "scenario": {
      "tier": "visible",
      "test_tier": "integration",
      "verification_service": "Postgres + local judge fleet",
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
        "artifact_type": "db_query",
        "required_capture": true
      },
      "cases": [
        {
          "start_ref": "versioned_history",
          "action": {
            "actor": "operator",
            "steps": [
              "Run the known-good fixture through the public eval command.",
              "Query the persisted score and version columns."
            ]
          },
          "end_state": {
            "must_observe": [
              "score rows checked: >=2",
              "datasetVersion: 'research_v1'",
              "rubricVersion: 'research-quality_v1'",
              "judgeModelVersion: 'judge_v1'",
              "promptVersion: 'research-quality_v1'",
              "baselineVersion: 'research_v1'"
            ],
            "must_not_observe": [
              "empty score rows",
              "null version fields",
              "empty fixture identity"
            ]
          }
        }
      ]
    }
  },
  {
    "id": "AC-4",
    "type": "acceptance_criterion",
    "description": "GIVEN two real versioned score rows WHEN evals:drift runs THEN longitudinal scores include dataset, model, and prompt versions.",
    "verify": "bun services/platform/src/cli/holo.ts evals:drift --dataset research_v1 --json",
    "maps_to_ac": "AC-4",
    "scenario": {
      "tier": "visible",
      "test_tier": "integration",
      "verification_service": "Postgres + holo CLI",
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
          "start_ref": "versioned_history",
          "action": {
            "actor": "operator",
            "steps": [
              "Complete two real eval runs over the committed dataset.",
              "Run holo evals:drift for research_v1."
            ]
          },
          "end_state": {
            "must_observe": [
              "drift entries: >=2",
              "datasetVersion: 'research_v1'",
              "modelVersion: 'judge_v1'",
              "promptVersion: 'research-quality_v1'"
            ],
            "must_not_observe": [
              "empty score rows",
              "latest score only",
              "empty drift output"
            ]
          }
        }
      ]
    }
  },
  {
    "id": "AC-5",
    "type": "acceptance_criterion",
    "description": "GIVEN a missing judge or dataset version WHEN evals:run executes THEN it exits non-zero and writes no score.",
    "verify": "PLATFORM_IT=1 pnpm test -- services/platform/tests/integration/evals-versioning.test.ts -t 'fails closed'",
    "maps_to_ac": "AC-5",
    "scenario": {
      "tier": "visible",
      "test_tier": "integration",
      "verification_service": "Postgres + local judge fleet",
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
          "start_ref": "judge_unavailable",
          "action": {
            "actor": "operator",
            "steps": [
              "Stop the declared judge endpoint or request an unknown dataset version.",
              "Run the public evals:run command."
            ]
          },
          "end_state": {
            "must_observe": [
              "process exit: 1",
              "error code: 'JUDGE_UNAVAILABLE'",
              "score rows: 0"
            ],
            "must_not_observe": [
              "new score rows: 1",
              "score rows: 0",
              "fallback cloud judge",
              "fabricated score"
            ]
          }
        }
      ]
    }
  },
  {
    "id": "TC-1",
    "type": "test_criterion",
    "description": "A known-good score is persisted when the local judge evaluates the known-good fixture.",
    "maps_to_ac": "AC-1",
    "verify": "bun services/platform/src/cli/holo.ts evals:run --sample known-good --json",
    "scenario": {
      "tier": "visible",
      "test_tier": "integration",
      "verification_service": "Mastra + Postgres + local judge fleet",
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
        "artifact_type": "db_query",
        "required_capture": true
      },
      "cases": [
        {
          "start_ref": "known_good",
          "action": {
            "actor": "operator",
            "steps": [
              "Run the public evals:run command.",
              "Query the persisted eval score by its run ID."
            ]
          },
          "end_state": {
            "must_observe": [
              "judge score: >=0.8",
              "baseline: 0.8",
              "persisted score rows: 1",
              "dataset: 'research_v1'"
            ],
            "must_not_observe": [
              "empty score rows",
              "empty judge response",
              "constant placeholder score"
            ]
          }
        }
      ]
    }
  },
  {
    "id": "TC-2",
    "type": "test_criterion",
    "description": "A deliberately-bad score is below baseline when the local judge evaluates the deliberately-bad fixture.",
    "maps_to_ac": "AC-2",
    "verify": "bun services/platform/src/cli/holo.ts evals:run --sample deliberately-bad --json",
    "scenario": {
      "tier": "visible",
      "test_tier": "integration",
      "verification_service": "Mastra + Postgres + local judge fleet",
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
        "artifact_type": "db_query",
        "required_capture": true
      },
      "cases": [
        {
          "start_ref": "deliberately_bad",
          "action": {
            "actor": "operator",
            "steps": [
              "Run the public evals:run command.",
              "Query the persisted score and baseline versions."
            ]
          },
          "end_state": {
            "must_observe": [
              "judge score: <0.8",
              "baseline: 0.8",
              "persisted score rows: 1",
              "tag: 'adversarial'"
            ],
            "must_not_observe": [
              "empty score rows",
              "score >=0.8",
              "empty score"
            ]
          }
        }
      ]
    }
  },
  {
    "id": "TC-3",
    "type": "test_criterion",
    "description": "A persisted score contains a dataset version when an eval run completes.",
    "maps_to_ac": "AC-3",
    "verify": "PLATFORM_IT=1 pnpm test -- services/platform/tests/integration/evals-versioning.test.ts -t 'version metadata'",
    "scenario": {
      "tier": "visible",
      "test_tier": "integration",
      "verification_service": "Postgres + local judge fleet",
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
        "artifact_type": "db_query",
        "required_capture": true
      },
      "cases": [
        {
          "start_ref": "versioned_history",
          "action": {
            "actor": "operator",
            "steps": [
              "Run the known-good fixture through the public eval command.",
              "Query the persisted score and version columns."
            ]
          },
          "end_state": {
            "must_observe": [
              "score rows checked: >=2",
              "datasetVersion: 'research_v1'",
              "rubricVersion: 'research-quality_v1'",
              "judgeModelVersion: 'judge_v1'",
              "promptVersion: 'research-quality_v1'",
              "baselineVersion: 'research_v1'"
            ],
            "must_not_observe": [
              "empty score rows",
              "null version fields",
              "empty fixture identity"
            ]
          }
        }
      ]
    }
  },
  {
    "id": "TC-4",
    "type": "test_criterion",
    "description": "The drift command returns multiple versioned score entries when two eval runs exist.",
    "maps_to_ac": "AC-4",
    "verify": "bun services/platform/src/cli/holo.ts evals:drift --dataset research_v1 --json",
    "scenario": {
      "tier": "visible",
      "test_tier": "integration",
      "verification_service": "Postgres + holo CLI",
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
          "start_ref": "versioned_history",
          "action": {
            "actor": "operator",
            "steps": [
              "Complete two real eval runs over the committed dataset.",
              "Run holo evals:drift for research_v1."
            ]
          },
          "end_state": {
            "must_observe": [
              "drift entries: >=2",
              "datasetVersion: 'research_v1'",
              "modelVersion: 'judge_v1'",
              "promptVersion: 'research-quality_v1'"
            ],
            "must_not_observe": [
              "empty score rows",
              "latest score only",
              "empty drift output"
            ]
          }
        }
      ]
    }
  },
  {
    "id": "TC-5",
    "type": "test_criterion",
    "description": "No score row is persisted when the judge endpoint or dataset version is unavailable.",
    "maps_to_ac": "AC-5",
    "verify": "PLATFORM_IT=1 pnpm test -- services/platform/tests/integration/evals-versioning.test.ts -t 'fails closed'",
    "scenario": {
      "tier": "visible",
      "test_tier": "integration",
      "verification_service": "Postgres + local judge fleet",
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
          "start_ref": "judge_unavailable",
          "action": {
            "actor": "operator",
            "steps": [
              "Stop the declared judge endpoint or request an unknown dataset version.",
              "Run the public evals:run command."
            ]
          },
          "end_state": {
            "must_observe": [
              "process exit: 1",
              "error code: 'JUDGE_UNAVAILABLE'",
              "score rows: 0"
            ],
            "must_not_observe": [
              "new score rows: 1",
              "score rows: 0",
              "fallback cloud judge",
              "fabricated score"
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

- services/platform/src/evals/index.ts (NEW)
- services/platform/src/evals/scorers.ts (NEW)
- services/platform/src/evals/datasets.ts (NEW)
- services/platform/src/evals/persistence.ts (NEW)
- services/platform/src/evals/drift.ts (NEW)
- services/platform/src/db/schema/evals.ts (NEW)
- services/platform/src/db/schema/index.ts (MODIFY)
- services/platform/src/db/migrations/0014_evals.sql (NEW)
- services/platform/src/cli/holo.ts (MODIFY, evals:run and evals:drift only)
- services/platform/evals/datasets/research_v1.jsonl (NEW)
- services/platform/evals/rubrics/research-quality_v1.json (NEW)
- services/platform/evals/baselines/research_v1.json (NEW)
- services/platform/tests/integration/evals-versioning.test.ts (NEW)

### WRITE-PROHIBITED

- .spec/** — planning artifacts are read-only
- .tmp/** — runtime evidence is generated by tests
- services/platform/src/inference/resolve-model.ts — consume role routing without changing it
- services/platform/src/inference/budget-ledger.ts — consume budget APIs without changing escape policy
- services/platform/src/mastra.ts — observability wiring belongs to obs-1
- app/** and components/** — no client changes
- any file not explicitly listed above

## Reading List

1. **.spec/prds/mk6-migration/10-technical-requirements/11-runtime-contracts.md** (39-47) — Versioned datasets, baselines, deterministic scorers, judge versions, replay, and CI policy.
2. **services/platform/src/inference/extract-structured.ts** (357-500) — Real local-model structured output and Zod validation pattern.
3. **services/platform/src/inference/resolve-model.ts** (all) — Judge-role resolution and local-first provider boundary.
4. **services/platform/src/cli/holo.ts** (1766-1935) — Existing fixture-driven CLI command and explicit failure formatting.
5. **services/platform/src/db/migrate.ts** (all) — Real Postgres migration and durable persistence pattern.

## Design

```json
{
  "references": [
    ".spec/prds/mk6-migration/10-technical-requirements/11-runtime-contracts.md",
    "services/platform/src/inference/extract-structured.ts",
    "services/platform/src/cli/holo.ts"
  ],
  "interaction_notes": [
    "Dataset, rubric, baseline, scorer, judge model, and prompt versions are immutable identifiers.",
    "The local judge is a real model call through the judge role, not a test double.",
    "Deterministic scorers run alongside model-graded scorers and remain independently inspectable."
  ],
  "pattern": "Use Mastra 1.x createScorer and runEvals from @mastra/core/evals with real Zod schemas, then persist score and version metadata through typed Postgres repositories.",
  "pattern_source": "services/platform/src/inference/extract-structured.ts:357-500",
  "anti_pattern": "Do not import 0.x Metric classes, @mastra/evals legacy APIs, mutable latest.json datasets, or constant fake scores."
}
```

## Code Pattern

The implementation or review must follow the specialist `pattern`, `pattern_source`, and `anti_pattern` recorded in the Design section above.

## Agent Instructions

Implement only the specialist-defined scope as agent `mastra-evals-implementer`. Preserve every MUST, NEVER, STRICTLY, scenario negative control, and public-command evidence requirement. Do not replace real services with mocks, stubs, static fixtures, or warning-only success paths.

**Assignment rationale:** Owns versioned datasets, Mastra 1.x scorers, local judge execution, persisted baselines, and drift replay.

## Coding Standards

- `/Users/inference1/Projects/brain/skills/coding-standards/SKILL.md`
- `/Users/inference1/Projects/brain/docs/TDD-METHODOLOGY.md`
- `/Users/inference1/Projects/brain/docs/TESTING-HIERARCHY.md`
- `/Users/inference1/Projects/brain/docs/CAPABILITY-CHAIN-PLANNING.md`

## Orchestrator Verification Protocol

Verification is evidence-gated: run the specialist gates below, then the repository gates. A green result is invalid if the command did not exercise the named real service or if the required seeded scenario/evidence artifact is absent.

- **Known-good eval** — `bun services/platform/src/cli/holo.ts evals:run --sample known-good --json` → Exit 0 with score at or above the versioned baseline and a persisted score ID.
- **Versioning and drift integration** — `PLATFORM_IT=1 pnpm test -- services/platform/tests/integration/evals-versioning.test.ts` → Exit 0 against real Postgres and local judge fleet.
- **Lint** — `pnpm biome check --write --no-errors-on-unmatched --diagnostic-level=error {staged_files}` → Exit 0.
- **Typecheck** — `pnpm tsgo --noEmit` → Exit 0.
- **Full test suite** — `pnpm test` → Exit 0.

**Repository gates:**
- `pnpm biome check --write --no-errors-on-unmatched --diagnostic-level=error {staged_files}`
- `pnpm tsgo --noEmit`
- `pnpm test`

## Agent Assignment

- **Agent:** mastra-evals-implementer
- **Reviewer:** mastra-reviewer
- **Proposed by:** mastra-evals-implementer
- **Estimate:** 300 minutes
- **Sprint:** Sprint 12

## Evidence Gates

- **Known-good eval** — `bun services/platform/src/cli/holo.ts evals:run --sample known-good --json` → Exit 0 with score at or above the versioned baseline and a persisted score ID.
- **Versioning and drift integration** — `PLATFORM_IT=1 pnpm test -- services/platform/tests/integration/evals-versioning.test.ts` → Exit 0 against real Postgres and local judge fleet.
- **Lint** — `pnpm biome check --write --no-errors-on-unmatched --diagnostic-level=error {staged_files}` → Exit 0.
- **Typecheck** — `pnpm tsgo --noEmit` → Exit 0.
- **Full test suite** — `pnpm test` → Exit 0.

## Review Criteria

- Reviewer verifies all acceptance criteria, test criteria, guardrails, scope compliance, real-service evidence, and the requirement contract.

## Dependencies

```json
{
  "depends_on": [
    "obs-1",
    "obs-2"
  ],
  "blocks": [
    "obs-4"
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
  "task_id": "obs-3",
  "proposed_by": "mastra-evals-implementer",
  "tdd_mode": "red_first",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": true,
    "requires_seeded_evidence": true
  },
  "fixtures": {
    "known_good": {
      "description": "Hand-curated research output satisfying the versioned rubric and deterministic evidence invariants.",
      "seed_method": "cli",
      "entrypoint": "bun services/platform/src/cli/holo.ts evals:run --sample known-good --json",
      "records": [
        "dataset: research_v1",
        "rubric: research-quality_v1",
        "baseline: 0.8",
        "expected verdict: pass"
      ]
    },
    "deliberately_bad": {
      "description": "Hand-curated research output that omits required evidence and fails the versioned rubric.",
      "seed_method": "cli",
      "entrypoint": "bun services/platform/src/cli/holo.ts evals:run --sample deliberately-bad --json",
      "records": [
        "dataset: research_v1",
        "score: <0.8",
        "expected verdict: fail",
        "tag: adversarial"
      ]
    },
    "versioned_history": {
      "description": "Two real eval runs over committed fixtures with persisted version metadata.",
      "seed_method": "cli",
      "entrypoint": "bun services/platform/src/cli/holo.ts evals:run --sample known-good --json",
      "records": [
        "score rows: 2",
        "datasetVersion: research_v1",
        "judgeModelVersion: judge_v1",
        "promptVersion: research-quality_v1"
      ]
    },
    "judge_unavailable": {
      "description": "The declared local judge endpoint is stopped or the dataset version is absent.",
      "seed_method": "cli",
      "entrypoint": "bun services/platform/src/cli/holo.ts evals:run --sample missing-dataset-v99 --json",
      "records": [
        "process exit: 1",
        "error code: JUDGE_UNAVAILABLE",
        "score rows: 0"
      ]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "description": "GIVEN the known-good fixture WHEN evals:run invokes the local judge THEN a score at or above baseline persists.",
      "verify": "bun services/platform/src/cli/holo.ts evals:run --sample known-good --json",
      "maps_to_ac": "AC-1",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "Mastra + Postgres + local judge fleet",
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
          "artifact_type": "db_query",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "known_good",
            "action": {
              "actor": "operator",
              "steps": [
                "Run the public evals:run command.",
                "Query the persisted eval score by its run ID."
              ]
            },
            "end_state": {
              "must_observe": [
                "judge score: >=0.8",
                "baseline: 0.8",
                "persisted score rows: 1",
                "dataset: 'research_v1'"
              ],
              "must_not_observe": [
                "empty score rows",
                "empty judge response",
                "constant placeholder score"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-2",
      "type": "acceptance_criterion",
      "description": "GIVEN the deliberately-bad fixture WHEN evals:run invokes the local judge THEN a score below baseline persists.",
      "verify": "bun services/platform/src/cli/holo.ts evals:run --sample deliberately-bad --json",
      "maps_to_ac": "AC-2",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "Mastra + Postgres + local judge fleet",
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
          "artifact_type": "db_query",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "deliberately_bad",
            "action": {
              "actor": "operator",
              "steps": [
                "Run the public evals:run command.",
                "Query the persisted score and baseline versions."
              ]
            },
            "end_state": {
              "must_observe": [
                "judge score: <0.8",
                "baseline: 0.8",
                "persisted score rows: 1",
                "tag: 'adversarial'"
              ],
              "must_not_observe": [
                "empty score rows",
                "score >=0.8",
                "empty score"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-3",
      "type": "acceptance_criterion",
      "description": "GIVEN completed evals WHEN score records are queried THEN dataset, rubric, scorer, judge model, judge prompt, and baseline versions exist.",
      "verify": "PLATFORM_IT=1 pnpm test -- services/platform/tests/integration/evals-versioning.test.ts -t 'version metadata'",
      "maps_to_ac": "AC-3",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "Postgres + local judge fleet",
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
          "artifact_type": "db_query",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "versioned_history",
            "action": {
              "actor": "operator",
              "steps": [
                "Run the known-good fixture through the public eval command.",
                "Query the persisted score and version columns."
              ]
            },
            "end_state": {
              "must_observe": [
                "score rows checked: >=2",
                "datasetVersion: 'research_v1'",
                "rubricVersion: 'research-quality_v1'",
                "judgeModelVersion: 'judge_v1'",
                "promptVersion: 'research-quality_v1'",
                "baselineVersion: 'research_v1'"
              ],
              "must_not_observe": [
                "empty score rows",
                "null version fields",
                "empty fixture identity"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-4",
      "type": "acceptance_criterion",
      "description": "GIVEN two real versioned score rows WHEN evals:drift runs THEN longitudinal scores include dataset, model, and prompt versions.",
      "verify": "bun services/platform/src/cli/holo.ts evals:drift --dataset research_v1 --json",
      "maps_to_ac": "AC-4",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "Postgres + holo CLI",
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
            "start_ref": "versioned_history",
            "action": {
              "actor": "operator",
              "steps": [
                "Complete two real eval runs over the committed dataset.",
                "Run holo evals:drift for research_v1."
              ]
            },
            "end_state": {
              "must_observe": [
                "drift entries: >=2",
                "datasetVersion: 'research_v1'",
                "modelVersion: 'judge_v1'",
                "promptVersion: 'research-quality_v1'"
              ],
              "must_not_observe": [
                "empty score rows",
                "latest score only",
                "empty drift output"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-5",
      "type": "acceptance_criterion",
      "description": "GIVEN a missing judge or dataset version WHEN evals:run executes THEN it exits non-zero and writes no score.",
      "verify": "PLATFORM_IT=1 pnpm test -- services/platform/tests/integration/evals-versioning.test.ts -t 'fails closed'",
      "maps_to_ac": "AC-5",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "Postgres + local judge fleet",
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
            "start_ref": "judge_unavailable",
            "action": {
              "actor": "operator",
              "steps": [
                "Stop the declared judge endpoint or request an unknown dataset version.",
                "Run the public evals:run command."
              ]
            },
            "end_state": {
              "must_observe": [
                "process exit: 1",
                "error code: 'JUDGE_UNAVAILABLE'",
                "score rows: 0"
              ],
              "must_not_observe": [
                "new score rows: 1",
                "score rows: 0",
                "fallback cloud judge",
                "fabricated score"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "TC-1",
      "type": "test_criterion",
      "description": "A known-good score is persisted when the local judge evaluates the known-good fixture.",
      "maps_to_ac": "AC-1",
      "verify": "bun services/platform/src/cli/holo.ts evals:run --sample known-good --json",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "Mastra + Postgres + local judge fleet",
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
          "artifact_type": "db_query",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "known_good",
            "action": {
              "actor": "operator",
              "steps": [
                "Run the public evals:run command.",
                "Query the persisted eval score by its run ID."
              ]
            },
            "end_state": {
              "must_observe": [
                "judge score: >=0.8",
                "baseline: 0.8",
                "persisted score rows: 1",
                "dataset: 'research_v1'"
              ],
              "must_not_observe": [
                "empty score rows",
                "empty judge response",
                "constant placeholder score"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "TC-2",
      "type": "test_criterion",
      "description": "A deliberately-bad score is below baseline when the local judge evaluates the deliberately-bad fixture.",
      "maps_to_ac": "AC-2",
      "verify": "bun services/platform/src/cli/holo.ts evals:run --sample deliberately-bad --json",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "Mastra + Postgres + local judge fleet",
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
          "artifact_type": "db_query",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "deliberately_bad",
            "action": {
              "actor": "operator",
              "steps": [
                "Run the public evals:run command.",
                "Query the persisted score and baseline versions."
              ]
            },
            "end_state": {
              "must_observe": [
                "judge score: <0.8",
                "baseline: 0.8",
                "persisted score rows: 1",
                "tag: 'adversarial'"
              ],
              "must_not_observe": [
                "empty score rows",
                "score >=0.8",
                "empty score"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "TC-3",
      "type": "test_criterion",
      "description": "A persisted score contains a dataset version when an eval run completes.",
      "maps_to_ac": "AC-3",
      "verify": "PLATFORM_IT=1 pnpm test -- services/platform/tests/integration/evals-versioning.test.ts -t 'version metadata'",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "Postgres + local judge fleet",
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
          "artifact_type": "db_query",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "versioned_history",
            "action": {
              "actor": "operator",
              "steps": [
                "Run the known-good fixture through the public eval command.",
                "Query the persisted score and version columns."
              ]
            },
            "end_state": {
              "must_observe": [
                "score rows checked: >=2",
                "datasetVersion: 'research_v1'",
                "rubricVersion: 'research-quality_v1'",
                "judgeModelVersion: 'judge_v1'",
                "promptVersion: 'research-quality_v1'",
                "baselineVersion: 'research_v1'"
              ],
              "must_not_observe": [
                "empty score rows",
                "null version fields",
                "empty fixture identity"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "TC-4",
      "type": "test_criterion",
      "description": "The drift command returns multiple versioned score entries when two eval runs exist.",
      "maps_to_ac": "AC-4",
      "verify": "bun services/platform/src/cli/holo.ts evals:drift --dataset research_v1 --json",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "Postgres + holo CLI",
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
            "start_ref": "versioned_history",
            "action": {
              "actor": "operator",
              "steps": [
                "Complete two real eval runs over the committed dataset.",
                "Run holo evals:drift for research_v1."
              ]
            },
            "end_state": {
              "must_observe": [
                "drift entries: >=2",
                "datasetVersion: 'research_v1'",
                "modelVersion: 'judge_v1'",
                "promptVersion: 'research-quality_v1'"
              ],
              "must_not_observe": [
                "empty score rows",
                "latest score only",
                "empty drift output"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "TC-5",
      "type": "test_criterion",
      "description": "No score row is persisted when the judge endpoint or dataset version is unavailable.",
      "maps_to_ac": "AC-5",
      "verify": "PLATFORM_IT=1 pnpm test -- services/platform/tests/integration/evals-versioning.test.ts -t 'fails closed'",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "Postgres + local judge fleet",
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
            "start_ref": "judge_unavailable",
            "action": {
              "actor": "operator",
              "steps": [
                "Stop the declared judge endpoint or request an unknown dataset version.",
                "Run the public evals:run command."
              ]
            },
            "end_state": {
              "must_observe": [
                "process exit: 1",
                "error code: 'JUDGE_UNAVAILABLE'",
                "score rows: 0"
              ],
              "must_not_observe": [
                "new score rows: 1",
                "score rows: 0",
                "fallback cloud judge",
                "fabricated score"
              ]
            }
          }
        ]
      }
    }
  ]
}
-->

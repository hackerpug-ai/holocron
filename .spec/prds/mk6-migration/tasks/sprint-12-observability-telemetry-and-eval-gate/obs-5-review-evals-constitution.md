# obs-5 — Review evals constitution
> Status: Backlog
> Sprint: [Sprint 12 — Observability, Telemetry and Eval Gate](../SPRINT.md)
> Agent: mastra-reviewer
> Reviewer: mastra-reviewer
> Estimate: 90 min
> Type: REVIEW
> Priority: P0
> Proposed by: mastra-reviewer
> TDD_MODE: skipped · RED_GREEN_REQUIRED: no · SEEDED_EVIDENCE_REQUIRED: yes

## Outcome

Adversarially validate that Sprint 12 implements an unfakeable observability, telemetry, versioned local-judge evaluation, drift, and CI regression-gate constitution.

**Success state:** The reviewer can issue APPROVE only when real mission traces, complete per-call Postgres telemetry, budget-ledger visibility, versioned persisted eval scores, and both blocking regression paths are independently evidenced and mapped to every CAP-INF-01 boundary.

## Background

- **Specialist rationale:** Owns adversarial Mastra 1.x, real-service, stub-detection, traceability, and CAP-INF-01 boundary review.
- **Planning rationale:** Sprint 12 is complete only if its detection and evaluation controls are demonstrably capable of blocking regressions. This review owns the final adversarial proof that observability is exported to the intended external service, telemetry is complete and persisted, evals are versioned and non-constant, and CI failure paths are real process failures rather than decorative tests.
- **Capability touchpoints:** CAP-INF-01
- **Provides:** adversarial-evals-constitution-verdict; real-service-evidence-disposition; cap-inf-01-detective-controls-boundary-disposition
- **Consumes:** obs-1-langfuse-otel-trace-substrate; obs-2-postgres-inference-telemetry; obs-3-versioned-eval-scorers-datasets-baselines; obs-4-deterministic-and-threshold-ci-gate; sprint-08-budget-ledger-contract

## Critical Constraints

### MUST

- MUST review every obs-1 through obs-4 implementation path against a running Mastra platform service, self-hosted Langfuse, real Postgres, and the real local fleet; command output alone without service-side evidence is insufficient.
- MUST verify the eval constitution: Mastra 1.x scorer APIs, non-constant scoring logic, immutable version-pinned datasets and baselines, persisted judge/model/prompt versions, and a CI assertion that blocks rather than warns.
- MUST trace CAP-INF-01 from an actual research run through Langfuse, per-call Postgres telemetry, and budget-ledger visibility, including the distinction between default fleet calls and declared budgeted escapes.
- MUST return a requirement-by-requirement verdict with file:line evidence, real command transcripts or trace identifiers, and actionable remediation for every unsatisfied requirement.

### NEVER

- NEVER approve mocked Mastra, mocked model providers, mocked HTTP or database clients, injected/view-only seeds, static Langfuse screenshots, direct database fixture inserts, or fabricated telemetry and score rows as behavioral proof.
- NEVER approve a scorer that returns a constant, a fixture-label-derived score, an unversioned baseline, a mutable golden dataset, or a score that is not produced by the configured local judge or deterministic invariant.
- NEVER approve a gate that catches and prints a regression, rewrites a non-zero status to zero, omits the deliberately-bad fixture, omits the deterministic-invariant regression, or permits known-good and bad fixtures to share the same outcome.
- NEVER alter implementation, tests, fixtures, baselines, migration files, or evidence while performing this review.

### STRICTLY

- STRICTLY reject any leftover 0.x Mastra eval or tracing surface, including Metric classes, metrics:{}, runExperiment, telemetry:{}, scorer-name lookup, or a scorer without id and generateScore().
- STRICTLY treat absent real-service proof, a positive stub-detection hit, missing CAP-INF-01 boundary evidence, or an unhandled required failure exit as BLOCK or REQUEST CHANGES rather than an advisory.
- STRICTLY run the exact repository lint, typecheck, and test commands in a clean review worktree; if lint writes a diff, record it and do not silently include it in the review.
- STRICTLY require every reviewed real-service test claimed as proof to become red when its required service dependency is unavailable; unrelated tests are not evidence for this task.

## Specification

**Objective:** Adversarially validate that Sprint 12 implements an unfakeable observability, telemetry, versioned local-judge evaluation, drift, and CI regression-gate constitution.

**Success state:** The reviewer can issue APPROVE only when real mission traces, complete per-call Postgres telemetry, budget-ledger visibility, versioned persisted eval scores, and both blocking regression paths are independently evidenced and mapped to every CAP-INF-01 boundary.

**Boundary contracts:**
- real mission or agent run to self-hosted Langfuse produces one viewable OTel trace per reviewed run
- every reviewed model call to Postgres telemetry persists tokens, wall-ms, endpoint, role, and run or trace correlation without synthetic rows
- declared escape-budget activity remains visibly correlated to the real Postgres budget ledger without fabricating an escape for default fleet calls
- versioned eval fixture to local judge to persisted score retains rubric, dataset, baseline, model, and prompt versions
- eval outcome to CI process exit fails non-zero for threshold and deterministic-invariant regressions while known-good exits zero

## Acceptance Criteria

### AC-1: Real mission trace reaches self-hosted Langfuse [PRIMARY]
**GIVEN:** the running platform, self-hosted Langfuse, real Postgres, and local fleet are available and the reviewer has captured the pre-run Langfuse watermark
**WHEN:** the operator runs `holo mission run research --goal 'X'` through the public CLI
**THEN:** exactly one new, viewable Langfuse OTel trace is attributable to the reviewed run and its trace identifier is captured with the real run evidence
**VERIFY:** `pnpm test`
**TEST_TIER:** e2e
**VERIFICATION_SERVICE:** Mastra platform service + self-hosted Langfuse + Postgres + local LiteLLM fleet
**PRODUCT_VERIFY:** `holo mission run research --goal 'X'`
**FLOW_REF:** UC-PLAT-04
**UNIT_TEST_JUSTIFIED:** null
#### Scenario contract
```json
{
  "tier": "visible",
  "test_tier": "e2e",
  "verification_service": "Mastra platform service + self-hosted Langfuse + Postgres + local LiteLLM fleet",
  "negative_control": {
    "would_fail_if": [
      "the Langfuse exporter is disconnected",
      "the implementation uses a local-only MastraStorageExporter trace as a Langfuse substitute",
      "the trace identifier is stale or static",
      "the model call is mocked or the trace is inserted directly"
    ]
  },
  "evidence": {
    "artifact_type": "event_log",
    "required_capture": true
  },
  "cases": [
    {
      "start_ref": "research_trace_run",
      "action": {
        "actor": "operator",
        "steps": [
          "Capture the self-hosted Langfuse trace watermark.",
          "Run `holo mission run research --goal 'X'` against the running platform.",
          "Open the resulting trace in self-hosted Langfuse and correlate its trace identifier to the CLI run output."
        ]
      },
      "end_state": {
        "must_observe": [
          "langfuse_trace_count_added: `1`",
          "trace_id: `<non-empty UUID or hex trace id>`",
          "run_goal: `X`"
        ],
        "must_not_observe": [
          "langfuse_trace_count_added: `(0)`",
          "empty Langfuse trace payload",
          "trace_id: `pre-run`",
          "local-only trace record with no Langfuse entry"
        ]
      }
    }
  ]
}
```

### AC-2: Per-call telemetry and budget-ledger visibility are real
**GIVEN:** the reviewed research run has completed against real services and the reviewer has captured the prior telemetry and budget-ledger state
**WHEN:** the operator runs `holo telemetry:tail` and `holo budget:status` through the public CLI
**THEN:** every observed model call has a correlated persisted telemetry record with tokens, wall-ms, endpoint, and role, while declared escapes remain visibly metered in the real budget ledger without inventing escape spend for default fleet calls
**VERIFY:** `pnpm test`
**TEST_TIER:** integration
**VERIFICATION_SERVICE:** Postgres inference telemetry store + budget ledger + Mastra platform service
**PRODUCT_VERIFY:** `holo telemetry:tail`
**FLOW_REF:** UC-PLAT-04
**UNIT_TEST_JUSTIFIED:** null
#### Scenario contract
```json
{
  "tier": "visible",
  "test_tier": "integration",
  "verification_service": "Postgres inference telemetry store + budget ledger + Mastra platform service",
  "negative_control": {
    "would_fail_if": [
      "telemetry is emitted only to stdout or memory",
      "a row omits tokens, wall-ms, endpoint, role, or run correlation",
      "the telemetry tail is populated by fixture inserts rather than the real model call",
      "budget status is served from process-local state rather than Postgres"
    ]
  },
  "evidence": {
    "artifact_type": "db_query",
    "required_capture": true
  },
  "cases": [
    {
      "start_ref": "research_trace_run",
      "action": {
        "actor": "operator",
        "steps": [
          "Run `holo telemetry:tail` after the real research command.",
          "Match every displayed telemetry row to the model calls observed for the reviewed run."
        ]
      },
      "end_state": {
        "must_observe": [
          "telemetry_rows_added: `>=1`",
          "tokens: `>0`",
          "wall_ms: `>0`",
          "endpoint: `http://` or `https://`",
          "role: `divergent|convergent|judge|embed|rerank`",
          "run_id_or_trace_id: `<non-empty>`"
        ],
        "must_not_observe": [
          "telemetry_rows_added: `(0)`",
          "empty telemetry result",
          "endpoint: `(none)`",
          "role: `(none)`",
          "telemetry timestamp before the captured watermark"
        ]
      }
    },
    {
      "start_ref": "declared_escape_ledger",
      "action": {
        "actor": "operator",
        "steps": [
          "Run the declared public escape path that records `eval-review-escape`.",
          "Run `holo budget:status` against the same real Postgres instance.",
          "Correlate the persisted ledger record to the reviewed run or step and inspect its reason, tokens, and cost."
        ]
      },
      "end_state": {
        "must_observe": [
          "spent_usd: `>=0`",
          "ceiling_usd: `10`",
          "remaining_usd: `>=0`",
          "escapes: `>=1`",
          "ledger_reason: `eval-review-escape`",
          "ledger_tokens: `>=0`",
          "ledger_cost_usd: `>=0`",
          "ledger_run_id_or_step_id: `<non-empty>`"
        ],
        "must_not_observe": [
          "escapes: `(0)`",
          "empty ledger result",
          "ledger_reason: `(none)`",
          "process-local-only budget total",
          "synthetic escape spend on the default fleet-only run"
        ]
      }
    }
  ]
}
```

### AC-3: Local-judge evaluation constitution is versioned and persisted
**GIVEN:** versioned known-good and deliberately-bad fixtures, a versioned rubric, a frozen dataset and baseline, and the local judge role are available through the running platform
**WHEN:** the operator runs the public eval commands and then `holo evals:drift`
**THEN:** known-good and deliberately-bad results are genuinely scored and persisted with score plus rubric, dataset, baseline, model, and prompt versions, and known-good scores at or above its pinned baseline
**VERIFY:** `pnpm test`
**TEST_TIER:** integration
**VERIFICATION_SERVICE:** Mastra eval runner + local judge fleet role + Postgres eval store
**PRODUCT_VERIFY:** `holo evals:run --sample known-good`
**FLOW_REF:** UC-PLAT-04
**UNIT_TEST_JUSTIFIED:** null
#### Scenario contract
```json
{
  "tier": "visible",
  "test_tier": "integration",
  "verification_service": "Mastra eval runner + local judge fleet role + Postgres eval store",
  "negative_control": {
    "would_fail_if": [
      "the scorer returns a constant or fixture-label-derived value",
      "the score is not generated by the configured local judge or deterministic invariant",
      "the dataset or baseline is mutable or unversioned",
      "the score record is not persisted to Postgres"
    ]
  },
  "evidence": {
    "artifact_type": "db_query",
    "required_capture": true
  },
  "cases": [
    {
      "start_ref": "versioned_eval_samples",
      "action": {
        "actor": "operator",
        "steps": [
          "Run `holo evals:run --sample known-good`.",
          "Run `holo evals:drift`.",
          "Inspect the persisted eval record and its version fields."
        ]
      },
      "end_state": {
        "must_observe": [
          "fixture: `known-good`",
          "eval_score: `>=baseline_score`",
          "rubric_version: `v1`",
          "dataset_version: `v1`",
          "baseline_version: `v1`",
          "model_version: `judge-v1`",
          "prompt_version: `v1`",
          "drift_record_count: `>=1`"
        ],
        "must_not_observe": [
          "eval_record_count: `(0)`",
          "empty eval record",
          "dataset_version: `latest`",
          "baseline_version: `(none)`",
          "model_version: `(none)`",
          "prompt_version: `(none)`"
        ]
      }
    },
    {
      "start_ref": "versioned_eval_samples",
      "action": {
        "actor": "operator",
        "steps": [
          "Run `holo evals:ci --fixture deliberately-bad` and retain its persisted result despite the required non-zero exit.",
          "Run `holo evals:drift` and inspect the deliberately-bad eval record."
        ]
      },
      "end_state": {
        "must_observe": [
          "fixture: `deliberately-bad`",
          "eval_record_count: `>=1`",
          "rubric_version: `v1`",
          "dataset_version: `v1`",
          "baseline_version: `v1`",
          "model_version: `judge-v1`",
          "prompt_version: `v1`",
          "gate_outcome: `threshold-regression` or `deterministic-invariant-failure`"
        ],
        "must_not_observe": [
          "eval_record_count: `(0)`",
          "empty deliberately-bad record",
          "fixture: `known-good` only",
          "hard-coded identical eval_score and reason for both fixture names"
        ]
      }
    }
  ]
}
```

### AC-4: CI regression gate has teeth and cannot be faked
**GIVEN:** the reviewed implementation, versioned fixtures, threshold configuration, deterministic invariant, and real-service evidence are present
**WHEN:** the operator executes the deliberately-bad, deterministic-invariant-regression, and known-good public CI commands and the reviewer performs stub and provenance checks
**THEN:** bad and deterministic-invariant fixtures each exit non-zero, known-good exits zero, and the reviewer finds no mocked dependency, constant scorer, swallowed failure, mutable baseline, or skipped test that could make the gate pass falsely
**VERIFY:** `pnpm test`
**TEST_TIER:** e2e
**VERIFICATION_SERVICE:** Mastra eval runner + local judge fleet role + Postgres + CI process boundary
**PRODUCT_VERIFY:** `holo evals:ci --fixture deliberately-bad`
**FLOW_REF:** UC-PLAT-04
**UNIT_TEST_JUSTIFIED:** null
#### Scenario contract
```json
{
  "tier": "visible",
  "test_tier": "e2e",
  "verification_service": "Mastra eval runner + local judge fleet role + Postgres + CI process boundary",
  "negative_control": {
    "would_fail_if": [
      "a threshold breach is caught and converted to exit code 0",
      "the CI command logs a warning instead of failing",
      "the deterministic invariant is not executed",
      "Mastra, the local judge, HTTP, or Postgres is mocked",
      "the fixture outcome is hard-coded or the test is skipped"
    ]
  },
  "evidence": {
    "artifact_type": "stdout",
    "required_capture": true
  },
  "cases": [
    {
      "start_ref": "versioned_eval_samples",
      "action": {
        "actor": "operator",
        "steps": [
          "Run `holo evals:ci --fixture deliberately-bad`.",
          "Capture its threshold comparison, fixture identifier, and process exit code."
        ]
      },
      "end_state": {
        "must_observe": [
          "fixture: `deliberately-bad`",
          "threshold_delta: `<0`",
          "gate_outcome: `threshold-regression`",
          "exit_code: `>=1`"
        ],
        "must_not_observe": [
          "exit_code: `0`",
          "gate_output: `empty`",
          "gate_outcome: `warning-only`",
          "scorer_result_count: `(0)`"
        ]
      }
    },
    {
      "start_ref": "versioned_eval_samples",
      "action": {
        "actor": "operator",
        "steps": [
          "Run `holo evals:ci --fixture deterministic-invariant-regression`.",
          "Capture the invariant identifier and process exit code."
        ]
      },
      "end_state": {
        "must_observe": [
          "fixture: `deterministic-invariant-regression`",
          "invariant_id: `<non-empty>`",
          "gate_outcome: `deterministic-invariant-failure`",
          "exit_code: `>=1`"
        ],
        "must_not_observe": [
          "exit_code: `0`",
          "invariant_result: `empty`",
          "invariant_result_count: `(0)`",
          "gate_outcome: `warning-only`"
        ]
      }
    },
    {
      "start_ref": "versioned_eval_samples",
      "action": {
        "actor": "operator",
        "steps": [
          "Run `holo evals:ci --fixture known-good`.",
          "Capture its pinned baseline comparison and process exit code."
        ]
      },
      "end_state": {
        "must_observe": [
          "fixture: `known-good`",
          "eval_score: `>=baseline_score`",
          "baseline_version: `v1`",
          "exit_code: `0`"
        ],
        "must_not_observe": [
          "eval_record_count: `(0)`",
          "baseline_version: `empty`",
          "gate_outcome: `threshold-regression`",
          "exit_code: `>=1`"
        ]
      }
    }
  ]
}
```

## Test Criteria

- **TC-1** (maps to AC-1) — `holo mission run research --goal 'X'` creates exactly one new self-hosted Langfuse trace after the captured pre-run watermark. — VERIFY: `pnpm test`
- **TC-2** (maps to AC-2) — `holo telemetry:tail` returns one persisted telemetry record for each observed model call in the reviewed run. — VERIFY: `pnpm test`
- **TC-3** (maps to AC-2) — `holo budget:status` reports persisted Postgres budget values for the reviewed ledger. — VERIFY: `pnpm test`
- **TC-4** (maps to AC-3) — Each persisted eval score record contains rubric, dataset, baseline, model, and prompt version identifiers. — VERIFY: `pnpm test`
- **TC-5** (maps to AC-3) — The known-good eval score is greater than or equal to its pinned baseline. — VERIFY: `pnpm test`
- **TC-6** (maps to AC-4) — `holo evals:ci --fixture deliberately-bad` exits non-zero after a configured threshold regression. — VERIFY: `pnpm test`
- **TC-7** (maps to AC-4) — `holo evals:ci --fixture deterministic-invariant-regression` exits non-zero after its invariant fails. — VERIFY: `pnpm test`
- **TC-8** (maps to AC-4) — `holo evals:ci --fixture known-good` exits zero after its score satisfies the pinned baseline. — VERIFY: `pnpm test`

## Requirement Traceability

```json
[
  {
    "id": "AC-1",
    "type": "acceptance_criterion",
    "description": "GIVEN the running platform, self-hosted Langfuse, real Postgres, and local fleet WHEN `holo mission run research --goal 'X'` executes THEN exactly one new viewable Langfuse trace is correlated to the reviewed run.",
    "verify": "pnpm test",
    "maps_to_ac": null,
    "satisfied": null,
    "evidence": null,
    "remediation": null,
    "last_evaluated_cycle": null,
    "last_evaluated_commit": null,
    "scenario": {
      "tier": "visible",
      "test_tier": "e2e",
      "verification_service": "Mastra platform service + self-hosted Langfuse + Postgres + local LiteLLM fleet",
      "negative_control": {
        "would_fail_if": [
          "the Langfuse exporter is disconnected",
          "the implementation uses a local-only MastraStorageExporter trace as a Langfuse substitute",
          "the trace identifier is stale or static",
          "the model call is mocked or the trace is inserted directly"
        ]
      },
      "evidence": {
        "artifact_type": "event_log",
        "required_capture": true
      },
      "cases": [
        {
          "start_ref": "research_trace_run",
          "action": {
            "actor": "operator",
            "steps": [
              "Capture the self-hosted Langfuse trace watermark.",
              "Run `holo mission run research --goal 'X'` against the running platform.",
              "Open the resulting trace in self-hosted Langfuse and correlate its trace identifier to the CLI run output."
            ]
          },
          "end_state": {
            "must_observe": [
              "langfuse_trace_count_added: `1`",
              "trace_id: `<non-empty UUID or hex trace id>`",
              "run_goal: `X`"
            ],
            "must_not_observe": [
              "langfuse_trace_count_added: `(0)`",
              "empty Langfuse trace payload",
              "trace_id: `pre-run`",
              "local-only trace record with no Langfuse entry"
            ]
          }
        }
      ]
    }
  },
  {
    "id": "AC-2",
    "type": "acceptance_criterion",
    "description": "GIVEN the reviewed real run and prior telemetry and ledger watermarks WHEN `holo telemetry:tail` and `holo budget:status` execute THEN per-call telemetry and declared escape-budget activity are persisted and correlated in Postgres.",
    "verify": "pnpm test",
    "maps_to_ac": null,
    "satisfied": null,
    "evidence": null,
    "remediation": null,
    "last_evaluated_cycle": null,
    "last_evaluated_commit": null,
    "scenario": {
      "tier": "visible",
      "test_tier": "integration",
      "verification_service": "Postgres inference telemetry store + budget ledger + Mastra platform service",
      "negative_control": {
        "would_fail_if": [
          "telemetry is emitted only to stdout or memory",
          "a row omits tokens, wall-ms, endpoint, role, or run correlation",
          "the telemetry tail is populated by fixture inserts rather than the real model call",
          "budget status is served from process-local state rather than Postgres"
        ]
      },
      "evidence": {
        "artifact_type": "db_query",
        "required_capture": true
      },
      "cases": [
        {
          "start_ref": "research_trace_run",
          "action": {
            "actor": "operator",
            "steps": [
              "Run `holo telemetry:tail` after the real research command.",
              "Match every displayed telemetry row to the model calls observed for the reviewed run."
            ]
          },
          "end_state": {
            "must_observe": [
              "telemetry_rows_added: `>=1`",
              "tokens: `>0`",
              "wall_ms: `>0`",
              "endpoint: `http://` or `https://`",
              "role: `divergent|convergent|judge|embed|rerank`",
              "run_id_or_trace_id: `<non-empty>`"
            ],
            "must_not_observe": [
              "telemetry_rows_added: `(0)`",
              "empty telemetry result",
              "endpoint: `(none)`",
              "role: `(none)`",
              "telemetry timestamp before the captured watermark"
            ]
          }
        },
        {
          "start_ref": "declared_escape_ledger",
          "action": {
            "actor": "operator",
            "steps": [
              "Run the declared public escape path that records `eval-review-escape`.",
              "Run `holo budget:status` against the same real Postgres instance.",
              "Correlate the persisted ledger record to the reviewed run or step and inspect its reason, tokens, and cost."
            ]
          },
          "end_state": {
            "must_observe": [
              "spent_usd: `>=0`",
              "ceiling_usd: `10`",
              "remaining_usd: `>=0`",
              "escapes: `>=1`",
              "ledger_reason: `eval-review-escape`",
              "ledger_tokens: `>=0`",
              "ledger_cost_usd: `>=0`",
              "ledger_run_id_or_step_id: `<non-empty>`"
            ],
            "must_not_observe": [
              "escapes: `(0)`",
              "empty ledger result",
              "ledger_reason: `(none)`",
              "process-local-only budget total",
              "synthetic escape spend on the default fleet-only run"
            ]
          }
        }
      ]
    }
  },
  {
    "id": "AC-3",
    "type": "acceptance_criterion",
    "description": "GIVEN versioned known-good and deliberately-bad fixtures and a local judge WHEN public eval commands run THEN persisted scores retain rubric, dataset, baseline, model, and prompt versions and known-good meets its pinned baseline.",
    "verify": "pnpm test",
    "maps_to_ac": null,
    "satisfied": null,
    "evidence": null,
    "remediation": null,
    "last_evaluated_cycle": null,
    "last_evaluated_commit": null,
    "scenario": {
      "tier": "visible",
      "test_tier": "integration",
      "verification_service": "Mastra eval runner + local judge fleet role + Postgres eval store",
      "negative_control": {
        "would_fail_if": [
          "the scorer returns a constant or fixture-label-derived value",
          "the score is not generated by the configured local judge or deterministic invariant",
          "the dataset or baseline is mutable or unversioned",
          "the score record is not persisted to Postgres"
        ]
      },
      "evidence": {
        "artifact_type": "db_query",
        "required_capture": true
      },
      "cases": [
        {
          "start_ref": "versioned_eval_samples",
          "action": {
            "actor": "operator",
            "steps": [
              "Run `holo evals:run --sample known-good`.",
              "Run `holo evals:drift`.",
              "Inspect the persisted eval record and its version fields."
            ]
          },
          "end_state": {
            "must_observe": [
              "fixture: `known-good`",
              "eval_score: `>=baseline_score`",
              "rubric_version: `v1`",
              "dataset_version: `v1`",
              "baseline_version: `v1`",
              "model_version: `judge-v1`",
              "prompt_version: `v1`",
              "drift_record_count: `>=1`"
            ],
            "must_not_observe": [
              "eval_record_count: `(0)`",
              "empty eval record",
              "dataset_version: `latest`",
              "baseline_version: `(none)`",
              "model_version: `(none)`",
              "prompt_version: `(none)`"
            ]
          }
        },
        {
          "start_ref": "versioned_eval_samples",
          "action": {
            "actor": "operator",
            "steps": [
              "Run `holo evals:ci --fixture deliberately-bad` and retain its persisted result despite the required non-zero exit.",
              "Run `holo evals:drift` and inspect the deliberately-bad eval record."
            ]
          },
          "end_state": {
            "must_observe": [
              "fixture: `deliberately-bad`",
              "eval_record_count: `>=1`",
              "rubric_version: `v1`",
              "dataset_version: `v1`",
              "baseline_version: `v1`",
              "model_version: `judge-v1`",
              "prompt_version: `v1`",
              "gate_outcome: `threshold-regression` or `deterministic-invariant-failure`"
            ],
            "must_not_observe": [
              "eval_record_count: `(0)`",
              "empty deliberately-bad record",
              "fixture: `known-good` only",
              "hard-coded identical eval_score and reason for both fixture names"
            ]
          }
        }
      ]
    }
  },
  {
    "id": "AC-4",
    "type": "acceptance_criterion",
    "description": "GIVEN the implemented eval gate WHEN deliberately-bad, deterministic-invariant-regression, and known-good fixtures run THEN the first two exit non-zero, known-good exits zero, and no fake-gate mechanism remains.",
    "verify": "pnpm test",
    "maps_to_ac": null,
    "satisfied": null,
    "evidence": null,
    "remediation": null,
    "last_evaluated_cycle": null,
    "last_evaluated_commit": null,
    "scenario": {
      "tier": "visible",
      "test_tier": "e2e",
      "verification_service": "Mastra eval runner + local judge fleet role + Postgres + CI process boundary",
      "negative_control": {
        "would_fail_if": [
          "a threshold breach is caught and converted to exit code 0",
          "the CI command logs a warning instead of failing",
          "the deterministic invariant is not executed",
          "Mastra, the local judge, HTTP, or Postgres is mocked",
          "the fixture outcome is hard-coded or the test is skipped"
        ]
      },
      "evidence": {
        "artifact_type": "stdout",
        "required_capture": true
      },
      "cases": [
        {
          "start_ref": "versioned_eval_samples",
          "action": {
            "actor": "operator",
            "steps": [
              "Run `holo evals:ci --fixture deliberately-bad`.",
              "Capture its threshold comparison, fixture identifier, and process exit code."
            ]
          },
          "end_state": {
            "must_observe": [
              "fixture: `deliberately-bad`",
              "threshold_delta: `<0`",
              "gate_outcome: `threshold-regression`",
              "exit_code: `>=1`"
            ],
            "must_not_observe": [
              "exit_code: `0`",
              "gate_output: `empty`",
              "gate_outcome: `warning-only`",
              "scorer_result_count: `(0)`"
            ]
          }
        },
        {
          "start_ref": "versioned_eval_samples",
          "action": {
            "actor": "operator",
            "steps": [
              "Run `holo evals:ci --fixture deterministic-invariant-regression`.",
              "Capture the invariant identifier and process exit code."
            ]
          },
          "end_state": {
            "must_observe": [
              "fixture: `deterministic-invariant-regression`",
              "invariant_id: `<non-empty>`",
              "gate_outcome: `deterministic-invariant-failure`",
              "exit_code: `>=1`"
            ],
            "must_not_observe": [
              "exit_code: `0`",
              "invariant_result: `empty`",
              "invariant_result_count: `(0)`",
              "gate_outcome: `warning-only`"
            ]
          }
        },
        {
          "start_ref": "versioned_eval_samples",
          "action": {
            "actor": "operator",
            "steps": [
              "Run `holo evals:ci --fixture known-good`.",
              "Capture its pinned baseline comparison and process exit code."
            ]
          },
          "end_state": {
            "must_observe": [
              "fixture: `known-good`",
              "eval_score: `>=baseline_score`",
              "baseline_version: `v1`",
              "exit_code: `0`"
            ],
            "must_not_observe": [
              "eval_record_count: `(0)`",
              "baseline_version: `empty`",
              "gate_outcome: `threshold-regression`",
              "exit_code: `>=1`"
            ]
          }
        }
      ]
    }
  },
  {
    "id": "TC-1",
    "type": "test_criterion",
    "description": "`holo mission run research --goal 'X'` creates exactly one new self-hosted Langfuse trace after the captured pre-run watermark.",
    "verify": "pnpm test",
    "maps_to_ac": "AC-1",
    "satisfied": null,
    "evidence": null,
    "remediation": null,
    "last_evaluated_cycle": null,
    "last_evaluated_commit": null,
    "scenario": {
      "tier": "visible",
      "test_tier": "e2e",
      "verification_service": "Mastra platform service + self-hosted Langfuse + Postgres + local LiteLLM fleet",
      "negative_control": {
        "would_fail_if": [
          "the Langfuse exporter is disconnected",
          "the implementation uses a local-only MastraStorageExporter trace as a Langfuse substitute",
          "the trace identifier is stale or static",
          "the model call is mocked or the trace is inserted directly"
        ]
      },
      "evidence": {
        "artifact_type": "event_log",
        "required_capture": true
      },
      "cases": [
        {
          "start_ref": "research_trace_run",
          "action": {
            "actor": "operator",
            "steps": [
              "Capture the self-hosted Langfuse trace watermark.",
              "Run `holo mission run research --goal 'X'` against the running platform.",
              "Open the resulting trace in self-hosted Langfuse and correlate its trace identifier to the CLI run output."
            ]
          },
          "end_state": {
            "must_observe": [
              "langfuse_trace_count_added: `1`",
              "trace_id: `<non-empty UUID or hex trace id>`",
              "run_goal: `X`"
            ],
            "must_not_observe": [
              "langfuse_trace_count_added: `(0)`",
              "empty Langfuse trace payload",
              "trace_id: `pre-run`",
              "local-only trace record with no Langfuse entry"
            ]
          }
        }
      ]
    }
  },
  {
    "id": "TC-2",
    "type": "test_criterion",
    "description": "`holo telemetry:tail` returns one persisted telemetry record for each observed model call in the reviewed run.",
    "verify": "pnpm test",
    "maps_to_ac": "AC-2",
    "satisfied": null,
    "evidence": null,
    "remediation": null,
    "last_evaluated_cycle": null,
    "last_evaluated_commit": null,
    "scenario": {
      "tier": "visible",
      "test_tier": "integration",
      "verification_service": "Postgres inference telemetry store + budget ledger + Mastra platform service",
      "negative_control": {
        "would_fail_if": [
          "telemetry is emitted only to stdout or memory",
          "a row omits tokens, wall-ms, endpoint, role, or run correlation",
          "the telemetry tail is populated by fixture inserts rather than the real model call",
          "budget status is served from process-local state rather than Postgres"
        ]
      },
      "evidence": {
        "artifact_type": "db_query",
        "required_capture": true
      },
      "cases": [
        {
          "start_ref": "research_trace_run",
          "action": {
            "actor": "operator",
            "steps": [
              "Run `holo telemetry:tail` after the real research command.",
              "Match every displayed telemetry row to the model calls observed for the reviewed run."
            ]
          },
          "end_state": {
            "must_observe": [
              "telemetry_rows_added: `>=1`",
              "tokens: `>0`",
              "wall_ms: `>0`",
              "endpoint: `http://` or `https://`",
              "role: `divergent|convergent|judge|embed|rerank`",
              "run_id_or_trace_id: `<non-empty>`"
            ],
            "must_not_observe": [
              "telemetry_rows_added: `(0)`",
              "empty telemetry result",
              "endpoint: `(none)`",
              "role: `(none)`",
              "telemetry timestamp before the captured watermark"
            ]
          }
        },
        {
          "start_ref": "declared_escape_ledger",
          "action": {
            "actor": "operator",
            "steps": [
              "Run the declared public escape path that records `eval-review-escape`.",
              "Run `holo budget:status` against the same real Postgres instance.",
              "Correlate the persisted ledger record to the reviewed run or step and inspect its reason, tokens, and cost."
            ]
          },
          "end_state": {
            "must_observe": [
              "spent_usd: `>=0`",
              "ceiling_usd: `10`",
              "remaining_usd: `>=0`",
              "escapes: `>=1`",
              "ledger_reason: `eval-review-escape`",
              "ledger_tokens: `>=0`",
              "ledger_cost_usd: `>=0`",
              "ledger_run_id_or_step_id: `<non-empty>`"
            ],
            "must_not_observe": [
              "escapes: `(0)`",
              "empty ledger result",
              "ledger_reason: `(none)`",
              "process-local-only budget total",
              "synthetic escape spend on the default fleet-only run"
            ]
          }
        }
      ]
    }
  },
  {
    "id": "TC-3",
    "type": "test_criterion",
    "description": "`holo budget:status` reports persisted Postgres budget values for the reviewed ledger.",
    "verify": "pnpm test",
    "maps_to_ac": "AC-2",
    "satisfied": null,
    "evidence": null,
    "remediation": null,
    "last_evaluated_cycle": null,
    "last_evaluated_commit": null,
    "scenario": {
      "tier": "visible",
      "test_tier": "integration",
      "verification_service": "Postgres inference telemetry store + budget ledger + Mastra platform service",
      "negative_control": {
        "would_fail_if": [
          "telemetry is emitted only to stdout or memory",
          "a row omits tokens, wall-ms, endpoint, role, or run correlation",
          "the telemetry tail is populated by fixture inserts rather than the real model call",
          "budget status is served from process-local state rather than Postgres"
        ]
      },
      "evidence": {
        "artifact_type": "db_query",
        "required_capture": true
      },
      "cases": [
        {
          "start_ref": "research_trace_run",
          "action": {
            "actor": "operator",
            "steps": [
              "Run `holo telemetry:tail` after the real research command.",
              "Match every displayed telemetry row to the model calls observed for the reviewed run."
            ]
          },
          "end_state": {
            "must_observe": [
              "telemetry_rows_added: `>=1`",
              "tokens: `>0`",
              "wall_ms: `>0`",
              "endpoint: `http://` or `https://`",
              "role: `divergent|convergent|judge|embed|rerank`",
              "run_id_or_trace_id: `<non-empty>`"
            ],
            "must_not_observe": [
              "telemetry_rows_added: `(0)`",
              "empty telemetry result",
              "endpoint: `(none)`",
              "role: `(none)`",
              "telemetry timestamp before the captured watermark"
            ]
          }
        },
        {
          "start_ref": "declared_escape_ledger",
          "action": {
            "actor": "operator",
            "steps": [
              "Run the declared public escape path that records `eval-review-escape`.",
              "Run `holo budget:status` against the same real Postgres instance.",
              "Correlate the persisted ledger record to the reviewed run or step and inspect its reason, tokens, and cost."
            ]
          },
          "end_state": {
            "must_observe": [
              "spent_usd: `>=0`",
              "ceiling_usd: `10`",
              "remaining_usd: `>=0`",
              "escapes: `>=1`",
              "ledger_reason: `eval-review-escape`",
              "ledger_tokens: `>=0`",
              "ledger_cost_usd: `>=0`",
              "ledger_run_id_or_step_id: `<non-empty>`"
            ],
            "must_not_observe": [
              "escapes: `(0)`",
              "empty ledger result",
              "ledger_reason: `(none)`",
              "process-local-only budget total",
              "synthetic escape spend on the default fleet-only run"
            ]
          }
        }
      ]
    }
  },
  {
    "id": "TC-4",
    "type": "test_criterion",
    "description": "Each persisted eval score record contains rubric, dataset, baseline, model, and prompt version identifiers.",
    "verify": "pnpm test",
    "maps_to_ac": "AC-3",
    "satisfied": null,
    "evidence": null,
    "remediation": null,
    "last_evaluated_cycle": null,
    "last_evaluated_commit": null,
    "scenario": {
      "tier": "visible",
      "test_tier": "integration",
      "verification_service": "Mastra eval runner + local judge fleet role + Postgres eval store",
      "negative_control": {
        "would_fail_if": [
          "the scorer returns a constant or fixture-label-derived value",
          "the score is not generated by the configured local judge or deterministic invariant",
          "the dataset or baseline is mutable or unversioned",
          "the score record is not persisted to Postgres"
        ]
      },
      "evidence": {
        "artifact_type": "db_query",
        "required_capture": true
      },
      "cases": [
        {
          "start_ref": "versioned_eval_samples",
          "action": {
            "actor": "operator",
            "steps": [
              "Run `holo evals:run --sample known-good`.",
              "Run `holo evals:drift`.",
              "Inspect the persisted eval record and its version fields."
            ]
          },
          "end_state": {
            "must_observe": [
              "fixture: `known-good`",
              "eval_score: `>=baseline_score`",
              "rubric_version: `v1`",
              "dataset_version: `v1`",
              "baseline_version: `v1`",
              "model_version: `judge-v1`",
              "prompt_version: `v1`",
              "drift_record_count: `>=1`"
            ],
            "must_not_observe": [
              "eval_record_count: `(0)`",
              "empty eval record",
              "dataset_version: `latest`",
              "baseline_version: `(none)`",
              "model_version: `(none)`",
              "prompt_version: `(none)`"
            ]
          }
        },
        {
          "start_ref": "versioned_eval_samples",
          "action": {
            "actor": "operator",
            "steps": [
              "Run `holo evals:ci --fixture deliberately-bad` and retain its persisted result despite the required non-zero exit.",
              "Run `holo evals:drift` and inspect the deliberately-bad eval record."
            ]
          },
          "end_state": {
            "must_observe": [
              "fixture: `deliberately-bad`",
              "eval_record_count: `>=1`",
              "rubric_version: `v1`",
              "dataset_version: `v1`",
              "baseline_version: `v1`",
              "model_version: `judge-v1`",
              "prompt_version: `v1`",
              "gate_outcome: `threshold-regression` or `deterministic-invariant-failure`"
            ],
            "must_not_observe": [
              "eval_record_count: `(0)`",
              "empty deliberately-bad record",
              "fixture: `known-good` only",
              "hard-coded identical eval_score and reason for both fixture names"
            ]
          }
        }
      ]
    }
  },
  {
    "id": "TC-5",
    "type": "test_criterion",
    "description": "The known-good eval score is greater than or equal to its pinned baseline.",
    "verify": "pnpm test",
    "maps_to_ac": "AC-3",
    "satisfied": null,
    "evidence": null,
    "remediation": null,
    "last_evaluated_cycle": null,
    "last_evaluated_commit": null,
    "scenario": {
      "tier": "visible",
      "test_tier": "integration",
      "verification_service": "Mastra eval runner + local judge fleet role + Postgres eval store",
      "negative_control": {
        "would_fail_if": [
          "the scorer returns a constant or fixture-label-derived value",
          "the score is not generated by the configured local judge or deterministic invariant",
          "the dataset or baseline is mutable or unversioned",
          "the score record is not persisted to Postgres"
        ]
      },
      "evidence": {
        "artifact_type": "db_query",
        "required_capture": true
      },
      "cases": [
        {
          "start_ref": "versioned_eval_samples",
          "action": {
            "actor": "operator",
            "steps": [
              "Run `holo evals:run --sample known-good`.",
              "Run `holo evals:drift`.",
              "Inspect the persisted eval record and its version fields."
            ]
          },
          "end_state": {
            "must_observe": [
              "fixture: `known-good`",
              "eval_score: `>=baseline_score`",
              "rubric_version: `v1`",
              "dataset_version: `v1`",
              "baseline_version: `v1`",
              "model_version: `judge-v1`",
              "prompt_version: `v1`",
              "drift_record_count: `>=1`"
            ],
            "must_not_observe": [
              "eval_record_count: `(0)`",
              "empty eval record",
              "dataset_version: `latest`",
              "baseline_version: `(none)`",
              "model_version: `(none)`",
              "prompt_version: `(none)`"
            ]
          }
        },
        {
          "start_ref": "versioned_eval_samples",
          "action": {
            "actor": "operator",
            "steps": [
              "Run `holo evals:ci --fixture deliberately-bad` and retain its persisted result despite the required non-zero exit.",
              "Run `holo evals:drift` and inspect the deliberately-bad eval record."
            ]
          },
          "end_state": {
            "must_observe": [
              "fixture: `deliberately-bad`",
              "eval_record_count: `>=1`",
              "rubric_version: `v1`",
              "dataset_version: `v1`",
              "baseline_version: `v1`",
              "model_version: `judge-v1`",
              "prompt_version: `v1`",
              "gate_outcome: `threshold-regression` or `deterministic-invariant-failure`"
            ],
            "must_not_observe": [
              "eval_record_count: `(0)`",
              "empty deliberately-bad record",
              "fixture: `known-good` only",
              "hard-coded identical eval_score and reason for both fixture names"
            ]
          }
        }
      ]
    }
  },
  {
    "id": "TC-6",
    "type": "test_criterion",
    "description": "`holo evals:ci --fixture deliberately-bad` exits non-zero after a configured threshold regression.",
    "verify": "pnpm test",
    "maps_to_ac": "AC-4",
    "satisfied": null,
    "evidence": null,
    "remediation": null,
    "last_evaluated_cycle": null,
    "last_evaluated_commit": null,
    "scenario": {
      "tier": "visible",
      "test_tier": "e2e",
      "verification_service": "Mastra eval runner + local judge fleet role + Postgres + CI process boundary",
      "negative_control": {
        "would_fail_if": [
          "a threshold breach is caught and converted to exit code 0",
          "the CI command logs a warning instead of failing",
          "the deterministic invariant is not executed",
          "Mastra, the local judge, HTTP, or Postgres is mocked",
          "the fixture outcome is hard-coded or the test is skipped"
        ]
      },
      "evidence": {
        "artifact_type": "stdout",
        "required_capture": true
      },
      "cases": [
        {
          "start_ref": "versioned_eval_samples",
          "action": {
            "actor": "operator",
            "steps": [
              "Run `holo evals:ci --fixture deliberately-bad`.",
              "Capture its threshold comparison, fixture identifier, and process exit code."
            ]
          },
          "end_state": {
            "must_observe": [
              "fixture: `deliberately-bad`",
              "threshold_delta: `<0`",
              "gate_outcome: `threshold-regression`",
              "exit_code: `>=1`"
            ],
            "must_not_observe": [
              "exit_code: `0`",
              "gate_output: `empty`",
              "gate_outcome: `warning-only`",
              "scorer_result_count: `(0)`"
            ]
          }
        },
        {
          "start_ref": "versioned_eval_samples",
          "action": {
            "actor": "operator",
            "steps": [
              "Run `holo evals:ci --fixture deterministic-invariant-regression`.",
              "Capture the invariant identifier and process exit code."
            ]
          },
          "end_state": {
            "must_observe": [
              "fixture: `deterministic-invariant-regression`",
              "invariant_id: `<non-empty>`",
              "gate_outcome: `deterministic-invariant-failure`",
              "exit_code: `>=1`"
            ],
            "must_not_observe": [
              "exit_code: `0`",
              "invariant_result: `empty`",
              "invariant_result_count: `(0)`",
              "gate_outcome: `warning-only`"
            ]
          }
        },
        {
          "start_ref": "versioned_eval_samples",
          "action": {
            "actor": "operator",
            "steps": [
              "Run `holo evals:ci --fixture known-good`.",
              "Capture its pinned baseline comparison and process exit code."
            ]
          },
          "end_state": {
            "must_observe": [
              "fixture: `known-good`",
              "eval_score: `>=baseline_score`",
              "baseline_version: `v1`",
              "exit_code: `0`"
            ],
            "must_not_observe": [
              "eval_record_count: `(0)`",
              "baseline_version: `empty`",
              "gate_outcome: `threshold-regression`",
              "exit_code: `>=1`"
            ]
          }
        }
      ]
    }
  },
  {
    "id": "TC-7",
    "type": "test_criterion",
    "description": "`holo evals:ci --fixture deterministic-invariant-regression` exits non-zero after its invariant fails.",
    "verify": "pnpm test",
    "maps_to_ac": "AC-4",
    "satisfied": null,
    "evidence": null,
    "remediation": null,
    "last_evaluated_cycle": null,
    "last_evaluated_commit": null,
    "scenario": {
      "tier": "visible",
      "test_tier": "e2e",
      "verification_service": "Mastra eval runner + local judge fleet role + Postgres + CI process boundary",
      "negative_control": {
        "would_fail_if": [
          "a threshold breach is caught and converted to exit code 0",
          "the CI command logs a warning instead of failing",
          "the deterministic invariant is not executed",
          "Mastra, the local judge, HTTP, or Postgres is mocked",
          "the fixture outcome is hard-coded or the test is skipped"
        ]
      },
      "evidence": {
        "artifact_type": "stdout",
        "required_capture": true
      },
      "cases": [
        {
          "start_ref": "versioned_eval_samples",
          "action": {
            "actor": "operator",
            "steps": [
              "Run `holo evals:ci --fixture deliberately-bad`.",
              "Capture its threshold comparison, fixture identifier, and process exit code."
            ]
          },
          "end_state": {
            "must_observe": [
              "fixture: `deliberately-bad`",
              "threshold_delta: `<0`",
              "gate_outcome: `threshold-regression`",
              "exit_code: `>=1`"
            ],
            "must_not_observe": [
              "exit_code: `0`",
              "gate_output: `empty`",
              "gate_outcome: `warning-only`",
              "scorer_result_count: `(0)`"
            ]
          }
        },
        {
          "start_ref": "versioned_eval_samples",
          "action": {
            "actor": "operator",
            "steps": [
              "Run `holo evals:ci --fixture deterministic-invariant-regression`.",
              "Capture the invariant identifier and process exit code."
            ]
          },
          "end_state": {
            "must_observe": [
              "fixture: `deterministic-invariant-regression`",
              "invariant_id: `<non-empty>`",
              "gate_outcome: `deterministic-invariant-failure`",
              "exit_code: `>=1`"
            ],
            "must_not_observe": [
              "exit_code: `0`",
              "invariant_result: `empty`",
              "invariant_result_count: `(0)`",
              "gate_outcome: `warning-only`"
            ]
          }
        },
        {
          "start_ref": "versioned_eval_samples",
          "action": {
            "actor": "operator",
            "steps": [
              "Run `holo evals:ci --fixture known-good`.",
              "Capture its pinned baseline comparison and process exit code."
            ]
          },
          "end_state": {
            "must_observe": [
              "fixture: `known-good`",
              "eval_score: `>=baseline_score`",
              "baseline_version: `v1`",
              "exit_code: `0`"
            ],
            "must_not_observe": [
              "eval_record_count: `(0)`",
              "baseline_version: `empty`",
              "gate_outcome: `threshold-regression`",
              "exit_code: `>=1`"
            ]
          }
        }
      ]
    }
  },
  {
    "id": "TC-8",
    "type": "test_criterion",
    "description": "`holo evals:ci --fixture known-good` exits zero after its score satisfies the pinned baseline.",
    "verify": "pnpm test",
    "maps_to_ac": "AC-4",
    "satisfied": null,
    "evidence": null,
    "remediation": null,
    "last_evaluated_cycle": null,
    "last_evaluated_commit": null,
    "scenario": {
      "tier": "visible",
      "test_tier": "e2e",
      "verification_service": "Mastra eval runner + local judge fleet role + Postgres + CI process boundary",
      "negative_control": {
        "would_fail_if": [
          "a threshold breach is caught and converted to exit code 0",
          "the CI command logs a warning instead of failing",
          "the deterministic invariant is not executed",
          "Mastra, the local judge, HTTP, or Postgres is mocked",
          "the fixture outcome is hard-coded or the test is skipped"
        ]
      },
      "evidence": {
        "artifact_type": "stdout",
        "required_capture": true
      },
      "cases": [
        {
          "start_ref": "versioned_eval_samples",
          "action": {
            "actor": "operator",
            "steps": [
              "Run `holo evals:ci --fixture deliberately-bad`.",
              "Capture its threshold comparison, fixture identifier, and process exit code."
            ]
          },
          "end_state": {
            "must_observe": [
              "fixture: `deliberately-bad`",
              "threshold_delta: `<0`",
              "gate_outcome: `threshold-regression`",
              "exit_code: `>=1`"
            ],
            "must_not_observe": [
              "exit_code: `0`",
              "gate_output: `empty`",
              "gate_outcome: `warning-only`",
              "scorer_result_count: `(0)`"
            ]
          }
        },
        {
          "start_ref": "versioned_eval_samples",
          "action": {
            "actor": "operator",
            "steps": [
              "Run `holo evals:ci --fixture deterministic-invariant-regression`.",
              "Capture the invariant identifier and process exit code."
            ]
          },
          "end_state": {
            "must_observe": [
              "fixture: `deterministic-invariant-regression`",
              "invariant_id: `<non-empty>`",
              "gate_outcome: `deterministic-invariant-failure`",
              "exit_code: `>=1`"
            ],
            "must_not_observe": [
              "exit_code: `0`",
              "invariant_result: `empty`",
              "invariant_result_count: `(0)`",
              "gate_outcome: `warning-only`"
            ]
          }
        },
        {
          "start_ref": "versioned_eval_samples",
          "action": {
            "actor": "operator",
            "steps": [
              "Run `holo evals:ci --fixture known-good`.",
              "Capture its pinned baseline comparison and process exit code."
            ]
          },
          "end_state": {
            "must_observe": [
              "fixture: `known-good`",
              "eval_score: `>=baseline_score`",
              "baseline_version: `v1`",
              "exit_code: `0`"
            ],
            "must_not_observe": [
              "eval_record_count: `(0)`",
              "baseline_version: `empty`",
              "gate_outcome: `threshold-regression`",
              "exit_code: `>=1`"
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

- None — this is a read-only adversarial review; the structured verdict and requirement dispositions are returned to the orchestrator.

### WRITE-PROHIBITED

- services/platform/src/** — reviewer must not implement or repair reviewed behavior
- services/platform/tests/** — reviewer must not modify, skip, or weaken the tests it evaluates
- services/platform/src/db/migrations/** — reviewer must not alter persisted evidence contracts
- package.json and lockfiles — reviewer must not change dependencies to make verification pass
- eval fixture, rubric, dataset, and baseline files — reviewer must not alter the subjects of the gate
- .spec/** — reviewer must not manufacture evidence artifacts or rewrite task requirements during this pass

### Boundary obligations
- Mission-to-Langfuse proof requires a new self-hosted Langfuse trace from the reviewed run, not only Mastra storage spans.
- Model-call-to-Postgres proof requires one real persisted row per observed call with tokens, wall-ms, endpoint, role, and correlation.
- Escape-budget proof requires actual Postgres-backed status and, where an escape occurred, a persisted correlated ledger row; fleet-only runs must not fabricate escape spend.
- Fixture-to-score proof requires a real local-judge or deterministic invariant execution and persisted immutable version identifiers.
- Score-to-CI proof requires observed process statuses: deliberately-bad and invariant fixtures non-zero, known-good zero.

### Review-only rules
- Run stub and mock scans against all changed source and test files, including fake-success execute bodies, mocked @mastra packages or providers, z.any(), skipped tests, TODOs in execute paths, constant scorers, and swallowed process exits.
- Inspect every agent generate or stream call added by the sprint for required tripwire handling and every workflow result for canonical status narrowing where applicable.
- Verify provenance for each AC: git history must show a failing behavioral test before the implementing change; missing RED evidence is a blocking review finding.
- Re-run all requirement verification against the current commit in every review cycle; prior satisfied states are context only.

## Reading List

1. **.spec/prds/mk6-migration/04-uc-plat.md** (56-65) — UC-PLAT-04 observability, telemetry, local-judge scoring, and blocking-gate acceptance criteria
2. **.spec/prds/mk6-migration/10-technical-requirements/02-system-components.md** (13-30) — C-15 Observability + Budget Ledger and its surrounding Mastra/model-router boundaries
3. **.spec/prds/mk6-migration/10-technical-requirements/06-external-dependencies.md** (13-33) — self-hosted Langfuse, local LiteLLM judge role, and budgeted Anthropic escape dependency boundaries
4. **.spec/prds/mk6-migration/10-technical-requirements/09-capability-chains.md** (43-51) — CAP-INF-01 trigger, ordered hops, boundary contracts, failure modes, real-service proof, and owners
5. **.spec/prds/mk6-migration/10-technical-requirements/11-runtime-contracts.md** (all) — eval constitution, traceability, typed terminal behavior, and no-fake-gate requirements
6. **.spec/prds/mk6-migration/11-e2e-testing-criteria.md** (36-42) — T-PLAT-012, T-PLAT-013, T-PLAT-014, and T-PLAT-018 proof obligations
7. **services/platform/src/mastra.ts** (all) — Mastra observability registration and exporter configuration
8. **services/platform/src/compat/cells/otel.ts** (all) — existing trace query behavior and local-storage-only false-positive risk
9. **services/platform/src/inference/resolve-model.ts** (all) — role routing, real model-call boundary, and declared escape handoff
10. **services/platform/src/inference/extract-structured.ts** (all) — structured-output call sites that must be represented in per-call telemetry
11. **services/platform/src/inference/budget-ledger.ts** (all) — real Postgres budget accounting, fail-closed escape behavior, and observable status values
12. **services/platform/src/db/schema/chat.ts** (all) — existing agent telemetry schema and required schema evolution review
13. **services/platform/src/db/schema/index.ts** (all) — schema barrel registration for telemetry and eval persistence
14. **services/platform/src/db/migrate.ts** (all) — real migration application path for telemetry and eval relations
15. **services/platform/src/cli/holo.ts** (all) — public operator command contracts and truthful process exit behavior
16. **services/platform/tests/integration/** (all) — real-service test patterns, PLATFORM_IT discipline, mock rejection, and post-obs-1 through obs-4 coverage
17. **/Users/inference1/Projects/brain/docs/mastra/evals-observability.md** (all) — Mastra 1.x scorer, versioned dataset, CI-blocking, and observability review requirements
18. **/Users/inference1/Projects/brain/skills/mastra-patterns/stub-detection.md** (all) — hard-fail stub, mock, skipped-test, schema, tripwire, and real-service evidence rubric

## Design

```json
{
  "references": [
    ".spec/prds/mk6-migration/tasks/sprint-12-observability-telemetry-and-eval-gate/SPRINT.md",
    ".spec/prds/mk6-migration/04-uc-plat.md",
    ".spec/prds/mk6-migration/10-technical-requirements/09-capability-chains.md",
    ".spec/prds/mk6-migration/10-technical-requirements/11-runtime-contracts.md"
  ],
  "interaction_notes": [
    "The operator journey is one coherent evidence flow: research run → Langfuse trace → telemetry tail and budget status → versioned eval score and drift → CI pass/fail exits.",
    "The reviewer must compare fresh service-side state to captured pre-run watermarks so existing records cannot satisfy the scenarios.",
    "A failed CI gate is product behavior and must be demonstrated through the public CLI with its real non-zero process status."
  ],
  "pattern": "Trace each promised value from the public holo command through the running Mastra service to its external or persisted consumer, then compare known-good, deliberately-bad, and deterministic-invariant outcomes under immutable versions.",
  "pattern_source": ".spec/prds/mk6-migration/10-technical-requirements/09-capability-chains.md:43-51",
  "anti_pattern": "Approving source inspection, a local-only trace store, mocked judge output, direct database seeds, warning-only thresholds, or a constant scorer without a real failing bad-fixture execution."
}
```

## Code Pattern

The implementation or review must follow the specialist `pattern`, `pattern_source`, and `anti_pattern` recorded in the Design section above.

## Agent Instructions

Implement only the specialist-defined scope as agent `mastra-reviewer`. Preserve every MUST, NEVER, STRICTLY, scenario negative control, and public-command evidence requirement. Do not replace real services with mocks, stubs, static fixtures, or warning-only success paths.

**Assignment rationale:** Owns adversarial Mastra 1.x, real-service, stub-detection, traceability, and CAP-INF-01 boundary review.

## Coding Standards

- `/Users/inference1/Projects/brain/skills/coding-standards/SKILL.md`
- `/Users/inference1/Projects/brain/skills/documentation-standards/SKILL.md`
- `/Users/inference1/Projects/brain/skills/mastra-patterns/stub-detection.md`
- `/Users/inference1/Projects/brain/docs/mastra/evals-observability.md`
- `/Users/inference1/Projects/brain/docs/REQUIREMENT-TRACKING.md`
- `/Users/inference1/Projects/brain/docs/CAPABILITY-CHAIN-PLANNING.md`
- `/Users/inference1/Projects/brain/docs/kanban/SCENARIO-CONTRACT-V1.md`
- `/Users/inference1/Projects/brain/docs/TESTING-HIERARCHY.md`

## Orchestrator Verification Protocol

Verification is evidence-gated: run the specialist gates below, then the repository gates. A green result is invalid if the command did not exercise the named real service or if the required seeded scenario/evidence artifact is absent.

- **Repository lint** — `pnpm biome check --write --no-errors-on-unmatched --diagnostic-level=error {staged_files}` → Exit 0 in a clean review worktree; any formatter-created diff is recorded and not silently accepted.
- **Repository typecheck** — `pnpm tsgo --noEmit` → Exit 0.
- **Repository test suite** — `pnpm test` → Exit 0; reviewer separately verifies that every Sprint 12 test claimed as behavioral proof actually exercised running dependencies.
- **Real mission-to-Langfuse trace proof** — `holo mission run research --goal 'X'` → One new self-hosted Langfuse trace is viewable after the captured watermark and exposes a concrete trace identifier.
- **Per-call Postgres telemetry proof** — `holo telemetry:tail` → Every observed model call for the reviewed run has a persisted row with concrete tokens, wall-ms, endpoint, role, and run or trace correlation.
- **Budget-ledger visibility proof** — `holo budget:status` → Outputs concrete Postgres-backed spent, ceiling, remaining, and escapes values; declared escapes correlate to persisted ledger rows.
- **Known-good local-judge and drift proof** — `holo evals:run --sample known-good` → Known-good scores at or above its pinned versioned baseline and persists versioned score evidence for `holo evals:drift`.
- **Longitudinal eval proof** — `holo evals:drift` → Shows persisted longitudinal scores with rubric, dataset, baseline, model, and prompt versions.
- **Deliberately-bad threshold proof** — `holo evals:ci --fixture deliberately-bad` → Configured regression failure is reported and the command exits non-zero.
- **Deterministic-invariant proof** — `holo evals:ci --fixture deterministic-invariant-regression` → Named deterministic invariant failure is reported and the command exits non-zero.
- **Known-good CI pass proof** — `holo evals:ci --fixture known-good` → Pinned baseline comparison passes and the command exits 0.

**Repository gates:**
- `pnpm biome check --write --no-errors-on-unmatched --diagnostic-level=error {staged_files}`
- `pnpm tsgo --noEmit`
- `pnpm test`

## Agent Assignment

- **Agent:** mastra-reviewer
- **Reviewer:** mastra-reviewer
- **Proposed by:** mastra-reviewer
- **Estimate:** 90 minutes
- **Sprint:** Sprint 12

## Evidence Gates

- **Repository lint** — `pnpm biome check --write --no-errors-on-unmatched --diagnostic-level=error {staged_files}` → Exit 0 in a clean review worktree; any formatter-created diff is recorded and not silently accepted.
- **Repository typecheck** — `pnpm tsgo --noEmit` → Exit 0.
- **Repository test suite** — `pnpm test` → Exit 0; reviewer separately verifies that every Sprint 12 test claimed as behavioral proof actually exercised running dependencies.
- **Real mission-to-Langfuse trace proof** — `holo mission run research --goal 'X'` → One new self-hosted Langfuse trace is viewable after the captured watermark and exposes a concrete trace identifier.
- **Per-call Postgres telemetry proof** — `holo telemetry:tail` → Every observed model call for the reviewed run has a persisted row with concrete tokens, wall-ms, endpoint, role, and run or trace correlation.
- **Budget-ledger visibility proof** — `holo budget:status` → Outputs concrete Postgres-backed spent, ceiling, remaining, and escapes values; declared escapes correlate to persisted ledger rows.
- **Known-good local-judge and drift proof** — `holo evals:run --sample known-good` → Known-good scores at or above its pinned versioned baseline and persists versioned score evidence for `holo evals:drift`.
- **Longitudinal eval proof** — `holo evals:drift` → Shows persisted longitudinal scores with rubric, dataset, baseline, model, and prompt versions.
- **Deliberately-bad threshold proof** — `holo evals:ci --fixture deliberately-bad` → Configured regression failure is reported and the command exits non-zero.
- **Deterministic-invariant proof** — `holo evals:ci --fixture deterministic-invariant-regression` → Named deterministic invariant failure is reported and the command exits non-zero.
- **Known-good CI pass proof** — `holo evals:ci --fixture known-good` → Pinned baseline comparison passes and the command exits 0.

## Review Criteria

```json
[
  {
    "area": "Mastra 1.x eval constitution",
    "required": [
      "createScorer and runEvals use @mastra/core/evals; prebuilt scorers use @mastra/evals/scorers/prebuilt.",
      "Every scorer has an explicit id and generateScore() returns a numeric score derived from real judge or deterministic input.",
      "No Metric classes, metrics:{}, runExperiment, scorer-name lookup, or other 0.x eval surface remains.",
      "Dataset and baseline versions are immutable and pinned; score persistence includes rubric, dataset, baseline, model, and prompt versions.",
      "Known-good and deliberately-bad outcomes are materially distinguishable without fixture-name branching or constant scores."
    ]
  },
  {
    "area": "Observability and CAP-INF-01 detective controls",
    "required": [
      "new Mastra configuration uses observability: new Observability(...), never telemetry:{}, and a real Langfuse exporter path.",
      "Fresh research runs yield one self-hosted Langfuse trace per run, correlated to CLI evidence.",
      "Every reviewed model call yields a Postgres telemetry row with tokens, wall-ms, endpoint, role, and correlation.",
      "Budget status reads real Postgres; declared escapes preserve reason, tokens, cost, and run or step identity while default fleet calls do not fabricate escape spend."
    ]
  },
  {
    "area": "Real-service proof",
    "required": [
      "Evidence includes fresh command transcripts plus Langfuse trace identifiers or screenshots and Postgres-backed telemetry, ledger, and eval records.",
      "The reviewer confirms that the tests credited as proof fail when their required running service is unavailable.",
      "No mocked @mastra/core, @mastra/client-js, model provider, HTTP client, Postgres client, or view-injected fixture is credited as behavioral verification.",
      "All behavioral samples enter through public holo commands and shared fixtures rather than direct SQL or hidden test-only seed state."
    ]
  },
  {
    "area": "No fake CI gate",
    "required": [
      "Deliberately-bad threshold regression exits non-zero.",
      "Deterministic-invariant regression exits non-zero.",
      "Known-good exits zero at or above its pinned baseline.",
      "Threshold and invariant failures cannot be caught, logged, skipped, normalized to zero, or downgraded to warnings.",
      "Git history demonstrates RED-before-GREEN behavioral coverage for each reviewed implementation AC."
    ]
  },
  {
    "area": "Verdict protocol",
    "required": [
      "Return every AC-1 through AC-4 and TC-1 through TC-8 with fresh satisfied state, file:line or command evidence, and actionable remediation for every false requirement.",
      "Return BLOCK or REQUEST CHANGES for any HIGH stub finding, missing real-service evidence, missing boundary proof, missing RED evidence, or false requirement.",
      "Return APPROVE only when every requirement is satisfied and no HIGH or CRITICAL stub finding remains."
    ]
  }
]
```

## Dependencies

```json
{
  "depends_on": [
    "obs-1",
    "obs-2",
    "obs-3",
    "obs-4"
  ],
  "blocks": [
    "Sprint 22"
  ],
  "parallel": []
}
```

### Boundary contract coverage
```json
[
  {
    "boundary_contract": "real mission or agent run to self-hosted Langfuse produces one viewable OTel trace per reviewed run",
    "acceptance_criteria": [
      "AC-1"
    ],
    "test_criteria": [
      "TC-1"
    ],
    "verification_gates": [
      "Real mission-to-Langfuse trace proof"
    ],
    "guardrail": "Reject local-only, stale, static, or mocked trace evidence."
  },
  {
    "boundary_contract": "every reviewed model call to Postgres telemetry persists tokens, wall-ms, endpoint, role, and run or trace correlation without synthetic rows",
    "acceptance_criteria": [
      "AC-2"
    ],
    "test_criteria": [
      "TC-2"
    ],
    "verification_gates": [
      "Per-call Postgres telemetry proof"
    ],
    "guardrail": "Reject stdout-only, partial, pre-seeded, or uncorrelated telemetry."
  },
  {
    "boundary_contract": "declared escape-budget activity remains visibly correlated to the real Postgres budget ledger without fabricating an escape for default fleet calls",
    "acceptance_criteria": [
      "AC-2"
    ],
    "test_criteria": [
      "TC-3"
    ],
    "verification_gates": [
      "Budget-ledger visibility proof"
    ],
    "guardrail": "Reject process-local totals, missing ledger rows, and fabricated default-path escape spend."
  },
  {
    "boundary_contract": "versioned eval fixture to local judge to persisted score retains rubric, dataset, baseline, model, and prompt versions",
    "acceptance_criteria": [
      "AC-3"
    ],
    "test_criteria": [
      "TC-4",
      "TC-5"
    ],
    "verification_gates": [
      "Known-good local-judge and drift proof"
    ],
    "guardrail": "Reject constant scorers, mutable baselines, unpinned datasets, or missing persisted versions."
  },
  {
    "boundary_contract": "eval outcome to CI process exit fails non-zero for threshold and deterministic-invariant regressions while known-good exits zero",
    "acceptance_criteria": [
      "AC-4"
    ],
    "test_criteria": [
      "TC-6",
      "TC-7",
      "TC-8"
    ],
    "verification_gates": [
      "Deliberately-bad threshold proof",
      "Deterministic-invariant proof",
      "Known-good CI pass proof"
    ],
    "guardrail": "Reject warning-only, swallowed, skipped, hard-coded, mocked, or status-normalized failures."
  }
]
```

## Notes

- Preserve the task-level requirement contract and all specialist-proposed evidence obligations through implementation and review.

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "obs-5",
  "proposed_by": "mastra-reviewer",
  "tdd_mode": "skipped",
  "verification_policy": {
    "requires_tests": false,
    "requires_red_evidence": false,
    "requires_seeded_evidence": true
  },
  "fixtures": {
    "research_trace_run": {
      "description": "A clean running Mastra/Hono platform connected to self-hosted Langfuse, real Postgres, and the local LiteLLM fleet; the operator starts a named research run through the public CLI after capturing fresh service watermarks.",
      "seed_method": "cli",
      "records": [
        "goal: `X`",
        "langfuse_trace_count_before: `0`",
        "postgres_telemetry_rows_before: `0`",
        "run_source: `holo mission run research --goal 'X'`"
      ]
    },
    "declared_escape_ledger": {
      "description": "A real declared escape path is invoked through the public operator surface against real Postgres; the fixture establishes an auditable ledger record without direct SQL or test-only insertion.",
      "seed_method": "cli",
      "records": [
        "budget_ceiling_usd: `10`",
        "escape_reason: `eval-review-escape`",
        "escape_count_before: `0`",
        "ledger_source: `holo budget:status`"
      ]
    },
    "versioned_eval_samples": {
      "description": "Tracked known-good, deliberately-bad, and deterministic-invariant-regression fixtures are consumed only through public holo eval commands and are pinned to explicit version identifiers.",
      "seed_method": "cli",
      "records": [
        "fixture: `known-good`",
        "fixture: `deliberately-bad`",
        "fixture: `deterministic-invariant-regression`",
        "rubric_version: `v1`",
        "dataset_version: `v1`",
        "baseline_version: `v1`",
        "model_version: `judge-v1`",
        "prompt_version: `v1`"
      ]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "description": "GIVEN the running platform, self-hosted Langfuse, real Postgres, and local fleet WHEN `holo mission run research --goal 'X'` executes THEN exactly one new viewable Langfuse trace is correlated to the reviewed run.",
      "verify": "pnpm test",
      "maps_to_ac": null,
      "satisfied": null,
      "evidence": null,
      "remediation": null,
      "last_evaluated_cycle": null,
      "last_evaluated_commit": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "e2e",
        "verification_service": "Mastra platform service + self-hosted Langfuse + Postgres + local LiteLLM fleet",
        "negative_control": {
          "would_fail_if": [
            "the Langfuse exporter is disconnected",
            "the implementation uses a local-only MastraStorageExporter trace as a Langfuse substitute",
            "the trace identifier is stale or static",
            "the model call is mocked or the trace is inserted directly"
          ]
        },
        "evidence": {
          "artifact_type": "event_log",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "research_trace_run",
            "action": {
              "actor": "operator",
              "steps": [
                "Capture the self-hosted Langfuse trace watermark.",
                "Run `holo mission run research --goal 'X'` against the running platform.",
                "Open the resulting trace in self-hosted Langfuse and correlate its trace identifier to the CLI run output."
              ]
            },
            "end_state": {
              "must_observe": [
                "langfuse_trace_count_added: `1`",
                "trace_id: `<non-empty UUID or hex trace id>`",
                "run_goal: `X`"
              ],
              "must_not_observe": [
                "langfuse_trace_count_added: `(0)`",
                "empty Langfuse trace payload",
                "trace_id: `pre-run`",
                "local-only trace record with no Langfuse entry"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-2",
      "type": "acceptance_criterion",
      "description": "GIVEN the reviewed real run and prior telemetry and ledger watermarks WHEN `holo telemetry:tail` and `holo budget:status` execute THEN per-call telemetry and declared escape-budget activity are persisted and correlated in Postgres.",
      "verify": "pnpm test",
      "maps_to_ac": null,
      "satisfied": null,
      "evidence": null,
      "remediation": null,
      "last_evaluated_cycle": null,
      "last_evaluated_commit": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "Postgres inference telemetry store + budget ledger + Mastra platform service",
        "negative_control": {
          "would_fail_if": [
            "telemetry is emitted only to stdout or memory",
            "a row omits tokens, wall-ms, endpoint, role, or run correlation",
            "the telemetry tail is populated by fixture inserts rather than the real model call",
            "budget status is served from process-local state rather than Postgres"
          ]
        },
        "evidence": {
          "artifact_type": "db_query",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "research_trace_run",
            "action": {
              "actor": "operator",
              "steps": [
                "Run `holo telemetry:tail` after the real research command.",
                "Match every displayed telemetry row to the model calls observed for the reviewed run."
              ]
            },
            "end_state": {
              "must_observe": [
                "telemetry_rows_added: `>=1`",
                "tokens: `>0`",
                "wall_ms: `>0`",
                "endpoint: `http://` or `https://`",
                "role: `divergent|convergent|judge|embed|rerank`",
                "run_id_or_trace_id: `<non-empty>`"
              ],
              "must_not_observe": [
                "telemetry_rows_added: `(0)`",
                "empty telemetry result",
                "endpoint: `(none)`",
                "role: `(none)`",
                "telemetry timestamp before the captured watermark"
              ]
            }
          },
          {
            "start_ref": "declared_escape_ledger",
            "action": {
              "actor": "operator",
              "steps": [
                "Run the declared public escape path that records `eval-review-escape`.",
                "Run `holo budget:status` against the same real Postgres instance.",
                "Correlate the persisted ledger record to the reviewed run or step and inspect its reason, tokens, and cost."
              ]
            },
            "end_state": {
              "must_observe": [
                "spent_usd: `>=0`",
                "ceiling_usd: `10`",
                "remaining_usd: `>=0`",
                "escapes: `>=1`",
                "ledger_reason: `eval-review-escape`",
                "ledger_tokens: `>=0`",
                "ledger_cost_usd: `>=0`",
                "ledger_run_id_or_step_id: `<non-empty>`"
              ],
              "must_not_observe": [
                "escapes: `(0)`",
                "empty ledger result",
                "ledger_reason: `(none)`",
                "process-local-only budget total",
                "synthetic escape spend on the default fleet-only run"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-3",
      "type": "acceptance_criterion",
      "description": "GIVEN versioned known-good and deliberately-bad fixtures and a local judge WHEN public eval commands run THEN persisted scores retain rubric, dataset, baseline, model, and prompt versions and known-good meets its pinned baseline.",
      "verify": "pnpm test",
      "maps_to_ac": null,
      "satisfied": null,
      "evidence": null,
      "remediation": null,
      "last_evaluated_cycle": null,
      "last_evaluated_commit": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "Mastra eval runner + local judge fleet role + Postgres eval store",
        "negative_control": {
          "would_fail_if": [
            "the scorer returns a constant or fixture-label-derived value",
            "the score is not generated by the configured local judge or deterministic invariant",
            "the dataset or baseline is mutable or unversioned",
            "the score record is not persisted to Postgres"
          ]
        },
        "evidence": {
          "artifact_type": "db_query",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "versioned_eval_samples",
            "action": {
              "actor": "operator",
              "steps": [
                "Run `holo evals:run --sample known-good`.",
                "Run `holo evals:drift`.",
                "Inspect the persisted eval record and its version fields."
              ]
            },
            "end_state": {
              "must_observe": [
                "fixture: `known-good`",
                "eval_score: `>=baseline_score`",
                "rubric_version: `v1`",
                "dataset_version: `v1`",
                "baseline_version: `v1`",
                "model_version: `judge-v1`",
                "prompt_version: `v1`",
                "drift_record_count: `>=1`"
              ],
              "must_not_observe": [
                "eval_record_count: `(0)`",
                "empty eval record",
                "dataset_version: `latest`",
                "baseline_version: `(none)`",
                "model_version: `(none)`",
                "prompt_version: `(none)`"
              ]
            }
          },
          {
            "start_ref": "versioned_eval_samples",
            "action": {
              "actor": "operator",
              "steps": [
                "Run `holo evals:ci --fixture deliberately-bad` and retain its persisted result despite the required non-zero exit.",
                "Run `holo evals:drift` and inspect the deliberately-bad eval record."
              ]
            },
            "end_state": {
              "must_observe": [
                "fixture: `deliberately-bad`",
                "eval_record_count: `>=1`",
                "rubric_version: `v1`",
                "dataset_version: `v1`",
                "baseline_version: `v1`",
                "model_version: `judge-v1`",
                "prompt_version: `v1`",
                "gate_outcome: `threshold-regression` or `deterministic-invariant-failure`"
              ],
              "must_not_observe": [
                "eval_record_count: `(0)`",
                "empty deliberately-bad record",
                "fixture: `known-good` only",
                "hard-coded identical eval_score and reason for both fixture names"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-4",
      "type": "acceptance_criterion",
      "description": "GIVEN the implemented eval gate WHEN deliberately-bad, deterministic-invariant-regression, and known-good fixtures run THEN the first two exit non-zero, known-good exits zero, and no fake-gate mechanism remains.",
      "verify": "pnpm test",
      "maps_to_ac": null,
      "satisfied": null,
      "evidence": null,
      "remediation": null,
      "last_evaluated_cycle": null,
      "last_evaluated_commit": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "e2e",
        "verification_service": "Mastra eval runner + local judge fleet role + Postgres + CI process boundary",
        "negative_control": {
          "would_fail_if": [
            "a threshold breach is caught and converted to exit code 0",
            "the CI command logs a warning instead of failing",
            "the deterministic invariant is not executed",
            "Mastra, the local judge, HTTP, or Postgres is mocked",
            "the fixture outcome is hard-coded or the test is skipped"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "versioned_eval_samples",
            "action": {
              "actor": "operator",
              "steps": [
                "Run `holo evals:ci --fixture deliberately-bad`.",
                "Capture its threshold comparison, fixture identifier, and process exit code."
              ]
            },
            "end_state": {
              "must_observe": [
                "fixture: `deliberately-bad`",
                "threshold_delta: `<0`",
                "gate_outcome: `threshold-regression`",
                "exit_code: `>=1`"
              ],
              "must_not_observe": [
                "exit_code: `0`",
                "gate_output: `empty`",
                "gate_outcome: `warning-only`",
                "scorer_result_count: `(0)`"
              ]
            }
          },
          {
            "start_ref": "versioned_eval_samples",
            "action": {
              "actor": "operator",
              "steps": [
                "Run `holo evals:ci --fixture deterministic-invariant-regression`.",
                "Capture the invariant identifier and process exit code."
              ]
            },
            "end_state": {
              "must_observe": [
                "fixture: `deterministic-invariant-regression`",
                "invariant_id: `<non-empty>`",
                "gate_outcome: `deterministic-invariant-failure`",
                "exit_code: `>=1`"
              ],
              "must_not_observe": [
                "exit_code: `0`",
                "invariant_result: `empty`",
                "invariant_result_count: `(0)`",
                "gate_outcome: `warning-only`"
              ]
            }
          },
          {
            "start_ref": "versioned_eval_samples",
            "action": {
              "actor": "operator",
              "steps": [
                "Run `holo evals:ci --fixture known-good`.",
                "Capture its pinned baseline comparison and process exit code."
              ]
            },
            "end_state": {
              "must_observe": [
                "fixture: `known-good`",
                "eval_score: `>=baseline_score`",
                "baseline_version: `v1`",
                "exit_code: `0`"
              ],
              "must_not_observe": [
                "eval_record_count: `(0)`",
                "baseline_version: `empty`",
                "gate_outcome: `threshold-regression`",
                "exit_code: `>=1`"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "TC-1",
      "type": "test_criterion",
      "description": "`holo mission run research --goal 'X'` creates exactly one new self-hosted Langfuse trace after the captured pre-run watermark.",
      "verify": "pnpm test",
      "maps_to_ac": "AC-1",
      "satisfied": null,
      "evidence": null,
      "remediation": null,
      "last_evaluated_cycle": null,
      "last_evaluated_commit": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "e2e",
        "verification_service": "Mastra platform service + self-hosted Langfuse + Postgres + local LiteLLM fleet",
        "negative_control": {
          "would_fail_if": [
            "the Langfuse exporter is disconnected",
            "the implementation uses a local-only MastraStorageExporter trace as a Langfuse substitute",
            "the trace identifier is stale or static",
            "the model call is mocked or the trace is inserted directly"
          ]
        },
        "evidence": {
          "artifact_type": "event_log",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "research_trace_run",
            "action": {
              "actor": "operator",
              "steps": [
                "Capture the self-hosted Langfuse trace watermark.",
                "Run `holo mission run research --goal 'X'` against the running platform.",
                "Open the resulting trace in self-hosted Langfuse and correlate its trace identifier to the CLI run output."
              ]
            },
            "end_state": {
              "must_observe": [
                "langfuse_trace_count_added: `1`",
                "trace_id: `<non-empty UUID or hex trace id>`",
                "run_goal: `X`"
              ],
              "must_not_observe": [
                "langfuse_trace_count_added: `(0)`",
                "empty Langfuse trace payload",
                "trace_id: `pre-run`",
                "local-only trace record with no Langfuse entry"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "TC-2",
      "type": "test_criterion",
      "description": "`holo telemetry:tail` returns one persisted telemetry record for each observed model call in the reviewed run.",
      "verify": "pnpm test",
      "maps_to_ac": "AC-2",
      "satisfied": null,
      "evidence": null,
      "remediation": null,
      "last_evaluated_cycle": null,
      "last_evaluated_commit": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "Postgres inference telemetry store + budget ledger + Mastra platform service",
        "negative_control": {
          "would_fail_if": [
            "telemetry is emitted only to stdout or memory",
            "a row omits tokens, wall-ms, endpoint, role, or run correlation",
            "the telemetry tail is populated by fixture inserts rather than the real model call",
            "budget status is served from process-local state rather than Postgres"
          ]
        },
        "evidence": {
          "artifact_type": "db_query",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "research_trace_run",
            "action": {
              "actor": "operator",
              "steps": [
                "Run `holo telemetry:tail` after the real research command.",
                "Match every displayed telemetry row to the model calls observed for the reviewed run."
              ]
            },
            "end_state": {
              "must_observe": [
                "telemetry_rows_added: `>=1`",
                "tokens: `>0`",
                "wall_ms: `>0`",
                "endpoint: `http://` or `https://`",
                "role: `divergent|convergent|judge|embed|rerank`",
                "run_id_or_trace_id: `<non-empty>`"
              ],
              "must_not_observe": [
                "telemetry_rows_added: `(0)`",
                "empty telemetry result",
                "endpoint: `(none)`",
                "role: `(none)`",
                "telemetry timestamp before the captured watermark"
              ]
            }
          },
          {
            "start_ref": "declared_escape_ledger",
            "action": {
              "actor": "operator",
              "steps": [
                "Run the declared public escape path that records `eval-review-escape`.",
                "Run `holo budget:status` against the same real Postgres instance.",
                "Correlate the persisted ledger record to the reviewed run or step and inspect its reason, tokens, and cost."
              ]
            },
            "end_state": {
              "must_observe": [
                "spent_usd: `>=0`",
                "ceiling_usd: `10`",
                "remaining_usd: `>=0`",
                "escapes: `>=1`",
                "ledger_reason: `eval-review-escape`",
                "ledger_tokens: `>=0`",
                "ledger_cost_usd: `>=0`",
                "ledger_run_id_or_step_id: `<non-empty>`"
              ],
              "must_not_observe": [
                "escapes: `(0)`",
                "empty ledger result",
                "ledger_reason: `(none)`",
                "process-local-only budget total",
                "synthetic escape spend on the default fleet-only run"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "TC-3",
      "type": "test_criterion",
      "description": "`holo budget:status` reports persisted Postgres budget values for the reviewed ledger.",
      "verify": "pnpm test",
      "maps_to_ac": "AC-2",
      "satisfied": null,
      "evidence": null,
      "remediation": null,
      "last_evaluated_cycle": null,
      "last_evaluated_commit": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "Postgres inference telemetry store + budget ledger + Mastra platform service",
        "negative_control": {
          "would_fail_if": [
            "telemetry is emitted only to stdout or memory",
            "a row omits tokens, wall-ms, endpoint, role, or run correlation",
            "the telemetry tail is populated by fixture inserts rather than the real model call",
            "budget status is served from process-local state rather than Postgres"
          ]
        },
        "evidence": {
          "artifact_type": "db_query",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "research_trace_run",
            "action": {
              "actor": "operator",
              "steps": [
                "Run `holo telemetry:tail` after the real research command.",
                "Match every displayed telemetry row to the model calls observed for the reviewed run."
              ]
            },
            "end_state": {
              "must_observe": [
                "telemetry_rows_added: `>=1`",
                "tokens: `>0`",
                "wall_ms: `>0`",
                "endpoint: `http://` or `https://`",
                "role: `divergent|convergent|judge|embed|rerank`",
                "run_id_or_trace_id: `<non-empty>`"
              ],
              "must_not_observe": [
                "telemetry_rows_added: `(0)`",
                "empty telemetry result",
                "endpoint: `(none)`",
                "role: `(none)`",
                "telemetry timestamp before the captured watermark"
              ]
            }
          },
          {
            "start_ref": "declared_escape_ledger",
            "action": {
              "actor": "operator",
              "steps": [
                "Run the declared public escape path that records `eval-review-escape`.",
                "Run `holo budget:status` against the same real Postgres instance.",
                "Correlate the persisted ledger record to the reviewed run or step and inspect its reason, tokens, and cost."
              ]
            },
            "end_state": {
              "must_observe": [
                "spent_usd: `>=0`",
                "ceiling_usd: `10`",
                "remaining_usd: `>=0`",
                "escapes: `>=1`",
                "ledger_reason: `eval-review-escape`",
                "ledger_tokens: `>=0`",
                "ledger_cost_usd: `>=0`",
                "ledger_run_id_or_step_id: `<non-empty>`"
              ],
              "must_not_observe": [
                "escapes: `(0)`",
                "empty ledger result",
                "ledger_reason: `(none)`",
                "process-local-only budget total",
                "synthetic escape spend on the default fleet-only run"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "TC-4",
      "type": "test_criterion",
      "description": "Each persisted eval score record contains rubric, dataset, baseline, model, and prompt version identifiers.",
      "verify": "pnpm test",
      "maps_to_ac": "AC-3",
      "satisfied": null,
      "evidence": null,
      "remediation": null,
      "last_evaluated_cycle": null,
      "last_evaluated_commit": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "Mastra eval runner + local judge fleet role + Postgres eval store",
        "negative_control": {
          "would_fail_if": [
            "the scorer returns a constant or fixture-label-derived value",
            "the score is not generated by the configured local judge or deterministic invariant",
            "the dataset or baseline is mutable or unversioned",
            "the score record is not persisted to Postgres"
          ]
        },
        "evidence": {
          "artifact_type": "db_query",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "versioned_eval_samples",
            "action": {
              "actor": "operator",
              "steps": [
                "Run `holo evals:run --sample known-good`.",
                "Run `holo evals:drift`.",
                "Inspect the persisted eval record and its version fields."
              ]
            },
            "end_state": {
              "must_observe": [
                "fixture: `known-good`",
                "eval_score: `>=baseline_score`",
                "rubric_version: `v1`",
                "dataset_version: `v1`",
                "baseline_version: `v1`",
                "model_version: `judge-v1`",
                "prompt_version: `v1`",
                "drift_record_count: `>=1`"
              ],
              "must_not_observe": [
                "eval_record_count: `(0)`",
                "empty eval record",
                "dataset_version: `latest`",
                "baseline_version: `(none)`",
                "model_version: `(none)`",
                "prompt_version: `(none)`"
              ]
            }
          },
          {
            "start_ref": "versioned_eval_samples",
            "action": {
              "actor": "operator",
              "steps": [
                "Run `holo evals:ci --fixture deliberately-bad` and retain its persisted result despite the required non-zero exit.",
                "Run `holo evals:drift` and inspect the deliberately-bad eval record."
              ]
            },
            "end_state": {
              "must_observe": [
                "fixture: `deliberately-bad`",
                "eval_record_count: `>=1`",
                "rubric_version: `v1`",
                "dataset_version: `v1`",
                "baseline_version: `v1`",
                "model_version: `judge-v1`",
                "prompt_version: `v1`",
                "gate_outcome: `threshold-regression` or `deterministic-invariant-failure`"
              ],
              "must_not_observe": [
                "eval_record_count: `(0)`",
                "empty deliberately-bad record",
                "fixture: `known-good` only",
                "hard-coded identical eval_score and reason for both fixture names"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "TC-5",
      "type": "test_criterion",
      "description": "The known-good eval score is greater than or equal to its pinned baseline.",
      "verify": "pnpm test",
      "maps_to_ac": "AC-3",
      "satisfied": null,
      "evidence": null,
      "remediation": null,
      "last_evaluated_cycle": null,
      "last_evaluated_commit": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "Mastra eval runner + local judge fleet role + Postgres eval store",
        "negative_control": {
          "would_fail_if": [
            "the scorer returns a constant or fixture-label-derived value",
            "the score is not generated by the configured local judge or deterministic invariant",
            "the dataset or baseline is mutable or unversioned",
            "the score record is not persisted to Postgres"
          ]
        },
        "evidence": {
          "artifact_type": "db_query",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "versioned_eval_samples",
            "action": {
              "actor": "operator",
              "steps": [
                "Run `holo evals:run --sample known-good`.",
                "Run `holo evals:drift`.",
                "Inspect the persisted eval record and its version fields."
              ]
            },
            "end_state": {
              "must_observe": [
                "fixture: `known-good`",
                "eval_score: `>=baseline_score`",
                "rubric_version: `v1`",
                "dataset_version: `v1`",
                "baseline_version: `v1`",
                "model_version: `judge-v1`",
                "prompt_version: `v1`",
                "drift_record_count: `>=1`"
              ],
              "must_not_observe": [
                "eval_record_count: `(0)`",
                "empty eval record",
                "dataset_version: `latest`",
                "baseline_version: `(none)`",
                "model_version: `(none)`",
                "prompt_version: `(none)`"
              ]
            }
          },
          {
            "start_ref": "versioned_eval_samples",
            "action": {
              "actor": "operator",
              "steps": [
                "Run `holo evals:ci --fixture deliberately-bad` and retain its persisted result despite the required non-zero exit.",
                "Run `holo evals:drift` and inspect the deliberately-bad eval record."
              ]
            },
            "end_state": {
              "must_observe": [
                "fixture: `deliberately-bad`",
                "eval_record_count: `>=1`",
                "rubric_version: `v1`",
                "dataset_version: `v1`",
                "baseline_version: `v1`",
                "model_version: `judge-v1`",
                "prompt_version: `v1`",
                "gate_outcome: `threshold-regression` or `deterministic-invariant-failure`"
              ],
              "must_not_observe": [
                "eval_record_count: `(0)`",
                "empty deliberately-bad record",
                "fixture: `known-good` only",
                "hard-coded identical eval_score and reason for both fixture names"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "TC-6",
      "type": "test_criterion",
      "description": "`holo evals:ci --fixture deliberately-bad` exits non-zero after a configured threshold regression.",
      "verify": "pnpm test",
      "maps_to_ac": "AC-4",
      "satisfied": null,
      "evidence": null,
      "remediation": null,
      "last_evaluated_cycle": null,
      "last_evaluated_commit": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "e2e",
        "verification_service": "Mastra eval runner + local judge fleet role + Postgres + CI process boundary",
        "negative_control": {
          "would_fail_if": [
            "a threshold breach is caught and converted to exit code 0",
            "the CI command logs a warning instead of failing",
            "the deterministic invariant is not executed",
            "Mastra, the local judge, HTTP, or Postgres is mocked",
            "the fixture outcome is hard-coded or the test is skipped"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "versioned_eval_samples",
            "action": {
              "actor": "operator",
              "steps": [
                "Run `holo evals:ci --fixture deliberately-bad`.",
                "Capture its threshold comparison, fixture identifier, and process exit code."
              ]
            },
            "end_state": {
              "must_observe": [
                "fixture: `deliberately-bad`",
                "threshold_delta: `<0`",
                "gate_outcome: `threshold-regression`",
                "exit_code: `>=1`"
              ],
              "must_not_observe": [
                "exit_code: `0`",
                "gate_output: `empty`",
                "gate_outcome: `warning-only`",
                "scorer_result_count: `(0)`"
              ]
            }
          },
          {
            "start_ref": "versioned_eval_samples",
            "action": {
              "actor": "operator",
              "steps": [
                "Run `holo evals:ci --fixture deterministic-invariant-regression`.",
                "Capture the invariant identifier and process exit code."
              ]
            },
            "end_state": {
              "must_observe": [
                "fixture: `deterministic-invariant-regression`",
                "invariant_id: `<non-empty>`",
                "gate_outcome: `deterministic-invariant-failure`",
                "exit_code: `>=1`"
              ],
              "must_not_observe": [
                "exit_code: `0`",
                "invariant_result: `empty`",
                "invariant_result_count: `(0)`",
                "gate_outcome: `warning-only`"
              ]
            }
          },
          {
            "start_ref": "versioned_eval_samples",
            "action": {
              "actor": "operator",
              "steps": [
                "Run `holo evals:ci --fixture known-good`.",
                "Capture its pinned baseline comparison and process exit code."
              ]
            },
            "end_state": {
              "must_observe": [
                "fixture: `known-good`",
                "eval_score: `>=baseline_score`",
                "baseline_version: `v1`",
                "exit_code: `0`"
              ],
              "must_not_observe": [
                "eval_record_count: `(0)`",
                "baseline_version: `empty`",
                "gate_outcome: `threshold-regression`",
                "exit_code: `>=1`"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "TC-7",
      "type": "test_criterion",
      "description": "`holo evals:ci --fixture deterministic-invariant-regression` exits non-zero after its invariant fails.",
      "verify": "pnpm test",
      "maps_to_ac": "AC-4",
      "satisfied": null,
      "evidence": null,
      "remediation": null,
      "last_evaluated_cycle": null,
      "last_evaluated_commit": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "e2e",
        "verification_service": "Mastra eval runner + local judge fleet role + Postgres + CI process boundary",
        "negative_control": {
          "would_fail_if": [
            "a threshold breach is caught and converted to exit code 0",
            "the CI command logs a warning instead of failing",
            "the deterministic invariant is not executed",
            "Mastra, the local judge, HTTP, or Postgres is mocked",
            "the fixture outcome is hard-coded or the test is skipped"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "versioned_eval_samples",
            "action": {
              "actor": "operator",
              "steps": [
                "Run `holo evals:ci --fixture deliberately-bad`.",
                "Capture its threshold comparison, fixture identifier, and process exit code."
              ]
            },
            "end_state": {
              "must_observe": [
                "fixture: `deliberately-bad`",
                "threshold_delta: `<0`",
                "gate_outcome: `threshold-regression`",
                "exit_code: `>=1`"
              ],
              "must_not_observe": [
                "exit_code: `0`",
                "gate_output: `empty`",
                "gate_outcome: `warning-only`",
                "scorer_result_count: `(0)`"
              ]
            }
          },
          {
            "start_ref": "versioned_eval_samples",
            "action": {
              "actor": "operator",
              "steps": [
                "Run `holo evals:ci --fixture deterministic-invariant-regression`.",
                "Capture the invariant identifier and process exit code."
              ]
            },
            "end_state": {
              "must_observe": [
                "fixture: `deterministic-invariant-regression`",
                "invariant_id: `<non-empty>`",
                "gate_outcome: `deterministic-invariant-failure`",
                "exit_code: `>=1`"
              ],
              "must_not_observe": [
                "exit_code: `0`",
                "invariant_result: `empty`",
                "invariant_result_count: `(0)`",
                "gate_outcome: `warning-only`"
              ]
            }
          },
          {
            "start_ref": "versioned_eval_samples",
            "action": {
              "actor": "operator",
              "steps": [
                "Run `holo evals:ci --fixture known-good`.",
                "Capture its pinned baseline comparison and process exit code."
              ]
            },
            "end_state": {
              "must_observe": [
                "fixture: `known-good`",
                "eval_score: `>=baseline_score`",
                "baseline_version: `v1`",
                "exit_code: `0`"
              ],
              "must_not_observe": [
                "eval_record_count: `(0)`",
                "baseline_version: `empty`",
                "gate_outcome: `threshold-regression`",
                "exit_code: `>=1`"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "TC-8",
      "type": "test_criterion",
      "description": "`holo evals:ci --fixture known-good` exits zero after its score satisfies the pinned baseline.",
      "verify": "pnpm test",
      "maps_to_ac": "AC-4",
      "satisfied": null,
      "evidence": null,
      "remediation": null,
      "last_evaluated_cycle": null,
      "last_evaluated_commit": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "e2e",
        "verification_service": "Mastra eval runner + local judge fleet role + Postgres + CI process boundary",
        "negative_control": {
          "would_fail_if": [
            "a threshold breach is caught and converted to exit code 0",
            "the CI command logs a warning instead of failing",
            "the deterministic invariant is not executed",
            "Mastra, the local judge, HTTP, or Postgres is mocked",
            "the fixture outcome is hard-coded or the test is skipped"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "versioned_eval_samples",
            "action": {
              "actor": "operator",
              "steps": [
                "Run `holo evals:ci --fixture deliberately-bad`.",
                "Capture its threshold comparison, fixture identifier, and process exit code."
              ]
            },
            "end_state": {
              "must_observe": [
                "fixture: `deliberately-bad`",
                "threshold_delta: `<0`",
                "gate_outcome: `threshold-regression`",
                "exit_code: `>=1`"
              ],
              "must_not_observe": [
                "exit_code: `0`",
                "gate_output: `empty`",
                "gate_outcome: `warning-only`",
                "scorer_result_count: `(0)`"
              ]
            }
          },
          {
            "start_ref": "versioned_eval_samples",
            "action": {
              "actor": "operator",
              "steps": [
                "Run `holo evals:ci --fixture deterministic-invariant-regression`.",
                "Capture the invariant identifier and process exit code."
              ]
            },
            "end_state": {
              "must_observe": [
                "fixture: `deterministic-invariant-regression`",
                "invariant_id: `<non-empty>`",
                "gate_outcome: `deterministic-invariant-failure`",
                "exit_code: `>=1`"
              ],
              "must_not_observe": [
                "exit_code: `0`",
                "invariant_result: `empty`",
                "invariant_result_count: `(0)`",
                "gate_outcome: `warning-only`"
              ]
            }
          },
          {
            "start_ref": "versioned_eval_samples",
            "action": {
              "actor": "operator",
              "steps": [
                "Run `holo evals:ci --fixture known-good`.",
                "Capture its pinned baseline comparison and process exit code."
              ]
            },
            "end_state": {
              "must_observe": [
                "fixture: `known-good`",
                "eval_score: `>=baseline_score`",
                "baseline_version: `v1`",
                "exit_code: `0`"
              ],
              "must_not_observe": [
                "eval_record_count: `(0)`",
                "baseline_version: `empty`",
                "gate_outcome: `threshold-regression`",
                "exit_code: `>=1`"
              ]
            }
          }
        ]
      }
    }
  ]
}
-->

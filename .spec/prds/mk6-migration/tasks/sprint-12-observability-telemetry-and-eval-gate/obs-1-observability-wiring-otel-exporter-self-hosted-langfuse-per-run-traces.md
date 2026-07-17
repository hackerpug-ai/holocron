# obs-1 — Observability wiring — OTel exporter → self-hosted Langfuse (per-run traces)
> Status: Backlog
> Sprint: [Sprint 12 — Observability, Telemetry and Eval Gate](../SPRINT.md)
> Agent: mastra-evals-implementer
> Reviewer: mastra-reviewer
> Estimate: 210 min
> Type: FEATURE
> Priority: P0
> Proposed by: mastra-evals-implementer
> TDD_MODE: red_first · RED_GREEN_REQUIRED: yes · SEEDED_EVIDENCE_REQUIRED: yes

## Outcome

Wire Mastra tracing to self-hosted Langfuse while retaining Postgres observability storage and preserving run-level trace correlation.

**Success state:** A real research mission produces exactly one queryable Langfuse trace with model child spans, redacted payloads, and explicit export failure evidence when Langfuse is unavailable.

## Background

- **Specialist rationale:** Owns Mastra observability, trace export, Langfuse integration, and real-service eval evidence.
- **Planning rationale:** Trace export is the first detective-control boundary and must exist before eval results can be correlated with real mission runs.
- **Capability touchpoints:** CAP-INF-01
- **Provides:** per-run-otel-trace-contract; self-hosted-langfuse-exporter; trace-id-and-run-id-correlation; redacted-trace-export
- **Consumes:** Mastra Observability instance; Postgres MastraStorageExporter; mission-run context

## Critical Constraints

### MUST

- MUST emit every mission run and model call through the configured Mastra Observability instance.
- MUST preserve one stable trace ID across the run root and all child model spans.

### NEVER

- NEVER treat Postgres trace rows, console output, or a no-op exporter as proof of Langfuse delivery.
- NEVER export API keys, raw secret fixtures, or unredacted sensitive prompt bodies.

### STRICTLY

- STRICTLY use the self-hosted Langfuse endpoint from server configuration and fail the real integration proof when it is unreachable.

## Specification

**Objective:** Wire Mastra tracing to self-hosted Langfuse while retaining Postgres observability storage and preserving run-level trace correlation.

**Success state:** A real research mission produces exactly one queryable Langfuse trace with model child spans, redacted payloads, and explicit export failure evidence when Langfuse is unavailable.

**Boundary contracts:**
- Mastra run and model spans cross the process boundary into self-hosted Langfuse with one trace per run
- Trace export uses server-side Langfuse credentials and never exposes them to clients
- Exporter flush and transport failures are observable and cannot become silent no-op success
- Sensitive prompt and response fields are redacted before external export

## Acceptance Criteria

### AC-1: One Langfuse trace per mission run [PRIMARY]
**GIVEN:** Self-hosted Langfuse, Postgres, Mastra, and the local fleet are running with the shared research fixture.
**WHEN:** The operator runs the real research mission command.
**THEN:** Exactly one Langfuse trace is queryable for the mission run with a non-empty trace ID.
**VERIFY:** `bun services/platform/src/cli/holo.ts mission run research --goal 'Observability trace fixture' --json`
**TEST_TIER:** integration
**VERIFICATION_SERVICE:** Mastra + Postgres + self-hosted Langfuse + local fleet
**FLOW_REF:** UC-PLAT-04
**TDD_STATE:** none
**UNIT_TEST_JUSTIFIED:** null
#### Scenario contract
```json
{
  "tier": "visible",
  "test_tier": "integration",
  "verification_service": "Mastra + Postgres + self-hosted Langfuse + local fleet",
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
      "start_ref": "research_run",
      "action": {
        "actor": "operator",
        "steps": [
          "Run the public mission CLI against the running stack.",
          "Query self-hosted Langfuse by the emitted run or trace identifier."
        ]
      },
      "end_state": {
        "must_observe": [
          "trace count: 1",
          "traceId: <non-empty Langfuse trace ID>",
          "serviceName: 'holocron-platform'"
        ],
        "must_not_observe": [
          "trace count: 0",
          "duplicate root traces",
          "empty Langfuse response"
        ]
      }
    }
  ]
}
```

### AC-2: Child model spans correlate to the run
**GIVEN:** The research fixture produces at least one real model call.
**WHEN:** The operator inspects the Langfuse trace after mission completion.
**THEN:** The trace contains a model-generation child span carrying the parent run trace ID and role metadata.
**VERIFY:** `PLATFORM_IT=1 pnpm test -- services/platform/tests/integration/observability-traces.test.ts`
**TEST_TIER:** integration
**VERIFICATION_SERVICE:** Mastra + Postgres + self-hosted Langfuse + local fleet
**FLOW_REF:** UC-PLAT-04
**TDD_STATE:** none
**UNIT_TEST_JUSTIFIED:** null
#### Scenario contract
```json
{
  "tier": "visible",
  "test_tier": "integration",
  "verification_service": "Mastra + Postgres + self-hosted Langfuse + local fleet",
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
      "start_ref": "research_run",
      "action": {
        "actor": "operator",
        "steps": [
          "Run the real research mission.",
          "Fetch the trace and inspect its child spans and role attributes."
        ]
      },
      "end_state": {
        "must_observe": [
          "model-generation child spans: >=1",
          "parent traceId: same as root traceId",
          "role: 'divergent' or 'convergent'"
        ],
        "must_not_observe": [
          "child span count: 0",
          "orphan model span",
          "empty role metadata"
        ]
      }
    }
  ]
}
```

### AC-3: Langfuse export failure is explicit
**GIVEN:** The self-hosted Langfuse endpoint is stopped while Postgres and the local fleet remain available.
**WHEN:** The operator runs the research mission.
**THEN:** The command reports an explicit trace-export failure and does not claim a green Langfuse result.
**VERIFY:** `PLATFORM_IT=1 pnpm test -- services/platform/tests/integration/observability-traces.test.ts -t 'export failure'`
**TEST_TIER:** integration
**VERIFICATION_SERVICE:** Mastra + Postgres + self-hosted Langfuse + local fleet
**FLOW_REF:** UC-PLAT-04
**TDD_STATE:** none
**UNIT_TEST_JUSTIFIED:** null
#### Scenario contract
```json
{
  "tier": "visible",
  "test_tier": "integration",
  "verification_service": "Mastra + Postgres + self-hosted Langfuse",
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
      "start_ref": "langfuse_down",
      "action": {
        "actor": "operator",
        "steps": [
          "Stop the self-hosted Langfuse service.",
          "Run the same public research mission command."
        ]
      },
      "end_state": {
        "must_observe": [
          "process exit: 1",
          "error code: 'LANGFUSE_EXPORT_FAILED'",
          "green Langfuse verdict: false"
        ],
        "must_not_observe": [
          "trace count: 0",
          "silent console-only fallback",
          "empty success payload"
        ]
      }
    }
  ]
}
```

### AC-4: Trace payloads are redacted
**GIVEN:** The redaction fixture contains a secret sentinel and synthetic PII.
**WHEN:** The operator runs the mission and fetches its Langfuse trace.
**THEN:** The exported trace contains redacted fields and does not contain the raw sentinel or synthetic PII.
**VERIFY:** `PLATFORM_IT=1 pnpm test -- services/platform/tests/integration/observability-traces.test.ts -t 'redaction'`
**TEST_TIER:** integration
**VERIFICATION_SERVICE:** Mastra + Postgres + self-hosted Langfuse
**FLOW_REF:** UC-PLAT-04
**TDD_STATE:** none
**UNIT_TEST_JUSTIFIED:** null
#### Scenario contract
```json
{
  "tier": "visible",
  "test_tier": "integration",
  "verification_service": "Mastra + self-hosted Langfuse",
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
      "start_ref": "redaction_input",
      "action": {
        "actor": "operator",
        "steps": [
          "Run the mission with the sentinel secret and synthetic PII.",
          "Retrieve the exported trace payload from self-hosted Langfuse."
        ]
      },
      "end_state": {
        "must_observe": [
          "redacted field: '[REDACTED]'",
          "raw secret matches: 0",
          "raw PII matches: 0"
        ],
        "must_not_observe": [
          "empty trace payload",
          "trace-secret-001",
          "trace@example.invalid"
        ]
      }
    }
  ]
}
```

## Test Criteria

- **TC-1** (maps to AC-1) — A Langfuse trace exists when a research mission completes. — VERIFY: `bun services/platform/src/cli/holo.ts mission run research --goal 'Observability trace fixture' --json`
- **TC-2** (maps to AC-2) — A model-generation child span exists when the mission makes a model call. — VERIFY: `PLATFORM_IT=1 pnpm test -- services/platform/tests/integration/observability-traces.test.ts -t 'child span'`
- **TC-3** (maps to AC-3) — A Langfuse export failure is reported when the Langfuse endpoint is unavailable. — VERIFY: `PLATFORM_IT=1 pnpm test -- services/platform/tests/integration/observability-traces.test.ts -t 'export failure'`
- **TC-4** (maps to AC-4) — The raw redaction sentinel is absent from exported trace payloads when the redaction fixture runs. — VERIFY: `PLATFORM_IT=1 pnpm test -- services/platform/tests/integration/observability-traces.test.ts -t 'redaction'`

## Requirement Traceability

```json
[
  {
    "id": "AC-1",
    "type": "acceptance_criterion",
    "description": "GIVEN the real stack and research fixture WHEN the mission command runs THEN exactly one Langfuse trace is queryable with a non-empty trace ID.",
    "verify": "bun services/platform/src/cli/holo.ts mission run research --goal 'Observability trace fixture' --json",
    "maps_to_ac": "AC-1",
    "scenario": {
      "tier": "visible",
      "test_tier": "integration",
      "verification_service": "Mastra + Postgres + self-hosted Langfuse + local fleet",
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
          "start_ref": "research_run",
          "action": {
            "actor": "operator",
            "steps": [
              "Run the public mission CLI against the running stack.",
              "Query self-hosted Langfuse by the emitted run or trace identifier."
            ]
          },
          "end_state": {
            "must_observe": [
              "trace count: 1",
              "traceId: <non-empty Langfuse trace ID>",
              "serviceName: 'holocron-platform'"
            ],
            "must_not_observe": [
              "trace count: 0",
              "duplicate root traces",
              "empty Langfuse response"
            ]
          }
        }
      ]
    }
  },
  {
    "id": "AC-2",
    "type": "acceptance_criterion",
    "description": "GIVEN a real model call WHEN the trace is inspected THEN its model-generation child span shares the parent trace ID and has role metadata.",
    "verify": "PLATFORM_IT=1 pnpm test -- services/platform/tests/integration/observability-traces.test.ts",
    "maps_to_ac": "AC-2",
    "scenario": {
      "tier": "visible",
      "test_tier": "integration",
      "verification_service": "Mastra + Postgres + self-hosted Langfuse + local fleet",
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
          "start_ref": "research_run",
          "action": {
            "actor": "operator",
            "steps": [
              "Run the real research mission.",
              "Fetch the trace and inspect its child spans and role attributes."
            ]
          },
          "end_state": {
            "must_observe": [
              "model-generation child spans: >=1",
              "parent traceId: same as root traceId",
              "role: 'divergent' or 'convergent'"
            ],
            "must_not_observe": [
              "child span count: 0",
              "orphan model span",
              "empty role metadata"
            ]
          }
        }
      ]
    }
  },
  {
    "id": "AC-3",
    "type": "acceptance_criterion",
    "description": "GIVEN Langfuse is stopped WHEN the mission runs THEN export failure is explicit and no green Langfuse result is claimed.",
    "verify": "PLATFORM_IT=1 pnpm test -- services/platform/tests/integration/observability-traces.test.ts -t 'export failure'",
    "maps_to_ac": "AC-3",
    "scenario": {
      "tier": "visible",
      "test_tier": "integration",
      "verification_service": "Mastra + Postgres + self-hosted Langfuse",
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
          "start_ref": "langfuse_down",
          "action": {
            "actor": "operator",
            "steps": [
              "Stop the self-hosted Langfuse service.",
              "Run the same public research mission command."
            ]
          },
          "end_state": {
            "must_observe": [
              "process exit: 1",
              "error code: 'LANGFUSE_EXPORT_FAILED'",
              "green Langfuse verdict: false"
            ],
            "must_not_observe": [
              "trace count: 0",
              "silent console-only fallback",
              "empty success payload"
            ]
          }
        }
      ]
    }
  },
  {
    "id": "AC-4",
    "type": "acceptance_criterion",
    "description": "GIVEN a sensitive redaction fixture WHEN the trace is fetched THEN raw secret and synthetic PII values are absent.",
    "verify": "PLATFORM_IT=1 pnpm test -- services/platform/tests/integration/observability-traces.test.ts -t 'redaction'",
    "maps_to_ac": "AC-4",
    "scenario": {
      "tier": "visible",
      "test_tier": "integration",
      "verification_service": "Mastra + self-hosted Langfuse",
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
          "start_ref": "redaction_input",
          "action": {
            "actor": "operator",
            "steps": [
              "Run the mission with the sentinel secret and synthetic PII.",
              "Retrieve the exported trace payload from self-hosted Langfuse."
            ]
          },
          "end_state": {
            "must_observe": [
              "redacted field: '[REDACTED]'",
              "raw secret matches: 0",
              "raw PII matches: 0"
            ],
            "must_not_observe": [
              "empty trace payload",
              "trace-secret-001",
              "trace@example.invalid"
            ]
          }
        }
      ]
    }
  },
  {
    "id": "TC-1",
    "type": "test_criterion",
    "description": "A Langfuse trace exists when a research mission completes.",
    "maps_to_ac": "AC-1",
    "verify": "bun services/platform/src/cli/holo.ts mission run research --goal 'Observability trace fixture' --json",
    "scenario": {
      "tier": "visible",
      "test_tier": "integration",
      "verification_service": "Mastra + Postgres + self-hosted Langfuse + local fleet",
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
          "start_ref": "research_run",
          "action": {
            "actor": "operator",
            "steps": [
              "Run the public mission CLI against the running stack.",
              "Query self-hosted Langfuse by the emitted run or trace identifier."
            ]
          },
          "end_state": {
            "must_observe": [
              "trace count: 1",
              "traceId: <non-empty Langfuse trace ID>",
              "serviceName: 'holocron-platform'"
            ],
            "must_not_observe": [
              "trace count: 0",
              "duplicate root traces",
              "empty Langfuse response"
            ]
          }
        }
      ]
    }
  },
  {
    "id": "TC-2",
    "type": "test_criterion",
    "description": "A model-generation child span exists when the mission makes a model call.",
    "maps_to_ac": "AC-2",
    "verify": "PLATFORM_IT=1 pnpm test -- services/platform/tests/integration/observability-traces.test.ts -t 'child span'",
    "scenario": {
      "tier": "visible",
      "test_tier": "integration",
      "verification_service": "Mastra + Postgres + self-hosted Langfuse + local fleet",
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
          "start_ref": "research_run",
          "action": {
            "actor": "operator",
            "steps": [
              "Run the real research mission.",
              "Fetch the trace and inspect its child spans and role attributes."
            ]
          },
          "end_state": {
            "must_observe": [
              "model-generation child spans: >=1",
              "parent traceId: same as root traceId",
              "role: 'divergent' or 'convergent'"
            ],
            "must_not_observe": [
              "child span count: 0",
              "orphan model span",
              "empty role metadata"
            ]
          }
        }
      ]
    }
  },
  {
    "id": "TC-3",
    "type": "test_criterion",
    "description": "A Langfuse export failure is reported when the Langfuse endpoint is unavailable.",
    "maps_to_ac": "AC-3",
    "verify": "PLATFORM_IT=1 pnpm test -- services/platform/tests/integration/observability-traces.test.ts -t 'export failure'",
    "scenario": {
      "tier": "visible",
      "test_tier": "integration",
      "verification_service": "Mastra + Postgres + self-hosted Langfuse",
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
          "start_ref": "langfuse_down",
          "action": {
            "actor": "operator",
            "steps": [
              "Stop the self-hosted Langfuse service.",
              "Run the same public research mission command."
            ]
          },
          "end_state": {
            "must_observe": [
              "process exit: 1",
              "error code: 'LANGFUSE_EXPORT_FAILED'",
              "green Langfuse verdict: false"
            ],
            "must_not_observe": [
              "trace count: 0",
              "silent console-only fallback",
              "empty success payload"
            ]
          }
        }
      ]
    }
  },
  {
    "id": "TC-4",
    "type": "test_criterion",
    "description": "The raw redaction sentinel is absent from exported trace payloads when the redaction fixture runs.",
    "maps_to_ac": "AC-4",
    "verify": "PLATFORM_IT=1 pnpm test -- services/platform/tests/integration/observability-traces.test.ts -t 'redaction'",
    "scenario": {
      "tier": "visible",
      "test_tier": "integration",
      "verification_service": "Mastra + self-hosted Langfuse",
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
          "start_ref": "redaction_input",
          "action": {
            "actor": "operator",
            "steps": [
              "Run the mission with the sentinel secret and synthetic PII.",
              "Retrieve the exported trace payload from self-hosted Langfuse."
            ]
          },
          "end_state": {
            "must_observe": [
              "redacted field: '[REDACTED]'",
              "raw secret matches: 0",
              "raw PII matches: 0"
            ],
            "must_not_observe": [
              "empty trace payload",
              "trace-secret-001",
              "trace@example.invalid"
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

- services/platform/src/mastra.ts (MODIFY)
- services/platform/src/compat/cells/otel.ts (MODIFY)
- services/platform/src/cli/holo.ts (MODIFY, only mission trace wiring)
- services/platform/src/observability/langfuse-exporter.ts (NEW)
- services/platform/tests/integration/observability-traces.test.ts (NEW)

### WRITE-PROHIBITED

- .spec/** — planning artifacts are read-only
- .tmp/** — runtime evidence is generated by tests
- services/platform/src/inference/** — consume inference APIs without changing router behavior
- app/** and components/** — no client changes
- any file not explicitly listed above

## Reading List

1. **services/platform/src/mastra.ts** (all) — Current Mastra storage and Observability composition root.
2. **services/platform/src/compat/cells/otel.ts** (all) — Existing real Postgres trace flush and trace lookup pattern.
3. **services/platform/src/compat/spike.ts** (all) — Real agent/workflow/OTel smoke composition.
4. **.spec/prds/mk6-migration/10-technical-requirements/11-runtime-contracts.md** (39-47) — Versioned eval and observable-outcome contract.
5. **https://langfuse.com/docs** (all) — Self-hosted Langfuse OTel ingestion and trace query contract.

## Design

```json
{
  "references": [
    "services/platform/src/mastra.ts",
    "services/platform/src/compat/cells/otel.ts",
    "services/platform/src/compat/spike.ts"
  ],
  "interaction_notes": [
    "The mission run owns the root trace context; model calls inherit it.",
    "Postgres storage and Langfuse are parallel exporters, not substitutes.",
    "Exporter flush is explicit before integration assertions."
  ],
  "pattern": "Use the existing Mastra Observability configuration and exporter lifecycle, adding a real OTLP/Langfuse exporter with server-side configuration.",
  "pattern_source": "services/platform/src/mastra.ts:20-34",
  "anti_pattern": "Do not leave serviceName as compat-spike, add telemetry:{} from Mastra 0.x, or return success without a Langfuse trace."
}
```

## Code Pattern

The implementation or review must follow the specialist `pattern`, `pattern_source`, and `anti_pattern` recorded in the Design section above.

## Agent Instructions

Implement only the specialist-defined scope as agent `mastra-evals-implementer`. Preserve every MUST, NEVER, STRICTLY, scenario negative control, and public-command evidence requirement. Do not replace real services with mocks, stubs, static fixtures, or warning-only success paths.

**Assignment rationale:** Owns Mastra observability, trace export, Langfuse integration, and real-service eval evidence.

## Coding Standards

- `/Users/inference1/Projects/brain/skills/coding-standards/SKILL.md`
- `/Users/inference1/Projects/brain/docs/TDD-METHODOLOGY.md`
- `/Users/inference1/Projects/brain/docs/TESTING-HIERARCHY.md`
- `/Users/inference1/Projects/brain/docs/CAPABILITY-CHAIN-PLANNING.md`

## Orchestrator Verification Protocol

Verification is evidence-gated: run the specialist gates below, then the repository gates. A green result is invalid if the command did not exercise the named real service or if the required seeded scenario/evidence artifact is absent.

- **Real trace integration** — `PLATFORM_IT=1 pnpm test -- services/platform/tests/integration/observability-traces.test.ts` → Exit 0 against real Mastra, Postgres, fleet, and self-hosted Langfuse.
- **Real CLI trace** — `bun services/platform/src/cli/holo.ts mission run research --goal 'Observability trace fixture' --json` → Exit 0 and one trace is queryable in self-hosted Langfuse.
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
- **Estimate:** 210 minutes
- **Sprint:** Sprint 12

## Evidence Gates

- **Real trace integration** — `PLATFORM_IT=1 pnpm test -- services/platform/tests/integration/observability-traces.test.ts` → Exit 0 against real Mastra, Postgres, fleet, and self-hosted Langfuse.
- **Real CLI trace** — `bun services/platform/src/cli/holo.ts mission run research --goal 'Observability trace fixture' --json` → Exit 0 and one trace is queryable in self-hosted Langfuse.
- **Lint** — `pnpm biome check --write --no-errors-on-unmatched --diagnostic-level=error {staged_files}` → Exit 0.
- **Typecheck** — `pnpm tsgo --noEmit` → Exit 0.
- **Full test suite** — `pnpm test` → Exit 0.

## Review Criteria

- Reviewer verifies all acceptance criteria, test criteria, guardrails, scope compliance, real-service evidence, and the requirement contract.

## Dependencies

```json
{
  "depends_on": [
    "Sprint 04",
    "Sprint 05",
    "Sprint 08"
  ],
  "blocks": [
    "obs-3"
  ],
  "parallel_with": [
    "obs-2"
  ]
}
```

## Notes

- Preserve the task-level requirement contract and all specialist-proposed evidence obligations through implementation and review.

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "obs-1",
  "proposed_by": "mastra-evals-implementer",
  "tdd_mode": "red_first",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": true,
    "requires_seeded_evidence": true
  },
  "fixtures": {
    "research_run": {
      "description": "A real research mission with a non-empty goal that produces at least one model call.",
      "seed_method": "cli",
      "entrypoint": "bun services/platform/src/cli/holo.ts mission run research --goal 'Observability trace fixture'",
      "records": [
        "real mission run id",
        "real Langfuse trace id",
        "trace count: 1",
        "at least one model-generation child span"
      ]
    },
    "langfuse_down": {
      "description": "The same real mission fixture executed while the configured self-hosted Langfuse endpoint is stopped.",
      "seed_method": "cli",
      "entrypoint": "bun services/platform/src/cli/holo.ts mission run research --goal 'Observability trace failure fixture'",
      "records": [
        "Langfuse transport failure",
        "process exit: 1",
        "error code: LANGFUSE_EXPORT_FAILED"
      ]
    },
    "redaction_input": {
      "description": "A real mission goal containing a sentinel secret and synthetic PII that must not appear in exported span payloads.",
      "seed_method": "cli",
      "entrypoint": "bun services/platform/src/cli/holo.ts mission run research --goal 'Redaction fixture secret=trace-secret-001 email=trace@example.invalid'",
      "records": [
        "redacted field: [REDACTED]",
        "raw secret matches: 0",
        "raw PII matches: 0"
      ]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "description": "GIVEN the real stack and research fixture WHEN the mission command runs THEN exactly one Langfuse trace is queryable with a non-empty trace ID.",
      "verify": "bun services/platform/src/cli/holo.ts mission run research --goal 'Observability trace fixture' --json",
      "maps_to_ac": "AC-1",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "Mastra + Postgres + self-hosted Langfuse + local fleet",
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
            "start_ref": "research_run",
            "action": {
              "actor": "operator",
              "steps": [
                "Run the public mission CLI against the running stack.",
                "Query self-hosted Langfuse by the emitted run or trace identifier."
              ]
            },
            "end_state": {
              "must_observe": [
                "trace count: 1",
                "traceId: <non-empty Langfuse trace ID>",
                "serviceName: 'holocron-platform'"
              ],
              "must_not_observe": [
                "trace count: 0",
                "duplicate root traces",
                "empty Langfuse response"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-2",
      "type": "acceptance_criterion",
      "description": "GIVEN a real model call WHEN the trace is inspected THEN its model-generation child span shares the parent trace ID and has role metadata.",
      "verify": "PLATFORM_IT=1 pnpm test -- services/platform/tests/integration/observability-traces.test.ts",
      "maps_to_ac": "AC-2",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "Mastra + Postgres + self-hosted Langfuse + local fleet",
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
            "start_ref": "research_run",
            "action": {
              "actor": "operator",
              "steps": [
                "Run the real research mission.",
                "Fetch the trace and inspect its child spans and role attributes."
              ]
            },
            "end_state": {
              "must_observe": [
                "model-generation child spans: >=1",
                "parent traceId: same as root traceId",
                "role: 'divergent' or 'convergent'"
              ],
              "must_not_observe": [
                "child span count: 0",
                "orphan model span",
                "empty role metadata"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-3",
      "type": "acceptance_criterion",
      "description": "GIVEN Langfuse is stopped WHEN the mission runs THEN export failure is explicit and no green Langfuse result is claimed.",
      "verify": "PLATFORM_IT=1 pnpm test -- services/platform/tests/integration/observability-traces.test.ts -t 'export failure'",
      "maps_to_ac": "AC-3",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "Mastra + Postgres + self-hosted Langfuse",
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
            "start_ref": "langfuse_down",
            "action": {
              "actor": "operator",
              "steps": [
                "Stop the self-hosted Langfuse service.",
                "Run the same public research mission command."
              ]
            },
            "end_state": {
              "must_observe": [
                "process exit: 1",
                "error code: 'LANGFUSE_EXPORT_FAILED'",
                "green Langfuse verdict: false"
              ],
              "must_not_observe": [
                "trace count: 0",
                "silent console-only fallback",
                "empty success payload"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-4",
      "type": "acceptance_criterion",
      "description": "GIVEN a sensitive redaction fixture WHEN the trace is fetched THEN raw secret and synthetic PII values are absent.",
      "verify": "PLATFORM_IT=1 pnpm test -- services/platform/tests/integration/observability-traces.test.ts -t 'redaction'",
      "maps_to_ac": "AC-4",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "Mastra + self-hosted Langfuse",
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
            "start_ref": "redaction_input",
            "action": {
              "actor": "operator",
              "steps": [
                "Run the mission with the sentinel secret and synthetic PII.",
                "Retrieve the exported trace payload from self-hosted Langfuse."
              ]
            },
            "end_state": {
              "must_observe": [
                "redacted field: '[REDACTED]'",
                "raw secret matches: 0",
                "raw PII matches: 0"
              ],
              "must_not_observe": [
                "empty trace payload",
                "trace-secret-001",
                "trace@example.invalid"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "TC-1",
      "type": "test_criterion",
      "description": "A Langfuse trace exists when a research mission completes.",
      "maps_to_ac": "AC-1",
      "verify": "bun services/platform/src/cli/holo.ts mission run research --goal 'Observability trace fixture' --json",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "Mastra + Postgres + self-hosted Langfuse + local fleet",
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
            "start_ref": "research_run",
            "action": {
              "actor": "operator",
              "steps": [
                "Run the public mission CLI against the running stack.",
                "Query self-hosted Langfuse by the emitted run or trace identifier."
              ]
            },
            "end_state": {
              "must_observe": [
                "trace count: 1",
                "traceId: <non-empty Langfuse trace ID>",
                "serviceName: 'holocron-platform'"
              ],
              "must_not_observe": [
                "trace count: 0",
                "duplicate root traces",
                "empty Langfuse response"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "TC-2",
      "type": "test_criterion",
      "description": "A model-generation child span exists when the mission makes a model call.",
      "maps_to_ac": "AC-2",
      "verify": "PLATFORM_IT=1 pnpm test -- services/platform/tests/integration/observability-traces.test.ts -t 'child span'",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "Mastra + Postgres + self-hosted Langfuse + local fleet",
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
            "start_ref": "research_run",
            "action": {
              "actor": "operator",
              "steps": [
                "Run the real research mission.",
                "Fetch the trace and inspect its child spans and role attributes."
              ]
            },
            "end_state": {
              "must_observe": [
                "model-generation child spans: >=1",
                "parent traceId: same as root traceId",
                "role: 'divergent' or 'convergent'"
              ],
              "must_not_observe": [
                "child span count: 0",
                "orphan model span",
                "empty role metadata"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "TC-3",
      "type": "test_criterion",
      "description": "A Langfuse export failure is reported when the Langfuse endpoint is unavailable.",
      "maps_to_ac": "AC-3",
      "verify": "PLATFORM_IT=1 pnpm test -- services/platform/tests/integration/observability-traces.test.ts -t 'export failure'",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "Mastra + Postgres + self-hosted Langfuse",
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
            "start_ref": "langfuse_down",
            "action": {
              "actor": "operator",
              "steps": [
                "Stop the self-hosted Langfuse service.",
                "Run the same public research mission command."
              ]
            },
            "end_state": {
              "must_observe": [
                "process exit: 1",
                "error code: 'LANGFUSE_EXPORT_FAILED'",
                "green Langfuse verdict: false"
              ],
              "must_not_observe": [
                "trace count: 0",
                "silent console-only fallback",
                "empty success payload"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "TC-4",
      "type": "test_criterion",
      "description": "The raw redaction sentinel is absent from exported trace payloads when the redaction fixture runs.",
      "maps_to_ac": "AC-4",
      "verify": "PLATFORM_IT=1 pnpm test -- services/platform/tests/integration/observability-traces.test.ts -t 'redaction'",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "Mastra + self-hosted Langfuse",
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
            "start_ref": "redaction_input",
            "action": {
              "actor": "operator",
              "steps": [
                "Run the mission with the sentinel secret and synthetic PII.",
                "Retrieve the exported trace payload from self-hosted Langfuse."
              ]
            },
            "end_state": {
              "must_observe": [
                "redacted field: '[REDACTED]'",
                "raw secret matches: 0",
                "raw PII matches: 0"
              ],
              "must_not_observe": [
                "empty trace payload",
                "trace-secret-001",
                "trace@example.invalid"
              ]
            }
          }
        ]
      }
    }
  ]
}
-->

# obs-2 — Inference telemetry stream (tokens/wall-ms/endpoint/role) → Postgres per call
> Status: ✅ Completed
> Commit: 9b1f59c890152860582259dfd8eaa0c7075a263d
> Completed: 2026-07-17T23:30:39Z
> Sprint: [Sprint 12 — Observability, Telemetry and Eval Gate](../SPRINT.md)
> Agent: mastra-evals-implementer
> Estimate: 150 min
> Type: FEATURE
> Priority: P0
> Proposed by: mastra-evals-implementer
> TDD_MODE: red_first · RED_GREEN_REQUIRED: yes · SEEDED_EVIDENCE_REQUIRED: yes

## Outcome

Persist one durable, redacted inference telemetry record per real model call and expose the records through holo telemetry:tail.

**Success state:** A research run writes one inspectable Postgres row per model call with tokens, wall-ms, endpoint, role, provider, run ID, trace ID, and terminal status; budgeted escapes correlate to budget_ledger.

## Background

- **Specialist rationale:** Owns per-call usage capture, Postgres persistence, CLI visibility, and budget-ledger correlation.
- **Planning rationale:** Per-call telemetry is the durable detective-control substrate for cost, latency, routing, degraded-mode, and eval traceability.
- **Capability touchpoints:** CAP-INF-01
- **Provides:** per-model-call-inference-telemetry-row; telemetry-to-trace-and-run-correlation; telemetry-tail-cli; budget-ledger-to-telemetry-correlation
- **Consumes:** resolveModel role and endpoint resolution; Mastra model-generation lifecycle; CAP-INF-01 budget ledger; Postgres migration and application-role access

## Critical Constraints

### MUST

- MUST capture successful and failed real model calls at the model-call boundary, including zero-token failure cases with explicit status.
- MUST persist endpoint, role, wall-ms, token fields, run ID, and trace ID without logging prompt or response secrets.

### NEVER

- NEVER synthesize a successful telemetry row when the fleet or provider call was not made.
- NEVER use the legacy agent_telemetry table as a lossy substitute for inference-call telemetry.

### STRICTLY

- STRICTLY keep default calls fleet-first and require budget-ledger evidence before recording an explicit cloud escape.

## Specification

**Objective:** Persist one durable, redacted inference telemetry record per real model call and expose the records through holo telemetry:tail.

**Success state:** A research run writes one inspectable Postgres row per model call with tokens, wall-ms, endpoint, role, provider, run ID, trace ID, and terminal status; budgeted escapes correlate to budget_ledger.

**Boundary contracts:**
- Every real model call produces one Postgres telemetry row with role, endpoint, wall time, token usage, status, run ID, and trace ID
- Default inference records the local fleet endpoint and never silently records a cloud fallback
- Explicit Anthropic escape records the same call identity and links to a budget-ledger row
- Failed model calls remain observable without being converted into synthetic successful calls
- The operator tail reads durable Postgres rows rather than process-local buffers

## Acceptance Criteria

### AC-1: One durable row per model call [PRIMARY]
**GIVEN:** Postgres, Mastra, the local fleet, and the shared research fixture are running.
**WHEN:** The operator runs the real research mission.
**THEN:** Postgres contains one inference telemetry row per observed model call with tokens, wall-ms, endpoint, role, run ID, and trace ID.
**VERIFY:** `PLATFORM_IT=1 pnpm test -- services/platform/tests/integration/inference-telemetry.test.ts`
**TEST_TIER:** integration
**VERIFICATION_SERVICE:** Mastra + Postgres + local fleet
**FLOW_REF:** UC-PLAT-04
**TDD_STATE:** none
**UNIT_TEST_JUSTIFIED:** null
#### Scenario contract
```json
{
  "tier": "visible",
  "test_tier": "integration",
  "verification_service": "Mastra + Postgres + local fleet",
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
      "start_ref": "fleet_model_run",
      "action": {
        "actor": "operator",
        "steps": [
          "Run the public research mission command.",
          "Query inference telemetry by the emitted run ID."
        ]
      },
      "end_state": {
        "must_observe": [
          "telemetry row count: >=2",
          "wallMs: >0",
          "inputTokens: >=1",
          "outputTokens: >=1",
          "endpoint: 'http://127.0.0.1:4545/v1'",
          "role: 'divergent'",
          "traceId: <non-empty>"
        ],
        "must_not_observe": [
          "telemetry row count: 0",
          "empty usage fields",
          "raw prompt body in telemetry"
        ]
      }
    }
  ]
}
```

### AC-2: Default path records local fleet routing
**GIVEN:** The default research mission uses resolveModel without allowEscape.
**WHEN:** The mission completes and its telemetry is queried.
**THEN:** Every default-path row identifies a local fleet endpoint and no Anthropic endpoint appears.
**VERIFY:** `PLATFORM_IT=1 pnpm test -- services/platform/tests/integration/inference-telemetry.test.ts -t 'local fleet'`
**TEST_TIER:** integration
**VERIFICATION_SERVICE:** Mastra + Postgres + local fleet
**FLOW_REF:** UC-PLAT-04
**TDD_STATE:** none
**UNIT_TEST_JUSTIFIED:** null
#### Scenario contract
```json
{
  "tier": "visible",
  "test_tier": "integration",
  "verification_service": "Mastra + Postgres + local fleet",
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
      "start_ref": "fleet_model_run",
      "action": {
        "actor": "operator",
        "steps": [
          "Run the default research mission with no escape flag.",
          "Query provider and endpoint columns for all rows in the run."
        ]
      },
      "end_state": {
        "must_observe": [
          "provider: 'fleet'",
          "endpoint: 'http://127.0.0.1:4545/v1'",
          "role: 'divergent'"
        ],
        "must_not_observe": [
          "default cloud rows: 0",
          "api.anthropic.com",
          "empty provider value"
        ]
      }
    }
  ]
}
```

### AC-3: Budgeted escape is cross-ledger visible
**GIVEN:** A declared escape has a reachable Anthropic endpoint and sufficient budget ceiling.
**WHEN:** The operator executes the real budgeted escape fixture.
**THEN:** The inference telemetry row and budget_ledger rows share the run or step identity and record provider usage.
**VERIFY:** `PLATFORM_IT=1 pnpm test -- services/platform/tests/integration/inference-telemetry.test.ts -t 'budgeted escape'`
**TEST_TIER:** integration
**VERIFICATION_SERVICE:** Mastra + Postgres + Anthropic escape + budget ledger
**FLOW_REF:** UC-PLAT-04
**TDD_STATE:** none
**UNIT_TEST_JUSTIFIED:** null
#### Scenario contract
```json
{
  "tier": "visible",
  "test_tier": "integration",
  "verification_service": "Mastra + Postgres + Anthropic escape + budget ledger",
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
      "start_ref": "budgeted_escape",
      "action": {
        "actor": "operator",
        "steps": [
          "Set or verify a positive budget ceiling.",
          "Run the declared escape through the public CLI.",
          "Query inference_telemetry and budget_ledger using the emitted run or step identity."
        ]
      },
      "end_state": {
        "must_observe": [
          "pre-check rows: 1",
          "escape rows: 1",
          "telemetry rows: 1",
          "provider: 'anthropic'",
          "runId: '<fixture-run-id>'"
        ],
        "must_not_observe": [
          "pre-check rows: 0",
          "unmetered escape",
          "empty provider value"
        ]
      }
    }
  ]
}
```

### AC-4: Telemetry tail exposes durable rows
**GIVEN:** The fleet model fixture has completed and its rows are persisted in Postgres.
**WHEN:** The operator runs holo telemetry:tail for the fixture run.
**THEN:** The command prints rows containing tokens, wall-ms, endpoint, role, provider, run ID, and trace ID.
**VERIFY:** `bun services/platform/src/cli/holo.ts telemetry:tail --run-id <run-id> --json`
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
      "start_ref": "fleet_model_run",
      "action": {
        "actor": "operator",
        "steps": [
          "Run the research mission and retain its run ID.",
          "Run holo telemetry:tail with that run ID."
        ]
      },
      "end_state": {
        "must_observe": [
          "printed row count: >=1",
          "tokens column value: >=1",
          "wall-ms column value: >0",
          "endpoint: 'http://127.0.0.1:4545/v1'",
          "role: 'divergent'"
        ],
        "must_not_observe": [
          "printed row count: 0",
          "empty output",
          "prompt or response bodies"
        ]
      }
    }
  ]
}
```

### AC-5: Failed calls remain observable
**GIVEN:** The configured fleet endpoint is unavailable.
**WHEN:** The operator attempts the real fleet failure fixture.
**THEN:** A failed telemetry row and explicit degraded or ROLE_UNAVAILABLE outcome are persisted.
**VERIFY:** `PLATFORM_IT=1 pnpm test -- services/platform/tests/integration/inference-telemetry.test.ts -t 'failed call'`
**TEST_TIER:** integration
**VERIFICATION_SERVICE:** Mastra + Postgres + local fleet
**FLOW_REF:** UC-PLAT-04
**TDD_STATE:** none
**UNIT_TEST_JUSTIFIED:** null
#### Scenario contract
```json
{
  "tier": "visible",
  "test_tier": "integration",
  "verification_service": "Mastra + Postgres + local fleet",
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
      "start_ref": "fleet_failure",
      "action": {
        "actor": "operator",
        "steps": [
          "Stop or isolate the configured fleet endpoint.",
          "Attempt the real model call through the public inference path.",
          "Query telemetry by the failed run or step identity."
        ]
      },
      "end_state": {
        "must_observe": [
          "failed row count: 1",
          "status: 'error'",
          "error code: 'ROLE_UNAVAILABLE'",
          "endpoint: ':4545'",
          "role: 'divergent'"
        ],
        "must_not_observe": [
          "failed row count: 0",
          "successful status",
          "silent cloud fallback"
        ]
      }
    }
  ]
}
```

## Test Criteria

- **TC-1** (maps to AC-1) — An inference telemetry row exists for every completed real model call. — VERIFY: `PLATFORM_IT=1 pnpm test -- services/platform/tests/integration/inference-telemetry.test.ts`
- **TC-2** (maps to AC-2) — The default-path provider is fleet when a mission runs without allowEscape. — VERIFY: `PLATFORM_IT=1 pnpm test -- services/platform/tests/integration/inference-telemetry.test.ts -t 'local fleet'`
- **TC-3** (maps to AC-3) — A budget ledger row shares the run or step identity with an explicit escape telemetry row. — VERIFY: `PLATFORM_IT=1 pnpm test -- services/platform/tests/integration/inference-telemetry.test.ts -t 'budgeted escape'`
- **TC-4** (maps to AC-4) — The telemetry tail prints a persisted row when a completed fixture run is queried. — VERIFY: `bun services/platform/src/cli/holo.ts telemetry:tail --run-id <run-id> --json`
- **TC-5** (maps to AC-5) — A failed telemetry status exists when the fleet endpoint is unavailable. — VERIFY: `PLATFORM_IT=1 pnpm test -- services/platform/tests/integration/inference-telemetry.test.ts -t 'failed call'`

## Requirement Traceability

```json
[
  {
    "id": "AC-1",
    "type": "acceptance_criterion",
    "description": "GIVEN a real research run WHEN model calls complete THEN Postgres contains one telemetry row per call with usage and correlation fields.",
    "verify": "PLATFORM_IT=1 pnpm test -- services/platform/tests/integration/inference-telemetry.test.ts",
    "maps_to_ac": "AC-1",
    "scenario": {
      "tier": "visible",
      "test_tier": "integration",
      "verification_service": "Mastra + Postgres + local fleet",
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
          "start_ref": "fleet_model_run",
          "action": {
            "actor": "operator",
            "steps": [
              "Run the public research mission command.",
              "Query inference telemetry by the emitted run ID."
            ]
          },
          "end_state": {
            "must_observe": [
              "telemetry row count: >=2",
              "wallMs: >0",
              "inputTokens: >=1",
              "outputTokens: >=1",
              "endpoint: 'http://127.0.0.1:4545/v1'",
              "role: 'divergent'",
              "traceId: <non-empty>"
            ],
            "must_not_observe": [
              "telemetry row count: 0",
              "empty usage fields",
              "raw prompt body in telemetry"
            ]
          }
        }
      ]
    }
  },
  {
    "id": "AC-2",
    "type": "acceptance_criterion",
    "description": "GIVEN default local-first routing WHEN telemetry is queried THEN rows identify the local fleet and contain no Anthropic endpoint.",
    "verify": "PLATFORM_IT=1 pnpm test -- services/platform/tests/integration/inference-telemetry.test.ts -t 'local fleet'",
    "maps_to_ac": "AC-2",
    "scenario": {
      "tier": "visible",
      "test_tier": "integration",
      "verification_service": "Mastra + Postgres + local fleet",
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
          "start_ref": "fleet_model_run",
          "action": {
            "actor": "operator",
            "steps": [
              "Run the default research mission with no escape flag.",
              "Query provider and endpoint columns for all rows in the run."
            ]
          },
          "end_state": {
            "must_observe": [
              "provider: 'fleet'",
              "endpoint: 'http://127.0.0.1:4545/v1'",
              "role: 'divergent'"
            ],
            "must_not_observe": [
              "default cloud rows: 0",
              "api.anthropic.com",
              "empty provider value"
            ]
          }
        }
      ]
    }
  },
  {
    "id": "AC-3",
    "type": "acceptance_criterion",
    "description": "GIVEN an explicit budgeted escape WHEN the real escape runs THEN inference telemetry correlates to budget_ledger rows.",
    "verify": "PLATFORM_IT=1 pnpm test -- services/platform/tests/integration/inference-telemetry.test.ts -t 'budgeted escape'",
    "maps_to_ac": "AC-3",
    "scenario": {
      "tier": "visible",
      "test_tier": "integration",
      "verification_service": "Mastra + Postgres + Anthropic escape + budget ledger",
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
          "start_ref": "budgeted_escape",
          "action": {
            "actor": "operator",
            "steps": [
              "Set or verify a positive budget ceiling.",
              "Run the declared escape through the public CLI.",
              "Query inference_telemetry and budget_ledger using the emitted run or step identity."
            ]
          },
          "end_state": {
            "must_observe": [
              "pre-check rows: 1",
              "escape rows: 1",
              "telemetry rows: 1",
              "provider: 'anthropic'",
              "runId: '<fixture-run-id>'"
            ],
            "must_not_observe": [
              "pre-check rows: 0",
              "unmetered escape",
              "empty provider value"
            ]
          }
        }
      ]
    }
  },
  {
    "id": "AC-4",
    "type": "acceptance_criterion",
    "description": "GIVEN persisted inference rows WHEN telemetry:tail runs THEN the operator sees the required per-call columns.",
    "verify": "bun services/platform/src/cli/holo.ts telemetry:tail --run-id <run-id> --json",
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
          "start_ref": "fleet_model_run",
          "action": {
            "actor": "operator",
            "steps": [
              "Run the research mission and retain its run ID.",
              "Run holo telemetry:tail with that run ID."
            ]
          },
          "end_state": {
            "must_observe": [
              "printed row count: >=1",
              "tokens column value: >=1",
              "wall-ms column value: >0",
              "endpoint: 'http://127.0.0.1:4545/v1'",
              "role: 'divergent'"
            ],
            "must_not_observe": [
              "printed row count: 0",
              "empty output",
              "prompt or response bodies"
            ]
          }
        }
      ]
    }
  },
  {
    "id": "AC-5",
    "type": "acceptance_criterion",
    "description": "GIVEN a failed fleet call WHEN the failed run is queried THEN a failed telemetry row and explicit degraded outcome exist.",
    "verify": "PLATFORM_IT=1 pnpm test -- services/platform/tests/integration/inference-telemetry.test.ts -t 'failed call'",
    "maps_to_ac": "AC-5",
    "scenario": {
      "tier": "visible",
      "test_tier": "integration",
      "verification_service": "Mastra + Postgres + local fleet",
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
          "start_ref": "fleet_failure",
          "action": {
            "actor": "operator",
            "steps": [
              "Stop or isolate the configured fleet endpoint.",
              "Attempt the real model call through the public inference path.",
              "Query telemetry by the failed run or step identity."
            ]
          },
          "end_state": {
            "must_observe": [
              "failed row count: 1",
              "status: 'error'",
              "error code: 'ROLE_UNAVAILABLE'",
              "endpoint: ':4545'",
              "role: 'divergent'"
            ],
            "must_not_observe": [
              "failed row count: 0",
              "successful status",
              "silent cloud fallback"
            ]
          }
        }
      ]
    }
  },
  {
    "id": "TC-1",
    "type": "test_criterion",
    "description": "An inference telemetry row exists for every completed real model call.",
    "maps_to_ac": "AC-1",
    "verify": "PLATFORM_IT=1 pnpm test -- services/platform/tests/integration/inference-telemetry.test.ts",
    "scenario": {
      "tier": "visible",
      "test_tier": "integration",
      "verification_service": "Mastra + Postgres + local fleet",
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
          "start_ref": "fleet_model_run",
          "action": {
            "actor": "operator",
            "steps": [
              "Run the public research mission command.",
              "Query inference telemetry by the emitted run ID."
            ]
          },
          "end_state": {
            "must_observe": [
              "telemetry row count: >=2",
              "wallMs: >0",
              "inputTokens: >=1",
              "outputTokens: >=1",
              "endpoint: 'http://127.0.0.1:4545/v1'",
              "role: 'divergent'",
              "traceId: <non-empty>"
            ],
            "must_not_observe": [
              "telemetry row count: 0",
              "empty usage fields",
              "raw prompt body in telemetry"
            ]
          }
        }
      ]
    }
  },
  {
    "id": "TC-2",
    "type": "test_criterion",
    "description": "The default-path provider is fleet when a mission runs without allowEscape.",
    "maps_to_ac": "AC-2",
    "verify": "PLATFORM_IT=1 pnpm test -- services/platform/tests/integration/inference-telemetry.test.ts -t 'local fleet'",
    "scenario": {
      "tier": "visible",
      "test_tier": "integration",
      "verification_service": "Mastra + Postgres + local fleet",
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
          "start_ref": "fleet_model_run",
          "action": {
            "actor": "operator",
            "steps": [
              "Run the default research mission with no escape flag.",
              "Query provider and endpoint columns for all rows in the run."
            ]
          },
          "end_state": {
            "must_observe": [
              "provider: 'fleet'",
              "endpoint: 'http://127.0.0.1:4545/v1'",
              "role: 'divergent'"
            ],
            "must_not_observe": [
              "default cloud rows: 0",
              "api.anthropic.com",
              "empty provider value"
            ]
          }
        }
      ]
    }
  },
  {
    "id": "TC-3",
    "type": "test_criterion",
    "description": "A budget ledger row shares the run or step identity with an explicit escape telemetry row.",
    "maps_to_ac": "AC-3",
    "verify": "PLATFORM_IT=1 pnpm test -- services/platform/tests/integration/inference-telemetry.test.ts -t 'budgeted escape'",
    "scenario": {
      "tier": "visible",
      "test_tier": "integration",
      "verification_service": "Mastra + Postgres + Anthropic escape + budget ledger",
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
          "start_ref": "budgeted_escape",
          "action": {
            "actor": "operator",
            "steps": [
              "Set or verify a positive budget ceiling.",
              "Run the declared escape through the public CLI.",
              "Query inference_telemetry and budget_ledger using the emitted run or step identity."
            ]
          },
          "end_state": {
            "must_observe": [
              "pre-check rows: 1",
              "escape rows: 1",
              "telemetry rows: 1",
              "provider: 'anthropic'",
              "runId: '<fixture-run-id>'"
            ],
            "must_not_observe": [
              "pre-check rows: 0",
              "unmetered escape",
              "empty provider value"
            ]
          }
        }
      ]
    }
  },
  {
    "id": "TC-4",
    "type": "test_criterion",
    "description": "The telemetry tail prints a persisted row when a completed fixture run is queried.",
    "maps_to_ac": "AC-4",
    "verify": "bun services/platform/src/cli/holo.ts telemetry:tail --run-id <run-id> --json",
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
          "start_ref": "fleet_model_run",
          "action": {
            "actor": "operator",
            "steps": [
              "Run the research mission and retain its run ID.",
              "Run holo telemetry:tail with that run ID."
            ]
          },
          "end_state": {
            "must_observe": [
              "printed row count: >=1",
              "tokens column value: >=1",
              "wall-ms column value: >0",
              "endpoint: 'http://127.0.0.1:4545/v1'",
              "role: 'divergent'"
            ],
            "must_not_observe": [
              "printed row count: 0",
              "empty output",
              "prompt or response bodies"
            ]
          }
        }
      ]
    }
  },
  {
    "id": "TC-5",
    "type": "test_criterion",
    "description": "A failed telemetry status exists when the fleet endpoint is unavailable.",
    "maps_to_ac": "AC-5",
    "verify": "PLATFORM_IT=1 pnpm test -- services/platform/tests/integration/inference-telemetry.test.ts -t 'failed call'",
    "scenario": {
      "tier": "visible",
      "test_tier": "integration",
      "verification_service": "Mastra + Postgres + local fleet",
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
          "start_ref": "fleet_failure",
          "action": {
            "actor": "operator",
            "steps": [
              "Stop or isolate the configured fleet endpoint.",
              "Attempt the real model call through the public inference path.",
              "Query telemetry by the failed run or step identity."
            ]
          },
          "end_state": {
            "must_observe": [
              "failed row count: 1",
              "status: 'error'",
              "error code: 'ROLE_UNAVAILABLE'",
              "endpoint: ':4545'",
              "role: 'divergent'"
            ],
            "must_not_observe": [
              "failed row count: 0",
              "successful status",
              "silent cloud fallback"
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

- services/platform/src/db/schema/inference.ts (NEW)
- services/platform/src/db/schema/index.ts (MODIFY)
- services/platform/src/db/migrations/0013_inference_telemetry.sql (NEW)
- services/platform/src/inference/telemetry.ts (NEW)
- services/platform/src/mastra.ts (MODIFY, telemetry wiring only)
- services/platform/src/cli/holo.ts (MODIFY, telemetry:tail only)
- services/platform/tests/integration/inference-telemetry.test.ts (NEW)

### WRITE-PROHIBITED

- .spec/** — planning artifacts are read-only
- .tmp/** — runtime evidence is generated by tests
- services/platform/src/inference/resolve-model.ts — consume the router contract without changing default routing
- services/platform/src/inference/budget-ledger.ts — consume existing budget APIs unless a correlation type is required
- app/** and components/** — no client changes
- any file not explicitly listed above

## Reading List

1. **services/platform/src/inference/resolve-model.ts** (all) — Role, endpoint, provider, health, and default-deny escape resolution.
2. **services/platform/src/inference/budget-ledger.ts** (315-380, 474-645, 693-800) — Durable budget pre-check, escape, and failure accounting.
3. **services/platform/src/db/schema/chat.ts** (140-170) — Legacy agent_telemetry shape that must not be repurposed.
4. **services/platform/src/db/migrate.ts** (all) — Real Postgres migration and application-role access pattern.
5. **.spec/prds/mk6-migration/10-technical-requirements/09-capability-chains.md** (43-50) — CAP-INF-01 telemetry, budget, default-deny, and degraded-mode obligations.

## Design

```json
{
  "references": [
    "services/platform/src/inference/resolve-model.ts",
    "services/platform/src/inference/budget-ledger.ts",
    "services/platform/src/db/schema/chat.ts",
    "services/platform/src/db/migrate.ts"
  ],
  "interaction_notes": [
    "Use a dedicated inference_telemetry table because legacy agent_telemetry describes classification events.",
    "Write telemetry at the real model-call lifecycle boundary, not after a CLI formatter.",
    "Keep provider, endpoint, role, run, step, and trace identifiers queryable and bounded."
  ],
  "pattern": "Use typed Drizzle schema plus a real Postgres migration and a Mastra model-generation observer or wrapper that records success and failure outcomes.",
  "pattern_source": "services/platform/src/inference/budget-ledger.ts:315-380",
  "anti_pattern": "Do not derive token or wall-time values from console output, fill missing values with fake success, or hide rows in an in-memory buffer."
}
```

## Code Pattern

The implementation or review must follow the specialist `pattern`, `pattern_source`, and `anti_pattern` recorded in the Design section above.

## Agent Instructions

Implement only the specialist-defined scope as agent `mastra-evals-implementer`. Preserve every MUST, NEVER, STRICTLY, scenario negative control, and public-command evidence requirement. Do not replace real services with mocks, stubs, static fixtures, or warning-only success paths.

**Assignment rationale:** Owns per-call usage capture, Postgres persistence, CLI visibility, and budget-ledger correlation.

## Coding Standards

- `/Users/inference1/Projects/brain/skills/coding-standards/SKILL.md`
- `/Users/inference1/Projects/brain/docs/TDD-METHODOLOGY.md`
- `/Users/inference1/Projects/brain/docs/TESTING-HIERARCHY.md`
- `/Users/inference1/Projects/brain/docs/CAPABILITY-CHAIN-PLANNING.md`

## Orchestrator Verification Protocol

Verification is evidence-gated: run the specialist gates below, then the repository gates. A green result is invalid if the command did not exercise the named real service or if the required seeded scenario/evidence artifact is absent.

- **Real telemetry integration** — `PLATFORM_IT=1 pnpm test -- services/platform/tests/integration/inference-telemetry.test.ts` → Exit 0 against real Postgres, Mastra, and fleet.
- **Real telemetry CLI** — `bun services/platform/src/cli/holo.ts telemetry:tail --run-id <run-id> --json` → Exit 0 with tokens, wall-ms, endpoint, role, provider, run ID, and trace ID.
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
- **Estimate:** 150 minutes
- **Sprint:** Sprint 12

## Evidence Gates

- **Real telemetry integration** — `PLATFORM_IT=1 pnpm test -- services/platform/tests/integration/inference-telemetry.test.ts` → Exit 0 against real Postgres, Mastra, and fleet.
- **Real telemetry CLI** — `bun services/platform/src/cli/holo.ts telemetry:tail --run-id <run-id> --json` → Exit 0 with tokens, wall-ms, endpoint, role, provider, run ID, and trace ID.
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
    "obs-1"
  ]
}
```

## Notes

- Preserve the task-level requirement contract and all specialist-proposed evidence obligations through implementation and review.

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "obs-2",
  "proposed_by": "mastra-evals-implementer",
  "tdd_mode": "red_first",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": true,
    "requires_seeded_evidence": true
  },
  "fixtures": {
    "fleet_model_run": {
      "description": "A real research run that produces multiple local-fleet model calls.",
      "seed_method": "cli",
      "entrypoint": "bun services/platform/src/cli/holo.ts mission run research --goal 'Inference telemetry fixture'",
      "records": [
        "run ID",
        "trace ID",
        "telemetry row count: 2",
        "role: divergent"
      ]
    },
    "budgeted_escape": {
      "description": "A declared high-stakes escape executed with a real budget ceiling and real provider credentials.",
      "seed_method": "cli",
      "entrypoint": "bun services/platform/src/cli/holo.ts infer:call --role divergent --escape --cost 0.01 --reason 'telemetry escape fixture' --prompt 'Return one word'",
      "records": [
        "pre-check rows: 1",
        "escape rows: 1",
        "provider: anthropic",
        "matching run or step identity"
      ]
    },
    "fleet_failure": {
      "description": "A real model call attempted while the configured fleet endpoint is unavailable.",
      "seed_method": "cli",
      "entrypoint": "bun services/platform/src/cli/infer-failure-fixture.ts --role divergent",
      "records": [
        "failed row count: 1",
        "status: error",
        "error code: ROLE_UNAVAILABLE"
      ]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "description": "GIVEN a real research run WHEN model calls complete THEN Postgres contains one telemetry row per call with usage and correlation fields.",
      "verify": "PLATFORM_IT=1 pnpm test -- services/platform/tests/integration/inference-telemetry.test.ts",
      "maps_to_ac": "AC-1",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "Mastra + Postgres + local fleet",
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
            "start_ref": "fleet_model_run",
            "action": {
              "actor": "operator",
              "steps": [
                "Run the public research mission command.",
                "Query inference telemetry by the emitted run ID."
              ]
            },
            "end_state": {
              "must_observe": [
                "telemetry row count: >=2",
                "wallMs: >0",
                "inputTokens: >=1",
                "outputTokens: >=1",
                "endpoint: 'http://127.0.0.1:4545/v1'",
                "role: 'divergent'",
                "traceId: <non-empty>"
              ],
              "must_not_observe": [
                "telemetry row count: 0",
                "empty usage fields",
                "raw prompt body in telemetry"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-2",
      "type": "acceptance_criterion",
      "description": "GIVEN default local-first routing WHEN telemetry is queried THEN rows identify the local fleet and contain no Anthropic endpoint.",
      "verify": "PLATFORM_IT=1 pnpm test -- services/platform/tests/integration/inference-telemetry.test.ts -t 'local fleet'",
      "maps_to_ac": "AC-2",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "Mastra + Postgres + local fleet",
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
            "start_ref": "fleet_model_run",
            "action": {
              "actor": "operator",
              "steps": [
                "Run the default research mission with no escape flag.",
                "Query provider and endpoint columns for all rows in the run."
              ]
            },
            "end_state": {
              "must_observe": [
                "provider: 'fleet'",
                "endpoint: 'http://127.0.0.1:4545/v1'",
                "role: 'divergent'"
              ],
              "must_not_observe": [
                "default cloud rows: 0",
                "api.anthropic.com",
                "empty provider value"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-3",
      "type": "acceptance_criterion",
      "description": "GIVEN an explicit budgeted escape WHEN the real escape runs THEN inference telemetry correlates to budget_ledger rows.",
      "verify": "PLATFORM_IT=1 pnpm test -- services/platform/tests/integration/inference-telemetry.test.ts -t 'budgeted escape'",
      "maps_to_ac": "AC-3",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "Mastra + Postgres + Anthropic escape + budget ledger",
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
            "start_ref": "budgeted_escape",
            "action": {
              "actor": "operator",
              "steps": [
                "Set or verify a positive budget ceiling.",
                "Run the declared escape through the public CLI.",
                "Query inference_telemetry and budget_ledger using the emitted run or step identity."
              ]
            },
            "end_state": {
              "must_observe": [
                "pre-check rows: 1",
                "escape rows: 1",
                "telemetry rows: 1",
                "provider: 'anthropic'",
                "runId: '<fixture-run-id>'"
              ],
              "must_not_observe": [
                "pre-check rows: 0",
                "unmetered escape",
                "empty provider value"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-4",
      "type": "acceptance_criterion",
      "description": "GIVEN persisted inference rows WHEN telemetry:tail runs THEN the operator sees the required per-call columns.",
      "verify": "bun services/platform/src/cli/holo.ts telemetry:tail --run-id <run-id> --json",
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
            "start_ref": "fleet_model_run",
            "action": {
              "actor": "operator",
              "steps": [
                "Run the research mission and retain its run ID.",
                "Run holo telemetry:tail with that run ID."
              ]
            },
            "end_state": {
              "must_observe": [
                "printed row count: >=1",
                "tokens column value: >=1",
                "wall-ms column value: >0",
                "endpoint: 'http://127.0.0.1:4545/v1'",
                "role: 'divergent'"
              ],
              "must_not_observe": [
                "printed row count: 0",
                "empty output",
                "prompt or response bodies"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-5",
      "type": "acceptance_criterion",
      "description": "GIVEN a failed fleet call WHEN the failed run is queried THEN a failed telemetry row and explicit degraded outcome exist.",
      "verify": "PLATFORM_IT=1 pnpm test -- services/platform/tests/integration/inference-telemetry.test.ts -t 'failed call'",
      "maps_to_ac": "AC-5",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "Mastra + Postgres + local fleet",
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
            "start_ref": "fleet_failure",
            "action": {
              "actor": "operator",
              "steps": [
                "Stop or isolate the configured fleet endpoint.",
                "Attempt the real model call through the public inference path.",
                "Query telemetry by the failed run or step identity."
              ]
            },
            "end_state": {
              "must_observe": [
                "failed row count: 1",
                "status: 'error'",
                "error code: 'ROLE_UNAVAILABLE'",
                "endpoint: ':4545'",
                "role: 'divergent'"
              ],
              "must_not_observe": [
                "failed row count: 0",
                "successful status",
                "silent cloud fallback"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "TC-1",
      "type": "test_criterion",
      "description": "An inference telemetry row exists for every completed real model call.",
      "maps_to_ac": "AC-1",
      "verify": "PLATFORM_IT=1 pnpm test -- services/platform/tests/integration/inference-telemetry.test.ts",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "Mastra + Postgres + local fleet",
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
            "start_ref": "fleet_model_run",
            "action": {
              "actor": "operator",
              "steps": [
                "Run the public research mission command.",
                "Query inference telemetry by the emitted run ID."
              ]
            },
            "end_state": {
              "must_observe": [
                "telemetry row count: >=2",
                "wallMs: >0",
                "inputTokens: >=1",
                "outputTokens: >=1",
                "endpoint: 'http://127.0.0.1:4545/v1'",
                "role: 'divergent'",
                "traceId: <non-empty>"
              ],
              "must_not_observe": [
                "telemetry row count: 0",
                "empty usage fields",
                "raw prompt body in telemetry"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "TC-2",
      "type": "test_criterion",
      "description": "The default-path provider is fleet when a mission runs without allowEscape.",
      "maps_to_ac": "AC-2",
      "verify": "PLATFORM_IT=1 pnpm test -- services/platform/tests/integration/inference-telemetry.test.ts -t 'local fleet'",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "Mastra + Postgres + local fleet",
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
            "start_ref": "fleet_model_run",
            "action": {
              "actor": "operator",
              "steps": [
                "Run the default research mission with no escape flag.",
                "Query provider and endpoint columns for all rows in the run."
              ]
            },
            "end_state": {
              "must_observe": [
                "provider: 'fleet'",
                "endpoint: 'http://127.0.0.1:4545/v1'",
                "role: 'divergent'"
              ],
              "must_not_observe": [
                "default cloud rows: 0",
                "api.anthropic.com",
                "empty provider value"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "TC-3",
      "type": "test_criterion",
      "description": "A budget ledger row shares the run or step identity with an explicit escape telemetry row.",
      "maps_to_ac": "AC-3",
      "verify": "PLATFORM_IT=1 pnpm test -- services/platform/tests/integration/inference-telemetry.test.ts -t 'budgeted escape'",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "Mastra + Postgres + Anthropic escape + budget ledger",
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
            "start_ref": "budgeted_escape",
            "action": {
              "actor": "operator",
              "steps": [
                "Set or verify a positive budget ceiling.",
                "Run the declared escape through the public CLI.",
                "Query inference_telemetry and budget_ledger using the emitted run or step identity."
              ]
            },
            "end_state": {
              "must_observe": [
                "pre-check rows: 1",
                "escape rows: 1",
                "telemetry rows: 1",
                "provider: 'anthropic'",
                "runId: '<fixture-run-id>'"
              ],
              "must_not_observe": [
                "pre-check rows: 0",
                "unmetered escape",
                "empty provider value"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "TC-4",
      "type": "test_criterion",
      "description": "The telemetry tail prints a persisted row when a completed fixture run is queried.",
      "maps_to_ac": "AC-4",
      "verify": "bun services/platform/src/cli/holo.ts telemetry:tail --run-id <run-id> --json",
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
            "start_ref": "fleet_model_run",
            "action": {
              "actor": "operator",
              "steps": [
                "Run the research mission and retain its run ID.",
                "Run holo telemetry:tail with that run ID."
              ]
            },
            "end_state": {
              "must_observe": [
                "printed row count: >=1",
                "tokens column value: >=1",
                "wall-ms column value: >0",
                "endpoint: 'http://127.0.0.1:4545/v1'",
                "role: 'divergent'"
              ],
              "must_not_observe": [
                "printed row count: 0",
                "empty output",
                "prompt or response bodies"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "TC-5",
      "type": "test_criterion",
      "description": "A failed telemetry status exists when the fleet endpoint is unavailable.",
      "maps_to_ac": "AC-5",
      "verify": "PLATFORM_IT=1 pnpm test -- services/platform/tests/integration/inference-telemetry.test.ts -t 'failed call'",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "Mastra + Postgres + local fleet",
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
            "start_ref": "fleet_failure",
            "action": {
              "actor": "operator",
              "steps": [
                "Stop or isolate the configured fleet endpoint.",
                "Attempt the real model call through the public inference path.",
                "Query telemetry by the failed run or step identity."
              ]
            },
            "end_state": {
              "must_observe": [
                "failed row count: 1",
                "status: 'error'",
                "error code: 'ROLE_UNAVAILABLE'",
                "endpoint: ':4545'",
                "role: 'divergent'"
              ],
              "must_not_observe": [
                "failed row count: 0",
                "successful status",
                "silent cloud fallback"
              ]
            }
          }
        ]
      }
    }
  ]
}
-->

# OBS-02 — Adopt supported Mastra/Langfuse OTLP v4
> Status: ✅ Completed
> Commit: d3ffba4e3f6f1e1b2fb90d3f9095878e61655978
> Reviewer: product-manager+mastra-reviewer
> Completed: 2026-08-21T05:43:53Z

**Status:** Planned
**Proposed By:** `mastra-planner`
**Primary implementer:** `mastra-implementer`
**Estimate:** 3–4 days
**Depends on:** OBS-01 GO and reconciliation of S33-PLAT-05 telemetry ownership

## Objective

Replace the custom legacy Langfuse exporter with the OBS-01-selected supported OTLP
v4 path while retaining local Mastra storage, correlation, redaction, and product
availability when the external sink fails.

## Critical constraints

- MUST preserve `MastraStorageExporter`, `SensitiveDataFilter`, S33 provider/model/token
  accounting, and trace/run propagation.
- MUST use `@mastra/otel-exporter` and the pinned OpenTelemetry Collector persistent
  queue proven by OBS-01. Do not wrap/reimplement an exporter to fabricate queue
  visibility; direct `@mastra/langfuse` is not the production path.
- MUST send Langfuse ingestion version 4 and confirm traces via Observations API v2.
- MUST remove production `/api/public/ingestion`, deprecated trace reads,
  `HolocronLangfuseExporter`, and `failOnExportError: true` behavior only after the
  replacement passes real success, outage, saturation, shutdown, and recovery tests.
- NEVER let external export failure change a successful mission/inference/backup result
  or silently report the external sink fresh.

## Write-allowed files

```text
services/platform/package.json
pnpm-lock.yaml
services/platform/src/mastra.ts
services/platform/src/observability/langfuse-exporter.ts          # migrate then delete
services/platform/src/observability/config.ts
services/platform/src/observability/redaction.ts
services/platform/src/observability/export-health.ts
services/platform/src/observability/mission-research.ts
services/platform/src/mission/runtime.ts
services/platform/src/inference/telemetry.ts
services/platform/src/backup/span.ts
services/platform/src/backup/restic-mirror.ts
services/platform/deploy/otel/**
services/platform/tests/integration/observability-otel-v4.test.ts
services/platform/tests/integration/observability-traces.test.ts
```

Compose production topology, health endpoint, migrations, scheduler, MCP, and manifest
files are read-only here.

## Implementation sequence

1. Write failing real integration cases for successful export, wrong auth, unreachable
   sink, bounded queue saturation, flush deadline, restart, and redaction sentinel.
2. Extract configuration and the Holocron attribute allowlist; construct local and
   external exporters once in `mastra.ts` from validated, names-only config.
3. Configure `@mastra/otel-exporter` to the pinned Collector; configure its persistent
   queue/retry and documented internal metrics, and bind its image/config digest to
   OBS-01. Use bounded v2 observations to confirm end-to-end delivery.
4. Thread correlation through mission, inference, research, backup, and restic spans
   without changing their product outcomes.
5. Record supported failure codes (`LANGFUSE_UNREACHABLE`, `OTLP_REJECTED`,
   `EXPORT_QUEUE_FULL`, `EXPORT_FLUSH_TIMEOUT`) through the OBS-03 event-state
   interface; until OBS-03 lands, expose the typed interface without fake persistence.
6. Implement bounded flush/shutdown. Report unflushed work truthfully and never update
   last-success until v2 observation/official metric evidence proves delivery.
7. Delete the custom exporter and remove all legacy endpoint/default-failure code.

## Acceptance and test criteria

- **AC-1:** Given a real mission/model call, when export completes, then identical
  trace/run/provider identities exist in local Postgres and Langfuse v2.
- **AC-2:** Given only Langfuse is unavailable, when a valid mission runs, then the
  product succeeds, the local span remains, and external state becomes degraded.
- **AC-3:** Given a secret/disallowed payload sentinel, when both exporters run, then
  neither local nor Langfuse queryable metadata contains it.
- **AC-4:** Given queue pressure and process shutdown, when capacity/deadline is reached,
  then documented queue/freshness metrics and terminal failure are accurate.
- **TC-1:** A trace-ID mismatch between local SQL and Langfuse makes parity fail.
- **TC-2:** Stopping only the isolated sink leaves mission success but fails any green
  external-freshness assertion.
- **TC-3:** Injected key/header/prompt canaries have zero matches in SQL/API/evidence.
- **TC-4:** Saturation and flush timeout produce exact non-success codes; concealed or
  unavailable queue status blocks the task.

## Verification

```bash
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test:unit
PLATFORM_IT=1 pnpm vitest run --project integration \
  services/platform/tests/integration/observability-otel-v4.test.ts \
  services/platform/tests/integration/observability-traces.test.ts
rg -n '/api/public/ingestion|HolocronLangfuseExporter|failOnExportError:\s*true' \
  services/platform/src
git diff --check
```

Required artifacts: `.tmp/OBS-02/start-ref.json`, `local-langfuse-parity.json`,
`outage-timeline.json`, `queue-and-flush.json`, `redaction-scan.json`, and
`legacy-path-scan.json`.

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "OBS-02",
  "tdd_mode": "red_first",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": true,
    "requires_seeded_evidence": true
  },
  "fixtures": {
    "real_trace": {
      "seed_method": "public_api",
      "description": "real mission and local-fleet model call through Bun Postgres and Langfuse v4",
      "records": [
        "expectedLocalTraceCount:1",
        "expectedLangfuseTraceCount:1"
      ]
    },
    "sink_fault": {
      "seed_method": "cli",
      "description": "isolated Langfuse or Collector service outage and bounded queue pressure",
      "records": [
        "expectedMissionSuccessCount:1",
        "expectedDegradedCount:1"
      ]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "primary": true,
      "description": "GIVEN a real mission model call WHEN supported OTLP v4 export completes THEN local and Langfuse identities match",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/observability-otel-v4.test.ts -t 'AC-1'",
      "maps_to_ac": null,
      "scenario": {
        "id": "OBS-02/AC-1",
        "test_tier": "e2e",
        "tier": "visible",
        "verification_service": "mastra-postgres-langfuse-v4-local-fleet",
        "negative_control": {
          "would_fail_if": [
            "the model or Langfuse API is mocked",
            "a disconnected stub would pass"
          ]
        },
        "evidence": {
          "artifact_type": "api_response",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "real_trace",
            "action": {
              "steps": [
                "run mission and query local SQL plus Observations API v2"
              ]
            },
            "end_state": {
              "must_observe": [
                "expectedLocalTraceCount:1",
                "expectedLangfuseTraceCount:1",
                "traceIdentityMismatchCount:0"
              ],
              "must_not_observe": [
                "legacy ingestion endpoint",
                "empty trace id",
                "empty required evidence"
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
      "description": "GIVEN external sink outage WHEN a valid mission runs THEN product succeeds local trace persists and export is degraded",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/observability-otel-v4.test.ts -t 'AC-2'",
      "maps_to_ac": null,
      "scenario": {
        "id": "OBS-02/AC-2",
        "test_tier": "integration",
        "tier": "visible",
        "verification_service": "isolated-langfuse-outage",
        "negative_control": {
          "would_fail_if": [
            "external export failure throws into mission or remains green",
            "a disconnected stub would pass"
          ]
        },
        "evidence": {
          "artifact_type": "event_log",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "sink_fault",
            "action": {
              "steps": [
                "stop only isolated sink and execute mission"
              ]
            },
            "end_state": {
              "must_observe": [
                "expectedMissionSuccessCount:1",
                "expectedDegradedCount:1",
                "localTraceCount:1"
              ],
              "must_not_observe": [
                "missionFailureCount > 0",
                "externalState:ready",
                "empty required evidence"
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
      "description": "GIVEN secret and disallowed sentinels WHEN both exporters run THEN neither queryable store or evidence contains them",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/observability-otel-v4.test.ts -t 'AC-3'",
      "maps_to_ac": null,
      "scenario": {
        "id": "OBS-02/AC-3",
        "test_tier": "integration",
        "tier": "visible",
        "verification_service": "postgres-and-langfuse-redaction",
        "negative_control": {
          "would_fail_if": [
            "the sensitive filter or allowlist is bypassed",
            "a disconnected stub would pass"
          ]
        },
        "evidence": {
          "artifact_type": "db_query",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "real_trace",
            "action": {
              "steps": [
                "export canaries and scan SQL API and artifacts"
              ]
            },
            "end_state": {
              "must_observe": [
                "sentinelMatchCount:0"
              ],
              "must_not_observe": [
                "authorization header",
                "credential value",
                "raw prompt sentinel",
                "empty required evidence"
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
      "description": "GIVEN queue pressure and shutdown WHEN bounds are reached THEN official queue freshness and terminal errors remain truthful",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/observability-otel-v4.test.ts -t 'AC-4'",
      "maps_to_ac": null,
      "scenario": {
        "id": "OBS-02/AC-4",
        "test_tier": "e2e",
        "tier": "visible",
        "verification_service": "supported-exporter-or-otel-collector-metrics",
        "negative_control": {
          "would_fail_if": [
            "queue depth is invented or flush failure is swallowed",
            "a disconnected stub would pass"
          ]
        },
        "evidence": {
          "artifact_type": "event_log",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "sink_fault",
            "action": {
              "steps": [
                "saturate isolated queue and enforce shutdown deadline"
              ]
            },
            "end_state": {
              "must_observe": [
                "queueMetricSourceCount:1",
                "terminalFailureCodeCount >= 1"
              ],
              "must_not_observe": [
                "unbounded queue",
                "green flush timeout",
                "empty required evidence"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "TC-1",
      "type": "test_criterion",
      "description": "Local SQL and Langfuse v2 return the same trace identity.",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/observability-otel-v4.test.ts -t 'AC-1'",
      "maps_to_ac": "AC-1"
    },
    {
      "id": "TC-2",
      "type": "test_criterion",
      "description": "An isolated sink outage leaves mission success and rejects green freshness.",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/observability-otel-v4.test.ts -t 'AC-2'",
      "maps_to_ac": "AC-2"
    },
    {
      "id": "TC-3",
      "type": "test_criterion",
      "description": "Secret-shaped canaries have zero matches across both stores and evidence.",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/observability-otel-v4.test.ts -t 'AC-3'",
      "maps_to_ac": "AC-3"
    },
    {
      "id": "TC-4",
      "type": "test_criterion",
      "description": "Saturation and flush timeout expose official non-success state.",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/observability-otel-v4.test.ts -t 'AC-4'",
      "maps_to_ac": "AC-4"
    }
  ]
}
-->

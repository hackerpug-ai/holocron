# OBS-03 — Add correlated signals, health, retention, and alerts

**Status:** Planned
**Proposed By:** `mastra-planner`
**Primary implementer:** `mastra-implementer`
**Estimate:** 4–5 days
**Depends on:** OBS-02, OBS-04

## Objective

Create the first-party operational-event and exporter-state system, trace-aware logs,
deterministic metrics/alerts/retention, and `/health` semantics that keep core readiness
separate from observability degradation.

## Critical constraints

- MUST use the plan-reserved migration `0042` after confirming that the earlier planned
  0039–0041 owners landed in journal order. If another branch has claimed 0042, stop and
  amend this plan before writing; do not silently renumber inside an implementation.
- MUST persist redacted bounded events and exporter state in real Postgres. Unknown
  queue/freshness state is `unknown` or `degraded`, never healthy.
- MUST return HTTP 200 with body `status:"degraded"` for observability-only failure and
  preserve HTTP 503 for existing core dependency failure.
- MUST preserve S33 `roles`/`unavailable_roles`, provider/model accounting, and core
  queue/readiness contracts.
- MUST use documented Langfuse APIs or proven licensed retention; never mutate private
  Langfuse tables or let a model decide an alert/retention transition.

## Write-allowed files

```text
services/platform/src/db/migrations/0042_service_events_observability_state.sql
services/platform/src/db/migrations/meta/**
services/platform/src/db/schema/observability.ts
services/platform/src/db/schema/index.ts
services/platform/src/observability/service-events.ts
services/platform/src/observability/health.ts
services/platform/src/observability/metrics.ts
services/platform/src/observability/alerts.ts
services/platform/src/observability/retention.ts
services/platform/src/mastra.ts
services/platform/src/http/health.ts
services/platform/src/queue/jobs-registry.ts
services/platform/src/queue/jobs-handlers/index.ts
services/platform/src/queue/jobs-handlers/observability-*.ts
services/platform/src/cli/holo.ts
services/platform/tests/integration/observability-signals.test.ts
services/platform/tests/integration/observability-degradation.test.ts
services/platform/tests/integration/observability-retention.test.ts
```

Migration 0043, MCP, manifest, Compose, release-lock, and edge files are read-only.

## Data and behavior contract

Migration 0042 adds:

- `service_events`: immutable id/time/source/category/type/severity/status,
  trace/run/entity/duration, bounded deterministic summary, allowlisted JSON metadata,
  `redacted=true`, and immutable release SHA/image digest. `source` covers
  `deployment`, `health`, and `observability` here.
- `observability_export_state`: one row per sink with state, queue depth/capacity,
  oldest item, last attempt/success/failure, consecutive failures, and bounded error
  code.
- `observability_alert_state` and `observability_retention_runs` only as needed for
  idempotent transitions and restart-safe watermarks.

Writers reject unknown metadata keys, raw bodies, oversize summary/JSON, missing release
identity in production, negative duration/depth, and `redacted=false`. Index by
observed time/id, source/time, trace/time, run/time, and open state.

`/health.observability` reports storage, exporter, Langfuse ingestion/UI, retention,
queue depth/capacity/oldest, last success/failure, and freshness. The response also
retains all existing components and release fields.

Retention defaults are 30 days raw Langfuse content, 180 days local trace/inference,
90 days operational events, and 365 days aggregates. Jobs are bounded, restartable,
hold-aware, and idempotent. Alerts use the PRD thresholds with one open incident per
component and a verified-success recovery transition.

## Implementation sequence

1. Reserve migration ownership and write failing real-Postgres tests for constraints,
   indexes, restart persistence, redaction, and size bounds.
2. Implement schema plus the single public service-event writer; route deployment,
   health, and OBS-02 exporter transitions through it.
3. Enable trace-aware Mastra logging and deterministic aggregation without duplicating
   raw prompt/output content.
4. Extend health with the exact 200-degraded/503-core state machine and unknown-state
   handling.
5. Register deterministic alert and retention jobs, including watermarks, holds,
   bounded v2 API reads/deletes, failure events, and recovery.
6. Run real outage/recovery, cutoff-boundary, restart, and alert-dedup scenarios.

## Acceptance and test criteria

- **AC-1:** Given real mission/inference/backup/deploy activity, when it completes,
  then trace-correlated bounded events and metrics persist across restart.
- **AC-2:** Given only Langfuse/export is down, when health is read, then HTTP is 200,
  body is degraded, queue/freshness are truthful, and core remains ready.
- **AC-3:** Given deterministic thresholds, when time/state crosses and recovers, then
  exactly one alert opens and one verified recovery closes it.
- **AC-4:** Given rows around retention cutoffs plus a hold, when jobs run twice, then
  only eligible rows/traces are removed and the second run is idempotent.
- **TC-1:** Unknown metadata, oversized payload, secret sentinel, or false redaction is
  rejected before insert.
- **TC-2:** Isolated sink outage is 200/degraded; a separate Postgres outage remains
  503 and retains existing unavailable-role fields.
- **TC-3:** Restart during an open incident does not duplicate it; a false success does
  not close it.
- **TC-4:** Boundary and held records survive, eligible records disappear through real
  Postgres/Langfuse APIs, and rerun deletes zero extras.

## Verification

```bash
pnpm typecheck
pnpm test:unit
PLATFORM_IT=1 pnpm vitest run --project integration \
  services/platform/tests/integration/observability-signals.test.ts \
  services/platform/tests/integration/observability-degradation.test.ts \
  services/platform/tests/integration/observability-retention.test.ts
bun services/platform/src/cli/holo.ts observability:status --json
bun services/platform/src/cli/holo.ts observability:retention --dry-run --json
git diff --check
```

Artifacts: `.tmp/OBS-03/start-ref.json`, `migration-and-indexes.json`,
`correlation-parity.json`, `health-outage-recovery.json`, `alert-transitions.json`,
`retention-boundaries.json`, and `redaction-scan.json`.

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "OBS-03",
  "tdd_mode": "red_first",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": true,
    "requires_seeded_evidence": true
  },
  "fixtures": {
    "real_signals": {
      "seed_method": "public_api",
      "description": "real mission inference backup deploy and health activity persisted in Postgres",
      "records": [
        "expectedCorrelatedEventCount:5"
      ]
    },
    "retention_edges": {
      "seed_method": "cli",
      "description": "real Postgres and Langfuse records before at and after cutoff plus one hold",
      "records": [
        "expectedHeldCount:1",
        "expectedEligibleCount:1"
      ]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "primary": true,
      "description": "GIVEN real service activity WHEN signals persist and services restart THEN correlated bounded events and metrics remain queryable",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/observability-signals.test.ts -t 'AC-1'",
      "maps_to_ac": null,
      "scenario": {
        "id": "OBS-03/AC-1",
        "test_tier": "e2e",
        "tier": "visible",
        "verification_service": "mastra-postgres-queue-local-fleet",
        "negative_control": {
          "would_fail_if": [
            "events are in memory or correlation is synthetic",
            "a disconnected stub would pass"
          ]
        },
        "evidence": {
          "artifact_type": "db_query",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "real_signals",
            "action": {
              "steps": [
                "run activity restart and query events metrics"
              ]
            },
            "end_state": {
              "must_observe": [
                "expectedCorrelatedEventCount:5",
                "restartEventMismatchCount:0"
              ],
              "must_not_observe": [
                "raw prompt content",
                "missing release identity",
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
      "description": "GIVEN only external observability is down WHEN health is read THEN HTTP 200 is degraded while a core database outage remains 503",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/observability-degradation.test.ts -t 'AC-2'",
      "maps_to_ac": null,
      "scenario": {
        "id": "OBS-03/AC-2",
        "test_tier": "e2e",
        "tier": "visible",
        "verification_service": "health-postgres-langfuse",
        "negative_control": {
          "would_fail_if": [
            "observability outage returns 503 or unknown state is green",
            "a disconnected stub would pass"
          ]
        },
        "evidence": {
          "artifact_type": "api_response",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "real_signals",
            "action": {
              "steps": [
                "stop isolated sink then separately stop isolated Postgres"
              ]
            },
            "end_state": {
              "must_observe": [
                "observabilityHttpStatus:200",
                "observabilityBodyStatus:degraded",
                "coreOutageHttpStatus:503"
              ],
              "must_not_observe": [
                "observabilityBodyStatus:ok",
                "missing unavailable roles",
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
      "description": "GIVEN persisted alert thresholds WHEN state crosses restarts and recovers THEN one incident opens and one verified recovery closes it",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/observability-signals.test.ts -t 'AC-3'",
      "maps_to_ac": null,
      "scenario": {
        "id": "OBS-03/AC-3",
        "test_tier": "integration",
        "tier": "visible",
        "verification_service": "postgres-queue-alert-worker",
        "negative_control": {
          "would_fail_if": [
            "alerts duplicate after restart or close on unverified success",
            "a disconnected stub would pass"
          ]
        },
        "evidence": {
          "artifact_type": "event_log",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "real_signals",
            "action": {
              "steps": [
                "cross threshold restart worker and verify recovery"
              ]
            },
            "end_state": {
              "must_observe": [
                "openedIncidentCount:1",
                "closedIncidentCount:1"
              ],
              "must_not_observe": [
                "duplicateOpenCount > 0",
                "prematureRecoveryCount > 0",
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
      "description": "GIVEN cutoff boundary and held records WHEN retention runs twice THEN only eligible records are removed and rerun is idempotent",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/observability-retention.test.ts -t 'AC-4'",
      "maps_to_ac": null,
      "scenario": {
        "id": "OBS-03/AC-4",
        "test_tier": "e2e",
        "tier": "visible",
        "verification_service": "postgres-langfuse-v2-retention",
        "negative_control": {
          "would_fail_if": [
            "private tables are mutated or held rows are deleted",
            "a disconnected stub would pass"
          ]
        },
        "evidence": {
          "artifact_type": "db_query",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "retention_edges",
            "action": {
              "steps": [
                "run bounded retention twice through public interfaces"
              ]
            },
            "end_state": {
              "must_observe": [
                "expectedHeldCount:1",
                "expectedEligibleCount:1",
                "secondRunDeleteCount:0"
              ],
              "must_not_observe": [
                "heldDeleteCount > 0",
                "privateTableWriteCount > 0",
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
      "description": "Invalid metadata size redaction and secret inputs fail before persistence.",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/observability-signals.test.ts -t 'redaction bounds'",
      "maps_to_ac": "AC-1"
    },
    {
      "id": "TC-2",
      "type": "test_criterion",
      "description": "External-only outage is 200 degraded and core database outage is 503.",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/observability-degradation.test.ts -t 'AC-2'",
      "maps_to_ac": "AC-2"
    },
    {
      "id": "TC-3",
      "type": "test_criterion",
      "description": "Restart and false success cannot duplicate or prematurely close alerts.",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/observability-signals.test.ts -t 'AC-3'",
      "maps_to_ac": "AC-3"
    },
    {
      "id": "TC-4",
      "type": "test_criterion",
      "description": "Held and boundary rows survive and the second retention run is idempotent.",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/observability-retention.test.ts -t 'AC-4'",
      "maps_to_ac": "AC-4"
    }
  ]
}
-->

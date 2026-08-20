# Holocron Observability Console

**Status:** Proposed
**Version:** 1.0.0
**Date:** 2026-08-20
**Target:** MK-VI Mastra platform on the tailnet mini

## Outcome

Provide one private operator destination at:

```text
https://<holocron-tailnet-host>:44111/observability
```

From there, the operator can inspect Holocron agent, workflow, tool, model, and
inference traces. A read-only MCP tool provides a correlated, redacted event feed
from Holocron's canonical application data without requiring direct database or
Langfuse access.

This plan treats observability as a product capability with three distinct layers:

1. **Mastra observability is the instrumentation plane.** It creates correlated
   traces, logs, metrics, and feedback around Mastra agents, workflows, tools, and
   model calls.
2. **Langfuse is the private LLM/agent investigation console.** It is the primary
   human UI for traces, generations, scores, prompts, and eval results.
3. **Holocron Postgres remains the canonical operational-event source.** Durable
   application events, deployment identity, and inference telemetry are not made
   dependent on a third-party observability schema or retention policy.

## Decision: Is Langfuse the Right Tool?

**Yes, for LLM and agent observability. No, as Holocron's only observability
system.**

Langfuse provides the trace exploration, model-generation, token/cost, scoring,
and evaluation UI Holocron needs. It does not replace service health, queue depth,
backup freshness, deployment provenance, database state, or application event
history. Those remain first-party data and deterministic health signals.

The hosted Mastra Platform exporter is optional. It can be enabled as a temporary
shadow sink when cross-checking Mastra instrumentation, but the default design
does not require trace egress or a second hosted console. The required Mastra
components are its local observability APIs, local storage exporter, trace-aware
logging, and the supported Langfuse/OTLP exporter.

## Deployment Decision: Same Release, Not the Same Image

Langfuse must **not** be installed in the Mastra application image. A complete
Langfuse deployment contains separate web, worker, ClickHouse, PostgreSQL, Redis,
and object-storage processes with different persistence and health requirements.
Combining them into one container would break isolation, lifecycle control,
resource accounting, and rollback safety.

Instead, Holocron will ship Langfuse in the **same pinned Compose release** as the
platform, using separate containers and volumes. A small deterministic edge proxy
will retain the existing tailnet ingress and route:

```text
Tailnet HTTPS :44111
  /observability/*  -> Langfuse web:3000
  /*                 -> Mastra platform:4111
```

Serving Langfuse at a subpath requires a Holocron-pinned web image built from a
specific Langfuse source revision with `NEXT_PUBLIC_BASE_PATH=/observability`.
The upstream prebuilt web image does not support changing that value at runtime.
The worker and state services remain independently pinned upstream images.

## Current Repository Baseline

This is a gap-closure plan, not a greenfield design. Repository inspection found:

| Present in source | Gap to close |
|---|---|
| Mastra `Observability` with `MastraStorageExporter` | Enable the complete supported logs/metrics contract and prove it live |
| Custom `HolocronLangfuseExporter` | Replace legacy ingestion and trace APIs with the supported first-party Langfuse/OTLP v4 path |
| Durable `inference_telemetry`, `mission_events`, and `chat_run_events` | Normalize them into one bounded, indexed service-event read model |
| Langfuse Compose overlay and launchd unit | Integrate it into the immutable production release, secrets, capacity, backup, restore, and rollback contracts |
| Langfuse loopback UI on port 3100 | Add the private `/observability` route and real browser proof |
| Canonical shared MCP registry and HTTP/stdio gateway | Add a scoped event-query tool and update the frozen tool manifest and both transports |

The existing S31-07 task metadata still says `Backlog` even though related source
commits exist. OBS-01 must reconcile task metadata, exact commit ancestry, installed
runtime identity, and fresh live evidence before preserving or replacing its claims.
This PRD does not assert that the currently hosted service has working Langfuse.

## Target Architecture

```text
Mastra agents / workflows / tools / model calls
                    |
                    v
          Mastra Observability
           |        |        |
           |        |        +--> optional Mastra Platform shadow exporter
           |        +-----------> Langfuse exporter over OTLP/HTTP v4
           +--------------------> MastraStorageExporter in Holocron Postgres
                                            |
                                            v
                              trace-correlated logs and metrics

Holocron mission/chat/inference/deployment events
                    |
                    v
          service_event_feed_v1 (Postgres)
                    |
                    v
          query_service_events MCP tool

Tailnet HTTPS :44111 -> edge proxy -> Mastra API/MCP or Langfuse web UI
```

### Correlation Contract

Every user-visible execution must carry the same correlation identifiers through
the Mastra span tree and first-party tables when applicable:

- `traceId`
- `runId`
- `missionId`
- `workflowRunId`
- `toolCallId`
- `provider`, `model`, and normalized endpoint identity
- immutable release SHA and image digest
- environment and service name

Raw secrets, authorization headers, credential values, and unbounded prompt/output
payloads must never enter first-party event summaries. Sensitive model content is
redacted before export. Full content capture is opt-in and governed by retention.

## Mastra and Langfuse Integration

### Required exporters

The Mastra configuration will use:

- `MastraStorageExporter` for locally queryable trace continuity.
- The supported `@mastra/langfuse` exporter or the equivalent supported OTLP/HTTP
  v4 integration for Langfuse.
- `SensitiveDataFilter` before every external or vendor-schema sink.
- `MastraPlatformExporter` only when explicitly enabled with a real
  `MASTRA_PLATFORM_ACCESS_TOKEN`; absence means disabled, not fake success.

The custom exporter that posts to `/api/public/ingestion` and reads the deprecated
trace endpoint will be retired after a real compatibility test. OTLP export must
use the Langfuse v4 ingestion header and authenticated `/api/public/otel` endpoint.

### Logs and metrics

Trace-aware logging will be enabled so logs inherit active trace/span context.
Metrics are derived from trace data and must cover at least:

- request, agent, workflow, tool, and model error rates;
- p50/p95/p99 latency by operation, provider, and model;
- model requests, input/output tokens, and estimated spend where price data is
  known;
- exporter queue depth, failed flushes, and last successful export;
- trace-to-`inference_telemetry` correlation parity;
- mission and chat run terminal-status distribution.

### Export failure behavior

Loss of the Langfuse sink must not take down core mission execution. It must also
never be silently green. Export failures will:

1. preserve the first-party event/trace where possible;
2. mark the observability component degraded in `/health`;
3. emit a durable, redacted operational event;
4. retry with bounded backoff and queue limits;
5. surface exporter freshness to the MCP event feed.

## Langfuse Production Contract

### Services and state

The production release adds pinned services for Langfuse web, worker, ClickHouse,
Redis, object storage, and its application PostgreSQL database. Langfuse state must
not share schemas or credentials with Holocron's primary application database.

All existing example/default passwords and salts in the Compose overlay are
forbidden in the production profile. Production startup fails closed when required
secret names are absent. Values remain only in the canonical ignored secret stores
and must not appear in task artifacts, logs, command arguments, or evidence.

### Capacity and lifecycle

The existing production service-count, memory, disk, and volume assertions must be
updated explicitly. Langfuse's published low-scale Docker Compose requirements are
larger than Holocron's current application-only budget, so OBS-01 must measure the
target mini and record a go/no-go capacity result before rollout.

The release contract must include:

- per-service CPU, memory, and disk limits;
- health checks for web, worker, ClickHouse, Redis, object storage, and Langfuse DB;
- graceful worker and exporter drain on deploy;
- volume inventory and backup/restore coverage;
- immutable source revision and digest evidence for the custom web build;
- an atomic rollback that preserves compatible state.

### Retention defaults

Initial defaults, adjustable after measured usage:

| Data class | Default retention |
|---|---:|
| Raw prompt/output content in Langfuse | 30 days |
| Trace metadata, scores, and first-party inference telemetry | 180 days |
| Operational health/exporter events | 90 days |
| Aggregated service metrics | 365 days |

Retention jobs must be deterministic, observable, and covered by backup/restore
tests. Deletion must not remove newer correlated records or active investigations.

## MCP Tool: `query_service_events`

The MCP tool reads a versioned Postgres read model, not Docker logs or Langfuse's
private tables. This keeps the contract stable across observability-vendor changes.

### Input

```typescript
type QueryServiceEventsInput = {
  since: string                 // ISO-8601; defaults to now - 1 hour
  until?: string                // ISO-8601; defaults to now
  sources?: Array<
    | 'mission'
    | 'chat'
    | 'inference'
    | 'agent'
    | 'deployment'
    | 'health'
    | 'observability'
  >
  severities?: Array<'debug' | 'info' | 'warning' | 'error' | 'critical'>
  statuses?: string[]
  eventTypes?: string[]
  traceId?: string
  runId?: string
  entityType?: string
  entityId?: string
  detailLevel?: 'summary' | 'metadata' // never defaults to raw content
  limit?: number                        // default 50; maximum 200
  cursor?: string
}
```

The maximum query window is seven days per call. Larger investigations paginate
with an opaque stable cursor. Invalid or unbounded requests fail closed.

### Output

```typescript
type ServiceEventV1 = {
  eventId: string
  observedAt: string
  source: string
  category: string
  type: string
  severity: 'debug' | 'info' | 'warning' | 'error' | 'critical'
  status?: string
  traceId?: string
  runId?: string
  entityType?: string
  entityId?: string
  durationMs?: number
  tokenUsage?: { input?: number; output?: number; total?: number }
  summary: string
  metadata?: Record<string, unknown>
  redacted: boolean
  observabilityUrl?: string
}

type QueryServiceEventsOutput = {
  events: ServiceEventV1[]
  nextCursor?: string
  query: { since: string; until: string; limit: number }
  sourceFreshness: Record<string, string | null>
  release: { sha: string; imageDigest: string }
}
```

The read model `service_event_feed_v1` deterministically unions normalized fields
from `mission_events`, `chat_run_events`, `inference_telemetry`, legacy
`agent_telemetry` while it remains supported, and new deployment/health/exporter
events. Source-specific metadata is allowlisted and redacted at write and read time.

The tool uses a dedicated read-only observability scope/key. It is registered once
in the canonical tool registry and exercised through both HTTP and stdio MCP
transports. Because the current tool manifest is frozen at 44 tools, delivery must
version and prove the new 45-tool contract rather than editing only one transport
or hiding the addition from compatibility checks.

## Alerts and Operator Signals

Initial deterministic alerts:

| Signal | Warning | Critical |
|---|---:|---:|
| No successful Langfuse export | 2 minutes | 5 minutes |
| Export queue utilization | 70% | 90% |
| Trace/inference correlation mismatch | any for 5 minutes | any for 15 minutes |
| Model/tool error rate | >5% for 10 minutes | >15% for 5 minutes |
| Oldest queued mission | 2 minutes | 5 minutes |
| Langfuse state volume usage | 80% | 90% |
| Latest successful observability backup | 18 hours | 24 hours |

Thresholds are configuration, while evaluation, phase transitions, and delivery
are deterministic code. Alert delivery failures themselves become events.

## Delivery Sequence

| Task | Result | Depends on |
|---|---|---|
| OBS-01 | Reconciled baseline, supported API/image pins, and capacity go/no-go | — |
| OBS-02 | Supported Mastra -> Langfuse OTLP v4 trace pipeline | OBS-01 |
| OBS-03 | Trace-aware logs, metrics, correlation, degradation, and retention | OBS-02 |
| OBS-04 | Production Langfuse services, secrets, state, backup, and rollback | OBS-01 |
| OBS-05 | Private `/observability` route through immutable edge release | OBS-04 |
| OBS-MCP-01 | Indexed first-party event feed and bounded MCP query tool | OBS-03 |
| OBS-MCP-02 | Versioned 45-tool manifest and HTTP/stdio parity | OBS-MCP-01 |
| OBS-QA-01 | Fresh real-service end-to-end and failure-mode proof | all prior tasks |

Task specifications live in `.spec/tasks/holocron-observability-console/`.

## Blocking Real-Service Acceptance Gates

The initiative is complete only when all of these are observed on the real hosted
service at the exact deployed SHA and image digests:

1. A real mission using the real local inference fleet produces a Mastra span tree,
   a correlated `inference_telemetry` row, and a Langfuse trace.
2. A browser on the tailnet loads `/observability`, authenticates, and opens that
   trace without redirects to a broken root path.
3. A real chat, mission, tool call, inference call, and exporter health event are
   returned by `query_service_events` through both HTTP and stdio MCP transports.
4. Database queries independently prove that MCP pagination, filtering, ordering,
   redaction, and source freshness match canonical rows.
5. Stopping Langfuse leaves mission execution available, makes `/health` degraded,
   records the exporter failure, and drains queued spans after recovery.
6. Restarting the entire release preserves state and restores the one-path UI.
7. A real backup and isolated restore recover Langfuse and first-party event state.
8. Secret sentinels are absent from traces, logs, MCP output, evidence, and UI.
9. Source, tests, and task artifacts contain no stubbed transports, canned success,
   skipped core paths, placeholder credentials, or TODO deferrals.

## Out of Scope

- Public internet exposure of the observability console.
- Replacing Holocron's durable operational tables with Langfuse storage.
- High-availability Langfuse clustering in the first release.
- Using model judgment for alert triggering, retention, authorization, or health.
- Treating the hosted Mastra Platform as a required control-plane dependency.

## Primary References

- [Mastra observability overview](https://mastra.ai/docs/observability/overview)
- [Mastra observability exporters](https://mastra.ai/docs/observability/exporters/overview)
- [Langfuse self-hosting](https://langfuse.com/self-hosting)
- [Langfuse Docker Compose deployment](https://langfuse.com/self-hosting/deployment/docker-compose)
- [Langfuse custom base path](https://langfuse.com/self-hosting/configuration/custom-base-path)
- [Langfuse native OpenTelemetry integration](https://langfuse.com/integrations/native/opentelemetry)
- [Langfuse Observations API](https://langfuse.com/docs/api-and-data-platform/features/observations-api)

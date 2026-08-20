# Holocron Observability Console

**Status:** Ready for governed implementation
**Version:** 2.0.0
**Date:** 2026-08-20
**Target:** MK-VI Mastra platform on the tailnet mini

## Outcome and done boundary

Ship one private operator destination at
`https://<holocron-tailnet-host>:44111/observability` for human trace
investigation, plus a read-only `query_service_events` MCP tool for redacted,
correlated operational events.

This document is an implementation contract. It does not claim that the feature is
implemented, installed, running, ingesting, queryable, or recoverable. The initiative
is done only after OBS-QA-01 records fresh proof from the exact immutable hosted
release. A source commit, green unit test, successful archive, or reachable health
endpoint is not a substitute for that proof.

## Fixed decisions

1. **Mastra is the instrumentation plane.** It creates trace, log, metric, and
   feedback correlation for agents, workflows, tools, and model calls.
2. **Langfuse is the human LLM/agent console, not the operational source of truth.**
   Holocron Postgres owns service events, exporter state, deployment identity, and
   health history.
3. **One release, separate containers.** Langfuse web, worker, Postgres,
   ClickHouse, Redis, and object storage join the same immutable Compose release;
   none is placed in the Mastra image.
4. **One private ingress.** A pinned edge image owns loopback port 44111 and routes
   `/observability*` to Langfuse while all other paths continue to Mastra. Tailnet
   HTTPS remains the only network boundary.
5. **Supported export path.** Replace the custom legacy
   `/api/public/ingestion` exporter with `@mastra/otel-exporter`, a pinned
   OpenTelemetry Collector persistent queue, and Langfuse OTLP v4. Do not query
   Langfuse private tables or deprecated trace endpoints. Direct
   `@mastra/langfuse` remains a compatibility canary, not the production path,
   because its public surface does not provide the required bounded-queue state.
6. **Visible but non-fatal sink failure.** A Langfuse outage cannot take core
   mission execution down. It must make observability degraded, persist a redacted
   event, enter a bounded queue, and recover or exhaust explicitly.
7. **Intentional compatibility change.** `query_service_events` changes the frozen
   MCP surface from 44 to 45 tools in the registry, manifest, HTTP transport,
   platform stdio transport, and packaged compatibility stdio surface together.
8. **No stubs or skipped completion lanes.** Every completion claim uses real Bun,
   Postgres, Langfuse, browser, MCP transports, local inference fleet, R2 backup, and
   isolated restore evidence.

## Current baseline and gaps

| Present now | Required change |
|---|---|
| `MastraStorageExporter` and `SensitiveDataFilter` in `services/platform/src/mastra.ts` | Keep local storage; enable supported logs/metrics and official Langfuse export |
| `HolocronLangfuseExporter` posting to `/api/public/ingestion` | Retire after a real OTLP v4 canary proves the replacement |
| `inference_telemetry`, `mission_events`, `chat_run_events`, `agent_telemetry` | Add durable service/export events and normalized `service_event_feed_v1` |
| Six-service Langfuse overlay with fallback credentials | Fold into production release, remove all production fallbacks, pin every image/source |
| Four-service production release and two-volume assertions | Move to twelve services and eight declared volumes with explicit state classes |
| Mastra bound directly to loopback 44111 | Put a deterministic edge service at 44111 and preserve every non-console path |
| Frozen 44-tool registry and compatibility manifest | Add one scoped tool and prove an exact 45-tool surface through both transports |
| Integration tests that skip without service credentials | Add fail-closed live preflights; missing services produce BLOCKED evidence, never green |

## Dependency and supply-chain gate

OBS-01 owns the only allowed dependency decision. The first candidate is deliberately
minimal:

| Package | Current | Candidate A |
|---|---:|---:|
| `@mastra/core` | `1.50.1` | `1.50.1` |
| `@mastra/pg` | `1.15.1` | `1.15.1` |
| `@mastra/mcp` | `1.13.1` | `1.13.1` |
| `@mastra/observability` | `1.16.0` | `1.17.1` |
| `@mastra/otel-exporter` | absent | `1.3.9` |
| `@mastra/langfuse` | absent | `1.4.9` compatibility canary only |
| transitive `@langfuse/client`, `@langfuse/otel` | absent | lockfile-resolved `5.10.1` |

Candidate A is accepted only if a real Bun + Postgres + pinned Collector + Langfuse v4
canary proves trace conversion, redaction, persistent queue depth/oldest-item metrics,
flush success, an observable failure signal, and recovery.
If it fails, Candidate B is the coherent suite `@mastra/core@1.60.0`,
`@mastra/observability@1.17.1`, `@mastra/pg@1.21.0`,
`@mastra/otel-exporter@1.3.9`, with the current MCP package retained unless its own
compatibility sweep requires `@mastra/mcp@1.17.0`. Candidate B requires the full
platform regression suite. No implementer may improvise a third matrix: record the
failed evidence and amend OBS-01 first.

For either matrix, commit exact package versions and lockfile integrity, verify the
installed dependency graph, and compare every selected Mastra version against the
official 2026 supply-chain incident denylist/advisory. A denied, unpublished,
deprecated-for-security, provenance-mismatched, or engine-incompatible artifact is a
hard no-go. Current candidate packages require Node `>=22.13`; the gate records both
Node and Bun identities even though production runs Bun.

The initial image/source candidates are Langfuse source `v4.15.0` at
`2371d606c4ab8882f09f6afce5b73948698552c6`, worker index digest
`sha256:37a7c4251b602e60fd39451e6c252195908bf61837d4e252adbd752c0809e835`,
ClickHouse 25.12 digest
`sha256:8a790dd3468db22b1d4e7b18a176f378ff5ff6053b9c48dd4ea1fa71a24c5ba6`,
Redis 7 digest
`sha256:91d0f7e8c748ec7a4c2b4fb2c4f84edab794dd91d01e095e38dc906db9d684ab`,
and Postgres 17 digest
`sha256:e38411452a464af89e5adadb8d223bf53b898d47d6ef918b2d58c08707350449`.
These are discovery inputs, not approved release pins. OBS-01 must resolve the MinIO,
edge, Collector, final custom-web, and every ARM64 child-manifest digest, then verify
all candidates against their registries before setting GO.

## Target architecture

```text
Tailnet HTTPS :44111
        |
        v
 pinned edge container on 127.0.0.1:44111
   |-- /observability* --> langfuse-web:3000
   `-- everything else -> mastra:4111

Mastra agents/workflows/tools/model calls
        |
        v
Mastra Observability
   |-- MastraStorageExporter ----------> Holocron Postgres
   `-- @mastra/otel-exporter --> pinned OTel Collector --> Langfuse OTLP v4
              |                    |                       |
              `--> export state <--+ persistent queue      `--> worker/state

mission/chat/inference/deploy/health/export events
        |
        v
service_event_feed_v1 --> query_service_events --> HTTP and stdio MCP
```

## Immutable production topology

The production Compose project contains exactly these twelve services:

1. `postgres`
2. `mastra`
3. `scheduler`
4. `zero-cache`
5. `edge`
6. `langfuse-web`
7. `langfuse-worker`
8. `langfuse-postgres`
9. `langfuse-clickhouse`
10. `langfuse-redis`
11. `langfuse-minio`
12. `otel-collector`

Names are explicit so the Langfuse database cannot collide with Holocron's primary
`postgres` service. Only `edge` publishes `127.0.0.1:44111:44111`. Internal state
services publish no host ports in production. The current standalone overlay is
retained only as a development include or retired; it cannot have a separate
production lifecycle.

The eight declared volumes are Holocron Postgres, Zero cache state, Langfuse
Postgres, ClickHouse data, ClickHouse logs, MinIO data, Redis data, and the Collector
persistent queue. Release and
restore code classifies each as authoritative, derived-but-required-for-recovery, or
rebuildable; it never silently omits one because an older assertion expected two.

### Release lock v2

`ReleaseLock` moves to schema version 2 and records, for every service, image
repository, platform-specific digest, source revision when custom-built, and build
provenance. It also records the canonical Compose SHA-256. A release is nondeployable
unless all twelve services resolve by digest for the target ARM64 host.

The Langfuse web image is built from an exact verified upstream source revision with
`NEXT_PUBLIC_BASE_PATH=/observability`; runtime env substitution is forbidden. The
build record includes the upstream tag/commit, Dockerfile path, build argument, output
repository/digest, and verification that the image labels match the source. The edge
image and configuration are separately pinned. Exact image revisions are outputs of
OBS-01's ARM64 compatibility gate, not floating values in this plan.

### Secrets and capacity

Production Compose uses `${NAME:?required}` or file-backed secret inputs. It has no
password, salt, key, or admin default. Secret values never enter Git, argv, evidence,
or rendered release metadata. OBS-04 adds names to the value-free secret index and
templates, including database, ClickHouse, Redis, MinIO, encryption, auth, project
API-key, and initial-admin inputs. Services without native `_FILE` support receive a
tmpfs-generated config; Redis credentials must not appear in `command` or healthcheck
argv.

OBS-01 records target-host CPU architecture, free memory, free disk, Docker capacity,
and the published Langfuse low-scale envelope. Current published guidance implies a
substantial footprint (about 27.5 GB across the Langfuse services); failure to reserve
the documented budget blocks productionization instead of silently overcommitting.

### Backup, restore, and rollback

The existing R2/restic path covers the complete release. A backup quiesces Langfuse
web/worker, drains queued work, stops state writers, snapshots every protected volume
plus ReleaseLock v2, and then resumes the exact release. Success means a restic
snapshot exists and is independently readable; creating an archive alone is not
success.

Restore uses fresh isolated volume and project names, starts the exact pinned images,
waits for migrations, then opens a known trace and score through Langfuse and queries a
known first-party event. Rollback is allowed only when the previous application and
Langfuse schema versions are compatible; otherwise the release fails closed with the
incompatibility named.

## Observability data contract

### Correlation fields

Where applicable, all signal producers carry `traceId`, `spanId`, `runId`,
`missionId`, `workflowRunId`, `toolCallId`, provider/model/endpoint identity,
environment, service, release SHA, and image digest. Raw authorization, credentials,
headers, model response bodies, and unbounded prompt/output content are excluded from
the operational event store. Langfuse content capture remains separately governed.

### Durable tables

Migration `0042_service_events_observability_state.sql` and
`services/platform/src/db/schema/observability.ts` add:

- `service_events`: stable id, observed time, source, category, event type, severity,
  status, correlation/entity fields, bounded summary, allowlisted JSON metadata,
  redaction marker, and immutable release identity.
- `observability_export_state`: sink, state, queue depth/capacity, oldest queued time,
  last attempt/success/failure, consecutive failures, and bounded error code.
- optional deterministic alert-state rows when needed to prevent repeated delivery;
  never model-generated alert transitions.

Indexes support observed-time ordering, trace/run lookup, source/type/status filters,
and retention. The write path enforces metadata size and allowed keys before insert.

### Export failure state machine

The pinned OpenTelemetry Collector owns a persistent bounded queue of 1,000 batches,
documented retry/backoff, and documented internal metrics. It receives OTLP from the
supported Mastra exporter and sends authenticated OTLP v4 to Langfuse. Queue-full,
retry-exhausted, and flush-timeout states generate durable first-party events through
the typed export-health bridge; mission execution still relies on successful local
capture, not vendor delivery.

Queue depth, capacity, oldest item, send failures, and last success are derived only
from Collector metrics plus bounded Langfuse Observations API v2 confirmation. If the
pinned versions cannot provide those signals on the real stack, OBS-01 returns
`EXPORT_QUEUE_STATUS_UNAVAILABLE` and implementation stops. No custom exporter wrapper
or invented freshness is permitted.

### Health semantics

`/health` adds an `observability` component containing local storage, exporter state,
ingestion/UI reachability, queue depth/capacity, oldest item, last success/failure, and
freshness. If core dependencies remain ready, an observability outage returns HTTP 200
with body status `degraded`. HTTP 503 remains reserved for core readiness failure.
This prevents telemetry failure from becoming product downtime while keeping it
machine-visible.

### Logs, metrics, retention, and alerts

Mastra logging is enabled with active trace/span correlation. Deterministic metrics
cover operation/provider/model counts, errors, p50/p95/p99 latency, tokens/cost where
pricing is known, exporter queue/failures/freshness, trace-to-inference parity, and
mission/chat terminal states.

Initial retention is 30 days for raw Langfuse content, 180 days for trace metadata and
inference telemetry, 90 days for operational events, and 365 days for aggregates.
Scheduler jobs use real Postgres/Langfuse APIs, are idempotent, protect boundary rows,
and emit deletion counts and failures.

Initial deterministic warning/critical thresholds are: export freshness 2/5 minutes,
queue utilization 70/90 percent, state-volume use 80/90 percent, and backup age 18/24
hours. Alert delivery failures become events.

## `service_event_feed_v1`

Migration `0043_service_event_feed_v1.sql` creates a versioned read-only SQL view over
`mission_events`, `chat_run_events`, `inference_telemetry`, the safe subset of
`agent_telemetry`, and `service_events`. Each branch emits the same columns and a
namespaced stable event id. Ordering is `(observed_at DESC, event_id DESC)`.

The view never returns raw `agent_telemetry` model responses or arbitrary JSON. Each
source maps only named fields and an allowlist of metadata keys. Underlying tables gain
the exact trace/run/source/type/time indexes required by the query. Real
`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)` receipts for the default query and trace/run
filters must demonstrate index use on seeded production-shape data.

## MCP contract

### Authorization

Add a dedicated `observability` key scope named `HOLO_KEY_OBSERVABILITY`. It can call
only `query_service_events` and only through `/mcp`. The Hono scope is passed into the
gateway, which filters advertised tools and rejects unauthorized calls before the
executor or database is reached. Existing `mcp` credentials retain the complete
45-tool surface. Negative evidence proves an unauthorized request made zero database
queries.

### Input

```typescript
type QueryServiceEventsInput = {
  since?: string // ISO UTC; default now minus one hour
  until?: string // ISO UTC; default now
  sources?: Array<'mission' | 'chat' | 'inference' | 'agent' | 'deployment' | 'health' | 'observability'>
  severities?: Array<'debug' | 'info' | 'warning' | 'error' | 'critical'>
  statuses?: string[]
  eventTypes?: string[]
  traceId?: string
  runId?: string
  entityType?: string
  entityId?: string
  detailLevel?: 'summary' | 'metadata'
  limit?: number // default 50, maximum 200
  cursor?: string
}
```

The maximum window is seven days. Empty, malformed, future-reversed, overlong, or
invalid cursor requests fail before SQL. The opaque base64url cursor encodes canonical
`{ v: 1, observedAt, eventId, query, digest }`; the digest binds the anchored window
and all resolved filters. It is strictly decoded, and cursor pages cannot alter filters.

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

The executor builds deep links from validated `OBSERVABILITY_BASE_URL` and
`LANGFUSE_PROJECT_ID`; SQL never knows a vendor URL. URL construction preserves the
`/observability` base path and returns no URL when `traceId` is absent. Redaction is
applied at write, view, and response boundaries.

## File ownership map

| Task | Primary files/modules |
|---|---|
| OBS-01 | package manifests/lock, candidate canary, dependency/image/capacity evidence and plan ledger only |
| OBS-02 | `services/platform/src/mastra.ts`, observability exporter modules, mission/backup/span callers, live exporter tests |
| OBS-03 | migration 0039, observability schema/modules, health, scheduler registry, logging/retention tests |
| OBS-04 | production Compose, image/release lock v2, release/deploy/verify/stage/cutover, secrets templates, backup/restore |
| OBS-05 | edge config/image, custom Langfuse web build/provenance, routing/preflight, real browser test |
| OBS-MCP-01 | migration 0040, schemas, tool registry/schema/executor, scope middleware/gateway, query/index/auth tests |
| OBS-MCP-02 | compatibility manifest/fixtures/verifiers, platform and packaged stdio surfaces, HTTP/stdio parity tests |
| OBS-QA-01 | live gate runner/runbook and immutable evidence bundle; no product behavior is first implemented here |

The task files enumerate exact paths and commands. Before dispatch, the orchestrator
must reconcile these paths against retained Sprint 33 worktrees; shared-file ownership
is exclusive and main must remain unchanged while a worker runs.

## Delivery graph

```text
OBS-01
  |-- OBS-02 --\
  |             --> OBS-03 --> OBS-MCP-01 --\
  `-- OBS-04 --> OBS-05 ---------------------> OBS-MCP-02 --> OBS-QA-01
```

OBS-03 depends on OBS-02 and OBS-04 because degradation/retention must be exercised
against the production topology. OBS-MCP-02 depends on OBS-MCP-01 and OBS-05 because
parity includes valid console deep links. QA depends on every prior task.

## Real-service initiative gate

The final evidence bundle must show, at one exact release SHA and set of image digests:

1. a real mission through the real local inference fleet, its Mastra span tree,
   `inference_telemetry` row, and Langfuse v2 observation;
2. a real tailnet browser login and trace deep link under `/observability`;
3. real chat, mission, tool, inference, deployment, health, and exporter events through
   HTTP and stdio MCP with an independent SQL parity receipt;
4. deterministic ordering, cursor, filter, seven-day bound, index-use, redaction, and
   zero-query authorization negatives;
5. Langfuse loss with mission availability, HTTP-200 degraded health, durable failure,
   bounded queue, and recovery drain;
6. exact-release restart with retained state and unchanged ingress behavior;
7. R2/restic backup and isolated restore of a known trace, score, and event;
8. secret-sentinel absence across logs, traces, UI, MCP, evidence, and process argv;
9. source/test scan with no mock transport, canned success, skip, placeholder secret,
   or deferred core behavior.

If a real dependency or credential is unavailable, the gate records `BLOCKED` with
the missing invariant and makes no completion claim.

## Out of scope

- public internet exposure;
- replacing first-party operational storage with Langfuse;
- HA Langfuse clustering in this release;
- model judgment for auth, retention, health, alerts, or phase transitions;
- client/mobile UI changes or an App Store/EAS deploy;
- making hosted Mastra Platform a required dependency.

## Primary sources

- [Mastra observability overview](https://mastra.ai/docs/observability/overview)
- [Langfuse OpenTelemetry v4 migration](https://langfuse.com/integrations/native/opentelemetry/migration-to-v4)
- [Langfuse custom base path](https://langfuse.com/self-hosting/configuration/custom-base-path)
- [Langfuse scaling guidance](https://langfuse.com/self-hosting/configuration/scaling)
- [Langfuse backup guidance](https://langfuse.com/self-hosting/configuration/backups)
- [Langfuse Observations API v2](https://langfuse.com/docs/api-and-data-platform/features/observations-api)
- [Mastra 2026 supply-chain incident](https://github.com/mastra-ai/mastra/issues/18061)

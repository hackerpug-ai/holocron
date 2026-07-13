---
stability: FEATURE_SPEC
last_validated: 2026-07-13
prd_version: 2.0.0
functional_group: PLAT
---

# Use Cases: Platform Foundation (PLAT)

| ID | Title | Description |
|----|-------|-------------|
| UC-PLAT-01 | Provision Postgres on the mini | Stand up the single Postgres datastore (pgvector + FTS + logical replication) on the tailnet mini. |
| UC-PLAT-02 | Stand up the Mastra service | One Mastra/Bun service (agents, tools, workflows, processors) fronted by Hono, reachable over Tailscale. |
| UC-PLAT-03 | Scheduler & durable queue | Replace all 16 Convex crons + `scheduler.runAfter` chaining with Mastra `schedule` + a Postgres-backed leased queue. |
| UC-PLAT-04 | Observability, budget ledger & evals | Langfuse + OTel tracing, inference telemetry, the escape-hatch budget ledger, and local-judge eval scorers. |
| UC-PLAT-05 | Deployment & dev/prod parity | Run the stack headless on the mini via launchd; mirror it on the laptop for dev; consolidate secrets/config. |

---

## UC-PLAT-01: Provision Postgres on the mini

A single Postgres 18 instance with `pgvector` and native full-text search is the sole datastore, on the tailnet mini, reachable over Tailscale, with logical replication configured for Zero and DB-level immutability on the ledger tables.

**Acceptance Criteria**
- ☐ Operator can start a Postgres instance with the `vector` extension enabled on the mini and reach it over Tailscale from the laptop.
- ☐ System can apply every Drizzle migration cleanly against the real Postgres, producing all domain tables plus the evidence-graph substrate with their btree/GIN/HNSW indexes.
- ☐ Operator can confirm logical replication is ready for zero-cache (`wal_level=logical`, a `zero_pub` publication over the reactive subset only, single-column uuid PK replica identity on every published table).
- ☐ System can reject direct `UPDATE` and `DELETE` on append-only evidence/ledger tables at the database level while allowing only the authorized temporal-revision transaction to close a predecessor and insert its successor atomically.

---

## UC-PLAT-02: Stand up the Mastra service

One Mastra service — agents, a single shared tool/Zod registry, workflows, and processors — fronted by a Hono HTTP + SSE surface, runs on the mini and is the sole backend. Tailscale provides network reachability; scoped API keys authorize application, MCP, and control-plane operations.

**Acceptance Criteria**
- ☐ System can boot the Mastra service on the mini and answer a health check over Tailscale.
- ☐ System can register every tool from one shared Zod schema set (no duplicate validation layer) reachable identically by agents, workflows, and the MCP gateway.
- ☐ Agent Client can reach the Hono API surface over Tailscale only with its scoped API key; an unkeyed tailnet request cannot invoke MCP, verdict, or steering mutations (no RLS or multi-tenant model is introduced).
- ☐ System can resolve every required model role through the versioned Fleet Role Manifest to a live fleet endpoint from within the running service and fail closed when a declared capability is absent.

---

## UC-PLAT-03: Scheduler & durable queue

A scheduler (Mastra native `schedule`) plus a Postgres-backed leased queue (graphile-worker or pg-boss) replaces all 16 Convex crons and the `scheduler.runAfter` chaining, with at-least-once execution and exactly-once observable effects.

**Acceptance Criteria**
- ☐ System can run all 16 migrated scheduled jobs on the mini, each observably performing its former Convex-era side-effect (timeout sweeps, subscription fetch, feed build, morning digest, whats-new daily, embedding backfill, telemetry cleanup) against real Postgres.
- ☐ System can enqueue and lease durable work with retry/backoff and a dead-letter path, using an outbox/inbox, fencing, and stable idempotency keys so a kill-9 at every commit/dispatch boundary produces one observable side effect.
- ☐ System can prioritize interactive work over background missions on the shared queue (interactive chat/research ahead of standing/fulcrum jobs).

---

## UC-PLAT-04: Observability, budget ledger & evals

Langfuse (self-hosted) + OTel tracing, an inference-telemetry stream, the escape-hatch budget ledger, and eval scorers with drift tracking give the platform detective controls the Convex system never had.

**Acceptance Criteria**
- ☐ System can emit an OTel trace for every mission run and agent call to a self-hosted Langfuse, viewable per run.
- ☐ System can record inference telemetry (tokens, wall-ms, endpoint, role) to Postgres for every model call.
- ☐ System can score a mission output with a local judge model against a versioned rubric/dataset baseline and persist the score for longitudinal drift tracking.
- ☐ System can block a CI lane when a deterministic invariant or configured eval threshold regresses, with a deliberately bad fixture proving the gate.

---

## UC-PLAT-05: Deployment & dev/prod parity

The platform runs headless on the mini via launchd; the identical stack runs on the laptop for development; all configuration resolves from one consolidated secrets source with no Convex env sprawl.

**Acceptance Criteria**
- ☐ Operator can bring the full stack (Postgres, Mastra, scheduler, zero-cache) up and down on the mini with one command each.
- ☐ Operator can run the identical stack on the laptop for dev against the same config contract as the mini.
- ☐ System can resolve all configuration from a single consolidated secrets source, with zero Convex env aliases (`EXPO_PUBLIC_CONVEX_URL`, `HOLOCRON_URL`, deploy keys, etc.) remaining in any surface.

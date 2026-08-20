# OBS-01: Reconcile Baseline and Pin Supported Contracts

**Status:** Planned
**Owner:** `mastra-planner`
**Reviewer:** `mastra-reviewer`
**Dependencies:** None

## Objective

Establish the exact source, installed-runtime, deployed-runtime, API, image, and
capacity baseline before changing observability. Reconcile the stale S31-07 task
status without treating landed source as proof of a healthy hosted capability.

## Acceptance Criteria

1. Exact ancestry and current source behavior are recorded for Mastra
   observability, Langfuse export, the Langfuse Compose overlay, launchd/supervisor
   integration, durable telemetry tables, and MCP registration.
2. Fresh live evidence distinguishes source-landed, installed, running, ingesting,
   and UI-queryable states at the deployed SHA/digests.
3. Compatible versions are pinned for `@mastra/core`, `@mastra/observability`,
   `@mastra/langfuse`, Langfuse v4, and every Langfuse state service; the real Bun
   platform proves one trace over OTLP/HTTP v4.
4. The target mini's real CPU, memory, disk, architecture, and existing workload
   are measured against the proposed topology. A documented go/no-go decision
   blocks rollout if capacity is insufficient.
5. Legacy `/api/public/ingestion` and deprecated trace-read usage are enumerated
   with callers and removal gates. No compatibility shim is accepted as the final
   path.

## Evidence

- Exact Git SHA/ancestry and image digest inventory.
- Redacted live request/response receipts from the real Mastra and Langfuse
  services.
- Capacity snapshot and projected resource budget.
- Updated task/roadmap truth with no unsupported completion claim.

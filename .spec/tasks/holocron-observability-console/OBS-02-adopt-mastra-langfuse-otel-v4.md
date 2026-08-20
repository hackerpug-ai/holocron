# OBS-02: Adopt Supported Mastra to Langfuse OTLP v4 Export

**Status:** Planned
**Owner:** `mastra-evals-implementer`
**Reviewer:** `mastra-reviewer`
**Dependencies:** OBS-01

## Objective

Replace Holocron's custom legacy Langfuse ingestion path with the supported Mastra
Langfuse exporter or its supported OTLP/HTTP v4 contract while retaining local
Mastra trace storage and pre-export redaction.

## Acceptance Criteria

1. A failing real-service test first proves the current legacy path cannot satisfy
   the pinned Langfuse v4 observation/eval contract.
2. `MastraStorageExporter` remains active and a supported Langfuse exporter sends
   authenticated OTLP/HTTP v4 data to the real Langfuse service.
3. Agents, workflows, tools, model calls, and manual fleet inference share
   `traceId`, `runId`, environment, service, release SHA, and image digest fields.
4. `SensitiveDataFilter` and Holocron's allowlist redaction execute before export;
   a real sentinel value is absent in local storage, Langfuse, logs, and receipts.
5. Export flush, shutdown drain, bounded retry, queue overflow, and failure
   semantics are verified against the real service. Core execution remains
   available while sink loss is visible and durable.
6. Legacy exporter code and deprecated trace API use are removed after the new path
   passes the live gate; there is no hidden fallback or fake-success response.

## Evidence

- RED and GREEN output from a real Bun + Mastra + Postgres + Langfuse run.
- Correlated local-storage and Langfuse trace identifiers.
- Sentinel scan and exporter recovery receipt.
- Implementer and independent reviewer commits.

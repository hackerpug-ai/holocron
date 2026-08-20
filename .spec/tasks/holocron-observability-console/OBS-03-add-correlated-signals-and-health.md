# OBS-03: Add Correlated Logs, Metrics, Health, and Retention

**Status:** Planned
**Owner:** `mastra-evals-implementer`
**Reviewer:** `mastra-reviewer`
**Dependencies:** OBS-02

## Objective

Make trace-aware logs, derived metrics, exporter freshness, deterministic alerts,
and retention first-class service contracts rather than UI-only behavior.

## Acceptance Criteria

1. Mastra logging is enabled and real agent/workflow/tool/model logs inherit active
   trace/span identifiers without leaking credential values.
2. Deterministic metrics cover latency, errors, tokens/cost where known, terminal
   status, exporter queue/failures/freshness, and trace-to-inference parity.
3. `/health` reports separate observability storage, ingestion, UI, and exporter
   freshness components plus immutable deployment identity.
4. Exporter degradation and alert delivery failures create durable, redacted
   operational events. Threshold evaluation does not depend on model judgment.
5. Retention jobs implement the PRD defaults against real Postgres and Langfuse
   state, protect newer correlated rows, expose run metrics, and fail visibly.
6. A real Langfuse outage proves core mission availability, degraded health, event
   persistence, bounded buffering, and successful recovery drain.

## Evidence

- Real trace-correlated logs and metric queries.
- Health transition and durable event rows during outage/recovery.
- Retention dry-run, execution, and boundary-row proof.
- Independent review of every producer and health call site.

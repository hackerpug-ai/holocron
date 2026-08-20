# OBS-QA-01: Prove Live Observability End to End

**Status:** Planned
**Owner:** `mastra-evals-implementer`
**Reviewer:** `test-quality-reviewer`
**Dependencies:** OBS-02, OBS-03, OBS-04, OBS-05, OBS-MCP-01, OBS-MCP-02

## Objective

Independently prove the complete observability capability on the real hosted
Holocron service at the exact deployed SHA and image digests, including failure,
restart, retention, backup, and restore paths.

## Acceptance Criteria

1. A real local-fleet mission creates a correlated Mastra trace, first-party
   inference row, Langfuse trace, trace-aware logs, and derived metrics.
2. The real tailnet `/observability` UI authenticates and renders the trace, model
   generation, tool spans, token metadata, and a real score/eval result.
3. Real chat, mission, tool, inference, deployment, health, and exporter events are
   returned through HTTP and stdio `query_service_events` and match independent
   database queries.
4. Langfuse loss, exporter saturation, invalid credentials, and recovery preserve
   core availability while producing truthful degraded health, durable events,
   bounded retry, alert delivery, and eventual drain.
5. Cold restart, deploy rollback, retention boundaries, backup, and isolated
   restore are watched against real state and retain immutable provenance.
6. Full project gates pass. Touched production/tests are scanned for stubs,
   placeholders, skipped core paths, canned success, insecure defaults, secret
   values, and TODO deferrals; any finding blocks completion.
7. The final evidence bundle names the deployed SHA/digests and separately proves
   source landed, release installed, service running, ingestion current, UI
   queryable, and MCP queryable.

## Evidence

- Exact-SHA/digest deployment and health receipts.
- Real browser, MCP, database, trace, metric, alert, restart, backup, restore, and
  rollback artifacts.
- Independent test-quality mutation/negative-path assessment.
- Final no-stub/no-secret scan with explicit command output.

# Sprint: Holocron Observability Console

**Status:** Planned
**PRD:** `.spec/prd/holocron-observability-console/README.md`
**Outcome:** A private `/observability` Langfuse console, supported Mastra
telemetry pipeline, and a bounded `query_service_events` MCP tool proven against
the real hosted service.

## Execution Order

```text
OBS-01
  |-- OBS-02 -> OBS-03 -> OBS-MCP-01 -> OBS-MCP-02 --|
  `-- OBS-04 -> OBS-05 ------------------------------|-> OBS-QA-01
```

## Tasks

| ID | Title | Implementer | Reviewer |
|---|---|---|---|
| OBS-01 | Reconcile baseline and pin supported contracts | `mastra-planner` | `mastra-reviewer` |
| OBS-02 | Adopt supported Mastra to Langfuse OTLP v4 export | `mastra-evals-implementer` | `mastra-reviewer` |
| OBS-03 | Add correlated logs, metrics, health, and retention | `mastra-evals-implementer` | `mastra-reviewer` |
| OBS-04 | Productionize the Langfuse service topology | `mastra-implementer` | `mastra-reviewer` |
| OBS-05 | Serve the private `/observability` path | `mastra-implementer` | `mastra-reviewer` |
| OBS-MCP-01 | Build the first-party event feed and MCP query tool | `mcp-implementer` | `mcp-reviewer` |
| OBS-MCP-02 | Version the tool manifest and prove transport parity | `mcp-implementer` | `mcp-reviewer` |
| OBS-QA-01 | Prove the complete capability with real services | `mastra-evals-implementer` | `test-quality-reviewer` |

## Sprint Rules

- Every task uses RED -> GREEN -> REFACTOR and real dependencies.
- No mock database, fake HTTP sink, in-memory filesystem, canned trace, or
  runtime-gated skip can satisfy an acceptance criterion.
- Workers commit only to their assigned branches and report the commit SHA.
- The orchestrator independently reviews, merges, installs/deploys, and verifies
  exact SHA/digest identity.
- Existing dirty checkout content is protected and must not be reset, cleaned,
  stashed, overwritten, or broadly staged.

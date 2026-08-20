# OBS-MCP-01: Build the Service Event Feed and Query Tool

**Status:** Planned
**Owner:** `mcp-implementer`
**Reviewer:** `mcp-reviewer`
**Dependencies:** OBS-03

## Objective

Create an indexed, versioned first-party event read model and a bounded,
read-only `query_service_events` MCP tool that exposes correlated operational
events without depending on Langfuse private tables or Docker logs.

## Acceptance Criteria

1. Failing integration tests first cover real rows from mission, chat, inference,
   agent, deployment, health, and observability sources in real Postgres.
2. `service_event_feed_v1` deterministically normalizes the PRD schema, preserves
   stable ordering/cursors, and has indexes proven by query plans for the default
   and trace/run filters.
3. Tool input enforces ISO-8601 bounds, a default one-hour window, maximum seven-day
   window, maximum 200 results, opaque cursor pagination, and allowlisted filters.
4. Output includes source freshness and immutable release identity. Metadata is
   allowlisted/redacted; raw content and secret-bearing fields are unavailable by
   default and cannot be requested through an undocumented option.
5. A dedicated read-only observability scope/key is enforced through real MCP auth;
   missing or wrong scope fails closed and makes no data query.
6. Independent database queries prove result equality, ordering, pagination,
   filtering, trace deep links, and redaction across real persisted events.

## Evidence

- Real migration/view/index output and query plans.
- HTTP MCP authorization and result receipts.
- Database-to-tool parity and sentinel-redaction report.
- Protocol/schema and path-traversal/security review.

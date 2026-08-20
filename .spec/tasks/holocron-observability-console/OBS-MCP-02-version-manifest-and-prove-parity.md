# OBS-MCP-02: Version the Tool Manifest and Prove Transport Parity

**Status:** Planned
**Owner:** `mcp-implementer`
**Reviewer:** `mcp-reviewer`
**Dependencies:** OBS-MCP-01

## Objective

Publish `query_service_events` through Holocron's single canonical registry and
prove the intentional transition from the frozen 44-tool contract to a versioned
45-tool contract across HTTP and stdio transports.

## Acceptance Criteria

1. The tool is registered once in the shared registry and both gateway transports
   discover and invoke the same schema/executor; there is no transport-specific
   duplicate implementation.
2. Compatibility manifests, tool counts, capability docs, protocol fixtures, and
   fleet/gateway sweeps are deliberately versioned from 44 to 45 tools.
3. Real HTTP and stdio MCP clients list and query the tool against the same hosted
   Postgres data and produce equivalent normalized results.
4. Pagination cursors, auth failures, invalid windows, source failure, empty
   results, and partial freshness are protocol-correct and use `isError`/structured
   errors without fake success.
5. Standard output remains protocol-clean; diagnostic logs contain correlation
   identifiers but no keys, payload secrets, or raw sensitive content.

## Evidence

- 45-tool manifest and dual-transport list/invoke receipts.
- Cross-transport schema and result parity report.
- Real negative-path receipts and stdio hygiene scan.
- Independent MCP protocol/security review.

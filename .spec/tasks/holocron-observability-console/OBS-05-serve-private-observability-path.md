# OBS-05: Serve the Private `/observability` Path

**Status:** Planned
**Owner:** `mastra-implementer`
**Reviewer:** `mastra-reviewer`
**Dependencies:** OBS-04

## Objective

Expose Langfuse at the single private tailnet path `/observability` without
breaking the existing Mastra API, health, Zero, or MCP routes.

## Acceptance Criteria

1. A custom Langfuse web image is built from a pinned source revision with
   `NEXT_PUBLIC_BASE_PATH=/observability`; its source revision and final digest are
   present in the immutable release lock.
2. Auth callback/base URLs use the real tailnet origin and subpath. Browser assets,
   navigation, API calls, refreshes, and deep trace links remain under the path.
3. A pinned edge service routes `/observability/*` to Langfuse and all other
   existing paths to Mastra while retaining loopback-only origin exposure and
   current tailnet HTTPS ingress.
4. Route precedence, timeouts, streaming, headers, and health checks are covered by
   real HTTP and browser tests. Existing `/health` and `/mcp` behavior remains
   byte/schema compatible except for the explicitly versioned tool addition.
5. A real tailnet browser authenticates, opens a known trace from a deep link,
   refreshes it, signs out, and cannot reach the UI outside the authorized network.

## Evidence

- Custom build provenance and deployed digest.
- Real tailnet HTTP receipts for old and new paths.
- Browser screenshots/session trace for login, trace inspection, refresh, and
  logout with sensitive content redacted from artifacts.

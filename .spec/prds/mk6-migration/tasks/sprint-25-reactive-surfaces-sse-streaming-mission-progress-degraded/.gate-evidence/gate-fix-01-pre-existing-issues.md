# Pre-existing issues (GATE-FIX-01)

- Root typecheck noise: use LEFTHOOK_EXCLUDE=root-typecheck if needed (pre-existing monorepo).
- FIX-09 platform vitest needs services/platform/node_modules (drizzle-orm) — worktree linked to primary.
- MCP cross-surface harness requires HOLO_KEY_MCP matching platform secrets.yaml (default mcp-test fails with 401).
- Maestro setAirplaneMode may not drop iOS sim Wi-Fi icon; reconnecting-indicator often optional-WARNs.
lefthook root-test fails: vitest-native setup path resolves to /@fs primary node_modules (pre-existing worktree).

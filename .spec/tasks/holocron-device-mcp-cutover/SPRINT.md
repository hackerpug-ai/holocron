---
id: holocron-device-mcp-cutover
title: Holocron device cutover and four-harness MCP migration
status: planned
base_branch: main
---

# Holocron device cutover and four-harness MCP migration

**Status:** Planned

> Progress: 0/3

## Outcome

After the existing `MK6-DATA-001` and `S33-PLAT-04` gates land, the deployed Postgres-backed
service exercises all frozen 44 MCP tools with guarded real production writes, exports the bearer
credential to new shell sessions without duplicating it, and atomically moves Codex, Claude,
OpenCode, and Grok from local SQLite stdio to the remote Streamable HTTP MCP.

## Reconciled dependency chain

`MK6-DATA-001 → S33-PLAT-04 → CUTOVER-MCP-001 → MK6-MCP-001 repairs as discovered → S33-MCP-03 → CUTOVER-HARNESS-001 → CUTOVER-HARNESS-002`

The existing canonical task files remain authoritative for `MK6-DATA-001`, `S33-PLAT-04`,
`MK6-MCP-001`, and `S33-MCP-03`. This sprint adds only the missing production-sweep and harness
cutover contracts.

## Tasks

| ID | Title | Assignee | Dependencies | Status |
|---|---|---|---|---|
| CUTOVER-MCP-001 | Guarded production MCP verifier with ordered resume and cleanup ledger | mcp-implementer | MK6-DATA-001, S33-PLAT-04 | Backlog |
| CUTOVER-HARNESS-001 | Non-secret zsh and cmux bearer bootstrap | mcp-implementer | S33-MCP-03 | Backlog |
| CUTOVER-HARNESS-002 | Atomic four-harness remote MCP switch and live mutation smoke | mcp-implementer | CUTOVER-HARNESS-001, S33-MCP-03 | Backlog |

## Human Testing Gate

1. Run `PLATFORM_IT=1 bun services/platform/src/cli/holo.ts cutover:verify-tools --production-write --run-id <fresh-id> --base-url https://holocron.tail011a51.ts.net:44111 --json` and require 44/44 real calls plus zero residue.
2. Start a fresh zsh and a fresh cmux pane; require a key-present boolean and an authorized MCP initialize without printing the credential.
3. Run `PLATFORM_IT=1 bun scripts/verify-holocron-mcp-harnesses.ts --all --discover --sentinel-read --subscription-smoke --assert-zero-residue --assert-writes-enabled --json` and require all four harnesses green.
4. Inspect the process tree and require no descendant running `$HOME/.holocron/mcp/src/mastra/stdio.ts`.

## Final gates

- `pnpm tsc --noEmit`
- `pnpm lint`
- `pnpm test`
- `pnpm build`
- Exact deployed SHA and `data_plane: postgres` from `/health`
- Fresh final 44-tool sweep and four-harness smoke with zero namespaced residue

---
id: holocron-device-mcp-cutover
title: Holocron device cutover and four-harness MCP migration
status: planned
base_branch: main
---

# Holocron device cutover and four-harness MCP migration

**Status:** Planned

> Progress: 0/7

## Outcome

After isolated corpus proof, exact release deployment, restorable checkpoint, production apply,
read-only flip, and separately authorized PONR, the deployed service proves all frozen 44 tools and
atomically moves four harnesses to the remote MCP.

## Reconciled dependency chain

`MK6-DATA-001 → CUTOVER-RELEASE-001 → CUTOVER-PLAT-001 → CUTOVER-DATA-001 → S33-PLAT-04 → CUTOVER-PLAT-002 → CUTOVER-MCP-001 → MK6-MCP-001 repairs as discovered → S33-MCP-03 → CUTOVER-HARNESS-001 → CUTOVER-HARNESS-002`

`MK6-DATA-001` remains the canonical isolated-only artifact contract. This sprint owns every
production mutation boundary around it; `S33-PLAT-04`, `MK6-MCP-001`, and `S33-MCP-03` retain their
specialist ownership with the dependencies recorded here.

## Tasks

| ID | Title | Assignee | Dependencies | Status |
|---|---|---|---|---|
| CUTOVER-RELEASE-001 | Deterministic exact-SHA release staging, package, and safe deployment | mastra-implementer | MK6-DATA-001 | Backlog |
| CUTOVER-PLAT-001 | Compose-aware Postgres/blob checkpoint with independent restore | mastra-implementer | CUTOVER-RELEASE-001 | Backlog |
| CUTOVER-DATA-001 | Frozen immutable composite artifact production apply and reconcile | mastra-implementer | MK6-DATA-001, CUTOVER-RELEASE-001, CUTOVER-PLAT-001 | Backlog |
| CUTOVER-PLAT-002 | Separately authorized composite-bound write enablement and PONR | mastra-implementer | CUTOVER-DATA-001, S33-PLAT-04 | Backlog |
| CUTOVER-MCP-001 | Guarded production MCP verifier with ordered resume and cleanup ledger | mcp-implementer | CUTOVER-PLAT-002 | Backlog |
| CUTOVER-HARNESS-001 | Non-secret zsh and cmux bearer bootstrap | mcp-implementer | S33-MCP-03 | Backlog |
| CUTOVER-HARNESS-002 | Atomic four-harness remote MCP switch and live mutation smoke | mcp-implementer | CUTOVER-HARNESS-001, S33-MCP-03 | Backlog |

Effective external dependencies: `S33-PLAT-04` depends on `CUTOVER-DATA-001`; `S33-MCP-03`
depends on `CUTOVER-MCP-001` and any `MK6-MCP-001` repair receipt produced by its stopped sweep.

## Human Testing Gate

1. Require green exact-release, checkpoint-restore, production-apply, read-only-flip, and PONR receipts whose SHA-256 bindings agree.
2. Run `PLATFORM_IT=1 bun services/platform/src/cli/holo.ts cutover:verify-tools --production-write --run-id <fresh-id> --base-url https://holocron.tail011a51.ts.net:44111 --json` and require 44/44 real calls plus zero residue.
3. Start a fresh zsh and a fresh cmux pane; require a key-present boolean and an authorized MCP initialize without printing the credential.
4. Run `PLATFORM_IT=1 bun scripts/verify-holocron-mcp-harnesses.ts --all --discover --sentinel-read --subscription-smoke --assert-zero-residue --assert-writes-enabled --json` and require all four harnesses green.
5. Inspect the process tree and require no descendant running `$HOME/.holocron/mcp/src/mastra/stdio.ts`.

## Final gates

- `pnpm tsc --noEmit`
- `pnpm lint`
- `pnpm test`
- `pnpm build`
- Exact deployed SHA and `data_plane: postgres` from `/health`
- Fresh final 44-tool sweep and four-harness smoke with zero namespaced residue

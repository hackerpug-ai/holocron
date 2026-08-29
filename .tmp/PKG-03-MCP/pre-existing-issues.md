# Pre-Existing Issues / Notes (PKG-03-MCP)

## Dual lockfile (in scope to document, not delete)

- `holocron-mcp/bun.lock` (will move with the package to `packages/mcp/bun.lock`)
  coexists with the repo-root `pnpm-lock.yaml`. Task contract allows dual-lock;
  do not silently delete `bun.lock` unless install requires it.

## Workspace baseline after PKG-01

- `pnpm-workspace.yaml` already includes `packages/*` from PKG-01-WEB.
- `packages/web` placeholder is present; `packages/mcp` is absent until GREEN.
- `@holocron/mcp-unified` is NOT a pnpm workspace member at RED start
  (`pnpm list -r --depth -1` shows holocron, @holocron/web, platform only).

## Full `pnpm test` suite

- Root pre-commit runs `pnpm test:unit` (not full integration). Full `pnpm test`
  has many live-service failures unrelated to this package move.

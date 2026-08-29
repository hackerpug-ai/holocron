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

## Post-GREEN Mastra ceiling (recorded, not hidden)

pnpm resolved caret ranges higher than `packages/mcp/bun.lock`:
- pnpm: `@mastra/core@1.50.1`, `@mastra/mcp@1.13.1`
- bun.lock: `@mastra/core@1.10.0`, `@mastra/mcp@1.1.0`

Documented as `kb:ceiling:` in `packages/mcp/README.md`. Dual-lock retained.

## lefthook mcp-lint still targets holocron-mcp/

Root `lefthook.yml` `mcp-lint` glob/root still say `holocron-mcp`. Outside
WRITE-ALLOWED for this task; command skips when no matching staged paths.
Follow-up: retarget to `packages/mcp`.

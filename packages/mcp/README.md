# holocron-mcp

To install dependencies:

```bash
bun install
```

To run:

```bash
bun run index.ts
```

This project was created using `bun init` in bun v1.3.7. [Bun](https://bun.com) is a fast all-in-one JavaScript runtime.

## Workspace membership (PKG-03-MCP)

This package lives at `packages/mcp` and is enrolled via root `pnpm-workspace.yaml`
(`packages/*`) as `@holocron/mcp-unified`.

### Dual lockfile

`bun.lock` is retained beside the repo-root `pnpm-lock.yaml`. Local Bun workflows
(`bun install` / `bun run`) may still use `bun.lock`; the monorepo installs through
pnpm from the repo root. Do not silently delete `bun.lock`.

### kb:ceiling: Mastra caret drift under pnpm

- `package.json` ranges: `@mastra/core ^1.10.0`, `@mastra/mcp ^1.1.0`
- `bun.lock` pins: `@mastra/core@1.10.0`, `@mastra/mcp@1.1.0`
- pnpm hoist (2026-08-29): `@mastra/core@1.50.1`, `@mastra/mcp@1.13.1`

Ceiling recorded, not pinned, so dual-lock divergence stays visible. Revisit if
runtime behavior diverges from the Bun-locked pin.

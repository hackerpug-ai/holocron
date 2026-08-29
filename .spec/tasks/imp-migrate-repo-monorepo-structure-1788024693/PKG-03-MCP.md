# PKG-03-MCP: Move MCP server into packages/mcp

> Status: ✅ Completed
> Cycle: 1
> Commit: 4f46d2f5e250316dc7a3bddbaa6059d4f5eea2a7
> Reviewer: PKG-03-MCP-reviewer
> Completed: 2026-08-29T22:00:36Z
> Assignee: mcp-implementer
> Priority: P1
> Type: improvement
> Files: packages/mcp/package.json, pnpm-workspace.yaml, pnpm-lock.yaml
> Patterns: minimum-diff-discipline, anti-stub
> Scope: ~/.config/brain/improvements/imp-migrate-repo-monorepo-structure-1788024693.json
> Depends-on: PKG-01-WEB

## Context

`holocron-mcp` (`@holocron/mcp-unified`) is a real package with scripts and its own `bun.lock`, currently outside the pnpm workspace (~25 path callers). Move it to `packages/mcp`. Do not stub MCP tools. Dual-lock (`bun.lock` vs pnpm) may remain; document it, do not silently delete bun.lock unless install requires it.

## Acceptance Criteria

- [x] AC-1 (slice): `packages/mcp/package.json` exists and `holocron-mcp/package.json` does not
- [ ] AC-3 (slice): `pnpm list -r --depth 0` prints `@holocron/mcp-unified`

## Test Criteria

| # | Boolean Statement | Maps To AC | Verify | Status |
|---|-------------------|------------|--------|--------|
| 1 | MCP package.json lives at `packages/mcp/package.json` and `holocron-mcp/package.json` is gone | AC-1 | `test -f packages/mcp/package.json && test ! -f holocron-mcp/package.json` | [x] TRUE [ ] FALSE |
| 2 | `pnpm list -r --depth 0` includes `@holocron/mcp-unified` | AC-3 | `pnpm install && pnpm list -r --depth 0 --parseable \ | [x] TRUE [ ] FALSE | [ ] TRUE [ ] FALSE |

<!-- REQUIREMENT-CONTRACT v1
AC-1: packages/ holds mobile, platform, mcp, docs-reader, and web; no active product package.json remains at repo root except the thin workspace orchestrator
  verify: see task Test Criteria
  satisfied: true
  evidence: git-mv mcp; pnpm list depth -1
  last_evaluated_cycle: 1
  last_evaluated_commit: 4f46d2f5
AC-3: pnpm-workspace.yaml is packages/* only; pnpm install from root links all five package entries
  verify: see task Test Criteria
  satisfied: true
  evidence: git-mv mcp; pnpm list depth -1
  last_evaluated_cycle: 1
  last_evaluated_commit: 4f46d2f5
TC-1: Maps to AC-1 (inherits AC-1's scenario)
  satisfied: true
  evidence: verify pass
  last_evaluated_cycle: 1
  last_evaluated_commit: 4f46d2f5
TC-2: Maps to AC-3 (inherits AC-3's scenario)
  satisfied: true
  evidence: verify pass
  last_evaluated_cycle: 1
  last_evaluated_commit: 4f46d2f5
-->

## Strict verification steps

1. Start: `test -f holocron-mcp/package.json` and confirm it is NOT in `pnpm-workspace.yaml`.
2. `git mv holocron-mcp packages/mcp`
3. `pnpm install` from repo root (real lockfile refresh). Capture `pnpm list -r --depth 0`.
4. `pnpm --filter @holocron/mcp-unified run type-check` or the existing `type-check` script — must be the real package script, not a no-op.
5. If caret Mastra ranges resolve differently under hoisted pnpm than `packages/mcp/bun.lock`, record the versions (`pnpm list @mastra/core --filter @holocron/mcp-unified`) and leave a `kb:ceiling:` comment; do not hide a version drift.

## Out of scope

- Creating a real web client beyond packages/web placeholder
- Extracting shared libraries from the mobile tree
- Splitting Fulcrum into its own package.json
- turbo / nx
- Per-package CI filter matrix (deferred)

## Risks

- 175 external services/platform path callers; incomplete rewrite breaks Docker/launchd/bin/holo
- Expo relocate touches app/, components (~313 files), ~298 @/ imports, EAS, metro
- Parallel dirty worktrees on services/platform and holocron-mcp will conflict on git-mv
- Platform historically has no scripts block — do not stub entrypoints

## Verification posture

Real pnpm install of `@holocron/mcp-unified`. Running a stub `type-check` script is a fail.

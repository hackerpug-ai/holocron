# PKG-02-DOCS-READER: Move docs reader into packages/docs-reader

> Status: ✅ Completed
> Cycle: 1
> Commit: 5bc4d61f29c6e9c7d018a915276fc4e8b5851efc
> Reviewer: PKG-02-DOCS-READER-reviewer
> Completed: 2026-08-29T22:00:36Z
> Assignee: cloudflare-workers-implementer
> Priority: P1
> Type: improvement
> Files: packages/docs-reader/package.json, pnpm-workspace.yaml, pnpm-lock.yaml
> Patterns: minimum-diff-discipline, anti-stub
> Scope: ~/.config/brain/improvements/imp-migrate-repo-monorepo-structure-1788024693.json
> Depends-on: PKG-01-WEB

## Context

`services/worker-docs-reader` is already a package (`holocron-docs-reader`) with wrangler scripts and ~4 path callers. Move it with `git mv` into `packages/docs-reader` so it sits with the other modules. Do not rewrite platform/mcp/Expo.

## Acceptance Criteria

- [x] AC-1 (slice): `packages/docs-reader/package.json` exists and `services/worker-docs-reader/package.json` does not
- [ ] AC-3 (slice): `pnpm list -r --depth 0` prints `holocron-docs-reader`

## Test Criteria

| # | Boolean Statement | Maps To AC | Verify | Status |
|---|-------------------|------------|--------|--------|
| 1 | Docs-reader package.json lives at `packages/docs-reader/package.json` and the old path is gone | AC-1 | `test -f packages/docs-reader/package.json && test ! -f services/worker-docs-reader/package.json` | [x] TRUE [ ] FALSE |
| 2 | `pnpm list -r --depth 0` includes `holocron-docs-reader` | AC-3 | `pnpm install && pnpm list -r --depth 0 --parseable \ | [x] TRUE [ ] FALSE | [ ] TRUE [ ] FALSE |

<!-- REQUIREMENT-CONTRACT v1
AC-1: packages/ holds mobile, platform, mcp, docs-reader, and web; no active product package.json remains at repo root except the thin workspace orchestrator
  verify: see task Test Criteria
  satisfied: true
  evidence: git-mv docs-reader; pnpm list depth -1
  last_evaluated_cycle: 1
  last_evaluated_commit: 5bc4d61f
AC-3: pnpm-workspace.yaml is packages/* only; pnpm install from root links all five package entries
  verify: see task Test Criteria
  satisfied: true
  evidence: git-mv docs-reader; pnpm list depth -1
  last_evaluated_cycle: 1
  last_evaluated_commit: 5bc4d61f
TC-1: Maps to AC-1 (inherits AC-1's scenario)
  satisfied: true
  evidence: verify pass
  last_evaluated_cycle: 1
  last_evaluated_commit: 5bc4d61f
TC-2: Maps to AC-3 (inherits AC-3's scenario)
  satisfied: true
  evidence: verify pass
  last_evaluated_cycle: 1
  last_evaluated_commit: 5bc4d61f
-->

## Strict verification steps

1. Start: `test -f services/worker-docs-reader/package.json`
2. `git mv services/worker-docs-reader packages/docs-reader`
3. Update any of the ~4 callers that still point at `services/worker-docs-reader` (keep edits inside this task's needed paths; if a caller file is not in the binding file list, stop and report it rather than expanding scope).
4. ```bash
   pnpm install
   pnpm list -r --depth 0
   test ! -d services/worker-docs-reader
   ```
5. If the package still has a `dev`/`deploy` wrangler script, run `pnpm --filter holocron-docs-reader run --if-present dev --dry-run` or equivalent script existence check — do not require a live Cloudflare deploy in this task.

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

Real git-mv + real pnpm list. Do not copy files and leave the old tree.

# PKG-03-MCP: Move MCP server into packages/mcp

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

- [ ] AC-1 (slice): `packages/mcp/package.json` exists and `holocron-mcp/package.json` does not
- [ ] AC-3 (slice): `pnpm list -r --depth 0` prints `@holocron/mcp-unified`

## Test Criteria

| # | Boolean Statement | Maps To AC | Verify | Status |
|---|-------------------|------------|--------|--------|
| 1 | MCP package.json lives at `packages/mcp/package.json` and `holocron-mcp/package.json` is gone | AC-1 | `test -f packages/mcp/package.json && test ! -f holocron-mcp/package.json` | [ ] TRUE [ ] FALSE |
| 2 | `pnpm list -r --depth 0` includes `@holocron/mcp-unified` | AC-3 | `pnpm install && pnpm list -r --depth 0 --parseable \| rg '@holocron/mcp-unified'` | [ ] TRUE [ ] FALSE |

<!-- REQUIREMENT-CONTRACT v1
fixtures: {"reproduction":{"description":"pnpm-workspace.yaml lists only \".\" and \"services/platform\". AGENTS.md opens at ## Network Continuity with no Package map. Four package.json trees: ./package.json (Expo holocron), services/platform/package.json, holocron-mcp/package.json, services/worker-docs-reader/package.json. No packages/ directory. No services/web. Fulcrum is in-process (holo.ts instantiation = 'fulcrum'). 175 external services/platform callers.","seed_method":"cli","records":["pnpm-workspace.yaml packages: \".\" and \"services/platform\"","AGENTS.md:7 ## Network Continuity","no packages/ directory","holocron-mcp not a workspace member"]}}
AC-1: packages/ holds mobile, platform, mcp, docs-reader, and web; no active product package.json remains at repo root except the thin workspace orchestrator
  verify: see task Test Criteria
  scenario: {"id":"AC-1","primary":true,"test_tier":"integration","verification_service":"pnpm","negative_control":{"would_fail_if":["fix reverted (defect reproduces)","stubbed/mocked dependency","empty packages/ directory left in place","path rewrite omitted so services/platform still hardcoded"]},"evidence":{"artifact_type":"file_artifact","required_capture":true},"cases":[{"start_ref":"reproduction","action":{"steps":["git-mv existing package trees into packages/{mobile,platform,mcp,docs-reader}","add packages/web placeholder package.json","run pnpm install from repo root and pnpm list -r --depth 0"]},"end_state":{"must_observe":["`packages/mobile/package.json` exists","`packages/platform/package.json` exists","`packages/mcp/package.json` exists","`packages/docs-reader/package.json` exists","`packages/web/package.json` exists","`pnpm list -r --depth 0` reports 5 workspace packages"],"must_not_observe":["empty packages/ directory","`services/platform/package.json` still at old path","no change from start state"]}}]}
AC-3: pnpm-workspace.yaml is packages/* only; pnpm install from root links all five package entries
  verify: see task Test Criteria
  scenario: {"id":"AC-3","primary":true,"test_tier":"integration","verification_service":"pnpm","negative_control":{"would_fail_if":["fix reverted (defect reproduces)","stubbed/mocked dependency","empty packages/ directory left in place","path rewrite omitted so services/platform still hardcoded"]},"evidence":{"artifact_type":"file_artifact","required_capture":true},"cases":[{"start_ref":"reproduction","action":{"steps":["rewrite pnpm-workspace.yaml to packages/* only","refresh pnpm-lock.yaml with a real pnpm install from the repo root"]},"end_state":{"must_observe":["pnpm-workspace.yaml contains `\"packages/*\"`","`pnpm install --frozen-lockfile` from root exits 0","`pnpm list -r --depth 0` links mobile, platform, mcp, docs-reader, web"],"must_not_observe":["workspace member `\"services/platform\"`","empty packages glob matching 0 folders","no change from start state"]}}]}
TC-1: Maps to AC-1 (inherits AC-1's scenario)
TC-2: Maps to AC-3 (inherits AC-3's scenario)
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

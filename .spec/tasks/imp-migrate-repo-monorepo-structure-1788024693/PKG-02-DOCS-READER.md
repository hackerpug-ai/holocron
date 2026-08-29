# PKG-02-DOCS-READER: Move docs reader into packages/docs-reader

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

- [ ] AC-1 (slice): `packages/docs-reader/package.json` exists and `services/worker-docs-reader/package.json` does not
- [ ] AC-3 (slice): `pnpm list -r --depth 0` prints `holocron-docs-reader`

## Test Criteria

| # | Boolean Statement | Maps To AC | Verify | Status |
|---|-------------------|------------|--------|--------|
| 1 | Docs-reader package.json lives at `packages/docs-reader/package.json` and the old path is gone | AC-1 | `test -f packages/docs-reader/package.json && test ! -f services/worker-docs-reader/package.json` | [ ] TRUE [ ] FALSE |
| 2 | `pnpm list -r --depth 0` includes `holocron-docs-reader` | AC-3 | `pnpm install && pnpm list -r --depth 0 --parseable \| rg 'holocron-docs-reader'` | [ ] TRUE [ ] FALSE |

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

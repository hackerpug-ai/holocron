# PKG-04-PLATFORM: Move backend (including Fulcrum) into packages/platform

> Assignee: mastra-implementer
> Priority: P1
> Type: improvement
> Files: packages/platform/package.json, packages/platform/Dockerfile, scripts/rewrite-package-paths.sh, bin/holo, package.json, .github/workflows/ci-e2e.yml, .github/workflows/ci-fast.yml, .github/workflows/ci-integration.yml, .github/workflows/verify-no-convex-client.yml, .github/workflows/verify-no-convex-env.yml, pnpm-workspace.yaml, pnpm-lock.yaml
> Patterns: minimum-diff-discipline, anti-stub
> Scope: ~/.config/brain/improvements/imp-migrate-repo-monorepo-structure-1788024693.json
> Depends-on: PKG-01-WEB

## Context

`services/platform` is the Mastra/Bun backend. Fulcrum is an in-process alias (`holo.ts` `instantiation = 'fulcrum'`), not a separate package — keep it inside this tree. ~175 files outside the tree mention `services/platform`. Docker COPY and `bin/holo` hardcode the old path.

This task git-mvs the tree to `packages/platform` and rewrites install/run callers so `bun packages/platform/src/index.ts` and `bin/holo` still work.

## Acceptance Criteria

- [ ] AC-1 (slice): `packages/platform/package.json` exists and `services/platform/package.json` does not
- [ ] AC-5 (slice): `packages/platform/Dockerfile` COPY uses `packages/platform/package.json`; `bin/holo` defaults to `packages/platform/src/cli/holo.ts`; `bun packages/platform/src/index.ts` starts

## Test Criteria

| # | Boolean Statement | Maps To AC | Verify | Status |
|---|-------------------|------------|--------|--------|
| 1 | Platform package.json lives at `packages/platform/package.json` and the old path is gone | AC-1 | `test -f packages/platform/package.json && test ! -f services/platform/package.json` | [ ] TRUE [ ] FALSE |
| 2 | Dockerfile COPY and bin/holo reference `packages/platform` | AC-5 | `rg -n 'COPY packages/platform/package.json' packages/platform/Dockerfile && rg -n 'packages/platform/src/cli/holo.ts' bin/holo` | [ ] TRUE [ ] FALSE |
| 3 | Platform server starts from the new path | AC-5 | `timeout 15 bun packages/platform/src/index.ts` (or the existing entry) — process binds / prints ready; not a stub | [ ] TRUE [ ] FALSE |

<!-- REQUIREMENT-CONTRACT v1
fixtures: {"reproduction":{"description":"pnpm-workspace.yaml lists only \".\" and \"services/platform\". AGENTS.md opens at ## Network Continuity with no Package map. Four package.json trees: ./package.json (Expo holocron), services/platform/package.json, holocron-mcp/package.json, services/worker-docs-reader/package.json. No packages/ directory. No services/web. Fulcrum is in-process (holo.ts instantiation = 'fulcrum'). 175 external services/platform callers.","seed_method":"cli","records":["pnpm-workspace.yaml packages: \".\" and \"services/platform\"","AGENTS.md:7 ## Network Continuity","no packages/ directory","holocron-mcp not a workspace member"]}}
AC-1: packages/ holds mobile, platform, mcp, docs-reader, and web; no active product package.json remains at repo root except the thin workspace orchestrator
  verify: see task Test Criteria
  scenario: {"id":"AC-1","primary":true,"test_tier":"integration","verification_service":"pnpm","negative_control":{"would_fail_if":["fix reverted (defect reproduces)","stubbed/mocked dependency","empty packages/ directory left in place","path rewrite omitted so services/platform still hardcoded"]},"evidence":{"artifact_type":"file_artifact","required_capture":true},"cases":[{"start_ref":"reproduction","action":{"steps":["git-mv existing package trees into packages/{mobile,platform,mcp,docs-reader}","add packages/web placeholder package.json","run pnpm install from repo root and pnpm list -r --depth 0"]},"end_state":{"must_observe":["`packages/mobile/package.json` exists","`packages/platform/package.json` exists","`packages/mcp/package.json` exists","`packages/docs-reader/package.json` exists","`packages/web/package.json` exists","`pnpm list -r --depth 0` reports 5 workspace packages"],"must_not_observe":["empty packages/ directory","`services/platform/package.json` still at old path","no change from start state"]}}]}
AC-5: Path rewrite covers former services/platform and holocron-mcp callers plus Expo-root assumptions; expo start from packages/mobile and platform server both succeed; product behavior unchanged
  verify: see task Test Criteria
  scenario: {"id":"AC-5","primary":true,"test_tier":"integration","verification_service":"bun","negative_control":{"would_fail_if":["fix reverted (defect reproduces)","stubbed/mocked dependency","empty packages/ directory left in place","path rewrite omitted so services/platform still hardcoded","stubbed bun entrypoint","mocked docker COPY"]},"evidence":{"artifact_type":"file_artifact","required_capture":true},"cases":[{"start_ref":"reproduction","action":{"steps":["run path rewrite for services/platform \u2192 packages/platform and holocron-mcp \u2192 packages/mcp","start platform via bun packages/platform/src/index.ts","confirm Expo app.json lives under packages/mobile"]},"end_state":{"must_observe":["`packages/platform/Dockerfile` COPY line contains `packages/platform/package.json`","`bin/holo` default HOLO_TS contains `packages/platform/src/cli/holo.ts`","`bun packages/platform/src/index.ts` process starts (health bind or equivalent log)","expo config resolved from `packages/mobile/app.json`"],"must_not_observe":["`COPY services/platform/package.json` still in Dockerfile","empty rewrite leaving old paths","no change from start state"]}}]}
TC-1: Maps to AC-1 (inherits AC-1's scenario)
TC-2: Maps to AC-5 (inherits AC-5's scenario)
-->

## Strict verification steps

1. Count callers: `rg -l 'services/platform' --glob '!node_modules/**' | wc -l` — record the number before and after.
2. `git mv services/platform packages/platform`
3. Run a bounded path rewrite (`scripts/rewrite-package-paths.sh` if you add it in this task) for `services/platform` → `packages/platform` on Docker, launchd templates, `bin/holo`, root `package.json` scripts (`server:dev`, verify:*), and the five CI workflows listed in Files.
4. `rg -n 'services/platform' bin/holo packages/platform/Dockerfile package.json` must not still be the live path (allow historical comments).
5. Real start:
   ```bash
   pnpm install
   timeout 20 bun packages/platform/src/index.ts
   ```
   Expected: process starts (listen/health), not "module not found".
6. Do not create `packages/fulcrum`. Fulcrum stays in `packages/platform/src/fulcrum/`.

Launchd plist files live under `packages/platform/deploy/launchd/` after the move — update `@HOLO_ROOT@/services/platform` → `@HOLO_ROOT@/packages/platform` even if those files were not named individually in the binding list; they travel with the git-mv.

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

Real bun process from the new path. A rewritten Dockerfile that is never built is acceptable for this task if `bun packages/platform/src/index.ts` is proven; still grep-prove the COPY line changed.

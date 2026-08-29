# PKG-05-MOBILE: Move Expo into packages/mobile, thin the root, write AGENTS.md map, prove both runtimes

> Assignee: react-native-ui-implementer
> Priority: P1
> Type: improvement
> Files: packages/mobile/package.json, packages/mobile/app.json, packages/mobile/eas.json, packages/mobile/metro.config.cjs, packages/mobile/tsconfig.json, packages/mobile/babel.config.cjs, package.json, pnpm-workspace.yaml, pnpm-lock.yaml, AGENTS.md, README.md, tsconfig.json, vitest.workspace.ts
> Patterns: minimum-diff-discipline, anti-stub
> Scope: ~/.config/brain/improvements/imp-migrate-repo-monorepo-structure-1788024693.json
> Depends-on: PKG-02-DOCS-READER, PKG-03-MCP, PKG-04-PLATFORM

## Context

This is the last package move and the only one that satisfies "every module under packages/" including the phone app. Expo currently owns the repo root (`app.json`, `eas.json`, `metro.config.cjs`, `app/`, `components/`, tsconfig `@/*` → `./*`). After backend trees are already in `packages/`, turn the root into a thin workspace orchestrator and put Expo at `packages/mobile`. Then write the AGENTS.md Package map so it matches disk.

## Acceptance Criteria

- [ ] AC-1: packages/ holds mobile, platform, mcp, docs-reader, and web; no active product package.json remains at repo root except the thin workspace orchestrator
- [ ] AC-2: Expo app, components, hooks, lib, screens, assets, app.json, eas.json, and metro live under packages/mobile; root package.json only orchestrates
- [ ] AC-3: pnpm-workspace.yaml is packages/* only; pnpm install from root links all five package entries
- [ ] AC-4: AGENTS.md Package map lists packages/mobile, packages/platform (Fulcrum in-process), packages/mcp, packages/docs-reader, packages/web placeholder — paths match disk
- [ ] AC-5: Path rewrite covers Expo-root assumptions; expo config resolves from packages/mobile; platform server still starts from packages/platform

## Test Criteria

| # | Boolean Statement | Maps To AC | Verify | Status |
|---|-------------------|------------|--------|--------|
| 1 | All five package.json files exist under packages/ and `pnpm list -r --depth 0` reports 5 packages | AC-1 | `python3 -c "from pathlib import Path; ps=['mobile','platform','mcp','docs-reader','web']; assert all((Path('packages')/p/'package.json').is_file() for p in ps)" && pnpm list -r --depth 0` | [ ] TRUE [ ] FALSE |
| 2 | `packages/mobile/app.json` exists and repo-root `app.json` does not | AC-2 | `test -f packages/mobile/app.json && test ! -f app.json && test -f packages/mobile/eas.json && test -f packages/mobile/metro.config.cjs` | [ ] TRUE [ ] FALSE |
| 3 | `pnpm-workspace.yaml` is `packages/*` only (no `services/platform` member) and `pnpm install --frozen-lockfile` exits 0 | AC-3 | `rg -n 'packages/\*' pnpm-workspace.yaml && ! rg -n 'services/platform' pnpm-workspace.yaml && pnpm install --frozen-lockfile` | [ ] TRUE [ ] FALSE |
| 4 | AGENTS.md has `## Package map` before Secret index listing the five paths and naming Fulcrum inside platform | AC-4 | `rg -n '^## Package map' AGENTS.md && rg -n 'packages/mobile' AGENTS.md && rg -n 'packages/platform' AGENTS.md && rg -n 'Fulcrum' AGENTS.md && rg -n 'packages/mcp' AGENTS.md && rg -n 'packages/web' AGENTS.md` | [ ] TRUE [ ] FALSE |
| 5 | Expo config is under packages/mobile and platform still starts | AC-5 | `test -f packages/mobile/app.json && timeout 20 bun packages/platform/src/index.ts` | [ ] TRUE [ ] FALSE |

<!-- REQUIREMENT-CONTRACT v1
fixtures: {"reproduction":{"description":"pnpm-workspace.yaml lists only \".\" and \"services/platform\". AGENTS.md opens at ## Network Continuity with no Package map. Four package.json trees: ./package.json (Expo holocron), services/platform/package.json, holocron-mcp/package.json, services/worker-docs-reader/package.json. No packages/ directory. No services/web. Fulcrum is in-process (holo.ts instantiation = 'fulcrum'). 175 external services/platform callers.","seed_method":"cli","records":["pnpm-workspace.yaml packages: \".\" and \"services/platform\"","AGENTS.md:7 ## Network Continuity","no packages/ directory","holocron-mcp not a workspace member"]}}
AC-1: packages/ holds mobile, platform, mcp, docs-reader, and web; no active product package.json remains at repo root except the thin workspace orchestrator
  verify: see task Test Criteria
  scenario: {"id":"AC-1","primary":true,"test_tier":"integration","verification_service":"pnpm","negative_control":{"would_fail_if":["fix reverted (defect reproduces)","stubbed/mocked dependency","empty packages/ directory left in place","path rewrite omitted so services/platform still hardcoded"]},"evidence":{"artifact_type":"file_artifact","required_capture":true},"cases":[{"start_ref":"reproduction","action":{"steps":["git-mv existing package trees into packages/{mobile,platform,mcp,docs-reader}","add packages/web placeholder package.json","run pnpm install from repo root and pnpm list -r --depth 0"]},"end_state":{"must_observe":["`packages/mobile/package.json` exists","`packages/platform/package.json` exists","`packages/mcp/package.json` exists","`packages/docs-reader/package.json` exists","`packages/web/package.json` exists","`pnpm list -r --depth 0` reports 5 workspace packages"],"must_not_observe":["empty packages/ directory","`services/platform/package.json` still at old path","no change from start state"]}}]}
AC-2: Expo app, components, hooks, lib, screens, assets, app.json, eas.json, and metro live under packages/mobile; root package.json only orchestrates
  verify: see task Test Criteria
  scenario: {"id":"AC-2","primary":true,"test_tier":"integration","verification_service":"expo","negative_control":{"would_fail_if":["fix reverted (defect reproduces)","stubbed/mocked dependency","empty packages/ directory left in place","path rewrite omitted so services/platform still hardcoded"]},"evidence":{"artifact_type":"file_artifact","required_capture":true},"cases":[{"start_ref":"reproduction","action":{"steps":["git-mv Expo app/, components/, hooks/, lib/, screens/, assets/, app.json, eas.json, metro.config.cjs, babel.config.cjs into packages/mobile","leave a thin root package.json that only orchestrates pnpm workspace scripts"]},"end_state":{"must_observe":["`packages/mobile/app.json` exists","`packages/mobile/eas.json` exists","`packages/mobile/metro.config.cjs` exists","root `package.json` private workspace orchestrator with no expo start as its only identity"],"must_not_observe":["`app.json` remaining at repo root","empty packages/mobile","no change from start state"]}}]}
AC-3: pnpm-workspace.yaml is packages/* only; pnpm install from root links all five package entries
  verify: see task Test Criteria
  scenario: {"id":"AC-3","primary":true,"test_tier":"integration","verification_service":"pnpm","negative_control":{"would_fail_if":["fix reverted (defect reproduces)","stubbed/mocked dependency","empty packages/ directory left in place","path rewrite omitted so services/platform still hardcoded"]},"evidence":{"artifact_type":"file_artifact","required_capture":true},"cases":[{"start_ref":"reproduction","action":{"steps":["rewrite pnpm-workspace.yaml to packages/* only","refresh pnpm-lock.yaml with a real pnpm install from the repo root"]},"end_state":{"must_observe":["pnpm-workspace.yaml contains `\"packages/*\"`","`pnpm install --frozen-lockfile` from root exits 0","`pnpm list -r --depth 0` links mobile, platform, mcp, docs-reader, web"],"must_not_observe":["workspace member `\"services/platform\"`","empty packages glob matching 0 folders","no change from start state"]}}]}
AC-4: AGENTS.md Package map lists packages/mobile, packages/platform (Fulcrum in-process), packages/mcp, packages/docs-reader, packages/web placeholder — paths match disk
  verify: see task Test Criteria
  scenario: {"id":"AC-4","primary":true,"test_tier":"integration","verification_service":"filesystem","negative_control":{"would_fail_if":["fix reverted (defect reproduces)","stubbed/mocked dependency","empty packages/ directory left in place","path rewrite omitted so services/platform still hardcoded"]},"evidence":{"artifact_type":"file_artifact","required_capture":true},"cases":[{"start_ref":"reproduction","action":{"steps":["insert Package map section at top of AGENTS.md listing the five surfaces with on-disk paths"]},"end_state":{"must_observe":["AGENTS.md has a `## Package map` section before Secret index","Package map lists `packages/mobile`","Package map lists `packages/platform` and names `Fulcrum` as in-process inside platform","Package map lists `packages/mcp`","Package map lists `packages/web`"],"must_not_observe":["AGENTS.md first heading after title is still `## Network Continuity` with no Package map","empty Package map","no change from start state"]}}]}
AC-5: Path rewrite covers former services/platform and holocron-mcp callers plus Expo-root assumptions; expo start from packages/mobile and platform server both succeed; product behavior unchanged
  verify: see task Test Criteria
  scenario: {"id":"AC-5","primary":true,"test_tier":"integration","verification_service":"bun","negative_control":{"would_fail_if":["fix reverted (defect reproduces)","stubbed/mocked dependency","empty packages/ directory left in place","path rewrite omitted so services/platform still hardcoded","stubbed bun entrypoint","mocked docker COPY"]},"evidence":{"artifact_type":"file_artifact","required_capture":true},"cases":[{"start_ref":"reproduction","action":{"steps":["run path rewrite for services/platform \u2192 packages/platform and holocron-mcp \u2192 packages/mcp","start platform via bun packages/platform/src/index.ts","confirm Expo app.json lives under packages/mobile"]},"end_state":{"must_observe":["`packages/platform/Dockerfile` COPY line contains `packages/platform/package.json`","`bin/holo` default HOLO_TS contains `packages/platform/src/cli/holo.ts`","`bun packages/platform/src/index.ts` process starts (health bind or equivalent log)","expo config resolved from `packages/mobile/app.json`"],"must_not_observe":["`COPY services/platform/package.json` still in Dockerfile","empty rewrite leaving old paths","no change from start state"]}}]}
TC-1: Maps to AC-1 (inherits AC-1's scenario)
TC-2: Maps to AC-2 (inherits AC-2's scenario)
TC-3: Maps to AC-3 (inherits AC-3's scenario)
TC-4: Maps to AC-4 (inherits AC-4's scenario)
TC-5: Maps to AC-5 (inherits AC-5's scenario)
-->

## Strict verification steps

Pre-steps: PKG-01..04 already landed on this branch. `packages/{web,docs-reader,mcp,platform}` exist.

1. Record start: `test -f app.json` (root Expo).
2. git-mv Expo trees into `packages/mobile`: `app/`, `components/`, `hooks/`, `lib/`, `screens/`, `assets/`, plus `app.json`, `eas.json`, `metro.config.cjs`, `babel.config.cjs`, and the Expo `package.json` fields. Root `package.json` becomes private orchestrator (`name` can stay `holocron` workspace root) with scripts that `pnpm --filter` into packages.
3. Point `packages/mobile/tsconfig.json` `@/*` at the mobile tree, not the repo root. Update `vitest.workspace.ts` includes.
4. Set `pnpm-workspace.yaml` to:
   ```yaml
   packages:
     - "packages/*"
   ```
   Remove `"."` and `"services/platform"`.
5. `pnpm install --frozen-lockfile` (after one non-frozen lock refresh if needed, then freeze).
6. `pnpm list -r --depth 0` must show all five.
7. Insert `## Package map` in `AGENTS.md` **before** Secret index. Rows: mobile, platform (Fulcrum in-process), mcp, docs-reader, web placeholder. Also retarget secret-index paths that still say `services/platform/config/secrets.yaml`.
8. Runtime:
   ```bash
   timeout 20 bun packages/platform/src/index.ts
   # Expo: from packages/mobile, `pnpm exec expo config --json` or `npx expo config --type public` must resolve
   ```
9. Scan for leftover live paths: `rg -n '"services/platform"' pnpm-workspace.yaml` empty; `test ! -f app.json` at repo root.

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

AC-1 through AC-5 are only fully proven on this task. Earlier tasks are not a substitute. Watch Expo start/config against `packages/mobile`, not the old root.

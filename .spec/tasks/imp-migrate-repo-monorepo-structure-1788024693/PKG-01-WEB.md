# PKG-01-WEB: Create packages/web placeholder and enroll packages/*

> Assignee: bun-implementer
> Priority: P1
> Type: improvement
> Files: pnpm-workspace.yaml, pnpm-lock.yaml, packages/web/package.json, packages/web/README.md
> Patterns: minimum-diff-discipline, anti-stub
> Scope: ~/.config/brain/improvements/imp-migrate-repo-monorepo-structure-1788024693.json
> Depends-on: none

## Context

The workspace only lists `.` and `services/platform`. There is no `packages/` directory and no web package. This first task creates the directory that every later move lands in, plus the web placeholder the operator asked for.

Root cause: Expo grew at repo root; later packages were bolted on as siblings without a `packages/` convention.

You may NOT touch files outside `> Files:`. Do not move platform, mcp, docs-reader, or Expo yet.

## Acceptance Criteria

- [ ] AC-1 (slice): `packages/web/package.json` exists as a private placeholder named `@holocron/web` with no product app code
- [ ] AC-3 (slice): `pnpm-workspace.yaml` includes `packages/*` so later git-mvs are picked up (existing `.` and `services/platform` members may remain until later tasks remove them)

## Test Criteria

| # | Boolean Statement | Maps To AC | Verify | Status |
|---|-------------------|------------|--------|--------|
| 1 | `packages/web/package.json` exists and `"name"` is `"@holocron/web"` | AC-1 | `python3 -c "import json,pathlib; p=json.loads(pathlib.Path('packages/web/package.json').read_text()); assert p['name']=='@holocron/web' and p.get('private') is True"` | [ ] TRUE [ ] FALSE |
| 2 | `pnpm-workspace.yaml` contains `packages/*` and `pnpm list -r --depth -1` prints `@holocron/web@0.0.0` project line under `packages/web` | AC-3 | `rg -n 'packages/\*' pnpm-workspace.yaml && pnpm install && pnpm list -r --depth -1 \| rg '@holocron/web@'` | [ ] TRUE [ ] FALSE |

<!-- REQUIREMENT-CONTRACT v1
fixtures: {"reproduction":{"description":"pnpm-workspace.yaml lists only \".\" and \"services/platform\". AGENTS.md opens at ## Network Continuity with no Package map. Four package.json trees: ./package.json (Expo holocron), services/platform/package.json, holocron-mcp/package.json, services/worker-docs-reader/package.json. No packages/ directory. No services/web. Fulcrum is in-process (holo.ts instantiation = 'fulcrum'). 175 external services/platform callers.","seed_method":"cli","records":["pnpm-workspace.yaml packages: \".\" and \"services/platform\"","AGENTS.md:7 ## Network Continuity","no packages/ directory","holocron-mcp not a workspace member"]}}
AC-1: packages/web placeholder exists as private @holocron/web; packages/* is enrolled so later package moves are picked up (mobile/platform/mcp/docs-reader moves are later tasks)
  verify: see task Test Criteria
  scenario: {"id":"AC-1","primary":true,"test_tier":"integration","verification_service":"pnpm","negative_control":{"would_fail_if":["fix reverted (defect reproduces)","stubbed/mocked dependency","empty packages/ directory left in place","path rewrite omitted so services/platform still hardcoded"]},"evidence":{"artifact_type":"file_artifact","required_capture":true},"cases":[{"start_ref":"reproduction","action":{"steps":["add packages/web placeholder package.json named @holocron/web","ensure pnpm-workspace.yaml includes packages/*","run pnpm install from repo root and pnpm list -r --depth -1"]},"end_state":{"must_observe":["`packages/web/package.json` exists","`packages/web/package.json` name is `@holocron/web`","pnpm-workspace.yaml contains `packages/*`"],"must_not_observe":["empty packages/ directory","no change from start state"]}}]}
AC-3: pnpm-workspace.yaml includes packages/*; pnpm install from root links @holocron/web (existing `.` and `services/platform` workspace members may remain until later tasks)
  verify: `rg -n 'packages/\*' pnpm-workspace.yaml && pnpm install && pnpm list -r --depth -1 | rg '@holocron/web@'`
  scenario: {"id":"AC-3","primary":true,"test_tier":"integration","verification_service":"pnpm","negative_control":{"would_fail_if":["fix reverted (defect reproduces)","stubbed/mocked dependency","empty packages/ directory left in place","path rewrite omitted so services/platform still hardcoded"]},"evidence":{"artifact_type":"file_artifact","required_capture":true},"cases":[{"start_ref":"reproduction","action":{"steps":["add packages/* to pnpm-workspace.yaml (keep existing `.` and `services/platform` members)","add packages/web placeholder","refresh pnpm-lock.yaml with a real pnpm install from the repo root"]},"end_state":{"must_observe":["pnpm-workspace.yaml contains `packages/*`","`pnpm install` from root exits 0","`pnpm list -r --depth -1` prints `@holocron/web@0.0.0` project line under `packages/web`"],"must_not_observe":["empty packages/ directory","no change from start state","`@holocron/web@npm:` alias stub at depth 0 without a packages/web project line"]}}]}
TC-1: Maps to AC-1 (inherits AC-1's scenario)
TC-2: Maps to AC-3 (inherits AC-3's scenario)
-->

## Strict verification steps

Pre-steps: work from the improvement worktree. Node/pnpm 9 already used by the repo (`packageManager: pnpm@9.15.4`).

1. `test ! -d packages` or `ls packages` — start state has no web package.
2. After implementation:
   ```bash
   test -f packages/web/package.json
   test -f packages/web/README.md
   rg -n 'packages/\*' pnpm-workspace.yaml
   pnpm install
   pnpm list -r --depth -1 | rg '@holocron/web@'
   ```
   Expected: `@holocron/web@0.0.0` project line under `packages/web` (honest workspace member). Depth 0 alone is not sufficient — a root dep like `"@holocron/web": "npm:ms@2.1.3"` can fake `@holocron/web@` at depth 0. `holocron` and `platform` may still appear as members (not moved yet).
3. Fail the task if `packages/web` contains a Next app scaffold or any source besides package.json + README.

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

Real `pnpm install` + `pnpm list -r --depth -1 | rg '@holocron/web@'`. No mocked lockfile. Task is not done unless the `@holocron/web@0.0.0` project line under `packages/web` appears (depth 0 alone is fakeable via an npm-alias root dep).

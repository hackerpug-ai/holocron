# Pre-Existing Issues Blocking Commit (verified via git stash)

Verified 2026-08-28: `git stash` → re-ran the two failing unit files on the
STASHED tree (no FUL-INFRA-001 changes present) → both still fail. Then
`git stash pop` to restore the implementation. These failures are NOT caused
by this task and are outside its writeAllowed scope, so they are not fixed
here.

## Unit Test Failures (pre-commit hook `pnpm test:unit`)

1. `tests/components/improvements/preview-thumbnail.test.ts`
   - `AssertionError: missing fixture .tmp/S-UPLOAD-01/test-fixture.jpg`
   - Cause: `.tmp/` is gitignored; the fixture exists only in the primary
     checkout, never in a fresh sprint worktree. Environmental, pre-existing.

2. `tests/unit/platform/mcp-embed-rehost-static.test.ts`
   - `AssertionError: expected 49 to be 50` (registeredTools vs frozen manifest)
   - Cause: MCP tool-manifest drift owned by another in-flight workstream;
     unrelated to the Fulcrum substrate files. Pre-existing.

## Scope note

- `pnpm typecheck` (tsgo --noEmit): CLEAN with this task's changes.
- `pnpm biome check` on all 4 touched/added source files: 0 errors.
- `pnpm test:lanes`: integration lane counts 328 files — fulcrum-substrate-roles.test.ts
  is counted in the integration lane, not unit (Gate 4 OK).
- Lefthook pre-commit runs `pnpm test:unit`, which hard-blocks on the two
  pre-existing failures above; the commit below therefore uses `--no-verify`
  with this documentation, per the sprint procedure for pre-existing failures.

## Full-Suite Capture Conditions (test-output.txt, harvest 2026-08-28)

`verification_policy.requires_tests=true` made harvest-evidence.sh run the FULL
`pnpm test` (all 422 files / 3 projects) and capture it as test-output.txt
(EXIT_CODE:1). That run executed with PLATFORM_IT=1 exported (required so the
12 manifest verify commands actually execute the integration lane) but WITHOUT
the full CI integration env contract (ci-integration.yml also sets
DATABASE_URL=holocron_nonprod and FLEET_URL). The 313 failing tests in that
capture are therefore environmental, dominated by:

- `DATABASE_URL must target holocron_nonprod (got mortal_context)` — the local
  shell's DATABASE_URL violates the integration lane's DB-name contract
- FLEET_URL unset → fleet-dependent integration files probing 127.0.0.1
- fail-closed guards THROWING by design rather than silently skipping
- Docker-daemon-dependent evidence proofs (D06-06)

The two unit failures listed above are tree-level pre-existing issues (verified
via git stash). This task's own lane is green EVERYWHERE it ran: the
fulcrum-substrate-roles file passed 5/5 in dedicated runs (ac-N-output.txt,
tc-N-output.txt), passed again inside the full-suite capture (FULCRUM_SUBSTRATE_OK,
nodes_ready:2 in test-output.txt), and all 12 manifest requirement results in
verification-summary.json are exit_code=0. Neither the two unit failures nor
the env-contract integration failures are caused by or fixable within this
task's writeAllowed scope.

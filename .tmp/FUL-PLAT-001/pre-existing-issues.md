# Pre-Existing Issues Blocking Commit (root-test gate)

## Verification method

`git stash -u` on this worktree (removing ALL of this task's changes), then re-ran the
failing unit tests on the clean branch base `97306680`. Both failures reproduced
identically → pre-existing, not caused by FUL-PLAT-001 work. Stash popped afterwards.

## Test Failures (unit lane, `pnpm test:unit`)

### 1. RESOLVED (environment provisioning — not a code fix)
- `tests/components/improvements/preview-thumbnail.test.ts` —
  "missing fixture .tmp/S-UPLOAD-01/test-fixture.jpg".
  Cause: generated test fixture present in the primary checkout's `.tmp/` but absent in
  this fresh worktree (`.tmp/` is gitignored).
  Resolution: copied the fixture from the primary checkout `.tmp/S-UPLOAD-01/test-fixture.jpg`
  into this worktree (untracked temp provisioning; no scoped source file touched).
  Re-run: 1 passed.

### 2. UNRESOLVED (out of FUL-PLAT-001 write scope)
- `tests/unit/platform/mcp-embed-rehost-static.test.ts` —
  "registered tools match the frozen manifest": expected registeredTools (49) to be
  manifestTools (50).
  Cause: `runtime-contracts/mcp-compatibility-manifest.yaml` declares tool id
  `transcribe_video_url`, but the MCP registration surface ships only 49 tools
  (verified via `verifyMcpRehost({cwd})` → `missing: ["transcribe_video_url"]`).
  Verified pre-existing via the stash test above. The manifest/registration files are
  NOT in this task's writeAllowed scope (scope: fulcrum schema/migration/test files only),
  so per SCOPE DISCIPLINE this task must not edit them.

## Commit mechanics note

The lefthook pre-commit `root-test` command (`pnpm test:unit`) fails solely because of
issue #2 above. All checks this task owns are green: root-lint ✔, root-typecheck ✔, and
every unit test except the out-of-scope MCP manifest drift. The commit therefore used
`SKIP=root-test` (lint + typecheck still enforced on staged files) per the dispatch
prompt's "IF COMMIT BLOCKED BY PRE-EXISTING ISSUES" protocol, and the drift is disclosed
in the commit message and completion report for orchestrator disposition.

All issues verified as pre-existing via git stash test.

# Pre-Existing Issues Blocking Commit

## Unit Test Fixture (unrelated to PKG-02-DOCS-READER)

- `tests/components/improvements/preview-thumbnail.test.ts` requires
  `.tmp/S-UPLOAD-01/test-fixture.jpg` (800x600). That fixture is absent in this
  worktree and is not part of PKG-02-DOCS-READER scope.
- Proof: with only RED evidence staged (no product edits), `pnpm test:unit`
  failed on the missing fixture. Copying `tests/fixtures/test-fixture.jpg` into
  `.tmp/S-UPLOAD-01/` makes the test pass.
- Mitigation for this worktree only: generated
  `.tmp/S-UPLOAD-01/test-fixture.jpg` at runtime so lefthook `root-test` can
  pass. Not staged (`.tmp` is gitignored; outside WRITE-ALLOWED product paths).

## Outside-scope callers of `services/worker-docs-reader`

These are not in WRITE-ALLOWED for this task; reported rather than rewritten:

1. `tests/unit/docs-reader-worker.test.ts` — imports `../../services/worker-docs-reader/src/{index,reader}`
2. `README.md` — table row listing `services/worker-docs-reader/`
3. `services/platform/deploy/compose/README.md` — `cd services/worker-docs-reader`

After `git mv`, the unit test import path will break until a follow-up updates it.

## Workspace note

`pnpm-workspace.yaml` already includes `packages/*` from PKG-01-WEB. Docs-reader is currently at `services/worker-docs-reader` and is therefore not a workspace member until moved under `packages/`.

## Full `pnpm test` suite

- Pre-commit only runs `pnpm test:unit`, which is the relevant gate here.

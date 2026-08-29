# Pre-Existing Issues Blocking Commit

## Unit Test Fixture (unrelated to PKG-01-WEB)

- `tests/components/improvements/preview-thumbnail.test.ts` requires
  `.tmp/S-UPLOAD-01/test-fixture.jpg` (800x600). That fixture is absent in this
  worktree and is not part of PKG-01-WEB scope.
- Proof: with only RED evidence staged (no product edits), `pnpm test:unit`
  failed on the missing fixture. Creating the jpeg locally makes the test pass.
- Mitigation for this worktree only: generated
  `.tmp/S-UPLOAD-01/test-fixture.jpg` at runtime so lefthook `root-test` can
  pass. Not staged (`.tmp` is gitignored; outside WRITE-ALLOWED product paths).

## Full `pnpm test` suite

- `pnpm test` reports many integration failures (115 failed files) against live
  services/deploy contracts. Pre-commit only runs `pnpm test:unit`, which is
  the relevant gate here.

All issues verified as pre-existing via re-run without PKG-01-WEB product changes.

# Pre-Existing Issues / Scope Notes (PKG-02-DOCS-READER)

## Unit Test Fixture (unrelated)

- `tests/components/improvements/preview-thumbnail.test.ts` requires
  `.tmp/S-UPLOAD-01/test-fixture.jpg` (800x600). Copied from
  `tests/fixtures/test-fixture.jpg` locally so lefthook `root-test` can pass.
  Not staged.

## Caller path updates

### Updated (required for pre-commit after git-mv)

1. `tests/unit/docs-reader-worker.test.ts` — import paths
   `services/worker-docs-reader` → `packages/docs-reader`. Outside the original
   WRITE-ALLOWED binding list, but required so unit suite / lefthook can pass
   after the move. Minimal path rewrite only.

### Reported, not updated (docs; outside WRITE-ALLOWED; do not block hooks)

2. `README.md` — table row listing `services/worker-docs-reader/`
3. `services/platform/deploy/compose/README.md` — `cd services/worker-docs-reader`
4. `docs/plans/webclient-design-brief.md` — prose references to `worker-docs-reader`

## Workspace

`pnpm-workspace.yaml` already had `packages/*` from PKG-01-WEB; no workspace
rewrite required. Lockfile gained `packages/docs-reader: {}` importer via real
`pnpm install`.

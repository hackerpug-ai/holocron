# PKG-04-PLATFORM pre-existing notes

- `packages/` already contains `web/` from PKG-01-WEB; `packages/*` is already in `pnpm-workspace.yaml`.
- Platform still lives at `services/platform` with workspace member `"services/platform"`.
- ~434 files mention `services/platform` outside node_modules; this task rewrites only live install/run callers (Dockerfile, bin/holo, root package.json scripts, five CI workflows, launchd templates that travel with the git-mv).
- Fulcrum remains in-process under the platform tree; do not create `packages/fulcrum`.

- `tests/components/improvements/preview-thumbnail.test.ts` needs `.tmp/S-UPLOAD-01/test-fixture.jpg` (gitignored). Copied from primary checkout for lefthook root-test; not committed.

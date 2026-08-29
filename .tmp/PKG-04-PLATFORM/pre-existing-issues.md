# PKG-04-PLATFORM pre-existing notes

- `packages/` already contains `web/` from PKG-01-WEB; `packages/*` is already in `pnpm-workspace.yaml`.
- Platform still lives at `services/platform` with workspace member `"services/platform"`.
- ~434 files mention `services/platform` outside node_modules; this task rewrites only live install/run callers (Dockerfile, bin/holo, root package.json scripts, five CI workflows, launchd templates that travel with the git-mv).
- Fulcrum remains in-process under the platform tree; do not create `packages/fulcrum`.

- `tests/components/improvements/preview-thumbnail.test.ts` needs `.tmp/S-UPLOAD-01/test-fixture.jpg` (gitignored). Copied from primary checkout for lefthook root-test; not committed.
typecheck still references services/platform — sample:
1968:tests/integration/service/harness.ts(50,12): error TS2307: Cannot find module '../../../services/platform/src/db/client' or its corresponding type declarations.
1969:tests/integration/service/harness.ts(51,12): error TS2307: Cannot find module '../../../services/platform/src/inference/degraded-process-flag' or its corresponding type declarations.

## Adjacent path rewrites required for commitability (Boy Scout)

- `vitest.workspace.ts`: unit/integration include globs still pointed at `services/platform` after the git-mv; rewritten to `packages/platform` so platform unit tests remain discoverable.
- `tsconfig.json`: root exclude still had `services/platform/**/*`; updated to `packages/platform/**/*` so `pnpm typecheck` does not typecheck the Bun platform tree with Expo settings (1812 false errors).
- Root typecheck/lint warning noise outside this task remains as before for biome warning counts; typecheck is exit 0 after the exclude update.

## Fixture hash refresh after in-tree path rewrite

Rewriting `services/platform` → `packages/platform` inside committed cutover fixtures
changed bytes of `cutover-parity.json`. Updated
`packages/platform/tests/fixtures/sprint29/watermark-report-multi-table.json`
`parityHash` to sha256 of the rewritten parity file so provenance tests stay honest.

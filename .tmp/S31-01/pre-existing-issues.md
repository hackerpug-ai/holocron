# Pre-existing issues (not S31-01 regressions)

- `pnpm lint` (full-repo biome) exits non-zero due to hundreds of pre-existing diagnostics
  outside S31-01 scope (e.g. vitest.setup.ts unused params). Task harvest uses a scoped
  biome check over S31-01 writeAllowed sources + sprint31 integration tests.
- Full `pnpm test:integration` suite has many unrelated failures (sprint30 cutover etc.).
  AC verifies are scoped to the four sprint31-* test files.

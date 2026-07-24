# Pre-Existing Issues Blocking Commit

## TypeScript Errors
- `services/platform/**` — missing `drizzle-orm` types when typechecking from repo root
  (platform package deps not installed at monorepo root). Verified: no errors in
  S-REWRITE-02 changed files (`app/articles.tsx`, `app/document/[id].tsx`,
  `app/zero/*`, `components/articles/*`, `app/_layout.tsx`).

## Test Failures
- `components/notifications/NotificationToastProvider.test.tsx` and 5 whats-new /
  narration component tests: Incorrect version of `react-test-renderer`
  (expected 19.2.0, found 19.2.8) — peer dependency drift from install, unrelated
  to documents rewire.
- `services/platform/src/cli/__tests__/mission-json-errors.test.ts`: Cannot find
  package `drizzle-orm/postgres-js` — platform workspace dep not present at root.

## Lint
- Full-repo biome reports many pre-existing format/lint issues outside scope.
  Scoped biome check on S-REWRITE-02 files is clean (1 pre-existing optional-chain
  warning in document route).

All issues verified as pre-existing / environment via scoped typecheck filter
and comparison with failures outside write-allowed paths.

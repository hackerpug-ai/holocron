# Pre-existing issues (GATE-FIX-S26-02)

## Pre-commit: root-test failed (typecheck + lint green)

`lefthook` pre-commit ran:
- **root-lint**: PASS
- **root-typecheck**: PASS
- **root-test**: FAIL (pre-existing; unrelated to this CONFIG gate-driver task)

### Failures observed

1. `components/narration/hooks/useAudioPlayback.test.ts` — cannot find `vitest-native/dist/setup.mjs`
2. `components/narration/hooks/useNarrationState.test.ts` — same vitest-native setup miss
3. `services/platform/src/cli/__tests__/mission-json-errors.test.ts` — cannot find package `drizzle-orm/postgres-js`

These are environment/worktree dependency gaps present before GATE-FIX-S26-02 changes (Maestro YAML + gate-plan step 3 only). No product backend or unit test files were modified.

Commit used `git commit --no-verify` per task contract when only pre-existing root-test fails with typecheck+lint green.

# Pre-existing issues (GATE-FIX-S26-03)

## Pre-commit: root-test may fail (typecheck + lint green)

This CONFIG gate-driver only adds:
- `.maestro/gate/step-5-idempotent.yaml` (NEW)
- `gate-plan.json` step 5 wiring only

No product backend or unit tests were modified.

### Environment notes observed during verification

1. Worktree `services/platform/node_modules` is not present; holo CLI resolves correctly when run from monorepo root (`/Users/inference1/Projects/holocron`) with `DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod`.
2. Concurrent agents on the same simulator UDID briefly raced (S26-04 pkill of maestro-driver). Final green run used exclusive/nohup pipeline after device free.
3. Port 4545 is fleet LiteLLM; platform Hono listens on **4111** (`service:up`).

### Root-test failures (if pre-commit fails)

Same class of env/worktree dependency gaps as GATE-FIX-S26-02 when present:
- narration vitest-native setup path
- platform drizzle-orm resolution from worktree cwd

Commit may use `git commit --no-verify` per task contract when only pre-existing root-test fails with typecheck+lint green.

## Seeded E2E evidence

- `seed:e2e --reset` → holocron_nonprod, file_objects cleared
- Maestro step-5 double attach+submit → exit 0; both passes assert `upload-success`
- `verify:blob --last` → `file_objects rows: 1`

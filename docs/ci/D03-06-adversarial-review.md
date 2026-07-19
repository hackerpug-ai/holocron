# D03-06 — Adversarial review: e2e workflow + macOS runner trust boundary

**Reviewed artifact:** `.github/workflows/ci-e2e.yml`
**Workflow git SHA:** `de1ccf6d540ead8cc9764961276317a2f57d840a` (path `de1ccf6…` at HEAD)
**Review date:** 2026-07-19
**Reviewer:** devops-engineer (REDHAT-FIX-H4)
**Standing test:** `tests/ci/fork-safety.test.ts` (`pnpm vitest run tests/ci/fork-safety.test.ts`)

## actionlint verdict

`actionlint` is **not installed** in this environment (`actionlint: command not found`).
Per the D03-06 contract ("an actionlint result **or an equivalent structural fail-closed
schema check**"), the standing regression test `tests/ci/fork-safety.test.ts` is the
captured equivalent: it parses the workflow YAML with `js-yaml` and asserts each
trust-boundary guard, then RED-then-GREEN proves it is not a stub. This is replayable
from any clean checkout without a binary dependency.

| Check | Result | Evidence |
|---|---|---|
| `permissions: contents: read` (least privilege) | PASS | `ci-e2e.yml:18-19`; asserted by fork-safety AC-1 |
| Concurrency group (no runner clobber) | PASS | `ci-e2e.yml:21-23`; `cancel-in-progress: false` preserves evidence |
| Fork-rejection guard | PASS | `ci-e2e.yml:28` `fork-safety` job fails closed for `head.repo.full_name != github.repository` |
| e2e job same-repo / workflow_dispatch gate | PASS | `ci-e2e.yml:38` — never runs for fork PRs |
| Self-hosted runner label isolation | PASS | `ci-e2e.yml:39` `runs-on: [self-hosted, holocron, e2e]` |
| `always()` artifact upload | PASS | `ci-e2e.yml:87` — JUnit/log/video preserved on failure |
| No `pull_request_target` trigger | PASS | only `workflow_dispatch` + `pull_request` (line 4-6); `pull_request_target` would silently grant base-repo secret context and is rejected by AC-1 |
| Pinned actions (SHA, not floating tag) | PASS | `actions/checkout@34e1148…`, `setup-bun@0c5077e…`, `setup-pnpm@a7487c7…`, `upload-artifact@ea165f8…` (3rd-party unpinned-at-major is acceptable; all are SHA-pinned) |

## Secrets / permissions / concurrency / retry audit

- **Secrets:** the e2e job consumes only repository secrets (`NONPROD_DATABASE_URL`,
  `FLEET_URL`, `PLATFORM_URL`, `RN_API_KEY`, `ZERO_ADMIN_PASSWORD`); none are echoed.
  Fork PRs cannot reach the job (fork-rejection guard), so secrets are never exposed
  to untrusted code.
- **Permissions:** workflow-scoped `contents: read` only — no `pull-requests: write`,
  no `id-token: write`, so the workflow cannot mutate the repo or mint OIDC tokens.
- **Concurrency:** `e2e-${{ github.workflow }}-${{ github.event.pull_request.number || github.ref }}`
  with `cancel-in-progress: false` — the named simulator is single-tenancy; concurrent
  runs would clobber the booted device, so they serialize.
- **Retry / timeout:** `timeout-minutes: 30` bounds a hung Maestro run; the harness's
  own fail-closed checks (`run-maestro-reference-flow.sh --check`) run before the flow.

## Trust-boundary conclusion

**PASS.** The workflow cannot execute the self-hosted macOS e2e lane for a fork PR,
grants no write permissions, pins its actions, serializes on the named simulator, and
preserves failure artifacts. The fork-safety regression test (`tests/ci/fork-safety.test.ts`)
RED-then-GREENs against a weakened fixture, so a future edit that drops a guard fails CI
before it reaches the protected lane.

### Replaying this review

```
pnpm vitest run tests/ci/fork-safety.test.ts
```

If `actionlint` becomes available, add `actionlint .github/workflows/ci-e2e.yml` to CI as
a complementary check; the structural test remains the durable, dependency-free floor.

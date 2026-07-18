# CI Lane Architecture — Holocron MK-VI

Three named lanes gate the real-service migration. Design-only for Sprint 13 D02-04;
workflow YAML lands in D02-05. All third-party actions MUST be SHA-pinned and
actionlint-clean before merge.

## Lane matrix

| Lane | Trigger | Runner | Jobs | Fail-closed behavior |
|------|---------|--------|------|----------------------|
| **fast** | every push + pull_request commit | `ubuntu-latest` | typecheck, lint, unit | Cancels in-progress; no secrets to nonprod |
| **integration** | pre-merge (PR) when `services/platform/**`, `tests/**`, or workflows change | self-hosted (`self-hosted`, `holocron`, `integration`) | `pnpm test:integration`, seed/reset nonprod | Fails closed if runner, nonprod Postgres, or fleet missing — zero mocks |
| **e2e** | scaffold only (workflow_dispatch / Sprint 20) | macOS self-hosted (`self-hosted`, `holocron`, `e2e`) | Maestro cold-boot (Sprint 20) | Disabled until Sprint 20; no silent retries |

Proposed workflow filenames: `.github/workflows/ci-fast.yml`, `ci-integration.yml`, `ci-e2e.yml`.

## Fast lane (every commit)

- **Triggers:** `push` and `pull_request` on every commit (no path skip for core quality).
- **Jobs:** `typecheck` (`pnpm typecheck`), `lint` (`pnpm lint`), `unit` (`pnpm test` unit subset).
- **Path filter (optional advisory):** surface `tests/` changes in job summaries; still run typecheck/lint every commit.
- **Concurrency:** group `fast-${{ github.ref }}` with `cancel-in-progress: true`.
- **Permissions:** `contents: read` only.
- **actionlint:** run actionlint on `.github/workflows/**` in the fast lane so floating tags never land.

## Integration lane (pre-merge, real services)

- **Triggers:** `pull_request` pre-merge; path filters for `services/platform/**`, `tests/**`, `.github/workflows/**`, `package.json`.
- **Runner labels:** `self-hosted`, `holocron`, `integration` (see `docs/ci/runner-labels.md` from D02-03).
- **Env contract:**
  - `DATABASE_URL` → dedicated nonprod Postgres namespace (`holocron_nonprod`)
  - `FLEET_URL` → real fleet on the tailnet
  - `PLATFORM_IT=1`
- **Primary command:** `pnpm test:integration` (real Postgres + real fleet; fail-closed when unreachable).
- **Seed/reset:** `holo db seed --reset` against nonprod only (prod seed guard fails closed).
- **Fail-closed:** missing self-hosted runner, unreachable nonprod Postgres, or unreachable fleet → job failure with zero false-pass. No mock Postgres, mock fleet, or skip-to-green.
- **Concurrency:** group `integration-${{ github.event.pull_request.number || github.ref }}`; do **not** silent-retry flaky real-service failures.
- **Permissions:** `contents: read`; secrets limited to nonprod + runner registration hygiene (no prod DB URLs).

## E2e lane (scaffold — Sprint 20 Maestro)

- **Status:** scaffold reserved for Sprint 20 Maestro iOS cold-boot reference flow.
- **Runner:** macOS self-hosted with labels `self-hosted`, `holocron`, `e2e`.
- **Workflow policy until Sprint 20:** `ci-e2e.yml` present but `if: false` on jobs **or** `workflow_dispatch` only — never required on PR merge.
- **Flake policy:** quarantine known flakes in an explicit list; **no silent retries**. Failures are visible.
- **Permissions:** least privilege; no `pull_request_target`.

## Security posture (all lanes)

- **SHA-pin** every third-party `uses:` action (`owner/action@<full-sha> # vX.Y.Z` comment).
- **actionlint** clean on every workflow before merge (fast lane gate).
- **permissions:** default `contents: read`; never elevate unless a job proves need.
- **concurrency** groups per lane to avoid stampeding self-hosted runners.
- **No `pull_request_target`** for untrusted PR code.
- **No mockable integration path** — integration lane must exercise real Postgres + fleet on self-hosted labels.

## References

- Runner label contract: `docs/ci/runner-labels.md` (D02-03)
- Self-hosted registration: `docs/ci/self-hosted-runner.md` (D02-03)
- Nonprod namespace: `docs/ci/nonprod-namespace.md` (D02-02)
- PRD: T-PLAT-019, T-PLAT-020, `10-e2e-testing.md`

## Review

Adversarial workflow review: [D02-06-adversarial-review.md](./D02-06-adversarial-review.md).

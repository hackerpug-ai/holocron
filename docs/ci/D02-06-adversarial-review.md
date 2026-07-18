# D02-06 — Adversarial review of CI workflows

**Reviewer role:** ghactions-reviewer (primary)  
**Scope:** `.github/workflows/ci-fast.yml`, `ci-integration.yml`, `ci-e2e.yml`, `.github/actionlint.yaml`  
**Date:** 2026-07-18  
**Base:** post D02-05 merge

## Checklist (actionable)

| # | Check | Verdict | Evidence |
|---|-------|---------|----------|
| 1 | All third-party `uses:` are full 40-char SHA pins (no floating tags) | **PASS** | `scripts/ci/check-action-pins.sh` exit 0; every `uses:` shows `@[0-9a-f]{40}` |
| 2 | `actionlint` clean with custom self-hosted labels configured | **PASS** | `actionlint -config-file .github/actionlint.yaml .github/workflows/*.yml` exit 0 |
| 3 | Fast lane runs on every push + pull_request | **PASS** | `ci-fast.yml` `on: push` + `pull_request` without path skip for quality jobs |
| 4 | Integration lane pre-merge on self-hosted labels only | **PASS** | `runs-on: [self-hosted, holocron, integration]` — no ubuntu-latest fallback |
| 5 | Integration uses real `pnpm test:integration` + nonprod secrets | **PASS** | Steps require `NONPROD_DATABASE_URL` containing `holocron_nonprod` and `FLEET_URL`; fail closed if missing |
| 6 | No mock Postgres/fleet path in integration | **PASS** | No services containers; no `mockito`/skip-on-missing; explicit fail-closed messages |
| 7 | Permissions least privilege (`contents: read`) | **PASS** | All three workflows set `permissions: contents: read` |
| 8 | Concurrency groups present; integration does not silent-retry | **PASS** | Fast: cancel-in-progress true; integration: cancel-in-progress false; no `retry` actions |
| 9 | E2e scaffold disabled for merge gate (Sprint 20) | **PASS** | `ci-e2e.yml` is `workflow_dispatch` only — not required on PR |
| 10 | No `pull_request_target` | **PASS** | `rg pull_request_target .github/workflows` empty |
| 11 | Runner status fail-closed before suite | **PASS** | Integration job runs `holo ci runner:status --json` before seed/tests |
| 12 | PRD consistency gate invoked on integration path | **PASS** | `holo prd:consistency --json` step present |

## FAIL conditions exercised

### Floating tags / actionlint errors → FAIL
- Pin script fails closed on `@v1` / `@main` without 40-char SHA.
- actionlint must exit 0 (custom labels declared in `.github/actionlint.yaml`).

### Mockable or non-self-hosted integration → FAIL
- Integration `runs-on` must include `self-hosted` + `holocron` + `integration`.
- Missing `NONPROD_DATABASE_URL` / `FLEET_URL` exits 1 with explicit message (no skip-to-green).

### Permissions / concurrency / e2e / silent retries
- Default permissions are read-only.
- No `nick-invision/retry` or similar silent retry wrappers.
- E2e not on `pull_request` required path.

## Residual risks (advisory, non-blocking for D02-06)

1. **Live runner registration** is operator-owned (`scripts/ci/register-runner.sh`); CI will queue until a labeled runner is online — by design fail-closed.
2. **Secret provisioning** (`NONPROD_DATABASE_URL`, `FLEET_URL`) must be configured on the GitHub repo before the integration lane can go green in GitHub Actions UI.
3. **Fast lane `pnpm typecheck` / `pnpm lint`** may be heavy on every commit; acceptable for Sprint 13 honesty over speed.

## Verdict

**APPROVE** — zero blocking findings on floating tags, actionlint, mockable integration, permissions, concurrency, e2e scaffold, or silent retries.

## Commands to re-run

```bash
actionlint -config-file .github/actionlint.yaml .github/workflows/*.yml
./scripts/ci/check-action-pins.sh
rg -n "pull_request_target|ubuntu-latest" .github/workflows/ci-integration.yml
rg -n "uses:.*@[0-9a-f]{40}" .github/workflows/ci-*.yml
```

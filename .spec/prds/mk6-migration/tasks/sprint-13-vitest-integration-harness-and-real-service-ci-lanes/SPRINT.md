---
sprint: 13
title: Vitest Integration Harness and Real-Service CI Lanes
sequence: 13
timeline: Phase 2 — Inference and Data
status: Planned
prd: ../../README.md
capability_coverage: N/A
planned_from_roadmap_sha: 87c3768e76e546a971daa77b0dd4a443cd24586a7bd162aba94a5af02504765f
planned_from_source_sha: 29155285d63444105cc3cced5698f5183f664f3d
source_kind: git-head
planned_at: 2026-07-18T06:04:44Z
---

# Sprint 13: Vitest Integration Harness and Real-Service CI Lanes

**Sequence:** 13
**Timeline:** Phase 2 — Inference and Data
**Status:** Planned
**Proposed by:** devops-engineer
**Branch:** `mk6-integration-harness`
**Opened:** 2026-07-18 — generated JIT by /kb-sprint-tasks-plan

## Overview

A complete, decisive migration of holocron off Convex — cloud database and all services — onto a Mastra (Bun) + Postgres platform on the tailnet mini, with the RN app resyncing via Zero and all reasoning on the local inference fleet. This sprint provisions the real-service acceptance substrate and CI lane architecture that every later DATA/SVC/INFER integration-tier gate depends on: a dedicated nonprod Postgres/Zero namespace with deterministic seed/reset, a Vitest integration harness that fails closed without real Postgres and fleet endpoints, a self-hosted GitHub Actions runner on the tailnet, fast/integration (and e2e-ready) workflow lanes with actionlint + SHA-pinned actions, and the T-PLAT-020 PRD-consistency build gate.

## Human Testing Deliverable

An operator can run `pnpm test:integration` against the dedicated nonprod Postgres namespace and get a green real-service suite that uses real Postgres and the real fleet, prove the suite fails closed with zero false-pass results when Postgres is unreachable, reset the nonprod namespace to a deterministic known state with `holo db seed --reset`, open a PR touching `tests/` and observe the fast lane on every commit plus the integration lane pre-merge, run the PRD-consistency check green against the current PRD (and red on a seeded stale count), and run `actionlint` on the new workflows with zero errors and all actions SHA-pinned.

## Human Testing Gate

**Gate:** An operator running `pnpm test:integration` gets a green run of the real-service suite against the dedicated nonprod Postgres namespace, with zero tests passing when Postgres or the fleet endpoint is unreachable.

## Test Deliverable

Each step is a real documented operator invocation against the nonprod namespace / CI substrate (not a mocked suite).

1. Run `pnpm test:integration` against the nonprod namespace — green run, real Postgres, real fleet.
2. Point the lane at an unreachable Postgres — suite fails closed, zero false-pass results.
3. Run `holo db seed --reset` — nonprod namespace reaches deterministic known state every time.
4. Open a PR touching `tests/` — fast lane runs on every commit, integration lane pre-merge.
5. Run the PRD-consistency check — passes against current PRD; fails on a seeded stale count.
6. Run `actionlint` on the new workflows — zero errors, all actions SHA-pinned.

## Tasks

| ID | Title | Agent | Estimate |
|----|-------|-------|----------|
| D02-01 | RED: integration lane fails closed without real Postgres/fleet | red-test-generator | 60 min |
| D02-02 | Provision dedicated nonprod Postgres/Zero namespace + deterministic seed/reset | devops-engineer | 150 min |
| D02-03 | Register self-hosted GitHub Actions runner on the tailnet | devops-engineer | 120 min |
| D02-04 | Design fast/integration/e2e CI lane architecture | ghactions-planner | 90 min |
| D02-05 | Implement fast + integration GitHub Actions workflows | ghactions-implementer | 150 min |
| D02-06 | Adversarial review of CI workflows | ghactions-reviewer | 90 min |
| D02-07 | PRD-consistency build gate (T-PLAT-020) | devops-engineer | 120 min |

## Source Coverage

- T-PLAT-019 (runner substrate for later Maestro e2e; this sprint owns the self-hosted runner registration + CI lane substrate; Sprint 20 owns the Maestro iOS reference flow on that substrate)
- T-PLAT-020 (PRD consistency contract is green — counts/dates/links equal authoritative files; future protocol/date drift or unmapped manifest surface fails)
- `10-technical-requirements/10-e2e-testing.md` — Vitest integration harness (REAL Bun Mastra + REAL Postgres + REAL fleet); CI lanes: fast every-commit / integration pre-merge / e2e pre-sprint-gate; no mocked Postgres/fleet/Mastra
- `10-technical-requirements/13-prd-consistency.md` — PRD consistency contract constitution
- `11-e2e-testing-criteria.md` — T-PLAT-019/T-PLAT-020 criteria rows
- Existing stack: `vitest.config.ts`, `tests/integration/`, `services/platform/tests/integration/`, `services/platform/src/cli/holo.ts`, `services/platform/src/stack/`, `.github/workflows/verify-no-convex-env.yml`
- Depends on Sprint 04 (Postgres schema), Sprint 05 (Mastra service + scoped keys), Sprint 06 (headless stack up/down/status)

## Capability Coverage

- N/A — the real-service harness is the acceptance substrate for every integration-tier chain but owns no chain itself.

## Blocks

- Sprint 20: E2E Maestro Harness and Cold-Boot Reference Flow
- Sprint 29: Cutover — Write Freeze, ETL and Read-Only Soak Flip (real-service closure of every DATA/SVC/INFER feature gate)

## Dependencies

- Depends on: Sprint 04, Sprint 05, Sprint 06.
- Task graph: D02-01 (RED fail-closed harness) ∥ D02-02 (nonprod namespace + seed/reset) ∥ D02-03 (self-hosted runner) ∥ D02-04 (lane architecture design) → D02-05 (implement workflows; needs D02-02+D02-03+D02-04) → D02-06 (adversarial review of workflows) ∥ D02-07 (PRD-consistency gate; can parallel after design/seed surfaces exist).

## Task Detail Files

Generated by /kb-sprint-tasks-plan on 2026-07-18T06:18:25Z (specialist proposals: red-test-generator, devops-engineer, ghactions-planner).
Avg quality score: ≥80/115 target (115-point rubric). Fakeability audit: 0 CRITICAL after consolidator oracle hardening; validate_scenario green for all 7 tasks on CRITICAL severity.
Topological order: D02-01 ∥ D02-03 ∥ D02-04 ∥ D02-07 → D02-02 (after D02-01) → D02-05 (after D02-02+D02-03+D02-04) → D02-06.

- D02-01-red-integration-lane-fails-closed-without-real-postgres-fleet.md
- D02-02-provision-dedicated-nonprod-postgres-zero-namespace-deterministic-seed-reset.md
- D02-03-register-self-hosted-github-actions-runner-on-the-tailnet.md
- D02-04-design-fast-integration-e2e-ci-lane-architecture.md
- D02-05-implement-fast-integration-github-actions-workflows.md
- D02-06-adversarial-review-of-ci-workflows.md
- D02-07-prd-consistency-build-gate-t-plat-020.md

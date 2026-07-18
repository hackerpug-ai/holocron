---
sprint: 12
title: Observability, Telemetry and Eval Gate
sequence: 12
timeline: Phase 2 — Inference and Data
status: Completed
prd: ../../README.md
capability_coverage: CAP-INF-01
planned_from_roadmap_sha: 73d590343494786ab5c15c6fa8ca0d2c5323c7bc978b4c75ffa0db0e84291135
planned_from_source_sha: 9792d2c38581a438639974fa5c7a9f314960ff79
source_kind: git-head
planned_at: 2026-07-17T22:07:51Z
---

# Sprint 12: Observability, Telemetry and Eval Gate

**Sequence:** 12
**Timeline:** Phase 2 — Inference and Data
**Status:** Completed
> Progress: 5/5 tasks completed · updated 2026-07-18T03:39:09Z
**Proposed by:** mastra-planner
**Branch:** `mk6-observability`
**Opened:** 2026-07-17 — generated JIT by /kb-sprint-tasks-plan

## Overview

A complete, decisive migration of holocron off Convex — cloud database and all services — onto a Mastra (Bun) + Postgres platform on the tailnet mini, with the RN app resyncing via Zero and all reasoning on the local inference fleet. This sprint adds the detective-control layer: self-hosted Langfuse traces, per-call inference telemetry, versioned local-judge evals, drift tracking, and a CI gate that fails on deterministic or threshold regressions.

## Human Testing Deliverable

An operator can run a real research mission and observe its trace and per-call telemetry in the configured stores, score known-good and deliberately bad versioned fixtures with the local judge, and prove that `holo evals:ci` passes the good fixture while blocking the bad fixture.

## Human Testing Gate

**Gate:** Feeding a deliberately bad fixture to `holo evals:ci` fails the configured regression threshold and exits non-zero (blocking the lane), while a known-good sample scores at/above its versioned baseline — proving the gate has teeth.

## Test Deliverable

Each step is a real documented `holo` operator invocation against the running Mastra/Postgres/Langfuse/fleet stack.

1. Run `holo mission run research --goal 'X'` — one OTel trace appears per-run in self-hosted Langfuse.
2. Run `holo telemetry:tail` — tokens/wall-ms/endpoint/role rows are written to Postgres for every model call.
3. Run `holo evals:run --sample known-good` — the local judge scores it against the versioned rubric/dataset/baseline; the score persists.
4. Run `holo evals:ci --fixture deliberately-bad` — fails the configured threshold and exits non-zero.
5. Run `holo evals:ci --fixture known-good` — passes; a deterministic-invariant regression also fails the lane.
6. Run `holo evals:drift` — longitudinal scores are tracked across runs with dataset/model/prompt versions recorded.

## Tasks

| ID | Title | Agent | Estimate |
|----|-------|-------|----------|
| obs-1 | Observability wiring — OTel exporter → self-hosted Langfuse (per-run traces) | mastra-evals-implementer | 210 min |
| obs-2 | Inference telemetry stream (tokens/wall-ms/endpoint/role) → Postgres per call | mastra-evals-implementer | 150 min |
| obs-3 | Eval scorers + versioned datasets/baselines per specialist/retrieval/gate + judge versions | mastra-evals-implementer | 300 min |
| obs-4 | Deterministic-invariant + threshold CI regression gate with bad-fixture proof | mastra-evals-implementer | 180 min |
| obs-5 | Review evals constitution | mastra-reviewer | 90 min |
| REDHAT-FIX-H1 | Deterministic-invariant regression must fail via deterministic_invariant_failure with judge score ≥ threshold (independent review H-1) | mastra-evals-implementer | 120 min |
| REDHAT-FIX-H2 | Make budgeted-escape telemetry/ledger proof non-skippable; provision key; retain raw cross-ledger evidence (independent review H-2) | mastra-evals-implementer | 120 min |

## Source Coverage

- UC-PLAT-04 — Observability, budget ledger & evals.
- T-PLAT-012 — OTel trace per run in Langfuse.
- T-PLAT-013 — inference telemetry to Postgres.
- T-PLAT-014 — local-judge score against a versioned baseline.
- T-PLAT-018 — eval regression gate blocks a bad fixture.
- `10-technical-requirements/11-runtime-contracts.md` — eval constitution and traceability contract.
- `10-technical-requirements/02-system-components.md` — Observability + Budget Ledger component.
- `10-technical-requirements/06-external-dependencies.md` — self-hosted Langfuse dependency.
- `10-technical-requirements/09-capability-chains.md` — CAP-INF-01 telemetry/budget boundary.
- `11-e2e-testing-criteria.md` — UC-PLAT-04 integration and build-gate criteria.
- Existing platform stack: `services/platform/src/mastra.ts`, `services/platform/src/inference/`, `services/platform/src/db/`, and `services/platform/src/cli/holo.ts`.

## Capability Coverage

- CAP-INF-01: per-call inference telemetry + budget-ledger visibility (detective-controls segment).

## Blocks

- Sprint 22: All Agentic Pipelines as Templates/Agents.

## Dependencies

- Depends on: Sprint 04, Sprint 05, Sprint 08.
- The task graph is obs-1 (trace substrate) + obs-2 (telemetry persistence) → obs-3 (datasets/scorers/baselines) → obs-4 (CI gate) → obs-5 (review).

## Task Detail Files

Generated by /kb-sprint-tasks-plan on 2026-07-17 (specialist proposals: mastra-evals-implementer and mastra-reviewer).
Avg quality score: 115/115 (115-point rubric, min 80). Fakeability audit: 0 CRITICAL/HIGH — all 50 behavioral scenarios pass `validate_scenario.py` against real-entrypoint fixtures.
Topological order: obs-1 (trace substrate) ∥ obs-2 (telemetry persistence) → obs-3 (versioned evals) → obs-4 (CI gate) → obs-5 (adversarial constitution review).

- obs-1-observability-wiring-otel-exporter-self-hosted-langfuse-per-run-traces.md
- obs-2-inference-telemetry-stream-tokens-wall-ms-endpoint-role-postgres-per-call.md
- obs-3-eval-scorers-versioned-datasets-baselines-per-specialist-retrieval-gate-judge-versions.md
- obs-4-deterministic-invariant-threshold-ci-regression-gate-with-bad-fixture-proof.md
- obs-5-review-evals-constitution.md
- REDHAT-FIX-H1-deterministic-invariant-failure-independent-of-judge-threshold.md
- REDHAT-FIX-H2-nonskippable-budgeted-escape-telemetry-ledger-proof.md

## Remediation (independent review)

Authoritative findings source (read-only review; does not close Sprint 12):

`.tmp/sprint-12-independent-readonly-review-20260718T041606Z.md` at main `1e9c61431038fb930d6271cd721d94ac5eb7b86c`.

| Finding | Severity | REDHAT task | Objective |
|---------|----------|-------------|-----------|
| H-1 | HIGH | REDHAT-FIX-H1 | Citation-free, otherwise judge-passing fixture must hit `deterministic_invariant_failure` (not `threshold_regression`); assert `score >= 0.8` / `meetsThreshold: true`; re-capture hash-bound raw exit evidence with direct `$?` + `PIPESTATUS[0]`. |
| H-2 | HIGH | REDHAT-FIX-H2 | Sprint 12 budgeted-escape/telemetry/ledger path non-skippable; provision or fail-closed on Anthropic key; real escape + raw Postgres correlation evidence. |
| M-1 | MEDIUM | (advisory) | Stale `.tmp/obs-5/review-verdict.json` — supersede with a fresh independent review after H-1/H-2 land. Not a REDHAT task. |
| M-2 | MEDIUM | (advisory) | Langfuse export may retain model reasoning — data-minimization decision. Not a REDHAT task. |

Do **not** reopen obs-4/obs-2 as incomplete feature tasks; remediate via the REDHAT-FIX tasks above. Do **not** edit ROADMAP or gate-results in this planning step.

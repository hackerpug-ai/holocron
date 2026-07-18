---
status: Completed
sprint: 17
slug: deterministic-pi-free-research-engine
---

# Sprint 17: Deterministic pi-free Research Engine

**Status:** Completed
**Current implementation:** pure TypeScript evidence admission, durable seven-stage PLAN→RETRIEVE→EXTRACT→ASSAY→CHALLENGE→GATE→COMMIT orchestration, append-only evidence-gated resume, real divergent/convergent fleet calls, persisted process proof, and inspect/trace surfaces are green. Closure evidence is in `gate-plan.json`, `gate-results.json`, `gate-verification.json`, and `GATE-RESULTS.md`.

## Ordering

`research-3` RED coverage → `research-1` pure gate → `research-2` mission template/inspect/trace → `research-4` independent review.

## Scope

Evidence admission is code-owned and deterministic: grade floor, entailment, required component coverage, source independence, and supporting/refuting symmetry. Model calls may propose claims/evidence but never decide admission. Research orchestration must use Sprint 15 mission durability, real fleet roles, and distinct ASSAY/CHALLENGE model instances; no pi/external harness and no thin-evidence termination.

## Gate

Real Postgres/fleet gate steps from ROADMAP Sprint 17 plus raw pure-TS `gate:eval` claims/refuting fixtures. Closure requires independent review and source-bound evidence artifacts.

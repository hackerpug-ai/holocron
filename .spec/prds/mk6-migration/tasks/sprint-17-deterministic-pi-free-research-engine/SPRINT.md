---
status: In Progress
sprint: 17
slug: deterministic-pi-free-research-engine
---

# Sprint 17: Deterministic pi-free Research Engine

**Status:** In Progress  
**Current implementation:** pure TypeScript evidence admission, `gate:eval --claims/--refuting`, durable research-session inspection, and real divergent/convergent fleet calls are green. Full PLAN→RETRIEVE→EXTRACT→GATE→CHALLENGE→COMMIT orchestration remains.

## Ordering

`research-3` RED coverage → `research-1` pure gate → `research-2` mission template/inspect/trace → `research-4` independent review.

## Scope

Evidence admission is code-owned and deterministic: grade floor, entailment, required component coverage, source independence, and supporting/refuting symmetry. Model calls may propose claims/evidence but never decide admission. Research orchestration must use Sprint 15 mission durability, real fleet roles, and distinct ASSAY/CHALLENGE model instances; no pi/external harness and no thin-evidence termination.

## Gate

Real Postgres/fleet gate steps from ROADMAP Sprint 17 plus raw pure-TS `gate:eval` claims/refuting fixtures. Closure requires independent review and source-bound evidence artifacts.

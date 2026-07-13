---
stability: CONSTITUTION
last_validated: 2026-07-12
prd_version: 1.0.0
---

# Technical Risks

Carried forward from the red-team of the design (`idea-factory/ideas/autoresearch-loop/02-strategy.md` §6) and specialized to the holocron/local-inference build.

| # | Risk | Severity | Mitigation (in this PRD) |
|---|------|----------|--------------------------|
| R1 | **Local-model extraction quality** — coder models (27B/35B) may extract claims or verify entailment worse than the cloud models research runs on today; bad ASSAY silently corrupts the ledger | High | Config role-map allows swapping in a research pair with no code change; verbatim-quote entailment (LED UC-04) is a deterministic floor independent of model quality; validate extraction on real sources in the first CYC sprint before trusting scores; keep the opt-in cloud fallback for the convergent role only if needed |
| R2 | **Convex↔local reachability** — the worker boundary is the load-bearing seam; a broken lease/commit contract means lost or duplicated cycles | High | Durable `fulcrumWorkQueue` lease + unique `idempotencyKey` on commit (exactly-once); lease expiry re-dispatch; crash test: kill the worker mid-cycle, assert at most the in-flight cycle is lost and no partial commit exists |
| R3 | **Upstream curation is unguarded** — the gate protects the *arithmetic*, but SENSE (which query) and ASSAY (which claims) are model choices the gate can't see; optimization pressure moves there | High | Cross-model CHALLENGE on a different model (CYC UC-05); costly-signal source preference; provenance independence; named as a residual open risk, not claimed solved |
| R4 | **LLM-judge regression** — the existing `runRalphLoop` confidence exit is easy to reach for; a lazy integration could keep it | High | Architecture posture #2 makes the gate the *only* termination/score authority; `termination.ts` LLM-confidence path is removed from the Fulcrum engine, not merely bypassed; reviewer checks for any model call inside the gate module |
| R5 | **Fleet unavailability** — the fleet isn't auto-running; sustained 24/7 load risks thermal throttle on the minis | Medium | Visible degradation to sense-only (LIS UC-04); thermal duty-cycle breaker (CYC UC-06); fleet health surfaced in the brief; no silent cloud fallback |
| R6 | **Evidence sparsity misread as disconfirmation** — thin-footprint verticals (the discovery targets) have little online evidence; scoring them zero would filter out exactly the intended opportunities | Medium | UNKNOWN (not zero) for components with no admitted claims (LED UC-05); costly-signal preference so payroll/regulatory ground-truth counts even where forum talk is absent |
| R7 | **Append-only-by-convention** — Convex has no DB-level immutability triggers like SQLite; a stray mutation could edit history | Medium | No mutation exposes an edit/delete path for ledger tables; reviewer audits the mutation surface; corrections are new rows by construction |
| R8 | **Cadence collapse** — the whole value depends on the operator's ~5-min daily touch persisting; unevidenced over months | Medium | Explicit-touch-only ceiling with sense-only degradation (GATE UC-04); 24h starting ceiling; the brief is designed for ≤5-min reads; honest kill criterion if the gate is skipped |
| R9 | **Scope creep into the app** — pressure to build an in-app Fulcrum UI mid-initiative | Low | UI explicitly deferred; MVP surfaces are generated Markdown + stored documents; a rich UI is a separate PRD |
| R10 | **Model determinism drift** — local model updates change extraction behavior, making cycles non-reproducible | Low | Reproducibility lives in the *ledger* (deterministic re-score over stored claims), not in re-running inference; cycle telemetry records the model/endpoint used |

## The one risk that gates the initiative

**R1 + R2 together** decide whether Fulcrum is buildable as scoped: local models must extract usable claims (R1), and the worker boundary must be exactly-once (R2). Both are validated by acceptance criteria in the first two sprints (LIS then CYC's first real cycle), with real inference and a real crash test — before any perpetual operation is trusted. If R1 fails on the coder fleet, the role-map swap to a research pair is the defined fallback, not a redesign.

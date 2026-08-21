---
stability: CONSTITUTION
last_validated: 2026-08-20
prd_version: 3.0.0
---

# Technical Risks

Carried forward from the red-team of the design (`idea-factory/ideas/autoresearch-loop/02-strategy.md` §6) and specialized to the live Mastra + Postgres + fleet platform. Dead Convex / Cohere / SQLite rows are **removed**, not parked under a retired banner.

| # | Risk | Severity | Mitigation (in this PRD) |
|---|------|----------|--------------------------|
| R1 | **The default research binding is unmeasured** — `Qwen3.8-27B-8bit` for ASSAY (`divergent`) and the Opus-distill for CHALLENGE (`convergent`) is a reasoned prior, not a measured result. Bad ASSAY silently corrupts the ledger | High | **The measurement is a product capability** (UC-LIS-03): ASSAY scores as quote-check pass rate over a **held-out source pack with a denominator floor**; CHALLENGE as refuting-claim gate-pass rate **plus** kill-question → later admitted disconfirm. Both deterministic code. Swapping either model is a `fleet.json` edit. A 1/1 pass rate is not a measurement. |
| R2 | **Ledger durability** — a broken idempotent-commit contract means lost or duplicated cycles | High | `mission_runs` unique `(template_key, idempotency_key)`; one Postgres transaction per cycle; SIGKILL of Mastra + scheduler-worker resumes from `lease_owner` / `lease_expires_at`. Proven by CAP-COMMIT-01 before perpetual operation is trusted |
| R3 | **Upstream curation is unguarded** — the gate protects the *arithmetic*, but SENSE (which query) and ASSAY (which claims) are model choices the gate can't see; optimization pressure moves there | High | Cross-model CHALLENGE on `convergent` vs `divergent`; costly-signal source preference; provenance independence; named as a residual open risk, not claimed solved |
| R4 | **LLM-judge regression** — a lazy integration could put `generateText` or the `judge` role inside gate/score, or resurrect `termination.ts` confidence exit | High | Architecture posture #2: the gate is the *only* termination/score authority; **no `generateText` / no fleet role inside gate or score modules**; **`judge` never appears on the Fulcrum path**. Reviewer greps for all three |
| R5 | **Fleet unavailability** — sustained 24/7 load risks thermal throttle on the minis | Low–Medium | Per-role degradation with an explicit named error (LIS UC-04); thermal duty-cycle breaker (CYC UC-06); per-role availability in the daily brief **Loop health** section; no silent cloud fallback and no silent role substitution. Mini-to-mini failover is the router's job. The laptop is not in the pool |
| R6 | **Evidence sparsity misread as disconfirmation** — thin-footprint verticals have little online evidence; scoring them zero would filter out exactly the intended opportunities | Medium | UNKNOWN (not zero) for components with no admitted claims (LED UC-05); costly-signal preference so payroll/regulatory ground-truth counts even where forum talk is absent |
| R7 | **Append-only-by-convention on Postgres** — without DB-level immutability, a stray UPDATE could edit history | Medium | Blocking UPDATE/DELETE triggers on `belief_scores`, version tables, `touches`, `probes`, and immutable columns of `sources`/`claims`; no mutation exposes an edit/delete path; corrections are new rows. Reviewer audits the mutation surface |
| R8 | **Cadence collapse** — the whole value depends on the operator's ~5-min daily touch persisting; unevidenced over months | Medium | Explicit-touch-only ceiling with sense-only degradation (GATE UC-04); 24h starting ceiling; the brief is designed for ≤5-min reads; `holo fulcrum ack-brief` is the only ack; honest kill criterion if the gate is skipped |
| R9 | **Scope creep into the app** — pressure to build an in-app Fulcrum UI mid-initiative | Low | UI explicitly deferred to a separate PRD. MVP surfaces are generated Markdown + `holo fulcrum` CLI. In-app UI is **not** a Fulcrum AC |
| R10 | **Model determinism drift** — local model updates change extraction behavior, making cycles non-reproducible | Low | Reproducibility lives in the *ledger* (deterministic re-score over stored claims), not in re-running inference; `mission_runs` telemetry records resolved model/endpoint from headers |
| R13 | **Corpus-only SENSE misses live-web evidence** — registry tools search ingested `documents`/`passages` only; there is no Exa/Jina tool | Medium | Honest scope: the problem statement is corpus evidence already in holocron. Outbound fetch is platform work, not a Fulcrum invention. Ban-list + courtesy-delay Zod fields still ship so they are ready if an outbound tool is registered later |

### Fleet-consumption risks

| # | Risk | Severity | Mitigation |
|---|------|----------|------------|
| R14 | **Body-field model checks are false evidence** — LiteLLM 1.91.0 rewrites the response body's `model` to the *requested alias* (measured 2026-08-17). Telemetry or an ASSAY≠CHALLENGE guard reading `response.model` would report the requested role name regardless of what actually served, and would therefore **pass against a live substitution** | High | Read `x-litellm-model-api-base` and `x-litellm-model-id` from response headers, cross-referenced against `GET /model/info`. Enforce distinctness per cycle on *resolved* identity, not on configured role names. Embeddings carry no model field at all, so assert 1024 dimensionality instead |
| R15 | **Fleet cutover silently removes a working capability** — both minis serve `qwen3-embedding` today but `fleet.json` does not declare it. Farm isolation means an undeclared model cannot be discovered | High | Fleet ask **F2** (declare `qwen3-embedding` in both minis' `serves`) is a hard prerequisite. Fulcrum's readiness must assert the **expected role set** (`divergent`, `convergent`, `embed`), never mere liveness |
| R16 | **Equal-weight balancing causes model reload churn** — with both 27B models in equal-weight pools, the router can land ASSAY and CHALLENGE on the same mini, forcing evict-and-reload between phases | Medium | Accepted tradeoff. Watch per-phase wall-time in telemetry; the documented remedy is preferred-home weights (100 / 1), a config edit requiring no Fulcrum change |
| R17 | **Fulcrum reaches for a substitute role on a no-host error** — a well-meaning retry that requests a different role (or `judge`) would reintroduce silent substitution | High | Architecturally forbidden (ADR-007, LIS UC-04): the only responses to a no-host error are degrade-and-name or an operator-opted cloud fallback. Reviewer audits the retry path for any code that varies the requested role name |

## The risks that gate the initiative

**R1 + R2 together** decide whether Fulcrum is buildable as scoped: the research models must extract usable, quote-faithful claims over a real denominator (R1), and the ledger commit must be exactly-once and crash-safe (R2). Both are validated by acceptance criteria in LED then the first real CYC cycle, with real inference against the real minis and a real crash test — before any perpetual operation is trusted.

If the recommended binding measures badly, reversing ASSAY and CHALLENGE (swap which model sits behind `divergent` vs `convergent`) is the first experiment, not a redesign.

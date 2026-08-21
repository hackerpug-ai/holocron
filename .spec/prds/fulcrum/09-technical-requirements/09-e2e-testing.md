---
stability: CONSTITUTION
last_validated: 2026-08-20
prd_version: 3.0.0
---

# E2E Harness Constitution

> **v3.0.0.** Assertions about *which model served a call* MUST read the router's `x-litellm-model-api-base` / `x-litellm-model-id` response headers cross-referenced against `GET /model/info`. **The response body's `model` field is NOT a detector** — LiteLLM 1.91.0 rewrites it to the requested alias (measured 2026-08-17), so a body-field assertion passes against a live substitution and is therefore *worse than no test*. Embedding responses carry no model field at all, so assert **1024 dimensionality** instead. The inference lane is gated on the fleet's own `preflight` exit code, and outages are induced the way the fleet initiative induces them (stopping a real oMLX on a real mini), never simulated.

Harness = **Mastra + real Postgres + live fleet**. There is no `convex-test`, no Convex dev deployment, no spawned Fulcrum Worker, and no `fulcrumCycles` spike.

## Framework

- **Gate, ledger mutations, selector, verdict machine**: Vitest against **real Postgres** through the live Mastra service / Hono app. No mocked DB.
- **Fleet inference** (LIS, cycle phases): drives the real mission against the **packaged router on loopback**, served by real oMLX on `inference1` / `inference2`. The lane is gated on the fleet's own `preflight` exit code and SKIPs loudly when it is non-zero. Outages are induced by stopping a real server on a real mini, never simulated. The laptop is never a test backend.
- **Full cycle** (CYC UC-01): the Mastra service runs one real cycle against named registry tools (corpus) + real local inference + real Postgres, and the committed ledger is asserted on live tables (`mission_runs`, `claims`, `belief_scores`, `sources`, telemetry columns).

## The Determinism Seam (mandatory — this is an agentic product)

Fulcrum's architecture *is* the determinism seam, which makes it unusually testable: the model is probabilistic, but the **Evidence Gate and everything downstream are deterministic**. Tests exploit this:

- **Fixture the model signal, assert the engine outcome.** For gate/score/commit tests, inject fixed model outputs (a fixed set of extracted claims + a fixed fetch artifact `{ url, fetchedAt, raw, normalizedText, contentHash }`) and assert the *deterministic* consequences: which claims were admitted and why, the exact numeric `belief_scores.score`, the provenance grouping, the stage transition. Never assert on model prose.
- **The score is a pure function of the ledger** — the canonical determinism test: same claims + same contract version ⇒ identical score, byte-for-byte, across runs.
- **The live-model lane is separate and thin.** A small number of tests run real local inference to prove the substrate works (round-trip, role routing, ASSAY≠CHALLENGE, degradation) — but they assert on *observable engine effects* (telemetry recorded, fleet state transitions, a `mission_runs` commit happened), not on the content the model produced.

## Turnkey runner

`bun run fulcrum:e2e` brings up (or checks) the **Mastra service + real Postgres**, verifies the loopback router is reachable (skips the live-inference lane with a loud SKIP if `fleet-start` hasn't run), seeds a throwaway mission, and runs the lanes below.

## CI lanes

| Lane | Needs | Runs in CI |
|------|-------|-----------|
| `gate` (deterministic) | Real Postgres | Always — the core; fixture the model, assert gate outcomes |
| `ledger` (append-only, idempotency, re-score) | Real Postgres | Always |
| `dispatch` (lease/commit exactly-once, crash) | Real Postgres + Mastra service + scheduler-worker | Always |
| `inference` (real local round-trip, roles, degradation) | fleet up | On the tailnet / nightly; SKIP-with-notice otherwise |
| `cycle` (one full real cycle) | fleet up + Mastra + Postgres + corpus documents | On the tailnet / nightly |

## Proven-reference-flow (spike gate)

The harness is **incomplete until one full real cycle is proven green in a spike**: seed `dev-revenue` with one candidate, run one real deepening cycle end-to-end (local inference → gate → commit), and assert a committed `mission_runs` row (template_key=`evidence-research`, tag=`fulcrum`) with admitted `claims`, a numeric `belief_scores` row stamping `domain_tier_version`, lineage via `relations`, and header-truthful inference telemetry on `mission_stage_runs`. This spike gates the deep build — it proves R1 (extraction quality over a denominator floor) and R2 (dispatch exactly-once) on real services before perpetual operation is built.

## Landmine ledger

| Landmine | Symptom | Actual cause |
|---|---|---|
| Substitution test passes against a live substitution | Assertion green, wrong model served | The body `model` field echoes the **requested alias**. Only the `x-litellm-model-api-base` / `x-litellm-model-id` headers are truthful |
| Embedding assertion has nothing to assert | No `model` field in the response | oMLX embeddings carry no identifier — assert **1024** dimensionality |
| Two namespaces silently compared | Readiness never passes, or passes wrongly | Router **role names** (`divergent`/`convergent`/`embed`) and oMLX **model basenames** are different namespaces; never build one's expectations from the other |
| Server answers but serves nothing | `/v1/models` returns success with an empty or short list | Weights or farm not ready. Readiness must assert the **expected role set**, never mere liveness |
| Uneven cycle wall-times | Budget-exceeded outcomes appear erratic | Equal-weight pools landed both 27B models on one mini → evict-and-reload between ASSAY and CHALLENGE (R16) |
| A role "recovers" suspiciously fast after an outage | Cycle succeeds when it should have degraded | Something in the retry path varied the requested role name — the forbidden substitution (R17) |
| Quote-check reports 100% | Oracle is vacuous | Denominator is 1 claim / 1 refuter. T-LIS-010/011 require a held-out source pack and a minimum claim-attempt floor |
| Quote is "verified" against an RRF snippet | Admission green, fabrication possible | `quote_text` was sliced from hybrid-search `sourceText`, not from the fetch artifact's `normalizedText` |

Also record as hit: local-model quirks that break extraction (JSON formatting, verbose reasoning bleed), LiteLLM cooldown behavior mid-cycle, and any measured quote-check pass-rate gap between the two candidate bindings — that number feeds the model-swap decision (UC-LIS-03).

## Flake policy

The deterministic lanes (`gate`, `ledger`, `dispatch`) must be **0% flake** — any nondeterminism there is a bug in the seam, not a flaky test. The live-inference lanes may retry once on a transient endpoint error but must never mask a persistent degradation (that's a real signal the degradation path should catch).

---
stability: CONSTITUTION
last_validated: 2026-07-12
prd_version: 1.0.0
---

# E2E Harness Constitution

> **⚠️ Re-platform pending (v2.0.0, 2026-07-13).** The "Fulcrum Worker (Bun, tailnet)" surface below is replaced by **"Fulcrum mission template (Mastra workflow)"** per [`mk6-migration`](../../mk6-migration/README.md) + [ADR-006](./00-architecture-decisions.md). The **determinism seam** (fixture the model signal, assert gate OUTCOMES, not prose) and the spike-gate discipline carry forward unchanged — re-provision the harness against the mk6 test rig.

## Framework

- **Convex functions** (Gate, ledger mutations, selector, verdict machine): `convex-test` + Vitest against a real Convex test instance — no mocked DB.
- **Worker + local inference** (LIS, cycle phases): Bun test driving the real worker loop against a **real local endpoint** — in CI/dev this is the laptop LiteLLM router (or a locally-run `llama-server`); the fleet must be `fleet-start`ed for the inference lane.
- **Full cycle** (CYC UC-01): the worker runs one real cycle against real retrieval + real local inference + a real Convex dev deployment, and the committed ledger is asserted.

## The Determinism Seam (mandatory — this is an agentic product)

Fulcrum's architecture *is* the determinism seam, which makes it unusually testable: the model is probabilistic, but the **Evidence Gate and everything downstream are deterministic**. Tests exploit this:

- **Fixture the model signal, assert the engine outcome.** For gate/score/commit tests, inject fixed model outputs (a fixed set of extracted claims + fixed fetched source text) and assert the *deterministic* consequences: which claims were admitted and why, the exact numeric score, the provenance grouping, the stage transition. Never assert on model prose.
- **The score is a pure function of the ledger** — the canonical determinism test: same claims + same contract version ⇒ identical score, byte-for-byte, across runs.
- **The live-model lane is separate and thin.** A small number of tests run real local inference to prove the substrate works (round-trip, role routing, ASSAY≠CHALLENGE, degradation) — but they assert on *observable engine effects* (telemetry recorded, fleet state transitions, a commit happened), not on the content the model produced.

## Turnkey runner

`bun run fulcrum:e2e` brings up (or checks) the Convex dev deployment, verifies the local endpoint is reachable (skips the live-inference lane with a loud SKIP if `fleet-start` hasn't run), seeds a throwaway mission, and runs the lanes below.

## CI lanes

| Lane | Needs | Runs in CI |
|------|-------|-----------|
| `gate` (deterministic) | Convex test only | Always — the core; fully hermetic |
| `ledger` (append-only, idempotency, re-score) | Convex test | Always |
| `dispatch` (lease/commit exactly-once, crash) | Convex test + spawned worker | Always |
| `inference` (real local round-trip, roles, degradation) | fleet up | On the tailnet / nightly; SKIP-with-notice otherwise |
| `cycle` (one full real cycle) | fleet up + Convex dev + retrieval keys | On the tailnet / nightly |

## Proven-reference-flow (spike gate)

The harness is **incomplete until one full real cycle is proven green in a spike**: seed `dev-revenue` with one candidate, run one real deepening cycle end-to-end (local inference → gate → commit), and assert a committed `fulcrumCycles` row with admitted claims, a numeric score, lineage, and inference telemetry. This spike gates the deep build — it proves R1 (extraction quality) and R2 (dispatch exactly-once) on real services before perpetual operation is built.

## Landmine ledger

Record, as they're hit: local-model quirks that break extraction (JSON formatting, verbose reasoning bleed), LiteLLM cooldown behavior mid-cycle, Convex action time limits vs cycle length (a cycle may need to run in the worker, not a Convex action, precisely because of this), and any place the coder models produce unusable research output (feeds the role-map-swap decision).

## Flake policy

The deterministic lanes (`gate`, `ledger`, `dispatch`) must be **0% flake** — any nondeterminism there is a bug in the seam, not a flaky test. The live-inference lanes may retry once on a transient endpoint error but must never mask a persistent degradation (that's a real signal the degradation path should catch).

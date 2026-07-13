---
stability: FEATURE_SPEC
last_validated: 2026-07-12
prd_version: 1.0.0
---

# Functional Groups

Fulcrum decomposes into four functional groups, sequenced so each builds on the last. **Local Inference (LIS) ships first** — it is the initiative's defining mandate and every later group depends on it. The Evidence Ledger (LED) is the deterministic spine the Loop Engine (CYC) commits into. Missions & Gate (GATE) is the human-facing layer that makes the loop steerable and safe.

| Group | Prefix | Description |
|-------|--------|-------------|
| **Local Inference Substrate** | **LIS** | Route all research model calls to local Apple-Silicon inference (dev: laptop LiteLLM router; prod: Mac minis), via an OpenAI-compatible provider, with declared model-role mapping, tailnet reachability, visible degradation, and per-cycle telemetry. |
| **Cycle Loop Engine** | **CYC** | The perpetual fixed-budget cycle (SENSE→GENERATE→ASSAY→CHALLENGE→MAP→COMMIT), its scheduler and work-item selector, the diverge/converge cadence, and cross-model challenge — evolving holocron's existing `convex/research/` loop. |
| **Evidence Ledger & Gate** | **LED** | The append-only ledger and the deterministic gate: evidence grading, claim admission, provenance independence, verbatim-quote entailment, saturating disconfirmation-weighted scoring, versioned weights/tiers. Replaces LLM-confidence termination. |
| **Missions & Human Gate** | **GATE** | Missions as config (starting `dev-revenue`), seed import, verdicts and stage machine (WIP=1, probe-gated validation), daily briefs + dossiers with full evidence chains, and touch/degradation mechanics. |

## Use Case Summary

| Group | Prefix | UCs |
|-------|--------|-----|
| Local Inference Substrate | LIS | 5 |
| Cycle Loop Engine | CYC | 6 |
| Evidence Ledger & Gate | LED | 6 |
| Missions & Human Gate | GATE | 5 |
| **Total** | | **22** |

## Dependency Order (drives PR/sprint sequencing)

```
LIS (local inference)  ──►  LED (ledger + gate)  ──►  CYC (cycle engine)  ──►  GATE (missions + human gate)
   the mandate               the deterministic         binds the two:          makes it steerable
   ships first               spine to commit into       agents in, code out     and safe to run 24/7
```

- **LIS first**: nothing runs research locally until the substrate exists; it is independently demonstrable (a real local round-trip through both model roles).
- **LED before CYC**: the cycle's COMMIT phase writes into the ledger and its ASSAY phase calls the gate — the deterministic core must exist first and be testable in isolation.
- **CYC before GATE surfaces**: briefs and verdicts operate on real cycle output; the loop must produce committed cycles before the gate has anything to show or steer.
- **GATE throughout**: mission config seeds even the first cycle, so a minimal mission loader lands early; the richer gate surfaces (briefs, dossiers, verdict flow) follow the first committed cycles.

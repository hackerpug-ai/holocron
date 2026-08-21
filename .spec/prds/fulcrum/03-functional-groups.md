---
stability: FEATURE_SPEC
last_validated: 2026-08-20
prd_version: 3.0.0
---

# Functional Groups

Fulcrum decomposes into four functional groups, sequenced so each builds on the last. **Local Inference (LIS) ships first** — it is the initiative's defining mandate and every later group depends on it. The Evidence Ledger (LED) is the deterministic spine the Loop Engine (CYC) commits into. Missions & Gate (GATE) is the human-facing layer that makes the loop steerable and safe.

| Group | Prefix | Description |
|-------|--------|-------------|
| **Local Inference Substrate** | **LIS** | Consume the inference fleet as an ordinary client: one **loopback** endpoint pinned to `inference1` + `inference2` (never the laptop), addressing **three research roles** — `fulcrum-assay`, `fulcrum-challenge`, `qwen3-embedding` — with a swappable model binding scored by a deterministic oracle, per-role degradation that never substitutes, and header-truthful telemetry. **No coder role.** |
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

> **v3.0.0 sequencing note.** Fulcrum is hard-sequenced after **two** predecessors: [`mk6-migration`](../mk6-migration/README.md) (Mastra + Postgres platform) and the **Virtual Device Fleet** (router, fleet-wide roles, derived pools, model serving on the minis). The LIS *group* therefore shrinks further still — it builds **no** substrate and **no** router. What remains inside Fulcrum is the research role definitions, per-role degradation policy, header-truthful telemetry, and **swap-and-measure** (the deterministic oracle that decides which model serves which role). Everything else is consumed.

> **v2.0.0 sequencing note (superseded above).** Fulcrum is hard-sequenced after [`mk6-migration`](../mk6-migration/README.md), which delivers the **local-inference substrate** (role router + fleet). The LIS *group* therefore shrinks to the research-specific role mapping + degradation + telemetry that *configure* the platform router; it is no longer a standalone "build the substrate" sprint. Internal build order post-mk6: **LED (ledger/gate) → CYC (cycle engine) → GATE (missions/human gate)**, with the LIS config landing alongside LED (the gate's ASSAY and the cycle's GENERATE both need the role mapping).

```
[mk6 platform: substrate + router + Postgres + embedder]  ──►  LED  ──►  CYC  ──►  GATE   (+ LIS config alongside LED)
                                                              the          binds       makes it steerable
                                                              deterministic the two:    and safe to run 24/7
                                                              spine        agents in,
                                                                           code out
```

- **LIS inherited, configured alongside LED**: the local-inference *substrate* is delivered by mk6 (no Fulcrum sprint to build it). The Fulcrum LIS work — the research role mapping (divergent/convergent), degradation policy, and per-cycle telemetry that configure the platform router — lands alongside LED, since both the gate's ASSAY and the cycle's GENERATE need the role mapping. It is independently demonstrable as a real local round-trip through both model roles.
- **LED before CYC**: the cycle's COMMIT phase writes into the ledger and its ASSAY phase calls the gate — the deterministic core must exist first and be testable in isolation.
- **CYC before GATE surfaces**: briefs and verdicts operate on real cycle output; the loop must produce committed cycles before the gate has anything to show or steer.
- **GATE throughout**: mission config seeds even the first cycle, so a minimal mission loader lands early; the richer gate surfaces (briefs, dossiers, verdict flow) follow the first committed cycles.

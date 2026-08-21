---
stability: FEATURE_SPEC
last_validated: 2026-08-20
prd_version: 3.0.0
---

# Functional Groups

Fulcrum decomposes into four functional groups. **v3 order: LED → CYC → GATE, with LIS config alongside LED.** There is no "LIS ships first."

| Group | Prefix | Description |
|-------|--------|-------------|
| **Evidence Ledger & Gate** | **LED** | The append-only evidence-graph extensions and the deterministic gate: evidence grading, claim admission, provenance independence, verbatim-quote entailment against `normalizedText`, saturating disconfirmation-weighted scoring into `belief_scores`, versioned weights/tiers. Replaces LLM-confidence termination. **No `generateText` / no fleet role inside gate or score.** |
| **Cycle Loop Engine** | **CYC** | The perpetual fixed-budget cycle on the live seven-stage graph plus GENERATE and MAP; the `fulcrum:cycle` scheduler job; the work-item selector; the diverge/converge cadence; cross-model challenge. Mines `convex/research/` *design* (ADR-003); does not execute it. |
| **Missions & Human Gate** | **GATE** | Missions as config (starting `dev-revenue`), seed import, verdicts via `holo fulcrum verdict` / `POST /api/missions/:id/verdicts`, `ackBrief` via `holo fulcrum ack-brief`, daily briefs + dossiers as Markdown, touch/degradation mechanics. |
| **Local Inference Substrate** | **LIS** | Consume the inference fleet as an ordinary client: one **loopback** endpoint pinned to `inference1` + `inference2` (never the laptop), addressing **`divergent` / `convergent` / `embed`** — with a swappable model binding scored by a deterministic oracle (denominator floor + kill-question→admitted-disconfirm), per-role degradation that never substitutes, and header-truthful telemetry. **No coder role. `judge` forbidden.** |

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
[mk6 platform: substrate + router + Postgres evidence graph + embedder]
        │
        ▼
   LED  (+ LIS config alongside LED)  ──►  CYC  ──►  GATE
   the deterministic spine                 binds        makes it steerable
   (admit+score are code)                  agents in,   and safe to run 24/7
                                           code out
```

- **LED first**: the cycle's COMMIT writes into the evidence graph and its ASSAY phase hands extracted claims to the gate — the deterministic core must exist first and be testable in isolation (fixture the model, assert gate outcomes).
- **LIS config alongside LED**: the local-inference *substrate* is delivered by mk6 (no Fulcrum sprint to build it). The Fulcrum LIS work — role mapping (`divergent`/`convergent`/`embed`), degradation policy, telemetry, swap-and-measure — lands alongside LED, since the gate's ASSAY extraction and the cycle's GENERATE both need the role mapping. It is independently demonstrable as a real local round-trip through both model roles.
- **CYC before GATE surfaces**: briefs and verdicts operate on real cycle output; the loop must produce committed `mission_runs` before the gate has anything to show or steer.
- **GATE throughout**: mission config seeds even the first cycle, so a minimal mission loader lands early; the richer gate surfaces (briefs, dossiers, verdict CLI) follow the first committed cycles.

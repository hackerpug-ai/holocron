---
stability: CONSTITUTION
last_validated: 2026-07-13
prd_version: 1.0.1
---

# Architecture Diagram

## Cycle data flow (MVP: local loop + local ledger; Convex is a publish target — ADR-001)

```
   OPERATOR (human gate)
     │  reads brief (Markdown) / issues verdicts / edits mission / records probe
     ▼  (all against the LOCAL ledger — CLI / files)
┌──────────────── FULCRUM WORKER (Bun, on the machine / tailnet: laptop dev → Mac mini prod) ────────────────┐
│                                                                                                             │
│  Scheduler(own loop) ─► Work-Item Selector ─► Cycle:  SENSE ─► GENERATE ─► ASSAY ─► CHALLENGE ─► MAP ─► COMMIT │
│    budget/breaker/ceiling      │ EVoI (SQLite)          │(div)   │(div)     │(conv)   │(the OTHER model)   │   │
│                                │                        ▼        ▼          ▼         ▼                    │   │
│                                │            Local Inference Provider (@ai-sdk/openai → OpenAI-compatible)   │   │
│                                │                        │                                                  │   │
│                                ▼                        │              Evidence Gate (PURE, no model) ◄────┤   │
│      ┌──────────────────────────────────────────┐      │              grade·quote·admit·provenance·score  │   │
│      │  LOCAL LEDGER  (bun:sqlite, source of      │◄─────┴── COMMIT (idempotent, append-only, kill-9 safe) ─┘   │
│      │  truth — reused Prospector core, 31/37)    │                                                            │
│      │  evidence·claims·scores·lineage·cycles·    │──► Brief/Dossier Generator ──► Markdown (repo files)       │
│      │  verdicts·touches·missions·tiers           │──► Holocron Publisher ──┐                                  │
│      └──────────────────────────────────────────┘   holocron retrieval     │ (only cross-machine hop)         │
│                    │ SENSE fetch                     tools (Exa/Jina)        │                                  │
└────────────────────┼───────────────────────────────────┬──────────────────┼──────────────────────────────────┘
                     ▼ OpenAI-compatible /v1              ▼ real web           ▼ HTTPS (idempotent upsert; queues if down)
┌──── LOCAL INFERENCE FLEET (tailnet) ────┐    real sources        ┌──── HOLOCRON (Convex cloud) ────┐
│ LiteLLM @ laptop:4545                   │                        │ documents (Cohere 1024-dim,      │
│  ├ convergent ─► reviewer (27B, precise)│                        │   embedded, searchable)          │
│  └ divergent  ─► implementer (35B-A3B)  │                        │ fulcrumRuns (thin read-only      │
│ degraded → remaining node               │                        │   leaderboard projection)        │
│ offline → sense-only (NO cloud unless   │                        │ agentTelemetry (optional)        │
│ opted)                                  │                        └──────────────────────────────────┘
└─────────────────────────────────────────┘                          the app READS this; it is NOT the
                                                                       loop's source of truth
```

## North-star (out of scope): self-hosted Convex on the mini

```
   When Convex is self-hosted on a Mac mini (tailnet-resident), the "only cross-machine hop"
   (publish) becomes a local call and the local ledger + Convex co-locate on the same box.
   Fulcrum's boundaries are drawn so this is a deployment change, not an architecture change:
   the loop already runs entirely locally today; self-hosting just brings the publish target home.
```

## The two seams that define the design

1. **Deterministic/agentic** (inside the worker): everything above the Gate is a model; the Gate and everything it feeds (scores, stage machine, ledger) is code. Findings cross this seam as *claims with quotes*, never as trusted prose. This is the seam that replaces holocron's LLM-confidence termination.
2. **Machine edge** (publish only): the loop is self-contained on the machine against the local ledger; the sole boundary that leaves the machine is publishing a finding to Convex. No per-cycle network dependency — the loop runs Convex-offline and queues findings.

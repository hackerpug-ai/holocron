---
stability: CONSTITUTION
last_validated: 2026-07-12
prd_version: 1.0.0
---

# Architecture Diagram

## Cycle data flow (MVP: tailnet worker + cloud Convex)

```
   OPERATOR (human gate)
     │  reads brief / issues verdicts / edits mission / records probe
     ▼
┌──────────────────────────── CONVEX (durable truth + scheduler + app surface) ────────────────────────────┐
│                                                                                                            │
│  Mission Registry ──► Scheduler(cron+workflow) ──► Work-Item Selector ──► fulcrumWorkQueue (durable)       │
│         ▲                    │ budget/breaker/ceiling         │ EVoI rule                    │ lease        │
│         │                    ▼                                ▼                              │              │
│  fulcrum.gate.* ◄── Evidence Ledger (append-only: evidence·claims·scores·lineage·cycles·verdicts·touches) │
│   (verdict/judge/                    ▲                                        ▲                             │
│    ack/probe)                        │ fulcrum.cycle.commit (idempotent)      │ re-score on weight version  │
│  Brief/Dossier Gen ──► documents (embedded, searchable) ─────────────────────┘                             │
└───────────────────────────────────────────┬──────────────────────────────────▲───────────────────────────┘
                                lease work    │                                  │ commit result (Convex client)
                                              ▼                                  │
┌──────────────────── FULCRUM WORKER (Bun, TAILNET: laptop dev / Mac mini prod) ─┴──────────────────────────┐
│                                                                                                            │
│  runCyclePhases:  SENSE ──► GENERATE ──► ASSAY ──► CHALLENGE ──► MAP ──► (propose COMMIT)                  │
│                     │(divergent) │(divergent) │(convergent)│(the OTHER model)                              │
│                     ▼            ▼            ▼            ▼                                                 │
│              Local Inference Provider (@ai-sdk/openai → OpenAI-compatible)      Evidence Gate (PURE, no model)│
│                     │                                                            grade·quote·admit·score    │
│                     ▼                                                                                       │
│              holocron retrieval tools (Exa/Jina)  ──►  real web sources                                    │
└─────────────────────┬──────────────────────────────────────────────────────────────────────────────────┘
                       │ OpenAI-compatible /v1
                       ▼
┌──────────────── LOCAL INFERENCE FLEET (Tailscale tailnet) ───────────────┐
│  LiteLLM router @ laptop:4545                                            │
│    ├─ role: convergent ─► reviewer  (27B dense, precise)  laptop:8001    │
│    └─ role: divergent  ─► implementer (35B-A3B MoE, fast) mini:8000 ×2   │
│  degraded → remaining mini; offline → sense-only (NO cloud unless opted) │
└──────────────────────────────────────────────────────────────────────────┘
```

## North-star (out of scope): self-hosted Convex on the mini

```
   When Convex is self-hosted on a Mac mini (tailnet-resident), Convex actions
   themselves reach local inference — the Worker↔Convex reachability split
   collapses, and "all research on local inference" holds end-to-end with no
   redesign. Fulcrum's component boundaries are drawn so this is a deployment
   change, not an architecture change.
```

## The two seams that define the design

1. **Deterministic/agentic** (horizontal): everything above the Gate is a model; the Gate and everything it feeds (scores, stage machine) is code. Findings cross this seam as *claims with quotes*, never as trusted prose.
2. **Reachability** (the worker boundary): durable truth in Convex, inference on the tailnet worker, joined by a durable idempotent queue. This is the seam self-hosting later removes.

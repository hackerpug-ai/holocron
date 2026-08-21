---
stability: CONSTITUTION
last_validated: 2026-08-20
prd_version: 3.0.0
---

# Architecture Diagram

MVP topology: optional RN/Zero is **not** a Fulcrum surface. The loop is Postgres → Mastra Mission Engine → loopback router → `inference1` / `inference2`. There is no sidecar worker, no Convex cloud box, and no "self-hosted Convex north star."

## Cycle data flow

```
   OPERATOR (human gate)
     │  reads:  .holocron/fulcrum/briefs/{date}.md
     │          .holocron/fulcrum/dossiers/{id}.md
     │          (also documents via publishDocumentForRun)
     │  writes: holo fulcrum verdict  → POST /api/missions/:id/verdicts
     │          holo fulcrum ack-brief → POST /api/missions/:id/touches
     │          holo fulcrum probe     → POST /api/missions/:id/probes
     ▼
┌──────────────── MASTRA SERVICE (Bun, on the mini) ─────────────────────────────────────────┐
│                                                                                            │
│  MIGRATED_JOBS fulcrum:cycle ─► selector.next (Postgres) ─► mission:execute                │
│       cadence / daily budget / lease_owner                                                 │
│                                                                                            │
│  evidence-research (+ GENERATE, MAP):                                                      │
│    plan+retrieve (SENSE) → GENERATE → extract+assay (ASSAY=extract only)                   │
│         → challenge → MAP → gate (LED) → commit (TX)                                       │
│                                                                                            │
│    convergent: plan, GENERATE, CHALLENGE                                                   │
│    divergent:  extract, assay                                                              │
│    embed:      publish vectors (1024-dim)                                                  │
│    judge:      FORBIDDEN                                                                   │
│                                                                                            │
│    Evidence Gate (PURE)  grade · quote⊆normalizedText · admit · provenance · score         │
│         no generateText, no fleet role                                                     │
│                                                                                            │
│    Postgres evidence graph                                                                 │
│      sources/passages/claims/entities/relations/beliefs                                    │
│      + candidates, belief_scores, weight_versions, domain_tiers, touches, probes           │
│      mission_runs (cycle log) · mission_verdicts                                           │
│         │                                                                                  │
│         ├── Markdown generator ──► in-repo briefs/dossiers                                 │
│         └── publishDocumentForRun ──► documents                                            │
│                                                                                            │
│    retrieve: hybrid_search / search_fts / search_vector /                                  │
│              search_research / get_research_session / get_document                         │
│              (corpus-only; toolGrants on the Fulcrum template)                             │
└───────────────────────────────────────────┬────────────────────────────────────────────────┘
                                            │ loopback http://127.0.0.1:{router_port}/v1
                                            ▼
┌──── PACKAGED ROUTER (loopback only) ────┐
│ node_set: inference1, inference2        │
│ roles: divergent, convergent, embed     │
│ judge: never requested by Fulcrum       │
└─────────────────┬───────────────────────┘
                  ▼
┌──── inference1 / inference2 (oMLX) ─────┐
│ chat: divergent + convergent models     │
│ embed: qwen3-embedding 1024-dim         │
└─────────────────────────────────────────┘

   RN app ──Zero──► Postgres     (optional, not a Fulcrum MVP surface)
```

## What this diagram is not

- Not a Fulcrum Worker (Bun sidecar) owning a `bun:sqlite` ledger.
- Not a Convex cloud box receiving `createWithEmbedding`.
- Not "self-hosted Convex on the mini" as a north star. mk6 delivered Mastra + Postgres; that is the topology.
- Not coder roles (`reviewer` / `implementer`) and not `judge`.

## The two seams that define the design

1. **Deterministic/agentic** (inside the Mastra service): everything above the Gate is a model producing claims; the Gate and everything it feeds (`belief_scores`, stage machine, ledger) is code. Findings cross this seam as *claims with quotes ⊆ fetch-artifact `normalizedText`*, never as trusted prose.
2. **Loopback inference**: the only machine-edge hop on the cycle path is the packaged router on loopback to `inference1`/`inference2`. Publish stays in-process (`publishDocumentForRun`). Retrieval stays in-process against the corpus.

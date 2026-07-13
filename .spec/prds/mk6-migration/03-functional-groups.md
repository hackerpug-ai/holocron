---
stability: FEATURE_SPEC
last_validated: 2026-07-13
prd_version: 1.0.0
---

# Functional Groups

Five groups, sequenced roughly in build order (PLAT → DATA → SVC/INFER → SYNC). Fulcrum-readiness is threaded through SVC/DATA/INFER as acceptance criteria rather than being its own group.

| Group | Prefix | Description |
|-------|--------|-------------|
| Platform Foundation | **PLAT** | Postgres (+pgvector +FTS) and the Mastra/Bun service on the tailnet mini; Drizzle; the scheduler/queue (Mastra `schedule` + pg-boss); deployment (launchd, dev/prod parity); observability (Langfuse + OTel) and the budget ledger. The metal everything else runs on. |
| Data Layer & ETL Migration | **DATA** | The Postgres schema for all current domains + the evidence-graph substrate; local re-embedding; passage chunking + contextual embeddings; hybrid search (pgvector + FTS + RRF); file storage; and the one-time big-bang `convex export`→Postgres ETL with validation gates. |
| Backend Services & Mission Engine | **SVC** | The declarative Mission Engine (durable/resumable/steerable/approvable Mastra workflows); every agentic pipeline re-expressed as a template/agent; the chat redesign (native tool loop + SSE); the MCP gateway rehost; and the public `/article/` endpoint. Delivers the fulcrum integration seams. |
| Local Inference & Research Engine | **INFER** | The model role router and local-first-everywhere policy; the budgeted Claude escape hatch + degraded modes; structured/constrained output on local models; and the pi-free research engine with a deterministic evidence gate. |
| Client Sync, Cutover & Decommission | **SYNC** | Zero (Rocicorp) integration and the RN app rewrite off Convex hooks; the big-bang cutover sequence with verification gates; the rollback plan; and full Convex decommission (code, deps, dead clients, cloud deployment). |

## Use Case Summary

| Group | Prefix | Use Cases |
|-------|--------|-----------|
| Platform Foundation | PLAT | 5 |
| Data Layer & ETL Migration | DATA | 5 |
| Backend Services & Mission Engine | SVC | 5 |
| Local Inference & Research Engine | INFER | 5 |
| Client Sync, Cutover & Decommission | SYNC | 5 |
| **Total** | | **25** |

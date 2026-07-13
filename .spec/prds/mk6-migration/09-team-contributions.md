# Team Contributions

This PRD was produced by an orchestrated specialist team rather than the default PM/EM/UID trio, because it is a backend platform migration (no new UI) with a specific target stack the owner chose. The `mastra-*` suite were registered as the project's platform experts (`RULES.md`) and drove the scoping, per the initiative's request.

## Decisions gathered (Operator)

Four architectural forks were resolved with the Operator before scoping:

| Fork | Decision |
|------|----------|
| Mobile data/reactivity layer | **Zero (Rocicorp)** — reactive read+write over Postgres, closest to Convex's `useQuery`/`useMutation` DX (smallest RN rewrite). |
| Inference strategy | **Local-first everywhere** — all ~83 call sites to the fleet; Claude API a budgeted escape hatch only. |
| Embeddings | **Re-embed locally now** (Qwen3-Embedding on the fleet); drop Cohere; dimension is our choice. |
| Cutover | **Big-bang** — build in parallel, one-time ETL, flip, delete Convex. |
| Storage engine (mid-scoping clarification) | **Postgres only — no SQLite.** Fulcrum's ledger moves wholesale to Postgres append-only tables (DB-enforced immutability), retiring the parked `bun:sqlite` Prospector store. |

## Phase 1 — Compute / Agent Platform (mastra-planner)

Scoped the Mastra (Bun) service, the Mission Engine (generalizing fulcrum's cycle into declarative templates), local-fleet wiring, the pi-free research engine, the MCP gateway rehost, and the chat redesign. **Key finding:** fulcrum's tailnet-worker + local-ledger + Convex-orchestrator architecture *collapses* when Mastra + Postgres run on the mini — its 9 components reduce to ~3, and it becomes "just another mission template." Verified the scheduler replacement (Mastra `schedule` + a Postgres queue) and structured-output feasibility on local models. Produced the SVC + INFER acceptance criteria.

## Phase 2 — Data Layer & Migration (Postgres planner)

Scoped the Postgres schema for all 60 domains (collapsing the four business pipelines 12→3 and the two research systems 5→3), the bi-temporal evidence-graph substrate, HNSW + RRF hybrid search, local re-embedding at 1024 dims with a shared `embed()` helper, passage chunking (killing the 8K truncation), blob storage on the mini, and the one-time ETL with validation gates. **Key finding:** this migration invalidates fulcrum's ADR-001/ADR-002 (both premised on Convex-can't-reach-fleet + no-local-embedder). Produced the DATA + PLAT(data) acceptance criteria. *(Its "keep SQLite as fulcrum's write spine" recommendation was overridden by the Operator's Postgres-only decision.)*

## Phase 3 — Convex-Removal Inventory & Cutover (inventory analyst)

Produced the exhaustive completeness backstop: 246 `convex/*.ts` files, 60 tables, 16 crons, 1 Workflow component, 1 public `/article/` endpoint, 44 MCP tools over 62 stringly-typed refs, ~105 app hook call-sites across ~47 files, 11 backup files, two dead Python/CLI clients, and the full dependency/env inventory. Delivered the big-bang cutover sequence, the rollback plan, the e2e/infra reality gate, and the SYNC acceptance criteria. Flagged a live stub (`convex/db/agentActivity.ts`) not to carry forward.

## Synthesis (orchestrator)

Reconciled the three reports with the Operator's decisions into this PRD, arbitrating the storage-engine question (Postgres-only) and threading fulcrum-readiness through SVC/DATA/INFER as acceptance criteria rather than a separate group.

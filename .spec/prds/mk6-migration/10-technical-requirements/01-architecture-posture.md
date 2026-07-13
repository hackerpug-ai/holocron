---
stability: CONSTITUTION
last_validated: 2026-07-13
prd_version: 2.0.0
---

# Architecture Posture

The load-bearing stances for the MK-VI platform migration. These are the decisions everything else derives from.

## AP-1 — One store on the metal: Postgres only, no SQLite

**Postgres, self-hosted on the tailnet mini, is the single source of truth and the single durable ledger.** There is no second store. Fulcrum's ledger does **not** retain the parked `bun:sqlite` Prospector database — it moves wholesale to **Postgres append-only tables** whose direct `UPDATE`/`DELETE` access is denied to application roles. The sole temporal-revision transaction may lock the expected-current belief, set only its `tx_to`, insert its successor, and record actor/run/idempotency metadata atomically; all other direct mutation is rejected. Postgres transactions give the same kill-9 all-or-nothing commit and immutability the SQLite ledger promised, in one store, with no split-brain and no cross-store reconciliation. This is the Operator's explicit decision and it supersedes the data-layer recommendation to keep SQLite as a write spine.

## AP-2 — Mastra on the mini deletes the constraint that shaped fulcrum

The single justification for fulcrum's tailnet-worker + local-ledger + Convex-publish design was *"Convex actions run in a cloud runtime that cannot reach tailnet-local inference."* When the Mastra service and Postgres both run **on the mini**, with the fleet reachable over Tailscale, that constraint evaporates. Fulcrum's worker/orchestrator split, its local ledger, and its cross-machine publish hop all collapse into the shared platform. **Fulcrum becomes one standing mission template.** This is why the migration must *precede and contain* fulcrum, and why fulcrum's ADR-001/ADR-002 are retired by this PRD.

## AP-3 — The deterministic/agentic seam is absolute

Anything that must *always* happen is deterministic code, never a model decision: scheduling, gate admission, budget ceilings, human-gate enforcement, degraded-mode fallback, commit atomicity. In particular the **research termination and claim-admission gate contains no LLM call** — it replaces the reward-hackable `coverage>=4 && confidence>=70` with a pure-TS evidence predicate. Models generate and challenge; deterministic code decides.

## AP-4 — Local-first everywhere, default-deny escape

Every reasoning call names a **role** (`divergent`/`convergent`/`judge`/`embed`/`rerank`), never a provider, and resolves to the local fleet via LiteLLM. The Claude API is reachable only when a step explicitly declares `highStakes`/`allowEscape` **and** a deterministic budget-ledger pre-check passes. Default is deny. Fleet-unreachable produces a **defined degraded mode**, never a silent cloud fallback. This makes local-first a structural property, not per-call discipline.

## AP-5 — One engine, many templates

Every agentic pipeline (chat, research, whatsNew, assimilate, shop, subscriptions, the four business pipelines, and later fulcrum) is an instance of one **Mission Engine** — a declarative template compiled to a durable, resumable Mastra workflow with Postgres run-state. There are no per-domain copy-pasted modules. This is what lets 246 backend files and 60 tables collapse.

## AP-6 — Big-bang cutover, rollbackable only while read-only

The cutover is decisive: build in parallel, durably freeze Convex writes, one-time ETL, flip, verify, enable writes, then delete Convex. The flipped stack first enters a **rollbackable read-only soak**: app, MCP, upload, scheduled-job, and mission-commit writes return a documented `migration_read_only` outcome. During that window Convex remains the rollback target because no post-export production writes exist. The **first accepted production write on Postgres** is the data-plane point of no return; subsequent recovery is Postgres/blob restore, not Convex rollback. Convex deletion is a later source-destruction step gated on fresh recovery evidence.

## AP-7 — The tailnet is the security boundary

Per project rule (`RULES.md`): this is a personal, never-published, single-user app. **No RLS and no multi-tenant isolation.** Tailscale ACLs plus scoped API keys are the trust boundary: health/readiness is tailnet-only; `/api/*`, `/blobs/:id`, and `/mcp` require tailnet reachability plus their declared key scope. The one exception is the public `/article/{shareToken}` endpoint and its article-scoped asset route, which are explicitly and narrowly exposed while everything else stays tailnet-only.

## AP-8 — Behavior-preserving migration

This is a platform swap, not a redesign. The app's screens and the 44 MCP tool semantics stay behaviorally identical; only the runtime beneath them changes. New capability (chunked retrieval, streaming, evals, the evidence graph) is additive and does not alter existing surface contracts. Existing share links must survive byte-compatibly.

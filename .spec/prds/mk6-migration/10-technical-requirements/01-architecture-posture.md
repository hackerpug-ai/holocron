---
stability: CONSTITUTION
last_validated: 2026-07-13
prd_version: 1.0.0
---

# Architecture Posture

The load-bearing stances for the MK-VI platform migration. These are the decisions everything else derives from.

## AP-1 — One store on the metal: Postgres only, no SQLite

**Postgres, self-hosted on the tailnet mini, is the single source of truth and the single durable ledger.** There is no second store. Fulcrum's ledger does **not** retain the parked `bun:sqlite` Prospector database — it moves wholesale to **Postgres append-only tables** whose immutability is enforced at the database level (triggers / `REVOKE UPDATE, DELETE`, unique `content_hash` / idempotency keys). Postgres transactions give the same kill-9 all-or-nothing commit and immutability the SQLite ledger promised, in one store, with no split-brain and no cross-store reconciliation. This is the Operator's explicit decision and it supersedes the data-layer recommendation to keep SQLite as a write spine.

## AP-2 — Mastra on the mini deletes the constraint that shaped fulcrum

The single justification for fulcrum's tailnet-worker + local-ledger + Convex-publish design was *"Convex actions run in a cloud runtime that cannot reach tailnet-local inference."* When the Mastra service and Postgres both run **on the mini**, with the fleet reachable over Tailscale, that constraint evaporates. Fulcrum's worker/orchestrator split, its local ledger, and its cross-machine publish hop all collapse into the shared platform. **Fulcrum becomes one standing mission template.** This is why the migration must *precede and contain* fulcrum, and why fulcrum's ADR-001/ADR-002 are retired by this PRD.

## AP-3 — The deterministic/agentic seam is absolute

Anything that must *always* happen is deterministic code, never a model decision: scheduling, gate admission, budget ceilings, human-gate enforcement, degraded-mode fallback, commit atomicity. In particular the **research termination and claim-admission gate contains no LLM call** — it replaces the reward-hackable `coverage>=4 && confidence>=70` with a pure-TS evidence predicate. Models generate and challenge; deterministic code decides.

## AP-4 — Local-first everywhere, default-deny escape

Every reasoning call names a **role** (`divergent`/`convergent`/`judge`/`embed`/`rerank`), never a provider, and resolves to the local fleet via LiteLLM. The Claude API is reachable only when a step explicitly declares `highStakes`/`allowEscape` **and** a deterministic budget-ledger pre-check passes. Default is deny. Fleet-unreachable produces a **defined degraded mode**, never a silent cloud fallback. This makes local-first a structural property, not per-call discipline.

## AP-5 — One engine, many templates

Every agentic pipeline (chat, research, whatsNew, assimilate, shop, subscriptions, the four business pipelines, and later fulcrum) is an instance of one **Mission Engine** — a declarative template compiled to a durable, resumable Mastra workflow with Postgres run-state. There are no per-domain copy-pasted modules. This is what lets 246 backend files and 60 tables collapse.

## AP-6 — Big-bang cutover, but never dark

The cutover is decisive: build in parallel, freeze, one-time ETL, flip, verify, delete Convex. But the Convex deployment stays live and deletable through a soak window (the rollback path), and its deletion is the single explicit point of no return, taken only after real-service gates pass.

## AP-7 — The tailnet is the security boundary

Per project rule (`RULES.md`): this is a personal, never-published, single-user app. **No RLS, no multi-tenant isolation, no app-level auth.** Tailscale ACLs + API keys are the entire trust boundary. The one exception is the public `/article/{shareToken}` endpoint — the single unauthenticated egress — which must be explicitly and narrowly exposed (Tailscale Funnel / reverse proxy) while everything else stays tailnet-only.

## AP-8 — Behavior-preserving migration

This is a platform swap, not a redesign. The app's screens and the 44 MCP tool semantics stay behaviorally identical; only the runtime beneath them changes. New capability (chunked retrieval, streaming, evals, the evidence graph) is additive and does not alter existing surface contracts. Existing share links must survive byte-compatibly.

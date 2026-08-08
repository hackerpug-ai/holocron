---
stability: FEATURE_SPEC
last_validated: 2026-07-13
prd_version: 3.0.0
scope_posture: full
---

# Scope

**Scope Posture:** Full feature (default). This is a complete, decisive platform migration — the Convex runtime and database are fully removed, not partially wrapped.

## In Scope

### Platform (PLAT)
- Self-hosted **Postgres** (with `pgvector` + native full-text search) on the tailnet mini, reachable over Tailscale; **no RLS, no multi-tenant** (see Out of Scope rationale).
- A single **Mastra 1.x service on Bun** (agents, tools, workflows, processors, Hono HTTP + SSE surface) running on the mini.
- **Drizzle ORM** schema and migrations as the typed data layer.
- **Scheduler/queue**: Mastra native scheduled workflows for cadence + **pg-boss** (Postgres-backed) for leased/retried at-least-once work with exactly-once observable effects — together replacing all 16 Convex crons and the `scheduler.runAfter` chaining.
- **Deployment**: launchd/service definitions to run Postgres + Mastra headless on the mini; dev-on-laptop, prod-on-mini parity.
- **Observability**: Langfuse (self-host) + OTel tracing, an inference-telemetry stream, and the escape-hatch **budget ledger**.
- A **runtime compatibility lock** and fleet-role manifest that fail closed when the real Bun/Mastra/Postgres/fleet combination is not proven compatible.
- **Remote backup & disaster recovery**: continuous Postgres WAL archiving + scheduled base backups, plus a scheduled blob-storage mirror, to an off-mini remote object-storage bucket — a **standing operational capability** (not just the migration-cutover safety net) so a local hardware failure, theft, or destruction of the mini does not cause data loss, with failure/overdue alerting and a periodic real restore drill proving recoverability onto fresh hardware.

### Data (DATA)
- **Postgres schema** for all current domains (the 60 Convex tables), collapsing known duplication (the four business pipelines → one; the two research systems → one).
- The **evidence-graph substrate** (sources → passages → claims → entities → relations → beliefs, with supports/contradicts edges and bi-temporal validity) added now as fulcrum's ledger, append-only and DB-enforced.
- **Local re-embedding** of the corpus (Qwen3-Embedding on the fleet), dropping Cohere; **hybrid search on Postgres** (pgvector KNN + FTS, fused with RRF in the app), replacing Convex `hybridSearch`.
- **Passage-level chunking + contextual embeddings**, killing the 8,000-char whole-document truncation.
- **Full file lifecycle**: migrate every retained Convex-storage object, preserve hash/ownership/disposition evidence, and support new image and voice uploads through Hono-backed content-addressed storage.
- The **one-time big-bang ETL** (`convex export` → transform → Postgres load) with referential-integrity + row-count validation gates and vector regeneration.

### Services & Mission Engine (SVC)
- A **Mission Engine**: declarative mission templates (goal, trigger, stage graph, tool grants, model-role bindings, budgets, gate rubric, human-gate, output contract) instantiated as Mastra workflows with Postgres run-state (durable, resumable, steerable, approvable).
- **All agentic pipelines re-expressed as templates/agents**: chat (triage→specialists→tool loop redesigned as a Mastra agent with native in-SDK tool use + SSE streaming), research, deepResearch, whatsNew, assimilate, shop, subscriptions, and the four business pipelines (whose reasoning re-homes from client-side Claude skills to the local fleet).
- **MCP gateway rehost**: the existing 44-tool `@mastra/mcp` server calls in-process Mastra tools (no `convex/browser` proxy, no stringly-typed refs), with manifest-backed stdio and Streamable HTTP compatibility pinned to MCP 2025-11-25.
- The public **`/article/{shareToken}`** endpoint re-hosted on Hono (converter ported verbatim, path/token compatible so existing links survive).

### Inference (INFER)
- A **model role router** (`divergent`/`convergent`/`judge`/`embed`/`rerank`) over LiteLLM; **local-first everywhere** — all 83 call sites route to the fleet by default.
- The **Claude API escape hatch**: default-deny, requires an explicit high-stakes flag + a budget-ledger pre-check + telemetry; a **defined degraded mode** when the fleet is unreachable (never a silent cloud fallback).
- **Structured/constrained output** on local models (json_schema → constrained decode → Zod re-validation → bounded repair loop → explicit fail).
- The **pi-free research engine**: Mastra-native multi-phase research terminating on a **deterministic evidence gate** (not LLM confidence), with ASSAY and CHALLENGE on distinct model instances.

### Sync, Cutover & Decommission (SYNC)
- **Zero (Rocicorp)** integration (logical replication, uuid keys) and the **RN app rewrite** from Convex hooks (~105 call-sites across ~47 files; `ConvexProvider`→Zero provider) to Zero reactive hooks + SSE for live tokens, with an explicit mutation/offline/conflict contract.
- The **big-bang cutover**: parallel build → durable write freeze → ETL → flip app + MCP into a rollbackable read-only soak → verification gates → enable writes (data-plane point of no return) → **decommission** (delete `convex/`, the Convex deps, `python/` + `cli/`, and the Convex cloud deployment).
- A **rollback and recovery plan**: config rollback only during the read-only soak; encrypted Postgres/blob recovery after the first accepted production write; a fresh restore drill before Convex deletion.
- A **real-service integration harness** (real Postgres + real Mastra + real fleet) plus provisioned **Maestro on an iOS Simulator Expo development build** for RN E2E (the human-testing-gate substrate that does not exist today).

### Fulcrum readiness (threaded through, not a separate group)
- The Mission Engine API, the evidence-graph schema, and the fleet role bindings that let **fulcrum become one standing mission template** are delivered here as acceptance criteria (in SVC/DATA/INFER). Fulcrum's own cycle logic, weights, and UI remain its own PRD.

## Out of Scope

- **Fulcrum's own mission logic, weights, human-gate policy, and UI** — that is `.spec/prds/fulcrum/`, built *within* and *after* this platform. This PRD only guarantees the seams. `[DEFERRED: separate PRD — fulcrum]`
- **RLS, multi-tenant isolation, and production auth hardening.** Per `RULES.md` this is a personal, never-published app; Tailscale ACLs + API keys are the entire trust boundary. Explicitly excluded.
- **App-store publication / release engineering** beyond the existing EAS build channels.
- **New product features or UI redesigns.** Screens and MCP tool semantics stay behaviorally identical; only the data/compute layer changes.
- **Self-hosting Convex.** Considered and rejected — the goal is to leave Convex, not relocate it. `[DEFERRED: rejected]`
- **Live failover / a hot standby second node.** This migration delivers backup + restore-ability, not active-active redundancy or automatic failover to a second live node. `[DEFERRED: future hardening]`
- **The later MK-VI phases** — the 6-tool Gatekeeper meta-surface, nightly consolidation, the morning-briefing podcast, fleet-transcript ingestion, Sith-mode. `[DEFERRED: separate PRD — MK-VI Phase 2+]`
- **Fleet hardware/topology changes** (exo RDMA pooling, a third mini). The fleet is consumed as-is.
- **Voice-assistant re-platforming** beyond porting its data layer (including its session lifecycle, cancellation, and degraded-state handling); OpenAI Realtime stays as an optional premium path.

### Added 2026-08-07 — exclusions determined during Sprint 31 remediation planning

The dispatched specialist SET reviewed every finding of the sprints 1–29 integrity audit against this scope document. The following were judged **drift from the migration's goal** and are recorded here rather than becoming sprint work. Each names the specialist that made the call.

- **Agent guardrail processor hardening** — prompt-injection detection, content moderation, PII redaction, cost ceilings, system-prompt scrubbing — beyond the single processor needed to make UC-SVC-03's typed `blocked` outcome fire. The tailnet is single-operator and the only prompt author is the operator, so adversarial-input guardrails have no threat model here. `[DEFERRED: future hardening — revisit if any surface is exposed beyond the tailnet]` *(mastra-planner)*
- **Live market-data sourcing for the four business pipelines.** The business-pipeline commitment above is that their *reasoning re-homes from client-side Claude skills to the local fleet* — a compute-location change, not a data-sourcing change. Market sizing and DVF inputs remain operator-supplied or scaffolded. `[DEFERRED: separate PRD]` *(mastra-planner — note this is deliberately treated differently from whatsNew/assimilate/shop, whose Convex versions fetched real sources and whose scaffolding is therefore a behavioural regression that IS in scope)*
- **Operator-convenience CLI state persistence.** Ephemeral CLI status caches (e.g. `extract:status`) are not part of the Postgres data-layer migration; only durable domain data listed in the source catalog moves to Postgres. `[DEFERRED: not a migration obligation]` *(mastra-planner)*
- **Repository branch-protection or mandatory-PR-review workflow changes.** This migration delivers the technical CI/integration harness the gates run against (UC-PLAT-04); how commits land (direct-push-to-main vs. PR review) is an existing engineering-process choice this PRD does not change. *(devops-engineer)*
- **Provenance-captured MCP fixtures.** The compatibility manifest's success/error/replay fixtures are hand-authored schema exemplars that pin the *shape* of each tool contract; they are not recordings of production traffic and carry no capture provenance. Behavioural parity at cutover is proven by the live 44-tool dual-transport sweep against real Postgres, not by the fixtures. Fixture files referenced by no test are likewise not tracked. `[DEFERRED: no consumer requires provenance]` *(mcp-planner — UC-SVC-04 AC-5 says "frozen", not "captured")*
- **MCP transport rate limiting.** Already covered by the auth-hardening exclusion above; the manifest records `rate_limit: not_applicable` with that citation rather than reading as unfinished work. *(mcp-planner)*
- **Re-baselining the Sprint 21 client-data contract against post-migration source.** `13-client-data-contract.yaml` is the frozen audit record of the Convex→Zero call-site mapping; its line coordinates are historical and are not maintained against live source. Post-migration Convex-residue authority is `holo verify:no-convex-client`. `[DEFERRED: frozen historical artifact]` *(react-native-ui-planner)*
- **Maintaining Convex-discovery tooling past decommission.** `holo inventory:convex-callsites` is retired in Sprint 31; `holo verify:no-convex-client` is the single Convex-residue authority for the RN client. `[DEFERRED: rejected — superseded]` *(react-native-ui-planner)*
- **Network-quality optimization of the client SSE transport** (adaptive backoff curves, jitter, connection-quality heuristics). The migration delivers a bounded, terminating reconnect state machine; retry-curve tuning is post-migration hardening. `[DEFERRED: future hardening]` *(react-native-ui-planner)*
- **Offline-first client architecture.** Zero-cache is a required runtime dependency of the RN app. The migration delivers representable, terminal error states when it is unreachable, not continued operation without it. `[DEFERRED: future hardening]` *(react-native-ui-planner)*
- **Error-state and connectivity UX design.** Failure paths introduced during the migration render through surfaces that already exist (the chat degraded banner, the research error branch). No new error components, illustrations, or retry affordances are in scope. `[DEFERRED: separate PRD — MK-VI Phase 2+]` *(frontend-designer + react-native-ui-planner — this is the guardrail that keeps the deadline/error-state work on the correct side of the "no UI redesigns" line)*
- **Re-executing the one-time ETL.** The ETL ran once, in Sprint 29, against a real `convex export` with surviving committed evidence. Remediating earlier false gate records is truthful restatement plus re-verification against the retained immutable archive — never a second production load. `[DEFERRED: rejected]` *(convex-planner)*
- **A permanently FK-constrained domain schema.** Referential integrity is proven by applying and validating the catalog-derived constraint set at migration-validation time; extending enforcement to every domain table thereafter is future hardening with real consequences for Zero logical replication and pg-boss delete ordering. `[DEFERRED: future hardening — Operator decision 2026-08-07]` *(convex-planner)*
- **Stub-rewriting residual `convex/` modules.** Deletion supersedes stubbing. `verify:no-shells` scopes only to modules with a live platform counterpart; whole-directory coverage is provided by the Sprint 31 decommission inventory. *(convex-planner)*
- **Restoring writes to the Convex deployment (a `cutover:thaw`).** The Convex write fence is one-way by design. No operator command lifts `HOLO_MIGRATION_READ_ONLY` on the Convex deployment; the only rollback affordance is `cutover:rollback-repoint`, refused once a post-export production write is accepted. Thawing after the point of no return would create a second writable data plane. *(convex-planner — recorded explicitly so the absent thaw is not "fixed" by a future sprint)*

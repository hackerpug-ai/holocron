---
stability: CONSTITUTION
last_validated: 2026-07-13
prd_version: 2.0.0
---

# Architecture Decision Records

> **v2.0.0 re-platform (2026-07-13).** Fulcrum is now sequenced **after** the MK-VI Platform Migration ([`../../mk6-migration/README.md`](../../mk6-migration/README.md)), which delivers the Mastra (Bun) + Postgres + local-fleet platform on the mini. That platform retires the two premises Fulcrum v1.0.1 was built around — "Convex cloud cannot reach local inference" and "Cohere owns the 1024-dim embedding contract." **ADR-001 and ADR-002 are SUPERSEDED** (by ADR-004 / ADR-005 below); **ADR-003 is AFFIRMED** (strengthened); three new ADRs (004–006) record the re-platform. The detailed TR sections 01–09 still describe the v1.0.1 SQLite / tailnet-worker architecture and each carries a `⚠️ Re-platform pending` banner until re-derived against the mk6 platform in a follow-on `--edit` / sprint-plan pass. The ADRs in this file are the **current** load-bearing decisions.

## Status summary

| ADR | Decision | Status |
|-----|----------|--------|
| ADR-001 | Ledger of record is LOCAL `bun:sqlite` | **SUPERSEDED** by ADR-004 |
| ADR-002 | Publish through Cohere 1024-dim embeddings | **SUPERSEDED** by ADR-005 |
| ADR-003 | Reuse holocron's research *design*, re-implement execution | **AFFIRMED** (execution target is now the Mission Engine) |
| ADR-004 | Ledger of record is Postgres append-only tables on the Mission Engine | **ACTIVE** (v2.0.0) |
| ADR-005 | Embeddings are local Qwen3-Embedding 1024-dim via the mk6 platform | **ACTIVE** (v2.0.0) |
| ADR-006 | Fulcrum is a standing Mission Engine template, not a sidecar worker | **ACTIVE** (v2.0.0) |

---

## ADR-001 — ~~The loop's ledger of record is LOCAL (bun:sqlite), not Convex tables~~ ❌ SUPERSEDED

> **SUPERSEDED 2026-07-13 by ADR-004.** This ADR was correct *against the Convex platform*: it established that Convex's cloud runtime cannot host a long-lived local-inference worker, so the ledger had to live off-Convex in `bun:sqlite`. The MK-VI migration removes that constraint by moving the entire backend onto the mini (Mastra + Postgres), making a separate sidecar SQLite ledger redundant. The original text is retained below as the historical rationale for the boundary Fulcrum v1.0.1 drew.

**Context (v1.0.1).** The v1.0.0 draft placed the evidence ledger in Convex tables with the tailnet worker calling back over the network for every gate/score/commit. The mapping pass established three facts that make that the wrong default:
1. **Convex actions cannot reach tailnet-local inference** (verified: all research inference runs in Convex-cloud actions through `convex/lib/ai/anthropic_provider.ts` → Anthropic cloud; no `baseURL` seam, no network route from Convex cloud to `laptop:4545`/`inference1/2`). Local inference *forces* an on-machine process.
2. **Convex actions have execution-time limits** suited to "schedule the next cycle" (`ctx.scheduler.runAfter`), not to hosting a long-lived worker that holds a local-model connection.
3. A **SQLite evidence-ledger core already exists and passes tests** — the parked Prospector work (`idea-factory` branch `task/prospector-schema`, 31/37 ACs green; blueprint `idea-factory/.spec/prospector/blueprint-schema-ledger-v1.1.md`). Rebuilding it as Convex tables discards working code.

**Decision (v1.0.1 — superseded).** The Fulcrum loop is an on-machine/tailnet process whose **durable ledger of record is a local `bun:sqlite` database** (the Prospector v1.1 schema). Holocron/Convex is the **publish + search substrate**, not the loop's spine. The worker runs the full cycle locally — local inference + local gate + local commit — and pushes *published findings* to holocron over HTTPS.

**Consequences (v1.0.1).**
- Fulcrum reuses the parked Prospector SQLite ledger core instead of re-implementing it. The `fulcrum*` schema in `03-data-schema.md` is the **local SQLite** schema (the Prospector blueprint), not Convex tables.
- The loop runs even when Convex is unreachable (findings queue for publish). Its determinism and durability guarantees are the SQLite ones already blueprinted (WAL, idempotent commit, kill-9 all-or-nothing) — not Convex's.
- Convex's role shrinks to: receive published documents (searchable knowledge), and optionally mirror a lightweight run/leaderboard state for app visibility.
- **North star unchanged**: when holocron self-hosts Convex on the Mac minis (tailnet-resident), the local ledger and Convex can co-locate; the publish hop becomes local. No redesign — the boundary just shortens. *(This north star is now delivered differently by mk6 — see ADR-004/ADR-006.)*

---

## ADR-002 — ~~Publishing must honor holocron's 1024-dim Cohere embedding contract~~ ❌ SUPERSEDED

> **SUPERSEDED 2026-07-13 by ADR-005.** mk6 re-embeds the entire corpus locally with Qwen3-Embedding (1024-dim) and drops Cohere, so Fulcrum inherits a local embedder from the platform rather than routing publish-time embeddings through Cohere cloud. Original text retained below.

**Context (v1.0.1).** Every holocron vector index — `documents`, `deepResearchIterations`, `researchFindings`, `subscriptionContent`, and others — is hard-coded to **1024 dimensions**, produced by **Cohere `embed-english-v3.0` (cloud)** via `convex/lib/ai/embeddings_provider.ts`. This is the sneakiest coupling: a "local inference for all research" reading might assume embeddings also go local, but the local fleet (`~/models/RULES.md`) serves *coder* models, not a 1024-dim embedder.

**Decision (v1.0.1 — superseded).** For MVP, **published findings embed through holocron's existing Cohere path** (`documents/storage:createWithEmbedding`) — embeddings stay cloud, are 1024-dim, and remain compatible with holocron search. Fulcrum's *reasoning* inference is local (the mandate); its *publish-time embedding* is holocron's existing concern, unchanged.

**Consequences (v1.0.1).**
- The local mandate (ADR-001) covers the cycle's generative/analytic inference. Embedding is explicitly out of the local mandate for MVP and noted as such, so "all research local" is honestly scoped to reasoning, not vectorization.
- Going fully local later requires a **1024-dim local embedding model** (or a schema migration of every vector index). Tracked as a risk (R11), not attempted in MVP. *(R11 is retired by mk6 — see ADR-005.)*
- Fulcrum's *internal* dedup/near-dup (SENSE query dedup, provenance) uses its own local mechanism (content hash for MVP; local embeddings later) and does **not** touch holocron's 1024-dim indexes.

---

## ADR-003 — Reuse holocron's research *design*, re-implement its *execution* locally ✅ AFFIRMED

> **AFFIRMED in v2.0.0.** The decision is unchanged and is in fact strengthened: the *execution target* moves from "a standalone local worker" to "the mk6 Mission Engine," but the core move — mine the design, re-implement the execution, replace LLM-confidence termination with the deterministic gate — is exactly right.

**Context.** Holocron already has (a) a working "Ralph loop" (`convex/research/actions.ts`, a `while` loop terminating on `coverage ≥ 4 && confidence ≥ 70`), (b) a mature 5-factor confidence + citation model (`researchFindings`, `citations` in `convex/schema.ts`), and (c) an unimplemented refactor spec (`.spec/research-loop-improvement-plan.md`) proposing exactly a phase state machine with pluggable termination strategies. Reusing the Convex *execution* directly would route inference back to Anthropic cloud (defeating the mandate).

**Decision.** Mine holocron's research **design** — the phase decomposition, the 5-factor source-credibility signals (fold into the domain-tier + grade model), the citation model, the improvement-plan state machine — but **re-implement execution as a Mastra mission workflow on the mk6 platform**. Replace the LLM-confidence termination with the deterministic evidence gate (the whole point). Leave holocron's on-demand path (`startSmartResearch`) untouched and running.

**Consequences.**
- `.spec/research-loop-improvement-plan.md` is a primary input to the CYC cycle-engine sprint (it is nearly a Fulcrum cycle spec already).
- Holocron's 5-factor confidence (`sourceCredibilityScore`, `evidenceQualityScore`, `corroborationScore`, `recencyScore`, `expertConsensusScore`) informs the tier ladder and recency model but does **not** become the score — the deterministic gate does. This avoids importing the LLM-judged confidence as a score input.
- No fork of `convex/research/`; Fulcrum is a new mission template that publishes into the same `documents` store the existing pipeline uses.

---

## ADR-004 — Ledger of record is Postgres append-only tables on the Mission Engine (mk6) 🆕 ACTIVE

**Context.** The MK-VI Platform Migration ([`../../mk6-migration/README.md`](../../mk6-migration/README.md)) replaces all 60 Convex tables with **Postgres** co-located with the Mastra service on the mini, and generalizes Fulcrum's `SENSE→GENERATE→ASSAY→CHALLENGE→MAP→COMMIT` cycle into a declarative **mission-template** model (Mastra workflows + Postgres run-state). mk6's locked decision: *"Postgres only — no SQLite (fulcrum's ledger → Postgres append-only tables)."* The v1.0.1 reason for a separate `bun:sqlite` ledger (ADR-001) — that Convex's cloud runtime forced the loop off-platform — no longer holds: the backend now runs where the inference runs.

**Decision.** Fulcrum's evidence ledger (evidence objects, claims, claim↔evidence bindings, scores, lineage, cycle log, verdicts, touches) is a set of **append-only Postgres tables on the mk6 platform**, owned by the Fulcrum mission template — not a sidecar `bun:sqlite` database. The ledger's deterministic guarantees (append-only / no UPDATE-DELETE, idempotent commit keys, all-or-nothing cycles) are enforced at the Postgres layer (append-only tables / blocking triggers / one-transaction-per-cycle commit), preserving the exact invariants the Prospector SQLite blueprint provided. The Prospector v1.1 **schema and logic** are reused; the **storage engine** swaps SQLite → Postgres.

**Consequences.**
- The tailnet-resident sidecar worker and its `bun:sqlite` database are **deleted from the design** — Fulcrum collapses into the shared Mastra service as a standing mission template (see ADR-006).
- The loop becomes Zero-reactive: the RN app observes ledger/run state directly (Postgres via Zero) instead of through a lightweight Convex mirror. The previously-deferred in-app Fulcrum UI becomes near-free.
- WAL / idempotent-commit guarantees become Postgres transactional guarantees; the kill-9 all-or-nothing cycle property is preserved by committing one cycle per transaction under an idempotency key.
- The `03-data-schema.md` SQLite DDL is **pending re-derive** as Postgres DDL against the mk6 substrate schema (banner applied); the entity model and invariants are unchanged.

---

## ADR-005 — Embeddings are local Qwen3-Embedding 1024-dim via the mk6 platform 🆕 ACTIVE

**Context.** mk6's locked decision: *"Re-embed locally (Qwen3-Embedding, 1024-dim); drop Cohere."* All holocron vector indexes are re-embedded to 1024-dim local Qwen3 vectors served from the fleet. The v1.0.1 concern (ADR-002) — that "local inference for all research" did not honestly cover embeddings because the fleet served coder models, not a 1024-dim embedder — is resolved by mk6 provisioning exactly that embedder.

**Decision.** Fulcrum's published findings (and any internal semantic dedup/provenance that wants embeddings) use the **mk6 platform's local Qwen3-Embedding (1024-dim)** path — the same path every other holocron surface uses post-migration. No Cohere, no cloud embedding hop. The dimensionality match (1024) means no schema migration is forced by Fulcrum.

**Consequences.**
- "All research local" is now honest end-to-end: reasoning *and* embedding both run on owned silicon.
- The v1.0.1 risk R11 ("1024-dim local embedder required to go fully local") is **retired** by mk6.
- Internal content-hash provenance (MVP) is unaffected; a later upgrade to semantic near-dup clustering uses the platform embedder directly.

---

## ADR-006 — Fulcrum is a standing Mission Engine template, not a sidecar worker 🆕 ACTIVE

**Context.** ADR-001's consequence was a *separate* tailnet-resident worker process that owned the loop and pushed findings to Convex over HTTPS. With the backend on the mini (mk6), there is no cloud runtime to work around and no HTTPS publish hop.

**Decision.** Fulcrum is implemented as **one mission template registered with the mk6 Mission Engine** — a declarative instance of the generalized `SENSE→GENERATE→ASSAY→CHALLENGE→MAP→COMMIT` model mk6 delivers. It runs as a Mastra workflow with Postgres run-state, scheduled by the platform, steered by mission config, and observed via Zero. It is *not* a separate process, package, or sidecar.

**Consequences.**
- Fulcrum's LIS group shrinks: the generic local-inference substrate + role router are **mk6-owned**; Fulcrum contributes only the research-specific role mapping (divergent/convergent), the degradation policy, and per-cycle telemetry that *configure* the platform's router for this mission. (Functional-group UC wording is unchanged by this update; the overlap is noted in scope/overview.)
- The "Fulcrum Worker (Bun, tailnet)" e2e surface in the harness constitution is replaced by "Fulcrum mission template (Mastra workflow)" — re-provisioning the harness against the mk6 test rig (banner applied to `09-e2e-testing.md`).
- This is the decision that makes Fulcrum "just another mission template" per mk6's README.

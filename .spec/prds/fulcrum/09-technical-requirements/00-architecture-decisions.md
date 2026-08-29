---
stability: CONSTITUTION
last_validated: 2026-08-20
prd_version: 3.0.0
---

# Architecture Decision Records

> **v3.0.0 lock alignment (2026-08-20).** TR bodies in this folder are current. Fulcrum depends on the **Virtual Device Fleet** ([`~/models/.spec/prds/virtual-device-fleet/`](file:///Users/justinrich/models/.spec/prds/virtual-device-fleet/README.md)) and the live MK-VI platform. **ADR-007** (loopback fleet client, pinned to `inference1` + `inference2`) and **ADR-008** (live role names `divergent` / `convergent` / `embed`; `judge` forbidden) stand. ADR-004/006 are rewritten below so they no longer claim mk6 shipped `SENSE→GENERATE→ASSAY→CHALLENGE→MAP→COMMIT` or a Prospector table port. ADR-001/002 remain SUPERSEDED; their original text is historical. **TR re-derive is a hard gate before `/kb-sprint-plan`.**

> **v2.0.0 re-platform (2026-07-13).** Fulcrum is sequenced **after** the MK-VI Platform Migration ([`../../mk6-migration/README.md`](../../mk6-migration/README.md)), which delivers the Mastra (Bun) + Postgres + local-fleet platform on the mini. That platform retires the two premises Fulcrum v1.0.1 was built around — "Convex cloud cannot reach local inference" and "Cohere owns the 1024-dim embedding contract." **ADR-001 and ADR-002 are SUPERSEDED** (by ADR-004 / ADR-005 below); **ADR-003 is AFFIRMED**. The ADRs in this file are the **current** load-bearing decisions; SUPERSEDED original text is retained as history.

## Status summary

| ADR | Decision | Status |
|-----|----------|--------|
| ADR-001 | Ledger of record is LOCAL `bun:sqlite` | **SUPERSEDED** by ADR-004 |
| ADR-002 | Publish through Cohere 1024-dim embeddings | **SUPERSEDED** by ADR-005 |
| ADR-003 | Reuse holocron's research *design*, re-implement execution | **AFFIRMED** (execution target is now the Mission Engine) |
| ADR-004 | Ledger of record is Postgres append-only tables on the Mission Engine | **ACTIVE** (v2.0.0) |
| ADR-005 | Embeddings are local Qwen3-Embedding 1024-dim via the mk6 platform | **ACTIVE** (v2.0.0) · re-affirmed v3.0.0 — live on both minis |
| ADR-006 | Fulcrum is a standing Mission Engine template, not a sidecar worker | **ACTIVE** (v2.0.0) |
| ADR-007 | Fulcrum consumes inference through the fleet's packaged router on loopback, pinned to `inference1` + `inference2` | **ACTIVE** (v3.0.0) |
| ADR-008 | Fulcrum's model vocabulary is research + embedding; the model↔role binding is swappable, measurable config | **ACTIVE** (v3.0.0) |

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

**Context.** The MK-VI Platform Migration ([`../../mk6-migration/README.md`](../../mk6-migration/README.md)) replaced Convex tables with **Postgres** co-located with the Mastra service on the mini, and shipped an `evidence-research` mission template (`plan → retrieve → extract → assay → challenge → gate → commit`). mk6's locked decision: *"Postgres only — no SQLite."* The v1.0.1 reason for a separate `bun:sqlite` ledger (ADR-001) — that Convex's cloud runtime forced the loop off-platform — no longer holds: the backend now runs where the inference runs. The live evidence graph is already in `packages/platform/src/db/schema/evidence.ts`.

**Decision.** Fulcrum **extends the live Postgres evidence graph** (`sources`, `passages`, `claims`, `entities`, `relations`, `beliefs`) with named Drizzle tables/columns for candidates, `belief_scores` (including `domain_tier_version`), weight versions, domain tiers, touches, and probes. Cycle log is `mission_runs`. Verdicts are `mission_verdicts`. It is **not** a sidecar `bun:sqlite` database and **not** a Prospector schema port (`prospects`, `cycles`, `scores`, `fulcrumCycles` are not created). Deterministic guarantees (append-only / no UPDATE-DELETE, idempotent commit keys, all-or-nothing cycles) are enforced at the Postgres layer: blocking triggers + one transaction per cycle under `mission_runs.idempotency_key`. Prospector is **design input** for Gate arithmetic; it is not the schema.

**Consequences.**
- The tailnet-resident sidecar worker and its `bun:sqlite` database are **deleted from the design** — Fulcrum collapses into the shared Mastra service as a standing mission template (see ADR-006).
- Zero over Postgres exists as a platform capability. A rich in-app Fulcrum UI is a **deferred separate PRD**, not a Fulcrum AC. MVP reads are generated Markdown; MVP writes are CLI.
- WAL / idempotent-commit guarantees become Postgres transactional guarantees; the kill-9 all-or-nothing cycle property is preserved by committing one cycle per transaction under an idempotency key, resumed from `lease_owner`.
- `03-data-schema.md` names the live tables and the new extensions. There is no SQLite DDL to re-derive.

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

**Context.** ADR-001's consequence was a *separate* tailnet-resident worker process that owned the loop and pushed findings to Convex over HTTPS. With the backend on the mini (mk6), there is no cloud runtime to work around and no HTTPS publish hop. mk6 did **not** ship `SENSE→GENERATE→ASSAY→CHALLENGE→MAP→COMMIT`. It shipped `evidence-research`: `plan → retrieve → extract → assay → challenge → gate → commit`. `fulcrum` is already an **alias** of that template (`trigger: on-demand`, `toolGrants: []` today).

**Decision.** Fulcrum is implemented as **that alias, extended**: it keeps the live seven-stage graph, rebinds plan to `convergent` and extract/assay to `divergent`, fills `toolGrants` with named registry tools, and **adds** stages GENERATE and MAP (typed I/O). It still **builds** the work-item selector, scoring (LED), perpetual `fulcrum:cycle` `MIGRATED_JOBS` row (dispatching `mission:execute`), and Markdown briefs/dossiers. It does not inherit those. It runs in the shared Mastra service with Postgres run-state. It is *not* a separate process, package, or sidecar.

**Consequences.**
- Fulcrum's LIS group shrinks: the generic local-inference substrate + role router are **mk6-owned**; Fulcrum contributes only the research-specific role mapping (`divergent` / `convergent` / `embed`), the degradation policy, header-truthful telemetry, and swap-and-measure. `judge` is forbidden.
- The "Fulcrum Worker (Bun, tailnet)" e2e surface is replaced by "Fulcrum mission template (Mastra workflow) against real Postgres + live fleet."
- On-demand `holo fulcrum '<goal>'` already works as the alias. Perpetual operation is a new `MIGRATED_JOBS` row, not a worker tick.

---

## ADR-007 — Fulcrum consumes inference through the fleet's packaged router on loopback 🆕 ACTIVE

**Context.** v2.0.0 assumed Fulcrum configures its own inference endpoint: `FULCRUM_INFERENCE_BASE_URL` = `http://laptop:4545/v1` in dev, "the mini's endpoint" in prod, plus a `FULCRUM_ROLE_MAP` naming models directly. The Virtual Device Fleet initiative makes all three impossible *and* unnecessary:

1. **The router binds loopback only**, as a code invariant with no config key able to widen it. `http://laptop:4545/v1` from another machine is refused by design, so an app-side base URL can only ever be `127.0.0.1`.
2. **A role name means one thing fleet-wide** and a node cannot redefine it. An application naming a *model* re-opens the exact silent-substitution defect the fleet exists to close.
3. **Router backend pools are derived** from per-node capability declarations. Which device serves a role is fleet data, not application data.

**Decision.** Fulcrum consumes inference as an ordinary fleet client: **one loopback endpoint** (`http://127.0.0.1:{router_port}/v1`) on whichever node it runs on, addressing **fleet role names** only. The node hosting Fulcrum runs the fleet's packaged router with `node_set: ["inference1", "inference2"]`, so all Fulcrum reading and processing routes to the two always-on minis and never to the laptop. Fulcrum declares no base URL, no host, no model identifier, and no device.

**Consequences.**
- `FULCRUM_INFERENCE_BASE_URL` and the "dev laptop / prod mini" split are **deleted**. UC-LIS-03 (tailnet worker) was already retired by ADR-006; its residue in the acceptance criteria goes with it.
- **The laptop leaves Fulcrum's dependency set entirely.** A 24/7 loop must not depend on a machine that sleeps. This is the substantive reason for the pin, not tidiness.
- Degradation becomes **per-role, not per-endpoint**. Node health, failover between minis, and cooldown are the router's job; Fulcrum observes only success, the fleet's explicit no-host error naming the role, or a refused loopback connect. **Fulcrum must never answer a no-host error by trying a different role** — that would reintroduce at the application layer the substitution the fleet made unrepresentable at the router.
- Model identity for telemetry and the ASSAY≠CHALLENGE guard is read from the **`x-litellm-model-api-base` and `x-litellm-model-id` response headers** cross-referenced against `GET /model/info` — never from the response body's `model` field, which LiteLLM 1.91.0 rewrites to the requested alias (measured by the fleet initiative 2026-08-17). A body-field check would pass against a live substitution.
- Prerequisite fleet-side edits are recorded in [`06-external-dependencies.md`](./06-external-dependencies.md). They are `fleet.json` edits, not Fulcrum code.

---

## ADR-008 — Fulcrum's model vocabulary is research + embedding; the binding is swappable, measurable config 🆕 ACTIVE

**Context.** v1.0.x and v2.0.0 mapped Fulcrum's two model roles onto the **coder** fleet — convergent → `reviewer` (27B dense coder), divergent → `implementer` (35B-A3B MoE coder) — because that is what the fleet served when Fulcrum was drafted. It was always a workaround, and R1 said so: extraction quality on coder models is unverified for research. The coder roles now leave Fulcrum's vocabulary entirely. The fleet serves a research-class chat model and a 1024-dim embedder, and those are the only models Fulcrum reasons about.

**Decision.** Fulcrum addresses exactly **three** live `FLEET_ROLE_NAMES` and no others:

| Fulcrum phase | Live fleet role | Optional `fleet.json` alias (1:1) | Kind |
|---|---|---|---|
| ASSAY — claim extraction (agent extracts only; admit+score are LED code) | `divergent` | `fulcrum-assay` | chat, research-class |
| SENSE-plan · GENERATE · CHALLENGE | `convergent` | `fulcrum-challenge` | chat, research-class |
| Publish / embed (ADR-005) | `embed` | (served as `qwen3-embedding`) | embedding, 1024-dim |

Aliases, if present, are **not a third vocabulary** — they map 1:1 onto the live names. Fulcrum code addresses `divergent` / `convergent` / `embed`. **`judge` never appears on the Fulcrum path**, the same way coder roles never appear.

The model behind each role is a `fleet.json` edit — digest-protected and identical on every node — never an application setting. This preserves the **ASSAY≠CHALLENGE** invariant (two roles, resolving to two different models) while making the binding swappable and A/B-testable without touching cycle code.

**Recommended default binding** — a reasoned prior, **NOT a measured result**; the first CYC spike measures it:

| Live role | Model | Why |
|---|---|---|
| `divergent` | `Qwen3.8-27B-8bit` | Extraction is a **fidelity** task: the claim's quote must survive a deterministic exact-substring check against the fetch artifact's `normalizedText`. 8-bit preserves exact-token copying where 4-bit degrades it. |
| `convergent` | `Qwen3.5-27B-Claude-4.6-Opus-Distilled-4bit` | Refutation is a **reasoning** task. Opus-distilled post-training targets the "here is why this is wrong" register, and its different lineage is what keeps the critic from inheriting the extractor's blind spots. |

**The binding has a deterministic oracle — model choice is measured, never opined.** The gate already emits objective signals, so no LLM ever grades an LLM, and the `judge` role is never asked to:

- **ASSAY quality = quote-check pass rate** — verified-quote claims ÷ extracted claims, over a **held-out source pack with a minimum claim-attempt floor** (UC-LIS-03, UC-LED-04). A 1/1 run is not a measurement. Pure code.
- **CHALLENGE quality** = the gate-pass rate of its refuting claims, **plus** how often a queued kill-question later yields *admitted* disconfirming evidence (this second signal is an AC, not just ADR prose).

Fulcrum's determinism seam therefore doubles as its own model-selection harness. Swapping either model is a `fleet.json` edit plus a digest re-record, followed by a re-measured number. Gate and score modules contain **no `generateText` and no fleet role**.

**Consequences.**
- `02-roles.md`'s "ASSAY and Challenger must be different models" **survives**, now enforced by live roles `divergent` ≠ `convergent` instead of a coder/coder split.
- **R1 is re-scoped**, not retired: the risk is no longer "coder models may extract badly" but "the default research binding is unmeasured." Its mitigation is now a first-class product capability (the oracle above, with a denominator floor) rather than a hope.
- Both default models already exist on mini disks, so the binding costs no new downloads — only the mirroring recorded in `06-external-dependencies.md`.
- The embedder is not a chat model and is never substituted for one, nor a chat model for it, nor `judge` for either.

# Holocron MK-VI — The Gatekeeper Rewrite

*A ground-up reimagining of holocron: from knowledge base to research organism.*
*Brainstorm, 2026-07-13. Grounded in a full sweep of the current codebase, the fulcrum PRD (v1.0.1 ADRs), and the live deployment.*

---

## The one-sentence pitch

Today holocron is a filing cabinet with a search box and ten hand-built robots standing next to it. MK-VI is a **Gatekeeper**: a living archive running on your own silicon that reads everything you and your agents touch, distills it into evidence-graded beliefs, notices its own gaps and contradictions, dispatches overnight missions to close them, and briefs you every morning on how your worldview changed.

In Star Wars lore a holocron was never a database — it was a crystal with a *Gatekeeper*, an interactive intelligence that taught its contents. The current system has the crystal. The rewrite adds the mind.

---

## Part I — What the current architecture actually is (the audit)

Facts from the sweep, because a rewrite argument should be grounded:

**Scale.** 61 Convex tables, ~56,600 lines across 246 backend files, ~40 domain directories, 44 MCP tools, 27 app routes. A few thousand documents growing ~6/day; average document ~18K chars, hard-capped at 50K.

**Eight structural findings:**

1. **It stores documents, not knowledge.** One whole-document embedding per artifact, generated from only the **first 8,000 chars** (`MAX_LENGTH` in `convex/documents/storage.ts`) — against an 18K-char average. **More than half of a typical document is invisible to semantic search.** No chunking exists anywhere (no chunk tables, no splitters). No entities, no claims, no provenance graph, no contradiction handling, no time model. Hybrid search returns artifacts; it cannot return answers.

2. **Ten pipelines, one shape, hand-copied.** Four "business analysis" pipelines (aiRoi, revenueValidation, competitiveAnalysis, flights) are the same 5-file CRUD+report skeleton ×4 (~2,700 duplicated lines) — and their reasoning doesn't even live in the backend; it lives client-side in Claude skills. Six heavier pipelines (research, deepResearch, assimilate, whatsNew, subscriptions, shop) each hand-roll their own scheduler loop, termination logic, and prompts (only whatsNew uses the `@convex-dev/workflow` component; the rest reinvent it). Approval is reimplemented 4–5 times (plan / step / tool / per-domain); steering exists in exactly one pipeline; `embed()` boilerplate is duplicated in ~14 files; report formatters ×7; status vocabularies are inconsistent (`in_progress` vs `in-progress`). **The marginal cost of a new capability is a new schema + module + MCP tools + screens — that's why 4 features cost 12 tables.**

3. **The best brain is chained to the desk.** Research quality lives in kb-* skills inside Claude Code. Mobile gets a lesser single-shot cloud call — the walkthrough's own roadmap gap #1. Orchestration is a property of the *harness*, not the *system*.

4. **Cloud-metered thinking while owned silicon idles — across five vendors.** 83 LLM call sites, every one Anthropic cloud, including triage, titles, and scoring. Embeddings are Cohere cloud, with the 1024-dim contract hard-coded into all 6 vector indexes (fulcrum ADR-002 flags this as lock-in risk R11). Voice is OpenAI Realtime; TTS is ElevenLabs; podcast STT is Deepgram. Five cloud AI vendors — while inference1/inference2 + the M5 Max sit idle. Fulcrum fixes this for one loop, but at the price of a second source of truth (local SQLite ledger vs Convex, drift risk R12), because **Convex cloud can't reach the tailnet**.

5. **Write-only memory.** Nothing curates knowledge after ingest: no dedup/merge, no staleness model, no contradiction detection, no consolidation, no resurfacing. Taxonomy is flat and untended (41% of recent documents are category "general"). The KB gets bigger, not smarter.

6. **No detective controls.** Quality is enforced at dev-time gates (TDD, red-hat review) but outputs are never scored in production — no evals, no drift detection (roadmap gap #2). Research loops terminate on LLM self-assessed confidence (`coverage >= 4 && confidence >= 70`) — the reward-hackable pattern fulcrum ADR-003 explicitly calls out. Zero token streaming anywhere in the backend (83 buffered `generateText` calls; the UI simulates streaming via reactive row inserts).

7. **The agent surface is 44 doorknobs on a stringly-typed proxy.** The MCP server holds no logic — every tool hardcodes a Convex function path as `"module:fn" as any` (a Convex rename breaks the MCP silently), while 373 lines of Zod re-declare shapes Convex already owns. Dead config (`HOLOCRON_OPENAI_API_KEY` loaded, never used), an orphaned `podcast.ts` tool module, a `search_vector` tool no client can actually feed, and a log line that says "43 tools" when 44 are registered. Agents burn context selecting from 44 flat verbs; nothing composes.

8. **The architecture makes cleanup expensive, so decay accumulates.** Nine committed `.bak`/`.backup` files sit on the highest-churn backend files; legacy `researchSessions` and newer `deepResearchSessions` coexist as two parallel research systems; two abandoned Python surfaces (`python/`, `cli/`) each carry their own hand-rolled Convex HTTP client; six PascalCase `screens/*` are referenced only by their own Storybook stories; two overlapping subscriptions route trees survive an unfinished IA migration; `MessageBubble.tsx` (954 lines) hand-dispatches ~10 card types inline. *(Also flagged during the sweep: `agents.config.json` ships a hardcoded Z.ai API key in git — worth rotating regardless of any rewrite.)*

None of this is an indictment — it's five revs in a month of honest evolution, and the discipline shows (16 TODOs in 56K lines). But the shape is now visible, and it's the wrong shape for what the system wants to become. Fulcrum's PRD is the proof: it had to *leave* the architecture (local ledger, local models, deterministic gates) to build the next thing.

---

## Part II — The reimagined architecture

Five layers. Each is a bold move; together they're one organism.

```
┌─────────────────────────────────────────────────────────────┐
│  L4  METABOLISM   eats · sleeps · dreams · speaks           │
│      universal ingestion → nightly consolidation →          │
│      morning briefing + generated podcast                   │
├─────────────────────────────────────────────────────────────┤
│  L3  GATEKEEPER   one mind, every surface                   │
│      ask / query / ingest / mission / subscribe / feedback  │
│      (6 meta-tools replace 44; same brain on phone & desk)  │
├─────────────────────────────────────────────────────────────┤
│  L2  MISSION ENGINE   one engine, N declarative templates   │
│      SENSE→GENERATE→ASSAY→CHALLENGE→MAP→COMMIT              │
│      on-demand · standing · reactive (self-healing)         │
├─────────────────────────────────────────────────────────────┤
│  L1  SUBSTRATE   temporal evidence graph, one store         │
│      sources → passages → claims → entities → beliefs       │
│      self-hosted Convex on the tailnet                      │
├─────────────────────────────────────────────────────────────┤
│  L0  METAL   your tailnet is the datacenter                 │
│      Cortex runtime on M5 Max + inference1/2                │
│      local models for the grind; frontier for judgment      │
└─────────────────────────────────────────────────────────────┘
```

### L0 — The Metal: your tailnet is the datacenter

Formalize what fulcrum started, for *everything*:

- A **Cortex runtime** — one Bun daemon fleet across the laptop + both minis — runs mission workers, the embedding service, a reranker, ASR (whisper.cpp), TTS, judge models, and consolidation jobs. LiteLLM stays as the model bus, but roles become first-class config: `divergent`, `convergent`, `judge`, `embedder`, `narrator` — hot-swappable per fulcrum's role-map pattern, failing closed when roles that must differ resolve to the same model.
- **Tiered inference economics as policy, not habit.** Local models do the always-on grind: triage, extraction, scoring, drafts, embeddings, dedup. Frontier models (Claude) become a *scarce, budgeted resource* invoked only at declared high-stakes steps — final synthesis, gate-critical judgment, weekly dreaming. Every mission carries a budget ledger (tokens, dollars, minutes). The system runs 24/7 with no metering anxiety.
- **Local embeddings end the 1024 lock-in.** A modern local embedder (bge-m3 / Qwen3-Embedding class) plus a local cross-encoder reranker replaces Cohere. Dimensionality becomes config. At current scale, re-embedding the entire corpus is *one evening of GPU time* — the lock-in fulcrum defers as R11 simply dissolves in a rewrite.
- **Vendor consolidation:** five cloud AI dependencies collapse toward one (Anthropic, for judgment) plus your own metal. ElevenLabs/Deepgram/OpenAI-Realtime become optional premium tiers instead of load-bearing organs.

### L1 — The Substrate: claims, not blobs — one store, on your metal

The most radical change, and the heart of the rewrite:

**The unit of knowledge stops being the document.** The new substrate is a temporal evidence graph:

| Layer | What it is | What it fixes |
|---|---|---|
| **Sources** | Immutable artifacts (articles, transcripts, session logs, PDFs, feed items) with full provenance: URL, fetch time, content hash | Documents stop being the knowledge; they become the *evidence* |
| **Passages** | Chunked spans with **contextual embeddings** (each chunk embedded with a generated document-context prefix) | Kills the 8K truncation; retrieval granularity becomes the paragraph, not the blob |
| **Claims** | Atomic statements distilled by local models, admitted only through a **deterministic evidence gate** with verbatim-quote entailment checks (fulcrum's technique, generalized) | Knowledge becomes queryable, comparable, auditable — every claim traces to exact quotes |
| **Entities** | People, tools, companies, models, repos, topics — typed relations, auto-maintained **dossier pages** | "What do I know about X" gets a real answer surface |
| **Beliefs** | The current evidence-weighted stance on a question, computed from claims, never hand-edited. Carries confidence, `observed-at`, and a **half-life** per domain | Contradiction becomes a first-class event; staleness becomes measurable; "what changed" becomes a diff |

Every claim carries supports/contradicts edges. When new evidence lands against an existing belief, that's a **belief revision event** — surfaced in your feed as a knowledge delta, not silently averaged away. This is a personal-scale temporal knowledge graph crossed with a truth-maintenance system, gated by fulcrum-style deterministic checks so local-model extraction can't hallucinate its way into the graph.

**The storage engine decision — and the answer to two-store drift (R12):**

**Self-host Convex on the Mac minis.** This is fulcrum's own stated north star, promoted from "deferred" to the load-bearing move:

- Workers and database become co-located on the tailnet. The cloud hop disappears; the split brain never forms. Fulcrum's SQLite ledger demotes to what it should be — a per-worker WAL/scratch buffer, not a second source of truth.
- You keep everything that made Convex the right call in V3: the reactivity that powers the RN app, function-as-API, the typed schema, and the dashboard observability that made agents able to debug the system they run on.
- Mobile reach: Tailscale on the phone (already in your world) + an optional thin cloud relay for push notifications.

*Considered and rejected:* SQLite-everywhere with a sync engine (you'd hand-roll the reactivity Convex gives free, and the entire app is Convex-idiomatic), and staying on Convex Cloud with an outbox protocol (viable as a transition — it's literally fulcrum ADR-001 — but it institutionalizes R12 forever).

### L2 — The Mission Engine: one engine, N templates

Generalize fulcrum's cycle into *the* universal compute model:

- **SENSE → GENERATE → ASSAY → CHALLENGE → MAP → COMMIT**, budget-boxed, with a pure-TS evidence gate and **no LLM-confidence termination anywhere** (ADR-003, applied system-wide).
- A mission is a **declarative template** (~50–150 lines): goal, trigger, stage graph, tool grants, model-role bindings, budgets, gate rubric, human-gate definition, output contract. research / deepResearch / assimilate / shop / whatsNew / revenueValidation / competitiveAnalysis / aiRoi / flights / subscription-auto-research all become *templates*, not modules. **61 tables collapse to ~15.**
- Missions are durable (event-sourced, kill-9-safe — the Prospector WAL work, generalized), steerable (steering becomes a universal mission event instead of an assimilate-only feature), approvable (ONE approval system spanning plan/step/tool granularity), and observable (every stage emits telemetry into the eval layer).
- **Three trigger classes:**
  - **On-demand** — chat or MCP, what you have today.
  - **Standing** — fulcrum-style perpetual missions with daily triage briefs (mission #1: dev-revenue, exactly as the PRD specifies).
  - **Reactive** — *fired by the substrate itself*: contradiction detected → verification mission; belief past its half-life → refresh mission; an `ask` that exposed a knowledge gap → gap-fill mission; a new source matching a standing interest → assay mission.

Reactive missions are the boldest capability in the whole proposal: **the knowledge base notices what it doesn't know and dispatches agents overnight, on your own silicon, to find out.** Combined with L1, this is a self-healing epistemic system.

The UI renders missions generically from the template — one MissionScreen, one steering surface, one approval surface, one card renderer driven by the output contract (retiring the 954-line hand-dispatched `MessageBubble`). A new capability ships with zero new screens, zero new tables, zero new MCP tools.

### L3 — The Gatekeeper: kill the 44 tools, ship one mind

- **Agent surface (MCP v2):** six meta-tools replace 44 —
  `ask` · `query` · `ingest` · `mission` · `subscribe` · `feedback`
  `ask` is the crown jewel: an agentic answer engine that plans retrieval over the graph (vectors + FTS + graph walks + reranker), synthesizes an answer with **citations, confidence, and explicitly declared knowledge gaps** — and can offer to open a gap-fill mission on the spot. `query` gives precise structured reads over claims/entities/beliefs. Context cost per harness drops ~10×; capability rises because tools compose. The stringly-typed proxy dies: the MCP surface is generated from the mission/substrate contracts.
- **Human surface: the same mind.** The RN app's chat becomes a Gatekeeper conversation. Today's triage → 10 specialists → 23-case tool switch collapses into the `ask` engine plus mission templates. **Mobile research parity stops being a roadmap item and becomes a structural property** — the phone and the desk invoke the same server-side brain.
- **It knows you.** Reading behavior, per-result feedback, steering history accumulate into a personalization ledger that tunes ranking weights and mission defaults.
- **Sith mode.** Your `research-devils-advocate` agent, productized: an adversarial gatekeeper persona that periodically selects your highest-impact beliefs and runs counter-evidence missions against them. Institutionalized red-teaming of your own worldview.

### L4 — The Metabolism: it eats, it sleeps, it dreams, it speaks

- **Eats — universal ingestion.** One pipeline for every source: fetch → normalize → chunk → distill claims → entity-link → embed → gate → route. Feeds, YouTube transcripts, newsletters, podcasts (all already present) plus papers, GitHub events, browser captures, email-in, share-sheet, voice memos — and the killer new stream: **your own agent-fleet transcripts.** Every night, the assimilator reads the day's Claude Code / codex sessions across all projects and distills what your agents learned, decided, fixed, and shipped into claims linked to repo/tool/model entities. The walkthrough's founding quote is *"agentic dev moves faster than the human ability to keep up."* So point the assimilator at the agents. Holocron becomes the institutional memory of the whole fleet — the thing it was born to be.
- **Sleeps — nightly consolidation on the minis.** Dedup/merge claims; contradiction sweep; staleness decay with refresh-mission dispatch; dossier regeneration; taxonomy tending (no more 41% "general"); **eval scoring of the day's mission outputs** against rubrics (judge = local convergent model) with drift tracking. Roadmap gap #2 stops being a dashboard you'd have to build and becomes physiology the system performs on itself.
- **Dreams — weekly synthesis.** Cross-domain missions hunting structural analogies between unrelated claim clusters — the one place frontier models get free rein (Opus-class dreaming over your graph).
- **Speaks — the morning briefing.** Not a list of links: *belief deltas*. What changed, what got contradicted, what the fleet learned, which missions want approval — rendered as text in the app **and as a two-voice generated podcast** (Gatekeeper + skeptic, NotebookLM-style, synthesized on-metal with local TTS) waiting in your podcast player for the commute. You already own every piece: narration infra, audio jobs, segment caching, the reader. This is their apex.

**The app reorganizes to four surfaces:** **Brief** (deltas, briefing, resurfacing) · **Ask** (Gatekeeper) · **Archive** (dossier wiki + reader) · **Missions** (fleet monitor with steer/approve).

---

## Part III — Ideas worth stealing even if you reject the rest

- **Per-source trust ledger.** Every creator/publication accumulates a track record — claims later confirmed vs contradicted. Your feed reranks by *earned credibility*, not recency. (The subscription scoring system grows a memory.)
- **Prediction ledger / calibration.** Beliefs that imply falsifiable predictions get tracked; when reality resolves them, the system scores its own calibration per domain and per source. Your KB learns how much to trust itself.
- **Context packs.** `ask --pack` emits a portable, token-budgeted bundle (claims + quotes + citations) sized for any harness window — holocron as the context provider for every agent you run, with brain/ skills pulling packs automatically.
- **Knowledge half-life SLA.** Each domain gets a decay rate (LLM-tooling claims rot in weeks; math doesn't). Load-bearing stale beliefs auto-queue re-verification.
- **Voice loop.** The Gatekeeper behind local ASR/TTS — hands-free Q&A in the car against your own graph (the OpenAI Realtime pipe already proves the UX; swap the brain behind it).
- **E2E encryption at rest.** It's your second brain on your own hardware — treat it that way.

---

## Part IV — What survives the rewrite

A rewrite this deep still keeps its spine, because these earned their place:

- **Convex as the framework** — self-hosted. Reactivity, function-as-API, typed schema, the dashboard. The V3 lesson (agents debugging the system through the same surface they use) stays load-bearing.
- **The RN app shell** — reader, narration player, newsfeed components from the recent sprints. They re-skin onto the four surfaces.
- **MCP as the protocol.** The gateway thins to six tools but the posture (agent-best, human-good-enough) is unchanged.
- **The kb-* dev pipeline** — it ships this rewrite like it shipped the last five revs.
- **Fulcrum — not discarded: absorbed.** The PRD's worker, evidence gate, role map, and ledger become Mission Engine v1. MK-VI is fulcrum's architecture promoted from one loop to the whole organism.
- Jina/Exa retrieval, the model fleet, the Tailscale mesh. (Deepgram/ElevenLabs/OpenAI Realtime as optional premium tiers.)

**Explicitly retired:** the two Python client surfaces (`python/`, `cli/` — frozen since March, fully superseded by MCP), the Storybook-only `screens/*`, the duplicate subscriptions route tree, the nine `.bak` files, the legacy `researchSessions` system, and `ratatui-playground` (archive it to its own repo).

---

## Part V — The migration arc (strangler, four phases, never dark)

**Phase 1 — Metal + Substrate.** Stand up self-hosted Convex on the minis. Build the ingestion pipeline: chunking, contextual local embeddings, claim distiller + evidence gate. Backfill the entire existing corpus through it (a weekend of GPU time at current scale). Dual-write bridge from cloud Convex so nothing breaks.

**Phase 2 — Engine.** Implement the Mission Engine by generalizing fulcrum's worker + Prospector ledger (as WAL). Port three pipelines as the first templates: deepResearch, whatsNew, subscription-auto-research. Light up standing mission #1 (dev-revenue). Retire their bespoke modules.

**Phase 3 — Gatekeeper.** Build `ask` over the graph. Ship MCP v2 (six generated tools). Collapse chat triage/specialists into it; the app's chat becomes the Gatekeeper. Fold the four thin business pipelines into templates. Retire ~35 tables and ~38 MCP tools.

**Phase 4 — Metabolism.** Fleet-transcript ingestion. Nightly consolidation + eval physiology. Morning briefing + podcast. Sith mode. Retire the cloud deployment; the organism is home.

Each phase passes a human gate before the next begins — the same discipline that built V1→V5.

---

## Part VI — Why this is the right kind of bold

- It resolves **every** stated roadmap item *structurally* rather than incrementally: mobile parity (L3 — one server-side brain), continuous evals (L4 — consolidation physiology), and open-source readiness (a system with ~15 tables and 6 tools is shareable; 61 and 44 are not).
- It resolves fulcrum's two hardest risks by *construction*: R11 (embedding lock-in → local embedder, config dims) and R12 (two-store drift → one store on the tailnet).
- It converts idle capital (two minis + an M5 Max) into a 24/7 research department with a frontier-model consulting budget.
- And it keeps the soul of the project — the thing you built so you don't miss what's flying past. MK-VI just makes it *look back at you*: notice, verify, challenge, brief.

*"Life moves pretty fast. If you don't stop and look around once in a while, you could miss it."* — the system's job is now to stop and look around **for** you.

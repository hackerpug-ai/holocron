# Holocron MK-VI — Recommended Stack & Emerging-Tech Radar

*Companion to [2026-07-13-holocron-mk6-rewrite-brainstorm.md](./2026-07-13-holocron-mk6-rewrite-brainstorm.md). Every claim below was verified against primary sources (release notes, npm/GitHub, spec changelogs) on 2026-07-13 by four parallel research sweeps: infrastructure, local model fleet, knowledge-graph/retrieval tech, and agent platform.*

---

## The decision table

| Layer | Recommendation | The one-line why |
|---|---|---|
| Store / sync spine | **Self-hosted Convex** (native aarch64 binary, SQLite backing) on inference1 | Near-daily releases, full feature parity incl. vector+FTS+crons+components; keeps the app's reactivity; fulcrum's north star, available today |
| Substrate | **Build the temporal evidence graph natively on Convex** | Nothing in the 2026 market is adoptable in TS (all Python + graph-DB-coupled); BEAM benchmark shows contradiction resolution is *unsolved* — the Beliefs layer is moat, not commodity |
| Trust kernel | **GLiNER (ONNX/TS) → Claimify-style extraction on local models → Bespoke-MiniCheck-7B entailment gate** | Deterministic admission: grammar-constrained emission + a 200ms/check grounding model that beats GPT-4o at verification |
| Retrieval | **Contextual enrichment → Qwen3-Embedding-4B → Convex vector+FTS with app-level RRF → jina-reranker-v3 → PPR graph walks** | The converged 2026 recipe; every piece serves from llama.cpp on your own metal |
| Mission engine | **Mastra 1.x workflows on Bun** + Convex workflow/workpool for backend steps | Already in your MCP server; now stable 1.0 with suspend/resume (human gates), scorers, OTel, MCP+A2A native |
| Model routing | **LiteLLM stays**, roles expand to `divergent/convergent/judge/embed/rerank/asr/tts` | The local stack now speaks Anthropic Messages API — even Claude Agent SDK can run against the tailnet |
| Frontier tier | **Claude API with GA structured outputs + Tool Runner** (Sonnet 5 default; Opus 4.8 for dreaming; Haiku 4.5 cheap tier) | Budgeted scarce resource for gate-critical judgment and weekly synthesis |
| Gatekeeper surface | **MCP TS SDK 1.29 → 2.0**, ~6 stateless meta-tools, missions on the official **Tasks extension**, **MCP Apps** for in-chat mission cards | The 2026-07-28 spec (final in 2 weeks) goes stateless and deprecates sampling — design for it from day one |
| Voice | **LiveKit Agents (self-hosted) + `@mastra/livekit` + LiveKit RN/Expo SDK**, local ASR/TTS | Fully-tailnet voice assistant is now genuinely viable; gpt-realtime-2.1-mini as premium fallback |
| Evals / observability | **Langfuse v3 self-hosted** (OTel ingest, LLM-as-judge on local endpoints) + Mastra scorers inline | MIT, self-hosts on the tailnet, judges via your own router; Braintrust is closed/SaaS, Phoenix went Elastic license |
| Offline mobile | **Convex reactivity now; pilot PowerSync-Convex if offline becomes hard requirement; watch curvilinear** | PowerSync shipped experimental Convex backend support 2026-06-10 — works with self-hosted Convex, keeps your mutations |

---

## The architecture, concretely

```
┌──────────────────────────── TAILNET (tail011a51.ts.net) ────────────────────────────┐
│                                                                                      │
│  inference1 (M4 Pro 64GB)          inference2 (M4 Pro 64GB)      laptop (M5 Max 128GB)│
│  ┌──────────────────────┐          ┌──────────────────────┐      ┌──────────────────┐│
│  │ CONVEX self-hosted   │          │ divergent #2:        │      │ convergent:      ││
│  │  (aarch64 binary,    │          │  Qwen3.6-35B-A3B     │      │  Qwen3.6-27B     ││
│  │   SQLite, launchd)   │          │ judge: Gemma4-12B QAT│      │  @262K ctx       ││
│  │ divergent #1:        │          │  (temp 0, grammar)   │      │ deep-convergent: ││
│  │  Qwen3.6-35B-A3B     │          │ asr: Qwen3-ASR-1.7B  │      │  Mistral Small 4 ││
│  │ embed: Qwen3-Emb-4B  │          │  + whisper.cpp turbo │      │  119B-A6.5B (LRU)││
│  │ rerank: jina-rr-v3   │          │ LANGFUSE v3 (docker) │      │ tts-podcast:     ││
│  │ gate: MiniCheck-7B   │          │ nightly consolidation│      │  VibeVoice-7B    ││
│  │ MASTRA mission worker│          │ MASTRA mission worker│      │ tts-fast: Qwen3- ││
│  └──────────┬───────────┘          └──────────┬───────────┘      │  TTS / Chatterbox││
│             │      all llama.cpp llama-server │ router mode      └────────┬─────────┘│
│             └────────────────┬────────────────┴──────────────────────────┘          │
│                              │                                                       │
│                LiteLLM router @ laptop:4545 (roles: divergent · convergent ·         │
│                judge · embed · rerank · asr · tts) — now also /v1/messages           │
└──────────────┬───────────────────────────────────────────────────────┬──────────────┘
               │ MCP (stateless, Tasks ext, Apps)                      │ Claude API
        Claude Code / Cursor / harnesses                        (structured outputs,
        + RN app (convex/react → self-hosted)                    Tool Runner, budgeted)
```

**Data plane:** one Convex deployment holds app state AND the evidence graph (sources / passages / claims / entities / relations / beliefs / episodes / missions / missionEvents / evals). Mission state lives in the same reactive store the RN app watches — mission progress UI is free.

**Compute plane:** Mastra workflows run as Bun workers on both minis, leasing steps from Convex workpool; local roles via LiteLLM; frontier steps via Anthropic API. Every extraction emits through llama.cpp `json_schema` constrained decoding (reason free-form → emit constrained), validated with Zod, one retry-with-error.

---

## Layer-by-layer rationale (with receipts)

### 1. Self-hosted Convex — green light, with four operating rules

The [convex-backend repo](https://github.com/get-convex/convex-backend) ships near-daily precompiled releases including `convex-local-backend-aarch64-apple-darwin.zip`; license FSL-1.1-Apache-2.0 (internal use unrestricted). Staff confirm all features except automated backups work self-hosted — vector indexes, FTS, crons, file storage, HTTP actions, dashboard. Components (`@convex-dev/workflow` 0.4.4, `workpool` 0.4.7, `agent` 0.6.4) are app-level code and work self-hosted.

Operating rules: **(1)** pin backend release + `convex` npm version in lockstep (field reports of CLI/backend skew breaking startup); **(2)** nightly `npx convex export` shipped to the other mini — there are no automated backups, full stop; **(3)** SQLite backing at your scale, but know the escape hatch (`--db postgres-v5`) — there's an open issue where SQLite `index_scan` materializes whole index ranges on large tables; **(4)** run a build ≥ July 2026 so the new streaming-export surface exists (it's what PowerSync consumes).

### 2. The substrate — build it; buy only leaf models

The knowledge-graph sweep's verdict: every credible system (Graphiti v0.29, Mem0, Letta, Hindsight, Engram, Cognee, MemOS) is Python and/or coupled to Neo4j/FalkorDB-class stores. Kuzu — the embedded-graph hope — was archived Oct 2025 (team acquired by Apple). Meanwhile the ICLR 2026 BEAM benchmark shows **every system still fails contradiction resolution and globally-consistent state** — exactly the Beliefs layer. Translation: the substrate is not commoditized; building it on Convex is correct and differentiating.

Steal these designs while building:
- **Graphiti**: bi-temporal edges (`valid_at`/`invalid_at`, event-time vs ingestion-time), invalidate-never-delete, plus its v0.29 cost tricks (combined node+edge extraction in one call, batched episodes, timestamp resolution as its own step).
- **Engram** (arXiv:2606.09900 — the closest published system to the MK-VI design): lossless episode log with **no LLM on the write path**, async atomic SPO extraction, deterministic contradiction handling with provenance + supersession chains.
- **Hindsight** (arXiv:2512.12818): the mental-models/opinions layer (≈ Beliefs) and 4-strategy recall (dense + BM25 + graph + temporal) fused with RRF + rerank.
- **Mem0**: the ADD/UPDATE/DELETE/NOOP memory-update decision step. **Letta**: sleep-time compute for consolidation. **HippoRAG 2**: Personalized PageRank over the entity/claim graph — ~200 lines of TS at personal scale.

### 3. The trust kernel (what makes claims admissible)

- **NER/typed mentions:** GLiNER via ONNX runs in pure TypeScript (`gliner-onnx` npm class of packages) — no Python sidecar.
- **Claim extraction:** Claimify's 3-stage pipeline (Selection → Disambiguation → Decomposition; 99% of claims entailed by source) reimplemented as prompts on the `convergent` role; VeriScore's "only verifiable claims" filter.
- **The gate:** **Bespoke-MiniCheck-7B** — tops LLM-AggreFact (77.4%), beats GPT-4o at grounding checks, ~200ms/check, ships on Ollama and serves fine as a llama.cpp router-mode slot (Q4 ≈ 4.5GB). DeBERTa-NLI or MiniCheck's flan-t5-large (0.8B) as the cheap CPU prefilter. This is fulcrum's verbatim-quote entailment gate, upgraded from technique to dedicated model.
- **Structured emission everywhere:** llama.cpp GBNF/`json_schema` (llguidance backend at build time); the 2026 benchmark record says constrained decoding takes schema correctness from ~61% to 96–100%. Pattern: free-form reasoning pass → grammar-constrained emission pass, Zod-validated, one retry.

### 4. Retrieval

Contextual retrieval (Anthropic-style chunk-context prefixes, generated by `divergent` at ingest — cheap on your metal) remains canonical; late chunking lost (Jina dropped it in v5). Embedder: **Qwen3-Embedding-4B** GGUF Q8 (~4.3GB) on llama.cpp `--embeddings` — top open multilingual retrieval family, 32K ctx, Matryoshka dims (stay at 1024 to keep Convex vector indexes happy; the dimension is finally *your* config, not Cohere's). Runner-up if RAM-pinched: jina-embeddings-v5-text-small (677M, MTEB-v2 71.7). Reranker: **jina-reranker-v3** official GGUF via `llama-server --reranking` (`/v1/rerank`), sub-200ms; Qwen3-Reranker-4B as the quality path (official conversions only — community GGUFs are broken). Fusion: app-level RRF in TS (Convex has no native hybrid), then PPR for multi-hop, then agentic decomposition in the `ask` engine on hard queries (the 2026 evidence — RAGSearch, arXiv:2604.09666 — says agentic multi-round retrieval is where the win is).

### 5. Mission engine

**Mastra 1.x** (stable 2026-01-20; you already run it in holocron-mcp): graph workflows with suspend/resume → human gates; scorers → inline evals; OTel; MCP+A2A native; `@mastra/livekit` → the voice bridge later. Mission ledger/events in Convex (workflow+workpool components) so the app can watch progress reactively; Bun workers on both minis execute the long local-LLM steps. **Skip Temporal** (ops weight; Bun support 5 months old and experimental), Trigger.dev (no checkpoints self-hosted), Hatchet/DBOS-TS (Postgres-anchored). If missions ever outgrow this: **Inngest** (single Go binary + SQLite, official Bun handler) or **Restate** (single Rust binary, virtual objects + durable promises map beautifully to missions with awakeable human gates).

### 6. The Gatekeeper surface — build for the July 28 spec

The **2026-07-28 MCP revision is final in two weeks** and it's the largest since launch: **stateless core** (sessions and `initialize` gone; capabilities ride per-request), response caching (`ttlMs`/`cacheScope`), **MRTR** replacing server-initiated requests, and **Roots/Sampling/Logging deprecated** (sampling's official replacement: call your LLM provider directly server-side — which is exactly the MK-VI design). **Tasks became an official extension** (`io.modelcontextprotocol/tasks`) with call-now/poll-later semantics — map missions onto it natively (`tools/call` → task handle; `tasks/get`/`tasks/update`/`tasks/cancel`). And **MCP Apps** is the first official extension (2026-01-26), live in Claude web/desktop, ChatGPT, VS Code: your mission-status card and knowledge browser can render *inside Claude*. Build on TS SDK 1.29 now; run the codemod to the 2.0 line when it GAs with the spec. The ecosystem's converged best practice — small tool surfaces, structured `outputSchema`, deferred loading, code-mode composition — is precisely the 6-meta-tool Gatekeeper shape.

### 7. Frontier tier + agent runtimes

Claude API now has GA structured outputs (`output_config.format`, `strict: true`) and Tool Runner — use Sonnet 5 as the default high-stakes step, Opus 4.8 for the weekly dreaming missions, Haiku 4.5 as the cheap cloud fallback. Big 2026 unlock: **Ollama, LM Studio, llama.cpp, and vLLM all speak the Anthropic Messages API natively** (Jan 2026), so **Claude Agent SDK research workers can run against your tailnet models** for cheap iteration and flip `ANTHROPIC_BASE_URL` for real-Claude runs. Anthropic's hosted Managed Agents (cron deployments, rubric-graded Outcomes) exists as an escape valve but conflicts with the self-host ethos. (Also instructive: OpenAI deprecated Agent Builder/Evals — visual builders lost, code-first won. The Bun/TS mission engine is on the right side of history.)

### 8. Voice, TTS, ASR

- **ASR:** Qwen3-ASR-1.7B (open-sourced Jan 2026; streaming+batch, 52 languages, timestamps via ForcedAligner) primary; parakeet-tdt-0.6b-v3 (MLX) for bulk podcast backfill; whisper.cpp large-v3-turbo as the battle-tested fallback.
- **TTS:** **VibeVoice-7B** (MIT) for the two-voice morning-briefing podcast — the only local model purpose-built for ~90-minute multi-speaker dialogue (laptop batch job, ~19GB). **Qwen3-TTS-1.7B** (open, streaming, cloning) or **Chatterbox Turbo** (MIT, 350M, 75ms, paralinguistic tags) for always-on narration; Kokoro-82M for bulk utility. ElevenLabs demotes to optional premium tier.
- **Realtime loop:** LiveKit Agents (self-hosted server on the tailnet; official RN/Expo client SDK) with `@mastra/livekit` making your Mastra Gatekeeper the voice brain. Pipecat 1.0 (also with an official RN client) is the composable alternative. gpt-realtime-2.1-mini for polish when you want it.

### 9. Evals

**Langfuse v3 self-hosted** (MIT; Postgres+ClickHouse+Redis compose on inference2): OTel ingest matches Mastra/AI SDK v7/Agent SDK output; its LLM-as-judge evaluators point at the LiteLLM router — i.e., **the judge is your own Gemma 4 12B (QAT Q4_0, temp 0, fixed seed, grammar-locked verdicts, pinned version)**. Cross-family judging (Qwen generates → Gemma judges) mitigates self-preference bias, the documented failure mode. Mastra scorers do inline per-run checks; Langfuse is the longitudinal store where drift becomes visible. Keep Braintrust for harness-side dev telemetry if you like it; the product's eval physiology self-hosts.

---

## Fleet assignment (RAM-budgeted)

| Node | Resident 24/7 | ~RAM | On-demand (llama.cpp router-mode LRU) |
|---|---|---|---|
| **inference1** (M4 Pro 64GB) | Convex backend + dashboard (~2GB) · divergent: Qwen3.6-35B-A3B UD-Q6_K_XL (~30GB+KV) · embed: Qwen3-Embedding-4B (~4.5GB) · rerank: jina-reranker-v3 (~1GB) · gate: MiniCheck-7B Q4 (~4.5GB) · Mastra worker | ~46GB | Qwen3.5-9B (~10GB) burst fan-out worker |
| **inference2** (M4 Pro 64GB) | divergent #2: same 35B (~30GB+KV) · judge: Gemma 4 12B QAT Q4_0 (~8GB) · asr: Qwen3-ASR-1.7B (~3GB) + whisper turbo (~1.6GB) · Langfuse stack (~3GB) · Mastra worker + nightly consolidation | ~50GB | Gemma 4 26B-A4B QAT (~16GB) as convergent fallback when laptop away |
| **laptop** (M5 Max 128GB) | convergent: Qwen3.6-27B Q8 @262K (~60GB) — upstream llama.cpp w/ Metal-4 prefill | ~60GB | deep-convergent: Mistral Small 4 119B-A6.5B Q4 (~63GB, LRU-swapped) · tts-podcast: VibeVoice-7B (~19GB) · tts-fast: Qwen3-TTS/Chatterbox/Kokoro |

**Fleet-wide migration action #1: rebuild upstream llama.cpp everywhere.** MTP merged to master 2026-05-16 (`--mtp` flag) — the `~/tools/llama-cpp-mtp` PR fork is obsolete — and upstream adds **router mode** (multi-model per server, LRU eviction, per-model presets, crash isolation — replaces port sprawl for the sidecar models), `/v1/rerank`, `/v1/embeddings`, the **Anthropic `/v1/messages` endpoint**, and the Metal 4 tensor API (2–3× prefill on the M5 Max). Benchmark against the fork first — there's an open MTP perf-regression issue (#23230).

---

## Emerging-tech radar

**ADOPT (production-ready, load-bearing):** self-hosted Convex (aarch64) · Mastra 1.x · upstream llama.cpp (MTP + router mode + `/v1/rerank` + `/v1/messages`) · Qwen3-Embedding-4B · jina-reranker-v3 · Bespoke-MiniCheck-7B · GLiNER-ONNX · contextual retrieval + RRF recipe · MCP 2026-07-28 stateless shape + Tasks extension + structured tool outputs · Gemma 4 12B QAT as pinned cross-family judge · Qwen3-ASR + whisper.cpp turbo · Kokoro/Chatterbox Turbo · Claude structured outputs + Tool Runner · Langfuse v3 self-hosted + OTel GenAI semconv.

**PILOT (high upside, some churn — time-boxed spikes):**
- **MCP Apps** — mission cards + knowledge browser rendering inside Claude/ChatGPT/VS Code.
- **Claude Agent SDK workers against tailnet `/v1/messages`** — cheap deep-research iteration; flip `ANTHROPIC_BASE_URL` for real-Claude runs.
- **VibeVoice-7B** two-voice briefing podcast (laptop batch).
- **PowerSync-Convex** (experimental since 2026-06-10) — only if offline-first mobile becomes a hard requirement; budget the UUID↔`_id` mapping tax.
- **LiveKit Agents + `@mastra/livekit` + RN client** — the tailnet voice Gatekeeper.
- **HippoRAG-style PPR + Hindsight 4-way fusion** inside the `ask` engine.
- **exo 1.0 TB5 RDMA** pooling the two minis (~128GB single pool; needs macOS 26.2 + TB5 cable) for one-big-MoE experiments — trades fleet redundancy for capacity.
- **Mistral Small 4 119B-A6.5B** as laptop deep-convergent.
- **AI SDK v7 HarnessAgent** — drive Claude Code/Codex/Pi through one API from missions (kb-* integration hook).

**WATCH (not yet):** MCP TS SDK 2.0 GA + codemod (July 28) · **curvilinear** (Convex's own offline engine, alpha — deletes PowerSync when native-ready) · Anthropic Managed Agents (cron + rubric Outcomes; hosted escape valve) · Vercel Workflow DevKit (v5 beta churn) · Kuzu forks ("bighorn"/"Ladybug") for embedded graph · Ollama-MLX / LM Studio `llmster` on the laptop for prefill-heavy loads (benchmark vs llama.cpp Metal-4 first) · MCP registry GA + Server Cards (matters for eventual open-sourcing) · BFCL V4 movements in open-model tool calling.

**EXPLICITLY SKIP:** Temporal · Neo4j/FalkorDB (any external graph DB) · Microsoft GraphRAG / waiting for LazyGraphRAG OSS · ColBERT/ColPali serving layers · late chunking · Zero/ElectricSQL (Postgres-locked upstream) · LiveStore as a bolt-on (it's a replacement data layer, still beta) · Zep cloud / Letta harness / MemOS · visual agent builders (OpenAI just killed theirs) · hosted rerankers/embedders for the core loop (Cohere contract is what we're escaping).

---

## Risk register (the honest part)

| Risk | Mitigation |
|---|---|
| Convex self-host has no automated backups | Nightly `convex export` cron → other mini + off-site copy; test restores monthly |
| CLI/backend version skew breaks startup | Pin both; upgrade deliberately, never auto |
| SQLite `index_scan` OOM on large tables (open issue) | Personal scale is fine today; `--db postgres-v5` is the escape hatch |
| MCP spec finalizes July 28 (2 weeks) | Build Gatekeeper stateless from day one; SDK 1.29 now, codemod to 2.0 at GA; don't touch sampling/roots |
| MTP upstream perf regression (#23230) | Benchmark upstream vs fork per node before deleting the fork |
| Minis are near RAM ceiling with sidecars | Q6 quants for the 35Bs; router-mode LRU for burst models; a third mini (or Mac Studio) is the clean hardware upgrade if the organism earns it |
| Judge drift on model upgrades | Pin judge model version; version rubrics; re-baseline eval sets on any judge change |
| Qwen3-Reranker community GGUFs are broken | Use official conversion path only (or jina-reranker-v3's official GGUF) |
| 24/7 thermal load on minis (fulcrum R5) | Stagger consolidation jobs; monitor via Langfuse traces + node metrics; minis already run sleep-disabled |

---

## Mapping to the MK-VI migration arc

- **Phase 1 (Metal + Substrate):** rebuild upstream llama.cpp fleet-wide → stand up self-hosted Convex on inference1 → serve embed/rerank/gate models → build ingestion (chunk → contextual prefix → GLiNER → Claimify prompts → MiniCheck gate) → backfill corpus → nightly export backups.
- **Phase 2 (Engine):** Mastra 1.x mission workflows + Convex workpool ledger; port deepResearch/whatsNew/subscription-auto-research as templates; standing mission #1 = dev-revenue; Langfuse + judge wiring.
- **Phase 3 (Gatekeeper):** `ask` engine (RRF + rerank + PPR + decomposition); MCP v2 surface on the 2026-07-28 spec with Tasks extension; MCP Apps mission cards; app chat → Gatekeeper.
- **Phase 4 (Metabolism):** fleet-transcript ingestion; consolidation + eval physiology; VibeVoice briefing podcast; LiveKit voice loop; retire the cloud deployment.

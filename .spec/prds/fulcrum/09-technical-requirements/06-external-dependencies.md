---
stability: CONSTITUTION
last_validated: 2026-08-20
prd_version: 3.0.0
---

# External Dependencies

Fulcrum adds almost no new dependencies. It consumes two systems it does not own — the **MK-VI platform** (Mastra + Postgres) and the **Virtual Device Fleet** (router + models) — and contributes mission logic. The novelty is configuration, evidence-graph extensions, and the Gate, not libraries.

## The inference fleet (owned by the Virtual Device Fleet PRD)

| Element | Detail |
|---|---|
| Router | **LiteLLM 1.91.0**, the fleet's packaged router, **loopback only** (code invariant, no config key can widen it) |
| Model server | **oMLX 0.5.7** on `:8003`, OpenAI-compatible, model ids are directory basenames |
| Fulcrum's nodes | `inference1` + `inference2` (M4 Pro, 64 GB each) — always-on. Pinned via the router's `node_set`. |
| Not a dependency | **The laptop.** Deliberately excluded: a perpetual loop cannot depend on a machine that sleeps (ADR-007). |
| Tailnet | `tail011a51.ts.net`; network policy is the authentication layer (no per-port auth) |
| Fleet config | `~/models/fleet/fleet.{node}.json` — roles, per-node capability, derived pools, digest-protected |

## Models Fulcrum addresses (live `FLEET_ROLE_NAMES` only)

`FLEET_ROLE_NAMES` = `divergent` / `convergent` / `judge` / `embed` / `rerank`. Fulcrum uses **three** of those. **`judge` is forbidden on this path.** `rerank` is unused.

| Live role | Fulcrum use | Optional `fleet.json` alias (1:1) | Default model (reasoned prior, unmeasured) | Status on the minis (probed 2026-08-20) |
|---|---|---|---|---|
| `divergent` | ASSAY / extract | `fulcrum-assay` | `mlx-community/Qwen3.8-27B-8bit` | On `inference2` disk **and served**; absent from `inference1` |
| `convergent` | SENSE-plan / GENERATE / CHALLENGE | `fulcrum-challenge` | `mlx-community/Qwen3.5-27B-Claude-4.6-Opus-Distilled-MLX-4bit` | On `inference1` disk, **not served**; absent from `inference2` |
| `embed` | 1024-dim publish / passage vectors | (served as `qwen3-embedding`) | `mlx-community/Qwen3-Embedding-0.6B-4bit-DWQ` | **Served live on both minis today** |

Aliases, if added, MUST resolve 1:1 onto the live role names. They are not a third vocabulary. Fulcrum code addresses `divergent` / `convergent` / `embed`.

**No coder model is a Fulcrum dependency.** `reviewer`, `implementer`, `orchestrator`, `qwen-coder`, and `verifier` are out of Fulcrum's vocabulary (ADR-008). **`judge` is also out.**

**Memory arithmetic.** Both chat models plus the embedder on one mini is ≈ 43 GB of 64 GB — it fits, and oMLX evicts LRU besides. Adding the 35B-A3B coder back does not fit. **Clearing the coder models from the minis is what makes this binding viable**, so it is load-bearing rather than cosmetic.

## Prerequisite fleet asks (fleet-side `fleet.json` edits — NOT Fulcrum code)

These are requested by this initiative and delivered by the Virtual Device Fleet. Fulcrum cannot run correctly until all four land. This pass does **not** mutate the fleet.

| # | Ask | Why it is required |
|---|---|---|
| **F1** | Give the Fulcrum host node a `router` block with `node_set: ["inference1", "inference2"]` | It is `null` today, so the node declares no router at all. This is the pin that keeps Fulcrum off the laptop. |
| **F2** | Declare `qwen3-embedding` in both minis' `serves` | Both minis *serve* the embedder live today but `fleet.json` does not *declare* it. Farm isolation would **silently remove** a capability that works today. |
| **F3** | Optionally add `fulcrum-assay` → `divergent` and `fulcrum-challenge` → `convergent` as **aliases**, declared in both minis' `serves` at **equal weight** | Aliases are optional. The live names already exist. If aliases are added they must be 1:1, not a third vocabulary. |
| **F4** | Mirror the two chat models so each mini holds both — copy the Opus-distill (~14 GB) to `inference2` and `Qwen3.8-27B-8bit` (~28 GB) to `inference1` | Equal-weight balancing requires every backend in a pool to be able to serve the role. |

**Recorded tradeoff on F3/F4 (accepted).** Equal weights let the router balance by least-busy. The cost is that both 27B models can land on the same mini and force evict-and-reload cycles. This belongs in the **landmine ledger** ([`09-e2e-testing.md`](./09-e2e-testing.md)), not a thing to re-litigate.

## Already in holocron (reused)

| Dependency | Used by |
|---|---|
| Vercel AI SDK (`ai`) | `generateText` in cycle **agent** stages only (plan / extract / assay / challenge / GENERATE). **Never** in gate or score modules |
| `@ai-sdk/openai` | The client path — `createOpenAI({ baseURL: 'http://127.0.0.1:{router_port}/v1' })`, loopback only |
| `@ai-sdk/anthropic` | Only the opt-in cloud fallback (off by default) |
| Mastra registry tools | SENSE retrieval, **corpus-only**: `hybrid_search`, `search_fts`, `search_vector`, `search_research`, `get_research_session`, `get_document`. **There is no Exa/Jina registry tool.** |
| Mastra + Postgres (mk6) | Mission Engine runtime and the evidence-graph ledger (ADR-004/006) |
| Local Qwen3 embedding path (mk6) | Publishing findings and passage vectors, 1024-dim (ADR-005) |
| `tldts` | eTLD+1 registrable-domain extraction for tier lookup and provenance independence |
| `MIGRATED_JOBS` + `scheduler-worker` | Perpetual `fulcrum:cycle` job dispatching `mission:execute` |

## Reused *design* (not live tables, not live execution)

| Source | Reused as |
|---|---|
| Prospector ledger *design* — `idea-factory` branch `task/prospector-schema` | **Design input** for Gate arithmetic and versioned weights. Storage is the live evidence graph + named extensions. Prospector table names (`prospects`, `cycles`, `scores`) are **not** created |
| holocron `convex/research/` *design* + `.spec/research-loop-improvement-plan.md` | Cycle-engine **design** input (ADR-003), re-implemented on the Mission Engine. **Not** an execution plan. Do not call `convex/research/tools.ts` |

## Configuration surface (what remains after ADR-007)

Fulcrum's inference configuration has collapsed to almost nothing — which is the point.

| Setting | Value |
|---|---|
| ~~`FULCRUM_INFERENCE_BASE_URL`~~ | **Deleted.** The endpoint is loopback on every node; there is nothing to configure. |
| ~~`FULCRUM_ROLE_MAP` (→ model names)~~ | **Deleted.** Live role names are `divergent` / `convergent` / `embed`. Optional aliases are fleet-side. |
| `FULCRUM_CLOUD_FALLBACK` | Default `off`; explicit operator opt-in only |
| Mission config | Budgets, cadence, WIP, degradation ceiling, tier ladder, weights, **ban-list**, **courtesy delays** (Zod fields; retrieval client enforces) |

## Dependency risks

- **The default research binding is unmeasured.** Neither model has been tested on Fulcrum's actual extraction/refutation tasks. This is R1 — mitigated by the swap-and-measure oracle (UC-LIS-03) with a denominator floor.
- **Fleet cutover can remove a working capability.** F2 above.
- **Body-field model checks are false evidence.** LiteLLM 1.91.0 rewrites the response body's `model` to the requested alias.
- **SENSE is corpus-only.** Do not derive an Exa/Jina dependency from v1.0.x prose. If outbound fetch is wanted later, it is a platform registry-tool addition, not a Fulcrum invention.
- **`FLEET-SPEC.md` is stale** (last updated 2026-08-16) and still describes the coder fleet as production. Derive Fulcrum's dependencies from `fleet.json`, `FLEET_ROLE_NAMES`, and a live probe.

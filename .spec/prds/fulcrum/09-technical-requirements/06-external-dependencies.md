---
stability: CONSTITUTION
last_validated: 2026-08-20
prd_version: 3.0.0
---

# External Dependencies

> **v3.0.0 fleet alignment (2026-08-20).** This section is **re-derived against the live fleet** and supersedes the v1.0.1 content that named `llama-server`, `inference1/2:8000`, `laptop:8001`, `~/models/RULES.md`, Convex, and Cohere. Ground truth below was probed on 2026-08-20, not recalled. The remaining `⚠️ Re-platform pending` banners on sections 01–05, 07–09 still apply to those files.

Fulcrum adds almost no new dependencies. It consumes two systems it does not own — the **MK-VI platform** (Mastra + Postgres) and the **Virtual Device Fleet** (router + models) — and contributes mission logic. The novelty is configuration and topology, not libraries.

## The inference fleet (owned by the Virtual Device Fleet PRD)

| Element | Detail |
|---|---|
| Router | **LiteLLM 1.91.0**, the fleet's packaged router, **loopback only** (code invariant, no config key can widen it) |
| Model server | **oMLX 0.5.7** on `:8003`, OpenAI-compatible, model ids are directory basenames |
| Fulcrum's nodes | `inference1` + `inference2` (M4 Pro, 64 GB each) — always-on. Pinned via the router's `node_set`. |
| Not a dependency | **The laptop.** Deliberately excluded: a perpetual loop cannot depend on a machine that sleeps (ADR-007). |
| Tailnet | `tail011a51.ts.net`; network policy is the authentication layer (no per-port auth) |
| Fleet config | `~/models/fleet/fleet.{node}.json` — roles, per-node capability, derived pools, digest-protected |

## Models Fulcrum addresses (three roles, ADR-008)

| Fulcrum role | Kind | Default model | Size | Status on the minis (probed 2026-08-20) |
|---|---|---|---|---|
| `fulcrum-assay` | chat | `mlx-community/Qwen3.8-27B-8bit` | ~28 GB | On `inference2` disk **and served**; absent from `inference1` |
| `fulcrum-challenge` | chat | `mlx-community/Qwen3.5-27B-Claude-4.6-Opus-Distilled-MLX-4bit` | ~14 GB | On `inference1` disk, **not served**; absent from `inference2` |
| `qwen3-embedding` | embedding, 1024-dim | `mlx-community/Qwen3-Embedding-0.6B-4bit-DWQ` | ~1 GB | **Served live on both minis today** |

**No coder model is a Fulcrum dependency.** `reviewer`, `implementer`, `orchestrator`, `qwen-coder`, and `verifier` are out of Fulcrum's vocabulary (ADR-008).

**Memory arithmetic.** Both chat models plus the embedder on one mini is ≈ 43 GB of 64 GB — it fits, and oMLX evicts LRU besides. Adding the 35B-A3B coder back does not fit. **Clearing the coder models from the minis is what makes this binding viable**, so it is load-bearing rather than cosmetic.

## Prerequisite fleet asks (fleet-side `fleet.json` edits — NOT Fulcrum code)

These are requested by this initiative and delivered by the Virtual Device Fleet. Fulcrum cannot run correctly until all four land.

| # | Ask | Why it is required |
|---|---|---|
| **F1** | Give the Fulcrum host node a `router` block with `node_set: ["inference1", "inference2"]` | It is `null` today, so the node declares no router at all. This is the pin that keeps Fulcrum off the laptop. The mechanism already exists — both minis use exactly this `node_set` shape. |
| **F2** | Declare `qwen3-embedding` in both minis' `serves` | **The most urgent one.** Both minis *serve* the embedder live today but `fleet.json` does not *declare* it. Because farm isolation means a model absent from the farm cannot be discovered, the fleet cutover would **silently remove** a capability that works today, breaking Fulcrum's publish path on the very nodes it depends on. |
| **F3** | Add `fulcrum-assay` and `fulcrum-challenge` as fleet roles/aliases, declared in both minis' `serves` at **equal weight** | Gives Fulcrum two roles that resolve to two different models, preserving cross-model challenge, with the binding swappable fleet-wide by config. |
| **F4** | Mirror the two chat models so each mini holds both — copy the Opus-distill (~14 GB) to `inference2` and `Qwen3.8-27B-8bit` (~28 GB) to `inference1` | Equal-weight balancing requires every backend in a pool to be able to serve the role. Without mirroring, a pool entry is a guaranteed failure. |

**Recorded tradeoff on F3/F4 (accepted).** Equal weights let the router balance by least-busy, which gives the best load spread. The cost is that both 27B models can land on the same mini and force evict-and-reload cycles; each reload costs tens of seconds inside a budgeted cycle, so throughput becomes uneven. This is accepted rather than avoided, and belongs in the **landmine ledger** ([`09-e2e-testing.md`](./09-e2e-testing.md)) as a thing to watch in telemetry — not a thing to re-litigate. oMLX's paged SSD cache softens it. If cycle wall-times prove too variable, the documented remedy is preferred-home weights (100 / 1, the same mechanism the fleet already uses for fallback), which is a config edit.

## Already in holocron (reused)

| Dependency | Used by |
|---|---|
| Vercel AI SDK (`ai`) | `generateText` in cycle inference; `tool()` retrieval |
| `@ai-sdk/openai` | The client path — `createOpenAI({ baseURL: 'http://127.0.0.1:{router_port}/v1' })`, loopback only |
| `@ai-sdk/anthropic` | Only the opt-in cloud fallback (off by default) |
| Exa / Jina search tools | SENSE retrieval against real sources |
| Mastra + Postgres (mk6) | Mission Engine runtime and the append-only ledger (ADR-004/006) |
| Local Qwen3 embedding path (mk6) | Publishing findings, 1024-dim (ADR-005) |
| `tldts` | eTLD+1 registrable-domain extraction for tier lookup and provenance independence |

## Reused code

| Source | Reused as |
|---|---|
| Prospector ledger core — `idea-factory` branch `task/prospector-schema` (31/37 ACs green) | Ledger **schema and logic** + Evidence Gate; storage engine swapped SQLite → Postgres (ADR-004) |
| holocron `convex/research/` design + `.spec/research-loop-improvement-plan.md` | Cycle-engine **design** input (ADR-003), re-implemented on the Mission Engine |

## Configuration surface (what remains after ADR-007)

Fulcrum's inference configuration has collapsed to almost nothing — which is the point.

| Setting | Value |
|---|---|
| ~~`FULCRUM_INFERENCE_BASE_URL`~~ | **Deleted.** The endpoint is loopback on every node; there is nothing to configure. |
| ~~`FULCRUM_ROLE_MAP` (→ model names)~~ | **Deleted.** Replaced by fleet aliases, edited in `fleet.json` and digest-protected fleet-wide. |
| `FULCRUM_CLOUD_FALLBACK` | Default `off`; explicit operator opt-in only |
| Mission config | Budgets, cadence, WIP, degradation ceiling, tier ladder, weights (per mission, not per node) |

## Dependency risks

- **The default research binding is unmeasured.** Neither model has been tested on Fulcrum's actual extraction/refutation tasks. This is R1, re-scoped — mitigated by the swap-and-measure oracle (UC-LIS-03), which makes the answer empirical and the fix a config edit.
- **Fleet cutover can remove a working capability.** F2 above: the embedder works on the minis today *by accident of discovery*, not by declaration. Farm isolation will enforce the declaration.
- **Body-field model checks are false evidence.** LiteLLM 1.91.0 rewrites the response body's `model` to the requested alias (measured by the fleet initiative 2026-08-17), so telemetry and the ASSAY≠CHALLENGE guard must read response headers cross-referenced against `GET /model/info`.
- **`FLEET-SPEC.md` is stale** (last updated 2026-08-16) and still describes the coder fleet as production. The fleet initiative's own cutover reconciles it; do not derive Fulcrum's dependencies from it. Derive them from `fleet.json` and a live probe.

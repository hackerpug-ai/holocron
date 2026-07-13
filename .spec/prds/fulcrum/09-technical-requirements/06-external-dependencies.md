---
stability: CONSTITUTION
last_validated: 2026-07-12
prd_version: 1.0.0
---

# External Dependencies

Fulcrum adds almost no new dependencies — it reuses holocron's stack and the existing local fleet. The novelty is *configuration and topology*, not new libraries.

## Already in holocron (reused)

| Dependency | Version | Used by | Docs |
|-----------|---------|---------|------|
| Convex | (repo) | Ledger, scheduler (crons + workflow), queries/mutations/actions | https://docs.convex.dev |
| Convex Workflow component | (repo — used by whatsNew) | Durable perpetual loop orchestration | https://www.convex.dev/components/workflow |
| Vercel AI SDK (`ai`) | ^6.0.116 | `generateText` in all cycle inference; `tool()` retrieval | https://sdk.vercel.ai |
| `@ai-sdk/openai` | ^3.0.41 | **The local-inference path** — `createOpenAI({ baseURL })` → LiteLLM/`llama-server` | https://sdk.vercel.ai/providers/ai-sdk-providers/openai |
| `@ai-sdk/anthropic` | ^3.0.69 | Only the opt-in cloud fallback (off by default) | https://sdk.vercel.ai/providers/ai-sdk-providers/anthropic |
| Exa / Jina search tools | (repo, `convex/research/tools.ts`) | SENSE retrieval against real sources | https://exa.ai · https://jina.ai |
| holocron embeddings + `documents` | (repo) | Publishing/searching findings | — |

## New (small)

| Dependency | Version | Used by | Docs |
|-----------|---------|---------|------|
| `tldts` | latest | eTLD+1 registrable-domain extraction for the tier lookup + provenance independence | https://github.com/remusao/tldts |
| Convex client (in the Bun worker) | matches repo | Worker↔Convex dispatch/commit | https://docs.convex.dev/client/javascript |

## Local infrastructure (owned; already running for coding)

| Element | Detail | Reference |
|--------|--------|-----------|
| LiteLLM router | `laptop:4545`, OpenAI-compatible `/v1`, model names `reviewer` / `implementer` | `~/models/RULES.md` |
| `reviewer` model | Qwen3.6 27B dense (Q8_0), precise → **convergent** role, `laptop:8001`, 262K ctx | `~/models/RULES.md` |
| `implementer` model | Qwen3.6 35B-A3B MoE (Q8_K_XL), fast → **divergent** role, `inference1/2:8000` | `~/models/RULES.md` |
| `llama-server` engine | llama.cpp PR #22673 (MTP), on every node | `~/models/RULES.md` |
| Tailscale tailnet | `tail011a51.ts.net`; ACL-based auth (router has none) | `~/models/RULES.md` |

## Configuration surface (environment / mission config, not code)

- `FULCRUM_INFERENCE_BASE_URL` — dev `http://laptop:4545/v1`; prod the mini's endpoint.
- `FULCRUM_ROLE_MAP` — `{ divergent: "implementer", convergent: "reviewer" }` (swap to a research pair here, no code change).
- `FULCRUM_CLOUD_FALLBACK` — default `off`; opt-in only.
- `FULCRUM_WORKER_ID`, poll interval, lease TTL, daily budget caps, thermal duty-cycle.

## Dependency risks

- **Research vs coder models**: the fleet is tuned for coding. Claim-extraction/challenge quality on the 27B/35B coder models is unverified for research; the role map exists precisely so a better research pair (e.g. a strong reasoner for convergent) can be swapped in without touching the cycle. Validate extraction quality early (see risks).
- **Convex → local-inference reachability**: the entire reason for the worker. If a future Convex feature or self-hosting removes the boundary, the worker simplifies but the contract (idempotent dispatch) stays valid.
- **LiteLLM/llama-server availability**: the fleet is not auto-running (`fleet-start` is manual); the degradation path (LIS UC-04) is a hard requirement, not a nicety.

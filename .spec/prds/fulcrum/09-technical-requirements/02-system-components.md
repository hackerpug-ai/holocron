---
stability: CONSTITUTION
last_validated: 2026-08-29
prd_version: 3.1.0
---

# System Components

Fulcrum is **not** a sidecar worker, **not** a Convex orchestrator, and **not** `convex/fulcrum/selector.ts`. It is five components on the MK-VI platform.

All five live **inside the `packages/platform` package** — Fulcrum has no package boundary of its own. See [Architecture Posture stance 7](./01-architecture-posture.md) for the workspace map and what that binds implementers to.

| # | Component | Runtime | Role | Evolves / New |
|---|-----------|---------|------|---------------|
| 1 | **Mission Engine template** | Mastra (shared platform service) | The `fulcrum` alias of `evidence-research` (`plan → retrieve → extract → assay → challenge → gate → commit`) plus Fulcrum-owned stages **GENERATE** and **MAP**. `modelRoleBindings`: plan/GENERATE/CHALLENGE = `convergent`; extract/assay = `divergent`. `toolGrants` must name the registry tools SENSE uses (today `[]` — Fulcrum fills them). | Extends live template; GENERATE + MAP are new |
| 2 | **Evidence Gate** | Pure TS module in the Mastra service | Grading, admission predicate, provenance independence, verbatim-quote check against the fetch artifact's `normalizedText`, saturating disconfirmation-weighted scoring. **No `generateText`. No fleet role. No `judge`.** | New (logic mined from Prospector gate design; re-implemented) |
| 3 | **Evidence-graph extensions** | Postgres via Drizzle | Live tables `sources` / `passages` / `claims` / `entities` / `relations` / `beliefs` plus named Fulcrum tables/columns (`candidates`, `belief_scores`, `weight_versions`, `domain_tiers`, `touches`, `probes`). Cycle log = `mission_runs`. Verdicts = `mission_verdicts`. | Extends live schema; does **not** port Prospector names |
| 4 | **Scheduler job** | `MIGRATED_JOBS` row `fulcrum:cycle` → `mission:execute` | Wakes on mission cadence, holds daily budget + circuit-breaker + degradation-ceiling, leases via `mission_runs.lease_owner`, runs one cycle. Work-item selector is a pure query over the evidence graph (expected-value + challenge-starvation floor). | New job; uses live `scheduler-worker` |
| 5 | **Markdown generator** | Deterministic renderer in the Mastra service | Renders daily brief + per-candidate dossiers to in-repo Markdown; publishes via `publishDocumentForRun` into `documents`. Loop health is a **section of the daily brief**. | New |

The Gate and the evidence graph are the deterministic spine. The Mission Engine template is the agentic loop. The job makes it perpetual. Markdown is the operator surface. Inference is inherited (loopback router → `inference1`/`inference2`); it is not a Fulcrum component.

## Component Interactions (happy path, one cycle)

1. **`fulcrum:cycle`** fires → **selector** returns the next target from Postgres → job enqueues **`mission:execute`** for the `fulcrum` alias.
2. **SENSE** = live `plan` (convergent) + live `retrieve` (named registry tools). Retrieve writes a **fetch artifact** `{ url, fetchedAt, raw, normalizedText, contentHash }` onto a `sources` row. Quotes later must be a substring of **that** artifact's `normalizedText`, not an RRF `sourceText` snippet.
3. **GENERATE** (new stage, convergent) proposes a typed candidate mutation.
4. **ASSAY** = live `extract` + `assay` on `divergent`. The agent **extracts claims only**. Admit + score are **LED code**, not a Mastra agent tool.
5. **Gate** (pure) grades, checks quotes against `normalizedText`, runs admission + provenance, computes `belief_scores` — no model.
6. **CHALLENGE** (live `challenge`, convergent) produces refuting claims (same gate) and the next kill-question.
7. **MAP** (new stage) assigns `nicheKey` or recommends retire. Typed I/O.
8. **COMMIT** = live `gate` stage (LED) + live `commit` (one Postgres transaction under `mission_runs.idempotency_key`).
9. **Markdown generator** reflects the change on next brief; publish is `publishDocumentForRun`. **Scheduler** updates budget/breaker state.

## The one boundary that leaves the Mastra process

Inference: loopback → packaged router → `inference1` / `inference2`. Retrieval: named Mastra registry tools against the **corpus** (no outbound Exa/Jina tool exists). Publish: `publishDocumentForRun` into the same Postgres `documents` table. There is no Convex cloud box, no HTTPS publish hop, and no sidecar.

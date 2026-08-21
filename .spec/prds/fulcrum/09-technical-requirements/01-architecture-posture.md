---
stability: CONSTITUTION
last_validated: 2026-08-20
prd_version: 3.0.0
---

# Architecture Posture

Six architectural stances govern Fulcrum. They are load-bearing; a change here is an architecture review, not a feature edit. They match [ADR-004](./00-architecture-decisions.md), [ADR-006](./00-architecture-decisions.md), [ADR-007](./00-architecture-decisions.md), and [ADR-008](./00-architecture-decisions.md).

## 1. Local inference is a first-class requirement, consumed as a loopback fleet client

All Fulcrum cycle inference runs on **local** Apple-Silicon models via the Virtual Device Fleet's packaged router on **loopback**, pinned to `inference1` + `inference2`. There is **no tailnet sidecar worker**. There is **no Convex store**. Fulcrum is a Mastra mission template running in the same process as the rest of the MK-VI platform; it dials `http://127.0.0.1:{router_port}/v1` on whichever node hosts the Mastra service.

- Fulcrum declares **no** base URL, host, port, model identifier, or device (`FULCRUM_INFERENCE_BASE_URL` is deleted).
- The laptop is **not** a dependency. A perpetual loop cannot depend on a machine that sleeps.
- Cloud fallback for research requires an explicit operator opt-in (`FULCRUM_CLOUD_FALLBACK`, default off).
- Historical v1.0.1 workaround (a tailnet worker + `bun:sqlite` + Cohere publish) is retired. The v1.0.1 "self-hosted Convex on the minis" north star is **not** the current topology; mk6 delivered Mastra + Postgres instead.

## 2. The deterministic/agentic seam is absolute — agents produce claims; they do not judge

Anything that must *always* be true is code. Agents **read, write, and generate claims**. They do **not** judge, score, admit, or terminate.

- The **Evidence Gate** (grading, admission, provenance, quote-check, scoring) contains **no `generateText` and no fleet role**. It is a set of pure functions that yield identical output for identical ledger state.
- The **Loop Engine** never computes a score; the **Gate** never calls a model.
- The fleet role `judge` **never appears on the Fulcrum path**, the same way coder roles never appear.
- This seam replaces holocron's `runRalphLoop`, which terminated on an LLM's self-assessed confidence (`coverage ≥ 4 && confidence ≥ 70`). The model can write any narrative; the number only moves when a cited claim clears the code gate.

## 3. Two *research* roles, bound by fleet config, chosen by measurement

The cycle needs a **claim-extraction** role and an **adversarial** role, and they must be different models so the critic does not inherit the extractor's blind spots. Fulcrum addresses the live `FLEET_ROLE_NAMES`:

| Live role | Fulcrum use | Optional `fleet.json` alias (1:1) |
|-----------|-------------|-----------------------------------|
| `divergent` | ASSAY / extract | `fulcrum-assay` |
| `convergent` | SENSE-plan / GENERATE / CHALLENGE | `fulcrum-challenge` |
| `embed` | 1024-dim Qwen3-Embedding | (served as `qwen3-embedding`) |

`judge` is forbidden. Coder roles (`reviewer`, `implementer`, `orchestrator`, `qwen-coder`, `verifier`) are forbidden. `rerank` is unused on this path.

The binding from role to model is a `fleet.json` edit: fleet-wide, digest-protected, identical on every node, and changeable with no Fulcrum code change. Which model belongs in which role is settled by **measurement, not preference**, because the Evidence Gate already emits deterministic quality signals — quote-check pass rate for extraction, refuting-claim gate-pass rate for challenge, and whether a queued kill-question later yields an *admitted* disconfirming claim.

> Historical stance 3 (v1.0.x coder map: divergent → `implementer`, convergent → `reviewer`) is superseded. The two-role split survives; the names are the live research roles.

## 4. Mine holocron's research *design*; re-implement execution on Mastra (ADR-003)

Fulcrum does **not** evolve `convex/research/` as an execution plan. ADR-003 already says: mine the design (phase decomposition, 5-factor credibility signals, citation model), **re-implement on Mastra**, and replace LLM-confidence termination with the evidence gate.

- Retrieval uses **named Mastra registry tools** (today: `hybrid_search`, `search_fts`, `search_vector`, `search_research`, `get_research_session`, `get_document`). There is no Exa/Jina registry tool. SENSE is **corpus-only** against ingested `documents` / `passages` until the platform registers an outbound fetch tool.
- The existing on-demand path (`startSmartResearch` / the `research` alias of `evidence-research`) is untouched and runs alongside.
- Fulcrum **adds** MAP/niche, the work-item selector, scoring, the perpetual `fulcrum:cycle` job, and briefs/dossiers. mk6 did not ship those.

## 5. Durable, append-only, idempotent state in the live Postgres evidence graph (ADR-004)

The ledger of record is the **live Postgres evidence graph** — `sources`, `passages`, `claims`, `entities`, `relations`, `beliefs` — plus named Drizzle extensions for candidates, `belief_scores`, weight versions, domain tiers, touches, and probes. Cycle log is `mission_runs` (idempotency key + lease). Verdicts are `mission_verdicts`.

It is **not** a sidecar `bun:sqlite` database. It is **not** a Prospector port (`prospects`, `cycles`, `scores`, `fulcrumCycles` do not exist). Deterministic guarantees (append-only, idempotent commit keys, all-or-nothing cycles) are enforced at the Postgres layer: blocking UPDATE/DELETE on immutable tables, one transaction per cycle under `mission_runs.idempotency_key`.

Publish is `publishDocumentForRun` into `documents` (local Qwen3 1024-dim embed). Convex is not in the path.

## 6. The human gate owns the done-bit; the loop never self-certifies

Stage advancement (`contender → validated`) and active-build promotion are human-only, gated on a recorded reality-probe and a WIP=1 limit. Autonomous *retirement* is allowed but symmetric-visible (every kill surfaces in the daily brief with its cited reason). Fulcrum is honestly scoped as an evidence-**triage** engine: it nominates well-cited candidates; it never declares one validated.

Writes are CLI: `holo fulcrum verdict` wrapping `POST /api/missions/:id/verdicts`, and `holo fulcrum ack-brief` writing a `touches` row. There is no RN screen and no "navigates."

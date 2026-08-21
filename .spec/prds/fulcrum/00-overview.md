---
stability: PRODUCT_CONTEXT
last_validated: 2026-08-20
prd_version: 3.0.0
---

# Fulcrum — Autonomous Research Loop

> **Fleet-aligned + lock-aligned (v3.0.0, 2026-08-20).** Fulcrum consumes inference as an ordinary client of the **Virtual Device Fleet**: one loopback endpoint, live **role names** (`divergent` / `convergent` / `embed`) only, pinned to `inference1` + `inference2`. `judge` is forbidden. It extends the live Postgres evidence graph. It is the `fulcrum` alias of `evidence-research` plus Fulcrum-owned additions. See [ADR-004 / ADR-006 / ADR-007 / ADR-008](./09-technical-requirements/00-architecture-decisions.md).

> **Sequenced after MK-VI.** This initiative is a hard successor to the [MK-VI Platform Migration](../mk6-migration/README.md). Fulcrum does **not** build the Mission Engine, the evidence-graph substrate, or the embedder. It **does** still build MAP/niche, the work-item selector, scoring, the perpetual job, and briefs/dossiers — mk6 did not ship those.

## Product Description

Fulcrum is holocron's **perpetual research engine**. Where holocron today runs research on demand — a user asks a question, `evidence-research` runs `plan → retrieve → extract → assay → challenge → gate → commit` for one shot, and a report is saved — Fulcrum runs research **continuously and unattended**, against standing **missions**, on **local inference**, producing a compounding, evidence-graded body of findings that a human triages in minutes a day.

The name is load-bearing. In Rebel-intelligence tradecraft, *Fulcrum* was the codename for the covert network that delivered **vetted** intelligence to command, who decided what to act on. That is precisely this system's shape: the loop gathers and grades; the human decides. A fulcrum is also the leverage point — and Fulcrum exists to raise the probability of the operator's next high-stakes decision (mission #1: *which revenue-generating thing to build next*).

Fulcrum is the holocron-native realization of the `idea-factory/ideas/autoresearch-loop/` design, narrowed by adversarial review to an honest claim: it is an **evidence-triage** engine, not a validator. It nominates well-cited candidates; humans validate them through real-world probes.

## The Problem

1. **Holocron's research is episodic.** Findings go stale the moment a session ends; nothing re-checks them. The live `evidence-research` template is on-demand (`trigger: on-demand`, `toolGrants: []`). A perpetual loop, a work-item selector, scoring, MAP/niche, and briefs are not inherited — they still have to be built.
2. **The historical loop terminated on an LLM's self-assessed confidence.** The Convex-era `runRalphLoop` stopped when a model judged coverage ≥ 4 and confidence ≥ 70. This is the textbook reward-hackable pattern: the thing generating the findings also grades them. Fulcrum exists to replace that pattern with a code gate. Agents produce claims; they do not judge. The fleet role `judge` is forbidden on this path.
3. **Discovery is bounded by the operator's imagination.** A solo engineer's research is identity-shaped — it drifts toward what he already knows (software for engineers). The opportunities with the best revenue-to-effort ratios often sit in industries he would never think to read about (insurance, logistics, specialty trades).
4. **Owned compute sits idle.** Two always-on Apple-Silicon Mac minis on a Tailscale tailnet (`inference1`, `inference2`) already serve research-class chat models and a 1024-dim embedder. Research — the workload most improved by *always-on, cheap, private* inference — doesn't use them as a perpetual loop. Being always-on is the load-bearing property: a perpetual loop cannot be hosted on a laptop that sleeps.

SENSE retrieval is **corpus-only** against ingested holocron `documents` / `passages`. There is no registered Exa/Jina tool. The problem statement is: continuously re-grade and extend evidence already in the archive, plus operator-seeded material — not "scrape the live web via `convex/research/tools.ts`."

## The Solution

Fulcrum adds four capabilities to holocron, and nothing else (scope is the loops only):

1. **A research-role configuration consumed from the fleet** — every Fulcrum inference call goes to one **loopback** endpoint served by the fleet's packaged router, pinned to `inference1` + `inference2`, and addresses **three live roles**: `divergent` (ASSAY/extract), `convergent` (SENSE-plan / GENERATE / CHALLENGE), and `embed` (1024-dim). Optional `fleet.json` aliases `fulcrum-assay` / `fulcrum-challenge` map 1:1. **`judge` is forbidden.** Fulcrum contributes the per-role degradation policy, per-cycle telemetry, and a deterministic way to **measure a model swap** (denominator floor + kill-question→admitted-disconfirm). It configures no endpoint, names no model, and rebuilds no substrate.
2. **A perpetual, evidence-gated cycle engine** — built **on** the live seven-stage graph (`plan → retrieve → extract → assay → challenge → gate → commit`), adding GENERATE and MAP as new stages with typed I/O, a work-item selector, and a `MIGRATED_JOBS` row `fulcrum:cycle` that dispatches `mission:execute`. ASSAY is extract-only (agent); admit + score are LED code.
3. **An evidence ledger and deterministic gate** — the anti-reward-hacking core, persisted on the live evidence graph plus named extensions (`candidates`, `belief_scores`, weight/tier versions). Claims enter only with cited, independent, recency-checked evidence whose quote ⊆ the fetch artifact's `normalizedText`; scores are computed by code. This **replaces** LLM-confidence termination with a metric the model cannot narrate its way past.
4. **Missions and a human gate** — standing research goals (starting with *development ideas with revenue potential*) that the operator steers by editing one contract, plus a daily brief (with a **Loop health** section), per-candidate dossiers, and named CLI writes: `holo fulcrum verdict` wrapping `POST /api/missions/:id/verdicts`, `holo fulcrum ack-brief` writing a `touches` row.

## Sequencing on the MK-VI platform (why this is a holocron mission template, not an idea-factory script)

The idea-factory MVP imagined a standalone Bun CLI. Fulcrum was first drawn into holocron (v1.0.x) because holocron already owned the durable store, the retrieval tools, the MCP server, and the app surface — and because the one thing holocron lacked was an evidence-gated loop running on local inference. That v1.0.x design hit a hard wall: **Convex actions run in a cloud runtime that cannot reach tailnet-local inference**, so Fulcrum worked around it with a separate tailnet-resident worker, a local `bun:sqlite` ledger, and Cohere embeddings for publish (the retired ADR-001 / ADR-002 — historical).

The MK-VI Platform Migration removes that wall. mk6 moved the entire backend onto the mini — Mastra (Bun) + Postgres, co-located with the local inference fleet, the RN app resyncing via Zero. With the backend running *where the inference runs*, the workaround collapses: no cloud runtime to escape, no sidecar worker, no split ledger, no cloud embedder.

Fulcrum is a **standing alias** of the live `evidence-research` template. mk6 did **not** ship `SENSE→GENERATE→ASSAY→CHALLENGE→MAP→COMMIT`. What holocron's MK-VI platform provides and Fulcrum inherits: the durable Postgres evidence graph, the local role router, the local Qwen3 embedder, the Mastra workflow runtime, `POST /api/missions/:id/verdicts`, `publishDocumentForRun`, `mission:execute`. What Fulcrum still owns: GENERATE, MAP, selector, scoring, perpetual schedule, briefs/dossiers, the CLI write surface.

Zero-reactive Postgres is a platform fact. A rich in-app Fulcrum UI is a **deferred separate PRD**, not a Fulcrum AC. MVP operator surface:

| Direction | What |
|-----------|------|
| Read | `.holocron/fulcrum/briefs/{YYYY-MM-DD}.md`, `.holocron/fulcrum/dossiers/{candidateId}.md`, plus `documents` via `publishDocumentForRun`. `holo fulcrum brief` / `holo fulcrum dossier <id>` print those paths. |
| Write | `holo fulcrum verdict` → `POST /api/missions/:id/verdicts`; `holo fulcrum ack-brief` → `POST /api/missions/:id/touches`; `holo fulcrum probe` records a `probes` row. |
| Health | Daily brief, section **Loop health**. No RN screens. No "navigates." |

This is why Fulcrum is **sequenced after, not parallel to, mk6**: it cannot be built until the platform exists. The v1.0.x PRD's north star ("self-hosted Convex on the Mac minis") is **not** the current topology — mk6 delivered Mastra + Postgres instead.

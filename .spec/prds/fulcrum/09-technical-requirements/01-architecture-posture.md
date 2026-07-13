---
stability: CONSTITUTION
last_validated: 2026-07-12
prd_version: 1.0.0
---

# Architecture Posture

Six architectural stances govern Fulcrum. They are load-bearing; a change here is an architecture review, not a feature edit.

## 1. Local inference is a first-class requirement, resolved by a tailnet worker

All Fulcrum cycle inference runs on **local** Apple-Silicon models, never cloud, unless the operator explicitly enables a fallback. The binding constraint: holocron's research today runs `generateText({ model: claudeFlash() })` **inside Convex actions**, and Convex's runtime cannot reach tailnet-local endpoints (LiteLLM `laptop:4545`, `inference1/2:8000`). Therefore the inference-bearing phases of a cycle execute in a **tailnet-resident worker process** (dev: the M5 Max laptop; prod: a Mac mini) that holds the local-model connection and reads/writes durable state through the Convex client. Convex remains the durable store, scheduler, and app surface; it dispatches cycle work to the worker and receives committed results.

- **MVP**: worker on the tailnet + **cloud-hosted Convex** (durable state in Convex cloud, inference on the worker's local endpoints).
- **North star (out of scope, non-breaking)**: **self-hosted Convex on the Mac minis**, at which point actions themselves reach local inference and the worker/Convex split can collapse. Fulcrum is designed so this migration requires no redesign — it is the literal meaning of "migrate holocron to the minis and run all research locally."

## 2. The deterministic/agentic seam is absolute

Anything that must *always* be true is code; agents only read, write, judge, and generate. The **Evidence Gate** (grading, admission, provenance, quote-check, scoring) contains **no LLM call** and is a set of pure functions that yield identical output for identical ledger state. The **Loop Engine** never computes a score; the **Gate** never calls a model. This seam is the direct replacement for holocron's `runRalphLoop`, which terminates on an LLM's self-assessed confidence (`coverage ≥ 4 && confidence ≥ 70`) — the reward-hackable pattern Fulcrum exists to remove. The model can write any narrative; the number only moves when a cited claim clears the code gate.

## 3. Local models serve two *roles*, mapped by config

The cycle needs a **divergent** role (fast generation, query planning, mutation) and a **convergent** role (precise claim extraction, challenge). These map onto the existing coder fleet — divergent → the fast MoE `implementer` (35B-A3B), convergent → the precise dense `reviewer` (27B) — via configuration, through the same LiteLLM router. This reuse is the lowest-friction way to satisfy "local inference for all research" today; swapping in a research-specific pair (e.g. a fast generator + a strong reasoner) is a config change, not a rebuild. **ASSAY and CHALLENGE must resolve to different models** — a property the two-role split provides for free and the substrate enforces (fail-closed if identical).

## 4. Evolve `convex/research/`, do not fork it

Fulcrum reuses holocron's existing research machinery wherever it fits: the retrieval tools (`convex/research/tools.ts` — Exa/Jina via the AI SDK), embeddings, the phase decomposition (search/synthesize/review in `scheduled.ts`), and the extracted `termination.ts` criteria. It **replaces** the termination's LLM-confidence exit with the evidence gate, and **adds** the perpetual scheduler, the ledger, the local-inference substrate, and the human gate. The existing on-demand path (`startSmartResearch`) is untouched and runs alongside.

## 5. Durable, append-only, idempotent state in Convex

The ledger (evidence, claims, scores, lineage, cycles, verdicts, touches) is **append-only** in Convex — corrections are new rows, never mutations of history — so the audit trail and re-scoring are trivially correct. Every cycle commits under an **idempotency key** so a worker restart or redispatch collapses to one committed cycle. A cycle either commits all its effects or none (one logical transaction); a budget-exceeded or failed cycle still writes an explicit cycle-log row.

## 6. The human gate owns the done-bit; the loop never self-certifies

Stage advancement (`contender → validated`) and active-build promotion are human-only, gated on a recorded reality-probe and a WIP=1 limit. Autonomous *retirement* is allowed but symmetric-visible (every kill surfaces in the brief with its cited reason). Fulcrum is honestly scoped as an evidence-**triage** engine: it nominates well-cited candidates; it never declares one validated.

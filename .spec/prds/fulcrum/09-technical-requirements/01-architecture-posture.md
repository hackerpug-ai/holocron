---
stability: CONSTITUTION
last_validated: 2026-07-12
prd_version: 1.0.0
---

# Architecture Posture

> **⚠️ Re-platform pending (v2.0.0, 2026-07-13).** Fulcrum is now sequenced after [`mk6-migration`](../../mk6-migration/README.md). **Stance #1 (tailnet worker) and stance #5 (local SQLite ledger) are contradicted by [ADR-004 / ADR-006](./00-architecture-decisions.md)** — the backend runs on the mini, so there is no cloud runtime to escape and no sidecar worker; the ledger is Postgres append-only tables. Stances #2 (deterministic seam), #3 (two model roles), #4 (evolve not fork), and #6 (human done-bit) carry forward unchanged. Re-derive this file against the live mk6 platform before consuming it.

Six architectural stances govern Fulcrum. They are load-bearing; a change here is an architecture review, not a feature edit.

## 1. Local inference is a first-class requirement, resolved by a tailnet worker

All Fulcrum cycle inference runs on **local** Apple-Silicon models, never cloud, unless the operator explicitly enables a fallback. The binding constraint: holocron's research today runs `generateText({ model: claudeFlash() })` **inside Convex actions**, and Convex's runtime cannot reach tailnet-local endpoints (LiteLLM `laptop:4545`, `inference1/2:8000`). Therefore the inference-bearing phases of a cycle execute in a **tailnet-resident worker process** (dev: the M5 Max laptop; prod: a Mac mini) that holds the local-model connection and reads/writes durable state through the Convex client. Convex remains the durable store, scheduler, and app surface; it dispatches cycle work to the worker and receives committed results.

- **MVP**: the worker owns the loop **and its durable ledger, locally** (see stance #5 / ADR-001); **cloud-hosted Convex is the publish + search substrate**, receiving only published findings over HTTPS.
- **North star (out of scope, non-breaking)**: **self-hosted Convex on the Mac minis**, at which point Convex is itself tailnet-resident, the local ledger and Convex co-locate, and the publish hop becomes local. Fulcrum is designed so this migration requires no redesign — it is the literal meaning of "migrate holocron to the minis and run all research locally."

## 2. The deterministic/agentic seam is absolute

Anything that must *always* be true is code; agents only read, write, judge, and generate. The **Evidence Gate** (grading, admission, provenance, quote-check, scoring) contains **no LLM call** and is a set of pure functions that yield identical output for identical ledger state. The **Loop Engine** never computes a score; the **Gate** never calls a model. This seam is the direct replacement for holocron's `runRalphLoop`, which terminates on an LLM's self-assessed confidence (`coverage ≥ 4 && confidence ≥ 70`) — the reward-hackable pattern Fulcrum exists to remove. The model can write any narrative; the number only moves when a cited claim clears the code gate.

## 3. Local models serve two *roles*, mapped by config

The cycle needs a **divergent** role (fast generation, query planning, mutation) and a **convergent** role (precise claim extraction, challenge). These map onto the existing coder fleet — divergent → the fast MoE `implementer` (35B-A3B), convergent → the precise dense `reviewer` (27B) — via configuration, through the same LiteLLM router. This reuse is the lowest-friction way to satisfy "local inference for all research" today; swapping in a research-specific pair (e.g. a fast generator + a strong reasoner) is a config change, not a rebuild. **ASSAY and CHALLENGE must resolve to different models** — a property the two-role split provides for free and the substrate enforces (fail-closed if identical).

## 4. Evolve `convex/research/`, do not fork it

Fulcrum reuses holocron's existing research machinery wherever it fits: the retrieval tools (`convex/research/tools.ts` — Exa/Jina via the AI SDK), embeddings, the phase decomposition (search/synthesize/review in `scheduled.ts`), and the extracted `termination.ts` criteria. It **replaces** the termination's LLM-confidence exit with the evidence gate, and **adds** the perpetual scheduler, the ledger, the local-inference substrate, and the human gate. The existing on-demand path (`startSmartResearch`) is untouched and runs alongside.

## 5. Durable, append-only, idempotent state in a LOCAL SQLite ledger (ADR-001)

The ledger (evidence, claims, scores, lineage, cycles, verdicts, touches) is a **local `bun:sqlite` database** — the Prospector v1.1 schema, already implemented to 31/37 ACs on branch `task/prospector-schema`. It is **append-only** (SQLite UPDATE/DELETE-blocking triggers give DB-level immutability Convex cannot), and every cycle commits under an **idempotency key** with WAL durability, so a kill-9 leaves at most the in-flight cycle and never a partial commit. This is the loop's source of truth; Convex holds only *published findings* (a projection). The reason the ledger is local, not Convex: local inference forces an on-machine process (stance #1), and Convex action time-limits suit "schedule next cycle," not a long-lived worker — so co-locating the ledger with the inference is both necessary and free (it reuses working code).

## 6. The human gate owns the done-bit; the loop never self-certifies

Stage advancement (`contender → validated`) and active-build promotion are human-only, gated on a recorded reality-probe and a WIP=1 limit. Autonomous *retirement* is allowed but symmetric-visible (every kill surfaces in the brief with its cited reason). Fulcrum is honestly scoped as an evidence-**triage** engine: it nominates well-cited candidates; it never declares one validated.

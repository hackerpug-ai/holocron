# Team Contributions

> **Historical record — read as "what was decided when," not as current state.** This entire file is history. Do not implement from it.
>
> **Superseded in v3.0.0** by [ADR-007 / ADR-008](./09-technical-requirements/00-architecture-decisions.md) **and** by the lock alignment of [ADR-004 / ADR-006](./09-technical-requirements/00-architecture-decisions.md):
> - Phase 2's Convex-engineering north star (tailnet worker + Convex durable truth + self-hosted-Convex-on-mini) is **not current architecture**. mk6 delivered Mastra + Postgres. There is no Convex store, no sidecar worker, no `bun:sqlite` ledger.
> - Phase 3's role map (convergent → `reviewer`, divergent → `implementer`, via `laptop:4545`) is **superseded**: Fulcrum consumes the fleet on loopback pinned to `inference1` + `inference2`, and its vocabulary is live `FLEET_ROLE_NAMES` `divergent` / `convergent` / `embed` with **no coder role and no `judge`**.
> - The Phase 3 note that "swapping in a research pair is a config change, not a rebuild" is exactly what v3.0.0 exercised — the swap seam did its job.
> - References to `~/models/RULES.md` predate the current fleet config (`~/models/fleet/fleet.json`).
> - "Evolve `convex/research/`" was design mining (ADR-003), not an execution plan.

This PRD was synthesized by the orchestrator applying product-manager, Convex-engineering, and local-inference-specialist lenses over an extensive prior design corpus, grounded by direct reading of the holocron codebase (`convex/research/`, `convex/crons.ts`, `convex/schema.ts`, `holocron-mcp/`, `package.json`) and the local-fleet spec (`~/models/RULES.md`). It is the holocron-native realization of the `idea-factory/ideas/autoresearch-loop/` design, which itself passed a 16-finding adversarial red-team.

## Phase 1 — Product framing (product-manager lens)

- **Personas**: one human role (Operator = the solo engineer holding the gate) and four system actors (Loop Engine, Evidence Gate, Inference Fleet, Challenger). See `02-roles.md` for the **current** names (`divergent` / `convergent` / `embed`).
- **Core job-to-be-done**: raise the probability of the operator's next high-stakes build decision by continuously surfacing well-cited, disconfirmation-tested candidates from territory his own reading would never reach — at minutes-a-day of attention.
- **Narrowed scope** (from the strategy's red-team): an evidence-**triage** engine, not a validator; output is nominations, validation is human reality-probes; the loop's output is private.

## Phase 2 — Architecture (Convex-engineering lens) — HISTORICAL, SUPERSEDED

> **Do not implement this phase.** The reachability finding was correct *against Convex cloud*. mk6 removed Convex from the path. Current architecture: Mastra + Postgres evidence graph + loopback fleet. See ADR-004 / ADR-006.

- **The reachability finding** (direct from code, 2026-07): research inference ran `generateText({ model: claudeFlash() })` inside Convex actions, which cannot reach tailnet-local endpoints — so a tailnet-resident worker held the local-model connection and Convex held durable truth, joined by a durable idempotent queue. Self-hosted-Convex-on-mini was the non-breaking north star **then**. It is **not** the north star now.
- **Evolve, not fork**: reuse `convex/research/` retrieval tools, embeddings, and phase decomposition as **design**. Current decision (ADR-003): mine the design, re-implement on Mastra; do not execute `convex/research/`.
- **Ledger** (revised in v1.0.1 → ADR-001, **superseded by ADR-004**): the loop's ledger of record was a **local `bun:sqlite`** database. Current ledger is the live Postgres evidence graph plus named Fulcrum extensions.

## Phase 3 — Local inference (fleet-specialist lens) — HISTORICAL, SUPERSEDED

> Current roles: `divergent` / `convergent` / `embed`. `judge` forbidden. See ADR-007 / ADR-008.

- **Role map onto the existing fleet** (v1.0.x): convergent → `reviewer` (27B dense, precise) for ASSAY/extraction; divergent → `implementer` (35B-A3B MoE, fast) for GENERATE/query-planning/CHALLENGE — through the same LiteLLM router (`laptop:4545`), swappable to a research pair by config. **Superseded.**
- **`@ai-sdk/openai` already present** → `createOpenAI({ baseURL })` is the clean local-inference path (LiteLLM/`llama-server` are OpenAI-compatible). This hop survived; the base URL is loopback-only.
- **Free cross-model challenge**: the two-role split makes ASSAY and CHALLENGE naturally different models. This constraint survived; the names did not.
- **Degradation is a hard requirement**: the fleet isn't auto-running; the loop must visibly drop to sense-only rather than silently call cloud. Survived.

## Phase 4 — Test strategy (the determinism seam)

- Fulcrum's architecture is the determinism seam: fixture the model, assert the gate's deterministic outcomes (admissions, exact `belief_scores`, transitions). Deterministic lanes run 0%-flake in CI against **real Postgres**; a thin live-inference lane (fleet-gated) proves the substrate; a proven-reference-flow spike (one real full cycle → `mission_runs` row) gates the deep build and validates the two initiative-gating risks (extraction quality over a denominator floor, dispatch exactly-once) on real services.

## Grounding artifacts

- `idea-factory/ideas/autoresearch-loop/{01-plan,02-strategy,03-mvp}.md`
- `idea-factory/PROSPECTOR-SYSTEM_v1.md` + `idea-factory/.spec/prospector/blueprint-schema-ledger-v1.1.md` (design input, not the live schema)
- holocron continuation doc: `js7462j2km1p736jdvq0t7scss8aekcg`
- Current live facts: `services/platform/src/db/schema/evidence.ts`, `services/platform/src/mission/templates/evidence-research.ts`, `FLEET_ROLE_NAMES`, `POST /api/missions/:id/verdicts`, `publishDocumentForRun`
- Historical (do not implement from): `~/models/RULES.md` (fleet), holocron `convex/research/*`, `convex/crons.ts`

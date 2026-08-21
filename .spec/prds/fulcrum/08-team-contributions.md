# Team Contributions

> **Historical record — read as "what was decided when," not as current state.** Phase 3's role map (convergent → `reviewer`, divergent → `implementer`, via `laptop:4545`) was **superseded in v3.0.0** by [ADR-007 / ADR-008](./09-technical-requirements/00-architecture-decisions.md): Fulcrum consumes the fleet on loopback pinned to `inference1` + `inference2`, and its vocabulary is research + embedding with **no coder role**. The Phase 3 note that "swapping in a research pair is a config change, not a rebuild" is exactly what v3.0.0 exercised — the swap seam did its job. References to `~/models/RULES.md` predate the current fleet config (`~/models/fleet/fleet.json`).

This PRD was synthesized by the orchestrator applying product-manager, Convex-engineering, and local-inference-specialist lenses over an extensive prior design corpus, grounded by direct reading of the holocron codebase (`convex/research/`, `convex/crons.ts`, `convex/schema.ts`, `holocron-mcp/`, `package.json`) and the local-fleet spec (`~/models/RULES.md`). It is the holocron-native realization of the `idea-factory/ideas/autoresearch-loop/` design, which itself passed a 16-finding adversarial red-team.

## Phase 1 — Product framing (product-manager lens)

- **Personas**: one human role (Operator = the solo engineer holding the gate) and four system actors (Loop Engine, Evidence Gate, Inference Fleet, Challenger). See `02-roles.md`.
- **Core job-to-be-done**: raise the probability of the operator's next high-stakes build decision by continuously surfacing well-cited, disconfirmation-tested candidates from territory his own reading would never reach — at minutes-a-day of attention.
- **Narrowed scope** (from the strategy's red-team): an evidence-**triage** engine, not a validator; output is nominations, validation is human reality-probes; the loop's output is private.

## Phase 2 — Architecture (Convex-engineering lens)

- **The reachability finding** (direct from code): research inference runs `generateText({ model: claudeFlash() })` inside Convex actions, which cannot reach tailnet-local endpoints — so a tailnet-resident worker holds the local-model connection and Convex holds durable truth, joined by a durable idempotent queue. Self-hosted-Convex-on-mini is the non-breaking north star.
- **Evolve, not fork**: reuse `convex/research/` retrieval tools, embeddings, and phase decomposition; **remove** the `termination.ts` LLM-confidence exit in favor of the deterministic gate; leave the on-demand `startSmartResearch` path intact.
- **Ledger** (revised in v1.0.1 → ADR-001): the loop's ledger of record is a **local `bun:sqlite`** database — the `idea-factory/.spec/prospector/blueprint-schema-ledger-v1.1.md` schema, already implemented to 31/37 ACs — reused, not re-built as Convex tables. Convex receives only published findings.

## Phase 3 — Local inference (fleet-specialist lens)

- **Role map onto the existing fleet**: convergent → `reviewer` (27B dense, precise) for ASSAY/extraction; divergent → `implementer` (35B-A3B MoE, fast) for GENERATE/query-planning/CHALLENGE — through the same LiteLLM router (`laptop:4545`), swappable to a research pair by config.
- **`@ai-sdk/openai` already present** → `createOpenAI({ baseURL })` is the clean local-inference path (LiteLLM/`llama-server` are OpenAI-compatible).
- **Free cross-model challenge**: the two-role split makes ASSAY and CHALLENGE naturally different models, satisfying the red-team's same-model-critic finding at no extra cost.
- **Degradation is a hard requirement**: the fleet isn't auto-running; the loop must visibly drop to sense-only rather than silently call cloud.

## Phase 4 — Test strategy (the determinism seam)

- Fulcrum's architecture is the determinism seam: fixture the model, assert the gate's deterministic outcomes (admissions, exact scores, transitions). Deterministic lanes run 0%-flake in CI; a thin live-inference lane (fleet-gated) proves the substrate; a proven-reference-flow spike (one real full cycle) gates the deep build and validates the two initiative-gating risks (extraction quality, dispatch exactly-once) on real services.

## Grounding artifacts

- `idea-factory/ideas/autoresearch-loop/{01-plan,02-strategy,03-mvp}.md`
- `idea-factory/PROSPECTOR-SYSTEM_v1.md` + `idea-factory/.spec/prospector/blueprint-schema-ledger-v1.1.md`
- holocron continuation doc: `js7462j2km1p736jdvq0t7scss8aekcg`
- `~/models/RULES.md` (fleet), holocron `convex/research/*`, `convex/crons.ts`

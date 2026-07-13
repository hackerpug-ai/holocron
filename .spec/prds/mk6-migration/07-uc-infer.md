---
stability: FEATURE_SPEC
last_validated: 2026-07-13
prd_version: 1.0.0
functional_group: INFER
---

# Use Cases: Local Inference & Research Engine (INFER)

| ID | Title | Description |
|----|-------|-------------|
| UC-INFER-01 | Role router & local-first | A model role router that sends all reasoning to the fleet by default; every call site names a role, never a provider. |
| UC-INFER-02 | Deterministic research engine | The pi-free Mastra-native research loop terminating on a deterministic evidence gate, not LLM confidence. |
| UC-INFER-03 | Structured output on local models | Reliable schema-valid extraction via constrained decoding + Zod re-validation + a bounded repair loop. |
| UC-INFER-04 | Claude escape hatch & budget ledger | A default-deny, budget-ledgered Claude API path for declared high-stakes steps only. |
| UC-INFER-05 | Degraded modes | Defined reduced operation when the fleet or a role is unreachable — never a silent cloud fallback. |

---

## UC-INFER-01: Role router & local-first

A `resolveModel(role, {allowEscape})` router maps `divergent`/`convergent`/`judge`/`embed`/`rerank` to fleet endpoints via `@ai-sdk/openai-compatible` over LiteLLM (`:4545`). Every one of the former 83 cloud call sites names a role, never a provider, so local-first is structural rather than per-call discipline.

**Acceptance Criteria**
- ☐ System can route every reasoning call through the role router to a local fleet endpoint with zero cloud calls on the default path, verified by fleet request logs plus a network assertion that no Anthropic request occurs unless a step declares escape.
- ☐ A reviewer can confirm no call site references a provider directly (all name a role); the former `claudeFlash/claudePro/claudeUltra` factories are gone.
- ☐ System can resolve the `divergent` and `convergent` roles to their respective fleet models (fast 35B-A3B vs precise 27B) and route each pipeline step to its bound role.

---

## UC-INFER-02: Deterministic research engine

The research mission runs entirely Mastra-native on the fleet (pi and all external coding-agent harnesses removed): PLAN → RETRIEVE → EXTRACT → GATE (pure-TS, no model) → CHALLENGE → COMMIT, terminating on a deterministic evidence predicate (required components covered by admitted claims at grade-floor within recency, marginal gain < ε, disconfirmation resolved, within budget) — replacing the reward-hackable `coverage>=4 && confidence>=70`.

**Acceptance Criteria**
- ☐ System can terminate a research mission on the deterministic evidence gate, not on any LLM-emitted confidence, verified by a case where a model asserting high confidence over thin/ungraded evidence does not terminate.
- ☐ System can admit a claim only through the pure-TS evidence gate (grading, provenance independence, verbatim-quote entailment, disconfirmation-weighted scoring) with no model call in the admission path.
- ☐ System can run a full research mission with zero dependency on pi or any external coding-agent harness, verified by process/network inspection showing only fleet + tool calls.
- ☐ System can run ASSAY and CHALLENGE on distinct model instances in the same cycle, with refuting claims passing the identical admission gate as supporting ones.

---

## UC-INFER-03: Structured output on local models

Extraction produces schema-valid output via `response_format` json_schema → backend constrained decoding → Mastra Zod re-validation → a bounded deterministic repair loop that fails explicitly past its cap (never silently accepts), with a boot-time per-role capability probe selecting constrained vs repair-loop mode.

**Acceptance Criteria**
- ☐ System can produce schema-valid structured extraction from a local model, repairing a malformed generation through a bounded loop and failing explicitly past the cap (never silently accepting), verified against the real fleet.
- ☐ System can probe each role endpoint at boot for json_schema support and select the appropriate structuring strategy.
- ☐ A reviewer can confirm every extraction call site validates against a Zod schema with a capped retry, and that a persistently-malformed generation surfaces as an explicit error.

---

## UC-INFER-04: Claude escape hatch & budget ledger

The Claude API (`@ai-sdk/anthropic`) is reachable only for steps that declare `highStakes`/`allowEscape`, gated by a deterministic budget-ledger pre-check and full telemetry — default-deny, so local-first cannot silently drift back to cloud.

**Acceptance Criteria**
- ☐ System can invoke the Claude escape hatch only when a step declares escape and the budget-ledger pre-check passes, blocking any call that would exceed the ceiling.
- ☐ System can log every escape-hatch (Claude) call to the budget ledger with reason, tokens, and cost against real Postgres, verified with one real budgeted Anthropic call.
- ☐ System can prove no Anthropic request occurs on the default (non-escape) path, verified by a network assertion during a normal mission run.

---

## UC-INFER-05: Degraded modes

When the fleet or a specific role is unreachable, the system degrades to a defined reduced mode (research → sense-only; chat → surfaced "local fleet down") rather than silently failing over to cloud — preserving the local-first mandate under failure.

**Acceptance Criteria**
- ☐ System can degrade to a defined reduced mode when a fleet endpoint is taken down mid-run (research → sense-only; chat → surfaced unavailability) and never silently fall back to cloud.
- ☐ User can see a clear "local fleet unavailable" state in chat rather than a hang or a covert cloud response.
- ☐ System can resume full operation automatically when the role endpoint returns, verified by taking an endpoint down and back up during a run.

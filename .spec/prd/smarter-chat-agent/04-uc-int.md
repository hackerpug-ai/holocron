---
name: Use Cases — Intent Classification, Routing & Telemetry
description: Triage classifier improvements (queryShape, regex backstop), specialist dispatch hint, and per-turn telemetry capture
stability: FEATURE_SPEC
last_validated: 2026-04-11
prd_version: 1.0.0
functional_group: INT
---

# Use Cases: Intent Classification, Routing & Telemetry (INT)

| ID | Title | Description |
|----|-------|-------------|
| UC-INT-01 | Emit queryShape from triage in single LLM call | Triage classifier returns 5-field JSON (intent, queryShape, confidence, reasoning, directResponse) with one zaiFlash call |
| UC-INT-02 | Classify recommendation queries as queryShape=recommendation | Queries with "find me N", "best X in Y", "top N", "highly rated", "referrals" map to recommendation shape |
| UC-INT-03 | Classify comprehensive-report queries as queryShape=comprehensive | Queries with "comprehensive", "deep dive", "thorough", "complete guide" map to comprehensive shape |
| UC-INT-04 | Classify vague queries as queryShape=ambiguous and emit clarifying question | Queries missing blocking variables (location, target, topic) get ambiguous shape + directResponse clarifier |
| UC-INT-05 | Run deterministic regex backstop for recommendation queries | Pre-LLM regex catches "find me N" patterns and overrides LLM if it disagrees |
| UC-INT-06 | Pass queryShape hint to specialist when dispatching | Orchestrator prepends a system message hint to specialist dispatch when queryShape is non-default |
| UC-INT-07 | Handle low-confidence triage via fallback to monolithic agent | Low confidence bypasses specialist dispatch and uses full HOLOCRON_SYSTEM_PROMPT with all tools |
| UC-INT-08 | Validate and recover from malformed triage JSON | JSON parse failures, missing fields, and invalid enum values fall back gracefully |
| UC-INT-09 | Persist triage output to user message and telemetry | Triage result attached to user message cardData and recorded in agentTelemetry table |
| UC-INT-10 | Run eval harness against canonical fixture set in CI | Vitest test asserts ≥ 90% accuracy and that the canonical failing case routes to find_recommendations |
| UC-INT-11 | Inspect routing decisions via telemetry queries | Dev can run `npx convex run chat/telemetryQueries:listRecentClassifications` to audit recent routing |

---

## UC-INT-01 — Emit queryShape from triage in single LLM call

Extend `classifyIntent()` in `convex/chat/triage.ts` to return `queryShape: "factual" | "recommendation" | "comprehensive" | "exploratory" | "ambiguous"` alongside the existing fields.

### Acceptance Criteria

- ☐ Triage emits `queryShape` as one of the 5 enum values on every classification call
- ☐ System validates `queryShape` against `VALID_QUERY_SHAPES` constant and falls back to `factual` on invalid value
- ☐ Triage LLM call latency stays under 300ms p95 with the added field
- ☐ System uses `zaiFlash` model for the triage call (no upgrade to zaiPro)
- ☐ System falls back to `factual` queryShape when LLM output is missing the field entirely
- ☐ Backend logs both raw LLM response and validated output to telemetry for prompt drift detection

---

## UC-INT-02 — Classify recommendation queries as queryShape=recommendation

Triage detects queries asking for specific named providers, services, or products and tags them with `queryShape: "recommendation"`.

### Acceptance Criteria

- ☐ Triage emits `queryShape='recommendation'` for queries containing "find me N", "best X in Y", "top N", or "referrals"
- ☐ Triage emits `queryShape='recommendation'` for "who should I hire for X" and "where can I find X near me"
- ☐ Triage does NOT emit `queryShape='recommendation'` for "what is X" or "how does X work"
- ☐ Triage pairs `intent='research'` with `queryShape='recommendation'` for the canonical failing case ("career coaches for people with autism in San Francisco — provide 3-5 highly rated referrals")
- ☐ Triage pairs `intent='commerce'` with `queryShape='recommendation'` for product searches ("best standing desk under $400")

---

## UC-INT-03 — Classify comprehensive-report queries as queryShape=comprehensive

Triage detects queries explicitly asking for long-form saved reports and tags them with `queryShape: "comprehensive"`.

### Acceptance Criteria

- ☐ Triage emits `queryShape='comprehensive'` for queries containing "comprehensive report", "deep dive", "thorough analysis", or "complete guide"
- ☐ Triage does NOT emit `queryShape='comprehensive'` just because a query contains "highly rated" or "best" (those are recommendation signals, not comprehensiveness signals)
- ☐ Triage pairs `intent='research'` with `queryShape='comprehensive'` when the user explicitly asks for a saved report
- ☐ Triage does NOT emit `queryShape='comprehensive'` based on the topic appearing complex — only on explicit user signal

---

## UC-INT-04 — Classify vague queries as queryShape=ambiguous and emit clarifying question

Triage detects queries missing blocking variables (location, count, topic, target) and emits `queryShape: "ambiguous"` with a one-sentence clarifying question in `directResponse`.

### Acceptance Criteria

- ☐ Triage emits `queryShape='ambiguous'` for "find me a coach" (missing location, specialty)
- ☐ Triage emits `queryShape='ambiguous'` for "save this" when no prior content in conversation
- ☐ Triage emits `queryShape='ambiguous'` for "research stuff" or "help me with autism"
- ☐ System emits `directResponse` as non-null when `queryShape='ambiguous'`
- ☐ System falls back to generic "Could you tell me more about what you're looking for?" if directResponse is missing despite `queryShape='ambiguous'`
- ☐ System sets `pendingIntent` and `pendingQueryShape` on the conversation when emitting an ambiguous clarification

---

## UC-INT-05 — Run deterministic regex backstop for recommendation queries

A pure-TypeScript regex pre-filter (`convex/chat/triageRegex.ts`) runs before the LLM and catches high-precision recommendation patterns. It overrides the LLM's `queryShape` if they disagree.

### Acceptance Criteria

- ☐ System runs regex pre-check on user message in under 5ms
- ☐ System matches "find me N", "top N", "best N", "highly rated", "referrals for", "who should I hire", "where can I find" via regex
- ☐ System overrides LLM's `queryShape` to `recommendation` when regex matches a recommendation pattern AND LLM returned something else
- ☐ System logs every override to telemetry with `classificationSource: "regex"`
- ☐ System trusts LLM when regex doesn't match (regex is a backstop, not a replacement)
- ☐ Regex pre-filter lives in a pure module with no Convex imports so it is unit-testable without convex-test

---

## UC-INT-06 — Pass queryShape hint to specialist when dispatching

The orchestrator passes the `queryShape` to the specialist as a system message preamble so the specialist biases tool selection correctly.

### Acceptance Criteria

- ☐ Orchestrator prepends a system message to specialist dispatch when queryShape is non-default
- ☐ Research specialist receives "Use find_recommendations" hint when queryShape is `recommendation`
- ☐ Research specialist receives "Use deep_research" hint when queryShape is `comprehensive`
- ☐ Research specialist receives "Default to answer_question" hint when queryShape is `factual`
- ☐ Specialist still has final authority on tool choice (hint is a strong prior, not a hard constraint)

---

## UC-INT-07 — Handle low-confidence triage via fallback to monolithic agent

When triage returns `confidence: "low"`, the orchestrator bypasses specialist dispatch and falls back to the monolithic agent prompt with all 21 tools.

### Acceptance Criteria

- ☐ Orchestrator ignores `directResponse` when `confidence='low'` (safety valve)
- ☐ Orchestrator ignores `queryShape` when `confidence='low'` (treat as undefined)
- ☐ Orchestrator falls back to full HOLOCRON_SYSTEM_PROMPT with all tools when confidence is low
- ☐ System logs low-confidence triage decisions to telemetry for later eval

---

## UC-INT-08 — Validate and recover from malformed triage JSON

Triage parsing gracefully handles LLM returning invalid JSON, missing fields, or invalid enum values without throwing.

### Acceptance Criteria

- ☐ System extracts JSON from markdown code blocks if present (existing `/\{[\s\S]*\}/` regex pattern)
- ☐ System returns `fallbackResult()` (intent=conversation, confidence=low) on JSON parse failure
- ☐ System validates `queryShape` against `VALID_QUERY_SHAPES` and defaults to `factual` on invalid
- ☐ System logs every parse failure to telemetry for model regression tracking
- ☐ System does NOT crash or return 500 on malformed triage output
- ☐ System truncates raw LLM response to 2000 chars before persisting

---

## UC-INT-09 — Persist triage output to user message and telemetry

Every triage call writes to the new `agentTelemetry` table and attaches the result to the user message's `cardData` for client-side inspection.

### Acceptance Criteria

- ☐ Backend attaches triage result to the user message `cardData` on every send
- ☐ System writes a new `agentTelemetry` row on every classification call
- ☐ Mobile client can read triage result from the message without a separate query (reactive subscription stays atomic)
- ☐ Telemetry row includes: intent, queryShape, confidence, classificationSource, specialistUsed, toolsCalled, durationMs, regexMatchPattern, ambiguousIntents, rawLlmResponse (truncated), clarificationQuestion
- ☐ System sets `classificationSource` to one of: `regex`, `llm`, `fallback`, `pending_rehydrate`

---

## UC-INT-10 — Run eval harness against canonical fixture set in CI

A vitest test runs the eval fixtures through `classifyIntent` (LLM mocked) and asserts on routing accuracy. CI fails if accuracy drops below 90% or if the canonical failing case fails to route to `find_recommendations`.

### Acceptance Criteria

- ☐ Eval fixture file contains 30+ test cases covering every intent and queryShape
- ☐ Each fixture has `{query, expectedIntent, expectedQueryShape, expectedTool}` fields
- ☐ Failing-case fixture is present — "career coaches for people with autism in SF" → research/recommendation/find_recommendations
- ☐ Eval test fails when overall routing accuracy drops below 90%
- ☐ Eval test fails when the failing-case fixture does not route to find_recommendations
- ☐ Eval test runs in under 60s (mocks LLM with fixture responses, not real Jina/zaiFlash calls)
- ☐ Live eval flag (`RUN_LIVE_EVALS=true`) enables non-CI verification against real zaiFlash

---

## UC-INT-11 — Inspect routing decisions via telemetry queries

Convex queries in `convex/chat/telemetryQueries.ts` allow dev inspection via `npx convex run` or the Convex MCP `runOneoffQuery` tool.

### Acceptance Criteria

- ☐ Query `listRecentClassifications` returns the last N turns with routing decisions
- ☐ Query `countByQueryShape` returns a histogram by queryShape over a time range
- ☐ Query `findDivergences` returns turns where regex and LLM disagreed
- ☐ Query `getTurnDetails` returns a single turn's full telemetry including raw LLM response
- ☐ All queries use `withIndex` (no `filter()`) for performance
- ☐ Queries are callable via `npx convex run chat/telemetryQueries:<queryName> --<args>`

---
status: Completed
sprint: 17
agent: mastra-implementer
---

# research-1 — Pure-TS evidence gate

Implement and extend `services/platform/src/research/evidence-gate.ts` as the only admission authority. Persist no executable payloads; return deterministic component coverage, grade/entailment/independence diagnostics, and symmetric supporting/refuting verdicts. Add malformed-input fail-closed cases and stable canonical output.

Completed: thin/full/refuting fixtures and `gate:eval --claims/--refuting` are implemented and tested; admission is pure TypeScript with canonical source independence, quote/entailment, component, grade, and disconfirmation checks. See `gate-results.json`.

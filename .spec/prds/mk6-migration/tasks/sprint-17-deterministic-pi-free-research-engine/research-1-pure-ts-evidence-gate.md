---
status: In Progress
sprint: 17
agent: mastra-implementer
---

# research-1 — Pure-TS evidence gate

Implement and extend `services/platform/src/research/evidence-gate.ts` as the only admission authority. Persist no executable payloads; return deterministic component coverage, grade/entailment/independence diagnostics, and symmetric supporting/refuting verdicts. Add malformed-input fail-closed cases and stable canonical output.

Current partial GREEN: thin/full/refuting fixtures and `gate:eval --claims` are implemented and tested.

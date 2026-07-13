---
stability: CONSTITUTION
last_validated: 2026-07-13
prd_version: 2.0.0
---

# Runtime Contracts

These contracts convert the platform decisions into gates that are executable before deep migration work begins. They are intentionally implementation-neutral where a Sprint-0 spike must select a compatible package or provider.

## Mastra compatibility lock

The committed lockfile is the authority for an exact, compatible set of Bun, `@mastra/core`, `@mastra/pg`, `@mastra/mcp`, AI SDK, and Zod versions. The compatibility record must name every exact version, its release date, the verified Postgres/Bun combination, and the upgrade procedure. Version ranges such as “Mastra 1.x” are not an acceptance contract.

Sprint 0 may select the exact `@mastra/pg` version only after a real-Bun compatibility spike. The spike is green only when the locked set boots one agent, tool, workflow, MCP transport, and OTel trace against real Postgres. Any upgrade requires the same matrix and an explicit compatibility-record change.

## Mission Template DSL and executor registry

Mission templates are versioned declarative records, not serialized executable Mastra workflows. A closed DSL may reference only a code-owned registry entry:

```text
stageId → { executorId, executorVersion, inputSchemaVersion, outputSchemaVersion }
```

The run record persists the template, compiler, executor, and schema versions in force. Unknown or incompatible stage/role versions fail before run creation. A suspended run resumes only with its pinned compatible executor; removing an executor requires an explicit migration or a fail-closed terminal outcome. Postgres rows never contain executable JavaScript, functions, or serialized Zod schemas.

## Fleet Role Manifest

Before any mission can start, a versioned manifest must declare for each role (`divergent`, `convergent`, `judge`, `embed`, `rerank`): tailnet DNS/endpoint, LiteLLM model ID, model revision, context limit, concurrency, timeout, structured-output capability, embedding dimension and query/document prefix policy where relevant, health probe, and degradation action.

Startup validates this manifest from the mini. A required role that is unreachable or lacks a declared capability fails closed for that role; it may use only the degraded mode documented for the calling mission, never an implicit cloud fallback.

## Durable work and observable effects

The queue provides **at-least-once execution with exactly-once observable effects**. A lease or `SKIP LOCKED` alone is not exactly once after process death.

Every observable effect uses a transactional outbox/inbox contract: the domain transaction writes an outbox entry and stable idempotency key; a fenced consumer records a dedupe outcome; providers receive an idempotency key where supported or a documented compensating action where not. The effect record identifies its producer, lease/fencing token, idempotency key, retry state, and terminal outcome.

## Evals and guardrail outcomes

The eval constitution defines versioned datasets and baselines per specialist, retrieval surface, and evidence gate; deterministic scorers for hard invariants; judge model/prompt versions; thresholds; trace replay; and CI failure policy. A stored single judge score is insufficient.

Input, output, processor, or mid-stream tripwires produce a typed terminal `blocked` outcome. The terminal SSE event is auditable, unsafe output is not committed, prohibited tools are not dispatched, and the app shows a non-hanging state. A deliberately bad fixture must fail the configured regression threshold.

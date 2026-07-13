---
stability: CONSTITUTION
last_validated: 2026-07-12
prd_version: 1.0.0
---

# API Design

Per ADR-001 the loop is local; the surface is (a) the local ledger module + CLI (the Prospector `prospect` interface), (b) the pure Gate module, and (c) a thin Convex publish surface. No public HTTP API in scope.

## Local — Missions & Gate (the `prospect` CLI / ledger module, SQLite-backed)

Reused from the Prospector core; these operate directly on the local SQLite ledger.

| Command / function | Contract |
|--------------------|----------|
| `prospect mission create` | `{ rootQuestion, type, contract }` → `missionId` (writes `missions` + contract version) |
| `prospect mission publish-contract` | `{ missionId, contract }` → `{ version }` (append-only; sets active; triggers re-score) |
| `prospect mission publish-tiers` | `{ missionId, domains[] }` → `{ version }` |
| `prospect mission seed` | `{ missionId, seeds[] }` → `{ candidateIds[] }` |
| `prospect verdict` | `{ candidateId, verdict, citedClaimId?, kind }` → enforces WIP=1, probe-gate, cited-kill; writes verdict + touch |
| `prospect probe` | `{ candidateId, kind, result }` → `probeId` |
| `prospect judge` | `{ candidateId, component, value, rationale }` → judgment score |
| `prospect ack` | `{ missionId, briefId }` → writes an explicit touch (resets ceiling) |
| `prospect brief` | `{ missionId }` → Markdown brief (repo file) + triggers publish of movers |
| `prospect dossier` | `{ candidateId }` → Markdown dossier with full evidence chain |

## Local — Loop internals (in the worker)

| Function | Contract |
|----------|----------|
| `scheduler.tick()` | the worker's own loop: checks budget/breaker/ceiling/fleet; selects a work item |
| `selector.next(missionId)` | → `{ workItemType, workItemId, phase }` by the EVoI rule (+ starvation floor), a SQLite query |
| `cycle.commit(idempotencyKey, {...})` | one append-only SQLite transaction (evidence, claims, score, lineage, cycle row); replay-safe via unique `idempotencyKey`; kill-9 all-or-nothing |
| `fleet.report({endpoint, role, state})` | updates the local `fleet_health` table |

## Convex — publish surface (the only cross-machine calls)

| Function | Kind | Contract |
|----------|------|----------|
| `documents/storage:createWithEmbedding` (existing) | action | `{ title, content, category, source:'fulcrum', candidateRef }` → publishes a finding (Cohere 1024-dim embed, idempotent upsert) |
| `fulcrum/runs:upsertProjection` (new, optional) | mutation | `{ missionId, leaderboard[] }` → thin read-only projection for the app |

## Worker — main loop (Bun)

Fully local; the only network calls are retrieval (SENSE) and publish (post-COMMIT).

```
loop:
  if budgetExhausted() || breakerOpen() || ceilingTripped(): sleepOrSenseOnly(); continue
  fleet = checkLocalEndpoints(); ledger.fleet.report(fleet)    // laptop:4545 / mini:8000
  if fleet.offline && !fallbackEnabled: senseOnly(); continue
  item = ledger.selector.next(missionId)                       // local SQLite query
  cycleKey = idempotencyKeyFor(item)
  result = runCyclePhases(item, provider, gate)                // local inference + local Gate
  ledger.cycle.commit(cycleKey, result)                        // local SQLite, replay-safe, kill-9 safe
  publishIfMaterial(result) -> convex documents (queues if Convex down)
```

- **Idempotency & crash-safety**: `cycleKey` is derived deterministically per work item; `cycle.commit` is unique on it and returns the stored result on replay. A kill-9 mid-cycle leaves at most the in-flight cycle and never a partial commit (the Prospector SIGKILL durability guarantee).
- **No Convex dependency in the hot loop**: selection, cycle, gate, and commit are all local; Convex is touched only to publish a finished finding, and a publish failure queues without stalling the loop.

## Local Inference Provider (worker-side)

```ts
// createOpenAI from @ai-sdk/openai, pointed at a LOCAL base URL
const provider = createOpenAI({ baseURL: cfg.baseUrl /* laptop:4545/v1 | mini */, apiKey: cfg.key ?? 'local' });
export function modelFor(role: 'divergent' | 'convergent'): LanguageModel;  // resolves cfg.roleMap
// invariant: assertDistinct(modelFor('convergent' /*ASSAY*/), modelFor('divergent' /*CHALLENGE*/))
```

## Evidence Gate — pure module (no I/O, no model)

```ts
gradeEvidence(tierValue: number | null, retrievedAt: number, halfLifeDays: number, now: number): number | null
verifyQuote(quote: string, normalizedSource: string): boolean                       // deterministic substring
evaluateAdmission(claim, gradedEvidence[], policy, now): { status, passesGate, qualifyingGrade, reasons }
provenanceSweep(candidateClaims): demotions[]                                        // syndication + self-sourced
computeScore(claims, judgments, contract): { score, disconfirmationTotal, components[] }  // top-3 mean, ×m, UNKNOWN
```

The Gate runs entirely in the worker against the local ledger — admission at ASSAY time and deterministic recompute on re-score. One implementation, identical results; no model, no network. (Reused verbatim from the Prospector core.)

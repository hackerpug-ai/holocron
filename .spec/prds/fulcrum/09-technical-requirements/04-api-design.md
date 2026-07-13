---
stability: CONSTITUTION
last_validated: 2026-07-12
prd_version: 1.0.0
---

# API Design

Fulcrum's surface is (a) Convex functions (queries/mutations/actions/workflow), (b) the Worker's dispatch contract, and (c) the pure Gate module. No public HTTP API in scope. Signatures below are the contract; Convex validators (`v.*`) enforce argument shapes.

## Convex — Missions & Gate (mutations/queries)

| Function | Kind | Contract |
|----------|------|----------|
| `fulcrum.missions.create` | mutation | `{ rootQuestion, type, contract }` → `missionId` |
| `fulcrum.missions.publishContractVersion` | mutation | `{ missionId, contract }` → `{ version }` (append-only; sets active; triggers re-score) |
| `fulcrum.missions.publishDomainTiers` | mutation | `{ missionId, domains[] }` → `{ version }` |
| `fulcrum.missions.seed` | mutation | `{ missionId, seeds[] }` → `{ candidateIds[] }` |
| `fulcrum.gate.verdict` | mutation | `{ missionId, candidateId, verdict, citedClaimId?, kind }` → enforces WIP=1, probe-gate, cited-kill; writes verdict + touch |
| `fulcrum.gate.recordProbe` | mutation | `{ missionId, candidateId, kind, result }` → `probeId` |
| `fulcrum.gate.judge` | mutation | `{ missionId, candidateId, component, value, rationale }` → judgment score |
| `fulcrum.gate.ackBrief` | mutation | `{ missionId, briefId }` → writes an explicit touch (resets ceiling) |
| `fulcrum.reports.brief` | query→action | `{ missionId }` → Markdown brief (also stored to `documents`) |
| `fulcrum.reports.dossier` | query→action | `{ candidateId }` → Markdown dossier with full evidence chain |

## Convex — Loop internals (internal functions, not operator-facing)

| Function | Kind | Contract |
|----------|------|----------|
| `fulcrum.scheduler.tick` | cron→workflow | wakes the loop; checks budget/breaker/ceiling; enqueues a work item |
| `fulcrum.selector.next` | internalQuery | `{ missionId }` → `{ workItemType, workItemId, phase }` by the EVoI rule (+ starvation floor) |
| `fulcrum.queue.lease` | internalMutation | worker leases the next `fulcrumWorkQueue` row → `{ cycleKey, payload }` |
| `fulcrum.cycle.commit` | internalMutation | `{ idempotencyKey, evidence[], claims[], score, lineage[], cycleLog }` → one append-only transaction; replay-safe |
| `fulcrum.fleet.report` | internalMutation | `{ endpoint, role, state }` → updates `fulcrumFleetHealth` |

## Worker — dispatch contract (Bun, tailnet)

The worker is a long-running Bun process using the Convex client. It does not expose HTTP; it *pulls* work.

```
loop:
  item = convex.mutation(fulcrum.queue.lease, { workerId })   // durable lease; empty → sleep
  if !item: sleep(pollIntervalMs); continue
  fleet = checkLocalEndpoints()                               // health of laptop:4545 / mini:8000
  convex.mutation(fulcrum.fleet.report, fleet)
  if fleet.offline && !fallbackEnabled: convex.mutation(markSenseOnly); continue
  result = runCyclePhases(item, provider, gate)               // SENSE/GENERATE/ASSAY/CHALLENGE local inference + Gate
  convex.mutation(fulcrum.cycle.commit, { idempotencyKey: item.cycleKey, ...result })  // replay-safe
```

- **Idempotency**: `cycleKey` is assigned at lease time and stable across re-leases; `fulcrum.cycle.commit` short-circuits to the stored `resultJson` if the key already committed.
- **Crash-safety**: a lease has an expiry; an unfinished lease is re-dispatched; the commit's uniqueness on `idempotencyKey` guarantees exactly-once effect.

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

The Gate is imported by both the Worker (to decide admission before proposing a commit) and Convex (to recompute on re-score) — one implementation, identical results, callable from either runtime.

---
stability: CONSTITUTION
last_validated: 2026-08-20
prd_version: 3.0.0
---

# API Design

The operator surface is (a) generated Markdown, (b) the `holo fulcrum` CLI over existing mission HTTP APIs, and (c) the pure Gate module. There is no `prospect *` CLI. There is no Convex `createWithEmbedding`. There is no `scheduler.tick()`. There is no unnamed "minimal verdict entry point."

## Reads — generated Markdown

| Artifact | Path | How it is produced |
|----------|------|--------------------|
| Daily brief | `.holocron/fulcrum/briefs/{YYYY-MM-DD}.md` (in-repo) and a `documents` row via `publishDocumentForRun` | Deterministic renderer over the evidence graph. Contains a section titled **Loop health**. |
| Candidate dossier | `.holocron/fulcrum/dossiers/{candidateId}.md` (in-repo) and a `documents` row | Same renderer. Linked from the brief by **Markdown path**, not by in-app navigation. |

CLI read helpers (print the file; they do not "navigate"):

```
holo fulcrum brief [--mission <id>]
holo fulcrum dossier <candidateId>
```

## Writes — named CLI over mission APIs

| Command | HTTP | Contract |
|---------|------|----------|
| `holo fulcrum '<goal>' [--claims <json>] [--json]` | `POST /api/missions` (existing on-demand path) | Instantiates the `fulcrum` alias of `evidence-research`. Already shipped. |
| `holo fulcrum verdict <runId> <kill\|advance\|redirect\|boost> [--cite <claimId>] [--kind fit\|validity]` | **`POST /api/missions/:id/verdicts`** (already exists) | Writes a `mission_verdicts` row. Enforces WIP=1, cited-kill, probe-gated `→validated`. |
| `holo fulcrum ack-brief <runId> <briefId>` | **`POST /api/missions/:id/touches`** (new endpoint) | Named mutation **`ackBrief`**. Inserts a `touches` row with `touch_type='brief_ack'`. A file read of the brief does **not** write a touch. |
| `holo fulcrum probe <candidateId> --kind <calls\|smoke_test\|pilot> --result <text>` | `POST /api/missions/:id/probes` (new endpoint) | Records a `probes` row. Probe *tooling* (outreach, smoke-test scaffolding) is out of scope; **recording** is in scope. |
| `holo fulcrum seed <missionId> --from <path>` | `POST /api/missions` args | Bootstrap `candidates` from existing material. |

`ackBrief` is the mutation name. The CLI verb is `holo fulcrum ack-brief`. The HTTP path is `POST /api/missions/:id/touches`. T-GATE-017 asserts this named path, not an undefined symbol.

## Loop internals (Mastra service — not a worker tick)

| Function | Contract |
|----------|----------|
| `fulcrum:cycle` (`MIGRATED_JOBS` row) | Cadence from the mission contract (default `interval 15m`). Lease owner = `scheduler-worker` via `mission_runs.lease_owner`. Checks daily budget, breaker, ceiling, per-role fleet availability; then selects a work item and dispatches `mission:execute`. |
| `selector.next(missionId)` | Pure Postgres query → `{ workItemType, workItemId, phase }` by the EVoI rule + challenge-starvation floor. |
| `mission:execute` | Existing job handler path. Runs the compiled `evidence-research` template (Fulcrum alias) through GENERATE + MAP once those stages are registered. Commit is one transaction under `mission_runs.idempotency_key`. |
| Gate module | See below. Called from the `gate` stage executor (`evidence-gate`), not from an agent tool. |

## Mission HTTP (already shipped)

| Route | Kind | Contract |
|-------|------|----------|
| `POST /api/missions` | create/execute | Compile + run a template. Fulcrum uses `templateKey=evidence-research` with instantiation tag `fulcrum`. |
| `GET /api/missions/:id` | status | Run row + stages + usage. |
| `POST /api/missions/:id/verdicts` | **existing** | `{ verdict, rationale?, requestKey, payloadJson? }` → `{ ok, replay, runId, verdict, event, run }`. Fulcrum maps `kill` / `advance` / `redirect` / `boost` onto this body. |
| `POST /api/missions/:id/steer` | existing | Free-form steering; not the verdict machine. |
| `POST /api/missions/:id/touches` | **new** | `{ briefId, requestKey }` → `touches` row. CLI: `holo fulcrum ack-brief`. |
| `POST /api/missions/:id/probes` | **new** | `{ candidateId, kind, result, requestKey }` → `probes` row. |

## Evidence Gate — pure module (no I/O, no model, no fleet role)

```ts
gradeEvidence(tierValue: number | null, retrievedAt: number, halfLifeDays: number, now: number): number | null
verifyQuote(quote: string, normalizedText: string): boolean   // substring of the fetch artifact, never RRF sourceText
evaluateAdmission(claim, gradedEvidence[], policy, now): { status, passesGate, qualifyingGrade, reasons }
provenanceSweep(candidateClaims): demotions[]
computeScore(claims, judgments, contract): { score, disconfirmationTotal, components[] }
```

Invariant: **no `generateText` and no fleet role inside gate or score modules.** Reviewer greps for both. `judge` never appears.

## Perpetual loop (scheduler-worker, not `scheduler.tick()`)

```
loop (scheduler-worker over MIGRATED_JOBS):
  lease due job named fulcrum:cycle
  if dailyBudgetExhausted() || breakerOpen() || ceilingTripped(): record reason on mission_runs; continue
  item = selector.next(missionId)                 // Postgres
  cycleKey = idempotencyKeyFor(item)
  dispatch mission:execute(template=evidence-research, tag=fulcrum, idempotencyKey=cycleKey)
  on commit: publishDocumentForRun if the synthesis changed
```

- **Idempotency & crash-safety**: `cycleKey` is unique on `mission_runs`; replay returns the stored commit. A kill-9 of the Mastra service or scheduler-worker leaves at most the in-flight lease; resume is from Postgres `lease_owner` / `lease_expires_at`.
- **Daily budget**: mission `budgets` (wallMs, tokens, cost, maxSteps) plus a daily cycle ceiling on the mission contract. The job must not launch a new cycle once either is hit.

## Retrieval contract (SENSE)

Mastra registry tool IDs (live today; **no Exa/Jina**):

- `hybrid_search`
- `search_fts`
- `search_vector`
- `search_research`
- `get_research_session`
- `get_document`

The Fulcrum template's `toolGrants` MUST list the tools SENSE is allowed to call (today the alias ships `toolGrants: []` — Fulcrum fills this). Ban-list and per-domain courtesy delays are **Zod fields on the mission contract** and are enforced in the retrieval client (filter by `source_domain`; delay before any outbound host — today there is no outbound host, so the fields still validate and corpus hits on banned domains are dropped).

SENSE is **corpus-only**. The problem statement is: find and grade evidence already in holocron (`documents` / `passages` / prior `sources`). It is not "fetch the live web via `convex/research/tools.ts`."

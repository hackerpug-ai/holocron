---
stability: CONSTITUTION
last_validated: 2026-07-12
prd_version: 1.0.0
---

# Data Schema

New Convex tables under a `fulcrum*` namespace, defined in `convex/schema.ts` alongside the existing `deepResearchSessions` / `documents` tables. All ledger tables are **append-only** (corrections are new rows). Convex document IDs are the primary keys; `_creationTime` is the built-in timestamp. Grades/scores are numbers in [0,1]; enums are validated with Convex validators (`v.union(v.literal(...))`).

The blueprint in `idea-factory/.spec/prospector/blueprint-schema-ledger-v1.1.md` is the reference model (it targets SQLite; here the same shape maps onto Convex tables + indexes, and Convex's function-transaction model replaces the SQLite transaction).

| Table | Mutability | Key fields | Purpose |
|-------|-----------|-----------|---------|
| `fulcrumMissions` | mutable pointer | rootQuestion, type (`outcome`\|`inquiry`), objective, activeContractVersion, degradationCeilingMs, status | One row per mission; points at its active contract version |
| `fulcrumContractVersions` | append-only | missionId, version, components[] (name, kind `evidence`\|`judgment`, weight, gradeFloor, recencyWindowDays, halfLifeDays, rubric?), disconfirmationMultiplier, scopeJson, sourceRulesJson, cellsJson, cadenceJson, wipJson | Versioned fitness contract; scores reference the version |
| `fulcrumDomainTierVersions` + `fulcrumDomainTiers` | append-only | missionId, version, registrableDomain, tier, tierValue | Versioned deterministic grading ladder; unknown domain = absent row = unclassified |
| `fulcrumCandidates` | mutable (stage/score pointer/niche/closeout) | missionId, title, stage (`raw`\|`developing`\|`contender`\|`validated`\|`retired`\|`killed`), nicheKey, currentScore, currentScoreId, closeoutClaimId | The prospects; findings also mirror to `documents` |
| `fulcrumEvidence` | **immutable** | missionId, sourceUrl, sourceDomain (eTLD+1), retrievedAt, extractedContent, contentHash (unique), provenanceGroup, selfSourced | Immutable evidence objects; content-hash dedupe; provenance group for syndication collapse |
| `fulcrumClaims` | mutable (status) | missionId, candidateId, component, polarity (`support`\|`refute`), assertion, status (`admitted`\|`provisional`\|`contested`\|`refuted`), passesGate, qualifyingGrade, targetClaimId | Claims about candidates; status derived by the gate |
| `fulcrumClaimEvidence` | append-only | claimId, evidenceId, sourceDomain, provenanceGroup, selfSourced | n:m bindings with denormalized provenance for single-scan independence |
| `fulcrumScores` | append-only | missionId, candidateId, cycleId, contractVersion, domainTierVersion, score, disconfirmationTotal, componentsJson | Score history; every score stamps the versions used |
| `fulcrumJudgmentScores` | append-only | missionId, candidateId, component, contractVersion, value, rationale | Operator rubric scores for judgment-kind components (buildability/fit) |
| `fulcrumLineage` | append-only | missionId, childCandidateId, parentCandidateId?, operation (`seed`\|`mutation`\|`crossover`\|`merge`\|`split`), evidenceDeltaJson, cycleId | Candidate ancestry — the "flow of ideas" |
| `fulcrumCycles` | append-only | missionId, idempotencyKey (unique), workItemType, workItemId, phase (`diverge`\|`converge`), outcome (`committed`\|`budget_exceeded`\|`failed`), contractVersion, domainTierVersion, budgetJson, spentJson (tokens, wallMs, per-role), actionsJson, resultJson | The experiment log + idempotency anchor + inference telemetry |
| `fulcrumVerdicts` | append-only | missionId, candidateId, verdict (`kill`\|`advance`\|`redirect`\|`boost`), citedClaimId?, stageFrom, stageTo, kind (`fit`\|`validity`), rationale | Human gate decisions; calibration signal |
| `fulcrumTouches` | append-only | missionId, touchType (`verdict`\|`brief_ack`), source, refId | Explicit human acknowledgments; drives the degradation ceiling |
| `fulcrumProbes` | append-only | missionId, candidateId, kind (`calls`\|`smoke_test`\|`pilot`), result, note | Recorded reality-probe results; required for `advance → validated` |
| `fulcrumWorkQueue` | mutable (lease) | missionId, kind, status (`pending`\|`leased`\|`done`\|`failed`), cycleKey, leaseOwner, leaseExpiresAt, payloadJson | Durable Convex→Worker dispatch; lease + idempotency for crash-safety |
| `fulcrumFleetHealth` | mutable | endpoint, role, state (`healthy`\|`degraded`\|`offline`), lastOkAt, note | Fleet reachability the loop reads to pick normal vs reduced mode |

## Invariants (enforced by mutations, not convention)

- **Append-only** tables reject updates/deletes at the mutation layer (no mutation exposes an edit path; corrections append).
- **`fulcrumEvidence.contentHash` is unique** per mission — exact-retrieval dedupe.
- **A score references exactly one `contractVersion` and one `domainTierVersion`** — historical interpretability.
- **`fulcrumCycles.idempotencyKey` is unique** — re-dispatch collapses to one commit; the stored `resultJson` is returned on replay.
- **A candidate advances to `validated` only if a `fulcrumProbes` row exists** for it; **only one candidate per mission may be non-terminal in active build** (WIP=1) — enforced in the verdict mutation.

## Relationship to existing holocron tables

- Fulcrum **findings** (a candidate's current synthesis) publish into the existing `documents` table (with embeddings) so they are searchable via holocron's existing hybrid/vector search — Fulcrum consumes the same retrieval surface it feeds.
- Fulcrum **may reference** `deepResearchSessions` when a cycle reuses the existing deep-research pipeline for a heavy SENSE retrieval, but its durable truth is the `fulcrum*` ledger, not the session tables.

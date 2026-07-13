---
stability: CONSTITUTION
last_validated: 2026-07-13
prd_version: 1.0.1
---

# Data Schema

> **⚠️ Re-platform pending (v2.0.0, 2026-07-13).** The opening sentence below ("Per ADR-001 … LOCAL `bun:sqlite`") is **superseded by [ADR-004](./00-architecture-decisions.md)** — the ledger is now **Postgres append-only tables on the mk6 substrate** (Prospector v1.1 schema/logic reused; storage engine swapped SQLite → Postgres). The entity model, relationships, and invariants below carry forward; the DDL must be re-derived as Postgres against the mk6 substrate schema.

**Per ADR-001, the loop's ledger of record is a LOCAL `bun:sqlite` database** — the Prospector v1.1 schema (`idea-factory/.spec/prospector/blueprint-schema-ledger-v1.1.md`, already implemented to 31/37 ACs on branch `task/prospector-schema`). The tables below are that **local SQLite** schema, reused, not Convex tables. Holocron/Convex receives only *published findings* (ADR-002). Two schemas, one direction of flow: **local ledger → published documents.**

## A. Local ledger (bun:sqlite — source of truth, reused from Prospector)

Append-only ledger tables carry UPDATE/DELETE-blocking triggers (SQLite-enforced immutability — a guarantee Convex cannot give); WAL + idempotent commit provide kill-9 all-or-nothing durability. IDs are UUIDv7; timestamps INTEGER ms UTC; grades/scores REAL in [0,1]; enums are CHECK-constrained. This is the Prospector `0001_init.sql` schema, namespaced for Fulcrum missions.

| Table | Mutability | Key fields | Purpose |
|-------|-----------|-----------|---------|
| `missions` | mutable pointer | rootQuestion, type (`outcome`\|`inquiry`), objective, activeContractVersion, degradationCeilingMs, status | One row per mission; points at active contract version |
| `mission_weight_versions` + `mission_weights` | append-only | component (name, kind `evidence`\|`judgment`, weight, gradeFloor, recencyWindowDays, halfLifeDays, rubric?), disconfirmationMultiplier | Versioned fitness contract; scores reference the version |
| `domain_tier_versions` + `domain_tiers` | append-only | registrableDomain, tier, tierValue | Versioned deterministic grading ladder; unknown domain = absent row = unclassified |
| `scheduler_weight_versions` + `scheduler_weights` | append-only | term, weight | Versioned EVoI selector weights |
| `prospects` (candidates) | mutable (stage/score-ptr/niche/closeout) | stage (`raw`\|`developing`\|`contender`\|`validated`\|`retired`\|`killed`), nicheKey, currentScore, closeoutClaimId | The candidates |
| `evidence` | **immutable** (trigger) | sourceUrl, sourceDomain (eTLD+1), retrievedAt, extractedContent, contentHash (unique), provenanceGroup, selfSourced | Immutable evidence; content-hash dedupe; provenance group for syndication collapse |
| `claims` | mutable (status) | component, polarity (`support`\|`refute`), assertion, status (`admitted`\|`provisional`\|`contested`\|`refuted`), passesGate, qualifyingGrade, targetClaimId | Claims about candidates |
| `claim_evidence` | append-only | claimId, evidenceId, sourceDomain, provenanceGroup, selfSourced | n:m bindings with denormalized provenance |
| `scores` | append-only | contractVersion, domainTierVersion, score, disconfirmationTotal, componentsJson | Score history; stamps versions used |
| `judgment_scores` | append-only | component, contractVersion, value, rationale | Operator rubric scores for judgment-kind components |
| `lineage` | append-only | childProspectId, parentProspectId?, operation, evidenceDeltaJson, cycleId | Candidate ancestry |
| `cycles` | append-only | idempotencyKey (unique), workItemType/id, phase, outcome (`committed`\|`budget_exceeded`\|`failed`), spentJson (tokens, wallMs, per-role), resultJson | Experiment log + idempotency anchor + inference telemetry |
| `verdicts` | append-only | verdict (`kill`\|`advance`\|`redirect`\|`boost`), citedClaimId?, kind (`fit`\|`validity`), stageFrom/To | Human gate decisions |
| `touches` | append-only | touchType (`verdict`\|`brief_ack`), source, refId | Explicit human acknowledgments; drives degradation ceiling |
| `probes` | append-only | kind (`calls`\|`smoke_test`\|`pilot`), result | Reality-probe results; required for `advance → validated` |
| `jobs` (work queue) | mutable (lease) | kind, status, cycleKey, leaseOwner, leaseExpiresAt | Internal work queue for the worker's own scheduling |
| `fleet_health` | mutable | endpoint, role, state, lastOkAt | Fleet reachability the loop reads for normal vs reduced mode |

**Deferred to a later migration (`0002_*.sql`), per the Prospector blueprint**: `provenance_clusters` (embedding near-dup — needs a local embedder, see ADR-002/R11) and a `queries` table for SENSE query-dedup. MVP provenance is exact content-hash.

### Invariants (SQLite-enforced)
- Append-only tables reject UPDATE/DELETE via triggers (DB-level, not convention).
- `evidence.contentHash` unique per mission — exact dedupe.
- Each score references exactly one contract version and one tier version.
- `cycles.idempotencyKey` unique — re-dispatch collapses to one commit (stored `resultJson` returned on replay).
- `→ validated` requires a `probes` row; only one candidate per mission in active build (WIP=1) — enforced in the verdict path.

## B. Published to holocron (Convex — search substrate, ADR-002)

Only *findings*, not the ledger, cross to Convex. Reuses existing tables; adds no ledger tables to Convex.

| Convex table | Direction | Contract |
|--------------|-----------|----------|
| `documents` (existing) | Fulcrum → Convex | A candidate's current synthesis published via `documents/storage:createWithEmbedding` (Cohere 1024-dim embedding, server-side); idempotent upsert keyed to the candidate; tagged `source: fulcrum` and self-referential so a later SENSE marks it self-sourced |
| `agentTelemetry` (existing, optional) | Fulcrum → Convex | Per-cycle observability rows (intent, durations, tools, source) emulating the existing shape, for app-side visibility |
| `fulcrumRuns` (new, optional, lightweight) | Fulcrum → Convex | A thin mirror of mission + leaderboard state (candidate titles, scores, stages) so the holocron app can *display* the loop without holding its ledger — read-only projection, never the source of truth |

**Not published**: raw evidence, claim ledger, verdicts, touches — these are local. The app sees a projection; the audit trail lives in the local SQLite ledger + git.

## C. Design lineage from holocron's existing research model (ADR-003)

Holocron's `researchFindings` already carries a 5-factor confidence model (`sourceCredibilityScore`, `evidenceQualityScore`, `corroborationScore`, `recencyScore`, `expertConsensusScore`) and a `citations` table (credibility-scored sources). Fulcrum **mines these as design input** for its tier ladder and recency model — but they do not become the score. The deterministic gate does. This is the deliberate break from holocron's LLM-judged confidence.

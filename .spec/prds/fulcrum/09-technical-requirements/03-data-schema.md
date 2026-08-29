---
stability: CONSTITUTION
last_validated: 2026-08-20
prd_version: 3.0.0
---

# Data Schema

The ledger of record is the **live Postgres evidence graph** in `packages/platform/src/db/schema/evidence.ts`, plus named Drizzle extensions in the same schema family. There is no second Prospector schema. `prospects`, `cycles`, `scores`, and `fulcrumCycles` **do not exist** and must not be created under those names.

Publish is `publishDocumentForRun` into `documents` (`packages/platform/src/mission/document-publish.ts`). It is **not** Convex `createWithEmbedding` and **not** Cohere.

IDs are UUIDv7 (platform `idColumn()`); timestamps `timestamptz`; grades/scores `doublePrecision` in [0,1]; enums are CHECK-constrained.

## A. Live evidence graph (already shipped — Fulcrum extends, does not replace)

| Table | File | What Fulcrum uses it for |
|-------|------|--------------------------|
| `sources` | `evidence.ts` | Fetch artifacts. Live columns: `id`, `source_kind`, `document_id`, `content_hash` (unique), `title`, `url`, `metadata_json`. **Fulcrum adds:** `normalized_text`, `retrieved_at`, `source_domain`, `provenance_group`, `self_sourced`. |
| `passages` | `evidence.ts` | Chunked source text + 1024-dim `embedding` (Qwen3). Quotes are **not** sliced from passage RRF snippets. |
| `claims` | `evidence.ts` | Extracted assertions. Live columns: `source_id`, `passage_id`, `claim_text`, `claim_category`, `confidence`, `metadata_json`. **Fulcrum adds:** `candidate_id`, `component`, `polarity` (`support`\|`refute`), `status` (`admitted`\|`provisional`\|`contested`\|`refuted`), `quote_text`, `passes_gate`, `qualifying_grade`, `target_claim_id`. |
| `entities` | `evidence.ts` | Named entities extracted alongside claims. |
| `relations` | `evidence.ts` | Typed links (including candidate lineage as `relation_type` values Fulcrum introduces). Bi-temporal `valid_*` / `tx_*`. |
| `beliefs` | `evidence.ts` | Current believed statement for a claim; `run_id`, `idempotency_key`, supersession chain. |

## B. Live mission runtime (already shipped — cycle log and verdicts)

| Table | File | What Fulcrum uses it for |
|-------|------|--------------------------|
| `mission_runs` | `mission.ts` | **Cycle log.** Unique `(template_key, idempotency_key)`; `lease_owner` / `lease_token` / `lease_expires_at`; `status` includes `budget_exceeded`; `usage_json` holds per-role tokens/wall; `role_resolution_json` + `model_revisions_json` hold header-truthful identity. Template key is always `evidence-research`; alias `fulcrum` is a `mission_run_tags` tag. |
| `mission_stage_runs` | `mission.ts` | Per-stage attempt, role, endpoint, checkpoint. |
| `mission_verdicts` | `mission.ts` | Operator kill/advance/redirect/boost via `POST /api/missions/:id/verdicts`. |
| `mission_commits` | `mission.ts` | Typed commit output for a run. |
| `documents` | `documents.ts` | Published brief/dossier body. Idempotent on `source_run_id` via `publishDocumentForRun`. |

## C. New Fulcrum tables (Drizzle extensions of the graph)

These are **new**. They are not a Prospector port. Names below are the names a sprint must ship.

```ts
// candidates — the work items Fulcrum scores (NOT "prospects")
export const candidates = pgTable('candidates', {
  id: idColumn(),
  missionId: text('mission_id').notNull(),
  stage: text('stage').notNull(), // raw|developing|contender|validated|retired|killed
  nicheKey: text('niche_key'),
  currentScoreId: text('current_score_id'),
  closeoutClaimId: text('closeout_claim_id'),
  title: text('title'),
  question: text('question'),
  metadataJson: typedJsonb('metadata_json'),
  createdAt: createdAtColumn(),
  updatedAt: updatedAtColumn(),
});

// belief_scores — append-only score history (NOT "scores" / "fulcrumScores")
export const beliefScores = pgTable('belief_scores', {
  id: idColumn(),
  candidateId: text('candidate_id').notNull(),
  runId: uuid('run_id'), // → mission_runs.id
  weightVersion: integer('weight_version').notNull(),
  domainTierVersion: integer('domain_tier_version').notNull(),
  score: doublePrecision('score'),
  disconfirmationTotal: doublePrecision('disconfirmation_total'),
  componentsJson: typedJsonb('components_json'),
  createdAt: createdAtColumn(),
});

// weight_versions + weight_components — versioned fitness contract
export const weightVersions = pgTable('weight_versions', {
  id: idColumn(),
  missionId: text('mission_id').notNull(),
  version: integer('version').notNull(),
  disconfirmationMultiplier: doublePrecision('disconfirmation_multiplier').notNull().default(2),
  createdAt: createdAtColumn(),
});
export const weightComponents = pgTable('weight_components', {
  id: idColumn(),
  weightVersionId: text('weight_version_id').notNull(),
  component: text('component').notNull(),
  kind: text('kind').notNull(), // evidence|judgment
  weight: doublePrecision('weight').notNull(),
  gradeFloor: doublePrecision('grade_floor'),
  recencyWindowDays: integer('recency_window_days'),
  halfLifeDays: integer('half_life_days'),
  rubricJson: typedJsonb('rubric_json'),
});

// domain_tier_versions + domain_tiers — deterministic grading ladder
export const domainTierVersions = pgTable('domain_tier_versions', {
  id: idColumn(),
  missionId: text('mission_id').notNull(),
  version: integer('version').notNull(),
  createdAt: createdAtColumn(),
});
export const domainTiers = pgTable('domain_tiers', {
  id: idColumn(),
  domainTierVersionId: text('domain_tier_version_id').notNull(),
  registrableDomain: text('registrable_domain').notNull(),
  tier: text('tier').notNull(),
  tierValue: doublePrecision('tier_value').notNull(),
});

// touches — explicit operator ack (drives degradation ceiling)
export const touches = pgTable('touches', {
  id: idColumn(),
  missionId: text('mission_id').notNull(),
  runId: uuid('run_id'),
  touchType: text('touch_type').notNull(), // verdict|brief_ack
  source: text('source').notNull(), // cli
  refId: text('ref_id'), // brief id or verdict id
  createdAt: createdAtColumn(),
});

// probes — recorded reality-probe results (tooling is out of scope; the row is in)
export const probes = pgTable('probes', {
  id: idColumn(),
  candidateId: text('candidate_id').notNull(),
  kind: text('kind').notNull(), // calls|smoke_test|pilot
  result: text('result').notNull(),
  recordedBy: text('recorded_by'),
  createdAt: createdAtColumn(),
});

// claim_evidence_bindings — n:m with denormalized provenance
export const claimEvidenceBindings = pgTable('claim_evidence_bindings', {
  id: idColumn(),
  claimId: text('claim_id').notNull(),
  sourceId: text('source_id').notNull(),
  sourceDomain: text('source_domain'),
  provenanceGroup: text('provenance_group'),
  selfSourced: integer('self_sourced'),
  createdAt: createdAtColumn(),
});
```

Fetch artifact (written onto `sources` at retrieve time; **not** an RRF snippet):

```ts
type FetchArtifact = {
  url: string;
  fetchedAt: string; // timestamptz
  raw: string;
  normalizedText: string;
  contentHash: string;
};
```

`normalizedText` is the column `sources.normalized_text`. A claim's `quote_text` MUST be an exact substring of that column for the bound source. A quote sliced from the same buffer as hybrid-search `sourceText` (e.g. `sourceText.slice(0, 280)`) is a **fail**.

### Invariants (Postgres-enforced)

- Append-only tables (`belief_scores`, `weight_versions`, `weight_components`, `domain_tier_versions`, `domain_tiers`, `touches`, `probes`, `claim_evidence_bindings`, and immutable columns of `sources` / `claims`) reject UPDATE/DELETE via triggers.
- `sources.content_hash` unique — exact dedupe.
- Each `belief_scores` row references exactly one `weight_version` and one `domain_tier_version`.
- `mission_runs` unique on `(template_key, idempotency_key)` — re-dispatch collapses to one commit.
- `→ validated` requires a `probes` row; only one candidate per mission in active build (WIP=1) — enforced in the verdict path (`POST /api/missions/:id/verdicts`).

**Deferred:** embedding near-dup clustering (`provenance_clusters`) and a `queries` table for SENSE query-dedup. MVP provenance is exact content-hash; query-dedup may live in `sources.metadata_json` until a table is justified.

## D. Publish (same Postgres, not a second store)

| Table | Direction | Contract |
|-------|-----------|----------|
| `documents` (existing) | Fulcrum → `documents` | `publishDocumentForRun(sql, { sourceRunId, title, content, category: 'fulcrum', idempotencyKey })`. Idempotent on `source_run_id`. Tagged so a later SENSE marks it self-sourced. Local Qwen3 1024-dim embed via the `embed` role. |

**Not a separate projection.** There is no `fulcrumRuns` table. The app, if it ever reads Fulcrum state, reads Postgres via Zero; MVP does not ship RN screens.

## E. Design lineage (ADR-003)

Holocron's historical `researchFindings` 5-factor confidence model is **design input** for the tier ladder and recency model. It does not become the score. The deterministic gate does. Mine the design; do not execute `convex/research/`.

/**
 * Fulcrum ledger — the nine score-contract tables (PRD 03-data-schema §C).
 *
 * candidates → belief_scores (append-only history) backed by weight_versions +
 * weight_components (versioned fitness contract) and domain_tier_versions +
 * domain_tiers (deterministic grading ladder), with touches (operator acks),
 * probes (reality checks) and claim_evidence_bindings (n:m provenance).
 *
 * NOT a Prospector port: the names `prospects`, `cycles`, `scores`, and
 * `fulcrumCycles` are forbidden and do not exist here.
 *
 * The append-only invariant (UPDATE/DELETE rejected) is enforced by Postgres in
 * migration 0041_fulcrum_ledger.sql — triggers plus role grants mirroring
 * 0004_beliefs_immutability_revise.sql — never in application code.
 */

import { sql } from 'drizzle-orm';
import { check, doublePrecision, integer, pgTable, text, uuid } from 'drizzle-orm/pg-core';
import { createdAtColumn, idColumn, typedJsonb, updatedAtColumn } from '../columns';
import { sqlInList } from '../enums';

/** candidates.stage — the work-item lifecycle (never "prospects"). */
export const candidateStageValues = [
  'raw',
  'developing',
  'contender',
  'validated',
  'retired',
  'killed',
] as const;

/** weight_components.kind — evidence-weighted vs judgment-weighted component. */
export const weightComponentKindValues = ['evidence', 'judgment'] as const;

/** touches.touch_type — operator ack provenance. */
export const touchTypeValues = ['verdict', 'brief_ack'] as const;

/** probes.kind — recorded reality-probe results. */
export const probeKindValues = ['calls', 'smoke_test', 'pilot'] as const;

/** candidates — the work items Fulcrum scores (NOT "prospects"). */
export const candidates = pgTable(
  'candidates',
  {
    id: idColumn(),
    missionId: text('mission_id').notNull(),
    stage: text('stage').notNull(),
    nicheKey: text('niche_key'),
    currentScoreId: text('current_score_id'),
    closeoutClaimId: text('closeout_claim_id'),
    title: text('title'),
    question: text('question'),
    metadataJson: typedJsonb('metadata_json'),
    createdAt: createdAtColumn(),
    updatedAt: updatedAtColumn(),
  },
  (t) => [
    check('candidates_stage_check', sql`stage IN (${sql.raw(sqlInList(candidateStageValues))})`),
  ]
);

/** belief_scores — append-only score history (NOT "scores" / "fulcrumScores"). */
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

/** weight_versions — versioned fitness contract header. */
export const weightVersions = pgTable('weight_versions', {
  id: idColumn(),
  missionId: text('mission_id').notNull(),
  version: integer('version').notNull(),
  disconfirmationMultiplier: doublePrecision('disconfirmation_multiplier').notNull().default(2),
  createdAt: createdAtColumn(),
});

/** weight_components — per-component weights frozen under a weight version. */
export const weightComponents = pgTable(
  'weight_components',
  {
    id: idColumn(),
    weightVersionId: text('weight_version_id').notNull(),
    component: text('component').notNull(),
    kind: text('kind').notNull(),
    weight: doublePrecision('weight').notNull(),
    gradeFloor: doublePrecision('grade_floor'),
    recencyWindowDays: integer('recency_window_days'),
    halfLifeDays: integer('half_life_days'),
    rubricJson: typedJsonb('rubric_json'),
  },
  (t) => [
    check(
      'weight_components_kind_check',
      sql`kind IN (${sql.raw(sqlInList(weightComponentKindValues))})`
    ),
  ]
);

/** domain_tier_versions — deterministic grading ladder header. */
export const domainTierVersions = pgTable('domain_tier_versions', {
  id: idColumn(),
  missionId: text('mission_id').notNull(),
  version: integer('version').notNull(),
  createdAt: createdAtColumn(),
});

/** domain_tiers — per-registrable-domain tier ladder rows. */
export const domainTiers = pgTable('domain_tiers', {
  id: idColumn(),
  domainTierVersionId: text('domain_tier_version_id').notNull(),
  registrableDomain: text('registrable_domain').notNull(),
  tier: text('tier').notNull(),
  tierValue: doublePrecision('tier_value').notNull(),
});

/** touches — explicit operator ack (drives degradation ceiling). */
export const touches = pgTable(
  'touches',
  {
    id: idColumn(),
    missionId: text('mission_id').notNull(),
    runId: uuid('run_id'),
    touchType: text('touch_type').notNull(),
    source: text('source').notNull(),
    refId: text('ref_id'),
    createdAt: createdAtColumn(),
  },
  (t) => [
    check('touches_touch_type_check', sql`touch_type IN (${sql.raw(sqlInList(touchTypeValues))})`),
  ]
);

/** probes — recorded reality-probe results (tooling out of scope; the row is in). */
export const probes = pgTable(
  'probes',
  {
    id: idColumn(),
    candidateId: text('candidate_id').notNull(),
    kind: text('kind').notNull(),
    result: text('result').notNull(),
    recordedBy: text('recorded_by'),
    createdAt: createdAtColumn(),
  },
  (t) => [check('probes_kind_check', sql`kind IN (${sql.raw(sqlInList(probeKindValues))})`)]
);

/** claim_evidence_bindings — n:m claim↔source with denormalized provenance. */
export const claimEvidenceBindings = pgTable('claim_evidence_bindings', {
  id: idColumn(),
  claimId: text('claim_id').notNull(),
  sourceId: text('source_id').notNull(),
  sourceDomain: text('source_domain'),
  provenanceGroup: text('provenance_group'),
  selfSourced: integer('self_sourced'),
  createdAt: createdAtColumn(),
});

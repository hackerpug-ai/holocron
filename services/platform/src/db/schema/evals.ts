/**
 * obs-3 — Versioned eval score records (immutable historical rows).
 *
 * Every score persists dataset, rubric, scorer, judge model, judge prompt,
 * and baseline versions for longitudinal drift analysis.
 */

import { sql } from 'drizzle-orm';
import { check, doublePrecision, index, pgTable, text } from 'drizzle-orm/pg-core';
import { createdAtColumn, idColumn, typedJsonb } from '../columns';

export const evalScores = pgTable(
  'eval_scores',
  {
    id: idColumn(),
    runId: text('run_id').notNull(),
    sampleId: text('sample_id').notNull(),
    scorerId: text('scorer_id').notNull(),
    score: doublePrecision('score').notNull(),
    baselineThreshold: doublePrecision('baseline_threshold').notNull(),
    datasetVersion: text('dataset_version').notNull(),
    rubricVersion: text('rubric_version').notNull(),
    scorerVersion: text('scorer_version').notNull(),
    judgeModelVersion: text('judge_model_version').notNull(),
    promptVersion: text('prompt_version').notNull(),
    baselineVersion: text('baseline_version').notNull(),
    /** Primary intent tag: happy-path | adversarial | regression */
    tag: text('tag'),
    reason: text('reason'),
    /** Redacted judge analysis payload (score components, not raw fixture bodies). */
    analysis: typedJsonb<Record<string, unknown>>('analysis'),
    /** Fleet endpoint that served the judge (never cloud by default). */
    judgeEndpoint: text('judge_endpoint'),
    judgeModelId: text('judge_model_id'),
    createdAt: createdAtColumn(),
  },
  (t) => [
    index('eval_scores_run_id_idx').on(t.runId),
    index('eval_scores_dataset_version_idx').on(t.datasetVersion),
    index('eval_scores_sample_id_idx').on(t.sampleId),
    index('eval_scores_created_at_idx').on(t.createdAt),
    check('eval_scores_score_range', sql`${t.score} >= 0 AND ${t.score} <= 1`),
    check(
      'eval_scores_baseline_range',
      sql`${t.baselineThreshold} >= 0 AND ${t.baselineThreshold} <= 1`
    ),
  ]
);

export type EvalScoreRow = typeof evalScores.$inferSelect;
export type EvalScoreInsert = typeof evalScores.$inferInsert;

/** Physical table names introduced by the evals domain (not in convex 55). */
export const EVAL_TABLE_NAMES = ['eval_scores'] as const;

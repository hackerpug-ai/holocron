/**
 * obs-3 — Durable eval score persistence (immutable rows).
 *
 * Insert-only: historical score rows are never updated in place.
 * All version metadata columns are required (fail closed on missing).
 */

import { createSql, type Sql } from '../db/client';
import { resolveDatabaseUrl } from '../db/connection';

export type EvalScoreRecord = {
  id: string;
  runId: string;
  sampleId: string;
  scorerId: string;
  score: number;
  baselineThreshold: number;
  datasetVersion: string;
  rubricVersion: string;
  scorerVersion: string;
  judgeModelVersion: string;
  promptVersion: string;
  baselineVersion: string;
  tag: string | null;
  reason: string | null;
  analysis: Record<string, unknown> | null;
  judgeEndpoint: string | null;
  judgeModelId: string | null;
  createdAt: Date;
};

export type InsertEvalScoreInput = {
  runId: string;
  sampleId: string;
  scorerId: string;
  score: number;
  baselineThreshold: number;
  datasetVersion: string;
  rubricVersion: string;
  scorerVersion: string;
  judgeModelVersion: string;
  promptVersion: string;
  baselineVersion: string;
  tag?: string | null;
  reason?: string | null;
  analysis?: Record<string, unknown> | null;
  judgeEndpoint?: string | null;
  judgeModelId?: string | null;
  databaseUrl?: string;
};

export class EvalScoreValidationError extends Error {
  readonly code = 'EVAL_SCORE_VALIDATION' as const;
  constructor(message: string) {
    super(message);
    this.name = 'EvalScoreValidationError';
  }
}

function databaseUrl(url?: string, env: NodeJS.ProcessEnv = process.env): string {
  return url ?? env.DATABASE_URL ?? resolveDatabaseUrl({ preferHolocron: true });
}

async function withSql<T>(
  fn: (sql: Sql) => Promise<T>,
  url?: string,
  env: NodeJS.ProcessEnv = process.env
): Promise<T> {
  const sql = createSql(databaseUrl(url, env));
  try {
    return await fn(sql);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

function assertVersions(input: InsertEvalScoreInput): void {
  const required: Array<[string, string | undefined | null]> = [
    ['datasetVersion', input.datasetVersion],
    ['rubricVersion', input.rubricVersion],
    ['scorerVersion', input.scorerVersion],
    ['judgeModelVersion', input.judgeModelVersion],
    ['promptVersion', input.promptVersion],
    ['baselineVersion', input.baselineVersion],
    ['scorerId', input.scorerId],
    ['runId', input.runId],
    ['sampleId', input.sampleId],
  ];
  for (const [key, value] of required) {
    if (value == null || String(value).trim() === '') {
      throw new EvalScoreValidationError(`missing required version field: ${key}`);
    }
  }
  if (typeof input.score !== 'number' || Number.isNaN(input.score)) {
    throw new EvalScoreValidationError('score must be a finite number');
  }
  if (input.score < 0 || input.score > 1) {
    throw new EvalScoreValidationError(`score out of range [0,1]: ${input.score}`);
  }
}

function mapRow(r: {
  id: string;
  run_id: string;
  sample_id: string;
  scorer_id: string;
  score: string | number;
  baseline_threshold: string | number;
  dataset_version: string;
  rubric_version: string;
  scorer_version: string;
  judge_model_version: string;
  prompt_version: string;
  baseline_version: string;
  tag: string | null;
  reason: string | null;
  analysis: Record<string, unknown> | null;
  judge_endpoint: string | null;
  judge_model_id: string | null;
  created_at: Date | string;
}): EvalScoreRecord {
  return {
    id: r.id,
    runId: r.run_id,
    sampleId: r.sample_id,
    scorerId: r.scorer_id,
    score: Number(r.score),
    baselineThreshold: Number(r.baseline_threshold),
    datasetVersion: r.dataset_version,
    rubricVersion: r.rubric_version,
    scorerVersion: r.scorer_version,
    judgeModelVersion: r.judge_model_version,
    promptVersion: r.prompt_version,
    baselineVersion: r.baseline_version,
    tag: r.tag,
    reason: r.reason,
    analysis: r.analysis,
    judgeEndpoint: r.judge_endpoint,
    judgeModelId: r.judge_model_id,
    createdAt: r.created_at instanceof Date ? r.created_at : new Date(r.created_at),
  };
}

/** Insert an immutable eval score row. Never updates existing rows. */
export async function insertEvalScore(input: InsertEvalScoreInput): Promise<EvalScoreRecord> {
  assertVersions(input);
  return withSql(async (sql) => {
    const analysisJson = input.analysis ? JSON.stringify(input.analysis) : null;
    const rows = await sql<
      {
        id: string;
        run_id: string;
        sample_id: string;
        scorer_id: string;
        score: string | number;
        baseline_threshold: string | number;
        dataset_version: string;
        rubric_version: string;
        scorer_version: string;
        judge_model_version: string;
        prompt_version: string;
        baseline_version: string;
        tag: string | null;
        reason: string | null;
        analysis: Record<string, unknown> | null;
        judge_endpoint: string | null;
        judge_model_id: string | null;
        created_at: Date | string;
      }[]
    >`
      INSERT INTO eval_scores (
        run_id,
        sample_id,
        scorer_id,
        score,
        baseline_threshold,
        dataset_version,
        rubric_version,
        scorer_version,
        judge_model_version,
        prompt_version,
        baseline_version,
        tag,
        reason,
        analysis,
        judge_endpoint,
        judge_model_id
      ) VALUES (
        ${input.runId},
        ${input.sampleId},
        ${input.scorerId},
        ${input.score},
        ${input.baselineThreshold},
        ${input.datasetVersion},
        ${input.rubricVersion},
        ${input.scorerVersion},
        ${input.judgeModelVersion},
        ${input.promptVersion},
        ${input.baselineVersion},
        ${input.tag ?? null},
        ${input.reason ?? null},
        ${analysisJson}::jsonb,
        ${input.judgeEndpoint ?? null},
        ${input.judgeModelId ?? null}
      )
      RETURNING
        id::text,
        run_id,
        sample_id,
        scorer_id,
        score,
        baseline_threshold,
        dataset_version,
        rubric_version,
        scorer_version,
        judge_model_version,
        prompt_version,
        baseline_version,
        tag,
        reason,
        analysis,
        judge_endpoint,
        judge_model_id,
        created_at
    `;
    const row = rows[0];
    if (!row) {
      throw new EvalScoreValidationError('insert returned no row');
    }
    return mapRow(row);
  }, input.databaseUrl);
}

export async function listEvalScores(options?: {
  runId?: string;
  datasetVersion?: string;
  sampleId?: string;
  limit?: number;
  databaseUrl?: string;
}): Promise<EvalScoreRecord[]> {
  const limit = Math.max(1, Math.min(options?.limit ?? 100, 1000));
  return withSql(async (sql) => {
    let rows: Parameters<typeof mapRow>[0][];
    if (options?.runId) {
      rows = await sql`
        SELECT
          id::text, run_id, sample_id, scorer_id, score, baseline_threshold,
          dataset_version, rubric_version, scorer_version, judge_model_version,
          prompt_version, baseline_version, tag, reason, analysis,
          judge_endpoint, judge_model_id, created_at
        FROM eval_scores
        WHERE run_id = ${options.runId}
        ORDER BY created_at ASC
        LIMIT ${limit}
      `;
    } else if (options?.datasetVersion && options?.sampleId) {
      rows = await sql`
        SELECT
          id::text, run_id, sample_id, scorer_id, score, baseline_threshold,
          dataset_version, rubric_version, scorer_version, judge_model_version,
          prompt_version, baseline_version, tag, reason, analysis,
          judge_endpoint, judge_model_id, created_at
        FROM eval_scores
        WHERE dataset_version = ${options.datasetVersion}
          AND sample_id = ${options.sampleId}
        ORDER BY created_at ASC
        LIMIT ${limit}
      `;
    } else if (options?.datasetVersion) {
      rows = await sql`
        SELECT
          id::text, run_id, sample_id, scorer_id, score, baseline_threshold,
          dataset_version, rubric_version, scorer_version, judge_model_version,
          prompt_version, baseline_version, tag, reason, analysis,
          judge_endpoint, judge_model_id, created_at
        FROM eval_scores
        WHERE dataset_version = ${options.datasetVersion}
        ORDER BY created_at ASC
        LIMIT ${limit}
      `;
    } else {
      rows = await sql`
        SELECT
          id::text, run_id, sample_id, scorer_id, score, baseline_threshold,
          dataset_version, rubric_version, scorer_version, judge_model_version,
          prompt_version, baseline_version, tag, reason, analysis,
          judge_endpoint, judge_model_id, created_at
        FROM eval_scores
        ORDER BY created_at DESC
        LIMIT ${limit}
      `;
    }
    return rows.map(mapRow);
  }, options?.databaseUrl);
}

export async function countEvalScores(options?: {
  runId?: string;
  databaseUrl?: string;
}): Promise<number> {
  return withSql(async (sql) => {
    if (options?.runId) {
      const rows = await sql<{ c: string }[]>`
        SELECT count(*)::text AS c FROM eval_scores WHERE run_id = ${options.runId}
      `;
      return Number(rows[0]?.c ?? 0);
    }
    const rows = await sql<{ c: string }[]>`SELECT count(*)::text AS c FROM eval_scores`;
    return Number(rows[0]?.c ?? 0);
  }, options?.databaseUrl);
}

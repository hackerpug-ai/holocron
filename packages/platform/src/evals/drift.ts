/**
 * obs-3 — Longitudinal drift query over immutable eval_scores rows.
 *
 * Returns historical scores grouped by dataset with model + prompt versions.
 * Never collapses to "latest only".
 */

import { type EvalScoreRecord, listEvalScores } from './persistence';

export type DriftEntry = {
  id: string;
  runId: string;
  sampleId: string;
  score: number;
  baselineThreshold: number;
  datasetVersion: string;
  /** Alias for judgeModelVersion in drift CLI output (AC-4 modelVersion). */
  modelVersion: string;
  promptVersion: string;
  rubricVersion: string;
  scorerVersion: string;
  baselineVersion: string;
  scorerId: string;
  tag: string | null;
  createdAt: string;
};

export type DriftReport = {
  ok: boolean;
  datasetVersion: string;
  entryCount: number;
  entries: DriftEntry[];
};

function toEntry(row: EvalScoreRecord): DriftEntry {
  return {
    id: row.id,
    runId: row.runId,
    sampleId: row.sampleId,
    score: row.score,
    baselineThreshold: row.baselineThreshold,
    datasetVersion: row.datasetVersion,
    modelVersion: row.judgeModelVersion,
    promptVersion: row.promptVersion,
    rubricVersion: row.rubricVersion,
    scorerVersion: row.scorerVersion,
    baselineVersion: row.baselineVersion,
    scorerId: row.scorerId,
    tag: row.tag,
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * Longitudinal drift for a dataset version.
 * Requires historical rows in Postgres — does not invent scores.
 */
export async function queryDrift(options: {
  datasetVersion: string;
  limit?: number;
  databaseUrl?: string;
}): Promise<DriftReport> {
  const rows = await listEvalScores({
    datasetVersion: options.datasetVersion,
    limit: options.limit ?? 500,
    databaseUrl: options.databaseUrl,
  });
  // listEvalScores with datasetVersion returns ASC by created_at — good for longitudinal
  const entries = rows.map(toEntry);
  return {
    ok: true,
    datasetVersion: options.datasetVersion,
    entryCount: entries.length,
    entries,
  };
}

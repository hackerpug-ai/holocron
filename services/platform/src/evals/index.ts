/**
 * obs-3 — Versioned local-judge eval substrate.
 *
 * Public surface:
 *   runEvalSample  — score a committed fixture sample, persist with versions
 *   queryDrift     — longitudinal drift over eval_scores
 *   createResearchQualityScorer / createResearchInvariantScorer
 *   runEvals       — re-export Mastra 1.x CI runner
 */

import { randomUUID } from 'node:crypto';
import {
  type Baseline,
  BaselineNotFoundError,
  DatasetNotFoundError,
  loadBaseline,
  loadRubric,
  loadSample,
  primaryTag,
  RubricNotFoundError,
  resolveSampleAlias,
  SampleNotFoundError,
} from './datasets';
import { queryDrift } from './drift';
import { type EvalScoreRecord, insertEvalScore } from './persistence';
import {
  JudgeInvalidScoreError,
  JudgeUnavailableError,
  type ScoreFixtureResult,
  scoreFixture,
} from './scorers';

export * from './datasets';
export * from './drift';
export * from './persistence';
export * from './scorers';

export type RunEvalSampleOptions = {
  sample: string;
  datasetVersion?: string;
  baselineVersion?: string;
  runId?: string;
  judgeEndpointOverride?: string;
  databaseUrl?: string;
  /** When true, skip persistence (used only for dry diagnostics — default false). */
  dryRun?: boolean;
};

export type RunEvalSampleResult = {
  ok: boolean;
  sampleId: string;
  datasetVersion: string;
  score: number;
  baseline: number;
  meetsBaseline: boolean;
  tag: string;
  runId: string;
  scoreId: string;
  scorerId: string;
  scorerVersion: string;
  rubricVersion: string;
  judgeModelVersion: string;
  promptVersion: string;
  baselineVersion: string;
  invariantScore: number;
  reason?: string;
  analysis?: Record<string, unknown>;
  judgeEndpoint: string;
  judgeModelId: string;
};

function defaultDatasetForSample(_sampleId: string): string {
  return 'research_v1';
}

function defaultBaselineForDataset(datasetVersion: string): string {
  // Baseline versions are aligned with dataset versions for research_v1.
  return datasetVersion;
}

/**
 * Run a single fixture sample through the local judge, persist versioned score.
 * Fail closed on missing dataset/judge/versions — never fabricates a score.
 */
export async function runEvalSample(options: RunEvalSampleOptions): Promise<RunEvalSampleResult> {
  const sampleId = resolveSampleAlias(options.sample);
  const datasetVersion = options.datasetVersion ?? defaultDatasetForSample(sampleId);
  const baselineVersion = options.baselineVersion ?? defaultBaselineForDataset(datasetVersion);

  // Load dataset first so unknown versions fail as DATASET_NOT_FOUND (not baseline).
  const sample = loadSample(datasetVersion, sampleId);

  let baseline: Baseline;
  try {
    baseline = loadBaseline(baselineVersion);
  } catch (err) {
    if (err instanceof BaselineNotFoundError) throw err;
    throw err;
  }

  // Cross-check baseline ↔ dataset alignment (fail closed on mismatch)
  if (baseline.datasetVersion !== datasetVersion) {
    throw new DatasetNotFoundError(
      `${datasetVersion} (baseline ${baselineVersion} expects ${baseline.datasetVersion})`
    );
  }

  const rubric = loadRubric(baseline.rubricVersion);
  const runId = options.runId ?? `eval-${randomUUID()}`;
  const tag = primaryTag(sample);

  let scored: ScoreFixtureResult;
  try {
    scored = await scoreFixture({
      sample,
      rubric,
      baseline,
      judgeEndpointOverride: options.judgeEndpointOverride,
    });
  } catch (err) {
    // Re-throw typed evaluator errors; wrap unexpected as judge unavailable if network-like
    if (
      err instanceof JudgeUnavailableError ||
      err instanceof JudgeInvalidScoreError ||
      err instanceof DatasetNotFoundError ||
      err instanceof SampleNotFoundError ||
      err instanceof RubricNotFoundError ||
      err instanceof BaselineNotFoundError
    ) {
      throw err;
    }
    const msg = err instanceof Error ? err.message : String(err);
    if (/unreachable|ECONNREFUSED|fetch failed|ROLE_UNAVAILABLE|timeout|abort/i.test(msg)) {
      throw new JudgeUnavailableError(options.judgeEndpointOverride ?? 'judge', msg);
    }
    throw err;
  }

  const meetsBaseline = scored.score >= baseline.threshold;

  let persisted: EvalScoreRecord | null = null;
  if (!options.dryRun) {
    persisted = await insertEvalScore({
      runId,
      sampleId,
      scorerId: scored.scorerId,
      score: scored.score,
      baselineThreshold: baseline.threshold,
      datasetVersion,
      rubricVersion: rubric.version,
      scorerVersion: scored.scorerVersion,
      judgeModelVersion: scored.judgeModelVersion,
      promptVersion: rubric.promptVersion,
      baselineVersion: baseline.version,
      tag,
      reason: scored.reason ?? null,
      analysis: {
        ...(scored.analysis ?? {}),
        invariantScore: scored.invariantScore,
      },
      judgeEndpoint: scored.judgeEndpoint,
      judgeModelId: scored.judgeModelId,
      databaseUrl: options.databaseUrl,
    });
  }

  return {
    ok: true,
    sampleId,
    datasetVersion,
    score: scored.score,
    baseline: baseline.threshold,
    meetsBaseline,
    tag,
    runId,
    scoreId: persisted?.id ?? '',
    scorerId: scored.scorerId,
    scorerVersion: scored.scorerVersion,
    rubricVersion: rubric.version,
    judgeModelVersion: scored.judgeModelVersion,
    promptVersion: rubric.promptVersion,
    baselineVersion: baseline.version,
    invariantScore: scored.invariantScore,
    reason: scored.reason,
    analysis: scored.analysis as Record<string, unknown> | undefined,
    judgeEndpoint: scored.judgeEndpoint,
    judgeModelId: scored.judgeModelId,
  };
}

export { queryDrift };

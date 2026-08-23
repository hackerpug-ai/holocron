/**
 * obs-4 — Fail-closed CI regression gate (threshold + deterministic invariants).
 *
 * `holo evals:ci --fixture <alias>`:
 *   - loads versioned threshold (never invents fallback baseline)
 *   - scores via local judge (reuse scoreFixture / runEvalSample path)
 *   - runs deterministic invariant scorers independently of judge prose
 *   - exits non-zero on threshold regression, deterministic failure, or invalid config
 *
 * Anti-pattern: soft-warn + exit 0, latest-mutable baseline, judge-dependent invariants.
 */

import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import {
  type Baseline,
  BaselineNotFoundError,
  DatasetNotFoundError,
  type DatasetSample,
  DatasetSampleSchema,
  loadBaseline,
  loadRubric,
  loadSample,
  primaryTag,
  RubricNotFoundError,
  resolveSampleAlias,
  SampleNotFoundError,
} from './datasets';
import { type DeterministicFailure, runDeterministicInvariants } from './deterministic-scorers';
import { insertEvalScore } from './persistence';
import {
  type ResearchEvalReport,
  type ResearchScorerResult,
  scoreResearchSession,
} from './research-scorers';
import {
  JUDGE_MODEL_VERSION,
  JudgeInvalidScoreError,
  JudgeUnavailableError,
  scoreFixture,
} from './scorers';

const HERE = dirname(fileURLToPath(import.meta.url));

export function defaultThresholdsDir(): string {
  return join(HERE, '../../evals/thresholds');
}

export function defaultFixturesDir(): string {
  return join(HERE, '../../evals/fixtures');
}

export const ThresholdConfigSchema = z.object({
  id: z.string(),
  version: z.string(),
  datasetVersion: z.string(),
  baselineVersion: z.string(),
  threshold: z.number().min(0).max(1),
  judgeModelVersion: z.string().optional(),
  promptVersion: z.string().optional(),
  notes: z.string().optional(),
});

export type ThresholdConfig = z.infer<typeof ThresholdConfigSchema>;

export class InvalidThresholdError extends Error {
  readonly code = 'INVALID_THRESHOLD' as const;
  constructor(message: string) {
    super(message);
    this.name = 'InvalidThresholdError';
  }
}

export class FixtureNotFoundError extends Error {
  readonly code = 'FIXTURE_NOT_FOUND' as const;
  constructor(readonly fixture: string) {
    super(`fixture not found: ${fixture}`);
    this.name = 'FixtureNotFoundError';
  }
}

/** Known fixture aliases handled by evals:ci. */
export type CiFixtureAlias =
  | 'known-good'
  | 'deliberately-bad'
  | 'deterministic-invariant-regression'
  | 'invalid-config';

export type CiGateOptions = {
  fixture: string;
  thresholdVersion?: string;
  datasetVersion?: string;
  baselineVersion?: string;
  runId?: string;
  judgeEndpointOverride?: string;
  databaseUrl?: string;
  /** When true, skip persistence (diagnostics only — default false). */
  dryRun?: boolean;
  /**
   * When set, also run Wave 8 deterministic research scorers against the
   * persisted research session. A corrupted quote fails quote-verifiability
   * (threshold 1.0) and fails CI.
   */
  researchSessionId?: string;
};

export type CiGateResult = {
  fixture: string;
  datasetVersion: string | null;
  baselineVersion: string | null;
  modelVersion: string | null;
  promptVersion: string | null;
  score: number | null;
  /** Raw judge analysis.score — must equal score (no post-judge rewrite). */
  rawJudgeScore: number | null;
  baseline: number | null;
  threshold: number | null;
  verdict: 'passed' | 'failed';
  exitCode: number;
  failureReason: string | null;
  exitReason: string | null;
  errorCode: string | null;
  deterministicFailures: DeterministicFailure[];
  runId: string | null;
  scoreId: string | null;
  sampleId: string | null;
  meetsThreshold: boolean;
  invariantPassed: boolean;
  reason?: string;
  /** Wave 8 research scorer report when researchSessionId was provided. */
  researchEval?: ResearchEvalReport | null;
  researchScorerFailures?: ResearchScorerResult[];
};

function readJsonFile(path: string): unknown {
  return JSON.parse(readFileSync(path, 'utf8')) as unknown;
}

function readJsonlSamples(path: string): DatasetSample[] {
  const text = readFileSync(path, 'utf8');
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith('#'));
  return lines.map((line, i) => {
    let raw: unknown;
    try {
      raw = JSON.parse(line) as unknown;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`invalid JSONL at ${path}:${i + 1}: ${msg}`);
    }
    const parsed = DatasetSampleSchema.safeParse(raw);
    if (!parsed.success) {
      throw new Error(`fixture row ${i + 1} invalid: ${parsed.error.message}`);
    }
    return parsed.data;
  });
}

/**
 * Load a versioned threshold config. Fail closed — never invents a default.
 */
export function loadThreshold(
  thresholdVersion: string,
  options?: { thresholdsDir?: string }
): ThresholdConfig {
  const dir = options?.thresholdsDir ?? defaultThresholdsDir();
  const path = join(dir, `${thresholdVersion}.json`);
  if (!existsSync(path)) {
    throw new InvalidThresholdError(`threshold version not found: ${thresholdVersion}`);
  }
  const raw = readJsonFile(path);
  if (raw == null || typeof raw !== 'object') {
    throw new InvalidThresholdError(`threshold ${thresholdVersion} is not an object`);
  }
  const obj = raw as Record<string, unknown>;
  if (!('threshold' in obj) || obj.threshold == null) {
    throw new InvalidThresholdError(`threshold field missing in ${thresholdVersion} — fail closed`);
  }
  if (typeof obj.threshold !== 'number' || Number.isNaN(obj.threshold)) {
    throw new InvalidThresholdError(
      `threshold field invalid in ${thresholdVersion}: ${String(obj.threshold)}`
    );
  }
  const parsed = ThresholdConfigSchema.safeParse(raw);
  if (!parsed.success) {
    throw new InvalidThresholdError(
      `threshold ${thresholdVersion} schema invalid: ${parsed.error.message}`
    );
  }
  return parsed.data;
}

/**
 * Load the invalid-config fixture. Expected to lack a usable threshold.
 */
export function loadInvalidConfigFixture(options?: { fixturesDir?: string }): {
  path: string;
  config: Record<string, unknown>;
} {
  const dir = options?.fixturesDir ?? defaultFixturesDir();
  const path = join(dir, 'invalid-config.json');
  if (!existsSync(path)) {
    throw new FixtureNotFoundError('invalid-config');
  }
  const raw = readJsonFile(path);
  if (raw == null || typeof raw !== 'object') {
    throw new InvalidThresholdError('invalid-config fixture is not an object');
  }
  return { path, config: raw as Record<string, unknown> };
}

/**
 * Load the deterministic-invariant-regression fixture sample.
 */
export function loadDeterministicInvariantFixture(options?: {
  fixturesDir?: string;
}): DatasetSample {
  const dir = options?.fixturesDir ?? defaultFixturesDir();
  const path = join(dir, 'deterministic-invariant-regression.jsonl');
  if (!existsSync(path)) {
    throw new FixtureNotFoundError('deterministic-invariant-regression');
  }
  const samples = readJsonlSamples(path);
  const found = samples.find((s) => s.id === 'deterministic-invariant-regression') ?? samples[0];
  if (!found) {
    throw new FixtureNotFoundError('deterministic-invariant-regression');
  }
  return found;
}

function failedResult(
  partial: Partial<CiGateResult> & {
    fixture: string;
    failureReason: string;
    errorCode?: string | null;
  }
): CiGateResult {
  return {
    fixture: partial.fixture,
    datasetVersion: partial.datasetVersion ?? null,
    baselineVersion: partial.baselineVersion ?? null,
    modelVersion: partial.modelVersion ?? null,
    promptVersion: partial.promptVersion ?? null,
    score: partial.score ?? null,
    rawJudgeScore: partial.rawJudgeScore ?? null,
    baseline: partial.baseline ?? null,
    threshold: partial.threshold ?? null,
    verdict: 'failed',
    exitCode: 1,
    failureReason: partial.failureReason,
    exitReason: partial.exitReason ?? partial.failureReason,
    errorCode: partial.errorCode ?? null,
    deterministicFailures: partial.deterministicFailures ?? [],
    runId: partial.runId ?? null,
    scoreId: partial.scoreId ?? null,
    sampleId: partial.sampleId ?? null,
    meetsThreshold: partial.meetsThreshold ?? false,
    invariantPassed: partial.invariantPassed ?? false,
    reason: partial.reason,
    researchEval: partial.researchEval ?? null,
    researchScorerFailures: partial.researchScorerFailures ?? [],
  };
}

function passedResult(
  partial: Omit<
    CiGateResult,
    'verdict' | 'exitCode' | 'failureReason' | 'exitReason' | 'errorCode'
  > & {
    exitReason?: string;
  }
): CiGateResult {
  return {
    ...partial,
    researchEval: partial.researchEval ?? null,
    researchScorerFailures: partial.researchScorerFailures ?? [],
    verdict: 'passed',
    exitCode: 0,
    failureReason: null,
    exitReason: partial.exitReason ?? 'passed',
    errorCode: null,
  };
}

/**
 * Fail-closed research-session CI gate (Wave 8).
 * Scores real persisted rows; quote-verifiability threshold is hard 1.0.
 */
export async function runResearchCiGate(options: {
  researchSessionId: string;
  databaseUrl?: string;
  runId?: string;
}): Promise<CiGateResult> {
  const sessionId = options.researchSessionId.trim();
  const runId = options.runId ?? `research-ci-${randomUUID()}`;
  if (!sessionId) {
    return failedResult({
      fixture: 'research-session',
      failureReason: 'missing_research_session',
      errorCode: 'MISSING_RESEARCH_SESSION',
      runId,
    });
  }

  let report: ResearchEvalReport;
  try {
    report = await scoreResearchSession(sessionId, { databaseUrl: options.databaseUrl });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return failedResult({
      fixture: 'research-session',
      failureReason: 'research_session_score_error',
      errorCode: 'RESEARCH_SESSION_SCORE_ERROR',
      exitReason: msg,
      runId,
      sampleId: sessionId,
    });
  }

  const quote = report.scores.find((s) => s.id === 'quote-verifiability');
  const failures = report.failures;
  const base = {
    fixture: 'research-session',
    datasetVersion: 'research_v1',
    baselineVersion: 'research_v1',
    modelVersion: null,
    promptVersion: null,
    score: quote?.score ?? null,
    rawJudgeScore: null,
    baseline: 1.0,
    threshold: 1.0,
    runId,
    scoreId: null,
    sampleId: sessionId,
    meetsThreshold: (quote?.score ?? 0) >= 1.0,
    invariantPassed: report.passed,
    deterministicFailures: failures.map((f) => ({
      invariantId: f.id,
      reason: f.reason,
    })),
    researchEval: report,
    researchScorerFailures: failures,
    reason: quote?.reason,
  };

  if (!report.passed) {
    return failedResult({
      ...base,
      failureReason: 'research_scorer_failure',
      errorCode: 'RESEARCH_SCORER_FAILURE',
      exitReason: `research scorers failed: ${failures.map((f) => f.id).join(', ')}`,
    });
  }

  return passedResult({
    ...base,
    exitReason: 'passed',
  });
}

/**
 * Fail-closed CI gate. Exit 0 only when quality meets threshold AND
 * deterministic invariants pass. Never soft-warns or invents baselines.
 */
export async function runCiGate(options: CiGateOptions): Promise<CiGateResult> {
  // Wave 8: research-session path can run independently of judge fixtures.
  if (options.researchSessionId?.trim()) {
    const research = await runResearchCiGate({
      researchSessionId: options.researchSessionId,
      databaseUrl: options.databaseUrl,
      runId: options.runId,
    });
    // When fixture is the dedicated research alias, return research result alone.
    if (!options.fixture.trim() || options.fixture.trim() === 'research-session') {
      return research;
    }
    // Otherwise continue with judge path and merge research failures at the end.
    if (research.verdict === 'failed') {
      return research;
    }
  }

  const fixture = options.fixture.trim();
  if (!fixture) {
    return failedResult({
      fixture: '',
      failureReason: 'missing_fixture',
      errorCode: 'MISSING_FIXTURE',
    });
  }

  // --- invalid-config: fail closed without inventing a threshold ---
  if (fixture === 'invalid-config') {
    const { config } = loadInvalidConfigFixture();
    const hasThreshold =
      'threshold' in config &&
      config.threshold != null &&
      typeof config.threshold === 'number' &&
      !Number.isNaN(config.threshold as number);

    if (!hasThreshold) {
      return failedResult({
        fixture,
        datasetVersion: typeof config.datasetVersion === 'string' ? config.datasetVersion : null,
        baselineVersion: typeof config.baselineVersion === 'string' ? config.baselineVersion : null,
        failureReason: 'invalid_threshold',
        errorCode: 'INVALID_THRESHOLD',
        exitReason: 'INVALID_THRESHOLD: threshold field missing — fail closed',
      });
    }

    // Config claimed a threshold but may still be unusable (unknown version, etc.)
    try {
      if (typeof config.thresholdVersion === 'string') {
        loadThreshold(config.thresholdVersion);
      } else {
        throw new InvalidThresholdError(
          'invalid-config has threshold but no thresholdVersion — fail closed'
        );
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return failedResult({
        fixture,
        failureReason: 'invalid_threshold',
        errorCode: 'INVALID_THRESHOLD',
        exitReason: msg,
      });
    }
  }

  // --- resolve threshold (versioned, fail closed) ---
  const thresholdVersion = options.thresholdVersion ?? 'research_v1';
  let thresholdConfig: ThresholdConfig;
  try {
    thresholdConfig = loadThreshold(thresholdVersion);
  } catch (err) {
    if (err instanceof InvalidThresholdError) {
      return failedResult({
        fixture,
        failureReason: 'invalid_threshold',
        errorCode: 'INVALID_THRESHOLD',
        exitReason: err.message,
      });
    }
    throw err;
  }

  const datasetVersion = options.datasetVersion ?? thresholdConfig.datasetVersion;
  const baselineVersion = options.baselineVersion ?? thresholdConfig.baselineVersion;
  const threshold = thresholdConfig.threshold;
  const runId = options.runId ?? `ci-${randomUUID()}`;

  // --- resolve sample ---
  let sample: DatasetSample;
  let sampleId: string;
  let sampleDatasetVersion = datasetVersion;

  try {
    if (fixture === 'deterministic-invariant-regression') {
      sample = loadDeterministicInvariantFixture();
      sampleId = sample.id;
      // Fixture is not in the versioned dataset registry — score against
      // the threshold's dataset/baseline identity for versioned reporting.
      sampleDatasetVersion = datasetVersion;
    } else if (fixture === 'known-good' || fixture === 'deliberately-bad') {
      sampleId = resolveSampleAlias(fixture);
      sample = loadSample(datasetVersion, sampleId);
      sampleDatasetVersion = datasetVersion;
    } else {
      // Try dataset sample id, then fixture file
      try {
        sampleId = resolveSampleAlias(fixture);
        sample = loadSample(datasetVersion, sampleId);
        sampleDatasetVersion = datasetVersion;
      } catch {
        throw new FixtureNotFoundError(fixture);
      }
    }
  } catch (err) {
    if (
      err instanceof FixtureNotFoundError ||
      err instanceof DatasetNotFoundError ||
      err instanceof SampleNotFoundError
    ) {
      return failedResult({
        fixture,
        datasetVersion,
        baselineVersion,
        threshold,
        failureReason: 'fixture_not_found',
        errorCode: err instanceof FixtureNotFoundError ? err.code : (err as { code: string }).code,
        exitReason: err.message,
      });
    }
    throw err;
  }

  // --- load baseline + rubric (fail closed on missing) ---
  let baseline: Baseline;
  try {
    baseline = loadBaseline(baselineVersion);
    if (
      baseline.datasetVersion !== datasetVersion &&
      fixture !== 'deterministic-invariant-regression'
    ) {
      throw new DatasetNotFoundError(
        `${datasetVersion} (baseline ${baselineVersion} expects ${baseline.datasetVersion})`
      );
    }
  } catch (err) {
    if (err instanceof BaselineNotFoundError || err instanceof DatasetNotFoundError) {
      return failedResult({
        fixture,
        datasetVersion,
        baselineVersion,
        threshold,
        sampleId,
        failureReason: 'baseline_not_found',
        errorCode: err.code,
        exitReason: err.message,
      });
    }
    throw err;
  }

  let rubric;
  try {
    rubric = loadRubric(baseline.rubricVersion);
  } catch (err) {
    if (err instanceof RubricNotFoundError) {
      return failedResult({
        fixture,
        datasetVersion,
        baselineVersion,
        threshold,
        sampleId,
        failureReason: 'rubric_not_found',
        errorCode: err.code,
        exitReason: err.message,
      });
    }
    throw err;
  }

  // --- score with local judge (real fleet call) ---
  let score: number;
  let rawJudgeScore: number;
  let judgeModelVersion: string;
  let judgeEndpoint: string;
  let judgeModelId: string;
  let scorerId: string;
  let scorerVersion: string;
  let reason: string | undefined;
  let analysis: Record<string, unknown> | undefined;
  let invariantScoreFromJudge: number;

  try {
    const scored = await scoreFixture({
      sample,
      rubric,
      baseline,
      judgeEndpointOverride: options.judgeEndpointOverride,
    });
    score = scored.score;
    const analysisScore = (scored.analysis as { score?: unknown } | undefined)?.score;
    rawJudgeScore =
      typeof analysisScore === 'number' && !Number.isNaN(analysisScore)
        ? analysisScore
        : scored.score;
    // REDHAT-FIX-H1-R: fail closed if any post-judge rewrite diverges emitted score from raw.
    if (rawJudgeScore !== score) {
      return failedResult({
        fixture,
        datasetVersion: sampleDatasetVersion,
        baselineVersion: baseline.version,
        modelVersion: scored.judgeModelVersion,
        promptVersion: rubric.promptVersion,
        score,
        rawJudgeScore,
        baseline: baseline.threshold,
        threshold,
        sampleId,
        runId,
        failureReason: 'judge_score_rewrite',
        errorCode: 'JUDGE_SCORE_REWRITE',
        exitReason: `emitted score ${score} diverges from raw judge score ${rawJudgeScore}`,
        reason: scored.reason,
      });
    }
    judgeModelVersion = scored.judgeModelVersion;
    judgeEndpoint = scored.judgeEndpoint;
    judgeModelId = scored.judgeModelId;
    scorerId = scored.scorerId;
    scorerVersion = scored.scorerVersion;
    reason = scored.reason;
    analysis = scored.analysis as Record<string, unknown> | undefined;
    invariantScoreFromJudge = scored.invariantScore;
  } catch (err) {
    if (err instanceof JudgeUnavailableError || err instanceof JudgeInvalidScoreError) {
      return failedResult({
        fixture,
        datasetVersion: sampleDatasetVersion,
        baselineVersion: baseline.version,
        threshold,
        baseline: baseline.threshold,
        sampleId,
        runId,
        failureReason:
          err.code === 'JUDGE_UNAVAILABLE' ? 'judge_unavailable' : 'judge_invalid_score',
        errorCode: err.code,
        exitReason: err.message,
        modelVersion: JUDGE_MODEL_VERSION,
        promptVersion: rubric.promptVersion,
      });
    }
    const msg = err instanceof Error ? err.message : String(err);
    if (/unreachable|ECONNREFUSED|fetch failed|ROLE_UNAVAILABLE|timeout|abort/i.test(msg)) {
      return failedResult({
        fixture,
        datasetVersion: sampleDatasetVersion,
        baselineVersion: baseline.version,
        threshold,
        sampleId,
        runId,
        failureReason: 'judge_unavailable',
        errorCode: 'JUDGE_UNAVAILABLE',
        exitReason: msg,
      });
    }
    throw err;
  }

  // --- deterministic invariants (independent of judge score) ---
  const invariants = runDeterministicInvariants(sample.output);
  const meetsThreshold = score >= threshold;
  const tag = primaryTag(sample);

  // --- persist score row (immutable) ---
  let scoreId: string | null = null;
  if (!options.dryRun) {
    const persisted = await insertEvalScore({
      runId,
      sampleId,
      scorerId,
      score,
      baselineThreshold: threshold,
      datasetVersion: sampleDatasetVersion,
      rubricVersion: rubric.version,
      scorerVersion,
      judgeModelVersion,
      promptVersion: rubric.promptVersion,
      baselineVersion: baseline.version,
      tag,
      reason: reason ?? null,
      analysis: {
        ...(analysis ?? {}),
        rawJudgeScore,
        emittedScore: score,
        invariantScore: invariantScoreFromJudge,
        deterministicInvariants: invariants.checks,
        deterministicFailures: invariants.failures,
        fixture,
        threshold,
        meetsThreshold,
        invariantPassed: invariants.passed,
      },
      judgeEndpoint,
      judgeModelId,
      databaseUrl: options.databaseUrl,
    });
    scoreId = persisted.id;
  }

  const base = {
    fixture,
    datasetVersion: sampleDatasetVersion,
    baselineVersion: baseline.version,
    modelVersion: judgeModelVersion,
    promptVersion: rubric.promptVersion,
    score,
    rawJudgeScore,
    baseline: baseline.threshold,
    threshold,
    runId,
    scoreId,
    sampleId,
    meetsThreshold,
    invariantPassed: invariants.passed,
    deterministicFailures: invariants.failures,
    reason,
    researchEval: null as ResearchEvalReport | null,
    researchScorerFailures: [] as ResearchScorerResult[],
  };

  // Threshold regression takes precedence for failureReason (deliberately-bad
  // proof). Deterministic failures still always block when score meets threshold
  // (and are always present in deterministicFailures for independent inspection).
  if (!meetsThreshold) {
    return failedResult({
      ...base,
      failureReason: 'threshold_regression',
      exitReason: `score ${score} < threshold ${threshold}`,
    });
  }

  // Deterministic failures block even when judge score is at/above threshold.
  if (!invariants.passed) {
    return failedResult({
      ...base,
      failureReason: 'deterministic_invariant_failure',
      exitReason: `deterministic invariant failed: ${invariants.failures
        .map((f) => f.invariantId)
        .join(', ')}`,
    });
  }

  return passedResult({
    ...base,
    exitReason: 'passed',
  });
}

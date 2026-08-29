/**
 * obs-3 — Mastra 1.x scorers (model-graded + deterministic) over the local judge role.
 *
 * Pattern: createScorer({ id }).analyze(...).generateScore(...) from @mastra/core/evals.
 * Judge model is ALWAYS resolveModel('judge') → createFleetChatModel — never cloud fallback.
 *
 * Anti-pattern: 0.x Metric classes, constant scores, fixture-label-derived scores.
 */

import { randomUUID } from 'node:crypto';
import { createScorer, runEvals } from '@mastra/core/evals';
import { z } from 'zod';
import { type ResolvedModel, RoleUnavailableError, resolveModel } from '../inference/resolve-model';
import { createFleetAgentModelBundle, runFleetModelCall } from '../inference/telemetry';
import type { Baseline, DatasetSample, Rubric } from './datasets';
import { loadRubric } from './datasets';

/** Canonical judge identity version persisted with every score. */
export const JUDGE_MODEL_VERSION = 'judge_v1';

export const SCORER_ID_RESEARCH_QUALITY = 'research-quality';
export const SCORER_ID_RESEARCH_INVARIANTS = 'research-invariants';

export class JudgeUnavailableError extends Error {
  readonly code = 'JUDGE_UNAVAILABLE' as const;
  constructor(
    readonly endpoint: string,
    readonly causeMessage: string
  ) {
    super(`JUDGE_UNAVAILABLE: local judge unreachable at ${endpoint}: ${causeMessage}`);
    this.name = 'JudgeUnavailableError';
  }
}

export class JudgeInvalidScoreError extends Error {
  readonly code = 'JUDGE_INVALID_SCORE' as const;
  constructor(message: string) {
    super(message);
    this.name = 'JudgeInvalidScoreError';
  }
}

export const JudgeAnalysisSchema = z.object({
  score: z.number().min(0).max(1),
  reasoning: z.string(),
  hasCitations: z.boolean(),
  isGrounded: z.boolean(),
  isStructured: z.boolean(),
  isComplete: z.boolean(),
});

export type JudgeAnalysis = z.infer<typeof JudgeAnalysisSchema>;

export type ResolvedJudge = {
  resolved: ResolvedModel;
  /** Model handle for createScorer.judge — constructed only via the instrumented client. */
  model: Awaited<ReturnType<typeof createFleetAgentModelBundle>>['model'];
  judgeModelVersion: string;
  litellmModelId: string;
  endpoint: string;
};

/**
 * Resolve the local judge role. Fail closed — never falls back to cloud.
 * Model construction goes through createFleetAgentModelBundle (telemetry.ts).
 */
export async function resolveLocalJudge(options?: {
  endpointOverride?: string;
  skipHealth?: boolean;
}): Promise<ResolvedJudge> {
  try {
    const { model, resolved } = await createFleetAgentModelBundle({
      role: 'judge',
      resolveOptions: {
        endpointOverride: options?.endpointOverride,
        skipHealth: options?.skipHealth,
        allowEscape: false,
      },
      apiKey: process.env.FLEET_KEY ?? 'sk-none',
    });
    if (resolved.provider !== 'fleet') {
      throw new JudgeUnavailableError(
        resolved.endpoint,
        `judge resolved to non-fleet provider '${resolved.provider}' — cloud fallback refused`
      );
    }
    return {
      resolved,
      model,
      judgeModelVersion: JUDGE_MODEL_VERSION,
      litellmModelId: resolved.litellmModelId,
      endpoint: resolved.endpoint,
    };
  } catch (err) {
    if (err instanceof JudgeUnavailableError) throw err;
    if (err instanceof RoleUnavailableError) {
      throw new JudgeUnavailableError(err.endpoint, err.causeMessage);
    }
    const msg = err instanceof Error ? err.message : String(err);
    throw new JudgeUnavailableError(options?.endpointOverride ?? 'judge', msg);
  }
}

function buildJudgePrompt(rubric: Rubric, input: string, output: string): string {
  const criteria = rubric.criteria
    .map((c) => `- ${c.id} (weight ${c.weight}): ${c.description}`)
    .join('\n');
  return `${rubric.judgeInstructions}

## Rubric ${rubric.version}
${criteria}

## Scoring guidance
${rubric.scoringGuidance}

## Hard rules
- Score holistically for research quality. Do NOT compute a pure weighted average that zeros the citations criterion and then multiplies — missing citation markers alone must not force an otherwise excellent brief below 0.8.
- Do NOT assign score < 0.8 to a response that is structured, covers benefits + limitations + bottom line, and includes numbered citations [1] with a Sources list.
- Do NOT assign score < 0.8 to a response that is structured (isStructured=true), complete (isComplete=true), grounded (isGrounded=true), and covers benefits + limitations/safety + bottom line with calibrated uncertainty — even when hasCitations=false. Set hasCitations=false honestly, but still award overall score >= 0.8. Missing citation markers are enforced by a separate deterministic required-citation invariant, not by the model-graded threshold.
- Do NOT assign score >= 0.5 to a flippant, joke, empty, or one-line answer (hasCitations=false alone is NOT sufficient to score a thorough brief below 0.5).
- Example/placeholder DOI or URL strings in fixtures still count as citation markers.
- Your numeric score MUST match your reasoning. Never claim the response belongs below 0.8 while emitting score >= 0.8, and never claim it clears 0.8 while emitting a sub-threshold score.

## Task prompt (input)
${input}

## Candidate response (output)
${output}

## Required JSON
Respond with ONLY a JSON object matching:
{
  "score": <number 0..1>,
  "reasoning": "<brief justification>",
  "hasCitations": <boolean>,
  "isGrounded": <boolean>,
  "isStructured": <boolean>,
  "isComplete": <boolean>
}`;
}

/**
 * Model-graded research-quality scorer using the local judge via createScorer.
 * The analyze step is a real LLM judge call (prompt object + generateScore).
 */
export function createResearchQualityScorer(options: { judge: ResolvedJudge; rubric: Rubric }) {
  const { judge, rubric } = options;
  return createScorer({
    id: SCORER_ID_RESEARCH_QUALITY,
    description: `Research quality scorer (${rubric.version}) graded by local judge role`,
    judge: {
      model: judge.model,
      instructions: rubric.judgeInstructions,
      jsonPromptInjection: true,
    },
  })
    .analyze({
      description: 'Grade research output quality 0-1 against versioned rubric',
      outputSchema: JudgeAnalysisSchema,
      createPrompt: ({ run }) => {
        const input =
          typeof run.input === 'string'
            ? run.input
            : run.input != null
              ? JSON.stringify(run.input)
              : '';
        const output =
          typeof run.output === 'string' ? run.output : JSON.stringify(run.output ?? '');
        return buildJudgePrompt(rubric, input, output);
      },
    })
    .generateScore(({ results }) => {
      // REDHAT-FIX-H1-R: emit the real judge numeric score unchanged.
      // No post-judge floor/rewrite. Citation absence is enforced solely by the
      // deterministic required-citation invariant (runDeterministicInvariants).
      const analysis = results.analyzeStepResult as JudgeAnalysis | undefined;
      return finalizeJudgeScore(analysis);
    });
}

/**
 * Pure finalize step for research-quality scores.
 * Returns the judge's raw numeric score with range validation only — never rewrites.
 */
export function finalizeJudgeScore(analysis: JudgeAnalysis | undefined): number {
  const score = analysis?.score;
  if (typeof score !== 'number' || Number.isNaN(score) || score < 0 || score > 1) {
    throw new JudgeInvalidScoreError(
      `judge returned non-numeric or out-of-range score: ${String(score)}`
    );
  }
  return score;
}

/**
 * Deterministic invariant scorer — independent of judge prose.
 * Checks non-empty, minimum length, and citation/source markers.
 */
export function createResearchInvariantScorer() {
  return createScorer({
    id: SCORER_ID_RESEARCH_INVARIANTS,
    description: 'Deterministic structural invariants for research outputs',
  })
    .analyze(({ run }) => {
      const output = typeof run.output === 'string' ? run.output : JSON.stringify(run.output ?? '');
      const trimmed = output.trim();
      // Require real citation markers — bare word "sources" without links/numbers is not enough.
      const hasCitationMarker =
        /\[\d+\]/.test(trimmed) ||
        /https?:\/\//i.test(trimmed) ||
        /\bdoi:\s*10\.\d+/i.test(trimmed) ||
        /\bSources:\s*\n/i.test(trimmed) ||
        /\[[^\]]+\]\(https?:\/\//i.test(trimmed);
      return {
        nonEmpty: trimmed.length > 0,
        minLength: trimmed.length >= 80,
        hasCitationMarker,
        length: trimmed.length,
      };
    })
    .generateScore(({ results }) => {
      const r = results.analyzeStepResult as {
        nonEmpty: boolean;
        minLength: boolean;
        hasCitationMarker: boolean;
      };
      let score = 0;
      if (r.nonEmpty) score += 0.34;
      if (r.minLength) score += 0.33;
      if (r.hasCitationMarker) score += 0.33;
      return Math.min(1, Math.max(0, score));
    });
}

export type ScoreFixtureResult = {
  score: number;
  reason?: string;
  analysis?: JudgeAnalysis | Record<string, unknown>;
  scorerId: string;
  scorerVersion: string;
  judgeModelVersion: string;
  judgeEndpoint: string;
  judgeModelId: string;
  invariantScore: number;
  analyzePrompt?: string;
};

/**
 * Score a single fixture sample with the local judge + deterministic invariants.
 *
 * S31-07: the judge LLM call goes through runFleetModelCall (callKind object)
 * so evals/scorers always writes a durable inference_telemetry row. Deterministic
 * invariants still use createScorer without a model.
 */
export async function scoreFixture(options: {
  sample: DatasetSample;
  rubric?: Rubric;
  baseline?: Baseline;
  judgeEndpointOverride?: string;
}): Promise<ScoreFixtureResult> {
  const rubric =
    options.rubric ?? loadRubric(options.baseline?.rubricVersion ?? 'research-quality_v1');

  // Resolve judge metadata (endpoint/model id) without a separate uninstrumented call.
  let judgeMeta: {
    judgeModelVersion: string;
    endpoint: string;
    litellmModelId: string;
  };
  try {
    const resolved = await resolveModel('judge', {
      endpointOverride: options.judgeEndpointOverride,
      allowEscape: false,
    });
    if (resolved.provider !== 'fleet') {
      throw new JudgeUnavailableError(
        resolved.endpoint,
        `judge resolved to non-fleet provider '${resolved.provider}' — cloud fallback refused`
      );
    }
    judgeMeta = {
      judgeModelVersion: JUDGE_MODEL_VERSION,
      endpoint: resolved.endpoint,
      litellmModelId: resolved.litellmModelId,
    };
  } catch (err) {
    if (err instanceof JudgeUnavailableError) throw err;
    if (err instanceof RoleUnavailableError) {
      throw new JudgeUnavailableError(err.endpoint, err.causeMessage);
    }
    const msg = err instanceof Error ? err.message : String(err);
    throw new JudgeUnavailableError(options.judgeEndpointOverride ?? 'judge', msg);
  }

  const analyzePrompt = buildJudgePrompt(rubric, options.sample.input, options.sample.output);

  // Prefer object path; fall back to chat + JSON parse with response_format stripped
  // (local reasoning models often emit content=null under json_schema).
  let analysis: JudgeAnalysis;
  try {
    const call = await runFleetModelCall({
      role: 'judge',
      prompt: analyzePrompt,
      runId: randomUUID(),
      stepId: 'evals/scorers',
      callSite: 'evals/scorers',
      callKind: 'object',
      schema: JudgeAnalysisSchema,
      modelOptions: { apiKey: process.env.FLEET_KEY ?? 'sk-none' },
      resolveOptions: {
        endpointOverride: options.judgeEndpointOverride,
        allowEscape: false,
      },
      maxOutputTokens: 1024,
      stripResponseFormat: true,
      repairText: async ({ text }) => text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, ''),
      exportToLangfuse: false,
    });
    analysis = call.object as JudgeAnalysis;
  } catch {
    const call = await runFleetModelCall({
      role: 'judge',
      prompt: analyzePrompt,
      runId: randomUUID(),
      stepId: 'evals/scorers',
      callSite: 'evals/scorers',
      callKind: 'chat',
      modelOptions: { apiKey: process.env.FLEET_KEY ?? 'sk-none' },
      resolveOptions: {
        endpointOverride: options.judgeEndpointOverride,
        allowEscape: false,
      },
      maxOutputTokens: 1024,
      exportToLangfuse: false,
    });
    const raw = call.text
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new JudgeInvalidScoreError(`judge returned non-JSON: ${raw.slice(0, 200)}`);
    }
    analysis = JudgeAnalysisSchema.parse(JSON.parse(jsonMatch[0]));
  }
  const score = finalizeJudgeScore(analysis);

  const invariantScorer = createResearchInvariantScorer();
  const invariantRun = await invariantScorer.run({
    input: options.sample.input,
    output: options.sample.output,
  });

  return {
    score,
    reason: analysis?.reasoning,
    analysis: analysis ?? undefined,
    scorerId: SCORER_ID_RESEARCH_QUALITY,
    scorerVersion: rubric.scorerVersion,
    judgeModelVersion: judgeMeta.judgeModelVersion,
    judgeEndpoint: judgeMeta.endpoint,
    judgeModelId: judgeMeta.litellmModelId,
    invariantScore: invariantRun.score,
    analyzePrompt,
  };
}

/**
 * Batch path using runEvals from @mastra/core/evals against a real agent target.
 * Exported for CI-style agent regression; fixture CLI uses scoreFixture.
 */
export { runEvals };

/**
 * obs-3 — Immutable versioned eval datasets (commit-pinned JSONL).
 *
 * Datasets are never mutated in place. Load by explicit version id
 * (e.g. research_v1). Fail closed on missing versions.
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

const HERE = dirname(fileURLToPath(import.meta.url));

/** Default committed datasets root: packages/platform/evals/datasets */
export function defaultDatasetsDir(): string {
  return join(HERE, '../../evals/datasets');
}

export function defaultRubricsDir(): string {
  return join(HERE, '../../evals/rubrics');
}

export function defaultBaselinesDir(): string {
  return join(HERE, '../../evals/baselines');
}

export const DatasetSampleSchema = z.object({
  id: z.string().min(1),
  input: z.string(),
  output: z.string(),
  expected: z.record(z.string(), z.unknown()).optional(),
  metadata: z
    .object({
      tags: z.array(z.string()).default([]),
      source: z.string().optional(),
      dateCreated: z.string().optional(),
      intent: z.string().optional(),
    })
    .passthrough()
    .optional(),
});

export type DatasetSample = z.infer<typeof DatasetSampleSchema>;

export const RubricSchema = z.object({
  id: z.string(),
  version: z.string(),
  promptVersion: z.string(),
  scorerId: z.string(),
  scorerVersion: z.string(),
  scale: z.object({ min: z.number(), max: z.number() }),
  judgeInstructions: z.string(),
  criteria: z.array(
    z.object({
      id: z.string(),
      weight: z.number(),
      description: z.string(),
    })
  ),
  scoringGuidance: z.string(),
});

export type Rubric = z.infer<typeof RubricSchema>;

export const BaselineSchema = z.object({
  id: z.string(),
  version: z.string(),
  datasetVersion: z.string(),
  rubricVersion: z.string(),
  scorerId: z.string(),
  scorerVersion: z.string(),
  judgeModelVersion: z.string(),
  promptVersion: z.string(),
  threshold: z.number().min(0).max(1),
  notes: z.string().optional(),
});

export type Baseline = z.infer<typeof BaselineSchema>;

export class DatasetNotFoundError extends Error {
  readonly code = 'DATASET_NOT_FOUND' as const;
  constructor(readonly datasetVersion: string) {
    super(`dataset version not found: ${datasetVersion}`);
    this.name = 'DatasetNotFoundError';
  }
}

export class SampleNotFoundError extends Error {
  readonly code = 'SAMPLE_NOT_FOUND' as const;
  constructor(
    readonly datasetVersion: string,
    readonly sampleId: string
  ) {
    super(`sample '${sampleId}' not found in dataset ${datasetVersion}`);
    this.name = 'SampleNotFoundError';
  }
}

export class RubricNotFoundError extends Error {
  readonly code = 'RUBRIC_NOT_FOUND' as const;
  constructor(readonly rubricVersion: string) {
    super(`rubric version not found: ${rubricVersion}`);
    this.name = 'RubricNotFoundError';
  }
}

export class BaselineNotFoundError extends Error {
  readonly code = 'BASELINE_NOT_FOUND' as const;
  constructor(readonly baselineVersion: string) {
    super(`baseline version not found: ${baselineVersion}`);
    this.name = 'BaselineNotFoundError';
  }
}

function readJsonl(path: string): unknown[] {
  const text = readFileSync(path, 'utf8');
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith('#'));
  return lines.map((line, i) => {
    try {
      return JSON.parse(line) as unknown;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`invalid JSONL at ${path}:${i + 1}: ${msg}`);
    }
  });
}

/** Load an immutable versioned dataset (e.g. research_v1). */
export function loadDataset(
  datasetVersion: string,
  options?: { datasetsDir?: string }
): { version: string; samples: DatasetSample[]; path: string } {
  const dir = options?.datasetsDir ?? defaultDatasetsDir();
  const path = join(dir, `${datasetVersion}.jsonl`);
  if (!existsSync(path)) {
    throw new DatasetNotFoundError(datasetVersion);
  }
  const raw = readJsonl(path);
  const samples = raw.map((row, i) => {
    const parsed = DatasetSampleSchema.safeParse(row);
    if (!parsed.success) {
      throw new Error(`dataset ${datasetVersion} row ${i + 1} invalid: ${parsed.error.message}`);
    }
    return parsed.data;
  });
  return { version: datasetVersion, samples, path };
}

/** Resolve a single sample by id from a versioned dataset. */
export function loadSample(
  datasetVersion: string,
  sampleId: string,
  options?: { datasetsDir?: string }
): DatasetSample & { datasetVersion: string } {
  const { samples } = loadDataset(datasetVersion, options);
  const found = samples.find((s) => s.id === sampleId);
  if (!found) {
    throw new SampleNotFoundError(datasetVersion, sampleId);
  }
  return { ...found, datasetVersion };
}

/** Map CLI --sample aliases to dataset sample ids (identity today). */
export function resolveSampleAlias(sample: string): string {
  const aliases: Record<string, string> = {
    'known-good': 'known-good',
    'deliberately-bad': 'deliberately-bad',
    'regression-thin': 'regression-thin',
  };
  return aliases[sample] ?? sample;
}

export function loadRubric(rubricVersion: string, options?: { rubricsDir?: string }): Rubric {
  const dir = options?.rubricsDir ?? defaultRubricsDir();
  const path = join(dir, `${rubricVersion}.json`);
  if (!existsSync(path)) {
    throw new RubricNotFoundError(rubricVersion);
  }
  const raw = JSON.parse(readFileSync(path, 'utf8')) as unknown;
  const parsed = RubricSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(`rubric ${rubricVersion} invalid: ${parsed.error.message}`);
  }
  return parsed.data;
}

export function loadBaseline(
  baselineVersion: string,
  options?: { baselinesDir?: string }
): Baseline {
  const dir = options?.baselinesDir ?? defaultBaselinesDir();
  const path = join(dir, `${baselineVersion}.json`);
  if (!existsSync(path)) {
    throw new BaselineNotFoundError(baselineVersion);
  }
  const raw = JSON.parse(readFileSync(path, 'utf8')) as unknown;
  const parsed = BaselineSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(`baseline ${baselineVersion} invalid: ${parsed.error.message}`);
  }
  return parsed.data;
}

/** Primary intent tag from sample metadata (happy-path | adversarial | regression). */
export function primaryTag(sample: DatasetSample): string {
  const tags = sample.metadata?.tags ?? [];
  if (sample.metadata?.intent) return sample.metadata.intent;
  for (const t of ['adversarial', 'happy-path', 'regression'] as const) {
    if (tags.includes(t)) return t;
  }
  return tags[0] ?? 'untagged';
}

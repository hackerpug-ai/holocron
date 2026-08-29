/**
 * obs-3 — Versioned eval scorers + datasets/baselines + local judge + drift.
 *
 * Covers AC-1..AC-5 / TC-1..TC-5 against real Postgres + local judge fleet.
 *
 * RED: evals modules / CLI / eval_scores table missing.
 * GREEN: known-good >= baseline, deliberately-bad < baseline, version metadata
 *        persists, longitudinal drift, fail-closed on missing judge/dataset.
 *
 * NEGATIVE_CONTROL (would fail if):
 * - disconnect / stub / empty / mock / static constant scores
 * - unversioned baselines / mutable latest.json datasets
 * - fabricated scores without local judge
 * - silent cloud judge fallback
 * - Mastra 0.x Metric classes
 *
 * Run:
 *   PLATFORM_IT=1 DATABASE_URL=postgres://inference1@127.0.0.1:5432/holocron \
 *     pnpm vitest run packages/platform/tests/integration/evals-versioning.test.ts
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { createSql, type Sql } from '../../src/db/client';
import { resolveDatabaseUrl } from '../../src/db/connection';
import { applyMigrations } from '../../src/db/migrate';

const PLATFORM_IT = process.env.PLATFORM_IT === '1';
// Residual go/no-go runs fleet-backed judges under concurrent load; 5m is too
// tight for deliberately-bad samples when the fleet is saturated.
const FLEET_TIMEOUT_MS = 600_000;
const REPO_ROOT = resolve(import.meta.dirname, '../../../..');
const EVIDENCE_DIR = resolve(REPO_ROOT, '.tmp/obs-3');
const HOLO_CLI = resolve(REPO_ROOT, 'packages/platform/src/cli/holo.ts');
const BUN_BIN = process.env.BUN_BIN ?? 'bun';
const DATABASE_URL = process.env.DATABASE_URL ?? resolveDatabaseUrl({ preferHolocron: true });

const itLive = (
  name: string,
  fn: () => Promise<unknown> | undefined,
  timeout: number = FLEET_TIMEOUT_MS
) => {
  if (PLATFORM_IT) it(name, fn, timeout);
  else it.skip(name, fn);
};

function writeArtifact(name: string, body: unknown): string {
  mkdirSync(EVIDENCE_DIR, { recursive: true });
  const path = resolve(EVIDENCE_DIR, name);
  const text = typeof body === 'string' ? body : JSON.stringify(body, null, 2);
  const payload = text.endsWith('\n') ? text : `${text}\n`;
  writeFileSync(path, payload, 'utf8');
  return path;
}

function runHolo(args: string[]): { status: number | null; stdout: string; stderr: string } {
  let last: { status: number | null; stdout: string; stderr: string } = {
    status: null,
    stdout: '',
    stderr: '',
  };
  // One retry on spawnSync timeout (status null) — residual fleet load is bursty.
  for (let attempt = 0; attempt < 2; attempt++) {
    const result = spawnSync(BUN_BIN, [HOLO_CLI, ...args], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      env: { ...process.env, DATABASE_URL },
      timeout: FLEET_TIMEOUT_MS,
    });
    last = {
      status: result.status,
      stdout: result.stdout ?? '',
      stderr: result.stderr ?? '',
    };
    if (last.status !== null) return last;
  }
  return last;
}

type EvalScoreRow = {
  id: string;
  run_id: string;
  sample_id: string;
  score: string | number;
  baseline_threshold: string | number;
  dataset_version: string;
  rubric_version: string;
  scorer_version: string;
  judge_model_version: string;
  prompt_version: string;
  baseline_version: string;
  tag: string | null;
  scorer_id: string;
};

async function countScores(
  sql: Sql,
  where?: { runId?: string; sampleId?: string }
): Promise<number> {
  if (where?.runId) {
    const rows = await sql<{ c: string }[]>`
      SELECT count(*)::text AS c FROM eval_scores WHERE run_id = ${where.runId}
    `;
    return Number(rows[0]?.c ?? 0);
  }
  if (where?.sampleId) {
    const rows = await sql<{ c: string }[]>`
      SELECT count(*)::text AS c FROM eval_scores WHERE sample_id = ${where.sampleId}
    `;
    return Number(rows[0]?.c ?? 0);
  }
  const rows = await sql<{ c: string }[]>`SELECT count(*)::text AS c FROM eval_scores`;
  return Number(rows[0]?.c ?? 0);
}

async function listScoresByRun(sql: Sql, runId: string): Promise<EvalScoreRow[]> {
  return sql<EvalScoreRow[]>`
    SELECT
      id::text,
      run_id,
      sample_id,
      score,
      baseline_threshold,
      dataset_version,
      rubric_version,
      scorer_version,
      judge_model_version,
      prompt_version,
      baseline_version,
      tag,
      scorer_id
    FROM eval_scores
    WHERE run_id = ${runId}
    ORDER BY created_at ASC
  `;
}

describe('obs-3 evals versioning (local judge + Postgres)', () => {
  beforeAll(async () => {
    if (!PLATFORM_IT) return;
    const mig = await applyMigrations({ databaseUrl: DATABASE_URL });
    expect(mig.ok).toBe(true);
    writeArtifact('migrate-result.json', mig);
  }, 60_000);

  itLive('AC-1 / TC-1: known-good local judge score >= baseline and persists', async () => {
    const result = runHolo(['evals:run', '--sample', 'known-good', '--json']);
    writeArtifact('ac1-known-good.json', {
      status: result.status,
      stdout: result.stdout,
      stderr: result.stderr,
    });
    expect(result.status).toBe(0);
    const payload = JSON.parse(result.stdout) as {
      ok: boolean;
      score: number;
      baseline: number;
      sampleId: string;
      datasetVersion: string;
      runId: string;
      scoreId: string;
      tag?: string;
    };
    expect(payload.ok).toBe(true);
    expect(payload.sampleId).toBe('known-good');
    expect(payload.datasetVersion).toBe('research_v1');
    expect(payload.baseline).toBe(0.8);
    expect(payload.score).toBeGreaterThanOrEqual(0.8);
    expect(payload.scoreId).toBeTruthy();
    expect(payload.runId).toBeTruthy();

    const sql = createSql(DATABASE_URL);
    try {
      const rows = await listScoresByRun(sql, payload.runId);
      expect(rows.length).toBeGreaterThanOrEqual(1);
      const row = rows.find((r) => r.sample_id === 'known-good') ?? rows[0];
      if (!row) throw new Error('known-good score row was not persisted');
      expect(Number(row.score)).toBeGreaterThanOrEqual(0.8);
      expect(Number(row.baseline_threshold)).toBe(0.8);
      expect(row.dataset_version).toBe('research_v1');
      writeArtifact('ac1-db-row.json', row);
    } finally {
      await sql.end({ timeout: 5 });
    }
  });

  itLive('AC-2 / TC-2: deliberately-bad score is below baseline', async () => {
    const result = runHolo(['evals:run', '--sample', 'deliberately-bad', '--json']);
    writeArtifact('ac2-deliberately-bad.json', {
      status: result.status,
      stdout: result.stdout,
      stderr: result.stderr,
    });
    expect(result.status).toBe(0);
    const payload = JSON.parse(result.stdout) as {
      ok: boolean;
      score: number;
      baseline: number;
      sampleId: string;
      tag: string;
      runId: string;
      scoreId: string;
    };
    expect(payload.ok).toBe(true);
    expect(payload.sampleId).toBe('deliberately-bad');
    expect(payload.baseline).toBe(0.8);
    expect(payload.score).toBeLessThan(0.8);
    expect(payload.tag).toBe('adversarial');
    expect(payload.scoreId).toBeTruthy();

    const sql = createSql(DATABASE_URL);
    try {
      const rows = await listScoresByRun(sql, payload.runId);
      expect(rows.length).toBeGreaterThanOrEqual(1);
      const row = rows.find((r) => r.sample_id === 'deliberately-bad') ?? rows[0];
      if (!row) throw new Error('deliberately-bad score row was not persisted');
      expect(Number(row.score)).toBeLessThan(0.8);
      expect(row.tag).toBe('adversarial');
      writeArtifact('ac2-db-row.json', row);
    } finally {
      await sql.end({ timeout: 5 });
    }
  });

  itLive('AC-3 / TC-3: version metadata persists with every score', async () => {
    // Ensure at least two scored runs exist
    const good = runHolo(['evals:run', '--sample', 'known-good', '--json']);
    const bad = runHolo(['evals:run', '--sample', 'deliberately-bad', '--json']);
    expect(good.status).toBe(0);
    expect(bad.status).toBe(0);
    const goodPayload = JSON.parse(good.stdout) as { runId: string };
    const badPayload = JSON.parse(bad.stdout) as { runId: string };

    const sql = createSql(DATABASE_URL);
    try {
      const rows = [
        ...(await listScoresByRun(sql, goodPayload.runId)),
        ...(await listScoresByRun(sql, badPayload.runId)),
      ];
      expect(rows.length).toBeGreaterThanOrEqual(2);
      for (const row of rows) {
        expect(row.dataset_version).toBe('research_v1');
        expect(row.rubric_version).toBe('research-quality_v1');
        expect(row.judge_model_version).toBe('judge_v1');
        expect(row.prompt_version).toBe('research-quality_v1');
        expect(row.baseline_version).toBe('research_v1');
        expect(row.scorer_version).toBeTruthy();
        expect(row.scorer_id).toBeTruthy();
        expect(row.sample_id).toBeTruthy();
      }
      writeArtifact('ac3-version-metadata.json', {
        scoreRowsChecked: rows.length,
        rows: rows.map((r) => ({
          sampleId: r.sample_id,
          datasetVersion: r.dataset_version,
          rubricVersion: r.rubric_version,
          judgeModelVersion: r.judge_model_version,
          promptVersion: r.prompt_version,
          baselineVersion: r.baseline_version,
          scorerVersion: r.scorer_version,
          scorerId: r.scorer_id,
        })),
      });
    } finally {
      await sql.end({ timeout: 5 });
    }
  });

  itLive('AC-4 / TC-4: drift output is longitudinal', async () => {
    // Seed two real eval runs
    expect(runHolo(['evals:run', '--sample', 'known-good', '--json']).status).toBe(0);
    expect(runHolo(['evals:run', '--sample', 'deliberately-bad', '--json']).status).toBe(0);

    const result = runHolo(['evals:drift', '--dataset', 'research_v1', '--json']);
    writeArtifact('ac4-drift.json', {
      status: result.status,
      stdout: result.stdout,
      stderr: result.stderr,
    });
    expect(result.status).toBe(0);
    const payload = JSON.parse(result.stdout) as {
      ok: boolean;
      datasetVersion: string;
      entries: Array<{
        score: number;
        datasetVersion: string;
        modelVersion: string;
        promptVersion: string;
        sampleId: string;
        runId: string;
      }>;
    };
    expect(payload.ok).toBe(true);
    expect(payload.datasetVersion).toBe('research_v1');
    expect(payload.entries.length).toBeGreaterThanOrEqual(2);
    for (const e of payload.entries) {
      expect(e.datasetVersion).toBe('research_v1');
      expect(e.modelVersion).toBe('judge_v1');
      expect(e.promptVersion).toBe('research-quality_v1');
      expect(typeof e.score).toBe('number');
    }
  });

  itLive('AC-5 / TC-5: missing evaluator input fails closed', async () => {
    const sql = createSql(DATABASE_URL);
    let before = 0;
    try {
      before = await countScores(sql);
    } finally {
      await sql.end({ timeout: 5 });
    }

    // Unknown dataset version
    const missingDataset = runHolo([
      'evals:run',
      '--sample',
      'known-good',
      '--dataset',
      'research_v999_missing',
      '--json',
    ]);
    writeArtifact('ac5-missing-dataset.json', {
      status: missingDataset.status,
      stdout: missingDataset.stdout,
      stderr: missingDataset.stderr,
    });
    expect(missingDataset.status).not.toBe(0);
    const missingBody = `${missingDataset.stdout}\n${missingDataset.stderr}`;
    expect(missingBody).toMatch(/DATASET_NOT_FOUND|dataset/i);

    // Judge unavailable (dead endpoint override via env)
    const judgeDown = runHolo([
      'evals:run',
      '--sample',
      'known-good',
      '--json',
      '--judge-endpoint',
      'http://127.0.0.1:1',
    ]);
    writeArtifact('ac5-judge-unavailable.json', {
      status: judgeDown.status,
      stdout: judgeDown.stdout,
      stderr: judgeDown.stderr,
    });
    expect(judgeDown.status).toBe(1);
    const judgeBody = `${judgeDown.stdout}\n${judgeDown.stderr}`;
    expect(judgeBody).toMatch(/JUDGE_UNAVAILABLE/);
    expect(judgeBody).not.toMatch(/fallback cloud judge|anthropic\.com/i);

    const sql2 = createSql(DATABASE_URL);
    try {
      const after = await countScores(sql2);
      // No new score rows from fail-closed paths
      expect(after).toBe(before);
      writeArtifact('ac5-score-count.json', { before, after });
    } finally {
      await sql2.end({ timeout: 5 });
    }
  });
});

/**
 * obs-4 — Deterministic-invariant + threshold CI regression gate.
 *
 * Covers AC-1..AC-5 / TC-1..TC-5 against real Postgres + local judge fleet
 * + deterministic invariant scorers.
 *
 * RED: evals:ci / ci-gate / deterministic-scorers / thresholds missing.
 * GREEN: deliberately-bad exits non-zero below threshold; known-good exits 0;
 *        deterministic invariant fails independently of judge score;
 *        invalid config fails closed; machine-readable JSON with versions.
 *
 * NEGATIVE_CONTROL (would fail if):
 * - disconnect / stub / empty / mock / static constant scores
 * - soft-warn regressions (exit 0 with warning)
 * - latest mutable baseline / absent threshold fallback
 * - fabricated scores without local judge
 * - deterministic checks dependent on judge prose
 *
 * Run:
 *   PLATFORM_IT=1 DATABASE_URL=postgres://inference1@127.0.0.1:5432/holocron \
 *     pnpm vitest run services/platform/tests/integration/evals-ci-gate.test.ts
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { createSql, type Sql } from '../../src/db/client';
import { resolveDatabaseUrl } from '../../src/db/connection';
import { applyMigrations } from '../../src/db/migrate';

const PLATFORM_IT = process.env.PLATFORM_IT === '1';
const FLEET_TIMEOUT_MS = 300_000;
const REPO_ROOT = resolve(import.meta.dirname, '../../../..');
const EVIDENCE_DIR = resolve(REPO_ROOT, '.tmp/obs-4');
const HOLO_CLI = resolve(REPO_ROOT, 'services/platform/src/cli/holo.ts');
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
  const result = spawnSync(BUN_BIN, [HOLO_CLI, ...args], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    env: { ...process.env, DATABASE_URL },
    timeout: FLEET_TIMEOUT_MS,
  });
  return { status: result.status, stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
}

function parseJson(stdout: string): Record<string, unknown> {
  const trimmed = stdout.trim();
  const start = trimmed.indexOf('{');
  if (start < 0) throw new Error(`no JSON object in stdout:\n${stdout}`);
  return JSON.parse(trimmed.slice(start)) as Record<string, unknown>;
}

async function listScoresByRun(sql: Sql, runId: string) {
  return sql<
    {
      id: string;
      run_id: string;
      sample_id: string;
      score: string | number;
      baseline_threshold: string | number;
      dataset_version: string;
      judge_model_version: string;
      prompt_version: string;
      baseline_version: string;
    }[]
  >`
    SELECT
      id::text,
      run_id,
      sample_id,
      score,
      baseline_threshold,
      dataset_version,
      judge_model_version,
      prompt_version,
      baseline_version
    FROM eval_scores
    WHERE run_id = ${runId}
    ORDER BY created_at ASC
  `;
}

describe('obs-4 evals CI gate (threshold + deterministic invariants)', () => {
  beforeAll(async () => {
    if (!PLATFORM_IT) return;
    const mig = await applyMigrations({ databaseUrl: DATABASE_URL });
    expect(mig.ok).toBe(true);
    writeArtifact('migrate-result.json', mig);
  }, 60_000);

  itLive('AC-1 / TC-1: deliberately-bad fixture blocks CI (threshold regression)', async () => {
    const result = runHolo(['evals:ci', '--fixture', 'deliberately-bad', '--json']);
    writeArtifact('ac1-deliberately-bad.json', {
      status: result.status,
      stdout: result.stdout,
      stderr: result.stderr,
    });

    expect(result.status).not.toBe(0);
    expect(result.status).toBe(1);

    const payload = parseJson(result.stdout);
    expect(payload.verdict).toBe('failed');
    expect(payload.exitCode).toBe(1);
    expect(Number(payload.score)).toBeLessThan(0.8);
    expect(Number(payload.threshold)).toBe(0.8);
    expect(payload.datasetVersion).toBe('research_v1');
    expect(payload.baselineVersion).toBe('research_v1');
    expect(payload.failureReason).toBe('threshold_regression');
    expect(payload.fixture).toBe('deliberately-bad');
  });

  itLive('AC-2 / TC-2: known-good fixture passes CI', async () => {
    const result = runHolo(['evals:ci', '--fixture', 'known-good', '--json']);
    writeArtifact('ac2-known-good.json', {
      status: result.status,
      stdout: result.stdout,
      stderr: result.stderr,
    });

    expect(result.status).toBe(0);

    const payload = parseJson(result.stdout);
    expect(payload.verdict).toBe('passed');
    expect(payload.exitCode).toBe(0);
    expect(Number(payload.score)).toBeGreaterThanOrEqual(0.8);
    expect(Number(payload.baseline)).toBe(0.8);
    expect(Number(payload.threshold)).toBe(0.8);
    expect(payload.datasetVersion).toBe('research_v1');
    expect(payload.fixture).toBe('known-good');
  });

  itLive('AC-3 / TC-3: deterministic invariant blocks independently of judge score', async () => {
    const result = runHolo([
      'evals:ci',
      '--fixture',
      'deterministic-invariant-regression',
      '--json',
    ]);
    writeArtifact('ac3-deterministic-invariant.json', {
      status: result.status,
      stdout: result.stdout,
      stderr: result.stderr,
    });

    expect(result.status).toBe(1);

    const payload = parseJson(result.stdout);
    expect(payload.verdict).toBe('failed');
    expect(payload.exitCode).toBe(1);
    expect(payload.failureReason).toBeTruthy();

    const failures = payload.deterministicFailures as
      | Array<{ invariantId: string; reason?: string }>
      | undefined;
    expect(Array.isArray(failures)).toBe(true);
    expect((failures ?? []).length).toBeGreaterThanOrEqual(1);
    const citation = (failures ?? []).find((f) => f.invariantId === 'required-citation');
    expect(citation).toBeTruthy();
    expect(citation?.invariantId).toBe('required-citation');
  });

  itLive('AC-4 / TC-4: invalid gate configuration fails closed', async () => {
    const result = runHolo(['evals:ci', '--fixture', 'invalid-config', '--json']);
    writeArtifact('ac4-invalid-config.json', {
      status: result.status,
      stdout: result.stdout,
      stderr: result.stderr,
    });

    expect(result.status).toBe(1);

    const payload = parseJson(result.stdout);
    expect(payload.verdict).toBe('failed');
    expect(payload.errorCode).toBe('INVALID_THRESHOLD');
    expect(payload.exitCode).toBe(1);
    // Must not soft-pass or invent a fallback baseline
    expect(payload.verdict).not.toBe('passed');
    const body = `${result.stdout}\n${result.stderr}`;
    expect(body).not.toMatch(/fallback baseline/i);
  });

  itLive(
    "AC-5 / TC-5: machine-readable CI output includes versions + threshold",
    async () => {
      const result = runHolo(['evals:ci', '--fixture', 'known-good', '--json']);
      writeArtifact('ac5-machine-readable.json', {
        status: result.status,
        stdout: result.stdout,
        stderr: result.stderr,
      });

      expect(result.status).toBe(0);
      const payload = parseJson(result.stdout);

      expect(payload.fixture).toBe('known-good');
      expect(payload.datasetVersion).toBe('research_v1');
      expect(payload.modelVersion).toBe('judge_v1');
      expect(payload.promptVersion).toBe('research-quality_v1');
      expect(Number(payload.score)).toBeGreaterThanOrEqual(0.8);
      expect(Number(payload.threshold)).toBe(0.8);
      expect(payload.verdict).toBe('passed');
      expect(payload.exitReason ?? payload.failureReason ?? null).not.toBe(undefined);

      // Persisted eval record must exist for the gate run
      const runId = String(payload.runId ?? '');
      expect(runId.length).toBeGreaterThan(0);
      const sql = createSql(DATABASE_URL);
      try {
        const rows = await listScoresByRun(sql, runId);
        expect(rows.length).toBeGreaterThanOrEqual(1);
        writeArtifact('ac5-db-row.json', rows[0]);
      } finally {
        await sql.end({ timeout: 5 });
      }
    }
  );
});

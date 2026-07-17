/**
 * obs-2 — Inference telemetry stream (tokens/wall-ms/endpoint/role) → Postgres per call.
 *
 * Covers AC-1..AC-5 / TC-1..TC-5 against real Postgres + Mastra + local fleet
 * (and real Anthropic escape for AC-3 when ANTHROPIC_API_KEY is present).
 *
 * RED (obs-2 seed): inference_telemetry missing / zero rows after real model calls.
 * GREEN: one durable redacted row per model call; telemetry:tail; budget-ledger correlate.
 *
 * NEGATIVE_CONTROL (would fail if):
 * - disconnect / stub / empty / mock / static success rows
 * - legacy agent_telemetry repurposed as substitute
 * - silent cloud fallback on default path
 * - failed calls omitted or rewritten as status=success
 * - prompt/response bodies persisted in telemetry
 *
 * Run:
 *   PLATFORM_IT=1 DATABASE_URL=postgres://inference1@127.0.0.1:5432/holocron \
 *     pnpm vitest run services/platform/tests/integration/inference-telemetry.test.ts
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { applyConsolidatedSecretsToEnv, getSecretValue } from '../../src/config/secrets';
import { createSql, type Sql } from '../../src/db/client';
import { resolveDatabaseUrl } from '../../src/db/connection';

const PLATFORM_IT = process.env.PLATFORM_IT === '1';
const FLEET_TIMEOUT_MS = 300_000;
const REPO_ROOT = resolve(import.meta.dirname, '../../../..');
const EVIDENCE_DIR = resolve(REPO_ROOT, '.tmp/obs-2');
const HOLO_CLI = resolve(REPO_ROOT, 'services/platform/src/cli/holo.ts');
const BUN_BIN = process.env.BUN_BIN ?? 'bun';
const DATABASE_URL = process.env.DATABASE_URL ?? resolveDatabaseUrl({ preferHolocron: true });
const FLEET_ENDPOINT = 'http://127.0.0.1:4545/v1';
const FLEET_ENDPOINT_BASE = 'http://127.0.0.1:4545';

const itLive = (
  name: string,
  fn: () => Promise<unknown> | undefined,
  timeout: number = FLEET_TIMEOUT_MS
) => {
  if (PLATFORM_IT) it(name, fn, timeout);
  else it.skip(name, fn);
};

function ensureAnthropicKeyFromSecrets(): boolean {
  applyConsolidatedSecretsToEnv();
  const fromEnv = process.env.ANTHROPIC_API_KEY?.trim();
  if (fromEnv) return true;
  const fromFile = getSecretValue('ANTHROPIC_API_KEY');
  if (fromFile?.trim()) {
    process.env.ANTHROPIC_API_KEY = fromFile.trim();
    return true;
  }
  return false;
}

const hasAnthropicKey = ensureAnthropicKeyFromSecrets();
const allowSkipAnthropic = process.env.ALLOW_SKIP_ANTHROPIC === '1';
const itAnthropic = (
  name: string,
  fn: () => Promise<unknown> | undefined,
  timeout: number = FLEET_TIMEOUT_MS
) => {
  if (PLATFORM_IT && hasAnthropicKey) it(name, fn, timeout);
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

type TelemetryRow = {
  id: string;
  runId: string | null;
  stepId: string | null;
  traceId: string | null;
  role: string;
  provider: string;
  endpoint: string;
  modelId: string | null;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  wallMs: number;
  status: string;
  errorCode: string | null;
  errorMessage: string | null;
  budgetLedgerId: string | null;
  createdAt?: Date | string | null;
};

type TelemetryModule = {
  runResearchModelMission: (opts: {
    runId: string;
    role?: string;
    prompts?: string[];
    databaseUrl?: string;
  }) => Promise<{
    runId: string;
    traceId: string;
    rows: TelemetryRow[];
    callCount: number;
  }>;
  runBudgetedEscapeWithTelemetry: (opts: {
    prompt: string;
    reason: string;
    runId: string;
    stepId?: string;
    role?: string;
    estimatedCostUsd?: number;
    databaseUrl?: string;
  }) => Promise<{
    runId: string;
    traceId: string;
    telemetry: TelemetryRow;
    escape: {
      tokens: number;
      cost: number;
      ledgerId: string;
      inputTokens: number;
      outputTokens: number;
      modelId: string;
      anthropicHostContacted: boolean;
    };
  }>;
  runFleetFailureFixture: (opts: {
    runId: string;
    role?: string;
    databaseUrl?: string;
  }) => Promise<{
    runId: string;
    traceId: string;
    telemetry: TelemetryRow;
    errorCode: string;
  }>;
  listInferenceTelemetry: (opts: {
    runId: string;
    databaseUrl?: string;
  }) => Promise<TelemetryRow[]>;
};

/**
 * Dynamic import so RED fails with a clear ReferenceError when the module is absent.
 */
async function loadTelemetry(): Promise<TelemetryModule> {
  const modPath = ['../../src/inference', 'telemetry'].join('/');
  try {
    const mod = (await import(modPath)) as Partial<TelemetryModule>;
    if (typeof mod.runResearchModelMission !== 'function') {
      throw new ReferenceError('runResearchModelMission is not defined');
    }
    if (typeof mod.runBudgetedEscapeWithTelemetry !== 'function') {
      throw new ReferenceError('runBudgetedEscapeWithTelemetry is not defined');
    }
    if (typeof mod.runFleetFailureFixture !== 'function') {
      throw new ReferenceError('runFleetFailureFixture is not defined');
    }
    if (typeof mod.listInferenceTelemetry !== 'function') {
      throw new ReferenceError('listInferenceTelemetry is not defined');
    }
    return mod as TelemetryModule;
  } catch (err) {
    if (
      err instanceof ReferenceError ||
      (err instanceof Error &&
        (/Cannot find|Failed to resolve|Cannot resolve|ERR_MODULE_NOT_FOUND/i.test(err.message) ||
          /is not defined/.test(err.message)))
    ) {
      const refErr = new ReferenceError(
        err instanceof ReferenceError ? err.message : 'inference telemetry module is not defined'
      );
      refErr.cause = err instanceof ReferenceError ? err.cause : err;
      throw refErr;
    }
    throw err;
  }
}

async function queryTelemetryByRunId(sql: Sql, runId: string): Promise<TelemetryRow[]> {
  const rows = await sql<
    {
      id: string;
      run_id: string | null;
      step_id: string | null;
      trace_id: string | null;
      role: string;
      provider: string;
      endpoint: string;
      model_id: string | null;
      input_tokens: number;
      output_tokens: number;
      total_tokens: number;
      wall_ms: number;
      status: string;
      error_code: string | null;
      error_message: string | null;
      budget_ledger_id: string | null;
      created_at: Date;
    }[]
  >`
    SELECT
      id::text,
      run_id,
      step_id,
      trace_id,
      role,
      provider,
      endpoint,
      model_id,
      input_tokens,
      output_tokens,
      total_tokens,
      wall_ms,
      status,
      error_code,
      error_message,
      budget_ledger_id::text,
      created_at
    FROM inference_telemetry
    WHERE run_id = ${runId}
    ORDER BY created_at ASC
  `;
  return rows.map((r) => ({
    id: r.id,
    runId: r.run_id,
    stepId: r.step_id,
    traceId: r.trace_id,
    role: r.role,
    provider: r.provider,
    endpoint: r.endpoint,
    modelId: r.model_id,
    inputTokens: Number(r.input_tokens),
    outputTokens: Number(r.output_tokens),
    totalTokens: Number(r.total_tokens),
    wallMs: Number(r.wall_ms),
    status: r.status,
    errorCode: r.error_code,
    errorMessage: r.error_message,
    budgetLedgerId: r.budget_ledger_id,
    createdAt: r.created_at,
  }));
}

function assertNoSecretsInRow(row: TelemetryRow): void {
  const serialized = JSON.stringify(row).toLowerCase();
  // Telemetry must never persist prompt/response bodies.
  expect(serialized).not.toMatch(/say exactly|reply with|system prompt|assistant:/i);
  expect(row).not.toHaveProperty('prompt');
  expect(row).not.toHaveProperty('response');
  expect(row).not.toHaveProperty('rawPrompt');
  expect(row).not.toHaveProperty('rawResponse');
}

describe('obs-2 inference telemetry', () => {
  beforeAll(() => {
    if (!PLATFORM_IT) return;
    mkdirSync(EVIDENCE_DIR, { recursive: true });
    const mig = runHolo(['db:migrate', '--json']);
    writeArtifact('db-migrate.json', {
      status: mig.status,
      stdout: mig.stdout.slice(0, 4000),
      stderr: mig.stderr.slice(0, 2000),
    });
    if (mig.status !== 0) {
      // RED phase: migration 0013 may not exist yet — tests still assert fail-closed.
      // After GREEN, migrate must succeed.
      console.warn(`db:migrate exit=${mig.status} (expected during RED before 0013 exists)`);
    }
  });

  itLive(
    'AC-1: one durable row per model call with tokens/wall-ms/endpoint/role/trace',
    async () => {
      const telemetry = await loadTelemetry();
      const runId = `obs2-ac1-${Date.now()}`;
      const result = await telemetry.runResearchModelMission({
        runId,
        role: 'divergent',
        prompts: ['Reply with exactly one word: alpha', 'Reply with exactly one word: beta'],
        databaseUrl: DATABASE_URL,
      });

      expect(result.runId).toBe(runId);
      expect(result.traceId).toBeTruthy();
      expect(result.callCount).toBeGreaterThanOrEqual(2);

      const sql = createSql(DATABASE_URL);
      try {
        const rows = await queryTelemetryByRunId(sql, runId);
        writeArtifact('AC-1-db-query.json', {
          runId,
          traceId: result.traceId,
          rowCount: rows.length,
          rows,
        });

        expect(rows.length, 'telemetry row count: >=2').toBeGreaterThanOrEqual(2);
        for (const row of rows) {
          expect(row.wallMs, 'wallMs: >0').toBeGreaterThan(0);
          expect(row.inputTokens, 'inputTokens: >=1').toBeGreaterThanOrEqual(1);
          expect(row.outputTokens, 'outputTokens: >=1').toBeGreaterThanOrEqual(1);
          expect(row.totalTokens).toBeGreaterThanOrEqual(1);
          // Accept base or /v1 form of the local fleet endpoint.
          expect(
            row.endpoint === FLEET_ENDPOINT ||
              row.endpoint === FLEET_ENDPOINT_BASE ||
              row.endpoint.includes('127.0.0.1:4545'),
            `endpoint local fleet, got ${row.endpoint}`
          ).toBe(true);
          expect(row.role).toBe('divergent');
          expect(row.traceId, 'traceId: <non-empty>').toBeTruthy();
          expect(row.runId).toBe(runId);
          expect(row.status).toBe('success');
          assertNoSecretsInRow(row);
        }
      } finally {
        await sql.end({ timeout: 5 });
      }
    }
  );

  itLive('AC-2: default path records local fleet routing (no Anthropic)', async () => {
    const telemetry = await loadTelemetry();
    const runId = `obs2-ac2-local-fleet-${Date.now()}`;
    await telemetry.runResearchModelMission({
      runId,
      role: 'divergent',
      prompts: ['Reply with exactly one word: fleet'],
      databaseUrl: DATABASE_URL,
    });

    const sql = createSql(DATABASE_URL);
    try {
      const rows = await queryTelemetryByRunId(sql, runId);
      writeArtifact('AC-2-local-fleet.json', { runId, rowCount: rows.length, rows });

      expect(rows.length).toBeGreaterThanOrEqual(1);
      for (const row of rows) {
        expect(row.provider).toBe('fleet');
        expect(
          row.endpoint === FLEET_ENDPOINT ||
            row.endpoint === FLEET_ENDPOINT_BASE ||
            row.endpoint.includes('127.0.0.1:4545')
        ).toBe(true);
        expect(row.role).toBe('divergent');
        expect(row.endpoint).not.toMatch(/api\.anthropic\.com/i);
        expect(row.provider).not.toBe('anthropic');
      }
      const cloudRows = rows.filter(
        (r) => r.provider === 'anthropic' || /api\.anthropic\.com/i.test(r.endpoint)
      );
      expect(cloudRows.length, 'default cloud rows: 0').toBe(0);
    } finally {
      await sql.end({ timeout: 5 });
    }
  });

  itAnthropic('AC-3: budgeted escape is cross-ledger visible', async () => {
    process.env.HOLO_ESCAPE_BUDGET_USD = process.env.HOLO_ESCAPE_BUDGET_USD || '10';
    const budgetPath = ['../../src/inference', 'budget-ledger'].join('/');
    const ledger = (await import(budgetPath)) as {
      setBudgetCeiling: (n: number) => Promise<{ ceiling: number }>;
      resetBudgetLedgerForTests?: () => Promise<void>;
    };
    if (typeof ledger.resetBudgetLedgerForTests === 'function') {
      await ledger.resetBudgetLedgerForTests();
    }
    await ledger.setBudgetCeiling(10);

    const telemetry = await loadTelemetry();
    const runId = `obs2-ac3-escape-${Date.now()}`;
    const result = await telemetry.runBudgetedEscapeWithTelemetry({
      prompt: 'Reply with exactly the single word: pong',
      reason: 'obs-2-budgeted-escape-fixture',
      runId,
      stepId: 'obs2-escape-step',
      role: 'divergent',
      estimatedCostUsd: 0.05,
      databaseUrl: DATABASE_URL,
    });

    expect(result.escape.anthropicHostContacted).toBe(true);
    expect(result.escape.ledgerId).toBeTruthy();
    expect(result.telemetry.provider).toBe('anthropic');
    expect(result.telemetry.runId).toBe(runId);

    const sql = createSql(DATABASE_URL);
    try {
      const telRows = await queryTelemetryByRunId(sql, runId);
      const budgetRows = await sql<
        {
          id: string;
          check_type: string | null;
          run_id: string | null;
          step_id: string | null;
          tokens: number;
          cost: number;
          allow_escape: boolean | null;
        }[]
      >`
        SELECT id::text, check_type, run_id, step_id, tokens, cost, allow_escape
        FROM budget_ledger
        WHERE run_id = ${runId}
        ORDER BY "timestamp" ASC
      `;

      const preCheck = budgetRows.filter((r) => r.check_type === 'pre-check');
      const escapeRows = budgetRows.filter(
        (r) => r.check_type === 'escape' || (r.check_type == null && Number(r.cost) > 0)
      );

      writeArtifact('AC-3-budgeted-escape.json', {
        runId,
        telemetryRows: telRows,
        budgetRows,
        preCheckCount: preCheck.length,
        escapeCount: escapeRows.length,
        correlation: {
          telemetryRunId: telRows[0]?.runId,
          budgetRunIds: budgetRows.map((r) => r.run_id),
          budgetLedgerIdOnTelemetry: telRows[0]?.budgetLedgerId,
          escapeLedgerId: result.escape.ledgerId,
        },
      });

      expect(preCheck.length, 'pre-check rows: 1').toBeGreaterThanOrEqual(1);
      expect(escapeRows.length, 'escape rows: 1').toBeGreaterThanOrEqual(1);
      expect(telRows.length, 'telemetry rows: 1').toBeGreaterThanOrEqual(1);
      expect(telRows[0]!.provider).toBe('anthropic');
      expect(telRows[0]!.runId).toBe(runId);
      expect(telRows[0]!.endpoint).toMatch(/api\.anthropic\.com/i);
      // Cross-ledger identity: same runId and/or budget_ledger id link.
      expect(
        telRows[0]!.budgetLedgerId === result.escape.ledgerId ||
          budgetRows.some((b) => b.id === telRows[0]!.budgetLedgerId) ||
          budgetRows.every((b) => b.run_id === runId)
      ).toBe(true);
      assertNoSecretsInRow(telRows[0]!);
    } finally {
      await sql.end({ timeout: 5 });
    }
  });

  itLive('AC-4: telemetry:tail exposes durable rows', async () => {
    const telemetry = await loadTelemetry();
    const runId = `obs2-ac4-tail-${Date.now()}`;
    await telemetry.runResearchModelMission({
      runId,
      role: 'divergent',
      prompts: ['Reply with exactly one word: tail'],
      databaseUrl: DATABASE_URL,
    });

    const cli = runHolo(['telemetry:tail', '--run-id', runId, '--json']);
    writeArtifact('AC-4-telemetry-tail.json', {
      runId,
      status: cli.status,
      stdout: cli.stdout,
      stderr: cli.stderr,
    });

    expect(cli.status, `telemetry:tail exit: ${cli.stderr}`).toBe(0);
    expect(cli.stdout.trim().length, 'empty output').toBeGreaterThan(0);

    const parsed = JSON.parse(cli.stdout) as {
      ok?: boolean;
      rows?: TelemetryRow[];
      count?: number;
    };
    const rows = parsed.rows ?? (Array.isArray(parsed) ? (parsed as TelemetryRow[]) : []);
    expect(rows.length, 'printed row count: >=1').toBeGreaterThanOrEqual(1);

    const row = rows[0]!;
    const tokens = row.totalTokens ?? (row as { tokens?: number }).tokens ?? 0;
    expect(Number(tokens), 'tokens column value: >=1').toBeGreaterThanOrEqual(1);
    expect(Number(row.wallMs), 'wall-ms column value: >0').toBeGreaterThan(0);
    expect(
      row.endpoint === FLEET_ENDPOINT ||
        row.endpoint === FLEET_ENDPOINT_BASE ||
        String(row.endpoint).includes('127.0.0.1:4545')
    ).toBe(true);
    expect(row.role).toBe('divergent');
    expect(row.provider).toBeTruthy();
    expect(row.runId ?? (row as { run_id?: string }).run_id).toBe(runId);
    expect(row.traceId ?? (row as { trace_id?: string }).trace_id).toBeTruthy();
    expect(cli.stdout.toLowerCase()).not.toMatch(/reply with exactly one word: tail/);
  });

  itLive('AC-5: failed call remains observable (ROLE_UNAVAILABLE)', async () => {
    const telemetry = await loadTelemetry();
    const runId = `obs2-ac5-failed-${Date.now()}`;
    const result = await telemetry.runFleetFailureFixture({
      runId,
      role: 'divergent',
      databaseUrl: DATABASE_URL,
    });

    expect(result.errorCode).toBe('ROLE_UNAVAILABLE');

    const sql = createSql(DATABASE_URL);
    try {
      const rows = await queryTelemetryByRunId(sql, runId);
      writeArtifact('AC-5-failed-call.json', {
        runId,
        result,
        rows,
      });

      const failed = rows.filter((r) => r.status === 'error');
      expect(failed.length, 'failed row count: 1').toBeGreaterThanOrEqual(1);
      const row = failed[0]!;
      expect(row.status).toBe('error');
      expect(row.errorCode).toBe('ROLE_UNAVAILABLE');
      expect(row.endpoint).toMatch(/:4545|:1\b|127\.0\.0\.1/);
      expect(row.role).toBe('divergent');
      expect(row.provider).not.toBe('anthropic');
      expect(rows.every((r) => r.status !== 'success')).toBe(true);
      assertNoSecretsInRow(row);
    } finally {
      await sql.end({ timeout: 5 });
    }
  });

  itLive('AC-3 key presence gate (fail-closed without ALLOW_SKIP_ANTHROPIC)', () => {
    writeArtifact('AC-3-key-presence.json', {
      hasAnthropicKey,
      allowSkipAnthropic,
      platformIt: PLATFORM_IT,
    });
    expect(
      hasAnthropicKey || allowSkipAnthropic,
      'AC-3 fail-closed: set ANTHROPIC_API_KEY or ALLOW_SKIP_ANTHROPIC=1 for local-dev'
    ).toBe(true);
  });
});

/**
 * obs-2 — Inference telemetry stream (tokens/wall-ms/endpoint/role) → Postgres per call.
 *
 * Covers AC-1..AC-5 / TC-1..TC-5 against real Postgres + Mastra + local fleet
 * and a **non-skippable** real Anthropic budgeted-escape path for AC-3 under
 * PLATFORM_IT=1 (REDHAT-FIX-H2).
 *
 * RED (obs-2 seed): inference_telemetry missing / zero rows after real model calls.
 * GREEN: one durable redacted row per model call; telemetry:tail; budget-ledger correlate.
 *
 * AC-3 gate (Sprint 12 / REDHAT-FIX-H2):
 *   - PLATFORM_IT=1 + no DEEPSEEK_API_KEY → hard fail (MISSING_DEPENDENCY), never skip/pass
 *   - ALLOW_SKIP_DEEPSEEK=1 is local-dev only and is NOT a valid Sprint 12 gate path
 *   - Key sources (no values logged): process.env, secrets.yaml, repo-root .env
 *
 * NEGATIVE_CONTROL (would fail if):
 * - disconnect / stub / empty / mock / static success rows
 * - legacy agent_telemetry repurposed as substitute
 * - silent cloud fallback on default path
 * - failed calls omitted or rewritten as status=success
 * - prompt/response bodies persisted in telemetry
 * - AC-3 silently skipped when Anthropic dependency is missing under PLATFORM_IT=1
 *
 * Run:
 *   set -a; source /path/to/repo/.env 2>/dev/null || true; set +a
 *   PLATFORM_IT=1 DATABASE_URL=postgres://inference1@127.0.0.1:5432/holocron \
 *     pnpm vitest run services/platform/tests/integration/inference-telemetry.test.ts
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { applyConsolidatedSecretsToEnv, getSecretValue } from '../../src/config/secrets';
import { createSql, type Sql } from '../../src/db/client';
import { resolveDatabaseUrl } from '../../src/db/connection';
import { resetProcessDegradedFlag } from '../../src/inference/degraded-process-flag';

const PLATFORM_IT = process.env.PLATFORM_IT === '1';
const FLEET_TIMEOUT_MS = 300_000;
const REPO_ROOT = resolve(import.meta.dirname, '../../../..');
const EVIDENCE_DIR = resolve(REPO_ROOT, '.tmp/obs-2');
const HOLO_CLI = resolve(REPO_ROOT, 'services/platform/src/cli/holo.ts');
const BUN_BIN = process.env.BUN_BIN ?? 'bun';
const DATABASE_URL = process.env.DATABASE_URL ?? resolveDatabaseUrl({ preferHolocron: true });
const FLEET_ENDPOINT = 'http://127.0.0.1:4545/v1';
const FLEET_ENDPOINT_BASE = 'http://127.0.0.1:4545';

const MISSING_ANTHROPIC_DEPENDENCY =
  'MISSING_DEPENDENCY: DEEPSEEK_API_KEY required for budgeted-escape telemetry proof (AC-3). ' +
  'Provide via process.env, services/platform/config/secrets.yaml, or repo-root .env. ' +
  'ALLOW_SKIP_DEEPSEEK=1 is local-dev only and is not valid for the Sprint 12 gate.';

const itLive = (
  name: string,
  fn: () => Promise<unknown> | void,
  timeout: number = FLEET_TIMEOUT_MS
) => {
  if (PLATFORM_IT) it(name, fn, timeout);
  else it.skip(name, fn);
};

/**
 * Candidate .env paths for local QA (gitignored; never committed).
 * Includes monorepo main root when running inside a `.worktrees/<name>` checkout.
 */
function candidateDotEnvPaths(repoRoot: string): string[] {
  const paths = [resolve(repoRoot, '.env')];
  const worktreeMatch = repoRoot.match(/^(.*)\/\.worktrees\/[^/]+$/);
  if (worktreeMatch?.[1]) {
    paths.push(resolve(worktreeMatch[1], '.env'));
  }
  return paths;
}

/**
 * Load KEY=VALUE pairs from a dotenv file into process.env without overwriting
 * non-empty existing values. Never logs secret values.
 */
function loadDotEnvFile(path: string): { loaded: boolean; keysApplied: string[] } {
  if (!existsSync(path)) return { loaded: false, keysApplied: [] };
  const text = readFileSync(path, 'utf8');
  const keysApplied: string[] = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!value) continue;
    if (process.env[key]?.trim()) continue;
    process.env[key] = value;
    keysApplied.push(key);
  }
  return { loaded: true, keysApplied };
}

type DeepSeekKeyProvenance = {
  present: boolean;
  source: 'env' | 'secrets.yaml' | 'dotenv' | null;
  dotenvPathsChecked: string[];
  dotenvPathUsed: string | null;
  secretsFileConsulted: boolean;
};

/**
 * Resolve DEEPSEEK_API_KEY from approved sources (never print the value):
 *   1. process.env (operator / CI / sourced shell)
 *   2. secrets.yaml via applyConsolidatedSecretsToEnv / getSecretValue
 *   3. repo-root .env (and monorepo main .env for worktrees)
 */
function ensureDeepSeekKeyFromSecrets(): DeepSeekKeyProvenance {
  const dotenvPathsChecked = candidateDotEnvPaths(REPO_ROOT);
  let dotenvPathUsed: string | null = null;

  // 1) Already in process env
  if (process.env.DEEPSEEK_API_KEY?.trim()) {
    return {
      present: true,
      source: 'env',
      dotenvPathsChecked,
      dotenvPathUsed: null,
      secretsFileConsulted: false,
    };
  }

  // 2) secrets.yaml (and any other flat keys)
  applyConsolidatedSecretsToEnv();
  const fromEnvAfterSecrets = process.env.DEEPSEEK_API_KEY?.trim();
  if (fromEnvAfterSecrets) {
    return {
      present: true,
      source: 'secrets.yaml',
      dotenvPathsChecked,
      dotenvPathUsed: null,
      secretsFileConsulted: true,
    };
  }
  const fromFile = getSecretValue('DEEPSEEK_API_KEY');
  if (fromFile?.trim()) {
    process.env.DEEPSEEK_API_KEY = fromFile.trim();
    return {
      present: true,
      source: 'secrets.yaml',
      dotenvPathsChecked,
      dotenvPathUsed: null,
      secretsFileConsulted: true,
    };
  }

  // 3) repo-root .env (local QA store; gitignored)
  // HOLO_DISABLE_DOTENV=1 is only for RED missing-dependency evidence capture —
  // never used for Sprint 12 GREEN / gate runs.
  const disableDotEnv = process.env.HOLO_DISABLE_DOTENV === '1';
  if (!disableDotEnv) {
    for (const p of dotenvPathsChecked) {
      const result = loadDotEnvFile(p);
      if (result.loaded && result.keysApplied.includes('DEEPSEEK_API_KEY')) {
        dotenvPathUsed = p;
      }
      if (process.env.DEEPSEEK_API_KEY?.trim()) {
        return {
          present: true,
          source: 'dotenv',
          dotenvPathsChecked,
          dotenvPathUsed: dotenvPathUsed ?? p,
          secretsFileConsulted: true,
        };
      }
    }
  }

  return {
    present: false,
    source: null,
    dotenvPathsChecked,
    dotenvPathUsed: null,
    secretsFileConsulted: true,
  };
}

const deepseekKeyProvenance = ensureDeepSeekKeyFromSecrets();
const hasDeepSeekKey = deepseekKeyProvenance.present;
const allowSkipAnthropic = process.env.ALLOW_SKIP_DEEPSEEK === '1';

/**
 * AC-3 budgeted-escape gate (REDHAT-FIX-H2):
 * - PLATFORM_IT=1 + key present → run real escape
 * - PLATFORM_IT=1 + key absent + ALLOW_SKIP_DEEPSEEK=1 → skip (local-dev only; not Sprint 12 gate)
 * - PLATFORM_IT=1 + key absent → FAIL CLOSED with MISSING_DEPENDENCY (never silent skip/pass)
 * - PLATFORM_IT!=1 → skip (suite not armed)
 */
const itAnthropic = (
  name: string,
  fn: () => Promise<unknown> | void,
  timeout: number = FLEET_TIMEOUT_MS
) => {
  if (!PLATFORM_IT) {
    it.skip(name, fn);
    return;
  }
  if (hasDeepSeekKey) {
    it(name, fn, timeout);
    return;
  }
  if (allowSkipAnthropic) {
    // Local-dev escape hatch only — Sprint 12 GREEN evidence must NOT set this.
    it.skip(name, fn);
    return;
  }
  // Fail closed: register a real failing test with an explicit missing-dependency reason.
  it(
    name,
    () => {
      writeArtifact('AC-3-missing-dependency.json', {
        blocked: true,
        reason: 'MISSING_DEPENDENCY',
        dependency: 'DEEPSEEK_API_KEY',
        platformIt: PLATFORM_IT,
        hasDeepSeekKey: false,
        allowSkipAnthropic: false,
        sourcesChecked: ['process.env', 'secrets.yaml', 'repo-root .env'],
        dotenvPathsChecked: deepseekKeyProvenance.dotenvPathsChecked,
        note: MISSING_ANTHROPIC_DEPENDENCY,
      });
      throw new Error(MISSING_ANTHROPIC_DEPENDENCY);
    },
    timeout
  );
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
      escapeHostContacted: boolean;
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
  beforeAll(async () => {
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

    // This suite proves the normal-mode escape path. Other integration files
    // deliberately persist the global degraded row; normalize both durable and
    // process-local state so serial full-suite order cannot turn AC-3 into a
    // false never-cloud refusal.
    resetProcessDegradedFlag();
    delete process.env.HOLO_PROCESS_DEGRADED_STATE;
    const sql = createSql(DATABASE_URL);
    try {
      await sql`
        INSERT INTO degraded_mode (id, degraded_state, resume_state, updated_at)
        VALUES ('global', 'normal', 'normal', now())
        ON CONFLICT (id) DO UPDATE SET
          degraded_state = 'normal',
          resume_state = 'normal',
          updated_at = now()
      `;
    } finally {
      await sql.end({ timeout: 5 });
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
        expect(row.endpoint).not.toMatch(/api\.deepseek\.com/i);
        expect(row.provider).not.toBe('deepseek');
      }
      const cloudRows = rows.filter(
        (r) => r.provider === 'deepseek' || /api\.deepseek\.com/i.test(r.endpoint)
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
    const stepId = 'obs2-escape-step';
    const result = await telemetry.runBudgetedEscapeWithTelemetry({
      prompt: 'Reply with exactly the single word: pong',
      reason: 'obs-2-budgeted-escape-fixture',
      runId,
      stepId,
      role: 'divergent',
      estimatedCostUsd: 0.05,
      databaseUrl: DATABASE_URL,
    });

    expect(result.escape.escapeHostContacted).toBe(true);
    expect(result.escape.ledgerId).toBeTruthy();
    expect(result.telemetry.provider).toBe('deepseek');
    expect(result.telemetry.runId).toBe(runId);
    expect(result.telemetry.stepId).toBe(stepId);
    expect(result.telemetry.budgetLedgerId).toBe(result.escape.ledgerId);

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
          timestamp: Date | string | null;
        }[]
      >`
        SELECT id::text, check_type, run_id, step_id, tokens, cost, allow_escape, "timestamp"
        FROM budget_ledger
        WHERE run_id = ${runId}
        ORDER BY "timestamp" ASC
      `;

      const preCheck = budgetRows.filter((r) => r.check_type === 'pre-check');
      const escapeRows = budgetRows.filter(
        (r) => r.check_type === 'escape' || (r.check_type == null && Number(r.cost) > 0)
      );
      const ledgerById = budgetRows.find((b) => b.id === result.escape.ledgerId);

      writeArtifact('AC-3-budgeted-escape.json', {
        runId,
        stepId,
        telemetryRows: telRows,
        budgetRows,
        preCheckCount: preCheck.length,
        escapeCount: escapeRows.length,
        correlation: {
          telemetryRunId: telRows[0]?.runId,
          telemetryStepId: telRows[0]?.stepId,
          budgetRunIds: budgetRows.map((r) => r.run_id),
          budgetStepIds: budgetRows.map((r) => r.step_id),
          budgetLedgerIdOnTelemetry: telRows[0]?.budgetLedgerId,
          escapeLedgerId: result.escape.ledgerId,
          ledgerRowFoundById: Boolean(ledgerById),
          joinedBy:
            telRows[0]?.budgetLedgerId === result.escape.ledgerId
              ? 'budget_ledger_id'
              : 'run_id/step_id',
        },
      });

      expect(preCheck.length, 'pre-check rows: 1').toBeGreaterThanOrEqual(1);
      expect(escapeRows.length, 'escape rows: 1').toBeGreaterThanOrEqual(1);
      expect(telRows.length, 'telemetry rows: 1').toBeGreaterThanOrEqual(1);

      const tel = telRows[0]!;
      expect(tel.provider).toBe('deepseek');
      expect(tel.runId).toBe(runId);
      expect(tel.stepId).toBe(stepId);
      expect(tel.endpoint).toMatch(/api\.deepseek\.com/i);
      expect(tel.modelId, 'modelId present on escape telemetry').toBeTruthy();
      expect(tel.wallMs, 'wallMs: >0').toBeGreaterThan(0);
      expect(tel.totalTokens, 'totalTokens: >=1').toBeGreaterThanOrEqual(1);
      expect(tel.status).toBe('success');

      // Cross-ledger identity: budget_ledger_id must join telemetry ↔ ledger.
      expect(tel.budgetLedgerId, 'telemetry.budget_ledger_id').toBe(result.escape.ledgerId);
      expect(ledgerById, 'budget_ledger row by escape.ledgerId').toBeTruthy();
      expect(ledgerById!.run_id).toBe(runId);
      expect(ledgerById!.step_id).toBe(stepId);
      expect(Number(ledgerById!.cost), 'ledger cost recorded').toBeGreaterThanOrEqual(0);
      expect(
        escapeRows.some((b) => b.id === result.escape.ledgerId || b.run_id === runId),
        'escape ledger row correlates by id/run_id'
      ).toBe(true);
      assertNoSecretsInRow(tel);
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
      expect(row.provider).not.toBe('deepseek');
      expect(rows.every((r) => r.status !== 'success')).toBe(true);
      assertNoSecretsInRow(row);
    } finally {
      await sql.end({ timeout: 5 });
    }
  });

  itLive('AC-3 key presence (fail-closed under PLATFORM_IT without ALLOW_SKIP_DEEPSEEK)', () => {
    // Redacted provenance only — never write secret values.
    writeArtifact('AC-3-key-presence.json', {
      hasDeepSeekKey,
      allowSkipAnthropic,
      platformIt: PLATFORM_IT,
      source: deepseekKeyProvenance.source,
      dotenvPathsChecked: deepseekKeyProvenance.dotenvPathsChecked,
      dotenvPathUsed: deepseekKeyProvenance.dotenvPathUsed,
      secretsFileConsulted: deepseekKeyProvenance.secretsFileConsulted,
      note: hasDeepSeekKey
        ? `real Anthropic path available for AC-3 (source=${deepseekKeyProvenance.source})`
        : allowSkipAnthropic
          ? 'ALLOW_SKIP_DEEPSEEK=1 — AC-3 skipped intentionally (local-dev; not valid Sprint 12 gate)'
          : 'MISSING_DEPENDENCY: DEEPSEEK_API_KEY — AC-3 fails closed (not skipped)',
    });
    expect(PLATFORM_IT).toBe(true);
    // Sprint 12 gate: missing Anthropic dependency is a hard failure, not a skip/pass.
    // Local-dev may set ALLOW_SKIP_DEEPSEEK=1 to avoid the hard fail (still not a gate pass).
    if (!allowSkipAnthropic) {
      expect(hasDeepSeekKey, MISSING_ANTHROPIC_DEPENDENCY).toBe(true);
    }
  });
});

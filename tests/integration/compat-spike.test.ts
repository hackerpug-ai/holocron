/**
 * Integration test for compat-1: Real-Bun compatibility spike harness
 *
 * Spawns the real `holo compat:spike` CLI under Bun against real Postgres + live fleet.
 * Gated by COMPAT_SPIKE=1 — skipped otherwise (like research-models.test.ts).
 *
 * Usage:
 *   COMPAT_SPIKE=1 pnpm vitest run tests/integration/compat-spike.test.ts
 */
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const SKIP = !process.env.COMPAT_SPIKE;
const itLive = SKIP ? it.skip : it;

const REPO_ROOT = resolve(__dirname, '..', '..');
const HOLE_CLI = resolve(REPO_ROOT, 'services/platform/src/cli/holo.ts');
const BUN_BIN = process.env.BUN_BIN ?? 'bun';
const DEFAULT_DB = process.env.DATABASE_URL ?? 'postgres://127.0.0.1:5432/postgres';

interface CellResult {
  status: 'green' | 'red';
  detail?: string;
}

interface SpikeJsonResult {
  ok: boolean;
  runtime: { bun: string };
  cells: Record<string, CellResult>;
  versions: Record<string, string>;
  otelSpans?: number;
  cloudRequests?: number;
  agentText?: string;
  workflowStatus?: string;
  mcpTools?: number;
  traceId?: string;
}

function runSpike(env: Record<string, string>): {
  stdout: string;
  stderr: string;
  exitCode: number;
} {
  try {
    const stdout = execFileSync(BUN_BIN, [HOLE_CLI, 'compat:spike', '--json'], {
      cwd: REPO_ROOT,
      env: { ...process.env, ...env },
      timeout: 120_000,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return { stdout, stderr: '', exitCode: 0 };
  } catch (e: unknown) {
    const err = e as { stdout?: string; stderr?: string; status?: number };
    return {
      stdout: err.stdout ?? '',
      stderr: err.stderr ?? '',
      exitCode: err.status ?? 1,
    };
  }
}

function parseSpikeJson(stdout: string): SpikeJsonResult {
  // The CLI prints JSON to stdout
  const lines = stdout.trim().split('\n');
  const jsonLine = lines.find((l) => l.trim().startsWith('{'));
  if (!jsonLine) throw new Error('No JSON line found in stdout');
  return JSON.parse(jsonLine);
}

describe('compat-1: green five-cell smoke matrix under Bun', () => {
  itLive(
    'TC-1: 5/5 cells green, exit 0, version table, runtime.bun present',
    () => {
      const { stdout, exitCode } = runSpike({ DATABASE_URL: DEFAULT_DB });
      expect(exitCode, `Expected exit 0 but got ${exitCode}. stdout:\n${stdout}`).toBe(0);

      const result = parseSpikeJson(stdout);

      // 5/5 cells green
      expect(result.cells.agent.status).toBe('green');
      expect(result.cells.tool.status).toBe('green');
      expect(result.cells.workflow.status).toBe('green');
      expect(result.cells.mcp.status).toBe('green');
      expect(result.cells.otel.status).toBe('green');

      // Runtime bun present
      expect(result.runtime.bun).toBeTruthy();
      expect(typeof result.runtime.bun).toBe('string');

      // Version table present (at least core)
      expect(result.versions['@mastra/core']).toBeTruthy();
      expect(result.versions['@mastra/pg']).toBeTruthy();
    },
    120_000
  );
});

describe('compat-1: AC-2 OTel span persisted to Postgres', () => {
  itLive(
    'TC-2: otelSpans >= 1 for the emitted traceId',
    () => {
      const { stdout, exitCode } = runSpike({ DATABASE_URL: DEFAULT_DB });
      expect(exitCode).toBe(0);

      const result = parseSpikeJson(stdout);
      expect(result.otelSpans).toBeDefined();
      expect(result.otelSpans ?? 0).toBeGreaterThanOrEqual(1);
      expect(result.traceId).toBeTruthy();
    },
    120_000
  );
});

describe('compat-1: AC-3 workflow success on Postgres + MCP round-trip', () => {
  itLive(
    'TC-3: workflow.status === success and mcp.tools >= 1',
    () => {
      const { stdout, exitCode } = runSpike({ DATABASE_URL: DEFAULT_DB });
      expect(exitCode).toBe(0);

      const result = parseSpikeJson(stdout);
      expect(result.workflowStatus).toBe('success');
      expect(result.mcpTools ?? 0).toBeGreaterThanOrEqual(1);
    },
    120_000
  );
});

describe('compat-1: AC-4 Postgres-down negative control', () => {
  itLive(
    'TC-4: dead DATABASE_URL ⇒ non-zero exit, storage cells red',
    () => {
      const { stdout, exitCode } = runSpike({
        DATABASE_URL: 'postgres://127.0.0.1:1/dead',
      });
      expect(exitCode).not.toBe(0);

      const result = parseSpikeJson(stdout);
      expect(result.cells.workflow.status).toBe('red');
      expect(result.cells.otel.status).toBe('red');
    },
    120_000
  );
});

describe('compat-1: AC-5 agent cell hits live fleet with zero cloud requests', () => {
  itLive(
    'TC-5: agent.text non-empty, cloudRequests === 0',
    () => {
      const { stdout, exitCode } = runSpike({ DATABASE_URL: DEFAULT_DB });
      expect(exitCode).toBe(0);

      const result = parseSpikeJson(stdout);
      expect(result.agentText).toBeTruthy();
      expect(result.agentText?.length).toBeGreaterThan(0);
      expect(result.cloudRequests).toBe(0);
    },
    120_000
  );
});

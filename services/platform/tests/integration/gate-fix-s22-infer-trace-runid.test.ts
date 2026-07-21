/**
 * GATE-FIX-S22 — `holo infer:trace <missionRunId>` must resolve against holocron_nonprod
 * even when ambient DATABASE_URL is unset (post-remediation gate fail 2026-07-21T22:12:30Z).
 *
 * Root cause: loadInferTrace defaulted preferHolocron→holocron while missions always write
 * nonprod. Public runId from mission run report must work without a substitute command.
 *
 * Run:
 *   PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/gate-fix-s22-infer-trace-runid.test.ts
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { ensureSystemMissionTemplates } from '../../src/mission/templates/ensure-system.ts';
import {
  DATABASE_URL,
  ensureRedTestEnvironment,
  PLATFORM_IT,
  REPO_ROOT,
  runHolo,
  truncateMissionTables,
  withSql,
} from './mission-red.helpers';
import { asRecord } from './pipes-4-red.helpers';

const EVIDENCE_DIR = resolve(REPO_ROOT, '.tmp/sprint-22');
const SPRINT_REL =
  '.spec/prds/mk6-migration/tasks/sprint-22-all-agentic-pipelines-as-templates-agents';
const HISTORIC_FAIL_STAMP = '2026-07-21T22:12:30Z';
const FLEET_TIMEOUT_MS = 300_000;
const MISSING_ID = '00000000-0000-4000-8000-0000000000aa';
/** Known fail from preserved QA archive (must still be resolvable after fix). */
const HISTORIC_RUN_ID = '019f86be-b88a-7210-be80-13cd2ffef199';

const itLive = PLATFORM_IT ? it : it.skip;

function ensureDirs(): void {
  mkdirSync(EVIDENCE_DIR, { recursive: true });
}

function writeArtifact(name: string, body: unknown): string {
  ensureDirs();
  const path = resolve(EVIDENCE_DIR, name);
  const text = typeof body === 'string' ? body : JSON.stringify(body, null, 2);
  writeFileSync(path, text.endsWith('\n') ? text : `${text}\n`, 'utf8');
  return path;
}

function parseJsonPayload(stdout: string, stderr: string): Record<string, unknown> {
  for (const text of [stdout, stderr]) {
    const trimmed = text.trim();
    if (!trimmed) continue;
    const lines = trimmed
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
    for (let i = lines.length - 1; i >= 0; i--) {
      const line = lines[i]!;
      if (line.startsWith('{') || line.startsWith('[')) {
        try {
          return asRecord(JSON.parse(line));
        } catch {
          // keep scanning
        }
      }
    }
    try {
      return asRecord(JSON.parse(trimmed));
    } catch {
      // try next stream
    }
  }
  return {};
}

/**
 * Historic QA fail archive may live only on the main checkout (untracked), not in a
 * worktree working tree. Prefer REPO_ROOT, then walk up for main holocron root.
 */
function resolveHistoricFailDir(): string | null {
  const candidates = [
    resolve(REPO_ROOT, SPRINT_REL, '.gate-evidence', HISTORIC_FAIL_STAMP),
    resolve(REPO_ROOT, '..', '..', SPRINT_REL, '.gate-evidence', HISTORIC_FAIL_STAMP),
    resolve(
      '/Users/inference1/Projects/holocron',
      SPRINT_REL,
      '.gate-evidence',
      HISTORIC_FAIL_STAMP
    ),
  ];
  for (const dir of candidates) {
    if (existsSync(resolve(dir, 'step7.log'))) return dir;
  }
  return null;
}

async function findCompletedBusinessReportWithFleetTelemetry(): Promise<string | null> {
  return withSql(async (sql) => {
    const rows = await sql<{ id: string }[]>`
      SELECT mr.id::text AS id
      FROM mission_runs mr
      WHERE mr.template_key = 'business-report'
        AND mr.status = 'completed'
        AND EXISTS (
          SELECT 1
          FROM inference_telemetry it
          WHERE it.run_id = mr.id::text
            AND it.provider = 'fleet'
        )
      ORDER BY mr.created_at DESC
      LIMIT 1
    `;
    return rows[0]?.id ?? null;
  });
}

async function ensureBusinessReportRunId(): Promise<string> {
  // Prefer the exact historic gate runId if still present with fleet telemetry.
  const historicOk = await withSql(async (sql) => {
    const rows = await sql<{ id: string }[]>`
      SELECT mr.id::text AS id
      FROM mission_runs mr
      WHERE mr.id = ${HISTORIC_RUN_ID}::uuid
        AND mr.status = 'completed'
        AND EXISTS (
          SELECT 1
          FROM inference_telemetry it
          WHERE it.run_id = mr.id::text
            AND it.provider = 'fleet'
        )
      LIMIT 1
    `;
    return rows[0]?.id ?? null;
  });
  if (historicOk) {
    writeArtifact('gate-fix-s22-reuse-historic.json', { runId: historicOk, reused: true });
    return historicOk;
  }

  const existing = await findCompletedBusinessReportWithFleetTelemetry();
  if (existing) {
    writeArtifact('gate-fix-s22-reuse-run.json', { runId: existing, reused: true });
    return existing;
  }

  const report = runHolo(
    'gate-fix-s22-mission-run-report',
    [
      'mission',
      'run',
      'report',
      '--kind',
      'competitive',
      '--target',
      'example.com',
      '--fresh',
      '--json',
    ],
    { timeoutMs: FLEET_TIMEOUT_MS }
  );
  writeArtifact('gate-fix-s22-mission-run-report-result.json', {
    status: report.status,
    stdout: report.stdout.slice(0, 12_000),
    stderr: report.stderr.slice(0, 4_000),
    parsed: report.parsed,
  });
  expect(report.status, `mission run report exit: ${report.stderr}`).toBe(0);
  const payload = asRecord(report.parsed);
  const runId = typeof payload.runId === 'string' ? payload.runId : null;
  expect(runId, 'mission run report must return runId').toBeTruthy();
  return runId!;
}

/** Unset DATABASE_URL — reproduces the public-gate ambient env (preferHolocron bug). */
const UNSET_DATABASE_URL = { DATABASE_URL: undefined as string | undefined };

describe.sequential('GATE-FIX-S22 — infer:trace accepts mission runId (nonprod default)', () => {
  async function ensureTemplatesResilient(): Promise<void> {
    try {
      await ensureSystemMissionTemplates({ databaseUrl: DATABASE_URL });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!message.includes('immutable mission template conflict')) throw error;
      await truncateMissionTables();
      await ensureSystemMissionTemplates({ databaseUrl: DATABASE_URL });
    }
  }

  beforeAll(async () => {
    ensureDirs();
    await ensureRedTestEnvironment();
    expect(PLATFORM_IT).toBe(true);
    expect(DATABASE_URL).toContain('/holocron_nonprod');
    await ensureTemplatesResilient();
  }, 120_000);

  itLive(
    'AC-1: Mission runId resolves without ambient DATABASE_URL',
    async () => {
      const runId = await ensureBusinessReportRunId();

      const result = runHolo(
        'gate-fix-s22-ac1-infer-trace-unset-db',
        ['infer:trace', runId, '--json'],
        {
          timeoutMs: 60_000,
          env: UNSET_DATABASE_URL,
        }
      );

      writeArtifact('gate-fix-s22-ac1.json', {
        status: result.status,
        stdout: result.stdout,
        stderr: result.stderr,
        parsed: result.parsed,
        runId,
        envNote: 'DATABASE_URL unset — must still hit holocron_nonprod',
      });

      expect(
        result.status,
        `infer:trace exit: status=${result.status} stderr=${result.stderr.slice(0, 500)} stdout=${result.stdout.slice(0, 500)}`
      ).toBe(0);

      const payload = parseJsonPayload(result.stdout, result.stderr);
      expect(payload.ok, `payload: ${JSON.stringify(payload).slice(0, 500)}`).toBe(true);
      expect(payload.runId).toBe(runId);
      expect(String(payload.runId).length).toBeGreaterThanOrEqual(36);

      const modelCalls = Array.isArray(payload.modelCalls)
        ? (payload.modelCalls as Record<string, unknown>[])
        : [];
      expect(modelCalls.length, 'modelCalls.length >= 1').toBeGreaterThanOrEqual(1);

      let fleetCount = 0;
      let anthropicCount = 0;
      for (const call of modelCalls) {
        expect(typeof call.provider).toBe('string');
        expect(String(call.provider).length).toBeGreaterThan(0);
        if (call.provider === 'fleet') fleetCount += 1;
        if (call.provider === 'anthropic') anthropicCount += 1;
      }
      expect(fleetCount, 'provider=fleet appears in modelCalls').toBeGreaterThanOrEqual(1);
      expect(anthropicCount, 'provider=anthropic must be zero').toBe(0);
      expect(String(payload.code ?? ''), 'must not be INFER_TRACE_NOT_FOUND').not.toBe(
        'INFER_TRACE_NOT_FOUND'
      );
    },
    FLEET_TIMEOUT_MS
  );

  itLive('AC-2: Fail-closed for unknown id still holds', async () => {
    const absent = await withSql(async (sql) => {
      const mission = await sql<{ count: string }[]>`
        SELECT count(*)::text AS count FROM mission_runs WHERE id = ${MISSING_ID}::uuid
      `;
      const tele = await sql<{ count: string }[]>`
        SELECT count(*)::text AS count FROM inference_telemetry WHERE run_id = ${MISSING_ID}
      `;
      return {
        mission: Number(mission[0]?.count ?? 0),
        telemetry: Number(tele[0]?.count ?? 0),
      };
    });
    expect(absent.mission).toBe(0);
    expect(absent.telemetry).toBe(0);

    const result = runHolo('gate-fix-s22-ac2-missing', ['infer:trace', MISSING_ID, '--json'], {
      timeoutMs: 30_000,
      env: UNSET_DATABASE_URL,
    });

    writeArtifact('gate-fix-s22-ac2.json', {
      status: result.status,
      stdout: result.stdout,
      stderr: result.stderr,
      parsed: result.parsed,
    });

    expect(result.status, 'exit non-zero').not.toBe(0);

    const payload = parseJsonPayload(result.stdout, result.stderr);
    expect(payload.ok).toBe(false);
    const code = String(payload.code ?? '');
    expect(
      ['INFER_TRACE_NOT_FOUND', 'MISSION_RUN_NOT_FOUND', 'TRACE_NOT_FOUND'].includes(code),
      `code=${code}`
    ).toBe(true);
    if (payload.ok === true) {
      throw new Error('soft-success forbidden for missing id');
    }
  });

  itLive(
    'AC-3: Documented public id remains mission runId (literal infer:trace)',
    async () => {
      const report = runHolo(
        'gate-fix-s22-ac3-fresh-report',
        [
          'mission',
          'run',
          'report',
          '--kind',
          'competitive',
          '--target',
          'example.com',
          '--fresh',
          '--json',
        ],
        { timeoutMs: FLEET_TIMEOUT_MS }
      );
      expect(report.status, `fresh report exit: ${report.stderr}`).toBe(0);
      const reportPayload = asRecord(report.parsed);
      const runId = typeof reportPayload.runId === 'string' ? reportPayload.runId : null;
      expect(runId, 'fresh report runId').toBeTruthy();

      const cmdArgs = ['infer:trace', runId!, '--json'];
      const cmdLine = `bun run services/platform/src/cli/holo.ts ${cmdArgs.join(' ')}`;
      const result = runHolo('gate-fix-s22-ac3-infer-trace', cmdArgs, {
        timeoutMs: 60_000,
        env: UNSET_DATABASE_URL,
      });

      writeArtifact('gate-fix-s22-ac3.json', {
        cmdLine,
        status: result.status,
        stdout: result.stdout,
        stderr: result.stderr,
        runId,
      });

      expect(result.status, `infer:trace after fresh report: ${result.stderr}`).toBe(0);
      const payload = parseJsonPayload(result.stdout, result.stderr);
      expect(payload.ok).toBe(true);
      expect(payload.runId).toBe(runId);

      const modelCalls = Array.isArray(payload.modelCalls)
        ? (payload.modelCalls as Record<string, unknown>[])
        : [];
      const fleetCount = modelCalls.filter((c) => c.provider === 'fleet').length;
      expect(fleetCount, 'provider fleet after fresh report').toBeGreaterThanOrEqual(1);

      // Evidence that the command was literally infer:trace (not a substitute).
      expect(cmdLine).toMatch(/infer:trace/);
      expect(cmdLine).not.toMatch(/mission run report/);
      expect(result.command.join(' ')).toMatch(/infer:trace/);
    },
    FLEET_TIMEOUT_MS
  );

  itLive('AC-4: Preserved QA fail evidence remains intact', () => {
    const dir = resolveHistoricFailDir();
    expect(dir, 'historic fail archive 2026-07-21T22:12:30Z must exist').toBeTruthy();
    const step7 = resolve(dir!, 'step7.log');
    expect(existsSync(step7), `step7.log at ${step7}`).toBe(true);
    const text = readFileSync(step7, 'utf8');
    expect(text).toMatch(/INFER_TRACE_NOT_FOUND/);
    expect(text).toMatch(/019f86be-b88a-7210-be80-13cd2ffef199/);
    expect(text).toMatch(/infer:trace/);
    writeArtifact('gate-fix-s22-ac4-historic.json', {
      dir,
      step7Bytes: text.length,
      preserved: true,
    });
  });
});

/**
 * REDHAT-FIX-3 / H-1 — `holo infer:trace <id>` dumps durable modelCalls for gate step 6.
 *
 * AC-1: business-report run → modelCalls with provider=fleet, zero anthropic
 * AC-2: unknown id fails closed (not ok:true empty modelCalls)
 * AC-3: help + dispatcher register infer:trace
 * AC-4: gate step 6 evidence CMD contains infer:trace
 *
 * Run:
 *   PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod \
 *   pnpm vitest run packages/platform/tests/integration/redhat-fix-3-infer-trace.test.ts
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
const GATE_EVIDENCE_DIR = resolve(
  REPO_ROOT,
  '.spec/prds/mk6-migration/tasks/sprint-22-all-agentic-pipelines-as-templates-agents/.gate-evidence'
);
const STEP6_LOG = resolve(GATE_EVIDENCE_DIR, 'step6.log');
const GATE_STEP6_JSON = resolve(EVIDENCE_DIR, 'redhat-fix-3-gate-step6.json');
const HOLO_SRC = resolve(REPO_ROOT, 'packages/platform/src/cli/holo.ts');
const MISSING_ID = '00000000-0000-4000-8000-000000000099';
const FLEET_TIMEOUT_MS = 300_000;

const itLive = PLATFORM_IT ? it : it.skip;

function ensureDirs(): void {
  mkdirSync(EVIDENCE_DIR, { recursive: true });
  mkdirSync(GATE_EVIDENCE_DIR, { recursive: true });
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
  const existing = await findCompletedBusinessReportWithFleetTelemetry();
  if (existing) {
    writeArtifact('redhat-fix-3-reuse-run.json', { runId: existing, reused: true });
    return existing;
  }

  // No durable fleet business-report yet — run one for real.
  const report = runHolo(
    'redhat-fix-3-mission-run-report',
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
  writeArtifact('redhat-fix-3-mission-run-report-result.json', {
    status: report.status,
    stdout: report.stdout.slice(0, 12_000),
    stderr: report.stderr.slice(0, 4_000),
    parsed: report.parsed,
  });
  expect(report.status, `mission run report exit: ${report.stderr}`).toBe(0);
  const payload = asRecord(report.parsed);
  const runId = typeof payload.runId === 'string' ? payload.runId : null;
  expect(runId, 'mission run report must return runId').toBeTruthy();
  expect(String(runId).length).toBeGreaterThanOrEqual(36);
  expect(payload.ok).toBe(true);

  // Confirm telemetry landed for the new run.
  const teleCount = await withSql(async (sql) => {
    const rows = await sql<{ count: string }[]>`
      SELECT count(*)::text AS count
      FROM inference_telemetry
      WHERE run_id = ${runId!}
        AND provider = 'fleet'
    `;
    return Number(rows[0]?.count ?? 0);
  });
  expect(teleCount, `fleet telemetry rows for new run ${runId}`).toBeGreaterThanOrEqual(1);
  return runId!;
}

describe.sequential('REDHAT-FIX-3 — holo infer:trace (H-1 / GATE-1)', () => {
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
    'AC-1: infer:trace dumps fleet modelCalls for a business report',
    async () => {
      const runId = await ensureBusinessReportRunId();

      const result = runHolo('redhat-fix-3-ac1-infer-trace', ['infer:trace', runId, '--json'], {
        timeoutMs: 60_000,
      });

      writeArtifact('redhat-fix-3-ac1-infer-trace.json', {
        status: result.status,
        stdout: result.stdout,
        stderr: result.stderr,
        parsed: result.parsed,
        runId,
      });

      expect(
        result.status,
        `infer:trace exit: status=${result.status} stderr=${result.stderr.slice(0, 500)} stdout=${result.stdout.slice(0, 500)}`
      ).toBe(0);

      const payload = parseJsonPayload(result.stdout, result.stderr);
      expect(payload.ok, `payload: ${JSON.stringify(payload).slice(0, 400)}`).toBe(true);
      expect(payload.runId).toBe(runId);
      expect(String(payload.runId).length).toBeGreaterThanOrEqual(36);

      const modelCalls = Array.isArray(payload.modelCalls)
        ? (payload.modelCalls as Record<string, unknown>[])
        : [];
      expect(modelCalls.length, 'modelCalls.length >= 1').toBeGreaterThanOrEqual(1);

      let fleetCount = 0;
      let deepseekCount = 0;
      for (const call of modelCalls) {
        expect(typeof call.provider, 'provider string').toBe('string');
        expect(String(call.provider).length, 'provider non-empty').toBeGreaterThan(0);
        expect(typeof call.endpoint, 'endpoint string').toBe('string');
        expect(String(call.endpoint).length, 'endpoint non-empty').toBeGreaterThan(0);
        if (call.provider === 'fleet') fleetCount += 1;
        if (call.provider === 'deepseek') deepseekCount += 1;
      }
      expect(fleetCount, 'fleet modelCalls >= 1').toBeGreaterThanOrEqual(1);
      expect(deepseekCount, 'anthropic modelCalls == 0').toBe(0);
    },
    FLEET_TIMEOUT_MS
  );

  itLive('AC-2: unknown id fails closed (not empty success)', async () => {
    // Confirm absence first.
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

    const result = runHolo('redhat-fix-3-ac2-missing', ['infer:trace', MISSING_ID, '--json'], {
      timeoutMs: 30_000,
    });

    writeArtifact('redhat-fix-3-ac2-missing.json', {
      status: result.status,
      stdout: result.stdout,
      stderr: result.stderr,
      parsed: result.parsed,
    });

    expect(result.status, 'exit non-zero').not.toBe(0);
    expect((result.status ?? 0) >= 1).toBe(true);

    const payload = parseJsonPayload(result.stdout, result.stderr);
    expect(payload.ok).toBe(false);
    const code = String(payload.code ?? '');
    expect(
      ['INFER_TRACE_NOT_FOUND', 'MISSION_RUN_NOT_FOUND', 'TRACE_NOT_FOUND'].includes(code),
      `code=${code}`
    ).toBe(true);

    // Must not soft-succeed with empty modelCalls.
    if (payload.ok === true) {
      throw new Error('soft-success forbidden for missing id');
    }
    const modelCalls = payload.modelCalls;
    if (Array.isArray(modelCalls) && modelCalls.length > 0 && payload.ok !== false) {
      throw new Error('fabricated modelCalls for missing id');
    }
  });

  itLive('AC-3: help + dispatcher register infer:trace', async () => {
    const source = readFileSync(HOLO_SRC, 'utf8');
    const matches = source.match(/infer:trace/g) ?? [];
    writeArtifact('redhat-fix-3-ac3-rg.json', {
      matchCount: matches.length,
      hasCase: /case\s+['"]infer:trace['"]/.test(source),
    });
    expect(matches.length, 'rg infer:trace in holo.ts >= 2').toBeGreaterThanOrEqual(2);
    expect(/case\s+['"]infer:trace['"]/.test(source), 'dispatcher case infer:trace').toBe(true);

    const help = runHolo('redhat-fix-3-ac3-help', ['--help'], { timeoutMs: 15_000 });
    writeArtifact('redhat-fix-3-ac3-help.txt', {
      status: help.status,
      stdout: help.stdout,
      stderr: help.stderr,
    });
    const helpText = `${help.stdout}\n${help.stderr}`;
    expect(helpText, 'help lists infer:trace').toMatch(/infer:trace/);
  });

  itLive(
    'AC-4: gate step 6 executed as documented (infer:trace, not mission run report)',
    async () => {
      const runId = await ensureBusinessReportRunId();

      const cmdArgs = ['infer:trace', runId, '--json'];
      const cmdLine = `bun run packages/platform/src/cli/holo.ts ${cmdArgs.join(' ')}`;
      const result = runHolo('redhat-fix-3-ac4-infer-trace', cmdArgs, {
        timeoutMs: 60_000,
      });

      expect(result.status, `infer:trace step6 exit: ${result.stderr}`).toBe(0);
      const payload = parseJsonPayload(result.stdout, result.stderr);
      expect(payload.ok).toBe(true);

      const modelCalls = Array.isArray(payload.modelCalls)
        ? (payload.modelCalls as Record<string, unknown>[])
        : [];
      const fleetModelCalls = modelCalls.filter((c) => c.provider === 'fleet').length;
      const deepseekModelCalls = modelCalls.filter((c) => c.provider === 'deepseek').length;
      expect(fleetModelCalls).toBeGreaterThanOrEqual(1);
      expect(deepseekModelCalls).toBe(0);

      const stamp = new Date().toISOString().slice(11, 19);
      const step6Body = [
        `=== STEP 6 @ ${stamp} ===`,
        `CMD: ${cmdLine}`,
        result.stdout.trim(),
        '',
      ].join('\n');
      writeFileSync(STEP6_LOG, step6Body.endsWith('\n') ? step6Body : `${step6Body}\n`, 'utf8');

      const summary = {
        command: 'infer:trace',
        runId,
        fleetModelCalls,
        deepseekModelCalls,
      };
      writeFileSync(GATE_STEP6_JSON, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
      writeArtifact('redhat-fix-3-ac4-gate.json', summary);

      // Assert evidence files as documented.
      expect(existsSync(STEP6_LOG)).toBe(true);
      const step6Text = readFileSync(STEP6_LOG, 'utf8');
      expect(step6Text, 'CMD contains infer:trace').toMatch(/infer:trace/);
      expect(step6Text, 'must not use mission run report as step-6 oracle').not.toMatch(
        /CMD:.*mission run report/
      );
      expect(
        step6Text.includes('"provider": "fleet"') ||
          step6Text.includes('"provider":"fleet"') ||
          step6Text.includes('provider=fleet'),
        'step6 body has fleet provider evidence'
      ).toBe(true);

      const gateJson = asRecord(JSON.parse(readFileSync(GATE_STEP6_JSON, 'utf8')));
      expect(gateJson.command).toBe('infer:trace');
      expect(Number(gateJson.fleetModelCalls)).toBeGreaterThanOrEqual(1);
      expect(Number(gateJson.deepseekModelCalls)).toBe(0);
      expect(String(gateJson.runId)).toBe(runId);
    },
    FLEET_TIMEOUT_MS
  );
});

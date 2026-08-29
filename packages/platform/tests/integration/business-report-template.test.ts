/**
 * pipes-2 GREEN — parameterized business-report template (4 kinds).
 *
 * Real Postgres + fleet. No mocks of @mastra/* or model providers.
 * Evidence under .tmp/pipes-2/.
 *
 * ACs:
 *  - AC-1 revenue-validation output shape (DVF, TAM/SAM/SOM, competitive, unit econ)
 *  - AC-2 competitive kind, same template_key
 *  - AC-3 fleet telemetry (provider=fleet, no anthropic)
 *  - AC-4 missing components fail before reasoning
 *  - TC-1 one template row with kind enum in parameterSchema
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { listInferenceTelemetry } from '../../src/inference/telemetry.ts';
import { registerMissionTemplateFile } from '../../src/mission/repository.ts';
import { MissionRuntimeError, runMissionTemplate } from '../../src/mission/runtime.ts';
import { ensureRedTestEnvironment, truncateMissionTables } from './mission-red.helpers';
import {
  BUSINESS_REPORT_KIND_KEYS,
  countTemplatesByKeys,
  DATABASE_URL,
  PLATFORM_IT,
  REPO_ROOT,
  runHolo,
  runPsql,
  withSql,
} from './pipes-4-red.helpers';

const EVIDENCE_DIR = resolve(REPO_ROOT, '.tmp/pipes-2');
const RAW_DIR = resolve(EVIDENCE_DIR, 'raw');
const TEMPLATE = resolve(
  REPO_ROOT,
  'packages/platform/tests/fixtures/mission-engine/template-business-report.json'
);

const itLive = PLATFORM_IT ? it : it.skip;

function writeEvidence(name: string, body: unknown): void {
  mkdirSync(EVIDENCE_DIR, { recursive: true });
  mkdirSync(RAW_DIR, { recursive: true });
  const text = typeof body === 'string' ? body : JSON.stringify(body, null, 2);
  writeFileSync(resolve(EVIDENCE_DIR, name), text.endsWith('\n') ? text : `${text}\n`, 'utf8');
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

async function resetBusinessReportState(): Promise<void> {
  // Prefer scoped cleanup so concurrent suites (e.g. pipes-1 evidence-research)
  // are not wiped mid-run — full TRUNCATE of mission_runs races fleet-long steps.
  await withSql(async (sql) => {
    await sql`
      DELETE FROM mission_stage_runs
      WHERE run_id IN (SELECT id FROM mission_runs WHERE template_key = 'business-report')
    `;
    await sql`
      DELETE FROM mission_events
      WHERE run_id IN (SELECT id FROM mission_runs WHERE template_key = 'business-report')
    `;
    await sql`
      DELETE FROM mission_checkpoints
      WHERE run_id IN (SELECT id FROM mission_runs WHERE template_key = 'business-report')
    `;
    await sql`
      DELETE FROM mission_commits
      WHERE run_id IN (SELECT id FROM mission_runs WHERE template_key = 'business-report')
    `;
    await sql`DELETE FROM mission_runs WHERE template_key = 'business-report'`;
  });
}

describe.sequential('pipes-2 GREEN — business-report parameterized template', () => {
  beforeAll(async () => {
    mkdirSync(EVIDENCE_DIR, { recursive: true });
    mkdirSync(RAW_DIR, { recursive: true });
    await ensureRedTestEnvironment();
    expect(PLATFORM_IT).toBe(true);
    expect(DATABASE_URL).toContain('/holocron_nonprod');
    // One-time full reset then register the single parameterized template.
    await truncateMissionTables();
    await registerMissionTemplateFile(TEMPLATE);
  }, 120_000);

  beforeEach(async () => {
    await resetBusinessReportState();
    // Re-register in case a concurrent suite wiped mission_templates.
    await registerMissionTemplateFile(TEMPLATE);
  }, 60_000);

  afterAll(() => {
    // evidence files retained under .tmp/pipes-2 for harvest
  });

  itLive(
    'TC-1 / AC collapse: exactly 1 business-report template covers kind enum (not 4 rows)',
    async () => {
      const businessCount = await countTemplatesByKeys(['business-report']);
      const separateCount = await countTemplatesByKeys([...BUSINESS_REPORT_KIND_KEYS]);
      writeEvidence('TC-1-template-counts.json', {
        businessCount,
        separateCount,
        kinds: BUSINESS_REPORT_KIND_KEYS,
      });

      expect(businessCount).toBe(1);
      expect(separateCount).toBe(0);

      const psql = runPsql(
        `SELECT template_key, definition_json->'parameterSchema'->'kind'->'values' AS kind_values
         FROM mission_template_versions
         WHERE template_key = 'business-report'
         ORDER BY created_at DESC LIMIT 1`
      );
      writeEvidence('TC-1-parameter-schema.txt', {
        status: psql.status,
        stdout: psql.stdout,
        stderr: psql.stderr,
      });
      expect(psql.status).toBe(0);
      expect(psql.stdout).toMatch(/revenue-validation/);
      expect(psql.stdout).toMatch(/competitive/);
      expect(psql.stdout).toMatch(/ai-roi/);
      expect(psql.stdout).toMatch(/flights/);
    },
    60_000
  );

  itLive(
    'AC-1: revenue-validation produces DVF + market sizing + competitive + unit economics',
    async () => {
      const result = await runMissionTemplate({
        templateKey: 'business-report',
        goal: 'Revenue validation for acme-corp.com',
        idempotencyKey: `pipes2-rv-${Date.now()}`,
        reportKind: 'revenue-validation',
        target: 'acme-corp.com',
      });
      writeEvidence('AC-1-run.json', result);

      expect(result.status).toBe('completed');
      expect(result.ok).toBe(true);
      expect(result.templateKey).toBe('business-report');

      const output = asRecord(result.output);
      expect(output.reportKind).toBe('revenue-validation');
      expect(output.templateKey).toBe('business-report');
      expect(typeof output.dvfScore).toBe('number');
      expect(Number(output.dvfScore)).toBeGreaterThanOrEqual(0);

      const marketSizing = asRecord(output.marketSizing);
      expect(Number(marketSizing.tam)).toBeGreaterThan(0);
      expect(Number(marketSizing.sam)).toBeGreaterThan(0);
      expect(Number(marketSizing.som)).toBeGreaterThan(0);

      const competitive = output.competitivePositioning;
      expect(Array.isArray(competitive)).toBe(true);
      expect((competitive as unknown[]).length).toBeGreaterThanOrEqual(1);

      expect(output.unitEconomics).toBeTruthy();
      expect(output.reasoningProvider).toBe('fleet');

      // Fail-closed: never accept the fabricated soft-stub ASSAY/CHALLENGE templates.
      const assayText = String(output.assayText ?? '');
      const challengeText = String(output.challengeText ?? '');
      expect(assayText.length).toBeGreaterThan(0);
      expect(challengeText.length).toBeGreaterThan(0);
      expect(assayText).not.toMatch(/^ASSAY completed for /);
      expect(challengeText).not.toMatch(/^CHALLENGE completed for /);
      // Market sizing notes must be honest scaffolding labels, not false "public signals".
      const marketNotes = String(marketSizing.notes ?? '');
      expect(marketNotes).toMatch(/scaffolding|deterministic/i);
      expect(marketNotes).not.toMatch(/public market signals/i);

      const psql = runPsql(
        `SELECT template_key,
                typed_output_json->>'reportKind' AS kind,
                typed_output_json->>'dvfScore' AS dvf,
                typed_output_json->'marketSizing'->>'tam' AS tam
         FROM mission_runs
         WHERE template_key = 'business-report'
         ORDER BY created_at DESC LIMIT 1`
      );
      writeEvidence('AC-1-psql.txt', { status: psql.status, stdout: psql.stdout });
      expect(psql.status).toBe(0);
      expect(psql.stdout).toMatch(/revenue-validation/);
      expect(psql.stdout).toMatch(/business-report/);
    },
    300_000
  );

  itLive(
    'AC-2: competitive kind uses same template_key with competitorMatrix',
    async () => {
      const result = await runMissionTemplate({
        templateKey: 'business-report',
        goal: 'Competitive analysis for startup.io',
        idempotencyKey: `pipes2-comp-${Date.now()}`,
        reportKind: 'competitive',
        target: 'startup.io',
      });
      writeEvidence('AC-2-run.json', result);

      expect(result.status).toBe('completed');
      expect(result.templateKey).toBe('business-report');
      const output = asRecord(result.output);
      expect(output.reportKind).toBe('competitive');
      expect(output.templateKey).toBe('business-report');
      const matrix = output.competitorMatrix;
      expect(Array.isArray(matrix)).toBe(true);
      expect((matrix as unknown[]).length).toBeGreaterThanOrEqual(1);

      const distinct = await withSql(async (sql) => {
        const rows = await sql<{ n: string }[]>`
          SELECT COUNT(DISTINCT template_key)::text AS n
          FROM mission_runs
          WHERE template_key = 'business-report'
            AND typed_output_json->>'reportKind' IN ('revenue-validation', 'competitive', 'ai-roi', 'flights')
        `;
        return Number(rows[0]?.n ?? 0);
      });
      writeEvidence('AC-2-distinct-template.json', { distinct });
      expect(distinct).toBe(1);
    },
    300_000
  );

  itLive(
    'AC-3: ai-roi reasoning records fleet telemetry (no anthropic)',
    async () => {
      const result = await runMissionTemplate({
        templateKey: 'business-report',
        goal: 'AI ROI for tool.com',
        idempotencyKey: `pipes2-airoi-${Date.now()}`,
        reportKind: 'ai-roi',
        target: 'tool.com',
      });
      writeEvidence('AC-3-run.json', result);
      expect(result.status).toBe('completed');
      expect(result.runId).toBeTruthy();

      const rows = await listInferenceTelemetry({
        runId: result.runId ?? undefined,
        limit: 50,
      });
      writeEvidence('AC-3-telemetry.json', {
        runId: result.runId,
        count: rows.length,
        rows: rows.map((r) => ({
          provider: r.provider,
          role: r.role,
          modelId: r.modelId,
          status: r.status,
        })),
      });

      const fleet = rows.filter((r) => r.provider === 'fleet');
      const escapeRows = rows.filter((r) => r.provider === 'deepseek');
      expect(fleet.length).toBeGreaterThanOrEqual(1);
      expect(escapeRows.length).toBe(0);

      const output = asRecord(result.output);
      expect(output.reportKind).toBe('ai-roi');
      expect(output.reasoningProvider).toBe('fleet');
      expect(Array.isArray(output.opportunities)).toBe(true);
    },
    300_000
  );

  itLive(
    'AC-3b / AC-2b: flights kind from same template',
    async () => {
      const result = await runMissionTemplate({
        templateKey: 'business-report',
        goal: 'Flights SFO-JFK',
        idempotencyKey: `pipes2-flights-${Date.now()}`,
        reportKind: 'flights',
        target: 'SFO-JFK',
        destination: 'SFO-JFK',
      });
      writeEvidence('AC-flights-run.json', result);
      expect(result.status).toBe('completed');
      const output = asRecord(result.output);
      expect(output.reportKind).toBe('flights');
      expect(output.templateKey).toBe('business-report');
      expect(output.route).toBeTruthy();
      expect(Array.isArray(output.priceCalendar)).toBe(true);
      expect((output.priceCalendar as unknown[]).length).toBeGreaterThanOrEqual(1);
    },
    300_000
  );

  itLive(
    'AC-4: incomplete target fails at component_validation before reasoning',
    async () => {
      let caught: MissionRuntimeError | null = null;
      try {
        await runMissionTemplate({
          templateKey: 'business-report',
          goal: 'Revenue validation for incomplete.com',
          idempotencyKey: `pipes2-incomplete-${Date.now()}`,
          reportKind: 'revenue-validation',
          target: 'incomplete.com',
          forceMissingComponents: ['market_sizing'],
        });
      } catch (error) {
        if (error instanceof MissionRuntimeError) {
          caught = error;
        } else {
          throw error;
        }
      }
      expect(caught).toBeTruthy();
      expect(caught?.code).toBe('MISSION_BUSINESS_COMPONENT_VALIDATION_FAILED');
      const payload = JSON.parse(caught?.message ?? '{}') as {
        stage?: string;
        missingComponents?: string[];
      };
      writeEvidence('AC-4-error.json', { code: caught?.code, payload });
      expect(payload.stage).toBe('component_validation');
      expect(payload.missingComponents ?? []).toContain('market_sizing');

      const row = await withSql(async (sql) => {
        const rows = await sql<
          {
            status: string;
            error_code: string | null;
            error_message: string | null;
          }[]
        >`
          SELECT status, error_code, error_message
          FROM mission_runs
          WHERE template_key = 'business-report'
            AND status = 'failed'
          ORDER BY created_at DESC
          LIMIT 1
        `;
        return rows[0] ?? null;
      });
      writeEvidence('AC-4-db-row.json', row);
      expect(row?.status).toBe('failed');
      expect(row?.error_message ?? '').toMatch(/market_sizing/);
      expect(row?.error_message ?? '').toMatch(/component_validation/);

      // No fleet assay stage should have committed for this failed run.
      const assayCommitted = await withSql(async (sql) => {
        const rows = await sql<{ n: string }[]>`
          SELECT count(*)::text AS n
          FROM mission_stage_runs s
          JOIN mission_runs r ON r.id = s.run_id
          WHERE r.template_key = 'business-report'
            AND r.status = 'failed'
            AND s.stage_key = 'assay'
            AND s.status = 'committed'
        `;
        return Number(rows[0]?.n ?? 0);
      });
      expect(assayCommitted).toBe(0);
    },
    180_000
  );

  itLive(
    'CLI: holo mission run report --kind revenue-validation --target acme-corp.com',
    async () => {
      const reg = runHolo('pipes2-cli-register', [
        'mission',
        'template:register',
        TEMPLATE,
        '--json',
      ]);
      writeEvidence('CLI-register.json', {
        status: reg.status,
        stdout: reg.stdout,
        stderr: reg.stderr,
      });
      expect(reg.status).toBe(0);

      // Fleet-backed report missions often exceed the default 90s spawnSync
      // timeout under residual-phase load; align with the it() budget.
      const run = runHolo(
        'pipes2-cli-report-rv',
        [
          'mission',
          'run',
          'report',
          '--kind',
          'revenue-validation',
          '--target',
          'acme-cli.example.com',
          '--json',
        ],
        { timeoutMs: 280_000 }
      );
      writeEvidence('CLI-run-report.json', {
        status: run.status,
        stdout: run.stdout,
        stderr: run.stderr,
        parsed: run.parsed,
      });
      // Hard require success — no soft-accept on non-zero exit or empty output.
      expect(run.status).toBe(0);
      const parsed = asRecord(run.parsed);
      expect(parsed.status).toBe('completed');
      const cliOutput = asRecord(parsed.output);
      expect(cliOutput.reportKind).toBe('revenue-validation');
      expect(String(cliOutput.assayText ?? '')).not.toMatch(/^ASSAY completed for /);
      expect(String(cliOutput.challengeText ?? '')).not.toMatch(/^CHALLENGE completed for /);
    },
    300_000
  );
});

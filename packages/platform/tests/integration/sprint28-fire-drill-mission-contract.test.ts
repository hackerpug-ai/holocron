/**
 * REDHAT-FIX-C4 / Sprint 28 — fire-drill-monthly mission contract vs live schema/DSL.
 *
 * Proves (against real Postgres when PLATFORM_IT=1):
 *   AC-1  template registers with template_key='fire-drill-monthly', trigger.kind='on-demand',
 *         NO schedule field in definition_json (monthly cadence is launchd, not mission DSL)
 *   AC-2  successful-path typed_output shape uses typed_output_json (reportPath / parity pointer),
 *         not an invented output_artifacts column; statuses are lowercase
 *   AC-3  parity failure → status='failed' + error_message ILIKE '%PARITY%' + typed_output_json
 *         still points at parity-report.json
 *   AC-4  holocron-fire-drill-monthly.plist exists with monthly StartCalendarInterval
 *
 * Never asserts mission_key / output_artifacts / failure_reason columns or SUCCESS/FAILED.
 */
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createSql, type Sql } from '../../src/db/client.ts';
import {
  type MissionTemplateDefinition,
  parseMissionTemplateDefinition,
} from '../../src/mission/contract.ts';
import {
  fireDrillMonthlyTemplatePath,
  registerFireDrillMonthlyTemplate,
} from '../../src/mission/index.ts';
import { registerMissionTemplateDefinition } from '../../src/mission/repository.ts';
import { runMissionTemplate } from '../../src/mission/runtime.ts';
import { ensureSystemMissionTemplates } from '../../src/mission/templates/ensure-system.ts';
import {
  FIRE_DRILL_MONTHLY_TEMPLATE_KEY,
  FIRE_DRILL_MONTHLY_TEMPLATE_VERSION,
  fireDrillMonthlyTemplateDefinition,
} from '../../src/mission/templates/fire-drill-monthly.ts';
import {
  DATABASE_URL,
  ensureRedTestEnvironment,
  PLATFORM_IT,
  REPO_ROOT,
  truncateMissionTables,
} from './mission-red.helpers.ts';

const itLive = PLATFORM_IT ? it : it.skip;

const EVIDENCE_DIR = resolve(REPO_ROOT, '.tmp/REDHAT-FIX-C4');
const RAW_DIR = resolve(EVIDENCE_DIR, 'raw');
const RUN_SCRATCH = resolve(EVIDENCE_DIR, 'scratch-pgdata');
const RUN_BLOB_SOURCE = resolve(EVIDENCE_DIR, 'blob-source');
const RUN_BLOB_DIR_SAME = RUN_BLOB_SOURCE; // equal → fire-drill refuse path (PARITY false)
const RUN_REPORT = resolve(EVIDENCE_DIR, 'parity-report.json');
const PLIST_PATH = resolve(
  REPO_ROOT,
  'packages/platform/deploy/launchd/holocron-fire-drill-monthly.plist'
);
const TEMPLATE_JSON = resolve(
  REPO_ROOT,
  'packages/platform/src/mission/templates/fire-drill-monthly.json'
);

const ALLOWED_STATUSES = new Set([
  'pending',
  'running',
  'completed',
  'failed',
  'blocked',
  'budget_exceeded',
]);

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

function parityPointerFromTypedOutput(typed: unknown): string | null {
  const rec = asRecord(typed);
  if (typeof rec.reportPath === 'string' && rec.reportPath.length > 0) {
    return rec.reportPath;
  }
  if (typeof rec.parity_report_path === 'string' && rec.parity_report_path.length > 0) {
    return rec.parity_report_path;
  }
  const nested = asRecord(rec.output_artifacts);
  const fromNested = nested['parity-report.json'];
  if (typeof fromNested === 'string' && fromNested.length > 0) {
    return fromNested;
  }
  return null;
}

async function wipeFireDrillMissionState(sql: Sql): Promise<void> {
  await sql`
    DELETE FROM mission_stage_runs
    WHERE run_id IN (SELECT id FROM mission_runs WHERE template_key = ${FIRE_DRILL_MONTHLY_TEMPLATE_KEY})
  `;
  await sql`
    DELETE FROM mission_events
    WHERE run_id IN (SELECT id FROM mission_runs WHERE template_key = ${FIRE_DRILL_MONTHLY_TEMPLATE_KEY})
  `;
  await sql`
    DELETE FROM mission_checkpoints
    WHERE run_id IN (SELECT id FROM mission_runs WHERE template_key = ${FIRE_DRILL_MONTHLY_TEMPLATE_KEY})
  `;
  await sql`
    DELETE FROM mission_commits
    WHERE run_id IN (SELECT id FROM mission_runs WHERE template_key = ${FIRE_DRILL_MONTHLY_TEMPLATE_KEY})
  `;
  await sql`DELETE FROM mission_runs WHERE template_key = ${FIRE_DRILL_MONTHLY_TEMPLATE_KEY}`;
  await sql`
    DELETE FROM mission_template_versions WHERE template_key = ${FIRE_DRILL_MONTHLY_TEMPLATE_KEY}
  `;
  await sql`DELETE FROM mission_templates WHERE template_key = ${FIRE_DRILL_MONTHLY_TEMPLATE_KEY}`;
}

/**
 * runMissionTemplate always calls ensureSystemMissionTemplates first.
 * Concurrent worktrees may have registered system templates with a different
 * absolute fleet_manifest_path — wipe + re-seed on immutable drift (same pattern
 * as redhat-fix-2 / redhat-fix-4).
 */
async function ensureSystemTemplatesResilient(): Promise<void> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      await ensureSystemMissionTemplates({ databaseUrl: DATABASE_URL });
      return;
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : String(error);
      if (!/immutable mission template conflict|fleet_manifest_path/.test(message)) {
        throw error;
      }
      await truncateMissionTables();
      await new Promise((r) => setTimeout(r, 100 + attempt * 150));
    }
  }
  if (lastError) throw lastError;
}

async function registerFireDrillResilient(): Promise<void> {
  await ensureSystemTemplatesResilient();
  await registerMissionTemplateDefinition(fireDrillMonthlyTemplateDefinition, {
    databaseUrl: DATABASE_URL,
  });
}

describe.sequential('REDHAT-FIX-C4 — fire-drill-monthly mission contract (live schema/DSL)', () => {
  let sql: Sql | undefined;

  beforeAll(async () => {
    mkdirSync(EVIDENCE_DIR, { recursive: true });
    mkdirSync(RAW_DIR, { recursive: true });
    if (!PLATFORM_IT) return;
    await ensureRedTestEnvironment();
    expect(DATABASE_URL).toContain('/holocron_nonprod');
    sql = createSql(DATABASE_URL);
    await wipeFireDrillMissionState(sql);
  }, 120_000);

  beforeEach(async () => {
    if (!PLATFORM_IT || !sql) return;
    await wipeFireDrillMissionState(sql);
    rmSync(RUN_SCRATCH, { recursive: true, force: true });
    rmSync(RUN_BLOB_SOURCE, { recursive: true, force: true });
    mkdirSync(RUN_SCRATCH, { recursive: true });
    mkdirSync(RUN_BLOB_SOURCE, { recursive: true });
    // Minimal marker so source path exists; equal blobDir triggers refuse-path PARITY fail.
    writeFileSync(resolve(RUN_BLOB_SOURCE, '.keep'), 'keep\n', 'utf8');
  }, 60_000);

  afterAll(async () => {
    if (!sql) return;
    try {
      await wipeFireDrillMissionState(sql);
    } finally {
      await sql.end({ timeout: 5 });
    }
  });

  it('template TS + JSON validate MissionTemplateSchema (on-demand, no schedule)', () => {
    const fromTs = parseMissionTemplateDefinition(fireDrillMonthlyTemplateDefinition);
    expect(fromTs.templateKey).toBe('fire-drill-monthly');
    expect(fromTs.version).toBe(FIRE_DRILL_MONTHLY_TEMPLATE_VERSION);
    expect(fromTs.trigger).toEqual({ kind: 'on-demand' });
    expect('schedule' in fromTs).toBe(false);
    expect(fromTs.stageGraph.length).toBeGreaterThanOrEqual(1);
    expect(fromTs.stageGraph[0]?.executorRef).toBe('builtin.fire-drill-execute@1');

    const rawJson = JSON.parse(readFileSync(TEMPLATE_JSON, 'utf8')) as unknown;
    const fromJson = parseMissionTemplateDefinition(rawJson);
    expect(fromJson.templateKey).toBe(fromTs.templateKey);
    expect(fromJson.version).toBe(fromTs.version);
    expect(fromJson.trigger.kind).toBe('on-demand');
    expect('schedule' in fromJson).toBe(false);
    // .strict() rejects undeclared schedule-like fields when present as unknown keys
    // (schedule is optional on schema today; template must still omit it).
    const jsonRec = asRecord(rawJson);
    expect(jsonRec.schedule).toBeUndefined();
    expect(jsonRec.mission_key).toBeUndefined();

    writeEvidence('template-parse.json', {
      templateKey: fromTs.templateKey,
      version: fromTs.version,
      trigger: fromTs.trigger,
      hasSchedule: 'schedule' in fromTs,
      stageGraphLen: fromTs.stageGraph.length,
    });
  });

  it('external monthly launchd plist present (cadence outside mission DSL)', () => {
    expect(existsSync(PLIST_PATH)).toBe(true);
    const body = readFileSync(PLIST_PATH, 'utf8');
    expect(body).toMatch(/StartCalendarInterval/);
    expect(body).toMatch(/<key>Day<\/key>\s*<integer>1<\/integer>/);
    expect(body).toMatch(/fire-drill-monthly/);
    expect(body).toMatch(/mission/);
    // Must not be a sub-monthly StartInterval key for this disruptive drill
    // (comment text may mention StartInterval; the launchd key must not).
    expect(body).not.toMatch(/<key>StartInterval<\/key>/);
    writeEvidence('plist-snippet.txt', body.slice(0, 800));
  });

  itLive(
    'registers fire-drill-monthly with template_key; definition_json has no schedule',
    async () => {
      if (!sql) throw new Error('sql missing');

      await ensureSystemTemplatesResilient();

      // Prefer the TS definition path (same contract as JSON file registration).
      const registered = await registerMissionTemplateDefinition(
        fireDrillMonthlyTemplateDefinition,
        { databaseUrl: DATABASE_URL }
      );
      expect(registered.templateKey).toBe(FIRE_DRILL_MONTHLY_TEMPLATE_KEY);
      expect(registered.version).toBe(FIRE_DRILL_MONTHLY_TEMPLATE_VERSION);

      // Also exercise file registration helper used by CLI / index.ts.
      // Content must match (immutable surface) — re-register is idempotent.
      const viaFile = await registerFireDrillMonthlyTemplate({ databaseUrl: DATABASE_URL });
      expect(viaFile.templateKey).toBe('fire-drill-monthly');
      expect(fireDrillMonthlyTemplatePath()).toMatch(/fire-drill-monthly\.json$/);

      const rows = await sql`
        SELECT template_key, latest_version, description
        FROM mission_templates
        WHERE template_key = ${FIRE_DRILL_MONTHLY_TEMPLATE_KEY}
      `;
      expect(rows).toHaveLength(1);
      expect(rows[0]?.template_key).toBe('fire-drill-monthly');
      expect(String(rows[0]?.latest_version ?? '')).toBe(FIRE_DRILL_MONTHLY_TEMPLATE_VERSION);

      const versions = await sql`
        SELECT
          template_key,
          version,
          definition_json,
          definition_json ? 'schedule' AS has_schedule,
          definition_json->'trigger'->>'kind' AS trigger_kind,
          jsonb_array_length(COALESCE(definition_json->'steps', '[]'::jsonb)) AS step_count
        FROM mission_template_versions
        WHERE template_key = ${FIRE_DRILL_MONTHLY_TEMPLATE_KEY}
          AND version = ${FIRE_DRILL_MONTHLY_TEMPLATE_VERSION}
      `;
      expect(versions).toHaveLength(1);
      expect(versions[0]?.trigger_kind).toBe('on-demand');
      expect(versions[0]?.has_schedule).toBe(false);
      expect(Number(versions[0]?.step_count ?? 0)).toBeGreaterThanOrEqual(1);

      const def = asRecord(versions[0]?.definition_json);
      expect(def.schedule).toBeUndefined();
      expect(def.templateKey ?? def.template_key).toBeTruthy();

      writeEvidence('register-db.json', {
        templates: rows,
        versions: versions.map((v) => ({
          template_key: v.template_key,
          version: v.version,
          has_schedule: v.has_schedule,
          trigger_kind: v.trigger_kind,
          step_count: v.step_count,
        })),
      });
    },
    120_000
  );

  itLive(
    'parity failure → status=failed + error_message contains PARITY + typed_output_json parity pointer',
    async () => {
      if (!sql) throw new Error('sql missing');

      await registerFireDrillResilient();

      // Induce fail-closed parity: blobDir === sourceBlobRoot → fire-drill refuses and
      // writes parity-report.json with all PARITY_PASS=false (live columns only).
      const idempotencyKey = `redhat-fix-c4-parity-fail-${Date.now()}`;
      const result = await runMissionTemplate(
        {
          templateKey: FIRE_DRILL_MONTHLY_TEMPLATE_KEY,
          goal: 'REDHAT-FIX-C4 parity-fail contract probe',
          idempotencyKey,
          targetTimestamp: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
          scratch: RUN_SCRATCH,
          blobDir: RUN_BLOB_DIR_SAME,
          sourceBlobRoot: RUN_BLOB_SOURCE,
          reportPath: RUN_REPORT,
        },
        { databaseUrl: DATABASE_URL }
      );

      writeEvidence('parity-fail-result.json', result);

      expect(result.templateKey).toBe('fire-drill-monthly');
      expect(result.status).toBe('failed');
      expect(ALLOWED_STATUSES.has(String(result.status))).toBe(true);
      // Never uppercase terminal statuses
      expect(String(result.status)).toMatch(/^[a-z_]+$/);

      const err = String(result.error ?? result.errorCode ?? '');
      // error_message path surfaces as payload.error; must mention PARITY
      expect(err.toUpperCase()).toMatch(/PARITY/);

      const rows = await sql`
        SELECT
          id,
          template_key,
          status,
          error_code,
          error_message,
          typed_output_json,
          completed_at
        FROM mission_runs
        WHERE template_key = ${FIRE_DRILL_MONTHLY_TEMPLATE_KEY}
          AND idempotency_key = ${idempotencyKey}
        ORDER BY created_at DESC
        LIMIT 1
      `;
      expect(rows).toHaveLength(1);
      const row = rows[0];
      expect(row).toBeDefined();
      if (!row) throw new Error('expected fire-drill mission_runs row');
      expect(row.template_key).toBe('fire-drill-monthly');
      expect(row.status).toBe('failed');
      expect(String(row.error_message ?? '')).toMatch(/PARITY/i);
      expect(ALLOWED_STATUSES.has(String(row.status))).toBe(true);

      const pointer = parityPointerFromTypedOutput(row.typed_output_json);
      expect(pointer).toBeTruthy();
      expect(pointer).toBe(RUN_REPORT);
      expect(existsSync(String(pointer))).toBe(true);
      expect(statSync(String(pointer)).size).toBeGreaterThan(0);

      // Prove we are reading live columns only (query shape is the contract).
      const typed = asRecord(row.typed_output_json);
      expect(typed.reportPath ?? typed.parity_report_path).toBeTruthy();
      expect(typed.POSTGRES_PARITY_PASS).toBe(false);

      writeEvidence('parity-fail-db.json', {
        template_key: row.template_key,
        status: row.status,
        error_code: row.error_code,
        error_message: row.error_message,
        parity_pointer: pointer,
        report_size: statSync(String(pointer)).size,
        typed_keys: Object.keys(typed),
      });
    },
    180_000
  );

  itLive(
    'typed_output_json holds parity report pointer on run (live columns only)',
    async () => {
      if (!sql) throw new Error('sql missing');

      await registerFireDrillResilient();

      // Same refuse-path: still produces typed_output_json with report pointer (AC-2 storage).
      const idempotencyKey = `redhat-fix-c4-typed-output-${Date.now()}`;
      await runMissionTemplate(
        {
          templateKey: FIRE_DRILL_MONTHLY_TEMPLATE_KEY,
          goal: 'REDHAT-FIX-C4 typed_output_json contract probe',
          idempotencyKey,
          targetTimestamp: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
          scratch: RUN_SCRATCH,
          blobDir: RUN_BLOB_DIR_SAME,
          sourceBlobRoot: RUN_BLOB_SOURCE,
          reportPath: RUN_REPORT,
        },
        { databaseUrl: DATABASE_URL }
      );

      // information_schema: non-live invented column names must not exist.
      const invented = await sql`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'mission_runs'
          AND column_name IN ('mission_key', 'output_artifacts', 'failure_reason')
      `;
      expect(invented).toHaveLength(0);

      const realCols = await sql`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'mission_runs'
          AND column_name IN ('template_key', 'typed_output_json', 'error_message', 'status')
        ORDER BY column_name
      `;
      expect(realCols.map((c) => c.column_name).sort()).toEqual(
        ['error_message', 'status', 'template_key', 'typed_output_json'].sort()
      );

      const rows = await sql`
        SELECT template_key, status, typed_output_json, error_message
        FROM mission_runs
        WHERE template_key = ${FIRE_DRILL_MONTHLY_TEMPLATE_KEY}
          AND idempotency_key = ${idempotencyKey}
        LIMIT 1
      `;
      expect(rows).toHaveLength(1);
      const pointer = parityPointerFromTypedOutput(rows[0]?.typed_output_json);
      expect(pointer).toBeTruthy();
      expect(existsSync(String(pointer))).toBe(true);
      expect(statSync(String(pointer)).size).toBeGreaterThan(0);

      // Status must be a lowercase allowed value (failed here due to induced parity refuse).
      expect(ALLOWED_STATUSES.has(String(rows[0]?.status))).toBe(true);
      expect(String(rows[0]?.status)).toMatch(/^[a-z_]+$/);

      writeEvidence('typed-output-columns.json', {
        invented_columns: invented,
        real_columns: realCols,
        status: rows[0]?.status,
        pointer,
      });
    },
    180_000
  );

  it('exported definition satisfies MissionTemplateDefinition type surface', () => {
    const def: MissionTemplateDefinition = fireDrillMonthlyTemplateDefinition;
    expect(def.templateKey).toBe('fire-drill-monthly');
    expect(def.trigger.kind).toBe('on-demand');
  });
});

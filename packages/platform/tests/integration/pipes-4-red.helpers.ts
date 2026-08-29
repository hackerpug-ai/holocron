/**
 * Sprint 22 / pipes-4 — shared helpers for pipeline-collapse RED suite.
 *
 * Real Postgres + fleet only. No mocks. Evidence under .tmp/pipes-4/.
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  DATABASE_URL,
  type HoloResult,
  type JsonRecord,
  PLATFORM_IT,
  prepareTemplateFixture,
  REPO_ROOT,
  runHolo,
  truncateMissionTables,
  withSql,
} from './mission-red.helpers';

export const PIPES4_EVIDENCE_DIR = resolve(REPO_ROOT, '.tmp/pipes-4');
export const PIPES4_RAW_DIR = resolve(PIPES4_EVIDENCE_DIR, 'raw');

/**
 * Per-domain *pipeline* shell dirs that Sprint 22 must eliminate on the platform.
 *
 * Residual intentional app surfaces under convex/{whatsNew,assimilate,shop,subscriptions}
 * remain for RN Zero soak; pipelines themselves now live as mission templates under
 * packages/platform/src/mission/templates/. AC-5 verify + holo verify:no-shells scan
 * platform pipeline shells only (pipes-3 scope note).
 */
export const PER_DOMAIN_SHELL_DIRS = [
  'packages/platform/src/whatsnew',
  'packages/platform/src/assimilate',
  'packages/platform/src/shop',
  'packages/platform/src/subscriptions',
] as const;

export const BUSINESS_REPORT_KIND_KEYS = [
  'revenue-validation',
  'competitive',
  'ai-roi',
  'flights',
] as const;

export function ensurePipes4EvidenceDirs(): void {
  mkdirSync(PIPES4_EVIDENCE_DIR, { recursive: true });
  mkdirSync(PIPES4_RAW_DIR, { recursive: true });
}

export function writePipes4Artifact(name: string, body: unknown): string {
  ensurePipes4EvidenceDirs();
  const path = resolve(PIPES4_EVIDENCE_DIR, name);
  const text = typeof body === 'string' ? body : JSON.stringify(body, null, 2);
  writeFileSync(path, text.endsWith('\n') ? text : `${text}\n`, 'utf8');
  return path;
}

export function captureHoloArtifact(name: string, result: HoloResult): void {
  writePipes4Artifact(`${name}.json`, {
    status: result.status,
    command: result.command,
    stdout: result.stdout,
    stderr: result.stderr,
    combined: result.combined,
    parsed: result.parsed,
    databaseUrl: DATABASE_URL,
  });
  writeFileSync(resolve(PIPES4_RAW_DIR, `${name}.stdout.log`), result.stdout, 'utf8');
  writeFileSync(resolve(PIPES4_RAW_DIR, `${name}.stderr.log`), result.stderr, 'utf8');
}

/**
 * Real seeded-data probe via psql $DATABASE_URL (TC-3 requires this literal string
 * appear in the RED suite files — tests invoke real psql, never mocks).
 */
export function runPsql(sql: string): { status: number | null; stdout: string; stderr: string } {
  // Real probe — equivalent to: psql $DATABASE_URL -c "<sql>"
  const result = spawnSync('psql', [DATABASE_URL, '-v', 'ON_ERROR_STOP=1', '-c', sql], {
    encoding: 'utf8',
    env: { ...process.env, DATABASE_URL },
  });
  return {
    status: result.status,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  };
}

/** Comment-anchor for TC-3 greps: psql $DATABASE_URL */
export const PSQL_DATABASE_URL_MARKER = 'psql $DATABASE_URL';

export async function resetMissionState(): Promise<void> {
  await truncateMissionTables();
}

export function registerEchoTemplateAs(
  templateKey: string,
  scenarioLabel: string
): { path: string; templateKey: string; version: string } {
  const fixture = prepareTemplateFixture('template-test.echo.json', scenarioLabel, {
    templateKey,
    version: '0.0.1-red-stub',
  });
  const reg = runHolo(`pipes4-register-${scenarioLabel}`, [
    'mission',
    'template:register',
    fixture.path,
    '--json',
  ]);
  captureHoloArtifact(`register-${scenarioLabel}`, reg);
  return fixture;
}

export function asRecord(value: unknown): JsonRecord {
  return value && typeof value === 'object' ? (value as JsonRecord) : {};
}

export function outputDocumentType(parsed: unknown): string | null {
  const payload = asRecord(parsed);
  const output = asRecord(
    payload.output ?? payload.typedOutputJson ?? payload.typed_output_json ?? payload.result
  );
  const dt = output.documentType ?? output.document_type ?? payload.documentType;
  return typeof dt === 'string' ? dt : null;
}

export function outputHeadlines(parsed: unknown): unknown[] {
  const payload = asRecord(parsed);
  const output = asRecord(
    payload.output ?? payload.typedOutputJson ?? payload.typed_output_json ?? payload.result
  );
  const headlines = output.headlines;
  return Array.isArray(headlines) ? headlines : [];
}

export async function countTemplatesByKeys(keys: readonly string[]): Promise<number> {
  return withSql(async (sql) => {
    if (keys.length === 0) return 0;
    // postgres.js expands JS arrays into = ANY(...) safely.
    const keyList = [...keys];
    const rows = await sql<{ count: string }[]>`
      SELECT count(*)::text AS count
      FROM mission_templates
      WHERE template_key = ANY(${keyList})
    `;
    return Number(rows[0]?.count ?? 0);
  });
}

export async function listTemplateKeysMatching(pattern: string): Promise<string[]> {
  return withSql(async (sql) => {
    const rows = await sql<{ template_key: string }[]>`
      SELECT template_key FROM mission_templates WHERE template_key LIKE ${pattern} ORDER BY template_key
    `;
    return rows.map((r) => r.template_key);
  });
}

export { DATABASE_URL, PLATFORM_IT, REPO_ROOT, runHolo, withSql };

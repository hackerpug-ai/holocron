/**
 * S31-OPS-04 — Install fire-drill schedule; fix isolation proof that rejects the real mini.
 *
 * AC-1 [PRIMARY]: fireDrillPlistRealProgramArguments — plist ProgramArguments invoke holo + fire-drill
 * AC-2: livePgdataScratchRefused — live mini PGDATA scratch refused with canonical message
 * AC-3: miniHostEmptyTmpScratchAllowed — empty `.tmp` scratch on mini hostname is allowed
 * AC-4: fireDrillTemplatePresent — fire-drill-monthly@1.0.0 registered
 *
 * NEGATIVE_CONTROL (would fail if):
 * - ProgramArguments is sole /usr/bin/true or missing holo/fire-drill
 * - live PGDATA accepted / exit 0
 * - empty .tmp on mini false-rejected via host identity check
 * - template missing under PLATFORM_IT=1
 *
 * Run:
 *   PLATFORM_IT=1 pnpm test:integration -- \
 *     packages/platform/tests/integration/sprint31-ops-04-fire-drill-schedule.test.ts
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { hostname as osHostname } from 'node:os';
import { resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  evaluateFireDrillPathIsolation,
  FORBIDDEN_PGDATA,
  isForbiddenFireDrillScratch,
  LIVE_MINI_PGDATA_REFUSED,
  runFireDrill,
} from '../../src/backup/fire-drill.ts';
import { createSql, type Sql } from '../../src/db/client.ts';
import {
  FIRE_DRILL_MONTHLY_TEMPLATE_KEY,
  FIRE_DRILL_MONTHLY_TEMPLATE_VERSION,
  registerFireDrillMonthlyTemplate,
} from '../../src/mission/index.ts';
import { registerMissionTemplateDefinition } from '../../src/mission/repository.ts';
import { fireDrillMonthlyTemplateDefinition } from '../../src/mission/templates/fire-drill-monthly.ts';
import {
  BUN_BIN,
  DATABASE_URL,
  ensureRedTestEnvironment,
  HOLO_CLI,
  PLATFORM_IT,
  REPO_ROOT,
} from './mission-red.helpers.ts';

const itLive = PLATFORM_IT ? it : it.skip;

const EVIDENCE_DIR = resolve(REPO_ROOT, '.tmp/s31-ops-04');
const PLIST_PATH = resolve(
  REPO_ROOT,
  'packages/platform/deploy/launchd/holocron-fire-drill-monthly.plist'
);
const TEMPLATE_JSON = resolve(
  REPO_ROOT,
  'packages/platform/src/mission/templates/fire-drill-monthly.json'
);
const RUNBOOK_PATH = resolve(REPO_ROOT, '.spec/prds/mk6-migration/runbooks/fire-drill-monthly.md');

function writeEvidence(name: string, body: unknown): string {
  mkdirSync(EVIDENCE_DIR, { recursive: true });
  const path = resolve(EVIDENCE_DIR, name);
  const text = typeof body === 'string' ? body : JSON.stringify(body, null, 2);
  writeFileSync(path, text.endsWith('\n') ? text : `${text}\n`, 'utf8');
  return path;
}

/** Extract ordered ProgramArguments strings from a launchd plist XML. */
function parsePlistProgramArguments(xml: string): string[] {
  const argsBlock = xml.match(/<key>ProgramArguments<\/key>\s*<array>([\s\S]*?)<\/array>/i);
  if (!argsBlock) return [];
  const args: string[] = [];
  const re = /<string>([\s\S]*?)<\/string>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(argsBlock[1] ?? '')) !== null) {
    args.push(m[1] ?? '');
  }
  return args;
}

describe('S31-OPS-04 fire-drill schedule + isolation proof', () => {
  it('fireDrillPlistRealProgramArguments (AC-1 PRIMARY)', () => {
    expect(existsSync(PLIST_PATH), `missing plist ${PLIST_PATH}`).toBe(true);
    const xml = readFileSync(PLIST_PATH, 'utf8');
    const args = parsePlistProgramArguments(xml);

    writeEvidence('ac1-plist-program-arguments.json', {
      path: PLIST_PATH,
      programArguments: args,
      hasDisabledKey: /<key>Disabled<\/key>/i.test(xml),
      disabledDocumented:
        /Disabled/i.test(xml) ||
        /Disabled key/i.test(readFileSync(RUNBOOK_PATH, 'utf8')) ||
        /Disabled/i.test(readFileSync(PLIST_PATH, 'utf8')),
    });

    expect(args.length, 'ProgramArguments must not be empty').toBeGreaterThan(0);
    // NEVER sole program /usr/bin/true
    expect(args).not.toEqual(['/usr/bin/true']);
    expect(args.some((a) => a === '/usr/bin/true' && args.length === 1)).toBe(false);

    const joined = args.join(' ');
    // holo present (cli path or bare holo)
    expect(joined, 'ProgramArguments must contain holo').toMatch(/holo(\.ts)?/);
    // fire-drill or fire-drill-monthly present
    expect(joined, 'ProgramArguments must contain fire-drill').toMatch(/fire-drill(?:-monthly)?/);
    // Monthly cadence via StartCalendarInterval (not StartInterval sub-monthly)
    expect(xml).toMatch(/StartCalendarInterval/);
    expect(xml).toMatch(/<key>Day<\/key>\s*<integer>1<\/integer>/);
    // Real mission/run path — not a no-op
    expect(joined).toMatch(/mission|restore:fire-drill/);
  });

  it('miniHostEmptyTmpScratchAllowed (AC-3) — path guard unit', () => {
    // GIVEN: hostname is the mini; scratch is empty dir under .tmp/fire-drill-monthly/
    const miniHostname = osHostname();
    const scratch = resolve(REPO_ROOT, '.tmp/fire-drill-monthly/scratch-pgdata');
    const blobDir = resolve(REPO_ROOT, '.tmp/fire-drill-monthly/scratch-blobs');
    mkdirSync(scratch, { recursive: true });
    mkdirSync(blobDir, { recursive: true });

    const env: NodeJS.ProcessEnv = {
      HOLO_LIVE_PGDATA: FORBIDDEN_PGDATA[0],
      HOLO_STANDING_PG1_PATH: FORBIDDEN_PGDATA[0],
      HOLO_LIVE_BLOB_ROOT: resolve(REPO_ROOT, '.tmp/holocron-blobs-live'),
      HOLO_BLOB_ROOT: resolve(REPO_ROOT, '.tmp/holocron-blobs-live'),
    };

    const result = evaluateFireDrillPathIsolation({
      scratch,
      blobDir,
      hostname: miniHostname,
      env,
    });

    writeEvidence('ac3-mini-host-tmp-scratch.json', {
      hostname: miniHostname,
      scratch,
      blobDir,
      result,
      prose: 'Mini host with empty .tmp scratch is not false-rejected',
    });

    expect(result.hostCheck).toBe('not_required');
    expect(result.scratchForbidden).toBe(false);
    expect(result.blobForbidden).toBe(false);
    expect(result.allowed).toBe(true);
    expect(result.errors.join(' ')).not.toMatch(/reject.*real mini|illegal host|same.?host/i);
    expect(isForbiddenFireDrillScratch(scratch, env)).toBe(false);

    // Negative: live PGDATA still refused even when hostname is mini
    const liveRefuse = evaluateFireDrillPathIsolation({
      scratch: FORBIDDEN_PGDATA[0],
      blobDir,
      hostname: miniHostname,
      env,
    });
    expect(liveRefuse.allowed).toBe(false);
    expect(liveRefuse.scratchForbidden).toBe(true);
    expect(liveRefuse.errors.join(' ')).toContain(LIVE_MINI_PGDATA_REFUSED);
  });

  it('repo artifacts present (plist + template JSON fixtures)', () => {
    expect(existsSync(PLIST_PATH)).toBe(true);
    expect(existsSync(TEMPLATE_JSON)).toBe(true);
    const tpl = JSON.parse(readFileSync(TEMPLATE_JSON, 'utf8')) as {
      templateKey?: string;
      version?: string;
    };
    expect(tpl.templateKey).toBe('fire-drill-monthly');
    expect(tpl.version).toBe('1.0.0');
    expect(fireDrillMonthlyTemplateDefinition.templateKey).toBe(FIRE_DRILL_MONTHLY_TEMPLATE_KEY);
    expect(fireDrillMonthlyTemplateDefinition.version).toBe(FIRE_DRILL_MONTHLY_TEMPLATE_VERSION);
  });
});

describe('S31-OPS-04 live isolation + template (PLATFORM_IT)', () => {
  let sql: Sql | undefined;

  beforeAll(async () => {
    mkdirSync(EVIDENCE_DIR, { recursive: true });
    if (!PLATFORM_IT) return;
    await ensureRedTestEnvironment();
    sql = createSql(DATABASE_URL);
  });

  afterAll(async () => {
    if (sql) await sql.end({ timeout: 5 });
  });

  itLive(
    'livePgdataScratchRefused (AC-2)',
    async () => {
      expect(PLATFORM_IT, 'PLATFORM_IT=1 required for AC-2').toBe(true);

      const forbidden = FORBIDDEN_PGDATA[0];
      const blobDir = resolve(EVIDENCE_DIR, 'ac2-blob-empty');
      const reportPath = resolve(EVIDENCE_DIR, 'ac2-parity-report.json');
      mkdirSync(blobDir, { recursive: true });

      // Library path (guard before any R2/PITR work)
      const lib = await runFireDrill({
        targetTimestamp: '2099-01-01T00:00:00Z',
        scratch: forbidden,
        blobDir,
        reportPath,
        requireRecoveryBaseline: false,
        env: {
          PATH: process.env.PATH,
          HOME: process.env.HOME,
          TMPDIR: process.env.TMPDIR,
          HOLO_LIVE_PGDATA: forbidden,
          HOLOCRON_SECRETS_PATH: '/nonexistent-s31-ops-04-no-secrets',
          R2_ACCESS_KEY_ID: '',
          R2_SECRET_ACCESS_KEY: '',
        },
      });

      writeEvidence('ac2-library-refuse.json', {
        ok: lib.ok,
        exitCode: lib.exitCode,
        errors: lib.errors,
      });

      expect(lib.ok).toBe(false);
      expect(lib.exitCode).not.toBe(0);
      expect(lib.errors.join('\n')).toContain(LIVE_MINI_PGDATA_REFUSED);

      // CLI path: holo restore:fire-drill --scratch <FORBIDDEN>
      const cli = spawnSync(
        BUN_BIN,
        [
          HOLO_CLI,
          'restore:fire-drill',
          '--target-timestamp',
          '2099-01-01T00:00:00Z',
          '--scratch',
          forbidden,
          '--blob-dir',
          blobDir,
          '--report',
          resolve(EVIDENCE_DIR, 'ac2-cli-parity-report.json'),
          '--json',
        ],
        {
          cwd: REPO_ROOT,
          encoding: 'utf8',
          timeout: 60_000,
          env: {
            ...process.env,
            HOLO_LIVE_PGDATA: forbidden,
            HOLOCRON_SECRETS_PATH: '/nonexistent-s31-ops-04-no-secrets',
            HOLO_SECRETS_PATH: '/nonexistent-s31-ops-04-no-secrets',
            R2_ACCESS_KEY_ID: '',
            R2_SECRET_ACCESS_KEY: '',
            R2_RESTORE_ACCESS_KEY_ID: '',
            R2_RESTORE_SECRET_ACCESS_KEY: '',
          },
        }
      );

      const combined = `${cli.stdout ?? ''}\n${cli.stderr ?? ''}`;
      writeEvidence('ac2-cli-refuse.json', {
        status: cli.status,
        stdout: (cli.stdout ?? '').slice(0, 4000),
        stderr: (cli.stderr ?? '').slice(0, 4000),
      });

      expect(cli.status ?? 1, combined).not.toBe(0);
      expect(combined).toContain(LIVE_MINI_PGDATA_REFUSED);
    },
    120_000
  );

  itLive(
    'miniHostEmptyTmpScratchAllowed live path evaluation (AC-3)',
    async () => {
      expect(PLATFORM_IT, 'PLATFORM_IT=1 required for AC-3 live').toBe(true);

      const scratch = resolve(EVIDENCE_DIR, 'fire-drill-monthly/scratch-pgdata');
      const blobDir = resolve(EVIDENCE_DIR, 'fire-drill-monthly/scratch-blobs');
      rmSync(scratch, { recursive: true, force: true });
      rmSync(blobDir, { recursive: true, force: true });
      mkdirSync(scratch, { recursive: true });
      mkdirSync(blobDir, { recursive: true });

      const miniHostname = osHostname();
      const guard = evaluateFireDrillPathIsolation({
        scratch,
        blobDir,
        hostname: miniHostname,
        env: {
          HOLO_LIVE_PGDATA: FORBIDDEN_PGDATA[0],
          HOLO_STANDING_PG1_PATH: FORBIDDEN_PGDATA[0],
          HOLO_BLOB_ROOT: resolve(REPO_ROOT, '.tmp/holocron-blobs'),
        },
      });

      writeEvidence('ac3-live-path-guard.json', {
        prose: 'Mini host with empty .tmp scratch is not false-rejected',
        hostname: miniHostname,
        guard,
      });

      expect(guard.allowed).toBe(true);
      expect(guard.hostCheck).toBe('not_required');
      expect(guard.errors.join(' ')).not.toMatch(/reject.*real mini|illegal host/i);

      // runFireDrill should pass the path guard (may fail later on baseline/R2 — not host reject)
      const r = await runFireDrill({
        targetTimestamp: '2099-01-01T00:00:00Z',
        scratch,
        blobDir,
        reportPath: resolve(EVIDENCE_DIR, 'ac3-parity-report.json'),
        requireRecoveryBaseline: true,
        env: {
          PATH: process.env.PATH,
          HOME: process.env.HOME,
          TMPDIR: process.env.TMPDIR,
          HOLO_LIVE_PGDATA: FORBIDDEN_PGDATA[0],
          HOLOCRON_SECRETS_PATH: '/nonexistent-s31-ops-04-ac3-no-secrets',
          R2_ACCESS_KEY_ID: '',
          R2_SECRET_ACCESS_KEY: '',
        },
      });

      writeEvidence('ac3-runFireDrill-after-guard.json', {
        ok: r.ok,
        exitCode: r.exitCode,
        errors: r.errors,
      });

      // Must NOT fail for live PGDATA / host reject; baseline/R2 absence is expected.
      expect(r.errors.join('\n')).not.toContain(LIVE_MINI_PGDATA_REFUSED);
      expect(r.errors.join('\n')).not.toMatch(/reject.*real mini|illegal host|same.?host/i);
      expect(r.ok).toBe(false); // no R2 baseline — fail closed later, not on isolation
    },
    120_000
  );

  itLive(
    'fireDrillTemplatePresent (AC-4)',
    async () => {
      expect(PLATFORM_IT, 'PLATFORM_IT=1 required for AC-4').toBe(true);
      if (!sql) throw new Error('sql not initialized');

      // Register via public API (idempotent for identical content)
      const reg = await registerFireDrillMonthlyTemplate({ databaseUrl: DATABASE_URL });
      writeEvidence('ac4-register-result.json', reg);

      // Also exercise definition path used by ensure helpers
      await registerMissionTemplateDefinition(fireDrillMonthlyTemplateDefinition, {
        databaseUrl: DATABASE_URL,
      });

      const rows = await sql`
      SELECT t.template_key, t.latest_version, v.version
      FROM mission_templates t
      JOIN mission_template_versions v
        ON v.template_key = t.template_key
      WHERE t.template_key = ${FIRE_DRILL_MONTHLY_TEMPLATE_KEY}
        AND v.version = ${FIRE_DRILL_MONTHLY_TEMPLATE_VERSION}
      LIMIT 1
    `;

      writeEvidence('ac4-template-rows.json', {
        prose: 'fire-drill-monthly template registered',
        rows,
        templateKey: FIRE_DRILL_MONTHLY_TEMPLATE_KEY,
        version: FIRE_DRILL_MONTHLY_TEMPLATE_VERSION,
      });

      expect(rows.length, 'fire-drill-monthly@1.0.0 must be present').toBeGreaterThan(0);
      expect(rows[0]?.template_key).toBe('fire-drill-monthly');
      expect(String(rows[0]?.version)).toBe('1.0.0');
      expect(String(rows[0]?.latest_version)).toBe('1.0.0');
    },
    120_000
  );
});

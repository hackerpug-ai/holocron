/**
 * REDHAT-FIX-S29-H05 — executable UC-SYNC-04 rollback re-point + precondition.
 *
 * Run:
 *   PLATFORM_IT=1 pnpm vitest run --project integration \
 *     services/platform/tests/integration/sprint29-rollback-repoint.test.ts
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { PLATFORM_IT } from '../../../../tests/integration/service/harness';
import {
  defaultDataPlaneConfigPath,
  defaultPostExportWriteAuditPath,
  defaultRollbackRepointReportPath,
  POST_EXPORT_WRITE_ACCEPTED,
  runRollbackRepoint,
  TARGET_CONVEX_FROZEN,
  writePostExportWriteAudit,
} from '../../src/cutover/rollback-repoint.ts';

if (!PLATFORM_IT) {
  throw new Error('sprint29-rollback-repoint requires PLATFORM_IT=1');
}

const EVIDENCE = resolve(process.cwd(), '.tmp/REDHAT-FIX-S29-H05');
const D0605 = resolve(process.cwd(), '.tmp/D06-05');
const D0604 = resolve(process.cwd(), '.tmp/D06-04');

function evidence(name: string, body: unknown): void {
  mkdirSync(EVIDENCE, { recursive: true });
  mkdirSync(D0605, { recursive: true });
  const text = typeof body === 'string' ? body : `${JSON.stringify(body, null, 2)}\n`;
  writeFileSync(resolve(EVIDENCE, name), text.endsWith('\n') ? text : `${text}\n`, 'utf8');
}

function holo(args: string[]): {
  status: number | null;
  stdout: string;
  stderr: string;
} {
  const r = spawnSync('bun', ['services/platform/src/cli/holo.ts', ...args], {
    cwd: process.cwd(),
    encoding: 'utf8',
    timeout: 120_000,
    env: process.env,
  });
  return { status: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
}

function seedEligibleFixture(opts?: { withAcceptedWrite?: boolean }): {
  watermarkPath: string;
  auditPath: string;
  exportMs: number;
} {
  mkdirSync(D0604, { recursive: true });
  mkdirSync(D0605, { recursive: true });
  const exportMs = Date.now() - 60_000;
  const watermarkPath = resolve(D0604, 'watermark-report.json');
  writeFileSync(
    watermarkPath,
    `${JSON.stringify(
      {
        ok: true,
        watermarkAt: new Date(exportMs).toISOString(),
        watermarkAtMs: exportMs,
        lastWriteAuditCount: 0,
        fence_armed_at: exportMs - 10_000,
        fence_env: '1',
        quiet_check_path: null,
        quiet_ok: true,
        runId: 's29-h05-rollback-fixture',
        unexplainedVariance: 0,
      },
      null,
      2
    )}\n`,
    'utf8'
  );

  const auditPath = defaultPostExportWriteAuditPath(process.cwd());
  writePostExportWriteAudit(
    {
      export_watermark_ms: exportMs,
      accepted_writes: opts?.withAcceptedWrite
        ? [
            {
              committed_at_ms: exportMs + 5_000,
              surface: 'hono.POST /api/documents',
              id: 'fixture-post-export-write',
            },
          ]
        : [],
    },
    auditPath
  );

  return { watermarkPath, auditPath, exportMs };
}

describe('REDHAT-FIX-S29-H05 rollback re-point (UC-SYNC-04)', () => {
  beforeEach(() => {
    mkdirSync(EVIDENCE, { recursive: true });
    mkdirSync(D0605, { recursive: true });
    // Clean prior config so prior_target assertions are stable
    const cfg = defaultDataPlaneConfigPath(process.cwd());
    if (existsSync(cfg)) rmSync(cfg);
    const report = defaultRollbackRepointReportPath(process.cwd());
    if (existsSync(report)) rmSync(report);
  });

  it('TC-3: cutover:rollback-repoint is a registered executable command', () => {
    // Unknown commands exit non-zero with "unknown command:" — registered ones do not
    const help = holo(['cutover:rollback-repoint', '--json']);
    evidence('tc3-cli-registered.json', help);
    // Without watermark fixture this may refuse, but must NOT be "unknown command"
    const combined = `${help.stdout}\n${help.stderr}`;
    expect(combined.includes('unknown command: cutover:rollback-repoint')).toBe(false);
    // Parse JSON response (ok true or structured error)
    const parsed = JSON.parse(help.stdout || help.stderr || '{}') as {
      ok?: boolean;
      error?: { code?: string } | string;
      repointed?: boolean;
    };
    expect(parsed.ok === true || parsed.ok === false || parsed.error != null).toBe(true);
  }, 60_000);

  it('AC-3 executable-repoint: re-points to convex-frozen with auditable config evidence', () => {
    const { watermarkPath, auditPath } = seedEligibleFixture({ withAcceptedWrite: false });
    const reportPath = resolve(D0605, 'rollback-repoint-report.json');
    const configPath = defaultDataPlaneConfigPath(process.cwd());

    const report = runRollbackRepoint({
      reportPath,
      configPath,
      auditPath,
      watermarkPath,
    });
    evidence('rollback-repoint-report.json', report);
    evidence('ac-3-executable-repoint.json', report);

    expect(report.ok).toBe(true);
    expect(report.repointed).toBe(true);
    expect(report.target).toBe(TARGET_CONVEX_FROZEN);
    expect(report.data_plane).toBe('convex');
    expect(report.target_kind).toBe('convex');
    expect(report.precondition.ok).toBe(true);
    expect(report.precondition.accepted_post_export_writes).toBe(0);
    expect(report.config.path).toBe(configPath);
    expect(report.config.digest_sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(existsSync(configPath)).toBe(true);

    const cfg = JSON.parse(readFileSync(configPath, 'utf8')) as {
      target: string;
      convex_deployment_deleted: boolean;
    };
    evidence('ac-3-data-plane-config.json', cfg);
    expect(cfg.target).toBe(TARGET_CONVEX_FROZEN);
    expect(cfg.convex_deployment_deleted).toBe(false);
    // Convex tree must still exist (re-point is not decommission)
    expect(existsSync(resolve(process.cwd(), 'convex'))).toBe(true);

    // CLI path
    const cli = holo([
      'cutover:rollback-repoint',
      '--json',
      '--etl-report',
      watermarkPath,
      '--output',
      resolve(EVIDENCE, 'rollback-repoint-cli.json'),
    ]);
    evidence('ac-3-cli.json', cli);
    expect(cli.status).toBe(0);
    const parsed = JSON.parse(cli.stdout) as {
      ok: boolean;
      repointed: boolean;
      target: string;
    };
    expect(parsed.ok).toBe(true);
    expect(parsed.repointed).toBe(true);
    expect(parsed.target).toBe(TARGET_CONVEX_FROZEN);
  }, 60_000);

  it('AC-4 no-accepted-post-export-write-precondition: refuses when writes accepted after export', () => {
    const { watermarkPath, auditPath } = seedEligibleFixture({ withAcceptedWrite: true });
    // Snapshot prior config if any
    const configPath = defaultDataPlaneConfigPath(process.cwd());
    writeFileSync(
      configPath,
      `${JSON.stringify({ target: 'postgres-soak', data_plane: 'postgres' }, null, 2)}\n`,
      'utf8'
    );
    const prior = readFileSync(configPath, 'utf8');

    const report = runRollbackRepoint({
      reportPath: resolve(D0605, 'rollback-repoint-report-ineligible.json'),
      configPath,
      auditPath,
      watermarkPath,
    });
    evidence('ac-4-post-export-refused.json', report);

    expect(report.ok).toBe(false);
    expect(report.repointed).toBe(false);
    expect(report.error?.code).toBe(POST_EXPORT_WRITE_ACCEPTED);
    expect(report.precondition.accepted_post_export_writes).toBeGreaterThan(0);
    // Config target must remain pre-command state
    expect(readFileSync(configPath, 'utf8')).toBe(prior);

    const cli = holo([
      'cutover:rollback-repoint',
      '--json',
      '--etl-report',
      watermarkPath,
      '--output',
      resolve(EVIDENCE, 'rollback-repoint-cli-ineligible.json'),
    ]);
    evidence('ac-4-cli.json', cli);
    expect(cli.status).not.toBe(0);
    const parsed = JSON.parse(cli.stdout) as {
      ok: boolean;
      repointed: boolean;
      error?: { code?: string };
    };
    expect(parsed.ok).toBe(false);
    expect(parsed.repointed).toBe(false);
    expect(
      parsed.error?.code === POST_EXPORT_WRITE_ACCEPTED ||
        parsed.error?.code === 'ROLLBACK_INELIGIBLE'
    ).toBe(true);
  }, 60_000);
});

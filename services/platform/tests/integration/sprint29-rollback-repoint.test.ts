/**
 * REDHAT-FIX-S29-H05 + REDHAT-FIX-S29-R2-C04 + REDHAT-FIX-S29-R3-H03 —
 * serving control-plane rollback re-point with live acknowledgements from
 * pre-existing serving generations (UC-SYNC-04).
 *
 * Run:
 *   PLATFORM_IT=1 pnpm vitest run --project integration \
 *     services/platform/tests/integration/sprint29-rollback-repoint.test.ts
 */
import { type ChildProcess, spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PLATFORM_IT } from '../../../../tests/integration/service/harness';
import { loadSecretsFile } from '../../src/config/secrets.ts';
import {
  defaultDataPlaneConfigPath,
  defaultPostExportWriteAuditPath,
  defaultRollbackRepointReportPath,
  isAuthorizingRollbackAck,
  LIVE_ACK_MISSING,
  POST_EXPORT_WRITE_ACCEPTED,
  runRollbackRepoint,
  TARGET_CONVEX_FROZEN,
  writePostExportWriteAudit,
} from '../../src/cutover/rollback-repoint.ts';
import {
  DATA_PLANE_ENV,
  ROLLBACK_TARGET_ENV,
  resolveObservedDataPlane,
} from '../../src/cutover/soak-fence.ts';
import { createHonoApp } from '../../src/http/hono-app.ts';

if (!PLATFORM_IT) {
  throw new Error('sprint29-rollback-repoint requires PLATFORM_IT=1');
}

const REPO_ROOT = process.cwd();
const EVIDENCE = resolve(REPO_ROOT, '.tmp/REDHAT-FIX-S29-H05');
const R2_EVIDENCE = resolve(REPO_ROOT, '.tmp/REDHAT-FIX-S29-R2-C04');
const R3_H03_EVIDENCE = resolve(REPO_ROOT, '.tmp/REDHAT-FIX-S29-R3-H03');
const SPRINT_EVIDENCE = resolve(
  REPO_ROOT,
  '.tmp/sprint-29-cutover-write-freeze-etl-and-read-only-soak-flip'
);
const D0605 = resolve(REPO_ROOT, '.tmp/D06-05');
const D0604 = resolve(REPO_ROOT, '.tmp/D06-04');
const DISPOSABLE_SECRETS = resolve(R2_EVIDENCE, 'disposable-secrets.yaml');

type PreexistingServing = {
  baseUrl: string;
  port: number;
  pid: number | undefined;
  stop: () => Promise<void>;
};

function freePort(): Promise<number> {
  return new Promise((resolvePort, reject) => {
    const srv = createServer();
    srv.unref();
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address();
      if (!addr || typeof addr === 'string') {
        srv.close();
        reject(new Error('failed to bind ephemeral port'));
        return;
      }
      const port = addr.port;
      srv.close((err) => (err ? reject(err) : resolvePort(port)));
    });
  });
}

/**
 * Start a pre-existing serving process that re-reads durable secrets on every
 * /health (R3-H03). Must be up BEFORE runRollbackRepoint — not createHonoApp
 * inside the same command.
 */
async function startPreexistingServing(secretsPath: string): Promise<PreexistingServing> {
  const port = await freePort();
  const soakFence = resolve(REPO_ROOT, 'services/platform/src/cutover/soak-fence.ts');
  const child: ChildProcess = spawn(
    'bun',
    [
      '-e',
      `
import { readDurableDataPlane } from ${JSON.stringify(soakFence)};
const secretsPath = process.env.HOLO_SECRETS_PATH;
const port = Number(process.env.PORT);
Bun.serve({
  port,
  hostname: '127.0.0.1',
  fetch(req) {
    const url = new URL(req.url);
    if (url.pathname === '/health' || url.pathname === '/health/') {
      delete process.env.HOLO_DATA_PLANE;
      delete process.env.HOLO_ROLLBACK_TARGET;
      const r = readDurableDataPlane(process.env, secretsPath);
      return Response.json({
        status: 'ok',
        data_plane: r.data_plane,
        target: r.target,
        rollback: { target: r.target, data_plane: r.data_plane, source: 'secrets' },
      });
    }
    return new Response('not found', { status: 404 });
  },
});
console.log('PREEXISTING_READY ' + port);
`,
    ],
    {
      cwd: REPO_ROOT,
      env: {
        ...process.env,
        PORT: String(port),
        HOLO_SECRETS_PATH: secretsPath,
        HOLOCRON_SECRETS_PATH: secretsPath,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    }
  );

  let stdout = '';
  let stderr = '';
  child.stdout?.on('data', (b: Buffer) => {
    stdout += b.toString('utf8');
  });
  child.stderr?.on('data', (b: Buffer) => {
    stderr += b.toString('utf8');
  });

  const baseUrl = `http://127.0.0.1:${port}`;
  const deadline = Date.now() + 15_000;
  let ready = false;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${baseUrl}/health`, { signal: AbortSignal.timeout(1_000) });
      if (res.ok || res.status === 503) {
        ready = true;
        break;
      }
    } catch {
      await new Promise((r) => setTimeout(r, 50));
    }
  }
  if (!ready) {
    child.kill('SIGKILL');
    throw new Error(
      `pre-existing serving did not become ready at ${baseUrl}\nstdout=${stdout}\nstderr=${stderr}`
    );
  }

  let exited = false;
  child.on('exit', () => {
    exited = true;
  });

  return {
    baseUrl,
    port,
    pid: child.pid,
    stop: async () => {
      if (exited) return;
      child.kill('SIGTERM');
      const stopDeadline = Date.now() + 2_000;
      while (!exited && Date.now() < stopDeadline) {
        await new Promise((r) => setTimeout(r, 50));
      }
      if (!exited) child.kill('SIGKILL');
    },
  };
}

function evidence(name: string, body: unknown, dir = EVIDENCE): void {
  mkdirSync(dir, { recursive: true });
  mkdirSync(D0605, { recursive: true });
  const text = typeof body === 'string' ? body : `${JSON.stringify(body, null, 2)}\n`;
  writeFileSync(resolve(dir, name), text.endsWith('\n') ? text : `${text}\n`, 'utf8');
}

function holo(
  args: string[],
  env: NodeJS.ProcessEnv = process.env
): {
  status: number | null;
  stdout: string;
  stderr: string;
} {
  const r = spawnSync('bun', ['services/platform/src/cli/holo.ts', ...args], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    timeout: 120_000,
    env,
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
        runId: 's29-r2-c04-rollback-fixture',
        unexplainedVariance: 0,
      },
      null,
      2
    )}\n`,
    'utf8'
  );

  const auditPath = defaultPostExportWriteAuditPath(REPO_ROOT);
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

function seedDisposableSecrets(): void {
  mkdirSync(R2_EVIDENCE, { recursive: true });
  writeFileSync(
    DISPOSABLE_SECRETS,
    [
      '# disposable R2-C04 secrets — never production',
      'HOLO_MIGRATION_READ_ONLY: "1"',
      'HOLO_DATA_PLANE: "postgres"',
      'HOLO_ROLLBACK_TARGET: "postgres-soak"',
      '',
    ].join('\n'),
    { mode: 0o600 }
  );
}

describe('REDHAT-FIX-S29-H05 / R2-C04 / R3-H03 rollback re-point (UC-SYNC-04)', () => {
  const priorSecrets = process.env.HOLO_SECRETS_PATH;
  const priorPlane = process.env[DATA_PLANE_ENV];
  const priorTarget = process.env[ROLLBACK_TARGET_ENV];
  const priorVerify = process.env.HOLO_VERIFY_BASE_URL;
  const priorSoak = process.env.HOLO_SOAK_BASE_URL;
  const priorPlatform = process.env.PLATFORM_URL;
  const priorVerifyPid = process.env.HOLO_VERIFY_PID;
  let liveServing: PreexistingServing | undefined;

  beforeEach(() => {
    mkdirSync(EVIDENCE, { recursive: true });
    mkdirSync(R2_EVIDENCE, { recursive: true });
    mkdirSync(R3_H03_EVIDENCE, { recursive: true });
    mkdirSync(SPRINT_EVIDENCE, { recursive: true });
    mkdirSync(D0605, { recursive: true });
    seedDisposableSecrets();
    process.env.HOLO_SECRETS_PATH = DISPOSABLE_SECRETS;
    delete process.env[DATA_PLANE_ENV];
    delete process.env[ROLLBACK_TARGET_ENV];
    // R3-H03: do not inherit a deploy URL from the operator shell unless the
    // test explicitly starts a pre-existing serving process.
    delete process.env.HOLO_VERIFY_BASE_URL;
    delete process.env.HOLO_SOAK_BASE_URL;
    delete process.env.PLATFORM_URL;
    delete process.env.HOLO_VERIFY_PID;
    liveServing = undefined;
    const cfg = defaultDataPlaneConfigPath(REPO_ROOT);
    if (existsSync(cfg)) rmSync(cfg);
    const report = defaultRollbackRepointReportPath(REPO_ROOT);
    if (existsSync(report)) rmSync(report);
  });

  afterEach(async () => {
    if (liveServing) {
      await liveServing.stop();
      liveServing = undefined;
    }
    if (priorSecrets !== undefined) process.env.HOLO_SECRETS_PATH = priorSecrets;
    else delete process.env.HOLO_SECRETS_PATH;
    if (priorPlane !== undefined) process.env[DATA_PLANE_ENV] = priorPlane;
    else delete process.env[DATA_PLANE_ENV];
    if (priorTarget !== undefined) process.env[ROLLBACK_TARGET_ENV] = priorTarget;
    else delete process.env[ROLLBACK_TARGET_ENV];
    if (priorVerify !== undefined) process.env.HOLO_VERIFY_BASE_URL = priorVerify;
    else delete process.env.HOLO_VERIFY_BASE_URL;
    if (priorSoak !== undefined) process.env.HOLO_SOAK_BASE_URL = priorSoak;
    else delete process.env.HOLO_SOAK_BASE_URL;
    if (priorPlatform !== undefined) process.env.PLATFORM_URL = priorPlatform;
    else delete process.env.PLATFORM_URL;
    if (priorVerifyPid !== undefined) process.env.HOLO_VERIFY_PID = priorVerifyPid;
    else delete process.env.HOLO_VERIFY_PID;
  });

  it('TC-3: cutover:rollback-repoint is a registered executable command', () => {
    const help = holo(['cutover:rollback-repoint', '--json'], {
      ...process.env,
      HOLO_SECRETS_PATH: DISPOSABLE_SECRETS,
    });
    evidence('tc3-cli-registered.json', help);
    const combined = `${help.stdout}\n${help.stderr}`;
    expect(combined.includes('unknown command: cutover:rollback-repoint')).toBe(false);
    const parsed = JSON.parse(help.stdout || help.stderr || '{}') as {
      ok?: boolean;
      error?: { code?: string } | string;
      repointed?: boolean;
    };
    expect(parsed.ok === true || parsed.ok === false || parsed.error != null).toBe(true);
  }, 60_000);

  it('AC-3 executable-repoint: re-points to convex-frozen with auditable config evidence', async () => {
    const { watermarkPath, auditPath } = seedEligibleFixture({ withAcceptedWrite: false });
    const reportPath = resolve(D0605, 'rollback-repoint-report.json');
    const configPath = defaultDataPlaneConfigPath(REPO_ROOT);

    // R3-H03: pre-existing serving process must be up before repoint
    liveServing = await startPreexistingServing(DISPOSABLE_SECRETS);
    process.env.HOLO_VERIFY_BASE_URL = liveServing.baseUrl;
    if (liveServing.pid) process.env.HOLO_VERIFY_PID = String(liveServing.pid);

    const report = await runRollbackRepoint({
      reportPath,
      configPath,
      auditPath,
      watermarkPath,
      secretsPath: DISPOSABLE_SECRETS,
      baseUrl: liveServing.baseUrl,
    });
    evidence('rollback-repoint-report.json', report);
    evidence('ac-3-executable-repoint.json', report);
    evidence('r2-c04-repoint-report.json', report, R2_EVIDENCE);
    evidence('r3-h03-ac3-repoint-report.json', report, R3_H03_EVIDENCE);

    expect(report.ok).toBe(true);
    expect(report.repointed).toBe(true);
    expect(report.target).toBe(TARGET_CONVEX_FROZEN);
    expect(report.data_plane).toBe('convex');
    expect(report.target_kind).toBe('convex');
    expect(report.precondition.ok).toBe(true);
    expect(report.precondition.accepted_post_export_writes).toBe(0);
    expect(report.config.path).toBe(configPath);
    expect(report.config.digest_sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(report.configured_target.length).toBeGreaterThanOrEqual(8);
    expect(report.configured_target).toBe(DISPOSABLE_SECRETS);
    expect(report.acknowledgements.length).toBeGreaterThanOrEqual(1);
    expect(report.acknowledgements.every((a) => a.preexisting === true)).toBe(true);
    expect(report.acknowledgements.some((a) => a.kind === 'network_health')).toBe(true);
    expect(report.acknowledgements.every(isAuthorizingRollbackAck)).toBe(true);
    expect(existsSync(configPath)).toBe(true);

    const secrets = loadSecretsFile(DISPOSABLE_SECRETS);
    expect(secrets.HOLO_DATA_PLANE).toBe('convex');
    expect(secrets.HOLO_ROLLBACK_TARGET).toBe(TARGET_CONVEX_FROZEN);

    const cfg = JSON.parse(readFileSync(configPath, 'utf8')) as {
      target: string;
      convex_deployment_deleted: boolean;
      configured_target?: string;
    };
    evidence('ac-3-data-plane-config.json', cfg);
    expect(cfg.target).toBe(TARGET_CONVEX_FROZEN);
    expect(cfg.convex_deployment_deleted).toBe(false);
    expect(existsSync(resolve(REPO_ROOT, 'convex'))).toBe(true);

    // CLI path (registered command → serving control-plane + pre-existing URL)
    if (liveServing) {
      await liveServing.stop();
      liveServing = undefined;
    }
    seedDisposableSecrets();
    liveServing = await startPreexistingServing(DISPOSABLE_SECRETS);
    const cli = holo(
      [
        'cutover:rollback-repoint',
        '--json',
        '--etl-report',
        watermarkPath,
        '--output',
        resolve(EVIDENCE, 'rollback-repoint-cli.json'),
      ],
      {
        ...process.env,
        HOLO_SECRETS_PATH: DISPOSABLE_SECRETS,
        HOLO_VERIFY_BASE_URL: liveServing.baseUrl,
        PLATFORM_URL: liveServing.baseUrl,
        ...(liveServing.pid ? { HOLO_VERIFY_PID: String(liveServing.pid) } : {}),
      }
    );
    evidence('ac-3-cli.json', cli);
    evidence('r2-c04-cli.json', cli, R2_EVIDENCE);
    evidence('r3-h03-ac3-cli.json', cli, R3_H03_EVIDENCE);
    expect(cli.status).toBe(0);
    const parsed = JSON.parse(cli.stdout) as {
      ok: boolean;
      repointed: boolean;
      target: string;
      data_plane: string;
      configured_target: string;
      acknowledgements: Array<{ kind: string; preexisting?: boolean }>;
    };
    expect(parsed.ok).toBe(true);
    expect(parsed.repointed).toBe(true);
    expect(parsed.target).toBe(TARGET_CONVEX_FROZEN);
    expect(parsed.data_plane).toBe('convex');
    expect(parsed.configured_target.length).toBeGreaterThanOrEqual(8);
    expect(parsed.acknowledgements.length).toBeGreaterThanOrEqual(1);
    expect(parsed.acknowledgements.every((a) => a.preexisting === true)).toBe(true);
  }, 120_000);

  it('AC-4 no-accepted-post-export-write-precondition: refuses when writes accepted after export', async () => {
    const { watermarkPath, auditPath } = seedEligibleFixture({ withAcceptedWrite: true });
    const configPath = defaultDataPlaneConfigPath(REPO_ROOT);
    writeFileSync(
      configPath,
      `${JSON.stringify({ target: 'postgres-soak', data_plane: 'postgres' }, null, 2)}\n`,
      'utf8'
    );
    const prior = readFileSync(configPath, 'utf8');
    // Snapshot secrets prior to refuse
    const priorSecretsBody = readFileSync(DISPOSABLE_SECRETS, 'utf8');

    const report = await runRollbackRepoint({
      reportPath: resolve(D0605, 'rollback-repoint-report-ineligible.json'),
      configPath,
      auditPath,
      watermarkPath,
      secretsPath: DISPOSABLE_SECRETS,
    });
    evidence('ac-4-post-export-refused.json', report);
    evidence('r2-c04-post-export-refused.json', report, R2_EVIDENCE);

    expect(report.ok).toBe(false);
    expect(report.repointed).toBe(false);
    expect(report.error?.code).toBe(POST_EXPORT_WRITE_ACCEPTED);
    expect(report.precondition.accepted_post_export_writes).toBeGreaterThan(0);
    expect(report.acknowledgements.length).toBe(0);
    expect(readFileSync(configPath, 'utf8')).toBe(prior);
    // Control-plane must not have been repointed
    expect(readFileSync(DISPOSABLE_SECRETS, 'utf8')).toBe(priorSecretsBody);

    const cli = holo(
      [
        'cutover:rollback-repoint',
        '--json',
        '--etl-report',
        watermarkPath,
        '--output',
        resolve(EVIDENCE, 'rollback-repoint-cli-ineligible.json'),
      ],
      { ...process.env, HOLO_SECRETS_PATH: DISPOSABLE_SECRETS }
    );
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

  it('R2-C04 / R3-H03 live-ack: pre-existing serving /health observes data_plane convex', async () => {
    const { watermarkPath, auditPath } = seedEligibleFixture({ withAcceptedWrite: false });
    liveServing = await startPreexistingServing(DISPOSABLE_SECRETS);
    if (liveServing.pid) process.env.HOLO_VERIFY_PID = String(liveServing.pid);

    const report = await runRollbackRepoint({
      reportPath: resolve(R2_EVIDENCE, 'live-ack-report.json'),
      auditPath,
      watermarkPath,
      secretsPath: DISPOSABLE_SECRETS,
      baseUrl: liveServing.baseUrl,
    });
    evidence('r2-c04-live-ack-report.json', report, R2_EVIDENCE);
    evidence('r3-h03-live-ack-report.json', report, R3_H03_EVIDENCE);

    expect(report.ok).toBe(true);
    expect(report.repointed).toBe(true);
    expect(report.acknowledgements.length).toBeGreaterThanOrEqual(1);
    expect(report.acknowledgements.some((a) => a.kind === 'network_health')).toBe(true);
    expect(report.acknowledgements.every((a) => a.preexisting === true)).toBe(true);
    // Self-created createHonoApp must never appear as authorizing ack
    expect(
      report.acknowledgements.some(
        (a) => a.kind === 'serving_health' || a.source.includes('createHonoApp')
      )
    ).toBe(false);
    expect(
      report.acknowledgements.some(
        (a) => a.observed_data_plane === 'convex' || a.observed_target === TARGET_CONVEX_FROZEN
      )
    ).toBe(true);

    // Force durable re-read and probe real Hono /health (diagnostic only — not the oracle)
    delete process.env[DATA_PLANE_ENV];
    delete process.env[ROLLBACK_TARGET_ENV];
    process.env.HOLO_SECRETS_PATH = DISPOSABLE_SECRETS;
    const observed = resolveObservedDataPlane(process.env, DISPOSABLE_SECRETS);
    expect(observed.data_plane).toBe('convex');
    expect(observed.target).toBe(TARGET_CONVEX_FROZEN);
    expect(observed.source).toBe('secrets');

    const app = createHonoApp();
    const res = await app.request('http://local.test/health');
    const body = (await res.json()) as {
      data_plane?: string | null;
      target?: string | null;
      rollback?: { target?: string | null };
    };
    evidence('r2-c04-health-observe.json', { status: res.status, body, observed }, R2_EVIDENCE);
    expect(body.data_plane === 'convex' || body.target === TARGET_CONVEX_FROZEN).toBe(true);
    expect(
      body.target === TARGET_CONVEX_FROZEN || body.rollback?.target === TARGET_CONVEX_FROZEN
    ).toBe(true);

    // Pre-existing network unit still observes convex after repoint
    const netRes = await fetch(`${liveServing.baseUrl}/health`);
    const netBody = (await netRes.json()) as {
      data_plane?: string | null;
      target?: string | null;
    };
    evidence(
      'r3-h03-network-health-observe.json',
      { status: netRes.status, body: netBody, baseUrl: liveServing.baseUrl, pid: liveServing.pid },
      R3_H03_EVIDENCE
    );
    expect(netBody.data_plane === 'convex' || netBody.target === TARGET_CONVEX_FROZEN).toBe(true);

    // Cross-process consumer exists outside cutover producers
    const rg = spawnSync(
      'rg',
      [
        '-n',
        'resolveObservedDataPlane|HOLO_DATA_PLANE',
        'services/platform/src/http/health.ts',
        'services/platform/src/cutover/soak-fence.ts',
      ],
      { cwd: REPO_ROOT, encoding: 'utf8' }
    );
    evidence('r2-c04-runtime-consumer-rg.txt', rg.stdout || rg.stderr, R2_EVIDENCE);
    expect(rg.status).toBe(0);
    expect((rg.stdout || '').includes('resolveObservedDataPlane')).toBe(true);
  }, 120_000);

  it('R2-C04: .tmp data-plane-config alone is not the configured_target success oracle', async () => {
    const { watermarkPath, auditPath } = seedEligibleFixture({ withAcceptedWrite: false });
    liveServing = await startPreexistingServing(DISPOSABLE_SECRETS);
    const report = await runRollbackRepoint({
      reportPath: resolve(R2_EVIDENCE, 'oracle-report.json'),
      auditPath,
      watermarkPath,
      secretsPath: DISPOSABLE_SECRETS,
      baseUrl: liveServing.baseUrl,
    });
    // configured_target must be the secrets control-plane path, not .tmp config
    expect(report.configured_target).toBe(DISPOSABLE_SECRETS);
    expect(report.configured_target.includes('data-plane-config.json')).toBe(false);
    expect(report.config.path.includes('data-plane-config.json')).toBe(true);
    expect(report.acknowledgements.length).toBeGreaterThanOrEqual(1);
    expect(report.repointed).toBe(true);
    evidence('r2-c04-oracle-contract.json', report, R2_EVIDENCE);
  }, 120_000);

  it('R3-H03 negative: self-created createHonoApp / no pre-existing URL ⇒ repointed:false', async () => {
    const { watermarkPath, auditPath } = seedEligibleFixture({ withAcceptedWrite: false });
    // Explicitly no base URL / no live serving — createHonoApp in-process must not greenwash.
    delete process.env.HOLO_VERIFY_BASE_URL;
    delete process.env.HOLO_SOAK_BASE_URL;
    delete process.env.PLATFORM_URL;

    const report = await runRollbackRepoint({
      reportPath: resolve(R3_H03_EVIDENCE, 'self-created-ack-refused.json'),
      auditPath,
      watermarkPath,
      secretsPath: DISPOSABLE_SECRETS,
    });
    evidence('r3-h03-self-created-ack-refused.json', report, R3_H03_EVIDENCE);
    evidence(
      'r3-h03-self-created-ack-refused.json',
      report,
      resolve(SPRINT_EVIDENCE, 'REDHAT-FIX-S29-R3-H03')
    );

    // Control-plane may still be written, but repointed must stay false.
    expect(report.repointed).toBe(false);
    expect(report.ok).toBe(false);
    expect(report.error?.code).toBe(LIVE_ACK_MISSING);
    expect(report.acknowledgements.length).toBe(0);
    expect(report.error?.message ?? '').toMatch(/pre-existing|createHonoApp|R3-H03/i);

    // Prove createHonoApp would have observed convex (old false oracle) but is not used.
    delete process.env[DATA_PLANE_ENV];
    delete process.env[ROLLBACK_TARGET_ENV];
    process.env.HOLO_SECRETS_PATH = DISPOSABLE_SECRETS;
    const app = createHonoApp();
    const res = await app.request('http://local.test/health');
    const body = (await res.json()) as { data_plane?: string | null; target?: string | null };
    evidence(
      'r3-h03-createhonoapp-would-observe.json',
      { status: res.status, body, note: 'must not authorize repointed:true' },
      R3_H03_EVIDENCE
    );
    expect(body.data_plane === 'convex' || body.target === TARGET_CONVEX_FROZEN).toBe(true);
    // Yet report stayed fail-closed
    expect(report.repointed).toBe(false);
  }, 120_000);

  it('R3-H03 negative: base URL started after would-be write is not pre-existing', async () => {
    const { watermarkPath, auditPath } = seedEligibleFixture({ withAcceptedWrite: false });
    // Point at a port that is not listening yet → preflight fails → repointed:false
    const deadPort = await freePort();
    const deadUrl = `http://127.0.0.1:${deadPort}`;

    const report = await runRollbackRepoint({
      reportPath: resolve(R3_H03_EVIDENCE, 'not-listening-preflight.json'),
      auditPath,
      watermarkPath,
      secretsPath: DISPOSABLE_SECRETS,
      baseUrl: deadUrl,
    });
    evidence('r3-h03-not-listening-preflight.json', report, R3_H03_EVIDENCE);

    expect(report.repointed).toBe(false);
    expect(report.ok).toBe(false);
    expect(report.error?.code).toBe(LIVE_ACK_MISSING);
    expect(report.error?.message ?? '').toMatch(/not listening before control-plane write/i);
  }, 60_000);
});

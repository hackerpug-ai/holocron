/**
 * GATE-FIX-S28R3-QA1 — Run-isolated gate scratch + host-accessible volume-bound fire-drill.
 *
 * AC-1: gate-plan step1 scratch paths include ${GATE_RUN_ID:-manual}
 * AC-2: gate-plan step6 similarly isolated
 * AC-3: runner resolves host-writable execution path when Mountpoint is /var/lib/docker/...
 * AC-4: refuse unbound .tmp/REDHAT-FIX-H2/step3-* as volume destination
 * AC-5: step2 DEPENDENCY-S28-R2-RO residual preserved
 * AC-6: PLATFORM_IT against real Docker for volume path resolve
 *
 * Run:
 *   PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/sprint28-s28r3-qa1-gate-fix.test.ts
 *   pnpm vitest run services/platform/tests/integration/sprint28-s28r3-qa1-gate-fix.test.ts
 */
import { spawnSync } from 'node:child_process';
import {
  accessSync,
  constants,
  existsSync,
  mkdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PLATFORM_IT } from '../../../../tests/integration/service/harness';

const itLive = PLATFORM_IT ? it : it.skip;

const REPO_ROOT = resolve(import.meta.dirname, '../../../..');
const GATE_PLAN = resolve(
  REPO_ROOT,
  '.spec/prds/mk6-migration/tasks/sprint-28-point-in-time-restore-and-fresh-hardware-fire-drill/gate-plan.json'
);
const RUNNER = resolve(REPO_ROOT, 'scripts/run-fire-drill-on-fresh-target.sh');
const PROVISION = resolve(REPO_ROOT, 'scripts/provision-fresh-restore-target.sh');
const HOLO_CLI = resolve(REPO_ROOT, 'services/platform/src/cli/holo.ts');
const EVIDENCE_DIR = resolve(REPO_ROOT, '.tmp/GATE-FIX-S28R3-QA1');

type GateStep = {
  n: number;
  text?: string;
  literal_cmd?: string;
  assertion?: {
    require_all_regex?: string[];
    must_not_observe?: string[];
    notes?: string;
  };
};

type GatePlan = {
  steps?: GateStep[];
};

function writeEvidence(name: string, body: unknown): void {
  mkdirSync(EVIDENCE_DIR, { recursive: true });
  const path = resolve(EVIDENCE_DIR, name);
  const text = typeof body === 'string' ? body : JSON.stringify(body, null, 2);
  writeFileSync(path, text.endsWith('\n') ? text : `${text}\n`, 'utf8');
}

function loadPlan(): GatePlan {
  expect(existsSync(GATE_PLAN), `gate-plan missing: ${GATE_PLAN}`).toBe(true);
  return JSON.parse(readFileSync(GATE_PLAN, 'utf8')) as GatePlan;
}

function stepOf(plan: GatePlan, n: number): GateStep {
  const step = (plan.steps ?? []).find((s) => s.n === n);
  expect(step, `gate-plan step ${n} required`).toBeTruthy();
  return step as GateStep;
}

function dockerAvailable(): boolean {
  const info = spawnSync('docker', ['info'], { encoding: 'utf8', timeout: 15_000 });
  return info.status === 0;
}

function hostPathWritable(p: string): boolean {
  try {
    if (!existsSync(p)) return false;
    accessSync(p, constants.W_OK);
    const probe = resolve(p, `.qa1-write-probe-${process.pid}`);
    writeFileSync(probe, 'ok');
    try {
      unlinkSync(probe);
    } catch {
      /* ignore */
    }
    return true;
  } catch {
    return false;
  }
}

describe('GATE-FIX-S28R3-QA1 run isolation + host-accessible volumes (always)', () => {
  it('AC-1: gate-plan step1 literal_cmd is run-isolated via GATE_RUN_ID', () => {
    const plan = loadPlan();
    const step1 = stepOf(plan, 1);
    const cmd = String(step1.literal_cmd ?? '');
    writeEvidence('ac1-step1-literal_cmd.txt', cmd);

    // Must include GATE_RUN_ID (or equivalent) in scratch path — not sole fixed shared path.
    expect(cmd).toMatch(/GATE_RUN_ID/);
    expect(cmd).toMatch(
      /\.tmp\/REDHAT-FIX-H2\/\$\{GATE_RUN_ID:-manual\}\/step1-scratch|\.tmp\/REDHAT-FIX-H2\/"\$\{GATE_RUN_ID:-manual\}"\/step1-scratch|\.tmp\/REDHAT-FIX-H2\/\$\{GATE_RUN_ID:-manual\}/
    );
    // Fixed sole path without run id is the defect.
    expect(cmd).not.toMatch(
      /--scratch\s+\.tmp\/REDHAT-FIX-H2\/step1-scratch(?!\/)|mkdir -p \.tmp\/REDHAT-FIX-H2\/step1-scratch(?!\/)/
    );
    // Domain claims preserved.
    expect(cmd).toMatch(/restore\s+--pitr|restore --pitr/);
    expect(cmd).toMatch(/unknown flag: --pitr/);
  });

  it('AC-2: gate-plan step6 literal_cmd is run-isolated via GATE_RUN_ID', () => {
    const plan = loadPlan();
    const step6 = stepOf(plan, 6);
    const cmd = String(step6.literal_cmd ?? '');
    writeEvidence('ac2-step6-literal_cmd.txt', cmd);

    expect(cmd).toMatch(/GATE_RUN_ID/);
    expect(cmd).toMatch(
      /\.tmp\/REDHAT-FIX-H2\/\$\{GATE_RUN_ID:-manual\}\/step6-scratch|\.tmp\/REDHAT-FIX-H2\/"\$\{GATE_RUN_ID:-manual\}"\/step6-scratch|\.tmp\/REDHAT-FIX-H2\/\$\{GATE_RUN_ID:-manual\}/
    );
    expect(cmd).not.toMatch(
      /--scratch\s+\.tmp\/REDHAT-FIX-H2\/step6-scratch(?!\/)|mkdir -p \.tmp\/REDHAT-FIX-H2\/step6-scratch(?!\/)/
    );
    // Empty-chain fail-closed preserved.
    expect(cmd).toMatch(/EMPTY_PREFIX|R2_PGBACKREST_PREFIX|empty/);
    expect(cmd).toMatch(/no base backup available|backup chain missing/);
  });

  it('AC-3/AC-4 static: runner resolves host-writable volume path; refuses unbound H2 step3', () => {
    expect(existsSync(RUNNER)).toBe(true);
    const src = readFileSync(RUNNER, 'utf8');
    writeEvidence('ac3-runner-source-snip.txt', src.slice(0, 4000));

    // Host-accessible resolution (not Mountpoint-only).
    expect(src).toMatch(
      /host_execution|host-bind-device|host-staging-bind|host-mountpoint|execution_mode/
    );
    expect(src).toMatch(/Options|driver_opts|device|host_staging_pgdata|host_staging/);
    // Must not solely pass daemon Mountpoint without host-writability check.
    expect(src).toMatch(/writable|write-probe|host_writable|can.?write|touch /i);
    // Refuse unbound H2 step3 paths.
    expect(src).toMatch(/REDHAT-FIX-H2\/step3|refuse.*step3|unbound/i);
    // Attestation schema + volume names.
    expect(src).toMatch(/holo\.fresh-target\.fire-drill-attestation\.v1/);
    expect(src).toMatch(/volumes/);
    // Full fire-drill still present.
    expect(src).toMatch(/restore:fire-drill/);
  });

  it('AC-3 static: provision uses bind-backed local volumes for host staging', () => {
    expect(existsSync(PROVISION)).toBe(true);
    const src = readFileSync(PROVISION, 'utf8');
    writeEvidence('ac3-provision-source-snip.txt', src.slice(0, 2500));
    // Bind-backed volume pattern.
    expect(src).toMatch(/driver_opts/);
    expect(src).toMatch(/type:\s*none|type=none/);
    expect(src).toMatch(/o:\s*bind|o=bind/);
    expect(src).toMatch(/device:/);
    expect(src).toMatch(/HOST_PGDATA_STAGING|host_staging_pgdata/);
  });

  it('AC-3 static: holo.ts --fresh-target does not pass only inaccessible Mountpoint', () => {
    const src = readFileSync(HOLO_CLI, 'utf8');
    // Must resolve host-accessible path (device / staging / writability), not Mountpoint alone.
    expect(src).toMatch(/fresh-target|freshTarget/);
    expect(src).toMatch(
      /host_execution|host-bind-device|host-staging|Options|device|writable|writeProbe|hostWritable/i
    );
    writeEvidence('ac3-holo-fresh-target-resolve.txt', {
      has_fresh_target: /freshTarget|fresh-target/.test(src),
      has_host_resolve: /host_execution|host-bind|device|writable/i.test(src),
    });
  });

  it('AC-5: step2 still mentions DEPENDENCY-S28-R2-RO / REQUIRE_LIVE_R2_RO / no ro-test default green', () => {
    const plan = loadPlan();
    const step2 = stepOf(plan, 2);
    const cmd = String(step2.literal_cmd ?? '');
    writeEvidence('ac5-step2-literal_cmd.txt', cmd);

    expect(cmd).toMatch(/REQUIRE_LIVE_R2_RO=1/);
    expect(cmd).toMatch(/DEPENDENCY-S28-R2-RO|R2_RESTORE_/);
    expect(cmd).not.toMatch(/R2_ACCESS_KEY_ID="\$\{R2_ACCESS_KEY_ID:-ro-test\}"/);
    expect(cmd).not.toMatch(/R2_SECRET_ACCESS_KEY="\$\{R2_SECRET_ACCESS_KEY:-ro-test\}"/);
    expect(cmd).not.toMatch(/:-ro-test"/);
    expect(cmd).toMatch(/prove-r2-readonly\.sh|prove-isolation\.sh/);
  });

  it('AC-1/AC-2 scripts syntax clean', () => {
    for (const script of [RUNNER, PROVISION]) {
      const syntax = spawnSync('bash', ['-n', script], { encoding: 'utf8' });
      expect(syntax.status, `${script}: ${syntax.stderr}`).toBe(0);
    }
  });
});

describe('GATE-FIX-S28R3-QA1 PLATFORM_IT host-accessible volume resolve', () => {
  itLive(
    'AC-3/AC-6: provision + resolve-only → host_execution writable; never /var/lib/docker host mkdir',
    () => {
      if (!dockerAvailable()) {
        throw new Error('docker required for PLATFORM_IT GATE-FIX-S28R3-QA1');
      }
      expect(existsSync(PROVISION)).toBe(true);
      expect(existsSync(RUNNER)).toBe(true);

      const host = `s28r3-qa1-${Date.now().toString(36)}`;
      const staging = resolve(REPO_ROOT, '.tmp/GATE-FIX-S28R3-QA1/fresh-restore');
      const pgPort = String(57000 + (Date.now() % 2000));

      const provision = spawnSync(
        'bash',
        [PROVISION, '--host', host, '--skip-isolation', '--pg-port', pgPort],
        {
          cwd: REPO_ROOT,
          encoding: 'utf8',
          timeout: 180_000,
          env: {
            ...process.env,
            STAGING_ROOT: staging,
            ALLOW_PLACEHOLDER_R2_RO: '1',
            R2_RESTORE_ACCESS_KEY_ID: '',
            R2_RESTORE_SECRET_ACCESS_KEY: '',
            MINI_HOST: '203.0.113.1',
            RESTORE_PG_PORT: pgPort,
          },
        }
      );
      writeEvidence('platform-it-provision.json', {
        status: provision.status,
        stdout: (provision.stdout ?? '').slice(0, 4000),
        stderr: (provision.stderr ?? '').slice(0, 2000),
      });
      expect(provision.status, provision.stderr ?? provision.stdout).toBe(0);

      // Volume Options.device should be host staging (bind-backed).
      const volInspect = spawnSync('docker', ['volume', 'inspect', `${host}-pgdata`], {
        encoding: 'utf8',
        timeout: 15_000,
      });
      writeEvidence('platform-it-volume-inspect.json', volInspect.stdout ?? '');
      expect(volInspect.status).toBe(0);
      const volJson = JSON.parse(volInspect.stdout ?? '[]') as Array<{
        Mountpoint?: string;
        Options?: { device?: string; o?: string; type?: string } | null;
      }>;
      const opts = volJson[0]?.Options ?? null;
      expect(opts, 'bind-backed volume Options required').toBeTruthy();
      expect(String(opts?.o ?? '')).toMatch(/bind/);
      const device = String(opts?.device ?? '');
      expect(device.length).toBeGreaterThan(0);
      expect(hostPathWritable(device), `device must be host-writable: ${device}`).toBe(true);

      const att = resolve(EVIDENCE_DIR, `attestation-${host}.json`);
      const resolveOnly = spawnSync(
        'bash',
        [RUNNER, '--host', host, '--resolve-only', '--attestation', att],
        {
          cwd: REPO_ROOT,
          encoding: 'utf8',
          timeout: 60_000,
        }
      );
      writeEvidence('platform-it-resolve-only.json', {
        status: resolveOnly.status,
        stdout: (resolveOnly.stdout ?? '').slice(0, 4000),
        stderr: (resolveOnly.stderr ?? '').slice(0, 2000),
      });
      expect(resolveOnly.status, resolveOnly.stderr ?? resolveOnly.stdout).toBe(0);
      expect(existsSync(att)).toBe(true);

      const body = JSON.parse(readFileSync(att, 'utf8')) as {
        ok?: boolean;
        schema?: string;
        volumes?: { pgdata?: string; blob?: string };
        mountpoints?: { scratch?: string; blob?: string };
        daemon_mountpoint?: { scratch?: string; blob?: string };
        host_execution?: { scratch?: string; blob?: string };
        execution_mode?: string;
        scratch?: string;
        blobDir?: string;
      };
      writeEvidence('platform-it-attestation-parsed.json', body);

      expect(body.ok).toBe(true);
      expect(body.schema).toBe('holo.fresh-target.fire-drill-attestation.v1');
      expect(body.volumes?.pgdata).toBe(`${host}-pgdata`);
      expect(body.volumes?.blob).toBe(`${host}-blobs`);

      const hostScratch =
        body.host_execution?.scratch ??
        (body.execution_mode && body.execution_mode !== 'host-mountpoint'
          ? body.scratch
          : undefined) ??
        body.scratch;
      const hostBlob =
        body.host_execution?.blob ??
        (body.execution_mode && body.execution_mode !== 'host-mountpoint'
          ? body.blobDir
          : undefined) ??
        body.blobDir;

      expect(hostScratch, 'host_execution.scratch required').toBeTruthy();
      expect(hostBlob, 'host_execution.blob required').toBeTruthy();

      // CRITICAL: must not be inaccessible daemon path for host Bun.
      expect(String(hostScratch)).not.toMatch(/^\/var\/lib\/docker\//);
      expect(String(hostBlob)).not.toMatch(/^\/var\/lib\/docker\//);
      expect(String(hostScratch)).not.toMatch(/\.tmp\/REDHAT-FIX-H2\/step3/);
      expect(String(hostBlob)).not.toMatch(/\.tmp\/REDHAT-FIX-H2\/step3/);

      expect(
        hostPathWritable(String(hostScratch)),
        `host scratch must be writable: ${hostScratch}`
      ).toBe(true);
      expect(hostPathWritable(String(hostBlob)), `host blob must be writable: ${hostBlob}`).toBe(
        true
      );

      expect(body.execution_mode).toMatch(/host-mountpoint|host-bind-device|host-staging-bind/);

      // Daemon mountpoint may still be /var/lib/docker — that's fine when attested separately.
      const daemonScratch = body.daemon_mountpoint?.scratch ?? body.mountpoints?.scratch ?? null;
      if (daemonScratch) {
        expect(String(daemonScratch)).not.toMatch(/REDHAT-FIX-H2\/step3/);
      }

      // Cleanup
      spawnSync('docker', ['rm', '-f', host], { encoding: 'utf8', timeout: 30_000 });
      spawnSync('docker', ['volume', 'rm', '-f', `${host}-pgdata`, `${host}-blobs`], {
        encoding: 'utf8',
        timeout: 30_000,
      });
    },
    300_000
  );
});

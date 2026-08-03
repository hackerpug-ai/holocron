/**
 * GATE-FIX-S28R3-QA4 — Baseline-only fresh-target blobs, policy Action semantics,
 * step2 GATE_RUN_ID preflight, full-run report contract.
 *
 * Covers Terra review red-hat-20260729T095141Z:
 *   C-1 no live source-blob hash on freshTarget · H-1 NotAction/s3-star/PutObject refuse
 *   H-2 step2 assert-gate-run-id + run-id evidence paths · M-1 report parity fields
 *
 * Run:
 *   PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/sprint28-s28r3-qa4-gate-fix.test.ts
 */

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { PLATFORM_IT } from '../../../../tests/integration/service/harness';
import {
  buildRestoreCredentialPolicy,
  defaultBucketName,
  defaultPgbackrestPrefix,
} from '../../src/backup/config.ts';

const itLive = PLATFORM_IT ? it : it.skip;

const REPO_ROOT = resolve(import.meta.dirname, '../../../..');
const SPRINT_DIR = resolve(
  REPO_ROOT,
  '.spec/prds/mk6-migration/tasks/sprint-28-point-in-time-restore-and-fresh-hardware-fire-drill'
);
const GATE_PLAN = resolve(SPRINT_DIR, 'gate-plan.json');
const HUMAN_GATE = resolve(SPRINT_DIR, 'HUMAN-GATE.md');
const RUNNER = resolve(REPO_ROOT, 'scripts/run-fire-drill-on-fresh-target.sh');
const PROVISION = resolve(REPO_ROOT, 'scripts/provision-fresh-restore-target.sh');
const PROVE_ISOLATION = resolve(REPO_ROOT, 'scripts/prove-isolation.sh');
const ASSERT_RUN_ID = resolve(REPO_ROOT, 'scripts/assert-gate-run-id.sh');
const FIRE_DRILL_SRC = resolve(REPO_ROOT, 'services/platform/src/backup/fire-drill.ts');
const EVIDENCE_DIR = resolve(REPO_ROOT, '.tmp/GATE-FIX-S28R3-QA4');

const dockerCleanup: Array<{ host: string; volumes?: string[] }> = [];

afterEach(() => {
  while (dockerCleanup.length > 0) {
    const item = dockerCleanup.pop()!;
    spawnSync('docker', ['rm', '-f', item.host], { encoding: 'utf8', timeout: 30_000 });
    const vols = item.volumes ?? [`${item.host}-pgdata`, `${item.host}-blobs`];
    spawnSync('docker', ['volume', 'rm', '-f', ...vols], {
      encoding: 'utf8',
      timeout: 30_000,
    });
    spawnSync('docker', ['network', 'rm', '-f', `${item.host}-net`], {
      encoding: 'utf8',
      timeout: 30_000,
    });
  }
});

type GateStep = {
  n: number;
  text?: string;
  literal_cmd?: string;
  assertion?: { notes?: string };
};

type GatePlan = {
  steps?: GateStep[];
  notes?: string[];
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

const WRITER_AK = 'qa4-writer-akid-deliberate-identity';
const WRITER_SK = 'qa4-writer-sk-deliberate-identity-value';
const RESTORE_AK = 'qa4-restore-akid-deliberate-identity';
const RESTORE_SK = 'qa4-restore-sk-deliberate-identity-value';

function isolationBaseEnv(policy: string): NodeJS.ProcessEnv {
  const bucket = defaultBucketName();
  const prefix = defaultPgbackrestPrefix();
  return {
    ...process.env,
    MINI_HOST: '203.0.113.1',
    MINI_IPV4: '203.0.113.1',
    MINI_IPV6: '2001:db8::1',
    MINI_TAILNET_IP: '203.0.113.2',
    MINI_LAN_IP: '203.0.113.3',
    MINI_DNS_ALIASES: 'mini.invalid',
    MINI_SOCKET_DEFAULTS: '0',
    MINI_UNIX_SOCKETS: '/tmp/.s.PGSQL.5432-qa4-absent',
    TARGET_ATTESTED_IDENTITY: 'target-vm-uuid-qa4',
    MINI_ATTESTED_IDENTITY: 'mini-hw-uuid-qa4',
    REQUIRE_ATTESTED_IDENTITY: '1',
    NC_TIMEOUT_SEC: '1',
    R2_ACCESS_KEY_ID: RESTORE_AK,
    R2_SECRET_ACCESS_KEY: RESTORE_SK,
    R2_RESTORE_ACCESS_KEY_ID: RESTORE_AK,
    R2_RESTORE_SECRET_ACCESS_KEY: RESTORE_SK,
    R2_CREDENTIAL_KIND: 'object-read-only',
    R2_BUCKET_NAME: bucket,
    R2_PGBACKREST_PREFIX: prefix,
    R2_ENDPOINT: '',
    REQUIRE_LIVE_R2_RO: '0',
    R2_CREDENTIAL_POLICY: policy,
  };
}

describe('GATE-FIX-S28R3-QA4 always-on contract', () => {
  it('C-1 source: runner refuses --source-blob-root on fresh-target path', () => {
    const src = readFileSync(RUNNER, 'utf8');
    expect(src).toMatch(/source-blob-root/);
    expect(src).toMatch(/refuses --source-blob-root|refuse.*source-blob-root|baseline-only/i);
    // Must not unconditionally forward SOURCE_BLOB_ROOT when set.
    expect(src).not.toMatch(
      /if \[\[ -n "\$SOURCE_BLOB_ROOT" \]\]; then\s*\n\s*ARGS\+=\(--source-blob-root/
    );
  });

  it('C-1 source: fire-drill freshTarget skips hashLocalBlobStore of live source', () => {
    const src = readFileSync(FIRE_DRILL_SRC, 'utf8');
    expect(src).toMatch(/fresh-target-baseline-only|GATE-FIX-S28R3-QA4\/C-1|baseline-only/);
    // freshTarget branch must set empty preBlobHashes without calling hashLocalBlobStore first.
    expect(src).toMatch(
      /isFreshTarget[\s\S]{0,400}fresh-target-baseline-only|if \(isFreshTarget\)[\s\S]{0,300}preBlobHashes/
    );
    // Must require baseline blob_manifest for fresh target.
    expect(src).toMatch(
      /fresh-target[\s\S]{0,200}blob_manifest_sha256|blob_manifest_sha256[\s\S]{0,200}fresh-target/i
    );
  });

  it('H-2: gate-plan step2 preflights GATE_RUN_ID and uses run-id evidence paths', () => {
    const step2 = String(stepOf(loadPlan(), 2).literal_cmd ?? '');
    // GATE-FIX-S28R3-QA22: absolute /bin/bash (not bare PATH bash)
    expect(step2.startsWith('set -euo pipefail; /bin/bash scripts/assert-gate-run-id.sh')).toBe(
      true
    );
    expect(step2).toMatch(/\.tmp\/REDHAT-FIX-S28R3\/\$\{GATE_RUN_ID\}/);
    expect(step2).toMatch(/step2-isolation\.txt/);
    expect(step2).toMatch(/step2-r2-readonly\.txt/);
    // Fixed shared paths without GATE_RUN_ID expansion must not appear.
    expect(step2).not.toMatch(/tee \.tmp\/REDHAT-FIX-S28R3\/step2-/);
    expect(step2).not.toMatch(/mkdir -p \.tmp\/REDHAT-FIX-S28R3;/);
    writeEvidence('h2-step2-cmd.txt', step2);
  });

  it('H-2: HUMAN-GATE fenced step2 matches plan (assert before mkdir)', () => {
    const planCmd = String(stepOf(loadPlan(), 2).literal_cmd ?? '');
    const hg = readFileSync(HUMAN_GATE, 'utf8');
    const re = /###\s+2\s+[^\n]*\n[\s\S]*?```bash\n([\s\S]*?)```/;
    const m = re.exec(hg);
    expect(m, 'HUMAN-GATE step2 fenced bash').toBeTruthy();
    const fenced = (m?.[1] ?? '').replace(/\n$/, '');
    expect(fenced).toBe(planCmd);
  });

  it('M-1 source: runner validates report contract after child exit 0', () => {
    const src = readFileSync(RUNNER, 'utf8');
    // GATE-FIX-S28R3-QA5: contract body lives in assert-fire-drill-report.sh; runner invokes it.
    expect(src).toMatch(/assert-fire-drill-report\.sh/);
    expect(src).toMatch(/report contract|GATE-FIX-S28R3-QA4\/M-1/i);
    const assertSrc = readFileSync(
      resolve(REPO_ROOT, 'scripts/assert-fire-drill-report.sh'),
      'utf8'
    );
    expect(assertSrc).toMatch(/POSTGRES_PARITY_PASS/);
    expect(assertSrc).toMatch(/LEDGER_CHECKSUM_MATCH/);
    expect(assertSrc).toMatch(/BLOB_PARITY_PASS/);
    expect(assertSrc).toMatch(/baseline_id|baseline_key/);
  });

  it('H-1: NotAction Allow fails overall RESULT', () => {
    const bucket = defaultBucketName();
    const prefix = defaultPgbackrestPrefix();
    const policy = JSON.stringify({
      Version: '2012-10-17',
      Statement: [
        {
          Effect: 'Allow',
          NotAction: ['s3:ListBucket', 's3:GetObject'],
          Resource: [`arn:aws:s3:::${bucket}`, `arn:aws:s3:::${bucket}/${prefix}/*`],
        },
      ],
    });
    const run = spawnSync('bash', [PROVE_ISOLATION], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      timeout: 60_000,
      env: isolationBaseEnv(policy),
    });
    const combined = `${run.stdout ?? ''}\n${run.stderr ?? ''}`;
    writeEvidence('h1-not-action.json', { status: run.status, combined: combined.slice(0, 4000) });
    expect(run.status, combined.slice(0, 800)).not.toBe(0);
    expect(combined).toMatch(/NotAction|not least-privilege|write|refuse/i);
    expect(combined).toMatch(/RESULT:\s+FAIL|AXIS r2_readonly:\s+FAIL/);
  }, 90_000);

  it('H-1: NotResource Allow fails overall RESULT', () => {
    const policy = JSON.stringify({
      Version: '2012-10-17',
      Statement: [
        {
          Effect: 'Allow',
          Action: ['s3:ListBucket', 's3:GetBucketLocation', 's3:GetObject'],
          NotResource: ['arn:aws:s3:::other-bucket'],
        },
      ],
    });
    const run = spawnSync('bash', [PROVE_ISOLATION], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      timeout: 60_000,
      env: isolationBaseEnv(policy),
    });
    const combined = `${run.stdout ?? ''}\n${run.stderr ?? ''}`;
    writeEvidence('h1-not-resource.json', {
      status: run.status,
      combined: combined.slice(0, 4000),
    });
    expect(run.status, combined.slice(0, 800)).not.toBe(0);
    expect(combined).toMatch(/NotResource|not least-privilege|refuse/i);
    expect(combined).toMatch(/RESULT:\s+FAIL|AXIS r2_readonly:\s+FAIL/);
  }, 90_000);

  it('H-1: s3:* Allow fails overall RESULT', () => {
    const bucket = defaultBucketName();
    const prefix = defaultPgbackrestPrefix();
    const policy = JSON.stringify({
      Version: '2012-10-17',
      Statement: [
        {
          Effect: 'Allow',
          Action: ['s3:*'],
          Resource: [`arn:aws:s3:::${bucket}`, `arn:aws:s3:::${bucket}/${prefix}/*`],
        },
      ],
    });
    const run = spawnSync('bash', [PROVE_ISOLATION], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      timeout: 60_000,
      env: isolationBaseEnv(policy),
    });
    const combined = `${run.stdout ?? ''}\n${run.stderr ?? ''}`;
    writeEvidence('h1-s3-star.json', { status: run.status, combined: combined.slice(0, 4000) });
    expect(run.status, combined.slice(0, 800)).not.toBe(0);
    expect(combined).toMatch(/s3:\*|wildcard|not in read-only allowlist|refuse/i);
    expect(combined).toMatch(/RESULT:\s+FAIL|AXIS r2_readonly:\s+FAIL/);
  }, 90_000);

  it('H-1: separate Allow with PutObject fails overall RESULT', () => {
    const bucket = defaultBucketName();
    const prefix = defaultPgbackrestPrefix();
    const policy = JSON.stringify({
      Version: '2012-10-17',
      Statement: [
        {
          Effect: 'Allow',
          Action: ['s3:ListBucket', 's3:GetBucketLocation'],
          Resource: [`arn:aws:s3:::${bucket}`],
        },
        {
          Effect: 'Allow',
          Action: ['s3:GetObject'],
          Resource: [`arn:aws:s3:::${bucket}/${prefix}/*`],
        },
        {
          Effect: 'Allow',
          Action: ['s3:PutObject'],
          Resource: [`arn:aws:s3:::${bucket}/${prefix}/*`],
        },
      ],
    });
    const run = spawnSync('bash', [PROVE_ISOLATION], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      timeout: 60_000,
      env: isolationBaseEnv(policy),
    });
    const combined = `${run.stdout ?? ''}\n${run.stderr ?? ''}`;
    writeEvidence('h1-put-object.json', { status: run.status, combined: combined.slice(0, 4000) });
    expect(run.status, combined.slice(0, 800)).not.toBe(0);
    expect(combined).toMatch(/PutObject|write\/admin|not in read-only allowlist|Put/i);
    expect(combined).toMatch(/RESULT:\s+FAIL|AXIS r2_readonly:\s+FAIL/);
  }, 90_000);

  it('H-1: exact-only policy still PASSes r2_readonly axis', () => {
    const bucket = defaultBucketName();
    const prefix = defaultPgbackrestPrefix();
    const exactOnly = JSON.stringify(buildRestoreCredentialPolicy(bucket, prefix));
    const run = spawnSync('bash', [PROVE_ISOLATION], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      timeout: 60_000,
      env: isolationBaseEnv(exactOnly),
    });
    const combined = `${run.stdout ?? ''}\n${run.stderr ?? ''}`;
    writeEvidence('h1-exact-pass.json', { status: run.status, combined: combined.slice(0, 4000) });
    expect(combined).toMatch(/AXIS r2_readonly:\s+PASS/);
    expect(combined).not.toMatch(/NotAction|bare bucket\/\*/i);
  }, 90_000);
});

describe('GATE-FIX-S28R3-QA4 C-1 / H-2 / M-1 live seams (PLATFORM_IT)', () => {
  itLive('H-2: unset GATE_RUN_ID step2 creates no shared evidence path', () => {
    const sharedIsolation = resolve(REPO_ROOT, '.tmp/REDHAT-FIX-S28R3/step2-isolation.txt');
    const sharedReadonly = resolve(REPO_ROOT, '.tmp/REDHAT-FIX-S28R3/step2-r2-readonly.txt');
    // Best-effort cleanup of any pre-existing shared leaks (not created by this test).
    if (existsSync(sharedIsolation)) rmSync(sharedIsolation, { force: true });
    if (existsSync(sharedReadonly)) rmSync(sharedReadonly, { force: true });

    const step2Like = spawnSync('bash', ['-c', String(stepOf(loadPlan(), 2).literal_cmd ?? '')], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      timeout: 30_000,
      env: {
        PATH: process.env.PATH,
        HOME: process.env.HOME,
        GATE_RUN_ID: undefined,
      },
    });
    const combined = `${step2Like.stdout ?? ''}\n${step2Like.stderr ?? ''}`;
    writeEvidence('h2-unset-step2.json', {
      status: step2Like.status,
      combined: combined.slice(0, 2000),
    });
    expect(step2Like.status).not.toBe(0);
    expect(combined).toMatch(/GATE_RUN_ID|allowlist|required|refuse|unset|empty/i);
    expect(existsSync(sharedIsolation)).toBe(false);
    expect(existsSync(sharedReadonly)).toBe(false);
    // No mkdir of the bare shared root as the first side effect either.
    // (assert fails before mkdir under run-id.)
  });

  itLive('H-2: malformed GATE_RUN_ID step2 creates no run-id evidence dir', () => {
    const bad = 'bad id!!';
    const badDir = resolve(REPO_ROOT, `.tmp/REDHAT-FIX-S28R3/${bad}`);
    const run = spawnSync(
      'bash',
      [
        '-c',
        'set -euo pipefail; bash scripts/assert-gate-run-id.sh; EVID=".tmp/REDHAT-FIX-S28R3/${GATE_RUN_ID}"; mkdir -p "$EVID"; echo CREATED',
      ],
      {
        cwd: REPO_ROOT,
        encoding: 'utf8',
        timeout: 15_000,
        env: { PATH: process.env.PATH, HOME: process.env.HOME, GATE_RUN_ID: bad },
      }
    );
    expect(run.status).not.toBe(0);
    expect(existsSync(badDir)).toBe(false);
    expect(existsSync(ASSERT_RUN_ID)).toBe(true);
  });

  it('C-1: runner rejects --source-blob-root before any child/side-effect', () => {
    const landmine = resolve(EVIDENCE_DIR, 'c1-landmine-source');
    const landmineMarker = resolve(landmine, 'TRAVERSE_ME.txt');
    const traverseLog = resolve(EVIDENCE_DIR, 'c1-traverse.marker');
    const recorderOut = resolve(EVIDENCE_DIR, 'c1-rec-early.json');
    mkdirSync(landmine, { recursive: true });
    writeFileSync(landmineMarker, 'if hashed, test should detect\n', 'utf8');
    if (existsSync(traverseLog)) rmSync(traverseLog, { force: true });
    if (existsSync(recorderOut)) rmSync(recorderOut, { force: true });

    const recorder = resolve(EVIDENCE_DIR, 'c1-rec-early.sh');
    writeFileSync(
      recorder,
      `#!/usr/bin/env bash
set -euo pipefail
python3 - ${JSON.stringify(recorderOut)} ${JSON.stringify(traverseLog)} "$@" <<'PY'
import json, sys
open(sys.argv[2], "w").write("CHILD_INVOKED\\n")
open(sys.argv[1], "w").write(json.dumps({"argv": sys.argv[3:]}) + "\\n")
sys.exit(0)
PY
`,
      'utf8'
    );
    spawnSync('chmod', ['+x', recorder]);

    const run = spawnSync(
      'bash',
      [
        RUNNER,
        '--host',
        's28r3-qa4-c1-never-created',
        '--target-timestamp',
        '2026-07-28T12:00:00Z',
        '--source-blob-root',
        landmine,
      ],
      {
        cwd: REPO_ROOT,
        encoding: 'utf8',
        timeout: 30_000,
        env: {
          ...process.env,
          HOLO_CLI: recorder,
          HOLO_BLOB_ROOT: landmine,
        },
      }
    );
    const combined = `${run.stdout ?? ''}\n${run.stderr ?? ''}`;
    writeEvidence('c1-reject-source-blob.json', {
      status: run.status,
      combined: combined.slice(0, 3000),
      child: existsSync(recorderOut),
      traverse: existsSync(traverseLog),
    });
    expect(run.status, combined.slice(0, 1200)).not.toBe(0);
    expect(combined).toMatch(/source-blob-root|baseline-only|refuse/i);
    expect(existsSync(recorderOut), 'child must not run when source-blob-root refused').toBe(false);
    expect(existsSync(traverseLog)).toBe(false);
  });

  itLive(
    'C-1 unit: freshTarget + landmine sourceBlobRoot never traverses; missing baseline fails closed',
    async () => {
      const { runFireDrill } = await import('../../src/backup/fire-drill.ts');
      const landmine = resolve(EVIDENCE_DIR, 'c1-unit-landmine');
      const marker = resolve(landmine, 'LANDMINE_PROBE.txt');
      const probeToken = `qa4-landmine-${Date.now().toString(36)}`;
      mkdirSync(landmine, { recursive: true });
      writeFileSync(marker, `${probeToken}\n`, 'utf8');

      // Instrument: wrap by placing a side-effect file that hashLocalBlobStore would read
      // (content token). After run, pre-failure snapshot must not bind landmine path and
      // must fail on baseline — prove no live source oracle.
      const scratch = resolve(EVIDENCE_DIR, 'c1-unit-scratch');
      const blobDir = resolve(EVIDENCE_DIR, 'c1-unit-blob');
      const reportPath = resolve(EVIDENCE_DIR, 'c1-unit-report.json');
      mkdirSync(scratch, { recursive: true });
      mkdirSync(blobDir, { recursive: true });

      const hashMarker = resolve(EVIDENCE_DIR, 'c1-unit-hash-marker.txt');
      if (existsSync(hashMarker)) rmSync(hashMarker, { force: true });
      const prevMarker = process.env.HOLO_TEST_BLOB_HASH_MARKER;
      process.env.HOLO_TEST_BLOB_HASH_MARKER = hashMarker;

      let result: Awaited<ReturnType<typeof runFireDrill>>;
      try {
        result = await runFireDrill({
          targetTimestamp: '2026-07-28T12:00:00Z',
          scratch,
          blobDir,
          reportPath,
          freshTarget: 'qa4-fresh-unit-baseline-only',
          sourceBlobRoot: landmine,
          requireRecoveryBaseline: true,
          env: {
            ...process.env,
            HOLO_BLOB_ROOT: landmine,
            HOLO_TEST_BLOB_HASH_MARKER: hashMarker,
            DATABASE_URL: 'postgres://127.0.0.1:1/no_such_db_qa4_fresh',
            HOLO_SECRETS_PATH: resolve(EVIDENCE_DIR, 'empty-secrets-missing.yaml'),
          },
        });
      } finally {
        if (prevMarker === undefined) delete process.env.HOLO_TEST_BLOB_HASH_MARKER;
        else process.env.HOLO_TEST_BLOB_HASH_MARKER = prevMarker;
      }

      const preFailurePath = resolve(dirname(reportPath), 'pre-failure-snapshot.json');
      let preFailure: Record<string, unknown> | null = null;
      if (existsSync(preFailurePath)) {
        preFailure = JSON.parse(readFileSync(preFailurePath, 'utf8')) as Record<string, unknown>;
      }

      const hashMarkerBody = existsSync(hashMarker) ? readFileSync(hashMarker, 'utf8') : '';
      writeEvidence('c1-fresh-baseline-only.json', {
        ok: result.ok,
        exitCode: result.exitCode,
        errors: result.errors.slice(0, 25),
        preFailure,
        landmine,
        hashMarkerBody,
      });

      expect(result.ok).toBe(false);
      expect(result.exitCode).not.toBe(0);
      const errText = result.errors.join(' ').toLowerCase();
      expect(errText).toMatch(/baseline|blob_manifest|fresh-target|refuse|recovery/);

      // Landmine path must not be the bound sourceBlobRoot oracle.
      if (preFailure) {
        const bound = String(preFailure.sourceBlobRoot ?? '');
        expect(bound).not.toContain(landmine);
        expect(bound).toMatch(/fresh-target-baseline-only|baseline/i);
        expect(preFailure.fresh_target_baseline_only).toBe(true);
      }

      // Instrumentation: hashLocalBlobStore must never record the landmine root.
      expect(hashMarkerBody).not.toContain(landmine);
      // Prefer no hashLocalBlobStore at all before fail-closed on missing baseline.
      // (If restored hashing were to call it later, landmine still must be absent.)

      // Landmine content still present and unchanged (not deleted/rewritten by drill).
      expect(readFileSync(marker, 'utf8')).toContain(probeToken);
    },
    120_000
  );

  it('M-1 no-Docker: assert-fire-drill-report rejects incomplete parity report', () => {
    const assertReport = resolve(REPO_ROOT, 'scripts/assert-fire-drill-report.sh');
    expect(existsSync(assertReport)).toBe(true);
    mkdirSync(EVIDENCE_DIR, { recursive: true });
    const bad = resolve(EVIDENCE_DIR, 'm1-qa4-incomplete.json');
    writeFileSync(
      bad,
      JSON.stringify(
        {
          POSTGRES_PARITY_PASS: true,
          LEDGER_CHECKSUM_MATCH: true,
          ok: true,
        },
        null,
        2
      ) + '\n',
      'utf8'
    );
    const run = spawnSync('bash', [assertReport, bad], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      timeout: 15_000,
    });
    const combined = `${run.stdout ?? ''}\n${run.stderr ?? ''}`;
    writeEvidence('m1-qa4-assert-incomplete.json', {
      status: run.status,
      combined: combined.slice(0, 1500),
    });
    expect(run.status, combined.slice(0, 800)).not.toBe(0);
    expect(combined).toMatch(/report contract|BLOB_PARITY_PASS|baseline_id|parity report/i);
  });

  it('M-1 no-Docker: assert-fire-drill-report accepts complete parity report', () => {
    const assertReport = resolve(REPO_ROOT, 'scripts/assert-fire-drill-report.sh');
    const good = resolve(EVIDENCE_DIR, 'm1-qa4-complete.json');
    mkdirSync(EVIDENCE_DIR, { recursive: true });
    writeFileSync(
      good,
      JSON.stringify(
        {
          POSTGRES_PARITY_PASS: true,
          LEDGER_CHECKSUM_MATCH: true,
          BLOB_PARITY_PASS: true,
          baseline_id: 'qa4-m1-baseline',
          baseline_key: 'recovery-baselines/qa4-m1.json',
        },
        null,
        2
      ) + '\n',
      'utf8'
    );
    const run = spawnSync('bash', [assertReport, good], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      timeout: 15_000,
    });
    expect(run.status).toBe(0);
  });

  itLive(
    'M-1: full-run recorder writes contract report; runner accepts',
    () => {
      // GATE-FIX-S28R3-QA5 / M-1: never silent-return green when Docker missing under PLATFORM_IT.
      if (!dockerAvailable()) {
        throw new Error('docker required for M-1 report contract full-run (PLATFORM_IT=1)');
      }
      const host = `s28r3-qa4-m1-${Date.now().toString(36)}`;
      dockerCleanup.push({ host });
      const staging = resolve(EVIDENCE_DIR, 'm1-staging');
      const pgPort = String(64200 + (Date.now() % 700));
      const provision = spawnSync(
        'bash',
        [PROVISION, '--host', host, '--skip-isolation', '--pg-port', pgPort],
        {
          cwd: REPO_ROOT,
          encoding: 'utf8',
          timeout: 180_000,
          env: { ...process.env, STAGING_ROOT: staging, ALLOW_PLACEHOLDER_R2_RO: '1' },
        }
      );
      expect(provision.status).toBe(0);

      const recorderOut = resolve(EVIDENCE_DIR, `m1-rec-${host}.json`);
      const recorder = resolve(EVIDENCE_DIR, `m1-rec-${host}.sh`);
      const reportPath = resolve(EVIDENCE_DIR, `m1-report-${host}.json`);
      writeFileSync(
        recorder,
        `#!/usr/bin/env bash
set -euo pipefail
python3 - ${JSON.stringify(recorderOut)} "$@" <<'PY'
import json, sys
argv = sys.argv[2:]
report = None
for i, a in enumerate(argv):
    if a == "--report" and i + 1 < len(argv):
        report = argv[i + 1]
        break
    if a.startswith("--report="):
        report = a.split("=", 1)[1]
        break
assert report, "recorder requires --report"
with open(report, "w") as f:
    json.dump({
        "POSTGRES_PARITY_PASS": True,
        "LEDGER_CHECKSUM_MATCH": True,
        "BLOB_PARITY_PASS": True,
        "baseline_id": "qa4-m1-baseline",
        "baseline_key": "recovery-baselines/qa4-m1.json",
        "ok": True,
    }, f, indent=2)
    f.write("\\n")
open(sys.argv[1], "w").write(json.dumps({"argv": argv, "report": report, "ok": True}) + "\\n")
sys.exit(0)
PY
`,
        'utf8'
      );
      spawnSync('chmod', ['+x', recorder]);
      const att = resolve(EVIDENCE_DIR, `m1-att-${host}.json`);
      const run = spawnSync(
        'bash',
        [
          RUNNER,
          '--host',
          host,
          '--target-timestamp',
          '2026-07-28T12:00:00Z',
          '--attestation',
          att,
          '--report',
          reportPath,
        ],
        {
          cwd: REPO_ROOT,
          encoding: 'utf8',
          timeout: 120_000,
          env: {
            ...process.env,
            STAGING_ROOT: staging,
            R2_ACCESS_KEY_ID: WRITER_AK,
            R2_SECRET_ACCESS_KEY: WRITER_SK,
            R2_RESTORE_ACCESS_KEY_ID: RESTORE_AK,
            R2_RESTORE_SECRET_ACCESS_KEY: RESTORE_SK,
            R2_ENDPOINT: 'https://example.invalid',
            HOLO_CLI: recorder,
            HOLO_SECRETS_PATH: resolve(EVIDENCE_DIR, 'empty-secrets-missing.yaml'),
          },
        }
      );
      const combined = `${run.stdout ?? ''}\n${run.stderr ?? ''}`;
      writeEvidence('m1-full-run-ok.json', {
        status: run.status,
        combined: combined.slice(0, 2000),
        report_exists: existsSync(reportPath),
      });
      expect(run.status, combined.slice(0, 1200)).toBe(0);
      expect(existsSync(reportPath)).toBe(true);
      const report = JSON.parse(readFileSync(reportPath, 'utf8')) as Record<string, unknown>;
      expect(report.POSTGRES_PARITY_PASS).toBe(true);
      expect(report.LEDGER_CHECKSUM_MATCH).toBe(true);
      expect(report.BLOB_PARITY_PASS).toBe(true);
      expect(
        (typeof report.baseline_id === 'string' && String(report.baseline_id).length > 0) ||
          (typeof report.baseline_key === 'string' && String(report.baseline_key).length > 0)
      ).toBe(true);
      expect(existsSync(att)).toBe(true);
      const attBody = JSON.parse(readFileSync(att, 'utf8')) as { ok?: boolean };
      expect(attBody.ok).toBe(true);
    },
    300_000
  );

  itLive(
    'M-1 negative: recorder exit 0 without parity fields → runner nonzero',
    () => {
      // GATE-FIX-S28R3-QA5 / M-1: never silent-return green when Docker missing under PLATFORM_IT.
      if (!dockerAvailable()) {
        throw new Error('docker required for M-1 negative report contract (PLATFORM_IT=1)');
      }
      const host = `s28r3-qa4-m1n-${Date.now().toString(36)}`;
      dockerCleanup.push({ host });
      const staging = resolve(EVIDENCE_DIR, 'm1n-staging');
      const pgPort = String(64300 + (Date.now() % 700));
      const provision = spawnSync(
        'bash',
        [PROVISION, '--host', host, '--skip-isolation', '--pg-port', pgPort],
        {
          cwd: REPO_ROOT,
          encoding: 'utf8',
          timeout: 180_000,
          env: { ...process.env, STAGING_ROOT: staging, ALLOW_PLACEHOLDER_R2_RO: '1' },
        }
      );
      expect(provision.status).toBe(0);

      const recorder = resolve(EVIDENCE_DIR, `m1n-rec-${host}.sh`);
      const reportPath = resolve(EVIDENCE_DIR, `m1n-report-${host}.json`);
      // Exit 0 but write incomplete report (missing BLOB_PARITY_PASS / baseline).
      writeFileSync(
        recorder,
        `#!/usr/bin/env bash
set -euo pipefail
python3 - "$@" <<'PY'
import json, sys
argv = sys.argv[1:]
report = None
for i, a in enumerate(argv):
    if a == "--report" and i + 1 < len(argv):
        report = argv[i + 1]
        break
    if a.startswith("--report="):
        report = a.split("=", 1)[1]
        break
if report:
    with open(report, "w") as f:
        json.dump({
            "POSTGRES_PARITY_PASS": True,
            "LEDGER_CHECKSUM_MATCH": True,
            "ok": True,
        }, f, indent=2)
        f.write("\\n")
sys.exit(0)
PY
`,
        'utf8'
      );
      spawnSync('chmod', ['+x', recorder]);
      const att = resolve(EVIDENCE_DIR, `m1n-att-${host}.json`);
      const run = spawnSync(
        'bash',
        [
          RUNNER,
          '--host',
          host,
          '--target-timestamp',
          '2026-07-28T12:00:00Z',
          '--attestation',
          att,
          '--report',
          reportPath,
        ],
        {
          cwd: REPO_ROOT,
          encoding: 'utf8',
          timeout: 120_000,
          env: {
            ...process.env,
            STAGING_ROOT: staging,
            R2_ACCESS_KEY_ID: WRITER_AK,
            R2_SECRET_ACCESS_KEY: WRITER_SK,
            R2_RESTORE_ACCESS_KEY_ID: RESTORE_AK,
            R2_RESTORE_SECRET_ACCESS_KEY: RESTORE_SK,
            R2_ENDPOINT: 'https://example.invalid',
            HOLO_CLI: recorder,
            HOLO_SECRETS_PATH: resolve(EVIDENCE_DIR, 'empty-secrets-missing.yaml'),
          },
        }
      );
      const combined = `${run.stdout ?? ''}\n${run.stderr ?? ''}`;
      writeEvidence('m1-negative-incomplete-report.json', {
        status: run.status,
        combined: combined.slice(0, 2500),
        report_exists: existsSync(reportPath),
      });
      expect(run.status, combined.slice(0, 1200)).not.toBe(0);
      expect(combined).toMatch(/report contract|BLOB_PARITY_PASS|baseline_id|parity report/i);
    },
    300_000
  );
});

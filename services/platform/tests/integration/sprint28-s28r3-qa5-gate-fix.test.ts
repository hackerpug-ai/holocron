/**
 * GATE-FIX-S28R3-QA5 — Exact action/resource pairing, run-ID-scoped steps 3–5,
 * no Docker false-green on report contract.
 *
 * Covers Terra review red-hat-20260729T101625Z:
 *   H-1 exact Allow action↔resource class pairing · H-2 step3–5 under ${GATE_RUN_ID}
 *   M-1 report contract always executes (assert-fire-drill-report.sh + fail-closed Docker IT)
 *
 * Run:
 *   PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/sprint28-s28r3-qa5-gate-fix.test.ts
 */

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
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
const PROVE_ISOLATION = resolve(REPO_ROOT, 'scripts/prove-isolation.sh');
const ASSERT_RUN_ID = resolve(REPO_ROOT, 'scripts/assert-gate-run-id.sh');
const ASSERT_REPORT = resolve(REPO_ROOT, 'scripts/assert-fire-drill-report.sh');
const RUNNER = resolve(REPO_ROOT, 'scripts/run-fire-drill-on-fresh-target.sh');
const PROVISION = resolve(REPO_ROOT, 'scripts/provision-fresh-restore-target.sh');
const EVIDENCE_DIR = resolve(REPO_ROOT, '.tmp/GATE-FIX-S28R3-QA5');

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

const WRITER_AK = 'qa5-writer-akid-deliberate-identity';
const WRITER_SK = 'qa5-writer-sk-deliberate-identity-value';
const RESTORE_AK = 'qa5-restore-akid-deliberate-identity';
const RESTORE_SK = 'qa5-restore-sk-deliberate-identity-value';

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
    MINI_UNIX_SOCKETS: '/tmp/.s.PGSQL.5432-qa5-absent',
    TARGET_ATTESTED_IDENTITY: 'target-vm-uuid-qa5',
    MINI_ATTESTED_IDENTITY: 'mini-hw-uuid-qa5',
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

describe('GATE-FIX-S28R3-QA5 always-on contract', () => {
  it('H-2 static: gate-plan steps 3–5 bind evidence to ${GATE_RUN_ID}', () => {
    const plan = loadPlan();
    for (const n of [3, 4, 5] as const) {
      const cmd = String(stepOf(plan, n).literal_cmd ?? '');
      // GATE-FIX-S28R3-QA22: absolute /bin/bash; step3 may prefix DOCKER candidate resolution
      expect(cmd).toMatch(/^set -euo pipefail; /);
      expect(cmd).toMatch(/\/bin\/bash scripts\/assert-gate-run-id\.sh/);
      expect(cmd).not.toMatch(/(?:^|[^/\w])bash scripts\/assert-gate-run-id\.sh/);
      expect(cmd).toMatch(/\.tmp\/REDHAT-FIX-S28R3\/\$\{GATE_RUN_ID\}/);
      expect(cmd).toMatch(/parity-report\.json/);
      // Shared (non-run-scoped) parity path must not appear.
      expect(cmd).not.toMatch(/test -f \.tmp\/REDHAT-FIX-S28R3\/parity-report\.json/);
      expect(cmd).not.toMatch(/jq -e '[^']+' \.tmp\/REDHAT-FIX-S28R3\/parity-report\.json/);
      expect(cmd).not.toMatch(/tee \.tmp\/REDHAT-FIX-S28R3\/step3-/);
      expect(cmd).not.toMatch(/mkdir -p \.tmp\/REDHAT-FIX-S28R3;/);
    }
    const step3 = String(stepOf(plan, 3).literal_cmd ?? '');
    expect(step3).toMatch(/EVID="\.tmp\/REDHAT-FIX-S28R3\/\$\{GATE_RUN_ID\}"/);
    expect(step3).toMatch(
      /\$EVID\/step3-provision\.txt|\$\{EVID\}\/step3-provision\.txt|"\$EVID\/step3-provision\.txt"/
    );
    expect(step3).toMatch(/\$EVID\/step3-fire-drill\.txt|"\$EVID\/step3-fire-drill\.txt"/);
    expect(step3).toMatch(/\$EVID\/attestation\.json|"\$EVID\/attestation\.json"/);
    expect(step3).toMatch(/\$EVID\/parity-report\.json|"\$EVID\/parity-report\.json"/);
    expect(step3).toMatch(
      /STAGING_ROOT="\$EVID\/fresh-restore"|STAGING_ROOT=\$EVID\/fresh-restore/
    );
    writeEvidence('h2-steps-3-5-cmds.json', {
      step3: step3.slice(0, 800),
      step4: String(stepOf(plan, 4).literal_cmd ?? ''),
      step5: String(stepOf(plan, 5).literal_cmd ?? ''),
    });
  });

  it('H-2 static: HUMAN-GATE fenced steps 3–5 match plan and contain ${GATE_RUN_ID}', () => {
    const plan = loadPlan();
    const hg = readFileSync(HUMAN_GATE, 'utf8');
    for (const n of [3, 4, 5] as const) {
      const planCmd = String(stepOf(plan, n).literal_cmd ?? '');
      const re = new RegExp(`###\\s+${n}\\s+[^\\n]*\\n[\\s\\S]*?\`\`\`bash\\n([\\s\\S]*?)\`\`\``);
      const m = re.exec(hg);
      expect(m, `HUMAN-GATE step${n} fenced bash`).toBeTruthy();
      const fenced = (m?.[1] ?? '').replace(/\n$/, '');
      expect(fenced).toBe(planCmd);
      expect(fenced).toMatch(/\$\{GATE_RUN_ID\}/);
    }
  });

  it('M-1 source: runner delegates report contract to assert-fire-drill-report.sh', () => {
    const src = readFileSync(RUNNER, 'utf8');
    expect(existsSync(ASSERT_REPORT)).toBe(true);
    expect(src).toMatch(/assert-fire-drill-report\.sh/);
    expect(src).toMatch(/report contract|GATE-FIX-S28R3-QA4\/M-1/i);
    const assertSrc = readFileSync(ASSERT_REPORT, 'utf8');
    expect(assertSrc).toMatch(/POSTGRES_PARITY_PASS/);
    expect(assertSrc).toMatch(/LEDGER_CHECKSUM_MATCH/);
    expect(assertSrc).toMatch(/BLOB_PARITY_PASS/);
    expect(assertSrc).toMatch(/baseline_id|baseline_key/);
  });

  it('M-1 no-Docker: assert-fire-drill-report accepts complete contract report', () => {
    const reportPath = resolve(EVIDENCE_DIR, 'm1-unit-ok-report.json');
    mkdirSync(EVIDENCE_DIR, { recursive: true });
    writeFileSync(
      reportPath,
      JSON.stringify(
        {
          POSTGRES_PARITY_PASS: true,
          LEDGER_CHECKSUM_MATCH: true,
          BLOB_PARITY_PASS: true,
          baseline_id: 'qa5-m1-baseline',
          baseline_key: 'recovery-baselines/qa5-m1.json',
          ok: true,
        },
        null,
        2
      ) + '\n',
      'utf8'
    );
    const run = spawnSync('bash', [ASSERT_REPORT, reportPath], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      timeout: 15_000,
    });
    const combined = `${run.stdout ?? ''}\n${run.stderr ?? ''}`;
    writeEvidence('m1-assert-ok.json', { status: run.status, combined: combined.slice(0, 1000) });
    expect(run.status, combined.slice(0, 800)).toBe(0);
  });

  it('M-1 no-Docker: assert-fire-drill-report rejects incomplete report', () => {
    const reportPath = resolve(EVIDENCE_DIR, 'm1-unit-bad-report.json');
    mkdirSync(EVIDENCE_DIR, { recursive: true });
    writeFileSync(
      reportPath,
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
    const run = spawnSync('bash', [ASSERT_REPORT, reportPath], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      timeout: 15_000,
    });
    const combined = `${run.stdout ?? ''}\n${run.stderr ?? ''}`;
    writeEvidence('m1-assert-bad.json', { status: run.status, combined: combined.slice(0, 1500) });
    expect(run.status, combined.slice(0, 800)).not.toBe(0);
    expect(combined).toMatch(/report contract|BLOB_PARITY_PASS|baseline_id|parity report/i);
  });

  it('M-1 no-Docker: assert-fire-drill-report rejects false BLOB_PARITY_PASS', () => {
    const reportPath = resolve(EVIDENCE_DIR, 'm1-unit-false-blob.json');
    mkdirSync(EVIDENCE_DIR, { recursive: true });
    writeFileSync(
      reportPath,
      JSON.stringify(
        {
          POSTGRES_PARITY_PASS: true,
          LEDGER_CHECKSUM_MATCH: true,
          BLOB_PARITY_PASS: false,
          baseline_id: 'qa5-m1-baseline',
        },
        null,
        2
      ) + '\n',
      'utf8'
    );
    const run = spawnSync('bash', [ASSERT_REPORT, reportPath], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      timeout: 15_000,
    });
    expect(run.status).not.toBe(0);
    const combined = `${run.stdout ?? ''}\n${run.stderr ?? ''}`;
    expect(combined).toMatch(/BLOB_PARITY_PASS|report contract/i);
  });

  it('H-1: mixed List+GetObject with both resource classes FAILs', () => {
    const bucket = defaultBucketName();
    const prefix = defaultPgbackrestPrefix();
    const policy = JSON.stringify({
      Version: '2012-10-17',
      Statement: [
        {
          Effect: 'Allow',
          Action: ['s3:ListBucket', 's3:GetObject'],
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
    writeEvidence('h1-mixed-classes.json', {
      status: run.status,
      combined: combined.slice(0, 4000),
    });
    expect(run.status, combined.slice(0, 800)).not.toBe(0);
    expect(combined).toMatch(/exact pairing|mixes|object ARN|bucket ARN|pairing/i);
    expect(combined).toMatch(/RESULT:\s+FAIL|AXIS r2_readonly:\s+FAIL/);
  }, 90_000);

  it('H-1: ListBucket with only object ARN FAILs', () => {
    const bucket = defaultBucketName();
    const prefix = defaultPgbackrestPrefix();
    const policy = JSON.stringify({
      Version: '2012-10-17',
      Statement: [
        {
          Effect: 'Allow',
          Action: ['s3:ListBucket', 's3:GetBucketLocation'],
          Resource: [`arn:aws:s3:::${bucket}/${prefix}/*`],
        },
        {
          Effect: 'Allow',
          Action: ['s3:GetObject'],
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
    writeEvidence('h1-list-object-only.json', {
      status: run.status,
      combined: combined.slice(0, 4000),
    });
    expect(run.status, combined.slice(0, 800)).not.toBe(0);
    expect(combined).toMatch(/bucket action|object ARN|exact pairing|bucket ARN|pairing/i);
    expect(combined).toMatch(/RESULT:\s+FAIL|AXIS r2_readonly:\s+FAIL/);
  }, 90_000);

  it('H-1: GetObject with only bucket ARN FAILs', () => {
    const bucket = defaultBucketName();
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
          Resource: [`arn:aws:s3:::${bucket}`],
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
    writeEvidence('h1-getobject-bucket-only.json', {
      status: run.status,
      combined: combined.slice(0, 4000),
    });
    expect(run.status, combined.slice(0, 800)).not.toBe(0);
    expect(combined).toMatch(/GetObject|bucket ARN|exact pairing|object ARN|pairing/i);
    expect(combined).toMatch(/RESULT:\s+FAIL|AXIS r2_readonly:\s+FAIL/);
  }, 90_000);

  it('H-1: split two-Allow exact policy still PASSes r2_readonly', () => {
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
    writeEvidence('h1-split-exact-pass.json', {
      status: run.status,
      combined: combined.slice(0, 4000),
    });
    expect(combined).toMatch(/AXIS r2_readonly:\s+PASS/);
    expect(combined).not.toMatch(/mixes bucket action|mixes GetObject/i);
  }, 90_000);
});

describe('GATE-FIX-S28R3-QA5 H-2 / M-1 live seams (PLATFORM_IT)', () => {
  itLive('H-2: report from GATE_RUN_ID A cannot satisfy steps 4–5 for B', () => {
    const idA = `qa5a-${Date.now().toString(36)}`;
    const idB = `qa5b-${Date.now().toString(36)}`;
    const dirA = resolve(REPO_ROOT, `.tmp/REDHAT-FIX-S28R3/${idA}`);
    const dirB = resolve(REPO_ROOT, `.tmp/REDHAT-FIX-S28R3/${idB}`);
    mkdirSync(dirA, { recursive: true });
    // Deliberately do NOT create dirB / B's report.
    if (existsSync(resolve(dirB, 'parity-report.json'))) {
      rmSync(resolve(dirB, 'parity-report.json'), { force: true });
    }
    const goodReport = {
      POSTGRES_PARITY_PASS: true,
      LEDGER_CHECKSUM_MATCH: true,
      BLOB_PARITY_PASS: true,
      ledger_sha256: 'a'.repeat(64),
      matched_objects: 3,
      baseline_id: 'qa5-foreign-a',
      row_counts: { beliefs: 1 },
    };
    writeFileSync(resolve(dirA, 'parity-report.json'), JSON.stringify(goodReport, null, 2) + '\n');

    // Step 4/5 under idB must fail even though A's report is complete and valid.
    const step4 = String(stepOf(loadPlan(), 4).literal_cmd ?? '');
    const step5 = String(stepOf(loadPlan(), 5).literal_cmd ?? '');
    const run4 = spawnSync('bash', ['-c', step4], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      timeout: 15_000,
      env: { PATH: process.env.PATH, HOME: process.env.HOME, GATE_RUN_ID: idB },
    });
    const run5 = spawnSync('bash', ['-c', step5], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      timeout: 15_000,
      env: { PATH: process.env.PATH, HOME: process.env.HOME, GATE_RUN_ID: idB },
    });
    // Positive control: idA's report satisfies idA.
    const run4A = spawnSync('bash', ['-c', step4], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      timeout: 15_000,
      env: { PATH: process.env.PATH, HOME: process.env.HOME, GATE_RUN_ID: idA },
    });
    writeEvidence('h2-two-run-contamination.json', {
      idA,
      idB,
      status4B: run4.status,
      status5B: run5.status,
      status4A: run4A.status,
      out4B: `${run4.stdout ?? ''}\n${run4.stderr ?? ''}`.slice(0, 800),
      out5B: `${run5.stdout ?? ''}\n${run5.stderr ?? ''}`.slice(0, 800),
    });
    expect(run4.status, 'B must not accept A report for step4').not.toBe(0);
    expect(run5.status, 'B must not accept A report for step5').not.toBe(0);
    expect(run4A.status, 'A report must satisfy A step4').toBe(0);
    // Shared path must not be the sole oracle either.
    expect(existsSync(ASSERT_RUN_ID)).toBe(true);
  });

  itLive('H-2: foreign shared parity path does not satisfy run-scoped step4', () => {
    const id = `qa5f-${Date.now().toString(36)}`;
    const shared = resolve(REPO_ROOT, '.tmp/REDHAT-FIX-S28R3');
    mkdirSync(shared, { recursive: true });
    const sharedReport = resolve(shared, 'parity-report.json');
    writeFileSync(
      sharedReport,
      JSON.stringify(
        {
          POSTGRES_PARITY_PASS: true,
          LEDGER_CHECKSUM_MATCH: true,
          BLOB_PARITY_PASS: true,
          ledger_sha256: 'b'.repeat(64),
          matched_objects: 1,
          baseline_id: 'shared-foreign',
        },
        null,
        2
      ) + '\n'
    );
    const step4 = String(stepOf(loadPlan(), 4).literal_cmd ?? '');
    const run = spawnSync('bash', ['-c', step4], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      timeout: 15_000,
      env: { PATH: process.env.PATH, HOME: process.env.HOME, GATE_RUN_ID: id },
    });
    writeEvidence('h2-foreign-shared.json', {
      status: run.status,
      combined: `${run.stdout ?? ''}\n${run.stderr ?? ''}`.slice(0, 800),
    });
    expect(run.status).not.toBe(0);
    // Cleanup shared leak we created for the negative.
    rmSync(sharedReport, { force: true });
  });

  itLive('H-2: unset GATE_RUN_ID fails steps 3–5 before shared mkdir side-effect', () => {
    for (const n of [3, 4, 5] as const) {
      const cmd = String(stepOf(loadPlan(), n).literal_cmd ?? '');
      const run = spawnSync('bash', ['-c', cmd], {
        cwd: REPO_ROOT,
        encoding: 'utf8',
        timeout: 15_000,
        env: {
          PATH: process.env.PATH,
          HOME: process.env.HOME,
          GATE_RUN_ID: undefined,
        },
      });
      expect(run.status, `step${n} unset GATE_RUN_ID`).not.toBe(0);
      const combined = `${run.stdout ?? ''}\n${run.stderr ?? ''}`;
      expect(combined).toMatch(/GATE_RUN_ID|allowlist|required|refuse|unset|empty/i);
    }
  });

  itLive(
    'M-1: full-run recorder writes contract report; runner accepts (Docker required when PLATFORM_IT)',
    () => {
      if (!dockerAvailable()) {
        throw new Error('docker required for M-1 report contract full-run (PLATFORM_IT=1)');
      }
      const host = `s28r3-qa5-m1-${Date.now().toString(36)}`;
      dockerCleanup.push({ host });
      const staging = resolve(EVIDENCE_DIR, 'm1-staging');
      const pgPort = String(64400 + (Date.now() % 700));
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
        "baseline_id": "qa5-m1-baseline",
        "baseline_key": "recovery-baselines/qa5-m1.json",
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
    },
    300_000
  );

  itLive(
    'M-1 negative: recorder exit 0 without parity fields → runner nonzero (Docker required when PLATFORM_IT)',
    () => {
      if (!dockerAvailable()) {
        throw new Error('docker required for M-1 negative report contract (PLATFORM_IT=1)');
      }
      const host = `s28r3-qa5-m1n-${Date.now().toString(36)}`;
      dockerCleanup.push({ host });
      const staging = resolve(EVIDENCE_DIR, 'm1n-staging');
      const pgPort = String(64500 + (Date.now() % 700));
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

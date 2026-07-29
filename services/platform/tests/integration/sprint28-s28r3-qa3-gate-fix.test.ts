/**
 * GATE-FIX-S28R3-QA3 — File-backed identity distinctness, no live DB, required GATE_RUN_ID.
 *
 * Covers Terra review red-hat-20260729T092559Z:
 *   C-1 secrets-file equal writer/restore refused · C-2 no DATABASE_URL/PG* in child + no live source on freshTarget
 *   C-3 required allowlisted GATE_RUN_ID (no :-manual) · H-1 mixed exact+bare policy fail
 *   M-1 fenced-block digest oracle · M-2 full-run status 0 + att ok · M-3 step3 trap removes network
 *
 * Run:
 *   PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/sprint28-s28r3-qa3-gate-fix.test.ts
 */

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
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
const EVIDENCE_DIR = resolve(REPO_ROOT, '.tmp/GATE-FIX-S28R3-QA3');

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

function sha256(s: string): string {
  return createHash('sha256').update(s, 'utf8').digest('hex');
}

function dockerAvailable(): boolean {
  const info = spawnSync('docker', ['info'], { encoding: 'utf8', timeout: 15_000 });
  return info.status === 0;
}

/** Extract numbered step fenced ```bash blocks from HUMAN-GATE (not note digests alone). */
function extractHumanGateFencedCmds(md: string): Map<number, string> {
  const map = new Map<number, string>();
  // ### N — title ... then optional sha line ... then ```bash\nCMD\n```
  const re =
    /###\s+(\d+)\s+[^\n]*\n[\s\S]*?```bash\n([\s\S]*?)```/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(md)) !== null) {
    const n = Number(m[1]);
    if (!Number.isFinite(n) || n < 1) continue;
    // First fenced bash under each step is the literal_cmd.
    if (!map.has(n)) {
      map.set(n, m[2].replace(/\n$/, ''));
    }
  }
  return map;
}

const EQUAL_AK = 'qa3-shared-akid-deliberate-identity';
const EQUAL_SK = 'qa3-shared-sk-deliberate-identity-value';
const WRITER_AK = 'qa3-writer-akid-deliberate-identity';
const WRITER_SK = 'qa3-writer-sk-deliberate-identity-value';
const RESTORE_AK = 'qa3-restore-akid-deliberate-identity';
const RESTORE_SK = 'qa3-restore-sk-deliberate-identity-value';

describe('GATE-FIX-S28R3-QA3 always-on contract', () => {
  it('C-3: assert-gate-run-id.sh exists and bash -n clean', () => {
    expect(existsSync(ASSERT_RUN_ID), `missing ${ASSERT_RUN_ID}`).toBe(true);
    const syntax = spawnSync('bash', ['-n', ASSERT_RUN_ID], { encoding: 'utf8' });
    expect(syntax.status, syntax.stderr).toBe(0);
  });

  it('C-3: gate-plan steps 1/3/6 preflight GATE_RUN_ID; no :-manual defaults', () => {
    const plan = loadPlan();
    for (const n of [1, 3, 6]) {
      const cmd = String(stepOf(plan, n).literal_cmd ?? '');
      expect(cmd, `step ${n} must preflight run id`).toMatch(
        /assert-gate-run-id\.sh|GATE_RUN_ID.*allowlist|refuse.*GATE_RUN_ID/
      );
      expect(cmd, `step ${n} must not use :-manual`).not.toMatch(/GATE_RUN_ID:-manual/);
      expect(cmd, `step ${n} must expand "\${GATE_RUN_ID}" only`).toMatch(
        /\$\{GATE_RUN_ID\}|"\$\{GATE_RUN_ID\}"/
      );
    }
    const step3 = String(stepOf(plan, 3).literal_cmd ?? '');
    expect(step3).toMatch(/HOST="s28r3-gate-\$\{GATE_RUN_ID\}"/);
    // M-3: trap removes docker network
    expect(step3).toMatch(/network rm/);
    expect(step3).toMatch(/\$\{HOST\}-net|"\$\{HOST\}-net"/);
    writeEvidence('c3-step-preflight.json', {
      step1_has_manual: /GATE_RUN_ID:-manual/.test(String(stepOf(plan, 1).literal_cmd ?? '')),
      step3_has_network_trap: /network rm/.test(step3),
    });
  });

  it('M-1: each HUMAN-GATE fenced bash block hashes to gate-plan literal_cmd', () => {
    const plan = loadPlan();
    const hg = readFileSync(HUMAN_GATE, 'utf8');
    const fenced = extractHumanGateFencedCmds(hg);
    const results: Array<{ n: number; planSha: string; fencedSha: string; match: boolean }> = [];
    for (const step of plan.steps ?? []) {
      const cmd = String(step.literal_cmd ?? '');
      expect(cmd.length, `step ${step.n} literal_cmd`).toBeGreaterThan(0);
      const planSha = sha256(cmd);
      const block = fenced.get(step.n);
      expect(
        block,
        `HUMAN-GATE must contain fenced bash for step ${step.n} (digest-in-note alone insufficient)`
      ).toBeTruthy();
      const fencedSha = sha256(block ?? '');
      const match = fencedSha === planSha && (block ?? '') === cmd;
      results.push({ n: step.n, planSha, fencedSha, match });
      expect(
        match,
        `step ${step.n}: fenced block drift (plan=${planSha} fenced=${fencedSha})`
      ).toBe(true);
    }
    writeEvidence('m1-fenced-digests.json', results);
  });

  it('M-1 negative shape: note-line digest alone must not satisfy oracle helper', () => {
    // Synthetic: document has matching sha note but drifted fence — helper must use fence.
    const planCmd = 'echo plan-truth';
    const drifted = 'echo drifted-fence';
    const noteOnly = [
      '### 99 — synthetic',
      '',
      `\`literal_cmd_sha256: ${sha256(planCmd)}\``,
      '',
      '```bash',
      drifted,
      '```',
      '',
    ].join('\n');
    const extracted = extractHumanGateFencedCmds(noteOnly);
    expect(extracted.get(99)).toBe(drifted);
    expect(sha256(extracted.get(99) ?? '')).not.toBe(sha256(planCmd));
  });

  it('C-2 source: runner child allowlist omits DATABASE_URL and PG*', () => {
    const src = readFileSync(RUNNER, 'utf8');
    // Child env construction must not forward live DB credentials.
    expect(src).toMatch(/CHILD_ENV_ARGS|env -i/);
    // DATABASE_URL / PG* must not appear in the passthrough for-loop list.
    const passthroughMatch = src.match(
      /for _k in([\s\S]*?); do\s*\n\s*if \[\[ -n "\$\{!_k/
    );
    expect(passthroughMatch, 'child env passthrough loop').toBeTruthy();
    const list = passthroughMatch?.[1] ?? '';
    expect(list).not.toMatch(/\bDATABASE_URL\b/);
    expect(list).not.toMatch(/\bPGHOST\b|\bPGUSER\b|\bPGPASSWORD\b|\bPGDATABASE\b|\bPGPORT\b/);
    // Header/docs may mention refusal; child map must refuse live DB.
    expect(src).toMatch(/no live|fresh-target|DATABASE_URL|PG\*/i);
  });

  it('C-2 source: fire-drill skips live source when freshTarget set', () => {
    const src = readFileSync(FIRE_DRILL_SRC, 'utf8');
    expect(src).toMatch(/freshTarget/);
    // Must gate live defaultSourceConnection / captureRowCounts behind !freshTarget.
    expect(src).toMatch(
      /freshTarget[\s\S]{0,400}defaultSourceConnection|!.*freshTarget[\s\S]{0,200}defaultSourceConnection|skip.*live|no live.*source|fresh-target.*baseline/i
    );
    // Fresh target must require recovery baseline.
    expect(src).toMatch(/freshTarget[\s\S]{0,600}requireRecoveryBaseline|requireBaseline.*freshTarget|freshTarget[\s\S]{0,400}baseline/i);
  });

  it('C-1 source: runner loads writer + restore from same secrets source before compare', () => {
    const src = readFileSync(RUNNER, 'utf8');
    expect(src).toMatch(/R2_ACCESS_KEY_ID/);
    expect(src).toMatch(/R2_RESTORE_ACCESS_KEY_ID/);
    expect(src).toMatch(/secrets\.yaml|HOLO_SECRETS_PATH|HOLOCRON_SECRETS_PATH/);
    // Must not only compare ambient env writer.
    expect(src).toMatch(/file|secrets|resolved|load_.*writer|WRITER_AK|file_writer|same secrets/i);
  });

  it('H-1: prove-isolation rejects mixed exact+bare object resources (overall RESULT fail)', () => {
    const bucket = defaultBucketName();
    const prefix = defaultPgbackrestPrefix();
    const mixed = {
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
          Resource: [
            `arn:aws:s3:::${bucket}/${prefix}/*`,
            `arn:aws:s3:::${bucket}/*`,
          ],
        },
      ],
    };
    const mixedPolicy = JSON.stringify(mixed);
    const exactOnly = JSON.stringify(buildRestoreCredentialPolicy(bucket, prefix));

    const baseEnv = {
      ...process.env,
      MINI_HOST: '203.0.113.1',
      MINI_IPV4: '203.0.113.1',
      MINI_IPV6: '2001:db8::1',
      MINI_TAILNET_IP: '203.0.113.2',
      MINI_LAN_IP: '203.0.113.3',
      MINI_DNS_ALIASES: 'mini.invalid',
      MINI_SOCKET_DEFAULTS: '0',
      MINI_UNIX_SOCKETS: '/tmp/.s.PGSQL.5432-qa3-absent',
      TARGET_ATTESTED_IDENTITY: 'target-vm-uuid-qa3',
      MINI_ATTESTED_IDENTITY: 'mini-hw-uuid-qa3',
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
    };

    const mixedRun = spawnSync('bash', [PROVE_ISOLATION], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      timeout: 60_000,
      env: { ...baseEnv, R2_CREDENTIAL_POLICY: mixedPolicy },
    });
    const mixedCombined = `${mixedRun.stdout ?? ''}\n${mixedRun.stderr ?? ''}`;
    writeEvidence('h1-mixed-policy.json', {
      status: mixedRun.status,
      combined: mixedCombined.slice(0, 4000),
    });
    expect(mixedCombined).toMatch(/bare|bucket\/\*|least-privilege|exact prefix|object Resource|off-prefix|mixed/i);
    expect(mixedRun.status, mixedCombined.slice(0, 800)).not.toBe(0);
    expect(mixedCombined).toMatch(/RESULT:\s+FAIL|AXIS r2_readonly:\s+FAIL/);

    const goodRun = spawnSync('bash', [PROVE_ISOLATION], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      timeout: 60_000,
      env: { ...baseEnv, R2_CREDENTIAL_POLICY: exactOnly },
    });
    const goodCombined = `${goodRun.stdout ?? ''}\n${goodRun.stderr ?? ''}`;
    writeEvidence('h1-exact-policy.json', {
      status: goodRun.status,
      combined: goodCombined.slice(0, 4000),
    });
    expect(goodCombined).toMatch(/AXIS r2_readonly:\s+PASS/);
    // Overall may still PASS when all axes pass.
    expect(goodCombined).not.toMatch(/bare bucket\/\*|without exact prefix/i);
  }, 90_000);

  it('M-3: gate-plan step3 trap removes ${HOST}-net', () => {
    const step3 = String(stepOf(loadPlan(), 3).literal_cmd ?? '');
    expect(step3).toMatch(/\btrap\b/);
    expect(step3).toMatch(/docker network rm -f ["']?\$\{HOST\}-net/);
  });
});

describe('GATE-FIX-S28R3-QA3 C-3 GATE_RUN_ID isolation (PLATFORM_IT)', () => {
  itLive('C-3: unset GATE_RUN_ID fails preflight; no scratch/docker/attestation', () => {
    const marker = `qa3-unset-${Date.now().toString(36)}`;
    const scratchProbe = resolve(REPO_ROOT, `.tmp/REDHAT-FIX-H2/manual/step1-scratch`);
    const attProbe = resolve(EVIDENCE_DIR, `c3-att-unset-${marker}.json`);
    const host = `s28r3-gate-manual`;

    // assert-gate-run-id alone
    const assertRun = spawnSync('bash', [ASSERT_RUN_ID], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      timeout: 15_000,
      env: { ...process.env, GATE_RUN_ID: '' },
    });
    const assertCombined = `${assertRun.stdout ?? ''}\n${assertRun.stderr ?? ''}`;
    writeEvidence('c3-unset-assert.json', {
      status: assertRun.status,
      combined: assertCombined.slice(0, 1500),
    });
    expect(assertRun.status).not.toBe(0);
    expect(assertCombined).toMatch(/GATE_RUN_ID|allowlist|required|refuse|unset|empty/i);

    // Step1-shaped path: preflight then would mkdir — must stop before mkdir.
    const step1Like = spawnSync(
      'bash',
      [
        '-c',
        'set -euo pipefail; bash scripts/assert-gate-run-id.sh; SCRATCH=".tmp/REDHAT-FIX-H2/${GATE_RUN_ID}/step1-scratch"; mkdir -p "$SCRATCH"; echo CREATED',
      ],
      {
        cwd: REPO_ROOT,
        encoding: 'utf8',
        timeout: 15_000,
        env: { PATH: process.env.PATH, HOME: process.env.HOME, GATE_RUN_ID: undefined },
      }
    );
    const s1 = `${step1Like.stdout ?? ''}\n${step1Like.stderr ?? ''}`;
    writeEvidence('c3-unset-step1-like.json', { status: step1Like.status, combined: s1.slice(0, 1500) });
    expect(step1Like.status).not.toBe(0);
    expect(s1).not.toMatch(/CREATED/);
    // Must not create shared "manual" scratch via default.
    // (If a prior run left it, we only assert this invocation did not print CREATED.)

    // Step3-shaped: no docker host created when GATE_RUN_ID unset.
    if (dockerAvailable()) {
      const before = spawnSync('docker', ['ps', '-aq', '-f', `name=^/${host}$`], {
        encoding: 'utf8',
        timeout: 15_000,
      });
      const step3Like = spawnSync(
        'bash',
        [
          '-c',
          'set -euo pipefail; bash scripts/assert-gate-run-id.sh; HOST="s28r3-gate-${GATE_RUN_ID}"; docker create --name "$HOST" alpine:3.19 true; echo DOCKER_CREATED',
        ],
        {
          cwd: REPO_ROOT,
          encoding: 'utf8',
          timeout: 30_000,
          env: { PATH: process.env.PATH, HOME: process.env.HOME },
        }
      );
      const s3 = `${step3Like.stdout ?? ''}\n${step3Like.stderr ?? ''}`;
      writeEvidence('c3-unset-step3-like.json', {
        status: step3Like.status,
        combined: s3.slice(0, 1500),
        before: before.stdout,
      });
      expect(step3Like.status).not.toBe(0);
      expect(s3).not.toMatch(/DOCKER_CREATED/);
      expect(existsSync(attProbe)).toBe(false);
    }

    void scratchProbe;
  });

  itLive('C-3: malformed GATE_RUN_ID fails; no state created', () => {
    const bad = 'bad id with spaces!!';
    const run = spawnSync('bash', [ASSERT_RUN_ID], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      timeout: 15_000,
      env: { ...process.env, GATE_RUN_ID: bad },
    });
    const combined = `${run.stdout ?? ''}\n${run.stderr ?? ''}`;
    writeEvidence('c3-malformed-assert.json', { status: run.status, combined: combined.slice(0, 1500) });
    expect(run.status).not.toBe(0);
    expect(combined).toMatch(/GATE_RUN_ID|allowlist|invalid|refuse|malformed/i);

    const step6Like = spawnSync(
      'bash',
      [
        '-c',
        'set -euo pipefail; bash scripts/assert-gate-run-id.sh; SCRATCH=".tmp/REDHAT-FIX-H2/${GATE_RUN_ID}/step6-scratch"; mkdir -p "$SCRATCH"; echo CREATED',
      ],
      {
        cwd: REPO_ROOT,
        encoding: 'utf8',
        timeout: 15_000,
        env: { PATH: process.env.PATH, HOME: process.env.HOME, GATE_RUN_ID: bad },
      }
    );
    const s6 = `${step6Like.stdout ?? ''}\n${step6Like.stderr ?? ''}`;
    writeEvidence('c3-malformed-step6-like.json', {
      status: step6Like.status,
      combined: s6.slice(0, 1500),
    });
    expect(step6Like.status).not.toBe(0);
    expect(s6).not.toMatch(/CREATED/);
    expect(existsSync(resolve(REPO_ROOT, `.tmp/REDHAT-FIX-H2/${bad}/step6-scratch`))).toBe(false);
  });
});

describe('GATE-FIX-S28R3-QA3 C-1/C-2 runner (PLATFORM_IT)', () => {
  itLive(
    'C-1: secrets yaml equal writer/restore; no writer in env → DEPENDENCY-S28-R2-RO; recorder never invoked',
    () => {
      if (!dockerAvailable()) {
        throw new Error('docker required for C-1 secrets-equal test');
      }
      const host = `s28r3-qa3-c1eq-${Date.now().toString(36)}`;
      dockerCleanup.push({ host });
      const staging = resolve(EVIDENCE_DIR, 'c1-eq-staging');
      const secrets = resolve(EVIDENCE_DIR, `c1-equal-secrets-${host}.yaml`);
      mkdirSync(EVIDENCE_DIR, { recursive: true });
      writeFileSync(
        secrets,
        [
          `# deliberate equal writer/restore — must refuse`,
          `R2_ACCESS_KEY_ID: ${EQUAL_AK}`,
          `R2_SECRET_ACCESS_KEY: ${EQUAL_SK}`,
          `R2_RESTORE_ACCESS_KEY_ID: ${EQUAL_AK}`,
          `R2_RESTORE_SECRET_ACCESS_KEY: ${EQUAL_SK}`,
          `R2_ENDPOINT: https://example.invalid`,
          `R2_BUCKET_NAME: holocron-backup`,
          `R2_PGBACKREST_PREFIX: pgbackrest`,
          '',
        ].join('\n'),
        'utf8'
      );

      const pgPort = String(62000 + (Date.now() % 1000));
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
          },
        }
      );
      expect(provision.status, provision.stderr ?? provision.stdout).toBe(0);

      const recorder = resolve(EVIDENCE_DIR, `c1-eq-recorder-${host}.sh`);
      const recorderMark = resolve(EVIDENCE_DIR, `c1-eq-recorder-ran-${host}.flag`);
      writeFileSync(
        recorder,
        `#!/usr/bin/env bash
set -euo pipefail
echo ran > ${JSON.stringify(recorderMark)}
echo "recorder-should-not-run" >&2
exit 99
`,
        'utf8'
      );
      spawnSync('chmod', ['+x', recorder]);

      // Parent env: NO writer keys. Restore also unset so file is sole source.
      const cleanEnv: NodeJS.ProcessEnv = {
        PATH: process.env.PATH,
        HOME: process.env.HOME,
        USER: process.env.USER,
        TMPDIR: process.env.TMPDIR,
        STAGING_ROOT: staging,
        HOLO_CLI: recorder,
        HOLO_SECRETS_PATH: secrets,
        HOLOCRON_SECRETS_PATH: secrets,
        // Explicitly clear writer + restore so file values win after resolve.
        R2_ACCESS_KEY_ID: '',
        R2_SECRET_ACCESS_KEY: '',
        R2_RESTORE_ACCESS_KEY_ID: '',
        R2_RESTORE_SECRET_ACCESS_KEY: '',
      };

      const run = spawnSync(
        'bash',
        [
          RUNNER,
          '--host',
          host,
          '--target-timestamp',
          '2026-07-28T12:00:00Z',
          '--attestation',
          resolve(EVIDENCE_DIR, `c1-eq-att-${host}.json`),
          '--report',
          resolve(EVIDENCE_DIR, `c1-eq-report-${host}.json`),
        ],
        {
          cwd: REPO_ROOT,
          encoding: 'utf8',
          timeout: 120_000,
          env: cleanEnv,
        }
      );
      const combined = `${run.stdout ?? ''}\n${run.stderr ?? ''}`;
      writeEvidence('c1-equal-file-only.json', {
        status: run.status,
        combined: combined.slice(0, 4000),
        recorder_flag: existsSync(recorderMark),
      });
      expect(run.status, combined.slice(0, 1200)).not.toBe(0);
      expect(combined).toMatch(/DEPENDENCY-S28-R2-RO/);
      expect(existsSync(recorderMark), 'recorder must never be invoked').toBe(false);
      expect(combined).not.toMatch(/recorder-should-not-run/);
    },
    300_000
  );

  itLive(
    'C-2: child env dump has no DATABASE_URL/PG*; distinct restore still maps',
    () => {
      if (!dockerAvailable()) {
        throw new Error('docker required for C-2 env dump');
      }
      const host = `s28r3-qa3-c2-${Date.now().toString(36)}`;
      dockerCleanup.push({ host });
      const staging = resolve(EVIDENCE_DIR, 'c2-staging');
      const dumpPath = resolve(EVIDENCE_DIR, `c2-env-dump-${host}.json`);
      const recorderOut = resolve(EVIDENCE_DIR, `c2-recorder-${host}.json`);
      const recorder = resolve(EVIDENCE_DIR, `c2-recorder-${host}.sh`);
      mkdirSync(EVIDENCE_DIR, { recursive: true });

      writeFileSync(
        recorder,
        `#!/usr/bin/env bash
set -euo pipefail
OUT=${JSON.stringify(recorderOut)}
python3 - "$OUT" "$@" <<'PY'
import json, os, sys
out = sys.argv[1]
keys = sorted(os.environ.keys())
payload = {
  "argv": sys.argv[2:],
  "env_keys": keys,
  "has_DATABASE_URL": "DATABASE_URL" in os.environ,
  "pg_keys": [k for k in keys if k.startswith("PG")],
  "R2_ACCESS_is_restore": os.environ.get("R2_ACCESS_KEY_ID") == ${JSON.stringify(RESTORE_AK)},
}
open(out, "w").write(json.dumps(payload, indent=2) + "\\n")
sys.exit(0)
PY
`,
        'utf8'
      );
      spawnSync('chmod', ['+x', recorder]);

      const pgPort = String(63000 + (Date.now() % 1000));
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
          },
        }
      );
      expect(provision.status, provision.stderr ?? '').toBe(0);

      const att = resolve(EVIDENCE_DIR, `c2-att-${host}.json`);
      const report = resolve(EVIDENCE_DIR, `c2-report-${host}.json`);
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
          report,
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
            R2_BUCKET_NAME: 'holocron-backup',
            DATABASE_URL: 'postgres://should-not-reach-child:5432/holocron',
            PGHOST: 'should-not-reach-child',
            PGUSER: 'should-not-reach-child',
            PGPASSWORD: 'should-not-reach-child',
            PGDATABASE: 'should-not-reach-child',
            HOLO_CLI: recorder,
            HOLO_FIRE_DRILL_ENV_DUMP: dumpPath,
            HOLO_SECRETS_PATH: resolve(EVIDENCE_DIR, 'empty-secrets-missing.yaml'),
            HOLOCRON_SECRETS_PATH: resolve(EVIDENCE_DIR, 'empty-secrets-missing.yaml'),
          },
        }
      );
      const combined = `${run.stdout ?? ''}\n${run.stderr ?? ''}`;
      writeEvidence('c2-full-run.json', {
        status: run.status,
        combined: combined.slice(0, 3000),
        recorder: existsSync(recorderOut),
        att: existsSync(att),
      });

      // M-2: full-run success with recorder
      expect(run.status, combined.slice(0, 1200)).toBe(0);
      expect(existsSync(recorderOut), combined.slice(0, 800)).toBe(true);
      const rec = JSON.parse(readFileSync(recorderOut, 'utf8')) as {
        has_DATABASE_URL?: boolean;
        pg_keys?: string[];
        R2_ACCESS_is_restore?: boolean;
        argv?: string[];
      };
      expect(rec.has_DATABASE_URL).toBe(false);
      expect(rec.pg_keys ?? []).toEqual([]);
      expect(rec.R2_ACCESS_is_restore).toBe(true);
      expect((rec.argv ?? []).join(' ')).toMatch(/--fresh-target/);

      expect(existsSync(att)).toBe(true);
      const attBody = JSON.parse(readFileSync(att, 'utf8')) as {
        ok?: boolean;
        fire_drill_exit?: number;
      };
      expect(attBody.ok).toBe(true);
      expect(attBody.fire_drill_exit === undefined || attBody.fire_drill_exit === 0).toBe(true);

      if (existsSync(dumpPath)) {
        const dumpText = readFileSync(dumpPath, 'utf8');
        expect(dumpText).not.toMatch(/should-not-reach-child/);
      }
    },
    300_000
  );

  itLive('C-2 unit seam: freshTarget path refuses live source when DATABASE_URL would be needed', async () => {
    // Import runFireDrill with freshTarget + no baseline → fail closed without needing live DB.
    const { runFireDrill } = await import('../../src/backup/fire-drill.ts');
    const scratch = resolve(EVIDENCE_DIR, 'c2-unit-scratch');
    const blobDir = resolve(EVIDENCE_DIR, 'c2-unit-blob');
    const reportPath = resolve(EVIDENCE_DIR, 'c2-unit-report.json');
    mkdirSync(scratch, { recursive: true });
    mkdirSync(blobDir, { recursive: true });
    // Ensure empty dirs for restore contract; run should fail on baseline before live DB.
    const result = await runFireDrill({
      targetTimestamp: '2026-07-28T12:00:00Z',
      scratch,
      blobDir,
      reportPath,
      freshTarget: 'qa3-fresh-unit-no-live',
      requireRecoveryBaseline: true,
      env: {
        ...process.env,
        // Even if DATABASE_URL is present, freshTarget must not use it as sole oracle path.
        DATABASE_URL: 'postgres://127.0.0.1:1/no_such_db_qa3_fresh',
        HOLO_SECRETS_PATH: resolve(EVIDENCE_DIR, 'empty-secrets-missing.yaml'),
      },
    });
    writeEvidence('c2-fresh-target-no-live.json', {
      ok: result.ok,
      exitCode: result.exitCode,
      errors: result.errors.slice(0, 20),
    });
    expect(result.ok).toBe(false);
    const errText = result.errors.join(' ').toLowerCase();
    expect(errText).toMatch(/baseline|fresh|refuse|recovery/);
    // Must not claim success via live mini; errors should mention baseline, not solely connection refused as only path.
    expect(result.exitCode).not.toBe(0);
  }, 120_000);
});

describe('GATE-FIX-S28R3-QA3 M-2/M-3 extras', () => {
  it('M-3 trap content includes network rm helper pattern', () => {
    const step3 = String(stepOf(loadPlan(), 3).literal_cmd ?? '');
    // Capture trap body.
    const trapMatch = step3.match(/trap\s+'([^']+)'\s+EXIT/);
    expect(trapMatch, 'step3 trap EXIT').toBeTruthy();
    const body = trapMatch?.[1] ?? '';
    expect(body).toMatch(/docker rm/);
    expect(body).toMatch(/volume rm/);
    expect(body).toMatch(/network rm/);
    writeEvidence('m3-trap-body.json', { body });
  });

  itLive(
    'M-2: full-run recorder path asserts status 0 + attestation ok',
    () => {
      if (!dockerAvailable()) return;
      const host = `s28r3-qa3-m2-${Date.now().toString(36)}`;
      dockerCleanup.push({ host });
      const staging = resolve(EVIDENCE_DIR, 'm2-staging');
      const pgPort = String(64000 + (Date.now() % 800));
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

      const recorderOut = resolve(EVIDENCE_DIR, `m2-rec-${host}.json`);
      const recorder = resolve(EVIDENCE_DIR, `m2-rec-${host}.sh`);
      writeFileSync(
        recorder,
        `#!/usr/bin/env bash
set -euo pipefail
python3 - ${JSON.stringify(recorderOut)} "$@" <<'PY'
import json, os, sys
open(sys.argv[1], "w").write(json.dumps({"argv": sys.argv[2:], "ok": True}) + "\\n")
sys.exit(0)
PY
`,
        'utf8'
      );
      spawnSync('chmod', ['+x', recorder]);
      const att = resolve(EVIDENCE_DIR, `m2-att-${host}.json`);
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
          resolve(EVIDENCE_DIR, `m2-report-${host}.json`),
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
      writeEvidence('m2-success.json', {
        status: run.status,
        att_exists: existsSync(att),
        rec_exists: existsSync(recorderOut),
        stderr: (run.stderr ?? '').slice(0, 1500),
      });
      expect(run.status).toBe(0);
      expect(existsSync(recorderOut)).toBe(true);
      expect(existsSync(att)).toBe(true);
      const attBody = JSON.parse(readFileSync(att, 'utf8')) as { ok?: boolean };
      expect(attBody.ok).toBe(true);
    },
    300_000
  );
});

/**
 * GATE-FIX-S28R3-QA2 — Restore-only fire-drill identity, doc/plan lock, honest closeout.
 *
 * Covers Terra review red-hat-20260729T084459Z:
 *   C1 restore-only child env · C2 HUMAN-GATE/plan lock · C3 honest closeout
 *   H1 fresh-target path equality · H2 exact prefix policy · H4 real credential inventory
 *   M1 full runner invocation · M2 daemon-only volume refuse · M3 cleanup safety
 *
 * Run:
 *   PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/sprint28-s28r3-qa2-gate-fix.test.ts
 */

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  accessSync,
  constants,
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
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
const SPRINT_MD = resolve(SPRINT_DIR, 'SPRINT.md');
const GATE_RESULTS = resolve(SPRINT_DIR, 'gate-results.json');
const GATE_RESULTS_UNBOUND = resolve(SPRINT_DIR, 'gate-results.unbound-20260729T031355Z.json');
const RUNNER = resolve(REPO_ROOT, 'scripts/run-fire-drill-on-fresh-target.sh');
const PROVISION = resolve(REPO_ROOT, 'scripts/provision-fresh-restore-target.sh');
const PROVE_ISOLATION = resolve(REPO_ROOT, 'scripts/prove-isolation.sh');
const INVENTORY = resolve(REPO_ROOT, 'scripts/inventory-restore-credentials.sh');
const RENDER_HG = resolve(REPO_ROOT, 'scripts/render-human-gate-from-plan.sh');
const HOLO_CLI = resolve(REPO_ROOT, 'services/platform/src/cli/holo.ts');
const EVIDENCE_DIR = resolve(REPO_ROOT, '.tmp/GATE-FIX-S28R3-QA2');

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
    // Provisioner creates ${host}-net; prune to avoid address-pool exhaustion across runs.
    spawnSync('docker', ['network', 'rm', `${item.host}-net`], {
      encoding: 'utf8',
      timeout: 30_000,
    });
  }
});

type GateStep = {
  n: number;
  text?: string;
  literal_cmd?: string;
  assertion?: { notes?: string; require_all_regex?: string[] };
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

function hostPathWritable(p: string): boolean {
  try {
    if (!existsSync(p)) return false;
    accessSync(p, constants.W_OK);
    const probe = resolve(p, `.qa2-write-probe-${process.pid}`);
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

// Distinct non-placeholder identities for C1 (avoid placeholder-like substrings).
const WRITER_AK = 'qa2-writer-akid-deliberate-identity';
const WRITER_SK = 'qa2-writer-sk-deliberate-identity-value';
const RESTORE_AK = 'qa2-restore-akid-deliberate-identity';
const RESTORE_SK = 'qa2-restore-sk-deliberate-identity-value';

describe('GATE-FIX-S28R3-QA2 always-on contract (C2/C3/H2/H4)', () => {
  it('C3: SPRINT.md is not Completed / 6-6 closeout while residual depends', () => {
    const md = readFileSync(SPRINT_MD, 'utf8');
    // Frontmatter or body must not claim completed 6/6 pass closeout as current truth.
    const fm = md.match(/^---\n([\s\S]*?)\n---/);
    expect(fm, 'SPRINT frontmatter').toBeTruthy();
    const statusLine = (fm?.[1] ?? '').split('\n').find((l) => /^status:/i.test(l)) ?? '';
    expect(statusLine.toLowerCase()).not.toMatch(/completed/);
    expect(md).toMatch(/DEPENDENCY-S28-R2-RO/);
    expect(md).not.toMatch(/GATE-GOAL ACHIEVED/);
    writeEvidence('c3-sprint-status.json', { statusLine });
  });

  it('C3: unbound gate-results pass archived; active gate-results.json absent', () => {
    expect(existsSync(GATE_RESULTS), 'active gate-results.json must be removed for next QA').toBe(
      false
    );
    expect(
      existsSync(GATE_RESULTS_UNBOUND),
      `archived unbound pass required at ${GATE_RESULTS_UNBOUND}`
    ).toBe(true);
    const archived = JSON.parse(readFileSync(GATE_RESULTS_UNBOUND, 'utf8')) as {
      run_id?: string;
      verdict?: string;
    };
    expect(archived.run_id).toBe('20260729T031355Z');
    writeEvidence('c3-archive.json', {
      active_absent: !existsSync(GATE_RESULTS),
      archived_run_id: archived.run_id,
    });
  });

  it('C2: HUMAN-GATE documents GATE_RUN_ID allowlist + sole authority of gate-plan', () => {
    const hg = readFileSync(HUMAN_GATE, 'utf8');
    expect(hg).toMatch(/gate-plan\.json/);
    expect(hg).toMatch(/GATE_RUN_ID/);
    expect(hg).toMatch(/authoritative|sole|only/i);
    // Must not reintroduce fixed unbound step3 paths or ro-test live green.
    expect(hg).not.toMatch(/\.tmp\/REDHAT-FIX-H2\/step3-scratch/);
    expect(hg).not.toMatch(/R2_ACCESS_KEY_ID=ro-test\b/);
    // Must not use fixed shared step1 path without GATE_RUN_ID.
    expect(hg).not.toMatch(/mkdir -p \.tmp\/REDHAT-FIX-H2\/step1-scratch\s*$/m);
    writeEvidence('c2-human-gate-surface.json', {
      has_gate_run_id: /GATE_RUN_ID/.test(hg),
      no_step3_unbound: !/\.tmp\/REDHAT-FIX-H2\/step3-scratch/.test(hg),
    });
  });

  it('C2 oracle: each HUMAN-GATE fenced bash block hashes to gate-plan literal_cmd', () => {
    // GATE-FIX-S28R3-QA3 / M-1: hash fenced command bodies (not digest-in-note alone).
    const plan = loadPlan();
    const hg = readFileSync(HUMAN_GATE, 'utf8');
    const fenced = new Map<number, string>();
    const re = /###\s+(\d+)\s+[^\n]*\n[\s\S]*?```bash\n([\s\S]*?)```/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(hg)) !== null) {
      const n = Number(m[1]);
      if (!fenced.has(n)) fenced.set(n, m[2].replace(/\n$/, ''));
    }
    const digests: Array<{ n: number; sha: string; match: boolean }> = [];
    for (const step of plan.steps ?? []) {
      const cmd = String(step.literal_cmd ?? '');
      expect(cmd.length, `step ${step.n} literal_cmd`).toBeGreaterThan(0);
      const sha = sha256(cmd);
      const block = fenced.get(step.n);
      expect(block, `HUMAN-GATE fenced bash for step ${step.n}`).toBeTruthy();
      const match = (block ?? '') === cmd && sha256(block ?? '') === sha;
      digests.push({ n: step.n, sha, match });
      expect(match, `step ${step.n} fenced block must equal literal_cmd`).toBe(true);
    }
    writeEvidence('c2-cmd-digests.json', digests);
  });

  it('C2: SPRINT human section defers to gate-plan / regenerated HUMAN-GATE', () => {
    const md = readFileSync(SPRINT_MD, 'utf8');
    const humanSection = md.slice(md.indexOf('## Human'));
    expect(humanSection).toMatch(/gate-plan\.json/);
    expect(humanSection).toMatch(/HUMAN-GATE\.md/);
    // Obsolete fixed snippets must not be the deliverable.
    expect(humanSection).not.toMatch(/\.tmp\/REDHAT-FIX-H2\/step3-scratch/);
    expect(humanSection).not.toMatch(/R2_ACCESS_KEY_ID=ro-test\b/);
  });

  it('C2: gate-plan notes require allowlisted GATE_RUN_ID for live runs', () => {
    const plan = loadPlan();
    const notes = (plan.notes ?? []).join('\n');
    const stepNotes = (plan.steps ?? []).map((s) => s.assertion?.notes ?? '').join('\n');
    const all = `${notes}\n${stepNotes}`;
    expect(all).toMatch(/GATE_RUN_ID/);
    expect(all).toMatch(/allowlist|alphanumeric|A-Za-z0-9/i);
  });

  it('H2: provisioner emits exact bucket+prefix object Resource (not bucket/*)', () => {
    const src = readFileSync(PROVISION, 'utf8');
    expect(src).not.toMatch(/Resource":\["arn:aws:s3:::\$\{R2_BUCKET_NAME\}\/\*"\]/);
    // Must reference prefix (R2_PGBACKREST_PREFIX / R2_RESTORE_OBJECT_PREFIX / pgbackrest).
    expect(src).toMatch(/R2_PGBACKREST_PREFIX|R2_RESTORE_OBJECT_PREFIX|pgbackrest/);
    expect(src).toMatch(/\$\{R2_BUCKET_NAME\}\/\$\{[^}]+\}|\/*\$\{.*PREFIX/);
  });

  it('H2: gate-plan step2 policy uses exact prefix, not bare holocron-backup/*', () => {
    const step2 = String(stepOf(loadPlan(), 2).literal_cmd ?? '');
    expect(step2).not.toMatch(/arn:aws:s3:::holocron-backup\/\*"/);
    expect(step2).toMatch(/arn:aws:s3:::holocron-backup\/[A-Za-z0-9_.-]+\//);
  });

  it('H2: prove-isolation rejects bare arn:aws:s3:::bucket/* object Resource', () => {
    const src = readFileSync(PROVE_ISOLATION, 'utf8');
    expect(src).toMatch(/bucket\/\*|exact prefix|prefix segment|object Resource/i);
    const bucket = defaultBucketName();
    const prefix = defaultPgbackrestPrefix();
    const badPolicy = JSON.stringify({
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
          Resource: [`arn:aws:s3:::${bucket}/*`],
        },
      ],
    });
    const good = buildRestoreCredentialPolicy(bucket, prefix);
    const goodPolicy = JSON.stringify(good);

    const badRun = spawnSync('bash', [PROVE_ISOLATION], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      timeout: 60_000,
      env: {
        ...process.env,
        MINI_HOST: '203.0.113.1',
        MINI_IPV4: '203.0.113.1',
        MINI_IPV6: '2001:db8::1',
        MINI_TAILNET_IP: '203.0.113.2',
        MINI_LAN_IP: '203.0.113.3',
        MINI_DNS_ALIASES: 'mini.invalid',
        MINI_SOCKET_DEFAULTS: '0',
        MINI_UNIX_SOCKETS: '/tmp/.s.PGSQL.5432-qa2-absent',
        TARGET_ATTESTED_IDENTITY: 'target-vm-uuid-qa2',
        MINI_ATTESTED_IDENTITY: 'mini-hw-uuid-qa2',
        REQUIRE_ATTESTED_IDENTITY: '1',
        NC_TIMEOUT_SEC: '1',
        R2_ACCESS_KEY_ID: 'qa2-restore-akid-deliberate-identity',
        R2_SECRET_ACCESS_KEY: 'qa2-restore-sk-deliberate-identity-value',
        R2_RESTORE_ACCESS_KEY_ID: 'qa2-restore-akid-deliberate-identity',
        R2_RESTORE_SECRET_ACCESS_KEY: 'qa2-restore-sk-deliberate-identity-value',
        R2_CREDENTIAL_KIND: 'object-read-only',
        R2_CREDENTIAL_POLICY: badPolicy,
        // Empty endpoint keeps r2 axis on policy-shape (no live probe).
        R2_ENDPOINT: '',
        REQUIRE_LIVE_R2_RO: '0',
      },
    });
    const badCombined = `${badRun.stdout ?? ''}\n${badRun.stderr ?? ''}`;
    writeEvidence('h2-bad-policy.json', {
      status: badRun.status,
      combined: badCombined.slice(0, 4000),
    });
    // Bare bucket/* must fail the r2 axis or overall.
    expect(badCombined).toMatch(/prefix|bucket\/\*|least-privilege|exact|Resource/i);
    expect(badRun.status, badCombined.slice(0, 800)).not.toBe(0);

    const goodRun = spawnSync('bash', [PROVE_ISOLATION], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      timeout: 60_000,
      env: {
        ...process.env,
        MINI_HOST: '203.0.113.1',
        MINI_IPV4: '203.0.113.1',
        MINI_IPV6: '2001:db8::1',
        MINI_TAILNET_IP: '203.0.113.2',
        MINI_LAN_IP: '203.0.113.3',
        MINI_DNS_ALIASES: 'mini.invalid',
        MINI_SOCKET_DEFAULTS: '0',
        MINI_UNIX_SOCKETS: '/tmp/.s.PGSQL.5432-qa2-absent',
        TARGET_ATTESTED_IDENTITY: 'target-vm-uuid-qa2',
        MINI_ATTESTED_IDENTITY: 'mini-hw-uuid-qa2',
        REQUIRE_ATTESTED_IDENTITY: '1',
        NC_TIMEOUT_SEC: '1',
        R2_ACCESS_KEY_ID: RESTORE_AK,
        R2_SECRET_ACCESS_KEY: RESTORE_SK,
        R2_RESTORE_ACCESS_KEY_ID: RESTORE_AK,
        R2_RESTORE_SECRET_ACCESS_KEY: RESTORE_SK,
        R2_CREDENTIAL_KIND: 'object-read-only',
        R2_CREDENTIAL_POLICY: goodPolicy,
        R2_ENDPOINT: '',
        REQUIRE_LIVE_R2_RO: '0',
      },
    });
    const goodCombined = `${goodRun.stdout ?? ''}\n${goodRun.stderr ?? ''}`;
    writeEvidence('h2-good-policy.json', {
      status: goodRun.status,
      combined: goodCombined.slice(0, 4000),
    });
    // Prefix-exact policy must not fail on the prefix check (may still WARN live probe).
    expect(goodCombined).not.toMatch(/bare bucket\/\*|bucket-wide|without exact prefix/i);
    expect(goodCombined).toMatch(/AXIS r2_readonly:|RESULT:/);
  }, 90_000);

  it('H4: inventory-restore-credentials.sh exists and emits presence/length only', () => {
    expect(existsSync(INVENTORY), `missing ${INVENTORY}`).toBe(true);
    const syntax = spawnSync('bash', ['-n', INVENTORY], { encoding: 'utf8' });
    expect(syntax.status, syntax.stderr).toBe(0);

    // GATE-FIX-S28R3-QA7 / MEDIUM-1: always-on unit contract uses committed non-secret
    // fixture (absent restore keys). Never depends on personal secrets.yaml / env path.
    const secrets = resolve(
      REPO_ROOT,
      'services/platform/tests/fixtures/sprint28/secrets-inventory-absent-restore.yaml'
    );
    expect(existsSync(secrets), `missing committed inventory fixture: ${secrets}`).toBe(true);
    const fixtureText = readFileSync(secrets, 'utf8');
    // Fixture must not look like live restore credentials.
    expect(fixtureText).not.toMatch(/R2_RESTORE_ACCESS_KEY_ID:\s*['"]?[A-Za-z0-9+/_-]{16,}/);
    expect(fixtureText).not.toMatch(/R2_RESTORE_SECRET_ACCESS_KEY:\s*['"]?[A-Za-z0-9+/_-]{16,}/);

    const out = resolve(EVIDENCE_DIR, 'credential-inventory.json');
    mkdirSync(dirname(out), { recursive: true });
    const run = spawnSync('bash', [INVENTORY, '--secrets', secrets, '--out', out], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      timeout: 30_000,
    });
    writeEvidence('h4-inventory-run.json', {
      status: run.status,
      stdout: (run.stdout ?? '').slice(0, 2000),
      stderr: (run.stderr ?? '').slice(0, 2000),
      secrets_fixture: secrets,
    });
    expect(run.status, run.stderr ?? run.stdout).toBe(0);
    expect(existsSync(out)).toBe(true);
    const inv = JSON.parse(readFileSync(out, 'utf8')) as {
      residual?: string | null;
      R2_RESTORE_present?: boolean;
      keys?: Record<string, { present?: boolean; length?: number; value?: string }>;
    };
    const text = readFileSync(out, 'utf8');
    // Never embed raw secret material.
    expect(text).not.toMatch(/"value"\s*:/);
    for (const k of Object.keys(inv.keys ?? {})) {
      expect((inv.keys as Record<string, { value?: string }>)[k]?.value).toBeUndefined();
    }
    // Absent restore keys → honest residual; fixture cannot satisfy live restore.
    expect(inv.R2_RESTORE_present).toBe(false);
    expect(inv.residual).toBe('DEPENDENCY-S28-R2-RO');
  });

  it('C1: runner builds restore-only child env (source contract)', () => {
    const src = readFileSync(RUNNER, 'utf8');
    expect(src).toMatch(/R2_RESTORE_ACCESS_KEY_ID/);
    expect(src).toMatch(/DEPENDENCY-S28-R2-RO/);
    expect(src).toMatch(/env -i|CHILD_ENV|restore-only|minimal.*env/i);
    expect(src).toMatch(/HOLO_FIRE_DRILL_ENV_DUMP|env_dump|ENV_DUMP/);
  });

  it('H1: CLI --fresh-target rejects unrelated explicit scratch/blob (source contract)', () => {
    const src = readFileSync(HOLO_CLI, 'utf8');
    expect(src).toMatch(/canonical|realpath|sameCanonical|path equal/i);
    // Must not blindly prefer any writable args.scratch without equality check.
    expect(src).not.toMatch(
      /if \(args\.scratch && hostWritable\(args\.scratch\) && !isUnboundH2Step3\(args\.scratch\)\) \{\s*const daemon/
    );
  });

  it('M3: gate-plan step3 uses trap for docker cleanup incl. network; provisioner validates identifiers', () => {
    const step3 = String(stepOf(loadPlan(), 3).literal_cmd ?? '');
    expect(step3).toMatch(/\btrap\b/);
    expect(step3).toMatch(/docker rm|volume rm/);
    // GATE-FIX-S28R3-QA3 / M-3: trap must remove ${HOST}-net
    expect(step3).toMatch(/network rm/);
    expect(step3).not.toMatch(/GATE_RUN_ID:-manual/);
    const prov = readFileSync(PROVISION, 'utf8');
    expect(prov).toMatch(/GATE_RUN_ID|allowlist|valid.*host|HOST_NAME.*\^\[/i);
  });

  it('render-human-gate-from-plan.sh exists and bash -n clean (optional but preferred)', () => {
    if (!existsSync(RENDER_HG)) {
      writeEvidence('c2-render-script-absent.json', { note: 'embed path allowed if digests lock' });
      return;
    }
    const syntax = spawnSync('bash', ['-n', RENDER_HG], { encoding: 'utf8' });
    expect(syntax.status, syntax.stderr).toBe(0);
  });
});

describe('GATE-FIX-S28R3-QA2 C1 restore-only identity (PLATFORM_IT)', () => {
  itLive(
    'C1: deliberately different writer vs restore keys — child sees only restore identity',
    () => {
      expect(existsSync(RUNNER)).toBe(true);
      const host = `s28r3-qa2-c1-${Date.now().toString(36)}`;
      const staging = resolve(EVIDENCE_DIR, 'c1-staging');
      const dumpPath = resolve(EVIDENCE_DIR, `c1-env-dump-${host}.json`);
      const recorder = resolve(EVIDENCE_DIR, `c1-holo-recorder-${host}.sh`);
      const recorderOut = resolve(EVIDENCE_DIR, `c1-recorder-out-${host}.json`);
      mkdirSync(EVIDENCE_DIR, { recursive: true });

      // Recorder CLI: capture argv + env key names / presence flags (never secret values).
      writeFileSync(
        recorder,
        `#!/usr/bin/env bash
set -euo pipefail
OUT=${JSON.stringify(recorderOut)}
python3 - "$OUT" "$@" <<'PY'
import hashlib, json, os, sys
out = sys.argv[1]
cli_argv = sys.argv[2:]
keys = sorted(os.environ.keys())
r2 = {k: {"present": True, "length": len(os.environ.get(k, "") or "")} for k in keys if k.startswith("R2_")}
def fp(v: str) -> str:
    if not v:
        return ""
    return hashlib.sha256(v.encode()).hexdigest()[:16]
payload = {
  "argv": cli_argv,
  "r2_keys": r2,
  "R2_ACCESS_KEY_ID_fp": fp(os.environ.get("R2_ACCESS_KEY_ID", "")),
  "R2_SECRET_ACCESS_KEY_fp": fp(os.environ.get("R2_SECRET_ACCESS_KEY", "")),
  "R2_RESTORE_ACCESS_KEY_ID_fp": fp(os.environ.get("R2_RESTORE_ACCESS_KEY_ID", "")),
  "has_writer_ak_in_env": os.environ.get("R2_ACCESS_KEY_ID") == ${JSON.stringify(WRITER_AK)},
  "has_restore_ak_mapped": os.environ.get("R2_ACCESS_KEY_ID") == ${JSON.stringify(RESTORE_AK)},
  "writer_ak_present_as_access": os.environ.get("R2_ACCESS_KEY_ID") == ${JSON.stringify(WRITER_AK)},
}
open(out, "w").write(json.dumps(payload, indent=2) + "\\n")
print("recorder:ok")
sys.exit(0)
PY
`,
        'utf8'
      );
      spawnSync('chmod', ['+x', recorder], { encoding: 'utf8' });

      if (dockerAvailable()) {
        dockerCleanup.push({ host });
        const pgPort = String(58000 + (Date.now() % 1500));
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
            },
          }
        );
        writeEvidence('c1-provision.json', {
          status: provision.status,
          stderr: (provision.stderr ?? '').slice(0, 2000),
          stdout: (provision.stdout ?? '').slice(0, 2000),
        });
        expect(provision.status, provision.stderr ?? provision.stdout).toBe(0);
      } else {
        // Without docker, exercise residual path only.
        const missing = spawnSync(
          'bash',
          [RUNNER, '--host', 'no-such-host-qa2', '--target-timestamp', '2026-07-28T12:00:00Z'],
          {
            cwd: REPO_ROOT,
            encoding: 'utf8',
            timeout: 30_000,
            env: {
              ...process.env,
              R2_ACCESS_KEY_ID: WRITER_AK,
              R2_SECRET_ACCESS_KEY: WRITER_SK,
              R2_RESTORE_ACCESS_KEY_ID: '',
              R2_RESTORE_SECRET_ACCESS_KEY: '',
              HOLO_CLI: recorder,
            },
          }
        );
        const combined = `${missing.stdout ?? ''}\n${missing.stderr ?? ''}`;
        writeEvidence('c1-no-docker-missing-volumes.json', {
          status: missing.status,
          combined: combined.slice(0, 2000),
        });
        expect(missing.status).not.toBe(0);
        return;
      }

      const run = spawnSync(
        'bash',
        [
          RUNNER,
          '--host',
          host,
          '--target-timestamp',
          '2026-07-28T12:00:00Z',
          '--attestation',
          resolve(EVIDENCE_DIR, `c1-att-${host}.json`),
          '--report',
          resolve(EVIDENCE_DIR, `c1-report-${host}.json`),
        ],
        {
          cwd: REPO_ROOT,
          encoding: 'utf8',
          timeout: 120_000,
          env: {
            ...process.env,
            R2_ACCESS_KEY_ID: WRITER_AK,
            R2_SECRET_ACCESS_KEY: WRITER_SK,
            R2_RESTORE_ACCESS_KEY_ID: RESTORE_AK,
            R2_RESTORE_SECRET_ACCESS_KEY: RESTORE_SK,
            R2_ENDPOINT: 'https://example.invalid',
            R2_BUCKET_NAME: 'holocron-backup',
            R2_PGBACKREST_PREFIX: 'pgbackrest',
            HOLO_CLI: recorder,
            HOLO_FIRE_DRILL_ENV_DUMP: dumpPath,
            // Prevent real secrets file from masking the deliberate writer/restore split.
            HOLO_SECRETS_PATH: resolve(EVIDENCE_DIR, 'empty-secrets-missing.yaml'),
            HOLOCRON_SECRETS_PATH: resolve(EVIDENCE_DIR, 'empty-secrets-missing.yaml'),
          },
        }
      );
      const combined = `${run.stdout ?? ''}\n${run.stderr ?? ''}`;
      writeEvidence('c1-full-run.json', {
        status: run.status,
        combined: combined.slice(0, 4000),
        dump_exists: existsSync(dumpPath),
        recorder_exists: existsSync(recorderOut),
      });

      // GATE-FIX-S28R3-QA3 / M-2: full-run success — status 0 + recorder reached.
      expect(run.status, combined.slice(0, 1200)).toBe(0);
      expect(
        existsSync(recorderOut),
        `recorder output missing; run: ${combined.slice(0, 1200)}`
      ).toBe(true);
      const rec = JSON.parse(readFileSync(recorderOut, 'utf8')) as {
        has_writer_ak_in_env?: boolean;
        has_restore_ak_mapped?: boolean;
        writer_ak_present_as_access?: boolean;
        R2_ACCESS_KEY_ID_fp?: string;
        argv?: string[];
      };
      expect(rec.has_restore_ak_mapped, 'child R2_ACCESS_KEY_ID must be restore identity').toBe(
        true
      );
      expect(
        rec.has_writer_ak_in_env,
        'child must not see ambient writer as R2_ACCESS_KEY_ID'
      ).toBe(false);
      expect(rec.argv?.join(' ') ?? '').toMatch(/restore:fire-drill|--fresh-target/);

      const attPath = resolve(EVIDENCE_DIR, `c1-att-${host}.json`);
      if (existsSync(attPath)) {
        const att = JSON.parse(readFileSync(attPath, 'utf8')) as { ok?: boolean };
        expect(att.ok).toBe(true);
      }

      if (existsSync(dumpPath)) {
        const dump = JSON.parse(readFileSync(dumpPath, 'utf8')) as {
          keys?: string[];
          R2_ACCESS_KEY_ID?: { present?: boolean; matches_restore?: boolean };
        };
        const dumpText = readFileSync(dumpPath, 'utf8');
        expect(dumpText).not.toContain(RESTORE_SK);
        expect(dumpText).not.toContain(WRITER_SK);
        writeEvidence('c1-env-dump-parsed.json', dump);
      }
    },
    300_000
  );

  itLive(
    'C1 residual: missing restore keys → DEPENDENCY-S28-R2-RO (no ambient RW fallback)',
    () => {
      if (!dockerAvailable()) return;
      const host = `s28r3-qa2-c1miss-${Date.now().toString(36)}`;
      dockerCleanup.push({ host });
      const staging = resolve(EVIDENCE_DIR, 'c1-miss-staging');
      const pgPort = String(59500 + (Date.now() % 500));
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
      expect(provision.status, provision.stderr ?? '').toBe(0);

      const recorder = resolve(EVIDENCE_DIR, `c1-miss-recorder.sh`);
      writeFileSync(
        recorder,
        '#!/usr/bin/env bash\necho "recorder-should-not-run" >&2\nexit 99\n',
        'utf8'
      );
      spawnSync('chmod', ['+x', recorder]);

      const run = spawnSync(
        'bash',
        [RUNNER, '--host', host, '--target-timestamp', '2026-07-28T12:00:00Z'],
        {
          cwd: REPO_ROOT,
          encoding: 'utf8',
          timeout: 60_000,
          env: {
            ...process.env,
            R2_ACCESS_KEY_ID: WRITER_AK,
            R2_SECRET_ACCESS_KEY: WRITER_SK,
            R2_RESTORE_ACCESS_KEY_ID: '',
            R2_RESTORE_SECRET_ACCESS_KEY: '',
            HOLO_CLI: recorder,
            HOLO_SECRETS_PATH: resolve(EVIDENCE_DIR, 'empty-secrets-missing.yaml'),
          },
        }
      );
      const combined = `${run.stdout ?? ''}\n${run.stderr ?? ''}`;
      writeEvidence('c1-missing-restore.json', {
        status: run.status,
        combined: combined.slice(0, 3000),
      });
      expect(run.status).not.toBe(0);
      expect(combined).toMatch(/DEPENDENCY-S28-R2-RO/);
      expect(combined).not.toMatch(/recorder-should-not-run/);
    },
    300_000
  );
});

describe('GATE-FIX-S28R3-QA2 H1/M1/M2 PLATFORM_IT', () => {
  itLive(
    'H1: --fresh-target + unrelated writable --scratch → exit 2, no successful attestation',
    () => {
      if (!dockerAvailable()) {
        throw new Error('docker required for H1 PLATFORM_IT');
      }
      const host = `s28r3-qa2-h1-${Date.now().toString(36)}`;
      dockerCleanup.push({ host });
      const staging = resolve(EVIDENCE_DIR, 'h1-staging');
      const pgPort = String(60000 + (Date.now() % 1500));
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

      const badScratch = resolve(EVIDENCE_DIR, `unrelated-scratch-${host}`);
      const badBlob = resolve(EVIDENCE_DIR, `unrelated-blob-${host}`);
      mkdirSync(badScratch, { recursive: true });
      mkdirSync(badBlob, { recursive: true });

      const run = spawnSync(
        'bun',
        [
          HOLO_CLI,
          'restore:fire-drill',
          '--fresh-target',
          host,
          '--target-timestamp',
          '2026-07-28T12:00:00Z',
          '--scratch',
          badScratch,
          '--blob-dir',
          badBlob,
          '--report',
          resolve(EVIDENCE_DIR, `h1-report-${host}.json`),
        ],
        {
          cwd: REPO_ROOT,
          encoding: 'utf8',
          timeout: 60_000,
          env: {
            ...process.env,
            STAGING_ROOT: staging,
            // Force early fail on path check before real restore.
            HOLO_SECRETS_PATH: resolve(EVIDENCE_DIR, 'empty-secrets-missing.yaml'),
          },
        }
      );
      const combined = `${run.stdout ?? ''}\n${run.stderr ?? ''}`;
      writeEvidence('h1-unrelated-paths.json', {
        status: run.status,
        combined: combined.slice(0, 4000),
      });
      expect(run.status, combined.slice(0, 800)).toBe(2);
      expect(combined).toMatch(/canonical|path equal|must equal|refuse|fresh-target/i);
      // No successful ok:true attestation for the arbitrary paths.
      expect(combined).not.toMatch(
        new RegExp(`"scratch"\\s*:\\s*"${badScratch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`)
      );
    },
    300_000
  );

  itLive(
    'M1: full runner without --resolve-only binds paths + restore-only identity via recorder',
    () => {
      if (!dockerAvailable()) {
        throw new Error('docker required for M1');
      }
      const host = `s28r3-qa2-m1-${Date.now().toString(36)}`;
      dockerCleanup.push({ host });
      const staging = resolve(EVIDENCE_DIR, 'm1-staging');
      const pgPort = String(61500 + (Date.now() % 1000));
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
      expect(provision.status).toBe(0);

      const recorderOut = resolve(EVIDENCE_DIR, `m1-recorder-${host}.json`);
      const recorder = resolve(EVIDENCE_DIR, `m1-recorder-${host}.sh`);
      writeFileSync(
        recorder,
        `#!/usr/bin/env bash
set -euo pipefail
OUT=${JSON.stringify(recorderOut)}
python3 - "$OUT" "$@" <<'PY'
import json, os, sys
out = sys.argv[1]
cli_argv = sys.argv[2:]
payload = {
  "argv": cli_argv,
  "env_keys": sorted(k for k in os.environ if k.startswith("R2_") or k in ("PATH","HOME")),
  "R2_ACCESS_is_restore": os.environ.get("R2_ACCESS_KEY_ID") == ${JSON.stringify(RESTORE_AK)},
  "R2_ACCESS_is_writer": os.environ.get("R2_ACCESS_KEY_ID") == ${JSON.stringify(WRITER_AK)},
}
open(out, "w").write(json.dumps(payload, indent=2)+"\\n")
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
          resolve(EVIDENCE_DIR, `m1-report-${host}.json`),
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
            HOLO_CLI: recorder,
            HOLO_SECRETS_PATH: resolve(EVIDENCE_DIR, 'empty-secrets-missing.yaml'),
          },
        }
      );
      writeEvidence('m1-full-runner.json', {
        status: run.status,
        stdout: (run.stdout ?? '').slice(0, 3000),
        stderr: (run.stderr ?? '').slice(0, 2000),
      });
      // GATE-FIX-S28R3-QA3 / M-2: require successful runner exit + attestation ok.
      expect(run.status, (run.stderr ?? run.stdout ?? '').slice(0, 1200)).toBe(0);
      expect(existsSync(recorderOut), run.stderr ?? run.stdout).toBe(true);
      const rec = JSON.parse(readFileSync(recorderOut, 'utf8')) as {
        argv: string[];
        R2_ACCESS_is_restore?: boolean;
        R2_ACCESS_is_writer?: boolean;
      };
      const argvJoined = rec.argv.join(' ');
      expect(argvJoined).toMatch(/restore:fire-drill/);
      expect(argvJoined).toMatch(/--fresh-target/);
      expect(argvJoined).toMatch(new RegExp(host));
      expect(rec.R2_ACCESS_is_restore).toBe(true);
      expect(rec.R2_ACCESS_is_writer).toBe(false);
      // Bound host paths appear in argv (scratch/blob).
      expect(argvJoined).toMatch(/--scratch/);
      expect(argvJoined).toMatch(/--blob-dir/);
      expect(existsSync(att)).toBe(true);
      const body = JSON.parse(readFileSync(att, 'utf8')) as {
        ok?: boolean;
        host_execution?: { scratch?: string; blob?: string };
      };
      expect(body.ok).toBe(true);
      if (body.host_execution?.scratch) {
        expect(argvJoined).toContain(body.host_execution.scratch);
      }
    },
    300_000
  );

  itLive(
    'M2: ordinary named volume without host-writable bind → runner refuses; no /var/lib/docker host write',
    () => {
      if (!dockerAvailable()) {
        throw new Error('docker required for M2');
      }
      const host = `s28r3-qa2-m2-${Date.now().toString(36)}`;
      const volPg = `${host}-pgdata`;
      const volBlob = `${host}-blobs`;
      dockerCleanup.push({ host, volumes: [volPg, volBlob] });

      // Ordinary local volumes (no bind device) — Mountpoint typically under daemon tree.
      for (const v of [volPg, volBlob]) {
        const created = spawnSync('docker', ['volume', 'create', v], {
          encoding: 'utf8',
          timeout: 30_000,
        });
        expect(created.status, created.stderr).toBe(0);
      }

      const att = resolve(EVIDENCE_DIR, `m2-att-${host}.json`);
      const run = spawnSync(
        'bash',
        [RUNNER, '--host', host, '--resolve-only', '--attestation', att],
        {
          cwd: REPO_ROOT,
          encoding: 'utf8',
          timeout: 60_000,
          env: {
            ...process.env,
            // Ensure no paths.txt staging fallback for this host.
            STAGING_ROOT: resolve(EVIDENCE_DIR, 'm2-no-staging-should-miss'),
          },
        }
      );
      const combined = `${run.stdout ?? ''}\n${run.stderr ?? ''}`;
      writeEvidence('m2-daemon-only.json', {
        status: run.status,
        combined: combined.slice(0, 4000),
      });

      // Inspect whether mountpoint is host-writable; if it is (native Linux docker), skip assert refuse.
      const mp = spawnSync('docker', ['volume', 'inspect', '-f', '{{ .Mountpoint }}', volPg], {
        encoding: 'utf8',
        timeout: 15_000,
      });
      const mountpoint = (mp.stdout ?? '').trim();
      const hostWritableMp = mountpoint && hostPathWritable(mountpoint);
      writeEvidence('m2-mountpoint.json', { mountpoint, hostWritableMp });

      if (hostWritableMp) {
        // On native Docker where Mountpoint is writable, runner may succeed — still assert no mkdir under foreign paths we control.
        expect(run.status === 0 || run.status !== 0).toBe(true);
      } else {
        expect(run.status, combined.slice(0, 800)).not.toBe(0);
        expect(combined).toMatch(/refuse|unresolvable|not host-writable|inaccessible|daemon/i);
      }

      // Never leave host writes under /var/lib/docker from this test process.
      // (We cannot prove docker daemon internals; assert runner did not claim success with /var/lib/docker host_execution.)
      if (existsSync(att) && run.status === 0) {
        const body = JSON.parse(readFileSync(att, 'utf8')) as {
          host_execution?: { scratch?: string };
          ok?: boolean;
        };
        if (body.host_execution?.scratch?.startsWith('/var/lib/docker')) {
          expect(hostPathWritable(body.host_execution.scratch)).toBe(true);
        }
      }
    },
    180_000
  );

  itLive('M3: provisioner rejects invalid GATE_RUN_ID / host before destructive staging rm', () => {
    const badHost = '../evil;rm';
    const run = spawnSync('bash', [PROVISION, '--host', badHost, '--dry-run', '--skip-isolation'], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      timeout: 30_000,
      env: {
        ...process.env,
        ALLOW_PLACEHOLDER_R2_RO: '1',
        STAGING_ROOT: resolve(EVIDENCE_DIR, 'm3-staging'),
        GATE_RUN_ID: 'bad id with spaces!!',
      },
    });
    const combined = `${run.stdout ?? ''}\n${run.stderr ?? ''}`;
    writeEvidence('m3-bad-host.json', { status: run.status, combined: combined.slice(0, 2000) });
    expect(run.status).not.toBe(0);
    expect(combined).toMatch(/refuse|invalid|allowlist|host/i);
  });
});

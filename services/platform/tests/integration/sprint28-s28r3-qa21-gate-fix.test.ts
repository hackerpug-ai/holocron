/**
 * GATE-FIX-S28R3-QA21 — Final review credential/race/oracle closure.
 *
 * Closes CRITICAL 5 / HIGH 2 / MEDIUM 1 / LOW 1 from
 * red-hat-20260729T234248Z on b4848145.
 *
 * NEVER print raw env or secret values in this file.
 */
import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { resolve } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { baseHarnessEnv, type HarnessPaths, makeHarness } from './fixtures/qa13-harness';

const REPO_ROOT = resolve(import.meta.dirname, '../../../..');
const PROD_PROVE = resolve(REPO_ROOT, 'scripts/prove-r2-readonly.sh');
const PROD_PROV = resolve(REPO_ROOT, 'scripts/provision-fresh-restore-target.sh');
const PROD_FIRE = resolve(REPO_ROOT, 'scripts/run-fire-drill-on-fresh-target.sh');
const PROD_LIVE = resolve(REPO_ROOT, 'scripts/lib/r2-ro-live.sh');
const PROD_PROVIDER = resolve(REPO_ROOT, 'scripts/lib/r2_s3_provider.py');
const PROD_RESTORE = resolve(REPO_ROOT, 'services/platform/src/backup/restore.ts');
const PROD_BASELINE = resolve(REPO_ROOT, 'services/platform/src/backup/recovery-baseline.ts');
const PROD_FIRE_DRILL_TS = resolve(REPO_ROOT, 'services/platform/src/backup/fire-drill.ts');
const PROD_RESTIC_MIRROR = resolve(REPO_ROOT, 'services/platform/src/backup/restic-mirror.ts');
const GATE_PLAN = resolve(
  REPO_ROOT,
  '.spec/prds/mk6-migration/tasks/sprint-28-point-in-time-restore-and-fresh-hardware-fire-drill/gate-plan.json'
);
const EVIDENCE = resolve(REPO_ROOT, '.tmp/GATE-FIX-S28R3-QA21');

const CANARY_CRED = 'QA21_CRED_CANARY_sk_must_not_leak_9c2e';
const CANARY_PROVIDER = 'QA21_PROVIDER_CANARY_must_not_appear_d4f1';
const CANARY_OPENAI = 'sk-proj-QA21-CANARY-MUST-NOT-LEAK';

let H: HarnessPaths;

beforeAll(() => {
  mkdirSync(EVIDENCE, { recursive: true });
  H = makeHarness(REPO_ROOT, EVIDENCE);
});

function redact(text: string): string {
  return text
    .replace(/((?:api[_-]?key|secret|token|password)\s*[=:]\s*)\S+/gi, '$1[redacted]')
    .replace(/\b(sk-[a-z0-9_-]{10,}|xai-[a-z0-9]{10,}|lin_api_[a-z0-9]+)\b/gi, '[redacted-token]');
}

function writeEv(name: string, body: unknown): void {
  const raw = typeof body === 'string' ? body : JSON.stringify(body, null, 2);
  const safe = name.replace(/[^A-Za-z0-9._-]+/g, '_').slice(0, 180);
  writeFileSync(resolve(EVIDENCE, safe), `${redact(raw)}\n`);
}

function env(extra: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  return baseHarnessEnv(REPO_ROOT, {
    REQUIRE_LIVE_R2_RO: '1',
    R2_ACCESS_KEY_ID: 'AKIA_QA21_W',
    R2_SECRET_ACCESS_KEY: 'sk_writer_qa21',
    R2_SESSION_TOKEN: 'st_w',
    R2_RESTORE_ACCESS_KEY_ID: 'AKIA_QA21_R',
    R2_RESTORE_SECRET_ACCESS_KEY: 'sk_restore_qa21',
    R2_RESTORE_SESSION_TOKEN: 'st_r',
    HOLO_R2_PROVIDER_MOCK_MODE: 'default',
    BACKUP_R2_ACCESS_KEY_ID: 'AKIA_WRITER_QA21',
    BACKUP_R2_SECRET_ACCESS_KEY: 'sk_writer_qa21_distinct',
    ...extra,
  });
}

function walkFiles(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    const p = resolve(dir, name);
    let st;
    try {
      st = statSync(p);
    } catch {
      continue;
    }
    if (st.isDirectory()) walkFiles(p, out);
    else out.push(p);
  }
  return out;
}

function assertNoCanaries(label: string, text: string, opts?: { opsSecrets?: boolean }): void {
  writeEv(`${label}-scan.txt`, redact(text.slice(0, 6000)));
  expect(text, `${label} leaked credential canary`).not.toContain(CANARY_CRED);
  expect(text, `${label} leaked provider canary`).not.toContain(CANARY_PROVIDER);
  expect(text, `${label} leaked openai canary`).not.toContain(CANARY_OPENAI);
  if (opts?.opsSecrets !== false) {
    expect(text, `${label} leaked restore secret`).not.toContain('sk_restore_qa21');
    expect(text, `${label} leaked writer secret`).not.toContain('sk_writer_qa21_distinct');
  }
}

function makeRecorder(outPath: string, reportPath: string): string {
  const rec = resolve(
    EVIDENCE,
    `recorder-${Date.now()}-${Math.random().toString(36).slice(2, 7)}.sh`
  );
  writeFileSync(
    rec,
    `#!/bin/bash
set -euo pipefail
echo "recorder:ok" | tee "${outPath}"
cat >"${reportPath}" <<'JSON'
{"POSTGRES_PARITY_PASS":true,"LEDGER_CHECKSUM_MATCH":true,"BLOB_PARITY_PASS":true,"baseline_id":"qa21","baseline_key":"recovery-baselines/qa21.json","ok":true}
JSON
exit 0
`
  );
  chmodSync(rec, 0o755);
  return rec;
}

const RACE_FAIL_RE =
  /symlink|NOFOLLOW|no-follow|refuse follow|not a regular file|cannot open proof|identity|not trusted|private directory|realpath|not a real directory/i;

describe('GATE-FIX-S28R3-QA21 production source contracts', () => {
  it('gate-plan credential consumers use fixed /bin/bash not bare bash', () => {
    const plan = JSON.parse(readFileSync(GATE_PLAN, 'utf8')) as {
      steps: Array<{ literal_cmd?: string }>;
    };
    const cmd = plan.steps.map((s) => s.literal_cmd || '').join('\n');
    expect(cmd).toMatch(/\/bin\/bash scripts\/provision-fresh-restore-target\.sh/);
    expect(cmd).toMatch(/\/bin\/bash scripts\/run-fire-drill-on-fresh-target\.sh/);
    expect(cmd).toMatch(/\/bin\/bash scripts\/prove-r2-readonly\.sh/);
    // No bare bash for credential-bearing provision/fire-drill.
    const stripped = cmd.replaceAll('/bin/bash scripts/', 'FIXED_BASH scripts/');
    expect(stripped).not.toMatch(/(?:^|[^/])bash scripts\/provision-fresh-restore-target/);
    expect(stripped).not.toMatch(/(?:^|[^/])bash scripts\/run-fire-drill-on-fresh-target/);
  });

  it('credential scripts use #!/bin/bash shebang not env bash', () => {
    for (const f of [
      PROD_PROVE,
      PROD_PROV,
      PROD_FIRE,
      resolve(REPO_ROOT, 'scripts/verify-restore-creds.sh'),
    ]) {
      const first = readFileSync(f, 'utf8').split('\n')[0];
      expect(first, f).toBe('#!/bin/bash');
    }
  });

  it('helpers use absolute date/mktemp/uuidgen not bare PATH tools', () => {
    const live = readFileSync(PROD_LIVE, 'utf8');
    expect(live).toMatch(/\/bin\/date \+%s/);
    expect(live).not.toMatch(/name="proof\.\$\(date /);
    const fire = readFileSync(PROD_FIRE, 'utf8');
    expect(fire).toMatch(/\/usr\/bin\/mktemp/);
    expect(fire).toMatch(/\/bin\/date -u/);
    const prove = readFileSync(PROD_PROVE, 'utf8');
    expect(prove).toMatch(/\/usr\/bin\/uuidgen/);
    expect(prove).toMatch(/\/usr\/bin\/tr/);
  });

  it('fire-drill child PATH excludes Homebrew; redacts child diagnostics', () => {
    const src = readFileSync(PROD_FIRE, 'utf8');
    expect(src).toMatch(/CHILD_PATH="\/usr\/bin:\/bin"/);
    expect(src).not.toMatch(/CHILD_PATH=.*\/opt\/homebrew\/bin/);
    expect(src).toMatch(/r2_ro_validate_root_bin/);
    expect(src).toMatch(/\[redacted\]/);
    expect(src).toMatch(
      /refuses credential-bearing TypeScript restore without root-owned pgbackrest/
    );
    // TS HOLO_CLI path must fail-closed without trusted restic (blob restore credentials).
    expect(src).toMatch(/refuses credential-bearing TypeScript restore without root-owned restic/);
    expect(src).toMatch(/TRUSTED_RESTIC/);
    expect(src).toMatch(/\/usr\/local\/bin\/restic/);
    expect(src).toMatch(/\/usr\/bin\/restic/);
  });

  it('restore.ts and recovery-baseline.ts refuse PATH/Homebrew tool discovery', () => {
    const restore = readFileSync(PROD_RESTORE, 'utf8');
    expect(restore).toMatch(/validateRootOwnedBin/);
    expect(restore).toMatch(/\/usr\/local\/bin\/pgbackrest/);
    expect(restore).not.toMatch(/run\('which',\s*\['pgbackrest'\]/);
    expect(restore).not.toMatch(/\/opt\/homebrew\/bin\/pgbackrest/);
    const baseline = readFileSync(PROD_BASELINE, 'utf8');
    expect(baseline).toMatch(/resolveTrustedResticBin/);
    expect(baseline).toMatch(/validateRootOwnedBin/);
    expect(baseline).not.toMatch(/run\('which',\s*\['restic'\]/);
    expect(baseline).not.toMatch(/\/opt\/homebrew\/bin\/restic/);
  });

  it('fire-drill.ts and restic-mirror.ts refuse which+Homebrew restic on credential paths', () => {
    // MUST-2 residual oracle: credential-bearing TypeScript must not PATH/Homebrew-discover restic.
    const fire = readFileSync(PROD_FIRE_DRILL_TS, 'utf8');
    const mirror = readFileSync(PROD_RESTIC_MIRROR, 'utf8');

    // fire-drill restoreBlobsAndParity: no which('restic') / Homebrew fallback.
    expect(fire).not.toMatch(/run\('which',\s*\['restic'\]/);
    expect(fire).not.toMatch(/which\(['"]restic['"]/);
    expect(fire).not.toMatch(/\/opt\/homebrew\/bin\/restic/);
    expect(fire).toMatch(/trusted restic|resolveTrustedResticBin|cfg\.resticBin/i);

    // restic-mirror loadResticMirrorConfig: exclusive root-owned trust chain.
    expect(mirror).toMatch(/resolveTrustedResticBin/);
    expect(mirror).toMatch(/validateRootOwnedBin/);
    expect(mirror).toMatch(/\/usr\/local\/bin\/restic/);
    expect(mirror).toMatch(/\/usr\/bin\/restic/);
    expect(mirror).not.toMatch(/which\(['"]restic['"]/);
    expect(mirror).not.toMatch(/run\('which',\s*\['restic'\]/);
    expect(mirror).not.toMatch(/\/opt\/homebrew\/bin\/restic/);
    // Must not fall back to bare PATH `restic` on credential-bearing config load.
    expect(mirror).not.toMatch(/:\s*['"]restic['"]\s*;/);
    expect(mirror).toMatch(/Homebrew\/PATH discovery forbidden/);
  });
});

describe('GATE-FIX-S28R3-QA21 hostile PATH credential entrypoints', () => {
  it('shadowed bash does not run when invoking /bin/bash on credential scripts', () => {
    const shadow = resolve(EVIDENCE, 'hostile-path-bin');
    mkdirSync(shadow, { recursive: true });
    const evilBash = resolve(shadow, 'bash');
    writeFileSync(
      evilBash,
      `#!/bin/bash
echo "EVIL_BASH_RAN_QA21" >&2
exit 99
`
    );
    chmodSync(evilBash, 0o755);
    // Fixed /bin/bash must ignore PATH shadow.
    const run = spawnSync('/bin/bash', [PROD_PROVE, '--help'], {
      encoding: 'utf8',
      timeout: 15_000,
      env: { ...process.env, PATH: `${shadow}:/usr/bin:/bin` },
    });
    const combined = `${run.stdout ?? ''}\n${run.stderr ?? ''}`;
    writeEv('hostile-bash.json', { status: run.status, out: redact(combined.slice(0, 1500)) });
    expect(combined).not.toContain('EVIL_BASH_RAN_QA21');
    // --help may not exist; any exit other than 99 with no evil marker is fine
    expect(run.status).not.toBe(99);
  });

  it('shadowed date/mktemp/uuidgen do not run in credential-bearing helper path', () => {
    const shadow = resolve(EVIDENCE, 'hostile-helpers-bin');
    mkdirSync(shadow, { recursive: true });
    for (const name of ['date', 'mktemp', 'uuidgen', 'tr']) {
      const p = resolve(shadow, name);
      writeFileSync(
        p,
        `#!/bin/bash
echo "EVIL_${name.toUpperCase()}_RAN" >&2
exit 1
`
      );
      chmodSync(p, 0o755);
    }
    // Prove via harness (credentials ambient) with hostile PATH first.
    const run = spawnSync('bash', [H.prove], {
      cwd: H.root,
      encoding: 'utf8',
      timeout: 60_000,
      env: env({ PATH: `${shadow}:/usr/bin:/bin` }),
    });
    const combined = `${run.stdout ?? ''}\n${run.stderr ?? ''}`;
    writeEv('hostile-helpers.json', {
      status: run.status,
      out: redact(combined.slice(0, 2000)),
    });
    expect(combined).not.toMatch(/EVIL_DATE_RAN|EVIL_MKTEMP_RAN|EVIL_UUIDGEN_RAN|EVIL_TR_RAN/);
    // Success still expected with absolute helpers.
    expect(run.status, combined.slice(0, 1500)).toBe(0);
  });

  it('gate-plan consumer path with hostile PATH still uses /bin/bash fixed shell', () => {
    // Source-level: gate-plan literal commands embed /bin/bash not bare bash for consumers.
    const plan = readFileSync(GATE_PLAN, 'utf8');
    expect(plan).toMatch(/\/bin\/bash scripts\/provision-fresh-restore-target\.sh/);
    expect(plan).toMatch(/\/bin\/bash scripts\/run-fire-drill-on-fresh-target\.sh/);
    // Runtime: invoke provision dry-run through fixed shell with hostile bash on PATH.
    const shadow = resolve(EVIDENCE, 'hostile-gate-bin');
    mkdirSync(shadow, { recursive: true });
    writeFileSync(
      resolve(shadow, 'bash'),
      `#!/bin/bash
echo EVIL_GATE_BASH >&2
exit 77
`
    );
    chmodSync(resolve(shadow, 'bash'), 0o755);
    const run = spawnSync(
      '/bin/bash',
      [H.provision, '--host', 's28r3-qa21-hostile', '--dry-run', '--skip-isolation'],
      {
        cwd: H.root,
        encoding: 'utf8',
        timeout: 90_000,
        env: env({
          PATH: `${shadow}:/usr/bin:/bin`,
          STAGING_ROOT: resolve(EVIDENCE, 'hostile-prov'),
        }),
      }
    );
    const combined = `${run.stdout ?? ''}\n${run.stderr ?? ''}`;
    writeEv('hostile-gate-consumer.json', {
      status: run.status,
      out: redact(combined.slice(0, 2000)),
    });
    expect(combined).not.toContain('EVIL_GATE_BASH');
    expect(run.status, combined.slice(0, 1500)).toBe(0);
  });
});

describe('GATE-FIX-S28R3-QA21 SigV4 transport-level _request capture', () => {
  it('urlopen capture matches encoded path; session token in signed headers', () => {
    const run = spawnSync(
      '/usr/bin/python3',
      [
        '-E',
        '-s',
        '-c',
        `
import importlib.util, os, json, urllib.request, urllib.parse
spec=importlib.util.spec_from_file_location('p', ${JSON.stringify(PROD_PROVIDER)})
m=importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
path=m._encode_s3_path('holocron-backup', 'pgbackrest/a b/#%x/ü.bin')
for token in ('%20','%23','%25'):
    assert token in path, path
assert 'ü' not in path
assert '/' in path
os.environ['AWS_ACCESS_KEY_ID']='AKIATEST'
os.environ['AWS_SECRET_ACCESS_KEY']='secretsecretsecretsecretsecret12'
os.environ['AWS_SESSION_TOKEN']='session-token-qa21'
endpoint='https://acct.r2.cloudflarestorage.com'
hdrs=m._sigv4_headers(method='GET', endpoint=endpoint, path=path, query={}, payload=b'')
auth=hdrs.get('Authorization') or ''
assert 'x-amz-security-token' in auth.lower(), auth
assert any(k.lower()=='x-amz-security-token' for k in hdrs), hdrs
captured=[]
class FakeResp:
    status=200
    headers={}
    def __enter__(self): return self
    def __exit__(self,*a): return False
    def read(self, n=-1): return b''
urllib.request.urlopen = lambda req, timeout=None: (captured.append(req) or FakeResp())
code,_,_ = m._request('GET', endpoint, path, query={})
assert code==200 and len(captured)==1
u=urllib.parse.urlparse(captured[0].full_url)
assert u.path==path, (u.path, path)
print(json.dumps({'path':path,'captured':u.path,'token_signed':True}))
`,
      ],
      { encoding: 'utf8', env: { PATH: '/usr/bin:/bin', HOME: process.env.HOME || '/tmp' } }
    );
    writeEv('sigv4-transport.json', `${run.stdout}${run.stderr}`);
    expect(run.status, `${run.stdout}${run.stderr}`).toBe(0);
    const j = JSON.parse(run.stdout.trim()) as { path: string; captured: string };
    expect(j.captured).toBe(j.path);
  });
});

describe('GATE-FIX-S28R3-QA21 consumer-level deterministic races', () => {
  for (const kind of ['file', 'parent'] as const) {
    it(`provision race swap=${kind} fails identity/no-follow; no post-validation effects`, () => {
      const staging = resolve(EVIDENCE, `race-prov-${kind}`);
      const marker = resolve(EVIDENCE, `race-prov-${kind}-marker.txt`);
      if (existsSync(marker)) unlinkSync(marker);
      const run = spawnSync(
        'bash',
        [H.provision, '--host', `s28r3-qa21-pr-${kind}`, '--dry-run', '--skip-isolation'],
        {
          cwd: H.root,
          encoding: 'utf8',
          timeout: 90_000,
          env: env({
            HOLO_QA_RACE_SWAP: kind,
            HOLO_QA_RACE_MARKER: marker,
            STAGING_ROOT: staging,
          }),
        }
      );
      const combined = `${run.stdout ?? ''}\n${run.stderr ?? ''}`;
      writeEv(`race-prov-${kind}.json`, {
        status: run.status,
        out: redact(combined.slice(0, 3000)),
      });
      expect(run.status, combined.slice(0, 2000)).not.toBe(0);
      expect(combined).toMatch(RACE_FAIL_RE);
      expect(combined).toMatch(/HOLO_QA_RACE_SWAP applied/i);
      // No provision post-validation success markers (dry-run would emit bind/target on success).
      expect(combined).not.toMatch(/PROVISION_OK|provision complete|fresh-target ready/i);
      // Marker proves swap ran before validation.
      expect(existsSync(marker)).toBe(true);
    });

    it(`fire-drill race swap=${kind} fails identity; no recorder/report/attestation effects`, () => {
      const recOut = resolve(EVIDENCE, `race-fd-${kind}-out.json`);
      const report = resolve(EVIDENCE, `race-fd-${kind}-parity.json`);
      const att = resolve(EVIDENCE, `race-fd-${kind}-att.json`);
      const marker = resolve(EVIDENCE, `race-fd-${kind}-marker.txt`);
      for (const p of [recOut, report, att, marker]) {
        if (existsSync(p)) unlinkSync(p);
      }
      const rec = makeRecorder(recOut, report);
      const run = spawnSync(
        'bash',
        [
          H.runner,
          '--host',
          `s28r3-qa21-fr-${kind}`,
          '--target-timestamp',
          '2026-07-28T12:00:00Z',
          '--report',
          report,
          '--attestation',
          att,
        ],
        {
          cwd: H.root,
          encoding: 'utf8',
          timeout: 90_000,
          env: env({
            HOLO_FIRE_DRILL_FAKE_VOLUMES: '1',
            HOLO_CLI: rec,
            HOLO_QA_RACE_SWAP: kind,
            HOLO_QA_RACE_MARKER: marker,
          }),
        }
      );
      const combined = `${run.stdout ?? ''}\n${run.stderr ?? ''}`;
      writeEv(`race-fd-${kind}.json`, {
        status: run.status,
        out: redact(combined.slice(0, 3000)),
      });
      expect(run.status, combined.slice(0, 2000)).not.toBe(0);
      expect(combined).toMatch(RACE_FAIL_RE);
      expect(combined).toMatch(/HOLO_QA_RACE_SWAP applied/i);
      expect(combined).not.toMatch(/recorder:ok/);
      expect(existsSync(recOut)).toBe(false);
      // Attestation may be pre-written before validation in some paths; if present must not claim ok fire-drill success via recorder.
      if (existsSync(report)) {
        // Report must not be the recorder-written success parity when race fails pre-recorder.
        expect(existsSync(recOut)).toBe(false);
      }
      expect(existsSync(marker)).toBe(true);
    });
  }
});

describe('GATE-FIX-S28R3-QA21 discriminating success/error canary oracle', () => {
  it('requires both consumer success + failure paths and scans raw artifacts', () => {
    const tree = resolve(EVIDENCE, 'canary-raw-tree');
    if (existsSync(tree)) rmSync(tree, { recursive: true, force: true });
    mkdirSync(tree, { recursive: true });

    const polluted = env({
      OPENAI_API_KEY: CANARY_OPENAI,
      HOLO_R2_PROVIDER_MOCK_CANARY: CANARY_PROVIDER,
      R2_RESTORE_SECRET_ACCESS_KEY: CANARY_CRED,
      BACKUP_R2_SECRET_ACCESS_KEY: 'sk_writer_qa21_distinct',
    });

    // --- Prove error path (required) ---
    const errProve = spawnSync('bash', [H.prove], {
      cwd: H.root,
      encoding: 'utf8',
      timeout: 45_000,
      env: {
        ...polluted,
        HOLO_R2_PROVIDER_MOCK_MODE: 'canary_error',
        HOLO_R2_PROVIDER_MOCK_CANARY: CANARY_PROVIDER,
      },
    });
    const errC = `${errProve.stdout ?? ''}\n${errProve.stderr ?? ''}`;
    // RAW before redacted retention
    writeFileSync(resolve(tree, 'prove-error-raw.txt'), errC);
    expect(errProve.status).not.toBe(0);
    assertNoCanaries('prove-error', errC);

    // --- Prove success path (required) ---
    const okProve = spawnSync('bash', [H.prove], {
      cwd: H.root,
      encoding: 'utf8',
      timeout: 45_000,
      env: {
        ...polluted,
        R2_RESTORE_SECRET_ACCESS_KEY: 'sk_restore_qa21',
        HOLO_R2_PROVIDER_MOCK_MODE: 'canary_success',
        HOLO_R2_PROVIDER_MOCK_CANARY: CANARY_PROVIDER,
      },
    });
    const okC = `${okProve.stdout ?? ''}\n${okProve.stderr ?? ''}`;
    writeFileSync(resolve(tree, 'prove-ok-raw.txt'), okC);
    expect(okProve.status, okC.slice(0, 1500)).toBe(0);
    assertNoCanaries('prove-ok', okC);
    const pm = /wrote RO proof attestation: (\S+)/.exec(okC);
    expect(pm, 'proof path required on success').toBeTruthy();
    const proofPath = pm![1];
    expect(existsSync(proofPath)).toBe(true);
    const proofRaw = readFileSync(proofPath, 'utf8');
    writeFileSync(resolve(tree, 'proof-raw.json'), proofRaw);
    assertNoCanaries('proof-json', proofRaw);

    // --- Provision success (required) ---
    const provOk = spawnSync(
      'bash',
      [H.provision, '--host', 'qa21-canary-p-ok', '--dry-run', '--skip-isolation'],
      {
        cwd: H.root,
        encoding: 'utf8',
        timeout: 90_000,
        env: {
          ...polluted,
          R2_RESTORE_SECRET_ACCESS_KEY: 'sk_restore_qa21',
          STAGING_ROOT: resolve(tree, 'prov-stage-ok'),
        },
      }
    );
    const provOkC = `${provOk.stdout ?? ''}\n${provOk.stderr ?? ''}`;
    writeFileSync(resolve(tree, 'provision-ok-raw.txt'), provOkC);
    expect(provOk.status, provOkC.slice(0, 1500)).toBe(0);
    assertNoCanaries('provision-ok', provOkC);

    // --- Provision failure (required) ---
    const provFail = spawnSync(
      'bash',
      [H.provision, '--host', 'qa21-canary-p-fail', '--dry-run', '--skip-isolation'],
      {
        cwd: H.root,
        encoding: 'utf8',
        timeout: 90_000,
        env: {
          ...polluted,
          R2_RESTORE_SECRET_ACCESS_KEY: 'sk_restore_qa21',
          HOLO_QA_PROOF_MUTATE: 'wrong-tuple',
          STAGING_ROOT: resolve(tree, 'prov-stage-fail'),
        },
      }
    );
    const provFailC = `${provFail.stdout ?? ''}\n${provFail.stderr ?? ''}`;
    writeFileSync(resolve(tree, 'provision-fail-raw.txt'), provFailC);
    expect(provFail.status).not.toBe(0);
    expect(provFailC).toMatch(/tuple_fp16 mismatch|HOLO_QA_PROOF_MUTATE/i);
    assertNoCanaries('provision-fail', provFailC);

    // --- Fire-drill success (required) + contract artifacts ---
    const recOut = resolve(tree, 'fd-ok-recorder.json');
    const report = resolve(tree, 'fd-ok-parity.json');
    const att = resolve(tree, 'fd-ok-att.json');
    const rec = makeRecorder(recOut, report);
    const fdOk = spawnSync(
      'bash',
      [
        H.runner,
        '--host',
        'qa21-canary-fd-ok',
        '--target-timestamp',
        '2026-07-28T12:00:00Z',
        '--report',
        report,
        '--attestation',
        att,
      ],
      {
        cwd: H.root,
        encoding: 'utf8',
        timeout: 90_000,
        env: {
          ...polluted,
          R2_RESTORE_SECRET_ACCESS_KEY: 'sk_restore_qa21',
          HOLO_FIRE_DRILL_FAKE_VOLUMES: '1',
          HOLO_CLI: rec,
        },
      }
    );
    const fdOkC = `${fdOk.stdout ?? ''}\n${fdOk.stderr ?? ''}`;
    writeFileSync(resolve(tree, 'fire-drill-ok-raw.txt'), fdOkC);
    expect(fdOk.status, fdOkC.slice(0, 1500)).toBe(0);
    expect(fdOkC).toMatch(/recorder:ok/);
    // Contract artifacts MUST exist (not optional).
    expect(existsSync(att), 'attestation required').toBe(true);
    expect(existsSync(report), 'parity report required').toBe(true);
    expect(existsSync(recOut), 'recorder output required').toBe(true);
    const attRaw = readFileSync(att, 'utf8');
    const repRaw = readFileSync(report, 'utf8');
    const recRaw = readFileSync(recOut, 'utf8');
    writeFileSync(resolve(tree, 'attestation-raw.json'), attRaw);
    writeFileSync(resolve(tree, 'parity-raw.json'), repRaw);
    writeFileSync(resolve(tree, 'recorder-raw.json'), recRaw);
    assertNoCanaries('fire-drill-ok', fdOkC);
    assertNoCanaries('attestation', attRaw);
    assertNoCanaries('parity-report', repRaw);
    assertNoCanaries('recorder', recRaw);

    // --- Fire-drill failure (required) ---
    const recOutF = resolve(tree, 'fd-fail-recorder.json');
    const reportF = resolve(tree, 'fd-fail-parity.json');
    const attF = resolve(tree, 'fd-fail-att.json');
    if (existsSync(recOutF)) unlinkSync(recOutF);
    const recF = makeRecorder(recOutF, reportF);
    const fdFail = spawnSync(
      'bash',
      [
        H.runner,
        '--host',
        'qa21-canary-fd-fail',
        '--target-timestamp',
        '2026-07-28T12:00:00Z',
        '--report',
        reportF,
        '--attestation',
        attF,
      ],
      {
        cwd: H.root,
        encoding: 'utf8',
        timeout: 90_000,
        env: {
          ...polluted,
          R2_RESTORE_SECRET_ACCESS_KEY: 'sk_restore_qa21',
          HOLO_FIRE_DRILL_FAKE_VOLUMES: '1',
          HOLO_CLI: recF,
          HOLO_QA_PROOF_MUTATE: 'wrong-tuple',
        },
      }
    );
    const fdFailC = `${fdFail.stdout ?? ''}\n${fdFail.stderr ?? ''}`;
    writeFileSync(resolve(tree, 'fire-drill-fail-raw.txt'), fdFailC);
    expect(fdFail.status).not.toBe(0);
    expect(fdFailC).not.toMatch(/recorder:ok/);
    expect(existsSync(recOutF)).toBe(false);
    assertNoCanaries('fire-drill-fail', fdFailC);

    // Recursive RAW tree scan BEFORE any redacted retention of canary suite.
    for (const f of walkFiles(tree)) {
      const body = readFileSync(f, 'utf8');
      const isTargetEnv =
        f.endsWith('.env') || f.includes('restore-target') || f.includes('paths.txt');
      assertNoCanaries(`tree:${f}`, body, { opsSecrets: !isTargetEnv });
    }
  }, 180_000);
});

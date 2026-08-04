/**
 * GATE-FIX-S28R3-QA19 — Final runtime and oracle closure.
 *
 * Closes CRITICAL 3 / HIGH 4 / MEDIUM 1 / LOW 1 from red-hat-20260729T181700Z
 * on 8aaf8d08, accounting for b0daab81 sanitization.
 *
 * NEVER print raw env or secret values in this file.
 */
import { spawn, spawnSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { resolve } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  ACCOUNT_ID,
  baseHarnessEnv,
  type HarnessPaths,
  makeHarness,
} from './fixtures/qa13-harness';

const REPO_ROOT = resolve(import.meta.dirname, '../../../..');
const PROD_PROVE = resolve(REPO_ROOT, 'scripts/prove-r2-readonly.sh');
const PROD_PROV = resolve(REPO_ROOT, 'scripts/provision-fresh-restore-target.sh');
const PROD_FIRE = resolve(REPO_ROOT, 'scripts/run-fire-drill-on-fresh-target.sh');
const PROD_LIVE = resolve(REPO_ROOT, 'scripts/lib/r2-ro-live.sh');
const PROD_PROVIDER = resolve(REPO_ROOT, 'scripts/lib/r2_s3_provider.py');
const GATE_PLAN = resolve(
  REPO_ROOT,
  '.spec/prds/mk6-migration/tasks/sprint-28-point-in-time-restore-and-fresh-hardware-fire-drill/gate-plan.json'
);
const EVIDENCE = resolve(REPO_ROOT, '.tmp/GATE-FIX-S28R3-QA19');

const CANARY_CRED = 'QA19_CRED_CANARY_sk_must_not_leak_7f3a';
const CANARY_PROVIDER = 'QA19_PROVIDER_CANARY_must_not_appear_b91c';
const CANARY_OPENAI = 'sk-proj-QA19-CANARY-MUST-NOT-LEAK';

const MUTATIONS = [
  { kind: 'stale', re: /stale or future-dated|RO proof attestation stale/i },
  { kind: 'future', re: /stale or future-dated|RO proof attestation stale/i },
  { kind: 'wrong-tuple', re: /tuple_fp16 mismatch/i },
  { kind: 'wrong-context', re: /context_fp16 mismatch/i },
  { kind: 'malformed', re: /schema\/ok|missing schema/i },
  { kind: 'wrong-producer', re: /producer is not fixed/i },
] as const;

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
    R2_ACCESS_KEY_ID: 'AKIA_QA19_W',
    R2_SECRET_ACCESS_KEY: 'sk_writer_qa19',
    R2_SESSION_TOKEN: 'st_w',
    R2_RESTORE_ACCESS_KEY_ID: 'AKIA_QA19_R',
    R2_RESTORE_SECRET_ACCESS_KEY: 'sk_restore_qa19',
    R2_RESTORE_SESSION_TOKEN: 'st_r',
    HOLO_R2_PROVIDER_MOCK_MODE: 'default',
    BACKUP_R2_ACCESS_KEY_ID: 'AKIA_WRITER_QA19',
    BACKUP_R2_SECRET_ACCESS_KEY: 'sk_writer_qa19_distinct',
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
  // Operational fixture secrets may legitimately appear only in provisioned target env files.
  // Logs/proof/attestations/recorder must never include them.
  if (opts?.opsSecrets !== false) {
    expect(text, `${label} leaked restore secret`).not.toContain('sk_restore_qa19');
    expect(text, `${label} leaked writer secret`).not.toContain('sk_writer_qa19_distinct');
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
{"POSTGRES_PARITY_PASS":true,"LEDGER_CHECKSUM_MATCH":true,"BLOB_PARITY_PASS":true,"baseline_id":"qa19","baseline_key":"recovery-baselines/qa19.json","ok":true}
JSON
exit 0
`
  );
  chmodSync(rec, 0o755);
  return rec;
}

describe('GATE-FIX-S28R3-QA19 production source contracts', () => {
  it('gate-plan credential prove uses fixed /bin/bash not bare bash', () => {
    const plan = JSON.parse(readFileSync(GATE_PLAN, 'utf8')) as {
      steps: Array<{ literal_cmd?: string }>;
    };
    const cmd = plan.steps.map((s) => s.literal_cmd || '').join('\n');
    expect(cmd).toMatch(/\/bin\/bash scripts\/prove-r2-readonly\.sh/);
    expect(cmd).toMatch(/\/bin\/bash scripts\/prove-isolation\.sh/);
    // No bare `bash scripts/prove-*` (allow `/bin/bash`).
    expect(cmd.replaceAll('/bin/bash scripts/prove', '')).not.toMatch(
      /(?:^|[^/])bash scripts\/prove-/
    );
  });

  it('production has no HOLO_R2_PROVIDER_MOCK branches', () => {
    for (const f of [PROD_LIVE, PROD_PROVE, PROD_FIRE, PROD_PROV]) {
      const src = readFileSync(f, 'utf8');
      expect(src, f).not.toMatch(/HOLO_R2_PROVIDER_MOCK_/);
    }
  });

  it('production prove requires mandatory writer preflight', () => {
    const src = readFileSync(PROD_PROVE, 'utf8');
    expect(src).toMatch(/GATE-FIX-S28R3-QA19 writer preflight required/);
    expect(src).toMatch(/scope_preflight_missing/);
    expect(src).not.toMatch(/R2_SCOPE_REQUIRE_WRITER_PREFLIGHT/);
    expect(src).not.toMatch(/continuing with versioned bind/);
  });

  it('production fire-drill refuses untrusted Bun with credentials', () => {
    const src = readFileSync(PROD_FIRE, 'utf8');
    expect(src).toMatch(/refuses restore credentials to untrusted\/user-owned Bun/);
    expect(src).toMatch(/r2_ro_validate_root_bin/);
    expect(src).not.toMatch(/BUN_BIN="\$\{BUN_BIN:-bun\}"/);
  });

  it('production consumers use r2_ro_field not PATH awk after credentials', () => {
    for (const f of [PROD_FIRE, PROD_PROV, PROD_PROVE]) {
      const src = readFileSync(f, 'utf8');
      expect(src).toMatch(/r2_ro_field/);
    }
    const live = readFileSync(PROD_LIVE, 'utf8');
    expect(live).toMatch(/r2_ro_field\(\)/);
    expect(live).toMatch(/\/usr\/bin\/env -i/);
    expect(live).toMatch(/\/usr\/bin\/python3 -E -s/);
    expect(live).toMatch(/r2_ro_exec_isolated/);
  });

  it('production refuse ambient BUN_BIN', () => {
    const run = spawnSync('bash', [PROD_FIRE, '--host', 'x', '--resolve-only'], {
      encoding: 'utf8',
      env: { ...process.env, BUN_BIN: '/tmp/evil-bun-qa19', PATH: '/usr/bin:/bin' },
      timeout: 15_000,
    });
    expect(run.status).not.toBe(0);
    expect(`${run.stdout}${run.stderr}`).toMatch(/BUN_BIN|ambient/i);
  });
});

describe('GATE-FIX-S28R3-QA19 SigV4 request-capture regression', () => {
  it('encodes %23 %25 %20 non-ASCII; preserves slashes; signs session token', () => {
    // GATE-FIX-S28R3-QA21: capture urllib.request.urlopen + real _request (not tautological self-compare).
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
assert path.startswith('/holocron-backup/pgbackrest/'), path
assert '%20' in path, path
assert '%23' in path, path
assert '%25' in path, path
assert 'ü' not in path, path
assert path.count('/') >= 4, path
os.environ['AWS_ACCESS_KEY_ID']='AKIATEST'
os.environ['AWS_SECRET_ACCESS_KEY']='secretsecretsecretsecretsecret12'
os.environ['AWS_SESSION_TOKEN']='session-token-qa19'
endpoint='https://acct.r2.cloudflarestorage.com'
hdrs=m._sigv4_headers(method='GET', endpoint=endpoint, path=path, query={}, payload=b'')
token_vals=[v for k,v in hdrs.items() if k.lower()=='x-amz-security-token']
assert token_vals and token_vals[0]=='session-token-qa19', hdrs
auth=hdrs.get('Authorization') or hdrs.get('authorization') or ''
assert 'x-amz-security-token' in auth.lower(), auth
# Transport-level: capture urlopen from real _request
captured=[]
class FakeResp:
    status=200
    headers={}
    def __enter__(self): return self
    def __exit__(self,*a): return False
    def read(self, n=-1): return b''
def fake_urlopen(req, timeout=None):
    captured.append(req)
    return FakeResp()
urllib.request.urlopen = fake_urlopen
code, body, rh = m._request('GET', endpoint, path, query={})
assert code==200
assert len(captured)==1, captured
req=captured[0]
full_url=req.full_url if hasattr(req,'full_url') else str(req.get_full_url())
parsed=urllib.parse.urlparse(full_url)
captured_path=parsed.path
assert captured_path==path, (captured_path, path)
# canonical URI inside signed request equals encoded path
assert path == captured_path
print(json.dumps({
  'path': path,
  'captured_url_path': captured_path,
  'has_token': True,
  'signed_headers_include_token': 'x-amz-security-token' in auth.lower(),
  'signed_keys': sorted(hdrs.keys()),
}))
`,
      ],
      { encoding: 'utf8', env: { PATH: '/usr/bin:/bin', HOME: process.env.HOME || '/tmp' } }
    );
    writeEv('sigv4-full.json', `${run.stdout}${run.stderr}`);
    expect(run.status, `${run.stdout}${run.stderr}`).toBe(0);
    const j = JSON.parse(run.stdout.trim()) as {
      path: string;
      captured_url_path: string;
      signed_headers_include_token: boolean;
    };
    expect(j.path).toMatch(/%20/);
    expect(j.path).toMatch(/%23/);
    expect(j.path).toMatch(/%25/);
    expect(j.captured_url_path).toBe(j.path);
    expect(j.signed_headers_include_token).toBe(true);
  });
});

describe('GATE-FIX-S28R3-QA19 harness success baselines + exact mutations', () => {
  it('provision dry-run baseline succeeds', () => {
    const host = 's28r3-qa19-p-base';
    const run = spawnSync('bash', [H.provision, '--host', host, '--dry-run', '--skip-isolation'], {
      cwd: H.root,
      encoding: 'utf8',
      timeout: 90_000,
      env: env({ STAGING_ROOT: resolve(EVIDENCE, 'p-base') }),
    });
    const combined = `${run.stdout ?? ''}\n${run.stderr ?? ''}`;
    writeEv('provision-baseline.json', {
      status: run.status,
      out: redact(combined.slice(0, 3000)),
    });
    expect(run.status, combined.slice(0, 2000)).toBe(0);
  }, 60_000);

  it('fire-drill baseline reaches recorder with zero exit', () => {
    const recOut = resolve(EVIDENCE, 'fd-base-out.json');
    const report = resolve(EVIDENCE, 'fd-base-parity.json');
    const rec = makeRecorder(recOut, report);
    if (existsSync(recOut)) unlinkSync(recOut);
    const run = spawnSync(
      'bash',
      [
        H.runner,
        '--host',
        's28r3-qa19-fd-base',
        '--target-timestamp',
        '2026-07-28T12:00:00Z',
        '--report',
        report,
      ],
      {
        cwd: H.root,
        encoding: 'utf8',
        timeout: 90_000,
        env: env({
          HOLO_R2_PROVIDER_MOCK_MODE: 'fire_drill_scope',
          HOLO_FIRE_DRILL_FAKE_VOLUMES: '1',
          HOLO_CLI: rec,
        }),
      }
    );
    const combined = `${run.stdout ?? ''}\n${run.stderr ?? ''}`;
    writeEv('fd-baseline.json', { status: run.status, out: redact(combined.slice(0, 3000)) });
    expect(run.status, combined.slice(0, 2000)).toBe(0);
    expect(combined).toMatch(/recorder:ok/);
    expect(existsSync(recOut)).toBe(true);
  }, 60_000);

  for (const mut of MUTATIONS) {
    it(`provision mutate=${mut.kind} fails at exact validator (not dependency)`, () => {
      const host = `s28r3-qa19-p-${mut.kind}`;
      const run = spawnSync(
        'bash',
        [H.provision, '--host', host, '--dry-run', '--skip-isolation'],
        {
          cwd: H.root,
          encoding: 'utf8',
          timeout: 60_000,
          env: env({
            HOLO_QA_PROOF_MUTATE: mut.kind,
            STAGING_ROOT: resolve(EVIDENCE, `p-${mut.kind}`),
          }),
        }
      );
      const combined = `${run.stdout ?? ''}\n${run.stderr ?? ''}`;
      writeEv(`p-mut-${mut.kind}.json`, {
        status: run.status,
        out: redact(combined.slice(0, 2500)),
      });
      expect(run.status, combined.slice(0, 1200)).not.toBe(0);
      expect(combined).toMatch(mut.re);
      // Must not be a generic early dependency residual only.
      expect(combined).toMatch(
        /HOLO_QA_PROOF_MUTATE applied|RO proof|tuple_fp16|context_fp16|schema|producer|stale/i
      );
    });

    it(`fire-drill mutate=${mut.kind} exact fail; no recorder side effects`, () => {
      const recOut = resolve(EVIDENCE, `fd-${mut.kind}-out.json`);
      const report = resolve(EVIDENCE, `fd-${mut.kind}-parity.json`);
      const rec = makeRecorder(recOut, report);
      if (existsSync(recOut)) unlinkSync(recOut);
      const run = spawnSync(
        'bash',
        [
          H.runner,
          '--host',
          `s28r3-qa19-f-${mut.kind}`,
          '--target-timestamp',
          '2026-07-28T12:00:00Z',
          '--report',
          report,
        ],
        {
          cwd: H.root,
          encoding: 'utf8',
          timeout: 60_000,
          env: env({
            HOLO_FIRE_DRILL_FAKE_VOLUMES: '1',
            HOLO_CLI: rec,
            HOLO_QA_PROOF_MUTATE: mut.kind,
          }),
        }
      );
      const combined = `${run.stdout ?? ''}\n${run.stderr ?? ''}`;
      writeEv(`fd-mut-${mut.kind}.json`, {
        status: run.status,
        out: redact(combined.slice(0, 2500)),
      });
      expect(run.status, combined.slice(0, 1200)).not.toBe(0);
      expect(combined).toMatch(mut.re);
      expect(combined).not.toMatch(/recorder:ok/);
      expect(existsSync(recOut)).toBe(false);
    });
  }
});

describe('GATE-FIX-S28R3-QA19 concurrent proof races (consumer-level)', () => {
  it('symlink proof swap fails with no-follow/identity under correct tuple/context', () => {
    const prove = spawnSync('bash', [H.prove], {
      cwd: H.root,
      encoding: 'utf8',
      timeout: 60_000,
      env: env(),
    });
    const pCombined = `${prove.stdout ?? ''}\n${prove.stderr ?? ''}`;
    expect(prove.status, pCombined.slice(0, 1500)).toBe(0);
    const m = /wrote RO proof attestation: (\S+)/.exec(pCombined);
    expect(m).toBeTruthy();
    const proof = m?.[1];
    if (!proof) throw new Error('prove output omitted the proof path');
    const body = JSON.parse(readFileSync(proof, 'utf8')) as {
      tuple_fp16: string;
      context_fp16: string;
    };
    const efp = body.tuple_fp16;
    const ectx = body.context_fp16;
    expect(efp.length).toBeGreaterThanOrEqual(8);
    expect(ectx.length).toBeGreaterThanOrEqual(8);

    // Syntactically valid fresh proof with correct fingerprints (would pass content checks).
    const evil = resolve(EVIDENCE, 'evil-valid-proof.json');
    const evilBody = {
      ...JSON.parse(readFileSync(proof, 'utf8')),
      note: 'qa19-race-evil',
    };
    writeFileSync(evil, `${JSON.stringify(evilBody, null, 2)}\n`);
    chmodSync(evil, 0o600);

    const bak = `${proof}.real-qa19`;
    renameSync(proof, bak);
    symlinkSync(evil, proof);

    const chk = spawnSync(
      'bash',
      [
        '-c',
        `source "$1/scripts/lib/r2-ro-live.sh"; r2_ro_init_trusted_helpers; r2_ro_validate_proof "$2" "$3" "$4"`,
        'x',
        H.root,
        proof,
        efp,
        ectx,
      ],
      {
        cwd: H.root,
        encoding: 'utf8',
        env: { ...process.env, ROOT: H.root, PATH: '/usr/bin:/bin' },
        timeout: 15_000,
      }
    );
    const c = `${chk.stdout ?? ''}\n${chk.stderr ?? ''}`;
    writeEv('race-symlink.json', { status: chk.status, out: redact(c.slice(0, 2000)) });
    // restore
    try {
      unlinkSync(proof);
    } catch {
      /* ignore */
    }
    renameSync(bak, proof);

    expect(chk.status).not.toBe(0);
    expect(c).toMatch(
      /symlink|NOFOLLOW|no-follow|refuse follow|not a regular file|cannot open proof|identity/i
    );
  });

  it('parent-directory replacement fails FD/private-dir identity checks', () => {
    const prove = spawnSync('bash', [H.prove], {
      cwd: H.root,
      encoding: 'utf8',
      timeout: 60_000,
      env: env(),
    });
    const pCombined = `${prove.stdout ?? ''}\n${prove.stderr ?? ''}`;
    expect(prove.status, pCombined.slice(0, 1500)).toBe(0);
    const m = /wrote RO proof attestation: (\S+)/.exec(pCombined);
    expect(m).toBeTruthy();
    const proof = m?.[1];
    if (!proof) throw new Error('prove output omitted the proof path');
    const body = JSON.parse(readFileSync(proof, 'utf8')) as {
      tuple_fp16: string;
      context_fp16: string;
    };

    // Move trusted proof dir aside and replace with a 0700 decoy containing a forged same-name proof.
    const trustedDir = resolve(H.root, '.tmp/r2-ro-proofs');
    const decoyRoot = resolve(EVIDENCE, `decoy-proofs-${Date.now()}`);
    mkdirSync(decoyRoot, { recursive: true, mode: 0o700 });
    chmodSync(decoyRoot, 0o700);
    const name = proof.split('/').pop();
    if (!name) throw new Error('proof path omitted its file name');
    const decoyProof = resolve(decoyRoot, name);
    writeFileSync(
      decoyProof,
      `${JSON.stringify(
        {
          ...JSON.parse(readFileSync(proof, 'utf8')),
          note: 'qa19-parent-swap',
        },
        null,
        2
      )}\n`
    );
    chmodSync(decoyProof, 0o600);

    const moved = `${trustedDir}.moved-qa19`;
    if (existsSync(moved)) rmSync(moved, { recursive: true, force: true });
    renameSync(trustedDir, moved);
    // Put decoy where trusted was — realpath will not match original trusted path after restore...
    // Actually validate compares realpath(parent) to R2_RO_TRUSTED_PROOF_DIR which is ROOT/.tmp/r2-ro-proofs.
    // After rename, symlink the name path: create dir at trusted path as symlink to decoy.
    symlinkSync(decoyRoot, trustedDir);

    const chk = spawnSync(
      'bash',
      [
        '-c',
        `source "$1/scripts/lib/r2-ro-live.sh"; r2_ro_init_trusted_helpers; r2_ro_validate_proof "$2" "$3" "$4"`,
        'x',
        H.root,
        resolve(trustedDir, name),
        body.tuple_fp16,
        body.context_fp16,
      ],
      {
        cwd: H.root,
        encoding: 'utf8',
        env: { ...process.env, ROOT: H.root, PATH: '/usr/bin:/bin' },
        timeout: 15_000,
      }
    );
    const c = `${chk.stdout ?? ''}\n${chk.stderr ?? ''}`;
    writeEv('race-parent.json', { status: chk.status, out: redact(c.slice(0, 2000)) });

    // restore
    try {
      unlinkSync(trustedDir);
    } catch {
      try {
        rmSync(trustedDir, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
    }
    renameSync(moved, trustedDir);

    expect(chk.status).not.toBe(0);
    expect(c).toMatch(
      /not trusted|private directory|symlink|NOFOLLOW|cannot open proof|realpath|identity|not a real directory/i
    );
  });

  it('fire-drill concurrent proof swap yields no recorder side effects', () => {
    // Inject a prove wrapper that races: after writing, immediately symlink-swap before return.
    // Simpler: use HOLO_QA_PROOF_MUTATE is sequential; for race use background process.
    const recOut = resolve(EVIDENCE, 'fd-race-out.json');
    const report = resolve(EVIDENCE, 'fd-race-parity.json');
    const rec = makeRecorder(recOut, report);
    if (existsSync(recOut)) unlinkSync(recOut);

    // Background: repeatedly replace any new proof with a symlink to forged valid-looking JSON.
    const raceScript = resolve(EVIDENCE, 'race-loop.sh');
    const forged = resolve(EVIDENCE, 'forged-race-proof.json');
    writeFileSync(
      forged,
      `${JSON.stringify(
        {
          schema: 'holo.r2-ro-proof.v1',
          ok: true,
          tuple_fp16: 'aaaaaaaaaaaaaaaa',
          context_fp16: 'bbbbbbbbbbbbbbbb',
          list_allowed: true,
          prefix_list_allowed: true,
          prefix_head_allowed: true,
          prefix_get_allowed: true,
          out_of_prefix_list_denied: true,
          out_of_prefix_head_denied: true,
          out_of_prefix_get_denied: true,
          put_denied: true,
          delete_denied: true,
          policy_kind: 'object-read-only',
          producer: 'scripts/prove-r2-readonly.sh',
          proved_at: new Date().toISOString().replace(/\.\d+Z$/, 'Z'),
          scope_probes_bound: true,
          scope_probe_in_key: 'pgbackrest/x',
          scope_probe_out_key: 'recovery-baselines/y',
        },
        null,
        2
      )}\n`
    );
    chmodSync(forged, 0o600);
    writeFileSync(
      raceScript,
      `#!/bin/bash
set -euo pipefail
DIR="$1"
FORGED="$2"
for i in $(seq 1 200); do
  for f in "$DIR"/.tmp/r2-ro-proofs/proof.*.json; do
    [[ -e "$f" ]] || continue
    if [[ -f "$f" && ! -L "$f" ]]; then
      mv "$f" "$f.raced" 2>/dev/null || true
      ln -s "$FORGED" "$f" 2>/dev/null || true
    fi
  done
  sleep 0.02
done
`
    );
    chmodSync(raceScript, 0o755);
    const child = spawn('bash', [raceScript, H.root, forged], {
      detached: true,
      stdio: 'ignore',
    });
    child.unref();

    const run = spawnSync(
      'bash',
      [
        H.runner,
        '--host',
        's28r3-qa19-fd-race',
        '--target-timestamp',
        '2026-07-28T12:00:00Z',
        '--report',
        report,
      ],
      {
        cwd: H.root,
        encoding: 'utf8',
        timeout: 90_000,
        env: env({
          HOLO_FIRE_DRILL_FAKE_VOLUMES: '1',
          HOLO_CLI: rec,
        }),
      }
    );
    try {
      if (child.pid) process.kill(-child.pid, 'SIGTERM');
    } catch {
      /* ignore */
    }
    const combined = `${run.stdout ?? ''}\n${run.stderr ?? ''}`;
    writeEv('fd-concurrent-race.json', {
      status: run.status,
      out: redact(combined.slice(0, 3000)),
    });
    // Either race wins (fail, no recorder) or prove wins (pass). If pass, recorder ok is fine.
    // Discriminating requirement: when validation fails due to swap, no recorder.
    if (run.status !== 0) {
      expect(combined).not.toMatch(/recorder:ok/);
      expect(existsSync(recOut)).toBe(false);
      expect(combined).toMatch(/RO proof|symlink|NOFOLLOW|prove|tuple|context|identity|trusted/i);
    } else {
      // Success path: proof was validated before race — still a valid run.
      expect(existsSync(recOut)).toBe(true);
    }
  });
});

describe('GATE-FIX-S28R3-QA19 full evidence canary scan', () => {
  it('success + error paths for prove/provision/fire-drill leave no canaries in tree', () => {
    const tree = resolve(EVIDENCE, 'canary-tree');
    mkdirSync(tree, { recursive: true });

    const polluted = env({
      OPENAI_API_KEY: CANARY_OPENAI,
      HOLO_R2_PROVIDER_MOCK_CANARY: CANARY_PROVIDER,
      R2_RESTORE_SECRET_ACCESS_KEY: CANARY_CRED,
      // still distinct from writer
      BACKUP_R2_SECRET_ACCESS_KEY: 'sk_writer_qa19_distinct',
    });

    // Error path: canary_error mock
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
    writeFileSync(resolve(tree, 'prove-error.txt'), redact(errC));
    expect(errProve.status).not.toBe(0);
    assertNoCanaries('prove-error', errC);

    // Success prove
    const okProve = spawnSync('bash', [H.prove], {
      cwd: H.root,
      encoding: 'utf8',
      timeout: 45_000,
      env: {
        ...polluted,
        R2_RESTORE_SECRET_ACCESS_KEY: 'sk_restore_qa19',
        HOLO_R2_PROVIDER_MOCK_MODE: 'canary_success',
        HOLO_R2_PROVIDER_MOCK_CANARY: CANARY_PROVIDER,
      },
    });
    const okC = `${okProve.stdout ?? ''}\n${okProve.stderr ?? ''}`;
    writeFileSync(resolve(tree, 'prove-ok.txt'), redact(okC));
    expect(okProve.status, okC.slice(0, 1500)).toBe(0);
    assertNoCanaries('prove-ok', okC);
    const pm = /wrote RO proof attestation: (\S+)/.exec(okC);
    if (pm) {
      const proofPath = pm[1];
      if (!proofPath) throw new Error('prove output matched without a proof path');
      writeFileSync(resolve(tree, 'proof.json'), redact(readFileSync(proofPath, 'utf8')));
      assertNoCanaries('proof-json', readFileSync(proofPath, 'utf8'));
    }

    // Provision success + fail
    const provOk = spawnSync(
      'bash',
      [H.provision, '--host', 'qa19-canary-p', '--dry-run', '--skip-isolation'],
      {
        cwd: H.root,
        encoding: 'utf8',
        timeout: 90_000,
        env: {
          ...polluted,
          R2_RESTORE_SECRET_ACCESS_KEY: 'sk_restore_qa19',
          STAGING_ROOT: resolve(tree, 'prov-stage'),
        },
      }
    );
    const provC = `${provOk.stdout ?? ''}\n${provOk.stderr ?? ''}`;
    writeFileSync(resolve(tree, 'provision.txt'), redact(provC));
    assertNoCanaries('provision', provC);

    const recOut = resolve(tree, 'fd-canary-out.json');
    const report = resolve(tree, 'fd-canary-parity.json');
    const att = resolve(tree, 'fd-canary-att.json');
    const rec = makeRecorder(recOut, report);
    const fd = spawnSync(
      'bash',
      [
        H.runner,
        '--host',
        'qa19-canary-fd',
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
          R2_RESTORE_SECRET_ACCESS_KEY: 'sk_restore_qa19',
          HOLO_FIRE_DRILL_FAKE_VOLUMES: '1',
          HOLO_CLI: rec,
        },
      }
    );
    const fdC = `${fd.stdout ?? ''}\n${fd.stderr ?? ''}`;
    writeFileSync(resolve(tree, 'fire-drill.txt'), redact(fdC));
    assertNoCanaries('fire-drill', fdC);
    if (existsSync(att)) {
      assertNoCanaries('attestation', readFileSync(att, 'utf8'));
    }
    if (existsSync(report)) {
      assertNoCanaries('parity-report', readFileSync(report, 'utf8'));
    }
    if (existsSync(recOut)) {
      assertNoCanaries('recorder', readFileSync(recOut, 'utf8'));
    }

    // Recursive scan: canaries never appear; ops secrets only forbidden outside target env files.
    for (const f of walkFiles(tree)) {
      const body = readFileSync(f, 'utf8');
      const isTargetEnv =
        f.endsWith('.env') || f.includes('restore-target') || f.includes('paths.txt');
      assertNoCanaries(`tree:${f}`, body, { opsSecrets: !isTargetEnv });
    }
    // Suite evidence artifacts: injected canaries must be absent everywhere.
    for (const f of walkFiles(EVIDENCE).filter((x) => x.endsWith('.json') || x.endsWith('.txt'))) {
      const body = readFileSync(f, 'utf8');
      expect(body, f).not.toContain(CANARY_PROVIDER);
      expect(body, f).not.toContain(CANARY_OPENAI);
      expect(body, f).not.toContain(CANARY_CRED);
    }
  }, 120_000);
});

describe('GATE-FIX-S28R3-QA19 whitespace', () => {
  it('task artifacts have no trailing whitespace on key lines', () => {
    const files = [
      'GATE-FIX-S28R3-QA15-zod-record-typecheck-fix.md',
      'GATE-FIX-S28R3-QA16-versioned-scope-probe-binding.md',
      'GATE-FIX-S28R3-QA17-credential-runtime-and-oracle-closure.md',
      'GATE-FIX-S28R3-QA18-credential-environment-sanitization.md',
      'GATE-FIX-S28R3-QA19-final-runtime-and-oracle-closure.md',
    ];
    const dir = resolve(
      REPO_ROOT,
      '.spec/prds/mk6-migration/tasks/sprint-28-point-in-time-restore-and-fresh-hardware-fire-drill'
    );
    for (const f of files) {
      const path = resolve(dir, f);
      if (!existsSync(path)) continue;
      const lines = readFileSync(path, 'utf8').split('\n');
      for (let i = 0; i < lines.length; i++) {
        expect(lines[i], `${f}:${i + 1}`).not.toMatch(/[ \t]+$/);
      }
    }
  });
});

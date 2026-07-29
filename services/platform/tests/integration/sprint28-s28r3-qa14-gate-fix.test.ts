/**
 * GATE-FIX-S28R3-QA14 — Root trust chain + real scope oracles.
 */
import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { resolve } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  ACCOUNT_ID,
  baseHarnessEnv,
  ENDPOINT,
  type HarnessPaths,
  makeHarness,
  SCOPE_IN,
  SCOPE_OUT,
} from './fixtures/qa13-harness';

const REPO_ROOT = resolve(import.meta.dirname, '../../../..');
const PROD_PROVE = resolve(REPO_ROOT, 'scripts/prove-r2-readonly.sh');
const PROD_PROVISION = resolve(REPO_ROOT, 'scripts/provision-fresh-restore-target.sh');
const PROD_RUNNER = resolve(REPO_ROOT, 'scripts/run-fire-drill-on-fresh-target.sh');
const PROD_LIB = resolve(REPO_ROOT, 'scripts/lib/r2-ro-live.sh');
const PROD_PROVIDER = resolve(REPO_ROOT, 'scripts/lib/r2_s3_provider.py');
const EVIDENCE_DIR = resolve(REPO_ROOT, '.tmp/GATE-FIX-S28R3-QA14');

const WRITER_AK = 'qa14cfwriterakid0123456789abcdef';
const WRITER_SK = 'qa14cfwritersecret0123456789abcdefghijkl';
const RESTORE_SK = 'qa14cftempsessionsecret0123456789abcdef';
const RESTORE_ST = 'qa14cftempsessiontoken0123456789abcdef';
const CANARY = 'CANARY_PROVIDER_OUTPUT_MUST_NOT_APPEAR_QA14';
const PROOF_CANARY = 'CANARY_IN_PROOF_JSON_QA14';

let H: HarnessPaths;

function writeEvidence(name: string, body: unknown): void {
  mkdirSync(EVIDENCE_DIR, { recursive: true });
  const path = resolve(EVIDENCE_DIR, name);
  let text = typeof body === 'string' ? body : JSON.stringify(body, null, 2);
  // GATE-FIX-S28R3-QA17 sanitize: never persist ambient env dumps or secret values.
  text = text
    .replace(/((?:api[_-]?key|secret|token|password)\s*[=:]\s*)\S+/gi, '$1[redacted]')
    .replace(/\b(sk-[a-z0-9_-]{10,}|xai-[a-z0-9]{10,}|lin_api_[a-z0-9]+)\b/gi, '[redacted-token]')
    .replace(
      /^(SHELL|PATH|HOME|USER|OPENAI_|XAI_|ANTHROPIC_|JINA_|CONVEX_|CMUX_|OTEL_|SSH_|AWS_|NPM_|FPATH|LOGNAME)=.*$/gm,
      '[redacted-env-line]'
    );
  writeFileSync(path, text.endsWith('\n') ? text : `${text}\n`, 'utf8');
}

function env(extra: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  return baseHarnessEnv(REPO_ROOT, {
    REQUIRE_LIVE_R2_RO: '1',
    R2_ACCESS_KEY_ID: WRITER_AK,
    R2_SECRET_ACCESS_KEY: WRITER_SK,
    R2_RESTORE_ACCESS_KEY_ID: WRITER_AK,
    R2_RESTORE_SECRET_ACCESS_KEY: RESTORE_SK,
    R2_RESTORE_SESSION_TOKEN: RESTORE_ST,
    ...extra,
  });
}

beforeAll(() => {
  H = makeHarness(REPO_ROOT, EVIDENCE_DIR);
});

describe('GATE-FIX-S28R3-QA14 CRITICAL absolute root helpers', () => {
  it('production sources use /usr/bin/env and /usr/bin/python3 (no bare env/python3 PATH)', () => {
    const prove = readFileSync(PROD_PROVE, 'utf8');
    const lib = readFileSync(PROD_LIB, 'utf8');
    expect(lib).toMatch(/R2_RO_ENV_BIN="\/usr\/bin\/env"/);
    expect(lib).toMatch(/R2_RO_PYTHON_BIN="\/usr\/bin\/python3"/);
    expect(lib).toMatch(/R2_RO_CURL_BIN="\/usr\/bin\/curl"/);
    expect(prove).toMatch(/r2_ro_run_provider|R2_RO_ENV_BIN/);
    // no bare aws CLI
    expect(prove).not.toMatch(/\$\{aws_env\[@\]\}"\s+aws\s/);
    expect(prove).not.toMatch(/"\$aws_bin"/);
  });

  it('forged PATH env/python3/aws never execute on harness prove (markers clean)', () => {
    mkdirSync(EVIDENCE_DIR, { recursive: true });
    const evil = resolve(EVIDENCE_DIR, 'evil-bin');
    mkdirSync(evil, { recursive: true });
    for (const name of ['env', 'python3', 'aws', 'curl'] as const) {
      const m = resolve(EVIDENCE_DIR, `evil-${name}.ran`);
      writeFileSync(
        resolve(evil, name),
        `#!/usr/bin/env bash\nprintf ran >${JSON.stringify(m)}\necho EVIL_${name} >&2\nexit 0\n`
      );
      chmodSync(resolve(evil, name), 0o755);
    }
    const run = spawnSync('bash', [H.prove], {
      cwd: H.root,
      encoding: 'utf8',
      timeout: 60_000,
      env: env({ PATH: `${evil}:${process.env.PATH ?? ''}` }),
    });
    const combined = `${run.stdout ?? ''}\n${run.stderr ?? ''}`;
    writeEvidence('c1-forged-helpers.json', {
      status: run.status,
      combined: combined.slice(0, 3000),
    });
    expect(run.status, combined.slice(0, 1500)).toBe(0);
    for (const name of ['env', 'python3', 'aws', 'curl']) {
      const m = resolve(EVIDENCE_DIR, `evil-${name}.ran`);
      expect(existsSync(m) && readFileSync(m, 'utf8').includes('ran'), name).toBe(false);
    }
  });
});

describe('GATE-FIX-S28R3-QA14 CRITICAL no production test/CLI seams', () => {
  it('production refuses HOLO_FIRE_DRILL_FAKE_VOLUMES and HOLO_QA_PROOF_MUTATE', () => {
    const fd = spawnSync(
      'bash',
      [PROD_RUNNER, '--host', 'x', '--target-timestamp', '2026-07-28T12:00:00Z'],
      { cwd: REPO_ROOT, encoding: 'utf8', env: env({ HOLO_FIRE_DRILL_FAKE_VOLUMES: '1' }) }
    );
    expect(`${fd.stdout}${fd.stderr}`).toMatch(/refuses HOLO_FIRE_DRILL_FAKE_VOLUMES/);
    expect(fd.status).not.toBe(0);

    const mut = spawnSync(
      'bash',
      [PROD_PROVISION, '--host', 'y', '--dry-run', '--skip-isolation'],
      {
        cwd: REPO_ROOT,
        encoding: 'utf8',
        env: env({ HOLO_QA_PROOF_MUTATE: 'stale', STAGING_ROOT: resolve(EVIDENCE_DIR, 'mut') }),
      }
    );
    expect(`${mut.stdout}${mut.stderr}`).toMatch(
      /refuses HOLO_QA_PROOF_MUTATE|HOLO_QA_PROOF_MUTATE/
    );
    expect(mut.status).not.toBe(0);
  });

  it('production lib has no r2_ro_apply_qa_proof_mutate', () => {
    const lib = readFileSync(PROD_LIB, 'utf8');
    expect(lib).not.toMatch(/r2_ro_apply_qa_proof_mutate/);
  });
});

describe('GATE-FIX-S28R3-QA14 HIGH scope oracles', () => {
  it('404 out-of-prefix is refused (not treated as AccessDenied)', () => {
    const run = spawnSync('bash', [H.prove], {
      cwd: H.root,
      encoding: 'utf8',
      timeout: 30_000,
      env: env({ HOLO_R2_PROVIDER_MOCK_MODE: 'oop_not_found' }),
    });
    const combined = `${run.stdout ?? ''}\n${run.stderr ?? ''}`;
    writeEvidence('h1-oop-404.json', { status: run.status, combined: combined.slice(0, 2500) });
    expect(run.status).not.toBe(0);
    expect(combined).toMatch(/scope_oracle_ambiguous|not AccessDenied|refuse 404/i);
  });

  it('broader out-of-prefix head success fails closed', () => {
    const run = spawnSync('bash', [H.prove], {
      cwd: H.root,
      encoding: 'utf8',
      timeout: 30_000,
      env: env({ HOLO_R2_PROVIDER_MOCK_MODE: 'broader_read' }),
    });
    const combined = `${run.stdout ?? ''}\n${run.stderr ?? ''}`;
    writeEvidence('h1-broader.json', { status: run.status, combined: combined.slice(0, 2500) });
    expect(run.status).not.toBe(0);
    // List is checked first; broader list or head/get read both fail closed.
    expect(combined).toMatch(/broader_list_scope|broader_read_scope/);
  });

  it('missing scope probe keys fail closed', () => {
    const run = spawnSync('bash', [H.prove], {
      cwd: H.root,
      encoding: 'utf8',
      timeout: 20_000,
      env: env({ R2_SCOPE_PROBE_IN_KEY: '', R2_SCOPE_PROBE_OUT_KEY: '' }),
    });
    expect(run.status).not.toBe(0);
    expect(`${run.stdout}${run.stderr}`).toMatch(/R2_SCOPE_PROBE|known-existing/i);
  });

  it('production path refuses non-control-plane scope probe keys', () => {
    // Production scripts (no mock mode) bind exact control-plane keys from r2-scope-probes.json.
    const derivedEp = `https://${ACCOUNT_ID}.r2.cloudflarestorage.com`;
    const run = spawnSync('bash', [PROD_PROVE], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      timeout: 20_000,
      env: {
        PATH: '/usr/bin:/bin',
        HOME: process.env.HOME,
        REQUIRE_LIVE_R2_RO: '1',
        R2_ACCOUNT_ID: ACCOUNT_ID,
        R2_ENDPOINT: derivedEp,
        R2_ACCESS_KEY_ID: 'AKIA_TEST',
        R2_SECRET_ACCESS_KEY: 'secret',
        R2_SESSION_TOKEN: 'tok',
        R2_RESTORE_ACCESS_KEY_ID: 'AKIA_TEST',
        R2_RESTORE_SECRET_ACCESS_KEY: 'secret2',
        R2_RESTORE_SESSION_TOKEN: 'tok',
        R2_BUCKET_NAME: 'holocron-backup',
        R2_PGBACKREST_PREFIX: 'pgbackrest',
        R2_CREDENTIAL_KIND: 'object-read-only',
        R2_SCOPE_PROBE_IN_KEY: 'pgbackrest/not-the-control-plane-key.bin',
        R2_SCOPE_PROBE_OUT_KEY:
          'recovery-baselines/by-backup/20260728-182755F/e1525b1f368a45062149243b9ddfcdfe5dc54fdf23b25136c9ef0cf1037e6360/recovery-baseline.json',
      },
    });
    expect(run.status).not.toBe(0);
    expect(`${run.stdout}${run.stderr}`).toMatch(
      /refuses env override|versioned R2_SCOPE_PROBE|trusted control-plane|R2_SCOPE_PROBE_IN_KEY/i
    );
  });

  it('successful harness proof binds scope probe keys into attestation', () => {
    const run = spawnSync('bash', [H.prove], {
      cwd: H.root,
      encoding: 'utf8',
      timeout: 30_000,
      env: env({}),
    });
    expect(run.status).toBe(0);
    const m = `${run.stdout}${run.stderr}`.match(/wrote RO proof attestation:\s+(\S+)/);
    expect(m?.[1]).toBeTruthy();
    const proofPath = m![1]!;
    expect(existsSync(proofPath)).toBe(true);
    const proof = JSON.parse(readFileSync(proofPath, 'utf8')) as Record<string, unknown>;
    expect(proof.scope_probes_bound).toBe(true);
    expect(proof.scope_probe_in_key).toBe(SCOPE_IN);
    expect(proof.scope_probe_out_key).toBe(SCOPE_OUT);
    expect(proof.scope_oracles).toMatchObject({
      out_of_prefix_list: 'AccessDenied',
      out_of_prefix_head: 'AccessDenied',
      out_of_prefix_get: 'AccessDenied',
    });
  });

  it('endpoint trailing slash rejected (byte-equal)', () => {
    const run = spawnSync('bash', [H.prove], {
      cwd: H.root,
      encoding: 'utf8',
      timeout: 20_000,
      env: env({ R2_ENDPOINT: `${ENDPOINT}/` }),
    });
    expect(run.status).not.toBe(0);
    expect(`${run.stdout}${run.stderr}`).toMatch(/byte-equal|R2_ENDPOINT/i);
  });
});

describe('GATE-FIX-S28R3-QA14 HIGH two-consumer mutations', () => {
  const mutations = [
    'stale',
    'future',
    'wrong-tuple',
    'malformed',
    'wrong-producer',
    'wrong-context',
  ] as const;

  function makeRecorder(out: string, report: string): string {
    const rec = resolve(
      EVIDENCE_DIR,
      `rec-${Date.now()}-${Math.random().toString(36).slice(2)}.sh`
    );
    writeFileSync(
      rec,
      `#!/usr/bin/env bash
set -euo pipefail
report=""
while [[ $# -gt 0 ]]; do case "$1" in --report) report="$2"; shift 2;; *) shift;; esac; done
echo recorder:ok
printf '%s\\n' '{"ok":true}' >${JSON.stringify(out)}
if [[ -n "$report" ]]; then
  cat >"$report" <<'JSON'
{"POSTGRES_PARITY_PASS":true,"LEDGER_CHECKSUM_MATCH":true,"BLOB_PARITY_PASS":true,"baseline_id":"qa14","baseline_key":"recovery-baselines/qa14.json","ok":true}
JSON
fi
exit 0
`
    );
    chmodSync(rec, 0o755);
    return rec;
  }

  it('fire-drill baseline reaches recorder with zero exit', () => {
    const recOut = resolve(EVIDENCE_DIR, 'fd-baseline-out.json');
    const report = resolve(EVIDENCE_DIR, 'fd-baseline-parity.json');
    const rec = makeRecorder(recOut, report);
    const run = spawnSync(
      'bash',
      [
        H.runner,
        '--host',
        's28r3-qa14-base',
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
    const combined = `${run.stdout ?? ''}\n${run.stderr ?? ''}`;
    writeEvidence('h2-fd-baseline.json', { status: run.status, combined: combined.slice(0, 4000) });
    expect(run.status, combined.slice(0, 1500)).toBe(0);
    expect(combined).toMatch(/recorder:ok/);
    expect(existsSync(recOut)).toBe(true);
  });

  for (const mut of mutations) {
    it(`provision refuses mutate=${mut} at proof validation`, () => {
      const host = `s28r3-qa14-p-${mut}`;
      const run = spawnSync(
        'bash',
        [H.provision, '--host', host, '--dry-run', '--skip-isolation'],
        {
          cwd: H.root,
          encoding: 'utf8',
          timeout: 60_000,
          env: env({
            HOLO_QA_PROOF_MUTATE: mut,
            STAGING_ROOT: resolve(EVIDENCE_DIR, `p-${mut}`),
          }),
        }
      );
      const combined = `${run.stdout ?? ''}\n${run.stderr ?? ''}`;
      expect(run.status, combined.slice(0, 800)).not.toBe(0);
      expect(combined).toMatch(
        /RO proof|tuple_fp16|context_fp16|schema|producer|stale|DEPENDENCY-S28-R2-RO/i
      );
    });

    it(`fire-drill mutate=${mut} fails at proof validation (no recorder)`, () => {
      const recOut = resolve(EVIDENCE_DIR, `fd-${mut}-out.json`);
      const report = resolve(EVIDENCE_DIR, `fd-${mut}-parity.json`);
      const rec = makeRecorder(recOut, report);
      if (existsSync(recOut)) unlinkSync(recOut);
      const run = spawnSync(
        'bash',
        [
          H.runner,
          '--host',
          `s28r3-qa14-f-${mut}`,
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
            HOLO_QA_PROOF_MUTATE: mut,
          }),
        }
      );
      const combined = `${run.stdout ?? ''}\n${run.stderr ?? ''}`;
      expect(run.status, combined.slice(0, 800)).not.toBe(0);
      expect(combined).toMatch(
        /RO proof|tuple_fp16|context_fp16|schema|producer|stale|DEPENDENCY-S28-R2-RO/i
      );
      expect(combined).not.toMatch(/recorder:ok/);
      expect(existsSync(recOut)).toBe(false);
    });
  }
});

describe('GATE-FIX-S28R3-QA14 MEDIUM FD no-follow process oracle', () => {
  it('symlink proof path is rejected by validate', () => {
    // Create real proof via harness prove, then replace with symlink and re-validate
    const run = spawnSync('bash', [H.prove], {
      cwd: H.root,
      encoding: 'utf8',
      timeout: 60_000,
      env: env(),
    });
    expect(run.status, `${run.stderr}`).toBe(0);
    const m = /wrote RO proof attestation: (\S+)/.exec(`${run.stdout}\n${run.stderr}`);
    expect(m).toBeTruthy();
    const proof = m![1];
    const bak = `${proof}.real`;
    const evil = resolve(EVIDENCE_DIR, 'evil-proof.json');
    writeFileSync(evil, JSON.stringify({ schema: 'holo.r2-ro-proof.v1', ok: true }) + '\n');
    // move real aside and symlink
    spawnSync('mv', [proof, bak]);
    symlinkSync(evil, proof);
    const chk = spawnSync(
      'bash',
      [
        '-c',
        `source "${H.root}/scripts/lib/r2-ro-live.sh"; r2_ro_init_trusted_helpers; r2_ro_validate_proof "$1" deadbeefdeadbeef deadbeefdeadbeef`,
        'x',
        proof,
      ],
      {
        cwd: H.root,
        encoding: 'utf8',
        env: { ...process.env, ROOT: H.root },
      }
    );
    // restore
    unlinkSync(proof);
    spawnSync('mv', [bak, proof]);
    expect(chk.status).not.toBe(0);
  });
});

describe('GATE-FIX-S28R3-QA14 MEDIUM canaries all-evidence', () => {
  it('provider canary never appears in prove logs or proof JSON', () => {
    const err = spawnSync('bash', [H.prove], {
      cwd: H.root,
      encoding: 'utf8',
      env: env({
        HOLO_R2_PROVIDER_MOCK_MODE: 'canary_error',
        HOLO_R2_PROVIDER_MOCK_CANARY: CANARY,
      }),
    });
    const errC = `${err.stdout ?? ''}\n${err.stderr ?? ''}`;
    expect(err.status).not.toBe(0);
    expect(errC).not.toContain(CANARY);

    const ok = spawnSync('bash', [H.prove], {
      cwd: H.root,
      encoding: 'utf8',
      env: env({
        HOLO_R2_PROVIDER_MOCK_MODE: 'canary_success',
        HOLO_R2_PROVIDER_MOCK_CANARY: CANARY,
      }),
    });
    const okC = `${ok.stdout ?? ''}\n${ok.stderr ?? ''}`;
    expect(ok.status, okC.slice(0, 1000)).toBe(0);
    expect(okC).not.toContain(CANARY);
    const m = /wrote RO proof attestation: (\S+)/.exec(okC);
    expect(m).toBeTruthy();
    const proofBody = readFileSync(m![1], 'utf8');
    expect(proofBody).not.toContain(CANARY);
    expect(proofBody).not.toContain(RESTORE_SK);
  });

  it('proof-canary mutation is visible in proof JSON and fails validation', () => {
    const host = `s28r3-qa14-proof-canary`;
    const run = spawnSync('bash', [H.provision, '--host', host, '--dry-run', '--skip-isolation'], {
      cwd: H.root,
      encoding: 'utf8',
      env: env({
        HOLO_QA_PROOF_MUTATE: 'proof-canary',
        HOLO_PROOF_CANARY: PROOF_CANARY,
        STAGING_ROOT: resolve(EVIDENCE_DIR, 'proof-canary'),
      }),
    });
    const combined = `${run.stdout ?? ''}\n${run.stderr ?? ''}`;
    writeEvidence('m3-proof-canary.json', {
      status: run.status,
      combined: combined.slice(0, 3000),
    });
    expect(run.status).not.toBe(0);
    expect(combined).toMatch(/HOLO_QA_PROOF_MUTATE applied: proof-canary|schema\/ok|RO proof/i);
  });
});

describe('GATE-FIX-S28R3-QA14 source/provider contracts', () => {
  it('repository stdlib provider exists and compiles', () => {
    expect(existsSync(PROD_PROVIDER)).toBe(true);
    const syn = spawnSync('/usr/bin/python3', ['-m', 'py_compile', PROD_PROVIDER], {
      encoding: 'utf8',
    });
    expect(syn.status, syn.stderr).toBe(0);
  });

  it('production refuses HOLO_TRUSTED_AWS_BIN', () => {
    const run = spawnSync('bash', [PROD_PROVE], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      env: env({
        HOLO_TRUSTED_AWS_BIN: '/tmp/evil-aws',
      }),
    });
    expect(`${run.stdout}${run.stderr}`).toMatch(/refuses HOLO_TRUSTED|HOLO_TRUSTED_/);
    expect(run.status).not.toBe(0);
  });
});

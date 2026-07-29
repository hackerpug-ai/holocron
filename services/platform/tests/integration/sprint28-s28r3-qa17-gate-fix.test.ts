/**
 * GATE-FIX-S28R3-QA17 — Credential path + oracle closure.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  ACCOUNT_ID,
  baseHarnessEnv,
  type HarnessPaths,
  makeHarness,
} from './fixtures/qa13-harness';

const REPO_ROOT = resolve(import.meta.dirname, '../../../..');
const PROD_FIRE = resolve(REPO_ROOT, 'scripts/run-fire-drill-on-fresh-target.sh');
const PROD_PROV = resolve(REPO_ROOT, 'scripts/provision-fresh-restore-target.sh');
const PROD_PROVIDER = resolve(REPO_ROOT, 'scripts/lib/r2_s3_provider.py');
const PROD_LIVE = resolve(REPO_ROOT, 'scripts/lib/r2-ro-live.sh');
const EVIDENCE = resolve(REPO_ROOT, '.tmp/GATE-FIX-S28R3-QA17');

let H: HarnessPaths;

beforeAll(() => {
  H = makeHarness(REPO_ROOT, EVIDENCE);
});

/** Redact secret-shaped substrings before any evidence write (never store values). */
function redactForEvidence(text: string): string {
  return text
    .replace(/((?:api[_-]?key|secret|token|password|authorization)\s*[=:]\s*)\S+/gi, '$1[redacted]')
    .replace(/\b(sk-[a-z0-9_-]{10,}|xai-[a-z0-9]{10,}|lin_api_[a-z0-9]+)\b/gi, '[redacted-token]')
    .replace(/^[A-Z][A-Z0-9_]{2,}=.+$/gm, (line) => {
      // Drop ambient KEY=value env dump lines entirely.
      if (/^(SHELL|PATH|HOME|USER|OPENAI_|XAI_|ANTHROPIC_|JINA_|CONVEX_|CMUX_|OTEL_|SSH_|AWS_|NPM_)/.test(line)) {
        return '[redacted-env-line]';
      }
      return line;
    });
}

function writeEv(name: string, body: unknown): void {
  mkdirSync(EVIDENCE, { recursive: true });
  const raw = typeof body === 'string' ? body : JSON.stringify(body, null, 2);
  writeFileSync(resolve(EVIDENCE, name), `${redactForEvidence(raw)}\n`);
}

const SECRET_ABSENCE =
  /OPENAI_API_KEY=|XAI_API_KEY=|BRAIN_TRUST|sk-proj-|lin_api_|CONVEX_TEAM_TOKEN=|JINA_API_KEY=|^SHELL=\/bin\/zsh$/m;

describe('GATE-FIX-S28R3-QA17 production source free of credential PATH seams', () => {
  it('production fire-drill refuses ambient BUN_BIN and FAKE_VOLUMES', () => {
    const src = readFileSync(PROD_FIRE, 'utf8');
    expect(src).toMatch(/refuses ambient BUN_BIN/);
    expect(src).not.toMatch(/BUN_BIN="\$\{BUN_BIN:-bun\}"/);
    expect(src).not.toMatch(/fake-volumes-unit-test/);
    expect(src).toMatch(/refuses HOLO_FIRE_DRILL_FAKE_VOLUMES/);
    // No bare openssl for credential fingerprints
    expect(src).not.toMatch(/openssl dgst/);
  });

  it('production consumers do not pass mock-provider knobs', () => {
    for (const f of [PROD_FIRE, PROD_PROV]) {
      const src = readFileSync(f, 'utf8');
      expect(src).not.toMatch(/HOLO_R2_PROVIDER_MOCK_MODE="\$\{HOLO_R2_PROVIDER_MOCK_MODE/);
    }
  });

  it('r2-ro-live hashes via python provider not openssl', () => {
    const src = readFileSync(PROD_LIVE, 'utf8');
    expect(src).toMatch(/r2_ro_fp16_fields/);
    expect(src).not.toMatch(/openssl dgst/);
  });

  it('production refuse BUN_BIN when set', () => {
    const run = spawnSync('bash', [PROD_FIRE, '--host', 'x', '--resolve-only'], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      timeout: 10_000,
      env: {
        PATH: '/usr/bin:/bin',
        BUN_BIN: '/tmp/evil-bun',
        HOME: process.env.HOME,
      },
    });
    expect(run.status).not.toBe(0);
    expect(`${run.stdout}${run.stderr}`).toMatch(/BUN_BIN|ambient/i);
  });

  it('production refuse HOLO_CLI via historical name still fixed', () => {
    const src = readFileSync(PROD_FIRE, 'utf8');
    expect(src).toMatch(/HOLO_CLI="\$ROOT\/services\/platform\/src\/cli\/holo\.ts"/);
  });
});

describe('GATE-FIX-S28R3-QA17 SigV4 path encoding', () => {
  it('provider encodes reserved characters in object path', () => {
    const run = spawnSync(
      '/usr/bin/python3',
      [
        '-c',
        `
import importlib.util
spec=importlib.util.spec_from_file_location('p', ${JSON.stringify(PROD_PROVIDER)})
m=importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
path=m._encode_s3_path('holocron-backup', 'pgbackrest/a b/#%x/ü.bin')
assert '%20' in path or '%23' in path
assert path.startswith('/holocron-backup/')
assert '/pgbackrest/' in path or 'pgbackrest' in path
print(path)
`,
      ],
      { encoding: 'utf8' }
    );
    writeEv('sigv4-encode.txt', `${run.stdout}${run.stderr}`);
    expect(run.status).toBe(0);
    expect(run.stdout).toMatch(/%23|%20/);
  });

  it('provider rejects hostile PYTHONPATH', () => {
    const run = spawnSync('/usr/bin/python3', [PROD_PROVIDER, 'fp16', 'a'], {
      encoding: 'utf8',
      env: { ...process.env, PYTHONPATH: '/tmp/evil-site-packages' },
    });
    expect(run.status).not.toBe(0);
    expect(`${run.stdout}${run.stderr}`).toMatch(/hostile Python|PYTHONPATH/i);
  });
});

describe('GATE-FIX-S28R3-QA17 harness still works after production seam strip', () => {
  it('harness prove succeeds with mock provider', () => {
    const run = spawnSync('bash', [H.prove], {
      cwd: H.root,
      encoding: 'utf8',
      timeout: 30_000,
      env: baseHarnessEnv(REPO_ROOT, {
        REQUIRE_LIVE_R2_RO: '1',
        R2_ACCESS_KEY_ID: 'AKIA_QA17',
        R2_SECRET_ACCESS_KEY: 'sk_w',
        R2_SESSION_TOKEN: 'st',
        R2_RESTORE_ACCESS_KEY_ID: 'AKIA_QA17',
        R2_RESTORE_SECRET_ACCESS_KEY: 'sk_r',
        R2_RESTORE_SESSION_TOKEN: 'st',
        HOLO_R2_PROVIDER_MOCK_MODE: 'default',
      }),
    });
    writeEv('harness-prove.json', {
      status: run.status,
      out: `${run.stdout}${run.stderr}`.slice(0, 2000),
    });
    expect(run.status).toBe(0);
    const m = `${run.stdout}${run.stderr}`.match(/wrote RO proof attestation:\s+(\S+)/);
    expect(m?.[1] && existsSync(m[1])).toBeTruthy();
    const proof = JSON.parse(readFileSync(m![1]!, 'utf8')) as Record<string, unknown>;
    expect(proof.scope_probes_bound).toBe(true);
    expect(proof.scope_probes_versioned_config).toBe('scripts/lib/r2-scope-probes.json');
  });
});

describe('GATE-FIX-S28R3-QA17 production refuses HOLO_CLI override env when present', () => {
  it('source pins fixed CLI path', () => {
    const src = readFileSync(PROD_FIRE, 'utf8');
    expect(src).not.toMatch(/HOLO_CLI="\$\{HOLO_CLI:-/);
  });
});

describe('GATE-FIX-S28R3-QA17 sanitize: no ambient env dump / secret leakage', () => {
  it('production assert_bound uses r2_ro_exec_isolated with -- command (never bare env)', () => {
    for (const f of [PROD_FIRE, PROD_PROV]) {
      const src = readFileSync(f, 'utf8');
      expect(src).toMatch(/r2_ro_exec_isolated/);
      expect(src).toMatch(/refuse bare env dump|r2_ro_filter_safe_log/);
      // Must not invoke env with only KEY=VAL and no command after broken continuation.
      expect(src).not.toMatch(/if ! "\$R2_RO_ENV_BIN" \\/);
    }
  });

  it('r2_ro_exec_isolated without command fails closed without dumping env values', () => {
    const script = `
set -euo pipefail
ROOT=${JSON.stringify(REPO_ROOT)}
source "$ROOT/scripts/lib/r2-ro-live.sh"
r2_ro_init_trusted_helpers >/dev/null
# Deliberately omit -- command (the historical env-dump footgun).
set +e
r2_ro_exec_isolated "FOO=bar" "OPENAI_API_KEY=sk-should-never-appear"
rc=$?
set -e
echo "RC=$rc"
exit "\$rc"
`;
    const run = spawnSync('bash', ['-c', script], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      timeout: 15_000,
      env: {
        PATH: '/usr/bin:/bin',
        HOME: process.env.HOME,
        // Plant a canary that must NEVER appear in output if env dumps.
        OPENAI_API_KEY: 'sk-proj-CANARY-MUST-NOT-LEAK-QA17',
        XAI_API_KEY: 'xai-CANARY-MUST-NOT-LEAK-QA17',
      },
    });
    const combined = `${run.stdout ?? ''}${run.stderr ?? ''}`;
    writeEv('isolated-no-cmd.json', { status: run.status, combined: redactForEvidence(combined) });
    expect(run.status).not.toBe(0);
    expect(combined).toMatch(/refuse bare env dump|requires KEY=VAL/);
    expect(combined).not.toMatch(/sk-proj-CANARY|xai-CANARY|OPENAI_API_KEY=sk/);
    expect(combined).not.toMatch(/^SHELL=/m);
  });

  it('r2_ro_filter_safe_log strips env-dump and secret lines', () => {
    const run = spawnSync(
      'bash',
      [
        '-c',
        `
ROOT=${JSON.stringify(REPO_ROOT)}
source "$ROOT/scripts/lib/r2-ro-live.sh"
printf '%s\\n' \
  'PASS: prefix list allowed' \
  'SHELL=/bin/zsh' \
  'OPENAI_API_KEY=sk-proj-LEAK' \
  'XAI_API_KEY=xai-LEAK' \
  'error: class=prove_nonzero' \
  'FOO=bar' | r2_ro_filter_safe_log
`,
      ],
      { cwd: REPO_ROOT, encoding: 'utf8', timeout: 10_000, env: { PATH: '/usr/bin:/bin', HOME: process.env.HOME } }
    );
    const out = run.stdout ?? '';
    writeEv('filter-safe-log.txt', redactForEvidence(out));
    expect(out).toMatch(/PASS: prefix list/);
    expect(out).toMatch(/error: class=prove_nonzero/);
    expect(out).not.toMatch(/sk-proj-LEAK|xai-LEAK|SHELL=\/bin\/zsh|OPENAI_API_KEY=/);
  });

  it('recursive QA17 evidence tree has no real-secret or ambient env dumps', () => {
    // Scan evidence artifacts only (json/txt/log) — not harness source copies.
    const { readdirSync, statSync } = require('node:fs') as typeof import('node:fs');
    const walk = (dir: string, acc: string[] = []): string[] => {
      if (!existsSync(dir)) return acc;
      for (const name of readdirSync(dir)) {
        if (name === 'harness' || name.startsWith('harness-') || name === 'scripts') continue;
        const p = resolve(dir, name);
        const st = statSync(p);
        if (st.isDirectory()) {
          // Skip nested harness trees entirely.
          if (name.startsWith('harness-')) continue;
          walk(p, acc);
        } else if (st.isFile() && st.size < 2_000_000 && /\.(json|txt|log|md)$/i.test(name)) {
          acc.push(p);
        }
      }
      return acc;
    };
    const files = walk(EVIDENCE);
    const hits: string[] = [];
    for (const f of files) {
      if (f.endsWith('secret-absence-scan.json')) continue;
      const text = readFileSync(f, 'utf8');
      if (SECRET_ABSENCE.test(text)) hits.push(f);
    }
    writeEv('secret-absence-scan.json', { filesScanned: files.length, hits });
    expect(hits, hits.join('\n')).toEqual([]);
  });
});

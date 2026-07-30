/**
 * GATE-FIX-S28R3-QA18 — Credential environment sanitization.
 *
 * RED: ambient secret canaries + hostile startup vars must never appear in
 * prove/provision/fire-drill outputs or evidence.
 * GREEN: isolated env -i allowlist + filtered logs + recursive absence scan.
 *
 * NEVER print raw env in this file.
 */
import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
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
const PROD_PROV = resolve(REPO_ROOT, 'scripts/provision-fresh-restore-target.sh');
const PROD_FIRE = resolve(REPO_ROOT, 'scripts/run-fire-drill-on-fresh-target.sh');
const PROD_LIVE = resolve(REPO_ROOT, 'scripts/lib/r2-ro-live.sh');
const EVIDENCE = resolve(REPO_ROOT, '.tmp/GATE-FIX-S28R3-QA18');

/** Synthetic canaries — must never appear in any consumer output/evidence. */
const CANARY_OPENAI = 'sk-proj-QA18-CANARY-MUST-NOT-LEAK';
const CANARY_XAI = 'xai-QA18-CANARY-MUST-NOT-LEAK';
const CANARY_LINEAR = 'lin_api_QA18CANARYMUSTNOTLEAK';
const CANARY_HOSTILE = 'QA18_HOSTILE_PYTHONPATH_MARKER';

const SECRET_ABSENCE = new RegExp(
  [
    CANARY_OPENAI,
    CANARY_XAI,
    CANARY_LINEAR,
    CANARY_HOSTILE,
    'OPENAI_API_KEY=',
    'XAI_API_KEY=',
    '^SHELL=/bin/zsh$',
  ].join('|'),
  'm'
);

let H: HarnessPaths;

beforeAll(() => {
  mkdirSync(EVIDENCE, { recursive: true });
  H = makeHarness(REPO_ROOT, EVIDENCE);
});

function redact(text: string): string {
  return text
    .replace(/((?:api[_-]?key|secret|token|password)\s*[=:]\s*)\S+/gi, '$1[redacted]')
    .replace(/\b(sk-[a-z0-9_-]{10,}|xai-[a-z0-9]{10,}|lin_api_[a-z0-9]+)\b/gi, '[redacted-token]')
    .replace(
      /^(SHELL|PATH|HOME|USER|OPENAI_|XAI_|ANTHROPIC_|JINA_|CONVEX_|CMUX_|OTEL_|SSH_|AWS_|NPM_)=.*$/gm,
      '[redacted-env-line]'
    );
}

function writeEv(name: string, body: unknown): void {
  const raw = typeof body === 'string' ? body : JSON.stringify(body, null, 2);
  writeFileSync(resolve(EVIDENCE, name), `${redact(raw)}\n`);
}

/** Ambient pollution injected into parent env for every consumer spawn. */
function pollutedEnv(extra: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  return baseHarnessEnv(REPO_ROOT, {
    REQUIRE_LIVE_R2_RO: '1',
    R2_ACCESS_KEY_ID: 'AKIA_QA18_W',
    R2_SECRET_ACCESS_KEY: 'sk_writer_qa18',
    R2_SESSION_TOKEN: 'st_w',
    R2_RESTORE_ACCESS_KEY_ID: 'AKIA_QA18_W',
    R2_RESTORE_SECRET_ACCESS_KEY: 'sk_restore_qa18',
    R2_RESTORE_SESSION_TOKEN: 'st_r',
    HOLO_R2_PROVIDER_MOCK_MODE: 'default',
    // Ambient secrets / hostile startup (must not leak).
    OPENAI_API_KEY: CANARY_OPENAI,
    XAI_API_KEY: CANARY_XAI,
    LINEAR_API_KEY: CANARY_LINEAR,
    PYTHONPATH: `/tmp/${CANARY_HOSTILE}`,
    PYTHONSTARTUP: `/tmp/${CANARY_HOSTILE}.py`,
    ...extra,
  });
}

function assertNoCanaries(label: string, text: string): void {
  writeEv(`${label}-scan.txt`, redact(text.slice(0, 4000)));
  expect(text, `${label} leaked canary`).not.toMatch(SECRET_ABSENCE);
}

describe('GATE-FIX-S28R3-QA18 production isolation contracts', () => {
  it('source requires FD-3 isolated exec and fixed child PATH (QA23/QA24 transport)', () => {
    // GATE-FIX-S28R3-QA24: assert current FD transport contract, not removed env -i KEY=secret.
    const live = readFileSync(PROD_LIVE, 'utf8');
    expect(live).toMatch(/r2_ro_exec_isolated/);
    expect(live).toMatch(/exec-env-from-fd\.py/);
    expect(live).toMatch(/refuse bare env dump/);
    // FD 3 carries KEY=VAL pairs; argv of launcher is secret-free.
    expect(live).toMatch(/exec 3</);
    expect(live).not.toMatch(/"\$env_bin" -i .*AWS_SECRET_ACCESS_KEY=/);

    const fire = readFileSync(PROD_FIRE, 'utf8');
    expect(fire).toMatch(/r2_ro_exec_isolated/);
    expect(fire).toMatch(/CHILD_PATH="\/usr\/bin:\/bin/);
    expect(fire).not.toMatch(/CHILD_PATH="\$\{PATH:-/);
    expect(fire).not.toMatch(/BUN_INSTALL BUN_INSTALL_CACHE_DIR NODE_PATH/);
    // Production child credentials via FD 3 + exec-env-from-fd (never env -i KEY=secret on argv).
    expect(fire).toMatch(/exec-env-from-fd\.py/);
    // GATE-FIX-S28R3-QA25/QA26: sealed FD transport uses CHILD_ENV_KEYS + seal-env-to-file
    // (CHILD_ENV_ARGS KEY=val loop removed — would put secrets on argv).
    expect(fire).toMatch(/CHILD_ENV_KEYS/);
    expect(fire).toMatch(/seal-env-to-file|exec-env-from-fd/);
    expect(fire).not.toMatch(/\/usr\/bin\/env -i "\$\{CHILD_ENV_ARGS\[@\]\}"/);

    const prov = readFileSync(PROD_PROV, 'utf8');
    expect(prov).toMatch(/r2_ro_exec_isolated/);
  });
});

describe('GATE-FIX-S28R3-QA18 forged ambient secrets through consumers', () => {
  it('prove (harness) never emits ambient canaries on success', () => {
    const run = spawnSync('bash', [H.prove], {
      cwd: H.root,
      encoding: 'utf8',
      timeout: 45_000,
      env: pollutedEnv({}),
    });
    const combined = `${run.stdout ?? ''}${run.stderr ?? ''}`;
    writeEv('prove-success.json', { status: run.status, out: redact(combined.slice(0, 2500)) });
    expect(run.status).toBe(0);
    assertNoCanaries('prove-success', combined);
  });

  it('prove (harness) never emits ambient canaries on failure', () => {
    const run = spawnSync('bash', [H.prove], {
      cwd: H.root,
      encoding: 'utf8',
      timeout: 30_000,
      env: pollutedEnv({
        R2_RESTORE_SECRET_ACCESS_KEY: '', // force credential failure path
        R2_SECRET_ACCESS_KEY: '',
      }),
    });
    const combined = `${run.stdout ?? ''}${run.stderr ?? ''}`;
    writeEv('prove-fail.json', { status: run.status, out: redact(combined.slice(0, 2500)) });
    expect(run.status).not.toBe(0);
    assertNoCanaries('prove-fail', combined);
  });

  it('provision (harness) never emits ambient canaries', () => {
    const run = spawnSync(
      'bash',
      [H.provision, '--host', 'qa18-prov', '--dry-run', '--skip-isolation'],
      {
        cwd: H.root,
        encoding: 'utf8',
        timeout: 60_000,
        env: pollutedEnv({}),
      }
    );
    const combined = `${run.stdout ?? ''}${run.stderr ?? ''}`;
    writeEv('provision.json', { status: run.status, out: redact(combined.slice(0, 2500)) });
    // May pass or fail depending on dry-run path; canaries must never appear.
    assertNoCanaries('provision', combined);
  });

  it('fire-drill (harness) never emits ambient canaries on success path', () => {
    const report = resolve(EVIDENCE, 'qa18-parity.json');
    const rec = resolve(EVIDENCE, 'qa18-recorder.sh');
    // Must write contract-shaped parity report (assert-fire-drill-report).
    writeFileSync(
      rec,
      `#!/usr/bin/env bash
set -euo pipefail
report=""
while [[ $# -gt 0 ]]; do case "$1" in --report) report="$2"; shift 2;; *) shift;; esac; done
echo recorder:ok
if [[ -n "$report" ]]; then
  cat >"$report" <<'JSON'
{"POSTGRES_PARITY_PASS":true,"LEDGER_CHECKSUM_MATCH":true,"BLOB_PARITY_PASS":true,"baseline_id":"qa18","baseline_key":"recovery-baselines/qa18.json","ok":true}
JSON
fi
exit 0
`
    );
    chmodSync(rec, 0o755);
    const run = spawnSync(
      'bash',
      [
        H.runner,
        '--host',
        'qa18-fd',
        '--target-timestamp',
        '2026-07-28T12:00:00Z',
        '--report',
        report,
      ],
      {
        cwd: H.root,
        encoding: 'utf8',
        timeout: 90_000,
        env: pollutedEnv({
          HOLO_FIRE_DRILL_FAKE_VOLUMES: '1',
          HOLO_CLI: rec,
        }),
      }
    );
    const combined = `${run.stdout ?? ''}${run.stderr ?? ''}`;
    writeEv('fire-drill.json', { status: run.status, out: redact(combined.slice(0, 2500)) });
    expect(run.status).toBe(0);
    expect(combined).toMatch(/recorder:ok/);
    assertNoCanaries('fire-drill', combined);
  });
  it('production fire-drill refuses ambient BUN_BIN without dumping env', () => {
    const run = spawnSync('bash', [PROD_FIRE, '--host', 'x', '--resolve-only'], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      timeout: 10_000,
      env: {
        PATH: '/usr/bin:/bin',
        HOME: process.env.HOME,
        BUN_BIN: '/tmp/evil-bun',
        OPENAI_API_KEY: CANARY_OPENAI,
        XAI_API_KEY: CANARY_XAI,
      },
    });
    const combined = `${run.stdout ?? ''}${run.stderr ?? ''}`;
    writeEv('prod-bun-refuse.json', { status: run.status, out: redact(combined) });
    expect(run.status).not.toBe(0);
    assertNoCanaries('prod-bun-refuse', combined);
  });
});

describe('GATE-FIX-S28R3-QA18 recursive evidence canary scan', () => {
  it('scans full QA18 evidence tree for canaries and ambient dumps', () => {
    const walk = (dir: string, acc: string[] = []): string[] => {
      if (!existsSync(dir)) return acc;
      for (const name of readdirSync(dir)) {
        if (name.startsWith('harness-') || name === 'scripts') continue;
        const p = resolve(dir, name);
        let st;
        try {
          st = statSync(p);
        } catch {
          continue;
        }
        if (st.isDirectory()) {
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
      if (f.endsWith('canary-scan.json')) continue;
      const text = readFileSync(f, 'utf8');
      if (SECRET_ABSENCE.test(text)) hits.push(f);
    }
    writeEv('canary-scan.json', { filesScanned: files.length, hits });
    expect(hits, hits.join('\n')).toEqual([]);
  });
});

/**
 * GATE-FIX-S28R3-QA6 — Bounded collision-resistant fresh-target host from GATE_RUN_ID.
 *
 * Defect: HOST="s28r3-gate-${GATE_RUN_ID}" can exceed 64 chars. QA run id
 * qa28-20260729T104535Z-420995be4d2d4690911d9bb2e7f96678 (len 54) → host len 65
 * → provision refuses "length 1-64" before DEPENDENCY-S28-R2-RO.
 *
 * Run:
 *   PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/sprint28-s28r3-qa6-gate-fix.test.ts
 */

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PLATFORM_IT } from '../../../../tests/integration/service/harness';

const itLive = PLATFORM_IT ? it : it.skip;

const REPO_ROOT = resolve(import.meta.dirname, '../../../..');
const SPRINT_DIR = resolve(
  REPO_ROOT,
  '.spec/prds/mk6-migration/tasks/sprint-28-point-in-time-restore-and-fresh-hardware-fire-drill'
);
const GATE_PLAN = resolve(SPRINT_DIR, 'gate-plan.json');
const HUMAN_GATE = resolve(SPRINT_DIR, 'HUMAN-GATE.md');
const DERIVE_HOST = resolve(REPO_ROOT, 'scripts/derive-s28-fresh-host.sh');
const ASSERT_RUN_ID = resolve(REPO_ROOT, 'scripts/assert-gate-run-id.sh');
const PROVISION = resolve(REPO_ROOT, 'scripts/provision-fresh-restore-target.sh');
const EVIDENCE_DIR = resolve(REPO_ROOT, '.tmp/GATE-FIX-S28R3-QA6');

/** Exact QA run id that produced host length 65 under naive derivation. */
const QA_RUN_ID = 'qa28-20260729T104535Z-420995be4d2d4690911d9bb2e7f96678';

const HOST_ALLOWLIST = /^[A-Za-z0-9][A-Za-z0-9_-]{0,62}[A-Za-z0-9]$|^[A-Za-z0-9]$/;

/** Frozen digests of steps 1,2,4,5,6 (GATE-FIX-S28R3-QA22/QA23/QA24 absolute-executable gate stream). */
const FROZEN_STEP_DIGESTS: Record<number, string> = {
  1: 'd4034742684ad6e11969967017419aecae313ea9117f50eeeae536160f87e1e3',
  2: '9857c6ec9d814b2e21635e5c154e9a046fdc3dc4120ebb44f826fe29cbc32729',
  4: 'd985ca9e08433b0c8fe34cff46a9c530b1a6aee9a5b40921765b460b82f5e3d4',
  5: 'c2cae3dedda433bf2ccd09ad9046da561c76f482cdfece513593df107ce9bfd3',
  6: '1993c1def20666b67f370dddedf7a0b2f368205f54f0ef41ff8bdece574ddb3a',
};

const PRE_QA6_STEP3_DIGEST = '90e9b01fbf63d161c4aca1ce3871a9e9dd3dec08e1a9a922615d5b16bd39c134';

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

function sha256(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

function naiveHost(runId: string): string {
  return `s28r3-gate-${runId}`;
}

function expectedDigestHost(runId: string): string {
  return `s28r3-${sha256(runId).slice(0, 16)}`;
}

function deriveHost(runId: string): { status: number | null; host: string; combined: string } {
  const run = spawnSync('bash', [DERIVE_HOST], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    timeout: 15_000,
    env: {
      PATH: process.env.PATH,
      HOME: process.env.HOME,
      GATE_RUN_ID: runId,
    },
  });
  const combined = `${run.stdout ?? ''}\n${run.stderr ?? ''}`;
  const host = (run.stdout ?? '').trim();
  return { status: run.status, host, combined };
}

function assertValidHost(host: string): void {
  expect(host.length, `host length: ${host}`).toBeGreaterThanOrEqual(1);
  expect(host.length, `host length: ${host}`).toBeLessThanOrEqual(64);
  expect(host, `host allowlist: ${host}`).toMatch(HOST_ALLOWLIST);
  expect(host).not.toMatch(/[/;]/);
  expect(host).not.toContain('..');
}

describe('GATE-FIX-S28R3-QA6 always-on contract', () => {
  it('derive-s28-fresh-host.sh exists and is executable bash', () => {
    expect(existsSync(DERIVE_HOST), 'scripts/derive-s28-fresh-host.sh required').toBe(true);
    const src = readFileSync(DERIVE_HOST, 'utf8');
    expect(src).toMatch(/^#!\/usr\/bin\/env bash|#!\/bin\/bash/);
    expect(src).toMatch(/GATE_RUN_ID|assert-gate-run-id/);
    writeEvidence('derive-script-exists.json', {
      path: DERIVE_HOST,
      exists: true,
      bytes: src.length,
    });
  });

  it('QA run id: derived host ≤64, valid, not the 65-char naive host', () => {
    expect(QA_RUN_ID.length).toBe(54);
    const naive = naiveHost(QA_RUN_ID);
    expect(naive.length).toBe(65);
    expect(naive).not.toMatch(HOST_ALLOWLIST); // too long for host contract

    const { status, host, combined } = deriveHost(QA_RUN_ID);
    writeEvidence('qa-run-id-host.json', {
      gate_run_id: QA_RUN_ID,
      gate_run_id_len: QA_RUN_ID.length,
      naive_host: naive,
      naive_len: naive.length,
      derived_host: host,
      derived_len: host.length,
      status,
      combined: combined.slice(0, 800),
      expected_digest_form: expectedDigestHost(QA_RUN_ID),
    });
    expect(status, combined.slice(0, 800)).toBe(0);
    assertValidHost(host);
    expect(host).not.toBe(naive);
    // Collision-resistant digest form (not silent truncation of run-id alone).
    expect(host).toBe(expectedDigestHost(QA_RUN_ID));
    expect(host).toMatch(/^s28r3-[0-9a-f]{16}$/);
  });

  it('max-length 64-char allowlisted run id → host ≤64 valid', () => {
    // 64 chars: start/end alphanumeric; interior may include _-
    const maxId = `A${'b'.repeat(62)}Z`;
    expect(maxId.length).toBe(64);
    // assert-gate-run-id must accept it
    const assertRun = spawnSync('bash', [ASSERT_RUN_ID], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      timeout: 10_000,
      env: { PATH: process.env.PATH, GATE_RUN_ID: maxId },
    });
    expect(assertRun.status, assertRun.stderr ?? '').toBe(0);

    const naive = naiveHost(maxId);
    expect(naive.length).toBeGreaterThan(64);

    const { status, host, combined } = deriveHost(maxId);
    writeEvidence('max-run-id-host.json', {
      gate_run_id: maxId,
      gate_run_id_len: maxId.length,
      naive_len: naive.length,
      derived_host: host,
      derived_len: host.length,
      status,
      combined: combined.slice(0, 500),
    });
    expect(status, combined.slice(0, 500)).toBe(0);
    assertValidHost(host);
    expect(host).toBe(expectedDigestHost(maxId));
  });

  it('short IDs → s28r3-gate-<id> when ≤64', () => {
    for (const id of ['a', 'ab', 'qa6-short'] as const) {
      const naive = naiveHost(id);
      expect(naive.length).toBeLessThanOrEqual(64);
      const { status, host, combined } = deriveHost(id);
      expect(status, `${id}: ${combined}`).toBe(0);
      assertValidHost(host);
      expect(host).toBe(naive);
    }
    writeEvidence('short-ids-host.json', {
      cases: ['a', 'ab', 'qa6-short'].map((id) => ({
        id,
        host: naiveHost(id),
        len: naiveHost(id).length,
      })),
    });
  });

  it('two long IDs same prefix different suffix → distinct hosts', () => {
    // Both force digest path: naive host = 11 + run-id-len; need run-id ≥ 54 → naive ≥ 65.
    const prefix = 'qa28-20260729T104535Z-420995be4d2d4690911d9bb2e7f9'; // 50
    const idA = `${prefix}aaaA`; // 54
    const idB = `${prefix}bbbB`; // 54
    expect(idA.length).toBe(54);
    expect(idB.length).toBe(54);
    expect(idA.slice(0, 50)).toBe(idB.slice(0, 50));
    expect(idA).not.toBe(idB);
    expect(naiveHost(idA).length).toBe(65);
    expect(naiveHost(idB).length).toBe(65);

    const a = deriveHost(idA);
    const b = deriveHost(idB);
    writeEvidence('collision-resistance.json', {
      idA,
      idB,
      hostA: a.host,
      hostB: b.host,
      statusA: a.status,
      statusB: b.status,
    });
    expect(a.status).toBe(0);
    expect(b.status).toBe(0);
    assertValidHost(a.host);
    assertValidHost(b.host);
    expect(a.host).not.toBe(b.host);
    expect(a.host).toBe(expectedDigestHost(idA));
    expect(b.host).toBe(expectedDigestHost(idB));
  });

  it('derive is deterministic (same id → same host twice)', () => {
    const once = deriveHost(QA_RUN_ID);
    const twice = deriveHost(QA_RUN_ID);
    expect(once.status).toBe(0);
    expect(twice.status).toBe(0);
    expect(once.host).toBe(twice.host);
  });

  it('unset / invalid GATE_RUN_ID fails closed (stderr, no host on stdout)', () => {
    const unset = spawnSync('bash', [DERIVE_HOST], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      timeout: 10_000,
      env: { PATH: process.env.PATH, HOME: process.env.HOME, GATE_RUN_ID: undefined },
    });
    expect(unset.status).not.toBe(0);
    expect((unset.stdout ?? '').trim()).toBe('');
    expect(`${unset.stderr ?? ''}`).toMatch(/GATE_RUN_ID|required|refuse|allowlist/i);

    const bad = spawnSync('bash', [DERIVE_HOST], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      timeout: 10_000,
      env: {
        PATH: process.env.PATH,
        HOME: process.env.HOME,
        GATE_RUN_ID: '../evil;rm',
      },
    });
    expect(bad.status).not.toBe(0);
    expect((bad.stdout ?? '').trim()).toBe('');
  });

  it('step3 uses derive-s28-fresh-host.sh; no bare HOST="s28r3-gate-${GATE_RUN_ID}"', () => {
    const plan = loadPlan();
    const step3 = String(stepOf(plan, 3).literal_cmd ?? '');
    // GATE-FIX-S28R3-QA22: absolute /bin/bash + absolute docker candidates before assert
    expect(step3).toMatch(/^set -euo pipefail; /);
    expect(step3).toMatch(/\/bin\/bash scripts\/assert-gate-run-id\.sh/);
    expect(step3).not.toMatch(/(?:^|[^/\w])bash scripts\/assert-gate-run-id\.sh/);
    expect(step3).toMatch(/HOST="\$\(\/bin\/bash scripts\/derive-s28-fresh-host\.sh\)"/);
    expect(step3).not.toMatch(/HOST="s28r3-gate-\$\{GATE_RUN_ID\}"/);
    // Evidence path still full run id
    expect(step3).toMatch(/EVID="\.tmp\/REDHAT-FIX-S28R3\/\$\{GATE_RUN_ID\}"/);
    // Trap/cleanup still uses $HOST via absolute "$DOCKER"
    expect(step3).toMatch(/(?:docker|"\$DOCKER") rm -f "\$HOST"/);
    expect(step3).toMatch(/\$\{HOST\}-pgdata/);
    expect(step3).toMatch(/\$\{HOST\}-blobs/);
    expect(step3).toMatch(/\$\{HOST\}-net/);
    // Digest must change from pre-QA6
    const dig = sha256(step3);
    expect(dig).not.toBe(PRE_QA6_STEP3_DIGEST);
    writeEvidence('step3-source.json', {
      uses_derive: true,
      no_naive_host_assign: true,
      step3_sha256: dig,
      pre_qa6_step3_sha256: PRE_QA6_STEP3_DIGEST,
      snippet: step3.slice(0, 280),
    });
  });

  it('steps 1,2,4,5,6 remain byte-identical (frozen digests)', () => {
    const plan = loadPlan();
    const actual: Record<string, string> = {};
    for (const n of [1, 2, 4, 5, 6] as const) {
      const cmd = String(stepOf(plan, n).literal_cmd ?? '');
      const dig = sha256(cmd);
      actual[`step${n}`] = dig;
      expect(dig, `step ${n} must be frozen`).toBe(FROZEN_STEP_DIGESTS[n]);
    }
    writeEvidence('frozen-steps-1-2-4-5-6.json', actual);
  });

  it('HUMAN-GATE step3 fenced bash matches plan literal_cmd', () => {
    const plan = loadPlan();
    const planCmd = String(stepOf(plan, 3).literal_cmd ?? '');
    const hg = readFileSync(HUMAN_GATE, 'utf8');
    const re = /###\s+3\s+[^\n]*\n[\s\S]*?```bash\n([\s\S]*?)```/;
    const m = re.exec(hg);
    expect(m, 'HUMAN-GATE step3 fenced bash').toBeTruthy();
    const fenced = (m?.[1] ?? '').replace(/\n$/, '');
    expect(fenced).toBe(planCmd);
    expect(fenced).toMatch(/derive-s28-fresh-host\.sh/);
    expect(fenced).toMatch(/\$\{GATE_RUN_ID\}/);
    writeEvidence('human-gate-step3-parity.json', {
      plan_sha256: sha256(planCmd),
      human_sha256: sha256(fenced),
      match: fenced === planCmd,
    });
  });

  it('assert-gate-run-id.sh not weakened (still length 1-64 allowlist)', () => {
    const src = readFileSync(ASSERT_RUN_ID, 'utf8');
    expect(src).toMatch(/length 1-64|1–64/);
    expect(src).toMatch(/\^\[A-Za-z0-9\]\(\[A-Za-z0-9_-\]\{0,62\}\[A-Za-z0-9\]\)\?\$/);
    // still refuses empty
    const empty = spawnSync('bash', [ASSERT_RUN_ID], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      timeout: 10_000,
      env: { PATH: process.env.PATH, GATE_RUN_ID: '' },
    });
    expect(empty.status).not.toBe(0);
  });

  it('provision host validator still length 1-64 (not lengthened)', () => {
    const src = readFileSync(PROVISION, 'utf8');
    expect(src).toMatch(/\^\[A-Za-z0-9\]\[A-Za-z0-9_-\]\{0,62\}\[A-Za-z0-9\]\$\|\^\[A-Za-z0-9\]\$/);
    expect(src).toMatch(/length 1-64/);
  });
});

describe('GATE-FIX-S28R3-QA6 live seams (PLATFORM_IT)', () => {
  itLive(
    'provision with derived QA host fails for reasons OTHER than invalid host name',
    () => {
      const { status: dStatus, host, combined: dCombined } = deriveHost(QA_RUN_ID);
      expect(dStatus, dCombined).toBe(0);
      assertValidHost(host);

      // Intentionally missing real R2 restore credentials; allow placeholder so we
      // get past credential preflight to host validation and beyond.
      const staging = resolve(EVIDENCE_DIR, 'provision-host-check');
      mkdirSync(staging, { recursive: true });
      const pgPort = String(64600 + (Date.now() % 500));
      const provision = spawnSync(
        'bash',
        [PROVISION(), '--host', host, '--skip-isolation', '--pg-port', pgPort],
        {
          cwd: REPO_ROOT,
          encoding: 'utf8',
          timeout: 120_000,
          env: {
            ...process.env,
            STAGING_ROOT: staging,
            ALLOW_PLACEHOLDER_R2_RO: '1',
            GATE_RUN_ID: QA_RUN_ID,
          },
        }
      );
      const combined = `${provision.stdout ?? ''}\n${provision.stderr ?? ''}`;
      writeEvidence('provision-derived-host.json', {
        host,
        host_len: host.length,
        status: provision.status,
        combined: combined.slice(0, 4000),
      });
      // Must NOT refuse for invalid host name — that was the QA6 defect.
      expect(combined).not.toMatch(/refuse invalid host name/i);
      // Either provision succeeds (docker available + placeholder ok) or fails later
      // (docker/network/etc.) — both prove host validation passed.
      if (provision.status !== 0) {
        expect(combined).not.toMatch(/length 1-64/);
        // Host itself must have been accepted; failure reason is elsewhere.
        expect(combined).toMatch(
          /docker|credential|R2|placeholder|network|volume|image|refuse|error|not found|Cannot connect/i
        );
      }
      // Cleanup if provision partially created resources
      spawnSync('docker', ['rm', '-f', host], { encoding: 'utf8', timeout: 30_000 });
      spawnSync('docker', ['volume', 'rm', '-f', `${host}-pgdata`, `${host}-blobs`], {
        encoding: 'utf8',
        timeout: 30_000,
      });
      spawnSync('docker', ['network', 'rm', '-f', `${host}-net`], {
        encoding: 'utf8',
        timeout: 30_000,
      });
    },
    180_000
  );
});

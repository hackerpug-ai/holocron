/**
 * D08-03 — Final pre-deletion gate artifact consumer (AC-4).
 *
 * Drives scripts/assert-s32-d08-03-deletion-gate.sh against the real
 * deletion-gate.json produced by scripts/run-s32-d08-03-deletion-gate.sh.
 * Never mocks restore parity; refuses when the artifact is missing/stale.
 *
 * Run:
 *   PLATFORM_IT=1 pnpm vitest run --project integration \
 *     services/platform/tests/integration/sprint32-d08-03-deletion-gate.test.ts
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PLATFORM_IT } from '../../../../tests/integration/service/harness';

const itLive = PLATFORM_IT ? it : it.skip;

const REPO_ROOT = resolve(import.meta.dirname, '../../../..');
const ASSERT_SH = resolve(REPO_ROOT, 'scripts/assert-s32-d08-03-deletion-gate.sh');
const RUN_SH = resolve(REPO_ROOT, 'scripts/run-s32-d08-03-deletion-gate.sh');
const ARTIFACT = resolve(
  REPO_ROOT,
  '.spec/prds/mk6-migration/tasks/sprint-32-convex-decommission-code-deps-and-cloud-deletion/evidence/D08-03/deletion-gate.json'
);
const EVIDENCE_DIR = resolve(REPO_ROOT, '.tmp/D08-03');

function writeEvidence(name: string, body: unknown): void {
  mkdirSync(EVIDENCE_DIR, { recursive: true });
  const path = resolve(EVIDENCE_DIR, name);
  const text = typeof body === 'string' ? body : JSON.stringify(body, null, 2);
  writeFileSync(path, text.endsWith('\n') ? text : `${text}\n`, 'utf8');
}

describe('D08-03 deletion-gate scripts (always)', () => {
  it('assert and run scripts exist and bash -n clean', () => {
    expect(existsSync(ASSERT_SH), `missing ${ASSERT_SH}`).toBe(true);
    expect(existsSync(RUN_SH), `missing ${RUN_SH}`).toBe(true);
    for (const sh of [ASSERT_SH, RUN_SH]) {
      const syntax = spawnSync('bash', ['-n', sh], { encoding: 'utf8' });
      expect(syntax.status, `${sh}: ${syntax.stderr}`).toBe(0);
    }
  });

  it('assert refuses missing artifact (fail closed)', () => {
    const missing = resolve(EVIDENCE_DIR, 'no-such-deletion-gate.json');
    const run = spawnSync('bash', [ASSERT_SH, missing], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      timeout: 15_000,
    });
    writeEvidence('assert-missing.json', {
      status: run.status,
      stderr: (run.stderr ?? '').slice(0, 1500),
    });
    expect(run.status).not.toBe(0);
  });
});

describe('D08-03 deletion-gate live artifact (PLATFORM_IT)', () => {
  itLive('AC-4: real deletion-gate.json is schema-valid, all-pass, hash-bound, no deletion', () => {
    expect(
      existsSync(ARTIFACT),
      `missing live artifact — run scripts/run-s32-d08-03-deletion-gate.sh first: ${ARTIFACT}`
    ).toBe(true);
    expect(statSync(ARTIFACT).size).toBeGreaterThan(0);

    const raw = readFileSync(ARTIFACT, 'utf8');
    const data = JSON.parse(raw) as {
      schema?: string;
      status?: string;
      deletion_eligible?: boolean;
      convex_deletion_performed?: boolean;
      checks?: Array<{ status?: string }>;
      evidence_manifest?: Array<{ path?: string; sha256?: string }>;
    };

    expect(data.schema).toBe('holo.decommission.deletion-gate.v1');
    expect(data.status).toBe('pass');
    expect(data.deletion_eligible).toBe(true);
    expect(data.convex_deletion_performed).toBe(false);
    expect(Array.isArray(data.checks) && data.checks.length > 0).toBe(true);
    expect(data.checks!.every((c) => c.status === 'pass')).toBe(true);
    expect(Array.isArray(data.evidence_manifest) && data.evidence_manifest!.length > 0).toBe(true);
    for (const ent of data.evidence_manifest!) {
      expect(ent.sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(typeof ent.path).toBe('string');
      expect((ent.path ?? '').length).toBeGreaterThan(0);
    }

    // Secret-free: no raw credential-looking fields
    expect(raw).not.toMatch(/aws_secret|BEGIN (RSA |OPENSSH )?PRIVATE KEY/i);
    expect(raw).not.toMatch(/R2_RESTORE_SECRET_ACCESS_KEY\s*[:=]\s*["']?[A-Za-z0-9/+=]{16,}/);

    const assertRun = spawnSync('bash', [ASSERT_SH, ARTIFACT], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      timeout: 30_000,
      env: { ...process.env },
    });
    writeEvidence('assert-live.json', {
      status: assertRun.status,
      stdout: (assertRun.stdout ?? '').slice(0, 2000),
      stderr: (assertRun.stderr ?? '').slice(0, 2000),
    });
    expect(assertRun.status, assertRun.stderr + assertRun.stdout).toBe(0);

    // jq success criteria from task contract
    const jq = spawnSync(
      '/usr/bin/jq',
      [
        '-e',
        '.schema == "holo.decommission.deletion-gate.v1" and .status == "pass" and .deletion_eligible == true and .convex_deletion_performed == false and ([.checks[]|.status]|all(. == "pass")) and (.evidence_manifest|length > 0)',
        ARTIFACT,
      ],
      { encoding: 'utf8', timeout: 10_000 }
    );
    expect(jq.status, jq.stderr).toBe(0);
  });
});

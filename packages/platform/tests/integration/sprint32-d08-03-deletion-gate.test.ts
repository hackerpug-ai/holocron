/**
 * D08-03 — Final pre-deletion gate artifact consumer (AC-4).
 *
 * Drives scripts/assert-s32-d08-03-deletion-gate.sh against the real
 * deletion-gate.json produced by scripts/run-s32-d08-03-deletion-gate.sh.
 * Never mocks restore parity; refuses when the artifact is missing/stale.
 *
 * Run:
 *   PLATFORM_IT=1 pnpm vitest run --project integration \
 *     packages/platform/tests/integration/sprint32-d08-03-deletion-gate.test.ts
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

const RESIDUAL = resolve(
  REPO_ROOT,
  '.spec/prds/mk6-migration/tasks/sprint-32-convex-decommission-code-deps-and-cloud-deletion/evidence/D08-03/blocked-residual.json'
);

const SOFT_PASS_MARKERS = [
  'environment_unavailable',
  'environment_unavailable_zero_schema',
  'enforced_postgres_fk_sql',
  'ALLOW_MAESTRO_ENV_SKIP',
  '"sql_fallback": true',
  'SQL write/read fallback',
] as const;

describe('D08-03 deletion-gate live artifact (PLATFORM_IT)', () => {
  itLive('AC-4: pass gate is honest (or residual is blocked + deletion_eligible=false)', () => {
    const hasPass = existsSync(ARTIFACT) && statSync(ARTIFACT).size > 0;
    const hasResidual = existsSync(RESIDUAL) && statSync(RESIDUAL).size > 0;

    if (hasPass) {
      const raw = readFileSync(ARTIFACT, 'utf8');
      const data = JSON.parse(raw) as {
        schema?: string;
        status?: string;
        deletion_eligible?: boolean;
        convex_deletion_performed?: boolean;
        checks?: Array<{
          id?: string;
          status?: string;
          observations?: Record<string, unknown>;
        }>;
        evidence_manifest?: Array<{ path?: string; sha256?: string }>;
      };

      // Fail closed: pass artifact must not carry soft-pass markers
      for (const marker of SOFT_PASS_MARKERS) {
        expect(raw.includes(marker), `pass artifact contains soft-pass marker: ${marker}`).toBe(
          false
        );
      }

      if (data.status === 'pass') {
        expect(data.schema).toBe('holo.decommission.deletion-gate.v1');
        expect(data.deletion_eligible).toBe(true);
        expect(data.convex_deletion_performed).toBe(false);
        expect(Array.isArray(data.checks) && data.checks.length > 0).toBe(true);
        expect(data.checks!.every((c) => c.status === 'pass')).toBe(true);
        expect(Array.isArray(data.evidence_manifest) && data.evidence_manifest!.length > 0).toBe(
          true
        );
        for (const ent of data.evidence_manifest!) {
          expect(ent.sha256).toMatch(/^[0-9a-f]{64}$/);
          expect(typeof ent.path).toBe('string');
          expect((ent.path ?? '').length).toBeGreaterThan(0);
        }

        // Structured soft-pass rejection on observations
        for (const c of data.checks ?? []) {
          const obs = c.observations ?? {};
          if (c.id === 'AC-3') {
            expect(obs.maestro_exit_code === 0 || obs.maestro_exit_code === '0').toBe(true);
            expect(String(obs.maestro_mode ?? '')).not.toMatch(/environment_unavailable/);
            if (obs.http_mcp_mode != null) {
              expect(obs.http_mcp_mode).toBe('http_tools_call');
            }
            if (obs.http_mcp_ok != null) {
              expect(obs.http_mcp_ok).toBe(true);
            }
          }
          if (c.id === 'AC-2') {
            if (obs.fk_audit_mode != null) {
              expect(obs.fk_audit_mode).not.toBe('enforced_postgres_fk_sql');
              expect(String(obs.fk_audit_mode)).toMatch(/etl:fk-audit|fk-audit/);
            }
            if (obs.unenforcedEdges != null) {
              expect(obs.unenforcedEdges).toBe(0);
            }
            if (obs.orphans != null) {
              expect(obs.orphans).toBe(0);
            }
          }
        }

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
        return;
      }
    }

    // Honest residual path: blocked + deletion_eligible=false, no pass gate
    expect(hasResidual, 'expected either pass deletion-gate.json or blocked-residual.json').toBe(
      true
    );
    const residualRaw = readFileSync(RESIDUAL, 'utf8');
    const residual = JSON.parse(residualRaw) as {
      schema?: string;
      status?: string;
      deletion_gate?: { deletion_eligible?: boolean; status?: string; present?: boolean };
    };
    writeEvidence('residual-live.json', residual);
    expect(residual.schema).toBe('holo.decommission.blocked-residual.v1');
    expect(residual.status).toBe('blocked');
    expect(residual.deletion_gate?.deletion_eligible).toBe(false);
    // Must not claim pass while residual is authoritative
    if (hasPass) {
      const pass = JSON.parse(readFileSync(ARTIFACT, 'utf8')) as { status?: string };
      expect(pass.status).not.toBe('pass');
    }
  });
});

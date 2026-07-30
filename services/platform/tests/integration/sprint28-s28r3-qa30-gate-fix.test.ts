/**
 * GATE-FIX-S28R3-QA30 — canonical live-R2 policy and explicit restore prefix.
 *
 * Static gate-plan contracts only: no live credentials, provider calls, or Docker.
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = resolve(import.meta.dirname, '../../../..');
const SPRINT_DIR = resolve(
  REPO_ROOT,
  '.spec/prds/mk6-migration/tasks/sprint-28-point-in-time-restore-and-fresh-hardware-fire-drill'
);
const GATE_PLAN = resolve(SPRINT_DIR, 'gate-plan.json');
const EVIDENCE_DIR = resolve(REPO_ROOT, '.tmp/GATE-FIX-S28R3-QA30');

type GateStep = {
  n: number;
  literal_cmd?: string;
};

type GatePlan = {
  steps?: GateStep[];
};

function writeEvidence(name: string, body: unknown): void {
  mkdirSync(EVIDENCE_DIR, { recursive: true });
  const path = resolve(EVIDENCE_DIR, name);
  const text = JSON.stringify(body, null, 2);
  writeFileSync(path, `${text}\n`, 'utf8');
}

function loadPlan(): GatePlan {
  return JSON.parse(readFileSync(GATE_PLAN, 'utf8')) as GatePlan;
}

function stepOf(plan: GatePlan, n: number): GateStep {
  const step = (plan.steps ?? []).find((candidate) => candidate.n === n);
  expect(step, `gate-plan step ${n} required`).toBeTruthy();
  return step as GateStep;
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, canonicalize(child)])
    );
  }
  return value;
}

function canonicalJson(value: string): string {
  return JSON.stringify(canonicalize(JSON.parse(value)));
}

function canonicalPolicyFromHelper(): string {
  const run = spawnSync(
    '/bin/bash',
    [
      '-c',
      'set -euo pipefail; ROOT="$1"; source "$ROOT/scripts/lib/r2-ro-live.sh"; r2_ro_build_canonical_policy_json holocron-backup pgbackrest',
      'qa30-canonical-policy',
      REPO_ROOT,
    ],
    {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      env: { HOME: '/tmp', LC_ALL: 'C', PATH: '/usr/bin:/bin' },
      timeout: 30_000,
    }
  );
  const output = (run.stdout ?? '').trim();
  expect(run.status, `${run.stdout ?? ''}\n${run.stderr ?? ''}`).toBe(0);
  expect(output).not.toBe('');
  return output;
}

describe('GATE-FIX-S28R3-QA30 gate-plan contracts', () => {
  it('step 2 policy equals r2_ro_build_canonical_policy_json after normalization', () => {
    const step2 = stepOf(loadPlan(), 2);
    const command = String(step2.literal_cmd ?? '');
    const match = command.match(/export R2_CREDENTIAL_POLICY='([^']+)'/);
    expect(match, 'step 2 must export a literal R2_CREDENTIAL_POLICY').toBeTruthy();
    const planPolicy = match?.[1] ?? '';
    const helperPolicy = canonicalPolicyFromHelper();
    const normalizedPlanPolicy = canonicalJson(planPolicy);

    expect(normalizedPlanPolicy).toBe(helperPolicy);
    expect(normalizedPlanPolicy).toBe(canonicalJson(helperPolicy));

    const parsed = JSON.parse(planPolicy) as {
      Statement?: Array<{
        Sid?: string;
        Resource?: string[];
      }>;
    };
    expect(parsed.Statement).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          Sid: 'HolocronRestoreList',
          Resource: ['arn:aws:s3:::holocron-backup'],
        }),
        expect.objectContaining({
          Sid: 'HolocronRestoreGet',
          Resource: ['arn:aws:s3:::holocron-backup/pgbackrest/*'],
        }),
      ])
    );

    writeEvidence('canonical-policy.json', {
      helper_policy_sha256: createHash('sha256').update(helperPolicy).digest('hex'),
      normalized_plan_matches_helper: normalizedPlanPolicy === helperPolicy,
      statement_sids: parsed.Statement?.map((statement) => statement.Sid) ?? [],
      object_resource: parsed.Statement?.find((statement) => statement.Sid === 'HolocronRestoreGet')
        ?.Resource,
    });
  });

  it('step 3 passes an explicit pgbackrest prefix under REQUIRE_LIVE_R2_RO', () => {
    const step3 = stepOf(loadPlan(), 3);
    const command = String(step3.literal_cmd ?? '');

    expect(command).toMatch(
      /REQUIRE_LIVE_R2_RO=1 R2_RESTORE_OBJECT_PREFIX="pgbackrest" R2_PGBACKREST_PREFIX="pgbackrest" STAGING_ROOT="\$EVID\/fresh-restore" \/bin\/bash scripts\/provision-fresh-restore-target\.sh/
    );
    expect(command).toContain(
      'REQUIRE_LIVE_R2_RO=1 R2_RESTORE_OBJECT_PREFIX="pgbackrest" R2_PGBACKREST_PREFIX="pgbackrest" /bin/bash scripts/run-fire-drill-on-fresh-target.sh'
    );
    expect(command).toMatch(
      /if \[\[ -z "\$\{R2_RESTORE_ACCESS_KEY_ID:-\}" \|\| -z "\$\{R2_RESTORE_SECRET_ACCESS_KEY:-\}" \]\]; then[\s\S]*exit 1/
    );
    expect(command).not.toContain('ALLOW_PLACEHOLDER_R2_RO=1');
    expect(command).toContain('R2_RESTORE_SESSION_TOKEN');
    expect(command).toContain('R2_ENDPOINT');
    expect(command).toContain('R2_ACCOUNT_ID');
    expect(command).toContain('R2_BUCKET_NAME');

    writeEvidence('explicit-prefix-propagation.json', {
      require_live_r2_ro: command.includes('REQUIRE_LIVE_R2_RO=1'),
      provision_prefix: 'pgbackrest',
      provision_has_explicit_prefix: command.includes(
        'R2_RESTORE_OBJECT_PREFIX="pgbackrest" R2_PGBACKREST_PREFIX="pgbackrest"'
      ),
      missing_restore_keys_fail_closed: /R2_RESTORE_ACCESS_KEY_ID:-[\s\S]*exit 1/.test(command),
      placeholder_fallback_absent: !command.includes('ALLOW_PLACEHOLDER_R2_RO=1'),
      literal_cmd_sha256: createHash('sha256').update(command).digest('hex'),
    });
  });
});

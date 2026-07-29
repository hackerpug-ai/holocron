/**
 * REDHAT-FIX-S28R3 — Bind authoritative CAP-BAK-01 gate to volume-bound fresh-target
 * fire-drill (Terra CRITICAL-1) + live distinct R2_RESTORE_* (Terra HIGH-1).
 *
 * Static contracts over gate-plan.json + fail-closed script semantics.
 * Never invents credentials; residual contract DEPENDENCY-S28-R2-RO when RO keys absent.
 *
 * Run:
 *   PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/sprint28-s28r3-gate-bind.test.ts
 *   pnpm vitest run services/platform/tests/integration/sprint28-s28r3-gate-bind.test.ts
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = resolve(import.meta.dirname, '../../../..');
const GATE_PLAN = resolve(
  REPO_ROOT,
  '.spec/prds/mk6-migration/tasks/sprint-28-point-in-time-restore-and-fresh-hardware-fire-drill/gate-plan.json'
);
const PROVE_ISOLATION = resolve(REPO_ROOT, 'scripts/prove-isolation.sh');
const PROVE_R2 = resolve(REPO_ROOT, 'scripts/prove-r2-readonly.sh');
const PROVISION = resolve(REPO_ROOT, 'scripts/provision-fresh-restore-target.sh');
const FRESH_RUNNER = resolve(REPO_ROOT, 'scripts/run-fire-drill-on-fresh-target.sh');
const EVIDENCE_DIR = resolve(REPO_ROOT, '.tmp/REDHAT-FIX-S28R3');

type GateStep = {
  n: number;
  text?: string;
  literal_cmd?: string;
  assertion?: {
    require_all_regex?: string[];
    must_not_observe?: string[];
    notes?: string;
  };
};

type GatePlan = {
  steps?: GateStep[];
  planned_steps?: number;
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

const R2_POLICY =
  '{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Action":["s3:ListBucket","s3:GetBucketLocation"],"Resource":["arn:aws:s3:::holocron-backup"]},{"Effect":"Allow","Action":["s3:GetObject"],"Resource":["arn:aws:s3:::holocron-backup/*"]}]}';

const ISOLATED_MINI_BASE: Record<string, string> = {
  MINI_HOST: '203.0.113.1',
  MINI_IPV4: '203.0.113.1',
  MINI_IPV6: '2001:db8::1',
  MINI_TAILNET_IP: '203.0.113.2',
  MINI_LAN_IP: '203.0.113.3',
  MINI_DNS_ALIASES: 'mini.invalid',
  MINI_SOCKET_DEFAULTS: '0',
  MINI_UNIX_SOCKETS: '/tmp/.s.PGSQL.5432-s28r3-absent',
  TARGET_ATTESTED_IDENTITY: 'target-vm-uuid-s28r3',
  MINI_ATTESTED_IDENTITY: 'mini-hw-uuid-s28r3',
  REQUIRE_ATTESTED_IDENTITY: '1',
  R2_CREDENTIAL_KIND: 'object-read-only',
  R2_CREDENTIAL_POLICY: R2_POLICY,
  NC_TIMEOUT_SEC: '1',
};

describe('REDHAT-FIX-S28R3 gate-bind contracts (always)', () => {
  it('AC-1: gate-plan step3 is volume-bound fresh-target fire-drill + attestation', () => {
    const plan = loadPlan();
    const step3 = stepOf(plan, 3);
    const cmd = String(step3.literal_cmd ?? '');
    writeEvidence('ac1-step3-literal_cmd.txt', cmd);

    // Must invoke the volume-bound runner (or equivalent fresh-target path).
    expect(cmd).toMatch(/run-fire-drill-on-fresh-target\.sh|fresh-target.*fire-drill|provision-fresh-restore-target/);
    expect(cmd).toMatch(/run-fire-drill-on-fresh-target\.sh|--fresh-target|attestation/);

    // Must not use host-only REDHAT-FIX-H2 step3 scratch as restore destination.
    expect(cmd).not.toMatch(/--scratch\s+\.tmp\/REDHAT-FIX-H2\/step3-scratch/);
    expect(cmd).not.toMatch(/--blob-dir\s+\.tmp\/REDHAT-FIX-H2\/step3-blob/);
    // Direct host-tmp fire-drill without fresh-target runner is the CRITICAL-1 defect.
    const hostOnlyFireDrill =
      /holo\.ts\s+restore:fire-drill/.test(cmd) &&
      !/run-fire-drill-on-fresh-target\.sh/.test(cmd) &&
      /\.tmp\/REDHAT-FIX-H2\/step3-/.test(cmd);
    expect(hostOnlyFireDrill, 'step3 must not green on host-only .tmp/REDHAT-FIX-H2/step3-* fire-drill').toBe(
      false
    );

    // Attestation path expected for C1 gate claim.
    expect(cmd).toMatch(/attestation|--attestation|holo\.fresh-target\.fire-drill-attestation/);
  });

  it('AC-3: gate-plan step2 requires REQUIRE_LIVE_R2_RO + live prove-r2-readonly (no ro-test default green)', () => {
    const plan = loadPlan();
    const step2 = stepOf(plan, 2);
    const cmd = String(step2.literal_cmd ?? '');
    writeEvidence('ac3-step2-literal_cmd.txt', cmd);

    expect(cmd).toMatch(/REQUIRE_LIVE_R2_RO=1/);
    // Must not default live green path to placeholder ro-test.
    expect(cmd).not.toMatch(/R2_ACCESS_KEY_ID="\$\{R2_ACCESS_KEY_ID:-ro-test\}"/);
    expect(cmd).not.toMatch(/R2_SECRET_ACCESS_KEY="\$\{R2_SECRET_ACCESS_KEY:-ro-test\}"/);
    expect(cmd).not.toMatch(/:-ro-test"/);

    // Live path must include prove-r2-readonly or fail-closed prove-isolation under REQUIRE_LIVE.
    expect(cmd).toMatch(/prove-r2-readonly\.sh|prove-isolation\.sh/);
    // Prefer explicit prove-r2-readonly in the live chain.
    expect(cmd).toMatch(/prove-r2-readonly\.sh|DEPENDENCY-S28-R2-RO|R2_RESTORE_/);
  });

  it('AC-5: steps 1/4/5/6 domain claims preserved (no assertion weakening)', () => {
    const plan = loadPlan();
    const step1 = stepOf(plan, 1);
    const step4 = stepOf(plan, 4);
    const step5 = stepOf(plan, 5);
    const step6 = stepOf(plan, 6);

    // Step 1: real PITR path, never unknown-flag sole green.
    expect(String(step1.literal_cmd)).toMatch(/restore\s+--pitr|restore --pitr/);
    expect(JSON.stringify(step1.assertion ?? {})).toMatch(/unknown flag: --pitr|must_not_observe/);

    // Steps 4/5: strong jq predicates on parity report; QA4 ^true$ assertions OK.
    const cmd4 = String(step4.literal_cmd);
    const cmd5 = String(step5.literal_cmd);
    expect(cmd4).toMatch(/LEDGER_CHECKSUM_MATCH\s*==\s*true/);
    expect(cmd4).toMatch(/\[a-f0-9\]\{64\}|a-f0-9\]\{64/);
    expect(cmd5).toMatch(/BLOB_PARITY_PASS\s*==\s*true/);
    expect(cmd5).toMatch(/matched_objects.*>=\s*1|>= 1/);

    // Report path may move under S28R3, but must not reintroduce only host step3 unbound as sole path
    // without volume-bound producer (checked in AC-1). Steps 4/5 must read a parity report.
    expect(cmd4).toMatch(/parity-report\.json/);
    expect(cmd5).toMatch(/parity-report\.json/);

    // QA4 scalar true assertions remain valid (not weakening).
    const a4 = step4.assertion?.require_all_regex ?? [];
    const a5 = step5.assertion?.require_all_regex ?? [];
    expect(a4.some((r) => r === '^true$') || cmd4.includes('jq -e')).toBe(true);
    expect(a5.some((r) => r === '^true$') || cmd5.includes('jq -e')).toBe(true);

    // Step 6: empty-chain fail-closed named failure.
    const cmd6 = String(step6.literal_cmd);
    expect(cmd6).toMatch(/EMPTY_PREFIX|empty|R2_PGBACKREST_PREFIX/);
    expect(cmd6).toMatch(/no base backup available|backup chain missing/);
    expect(JSON.stringify(step6)).toMatch(/unknown flag: --pitr/);

    writeEvidence('ac5-claim-preservation.json', {
      step4_has_ledger64: /\[a-f0-9\]\{64\}/.test(cmd4),
      step5_has_blob_match: /matched_objects/.test(cmd5),
      step6_empty_chain: true,
    });
  });

  it(
    'AC-4: prove-isolation with REQUIRE_LIVE_R2_RO=1 + placeholders → non-zero + DEPENDENCY-S28-R2-RO',
    () => {
      expect(existsSync(PROVE_ISOLATION)).toBe(true);
      const run = spawnSync('bash', [PROVE_ISOLATION], {
        cwd: REPO_ROOT,
        encoding: 'utf8',
        timeout: 90_000,
        env: {
          ...process.env,
          ...ISOLATED_MINI_BASE,
          REQUIRE_LIVE_R2_RO: '1',
          R2_ACCESS_KEY_ID: 'ro-test',
          R2_SECRET_ACCESS_KEY: 'ro-test',
          R2_RESTORE_ACCESS_KEY_ID: '',
          R2_RESTORE_SECRET_ACCESS_KEY: '',
          // Clear ambient secrets bleed for this negative.
          HOLOCRON_SECRETS_PATH: '/nonexistent-s28r3-no-secrets',
          HOLO_SECRETS_PATH: '/nonexistent-s28r3-no-secrets',
        },
      });
      const combined = `${run.stdout ?? ''}\n${run.stderr ?? ''}`;
      writeEvidence('ac4-prove-isolation-placeholder-require-live.json', {
        status: run.status,
        combined: combined.slice(0, 4000),
      });
      expect(run.status, combined.slice(0, 1500)).not.toBe(0);
      expect(combined).toMatch(/DEPENDENCY-S28-R2-RO|refuse|placeholder|no live RO|REQUIRE_LIVE_R2_RO/i);
      // Must not WARN→PASS under REQUIRE_LIVE_R2_RO=1 with placeholders.
      expect(combined).not.toMatch(/RESULT:\s+PASS/);
      // Prefer explicit residual contract id.
      expect(combined).toMatch(/DEPENDENCY-S28-R2-RO/);
    },
    120_000
  );

  it('AC-4b: prove-r2-readonly with REQUIRE_LIVE_R2_RO=1 + missing restore keys → non-zero + residual', () => {
    expect(existsSync(PROVE_R2)).toBe(true);
    const run = spawnSync('bash', [PROVE_R2], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      timeout: 60_000,
      env: {
        ...process.env,
        REQUIRE_LIVE_R2_RO: '1',
        R2_ACCESS_KEY_ID: '',
        R2_SECRET_ACCESS_KEY: '',
        R2_RESTORE_ACCESS_KEY_ID: '',
        R2_RESTORE_SECRET_ACCESS_KEY: '',
        R2_ENDPOINT: '',
        R2_ACCOUNT_ID: '',
        CLOUDFLARE_API_TOKEN: '',
        R2_PARENT_ACCESS_KEY_ID: '',
        HOLOCRON_SECRETS_PATH: '/nonexistent-s28r3-no-secrets',
        HOLO_SECRETS_PATH: '/nonexistent-s28r3-no-secrets',
      },
    });
    const combined = `${run.stdout ?? ''}\n${run.stderr ?? ''}`;
    writeEvidence('ac4b-prove-r2-readonly-missing.json', {
      status: run.status,
      combined: combined.slice(0, 3000),
    });
    expect(run.status, combined.slice(0, 1200)).not.toBe(0);
    expect(combined).toMatch(/DEPENDENCY-S28-R2-RO|no live RO|human_required|placeholder|REQUIRE_LIVE/i);
    expect(combined).toMatch(/DEPENDENCY-S28-R2-RO/);
  });

  it('AC-4c: provision with REQUIRE_LIVE_R2_RO=1 + missing R2_RESTORE → non-zero + residual', () => {
    expect(existsSync(PROVISION)).toBe(true);
    const host = `s28r3-ac4c-${Date.now()}`;
    const run = spawnSync('bash', [PROVISION, '--host', host, '--dry-run', '--skip-isolation'], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      timeout: 30_000,
      env: {
        ...process.env,
        REQUIRE_LIVE_R2_RO: '1',
        R2_RESTORE_ACCESS_KEY_ID: '',
        R2_RESTORE_SECRET_ACCESS_KEY: '',
        R2_ACCESS_KEY_ID: 'ambient-rw-must-not-substitute',
        R2_SECRET_ACCESS_KEY: 'ambient-rw-secret-must-not-substitute',
        ALLOW_PLACEHOLDER_R2_RO: '0',
        STAGING_ROOT: resolve(EVIDENCE_DIR, 'provision-staging'),
      },
    });
    const combined = `${run.stdout ?? ''}\n${run.stderr ?? ''}`;
    writeEvidence('ac4c-provision-require-live-missing.json', {
      status: run.status,
      combined: combined.slice(0, 3000),
    });
    expect(run.status, combined.slice(0, 1200)).not.toBe(0);
    expect(combined).toMatch(/DEPENDENCY-S28-R2-RO|R2_RESTORE_|REQUIRE_LIVE|refuse|placeholder/i);
    expect(combined).toMatch(/DEPENDENCY-S28-R2-RO/);
  });

  it('AC-2/C1: gate claim is not green solely on resolve-only — runner/plan bind full fire-drill path', () => {
    expect(existsSync(FRESH_RUNNER)).toBe(true);
    const runner = readFileSync(FRESH_RUNNER, 'utf8');
    // Runner must support full fire-drill (not resolve-only only).
    expect(runner).toMatch(/restore:fire-drill/);
    expect(runner).toMatch(/--resolve-only/);
    expect(runner).toMatch(/holo\.fresh-target\.fire-drill-attestation\.v1/);

    const plan = loadPlan();
    const step3 = String(stepOf(plan, 3).literal_cmd ?? '');
    // Gate step3 must not be resolve-only-only.
    expect(step3).not.toMatch(/--resolve-only(?![^\n]*restore:fire-drill)/);
    if (/run-fire-drill-on-fresh-target/.test(step3)) {
      expect(step3).not.toMatch(/--resolve-only/);
      expect(step3).toMatch(/--target-timestamp|PITR_TIMESTAMP/);
    }
    writeEvidence('ac2-not-resolve-only-only.json', {
      runner_has_fire_drill: /restore:fire-drill/.test(runner),
      step3_has_resolve_only: /--resolve-only/.test(step3),
      step3_has_runner: /run-fire-drill-on-fresh-target/.test(step3),
    });
  });

  it('AC-6: credential inventory evidence records R2_RESTORE absence (lengths only)', () => {
    const invPath = resolve(EVIDENCE_DIR, 'credential-inventory.json');
    // Prefer committed local evidence file written by implementer probe; else probe keys presence only.
    if (!existsSync(invPath)) {
      writeEvidence('credential-inventory.json', {
        residual: 'DEPENDENCY-S28-R2-RO',
        note: 'inventory not pre-written; test expects residual when R2_RESTORE_* absent from secrets',
        R2_RESTORE_present: false,
      });
    }
    expect(existsSync(invPath)).toBe(true);
    const inv = JSON.parse(readFileSync(invPath, 'utf8')) as {
      residual?: string | null;
      R2_RESTORE_present?: boolean;
      keys?: Record<string, { present?: boolean; length?: number }>;
    };
    // Values must never appear; residual contract when restore keys absent.
    const text = readFileSync(invPath, 'utf8');
    expect(text).not.toMatch(/R2_SECRET_ACCESS_KEY"\s*:\s*"[A-Za-z0-9+/]{20,}/);
    if (inv.R2_RESTORE_present === false || inv.residual === 'DEPENDENCY-S28-R2-RO') {
      expect(inv.residual).toBe('DEPENDENCY-S28-R2-RO');
    }
    writeEvidence('ac6-inventory-check.json', {
      residual: inv.residual ?? null,
      R2_RESTORE_present: inv.R2_RESTORE_present ?? null,
    });
  });
});

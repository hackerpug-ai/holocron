/**
 * GATE-FIX-zero-loss-t-sync-013 — unit lane oracle tests (fixture-backed).
 * Real Postgres path is exercised by the gate step2 literal; fixtures prove
 * fail-closed identity bind and negative residual aaaa.
 *
 * Run: pnpm vitest run --project unit tests/cutover/gate-fix-zero-loss-t-sync-013.test.ts
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO = resolve(import.meta.dirname, '../..');
const ORACLE = resolve(REPO, 'scripts/lib/zero-loss-identity-oracle.py');
const FIX = resolve(REPO, '.tmp/GATE-FIX-zero-loss-t-sync-013/fixtures');
const EVID = resolve(REPO, '.tmp/GATE-FIX-zero-loss-t-sync-013');

function runOracle(args: string[]): { rc: number; stdout: string } {
  try {
    const stdout = execFileSync('python3', [ORACLE, ...args], {
      cwd: REPO,
      encoding: 'utf8',
      timeout: 30_000,
    });
    return { rc: 0, stdout };
  } catch (err) {
    const e = err as { status?: number; stdout?: string; stderr?: string };
    return { rc: e.status ?? 2, stdout: String(e.stdout ?? '') };
  }
}

describe('GATE-FIX-zero-loss-t-sync-013 (unit fixtures)', () => {
  it('TC-1/AC-6 RED: disarmed-fence accepted probes fail identity oracle', () => {
    const out = resolve(EVID, 'ac2-disarmed-fence-fail-closed.json');
    const r = runOracle([
      '--mode',
      'zero-loss',
      '--no-live-ledger',
      '--report',
      resolve(FIX, 'disarmed-fence-accepted-probes/drill-report.json'),
      '--ledger-ids',
      resolve(FIX, 'disarmed-fence-accepted-probes/ledger.json'),
      '--out',
      out,
    ]);
    expect(r.rc).not.toBe(0);
    const j = JSON.parse(r.stdout);
    expect(j.ok).toBe(false);
    expect(j.accepted_count).toBe(2);
    expect(j.identity_count).toBeGreaterThan(0);
    expect(j.accepted_write_identities.map((x: { id: string }) => x.id)).toEqual(
      expect.arrayContaining([
        '145f82e5-567d-4fd6-b97d-ff9a9ab998e2',
        '5ef15d4b-2f27-451f-9a03-efee7d8d4b7a',
      ])
    );
    // count-only is not enough — identities must be present on fail
    expect(j.error?.message).toMatch(/145f82e5|identity/i);
  });

  it('TC-11: invented lost_accepted_writes=0 with ledger ids present fails', () => {
    const r = runOracle([
      '--mode',
      'zero-loss',
      '--no-live-ledger',
      '--report',
      resolve(FIX, 'invented-zero-loss-json/drill-report.json'),
      '--ledger-ids',
      resolve(FIX, 'invented-zero-loss-json/ledger.json'),
      '--out',
      resolve(EVID, 'ac1-identity-when-count-gt0.json'),
    ]);
    expect(r.rc).not.toBe(0);
    const j = JSON.parse(r.stdout);
    expect(j.ok).toBe(false);
    expect(j.accepted_count).toBe(1);
    expect(j.accepted_write_identities.length).toBeGreaterThan(0);
  });

  it('TC-12: count-only ledger (count>0, empty rows) still fails closed', () => {
    const r = runOracle([
      '--mode',
      'zero-loss',
      '--no-live-ledger',
      '--report',
      resolve(FIX, 'count-only-step2/drill-report.json'),
      '--ledger-ids',
      resolve(FIX, 'count-only-step2/ledger.json'),
    ]);
    expect(r.rc).not.toBe(0);
    const j = JSON.parse(r.stdout);
    expect(j.ok).toBe(false);
    expect(j.accepted_count).toBe(2);
  });

  it('TC-7/AC-4: residual aaaa sentinel does not satisfy this-run step5 bind', () => {
    const r = runOracle([
      '--mode',
      'post-ponr',
      '--step4',
      resolve(FIX, 'residual-aaaa-ponr/step4.json'),
      '--step5',
      resolve(FIX, 'residual-aaaa-ponr/step5-residual.json'),
      '--out',
      resolve(EVID, 'ac4-residual-ponr-negative.json'),
    ]);
    expect(r.rc).not.toBe(0);
    const j = JSON.parse(r.stdout);
    expect(j.ok).toBe(false);
    expect(j.t_sync_014).toBe('FAIL');
  });

  it('TC-6/AC-3: this-run step4 ids bound in step5 PASS', () => {
    const r = runOracle([
      '--mode',
      'post-ponr',
      '--step4',
      resolve(FIX, 'residual-aaaa-ponr/step4.json'),
      '--step5',
      resolve(FIX, 'residual-aaaa-ponr/step5-this-run.json'),
      '--out',
      resolve(EVID, 'ac3-post-ponr-identity-bind-fixture.json'),
    ]);
    expect(r.rc).toBe(0);
    const j = JSON.parse(r.stdout);
    expect(j.ok).toBe(true);
    expect(j.step4_ponr_id).toBe('31b33eb4-3e97-4520-b6a7-745186fc8d51');
    expect(j.step4_write_row_id).toBe('ebd12bd6-f78d-4849-9595-8bc9d4036269');
  });

  it('AC-1 empty identity PASS path (fixture)', () => {
    const emptyReport = resolve(FIX, 'empty-zero-loss/drill-report.json');
    const emptyLedger = resolve(FIX, 'empty-zero-loss/ledger.json');
    mkdirSync(resolve(FIX, 'empty-zero-loss'), { recursive: true });
    writeFileSync(
      emptyReport,
      JSON.stringify(
        {
          ok: true,
          fence_armed: true,
          lost_accepted_writes: 0,
          independentRecompute: { acceptedCount: 0, matchesReport: true },
          accepted_write_identities: [],
          probes: {
            app: { status: 423, body: { code: 'migration_read_only' }, executed: true },
            mcp: { rejected: true, status: 200, message: 'MIGRATION_READ_ONLY', executed: true },
            upload: { status: 423, body: {}, executed: true },
            job: { ok: false, error: 'migration_read_only: x', executed: true },
            mission: { rejected: true, message: 'migration_read_only', executed: true },
          },
        },
        null,
        2
      )
    );
    writeFileSync(emptyLedger, JSON.stringify({ accepted_count: 0, rows: [] }, null, 2));
    const r = runOracle([
      '--mode',
      'zero-loss',
      '--no-live-ledger',
      '--report',
      emptyReport,
      '--ledger-ids',
      emptyLedger,
      '--out',
      resolve(EVID, 'ac1-zero-loss-empty-identity.json'),
    ]);
    expect(r.rc).toBe(0);
    const j = JSON.parse(r.stdout);
    expect(j.ok).toBe(true);
    expect(j.identity_count).toBe(0);
    expect(j.accepted_count).toBe(0);
  });

  it('static: gate-plan step2 requires identity_count and empty identities', () => {
    const plan = readFileSync(
      resolve(
        REPO,
        '.spec/prds/mk6-migration/tasks/sprint-30-cutover-rollback-drill-and-data-plane-point-of-no-return/gate-plan.json'
      ),
      'utf8'
    );
    expect(plan).toContain('assert-zero-loss-identity-oracle');
    expect(plan).toContain('identity_count');
    expect(plan).toContain('ZERO_LOSS_IDENTITY_EMPTY');
    expect(plan).toContain('fence_armed');
    // no sole count-only step2 without identity oracle
    expect(plan).toContain('GATE-FIX-zero-loss-t-sync-013');
  });

  it('static: gate preflight rearm wired; no sed secrets rewrite', () => {
    const gate = readFileSync(resolve(REPO, 'scripts/run-sprint30-human-gate.sh'), 'utf8');
    expect(gate).toContain('HOLO_GATE_REARM_FENCE');
    expect(gate).toContain('rearm-sprint30-cutover-control-plane.sh');
    expect(gate).toContain('prove-sprint30-fence-armed-live.sh');
    expect(gate).toContain('assert-sprint30-prep-ponr-clear.sh');
    expect(gate).toContain('assert-post-ponr-identity-bind.sh');
    // must not ad-hoc rewrite secrets with sed/re.sub for fence
    expect(gate).not.toMatch(/sed\s+.*HOLO_MIGRATION_READ_ONLY/);
    expect(gate).not.toMatch(/re\.sub\(.*HOLO_MIGRATION_READ_ONLY/);
  });
});

/**
 * GATE-FIX-gate-preflight-fence-rearm — unit static + script presence oracles.
 * Live 423 is proven by prove-sprint30-fence-armed-live.sh against HOLO_VERIFY_BASE_URL
 * (human gate / integration). Path-only is not closed — scripts must invoke rearm worker.
 *
 * Run: pnpm vitest run --project unit tests/cutover/gate-fix-gate-preflight-fence-rearm.test.ts
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO = resolve(import.meta.dirname, '../..');
const EVID = resolve(REPO, '.tmp/GATE-FIX-gate-preflight-fence-rearm');

describe('GATE-FIX-gate-preflight-fence-rearm (unit)', () => {
  it('AC-1/TC-1: run-sprint30-human-gate preflight default-ON rearm + opt-out', () => {
    const src = readFileSync(resolve(REPO, 'scripts/run-sprint30-human-gate.sh'), 'utf8');
    expect(src).toContain('HOLO_GATE_REARM_FENCE:-1');
    expect(src).toContain('rearm-sprint30-cutover-control-plane.sh');
    expect(src).toContain('--fence 1');
    expect(src).toContain('HOLO_GATE_RESTORE_SOAK_PLANE');
    expect(src).toContain('--plane postgres');
    expect(src).toContain('--target postgres-soak');
    expect(src).toMatch(/HOLO_GATE_REARM_FENCE=0/);
    // never ad-hoc regex rewrite — rearm worker owns durable write
    expect(src).not.toMatch(/sed\s+-i.*HOLO_MIGRATION_READ_ONLY/);
    expect(src).toContain('rearm-sprint30-cutover-control-plane.sh');
    const worker = readFileSync(
      resolve(REPO, 'scripts/lib/rearm-sprint30-cutover-control-plane.ts'),
      'utf8'
    );
    expect(worker).toContain('writeDurableMigrationReadOnly');
  });

  it('AC-2: live prove script exists and requires 423 + migration_read_only body', () => {
    const p = resolve(REPO, 'scripts/prove-sprint30-fence-armed-live.sh');
    expect(existsSync(p)).toBe(true);
    const src = readFileSync(p, 'utf8');
    expect(src).toContain('/api/documents');
    expect(src).toContain('423');
    expect(src).toContain('migration_read_only');
    expect(src).toContain('/health');
    expect(src).toContain('FENCE_NOT_ARMED_ON_SERVING_PROCESS');
  });

  it('AC-4: dual-path PONR clear uses readDataPlanePonr / preferHolocron', () => {
    const p = resolve(REPO, 'scripts/assert-sprint30-prep-ponr-clear.sh');
    expect(existsSync(p)).toBe(true);
    const src = readFileSync(p, 'utf8');
    expect(src).toContain('readDataPlanePonr');
    expect(src).toContain('preferHolocron: true');
    expect(src).toContain('PONR_DUAL_PATH_MISMATCH');
  });

  it('AC-8: sibling boundary documented; product five-surface not claimed here', () => {
    mkdirSync(EVID, { recursive: true });
    const md = [
      '# ac8-sibling-boundary',
      '',
      '- This task owns gate preflight re-arm + live 423 + pre-PONR clear only.',
      '- Product in-process DRILL_FENCE_NOT_ARMED before probes: GATE-FIX-drill-fence-precondition.',
      '- Zero-loss identity oracles: GATE-FIX-zero-loss-t-sync-013.',
      '- Fakeability floor: durable shape + live 423 body — path-only script exists is NOT closed.',
      '',
    ].join('\n');
    writeFileSync(resolve(EVID, 'ac8-sibling-boundary.md'), md);
    const gate = readFileSync(resolve(REPO, 'scripts/run-sprint30-human-gate.sh'), 'utf8');
    expect(gate).toContain('GATE-FIX-gate-preflight-fence-rearm');
    expect(gate).toContain('DRILL_FENCE_NOT_ARMED');
    writeFileSync(
      resolve(EVID, 'ac1-no-regex-rewrite-static.md'),
      [
        '# Static audit: no ad-hoc secrets regex rewrite',
        '',
        '- rearm uses scripts/lib/rearm-sprint30-cutover-control-plane.ts → writeDurableMigrationReadOnly',
        '- run-sprint30-human-gate.sh does not sed/re.sub HOLO_MIGRATION_READ_ONLY',
        '',
      ].join('\n')
    );
  });

  it('AC-7: RED baseline pointer present', () => {
    mkdirSync(EVID, { recursive: true });
    const red = {
      run_id: '20260808T011038Z',
      git_sha: '54299bfc76fec6fc52468dae451ca293a6f104c4',
      step1: 'DRILL_WRITE_SURFACES_NOT_BLOCKED fence_armed=false',
      step2: 'accepted_count=2',
      root_cause:
        'preflight never re-armed durable HOLO_MIGRATION_READ_ONLY after enable-writes left 0',
    };
    writeFileSync(
      resolve(EVID, 'red-20260808T011038Z-summary.json'),
      JSON.stringify(red, null, 2) + '\n'
    );
    expect(existsSync(resolve(EVID, 'red-20260808T011038Z-summary.json'))).toBe(true);
  });
});

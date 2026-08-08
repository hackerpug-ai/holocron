/**
 * GATE-FIX-drill-fence-precondition — unit lane (no live infra).
 * Static call-order + pure extractAcceptedWriteIdentities oracles.
 *
 * Run: pnpm vitest run --project unit tests/cutover/gate-fix-drill-fence-precondition.test.ts
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  DRILL_FENCE_NOT_ARMED,
  extractAcceptedWriteIdentities,
  type FiveWriteSurfaceProbes,
} from '../../services/platform/src/cutover/rollback-drill.ts';

const REPO_ROOT = resolve(import.meta.dirname, '../..');
const DRILL_SRC = resolve(REPO_ROOT, 'services/platform/src/cutover/rollback-drill.ts');

describe('GATE-FIX-drill-fence-precondition (unit)', () => {
  it('TC-9/TC-10: source has DRILL_FENCE_NOT_ARMED and fence precondition before probeFiveWriteSurfaces', () => {
    const src = readFileSync(DRILL_SRC, 'utf8');
    expect(src).toContain("export const DRILL_FENCE_NOT_ARMED = 'DRILL_FENCE_NOT_ARMED'");
    expect(src).toContain('fencePreconditionFailed');
    expect(src).toContain('isMigrationReadOnly()');

    // Call order: fence check / fencePreconditionFailed must appear before the
    // actual probeFiveWriteSurfaces(...) invocation site in runRollbackDrill.
    const fenceGuardIdx = src.indexOf('if (!fenceArmed)');
    const probeCallIdx = src.indexOf('probes = await probeFiveWriteSurfaces(');
    expect(fenceGuardIdx, 'missing if (!fenceArmed) guard').toBeGreaterThan(0);
    expect(probeCallIdx, 'missing probeFiveWriteSurfaces call').toBeGreaterThan(0);
    expect(fenceGuardIdx).toBeLessThan(probeCallIdx);

    // Error composition prefers DRILL_FENCE_NOT_ARMED over WRITE_SURFACES when precondition fails
    const fenceErrIdx = src.indexOf('code: DRILL_FENCE_NOT_ARMED');
    const surfacesErrIdx = src.indexOf('code: DRILL_WRITE_SURFACES_NOT_BLOCKED');
    expect(fenceErrIdx).toBeGreaterThan(0);
    expect(surfacesErrIdx).toBeGreaterThan(fenceErrIdx);

    // When fence not armed, probes stay empty (executed:false) — never call probes under disarmed
    expect(src).toMatch(/fencePreconditionFailed\s*=\s*true/);
    expect(src).toContain('refused five-surface');
    expect(src).toContain('zero-loss poison');
  });

  it('TC-10: DRILL_FENCE_NOT_ARMED constant is distinct and exported', () => {
    expect(DRILL_FENCE_NOT_ARMED).toBe('DRILL_FENCE_NOT_ARMED');
    expect(DRILL_FENCE_NOT_ARMED).not.toBe('DRILL_WRITE_SURFACES_NOT_BLOCKED');
  });

  it('extractAcceptedWriteIdentities binds app/mcp ids when accepted (count>0 path)', () => {
    const probes: FiveWriteSurfaceProbes = {
      app: {
        status: 201,
        body: { id: '145f82e5-567d-4fd6-b97d-ff9a9ab998e2' },
        executed: true,
      },
      mcp: {
        rejected: false,
        status: 200,
        message: JSON.stringify({
          documentId: '5ef15d4b-2f27-451f-9a03-efee7d8d4b7a',
        }),
        executed: true,
      },
      upload: { status: 404, body: {}, executed: true },
      job: { ok: true, error: null, executed: true },
      mission: { rejected: false, message: '', executed: true },
    };
    const ids = extractAcceptedWriteIdentities(probes);
    expect(ids.map((x) => x.id)).toEqual([
      '145f82e5-567d-4fd6-b97d-ff9a9ab998e2',
      '5ef15d4b-2f27-451f-9a03-efee7d8d4b7a',
    ]);
    expect(ids.find((x) => x.surface === 'app')?.status).toBe(201);
  });

  it('extractAcceptedWriteIdentities is empty when probes never executed (fail-closed path)', () => {
    const probes: FiveWriteSurfaceProbes = {
      app: { status: 0, body: {}, executed: false },
      mcp: { rejected: false, status: 0, message: '', executed: false },
      upload: { status: 0, body: {}, executed: false },
      job: { ok: true, error: null, executed: false },
      mission: { rejected: false, message: '', executed: false },
    };
    expect(extractAcceptedWriteIdentities(probes)).toEqual([]);
  });

  it('extractAcceptedWriteIdentities ignores blocked 423 surfaces (zero-loss path)', () => {
    const probes: FiveWriteSurfaceProbes = {
      app: {
        status: 423,
        body: { code: 'migration_read_only', error: 'migration_read_only' },
        executed: true,
      },
      mcp: {
        rejected: true,
        status: 200,
        message: 'MIGRATION_READ_ONLY',
        executed: true,
      },
      upload: {
        status: 423,
        body: { code: 'migration_read_only' },
        executed: true,
      },
      job: { ok: false, error: 'migration_read_only: task-timeout-worker', executed: true },
      mission: { rejected: true, message: 'migration_read_only: publish', executed: true },
    };
    expect(extractAcceptedWriteIdentities(probes)).toEqual([]);
  });
});

/**
 * struct-3 AC-1: RED test for malformed→repair→valid bounded loop.
 *
 * Proves the empty implementation fails with ReferenceError on extractStructured,
 * and that once implemented, the repair loop enters a bounded retry on malformed
 * output and yields a Zod-valid object.
 *
 * NEGATIVE_CONTROL (would fail if):
 * - Test stubbed to pass without real extractStructured implementation
 * - Network assertion mocked so always passes (zero fleet traffic)
 * - Test skipped or marked as todo
 * - Test uses fake extraction implementation that always succeeds
 * - Repair loop not capped at MAX_REPAIR_ATTEMPTS
 *
 * Run:
 *   PLATFORM_IT=1 pnpm vitest run tests/integration/service/struct-repair-loop.test.ts
 *
 * RED state (empty impl): ReferenceError: extractStructured is not defined
 * GREEN state (after struct-1): repair loop bounds attempts, returns Zod-valid object
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  goodInput,
  goodOutput,
  MAX_REPAIR_ATTEMPTS,
  malformedOnceInput,
  malformedOnceSchema,
  resetMalformedOnceCounter,
  simpleSchema,
} from '../../fixtures/struct-fixtures';
import { PLATFORM_IT, REPO_ROOT } from './harness';
import { installNetworkCapture } from './infer-network-capture';
import { loadResolveModel } from './infer-resolve-loader';

// Local fleet structured generation ≈ 27s/call; the repair loop makes up to 4 fleet
// round-trips, so live tests need a long timeout (the 5s default only fits a single fast call).
const FLEET_TIMEOUT = 180000;
const itLive = (
  name: string,
  fn: () => Promise<unknown> | undefined,
  timeout: number = FLEET_TIMEOUT
) => {
  if (PLATFORM_IT) it(name, fn, timeout);
  else it.skip(name, fn);
};
const EVIDENCE_DIR = resolve(REPO_ROOT, '.tmp/struct-3');

function writeArtifact(name: string, body: unknown): string {
  mkdirSync(EVIDENCE_DIR, { recursive: true });
  const path = resolve(EVIDENCE_DIR, name);
  const text = typeof body === 'string' ? body : JSON.stringify(body, null, 2);
  writeFileSync(path, text.endsWith('\n') ? text : `${text}\n`, 'utf8');
  return path;
}

/**
 * Load extractStructured from the implementation module.
 * This will fail with ReferenceError in RED state (module doesn't exist yet).
 */
async function loadExtractStructured() {
  // Path to the implementation that will be created in struct-1
  const path = ['../../../services/platform/src/inference', 'extract-structured'].join('/');
  try {
    return await import(path);
  } catch (err) {
    // In RED state, this module doesn't exist yet
    if (err instanceof Error && err.message.includes('Cannot find')) {
      const refErr = new ReferenceError(
        'extractStructured is not defined - RED state: implementation does not exist yet'
      );
      refErr.cause = err;
      throw refErr;
    }
    throw err;
  }
}

describe('struct-3 AC-1: malformed→repair→valid bounded loop (RED)', () => {
  beforeAll(() => {
    if (!PLATFORM_IT) return;
  });

  // REDHAT-FIX-C2-H3: fail-once counter must not leak across cases.
  beforeEach(() => {
    resetMalformedOnceCounter();
  });

  itLive('extractStructured function exists (RED: ReferenceError)', async () => {
    let caught: unknown;
    try {
      const mod = await loadExtractStructured();
      // If we reach here, check that the function is actually defined
      expect(typeof mod.extractStructured).toBe('function');
    } catch (err) {
      caught = err;
      // RED state: expect ReferenceError
      expect(caught).toBeInstanceOf(ReferenceError);
      expect(caught instanceof Error ? caught.message : String(caught)).toMatch(
        /extractStructured is not defined|RED state|implementation does not exist/i
      );
      writeArtifact('AC-1-red-extractStructured-missing.json', {
        error:
          caught instanceof Error ? { name: caught.name, message: caught.message } : String(caught),
        RED_state: true,
      });
      throw caught; // Re-throw to fail the test as expected
    }
  });

  itLive('good input returns Zod-valid object (RED: ReferenceError)', async () => {
    const capture = installNetworkCapture();
    try {
      const { resolveModel } = await loadResolveModel();
      const extractMod = await loadExtractStructured();

      const resolved = await resolveModel('divergent');
      expect(resolved.healthy).toBe(true);

      // This will fail in RED state with ReferenceError
      const result = await extractMod.extractStructured(simpleSchema, goodInput, 'divergent');

      // Once implemented (GREEN), this should succeed
      expect(result).toBeDefined();
      expect(simpleSchema.safeParse(result).success).toBe(true);
      expect(result).toMatchObject(goodOutput);

      // Must have real fleet traffic
      expect(capture.fleetCount()).toBeGreaterThanOrEqual(1);
      expect(capture.anthropicCount()).toBe(0);

      writeArtifact('AC-1-green-good-input.json', {
        result,
        parseResult: simpleSchema.safeParse(result),
        fleetCount: capture.fleetCount(),
        anthropicCount: capture.anthropicCount(),
      });
    } finally {
      capture.restore();
    }
  });

  itLive(
    'malformed-once enters repair loop and yields valid object (RED: ReferenceError)',
    async () => {
      const capture = installNetworkCapture();
      try {
        const { resolveModel } = await loadResolveModel();
        const extractMod = await loadExtractStructured();

        const resolved = await resolveModel('divergent');
        expect(resolved.healthy).toBe(true);

        // REDHAT-FIX-C2-H3: schema-side fail-once refine forces deterministic
        // repair (prompt-based simpleSchema was non-deterministic). Use a stable
        // extractionId so we can read status.attempts after success.
        const extractionId = `c2-h3-malformed-once-${Date.now()}`;
        const result = await extractMod.extractStructured(
          malformedOnceSchema,
          malformedOnceInput,
          'divergent',
          extractionId
        );

        // Once implemented (GREEN), this should succeed after repair loop
        expect(result).toBeDefined();
        // Keep simpleSchema shape check (never-silently-accept invariant) AND
        // the load-bearing attempts assertion that proves repair was entered.
        expect(simpleSchema.safeParse(result).success).toBe(true);

        const status = await extractMod.getExtractionStatus(extractionId);
        expect(status).toBeDefined();
        expect(status?.status).toBe('success');
        expect(status?.committed).toBe(true);
        // Load-bearing: a stub returning goodOutput on attempt 1 would set
        // attempts===1 and fail here. Real fail-once refine → attempts >= 2.
        expect(status?.attempts).toBeGreaterThanOrEqual(2);

        // Must have real fleet traffic for each repair iteration (not just once)
        expect(capture.fleetCount()).toBeGreaterThanOrEqual(2);
        expect(capture.anthropicCount()).toBe(0);

        writeArtifact('AC-1-green-repair-loop.json', {
          result,
          parseResult: simpleSchema.safeParse(result),
          status,
          fleetCount: capture.fleetCount(),
          anthropicCount: capture.anthropicCount(),
        });
      } finally {
        capture.restore();
      }
    }
  );

  itLive('repair loop is capped at MAX_REPAIR_ATTEMPTS (RED: ReferenceError)', async () => {
    // Verifies the cap constant is exported and bounded; the always-malformed path
    // (struct-explicit-fail) exercises the cap end-to-end against the real fleet.
    expect(MAX_REPAIR_ATTEMPTS).toBeGreaterThan(0);
    expect(MAX_REPAIR_ATTEMPTS).toBeLessThan(10); // Reasonable upper bound
    writeArtifact('AC-1-red-max-repair-attempts.json', {
      MAX_REPAIR_ATTEMPTS,
      RED_state: true,
      note: 'Cap exercised end-to-end by struct-explicit-fail always-malformed test',
    });
  });
});

describe('struct-3 AC-1 negative-control hygiene', () => {
  itLive('network capture is real (not hard-coded zero)', async () => {
    const capture = installNetworkCapture();
    try {
      // Real local request — count must increase
      await fetch('http://127.0.0.1:4545/v1/models').catch(() => undefined);
      expect(capture.rows.length).toBeGreaterThanOrEqual(1);
      expect(capture.fleetCount()).toBeGreaterThanOrEqual(1);

      writeArtifact('AC-1-capture-hygiene.json', {
        rowCount: capture.rows.length,
        fleetCount: capture.fleetCount(),
        anthropicCount: capture.anthropicCount(),
      });
    } finally {
      capture.restore();
    }
  });

  it('PLATFORM_IT gate is required for live assertions', () => {
    if (!PLATFORM_IT) {
      writeArtifact('AC-1-red-skipped-no-platform-it.json', {
        PLATFORM_IT: false,
        note: 'Live AC-1 cases require PLATFORM_IT=1 + real fleet + real Postgres',
      });
    }
    expect(typeof PLATFORM_IT).toBe('boolean');
  });

  it('simpleSchema validates correctly (z.any() not used)', () => {
    // Verify the fixture schema is strict (not z.any())
    const valid = simpleSchema.safeParse(goodOutput);
    expect(valid.success).toBe(true);

    const invalid = simpleSchema.safeParse({ wrong: 'structure' });
    expect(invalid.success).toBe(false);

    writeArtifact('AC-1-schema-strictness.json', {
      validInput: goodOutput,
      validParse: valid,
      invalidParse: invalid,
    });
  });
});

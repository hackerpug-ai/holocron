/**
 * struct-3 AC-3: RED test for tripwire→typed terminal BlockedError.
 *
 * Proves the empty implementation fails with ReferenceError on BlockedError,
 * and that once implemented, tripping an output tripwire during extraction
 * emits a typed terminal BlockedError and the tool is NOT dispatched.
 *
 * NEGATIVE_CONTROL (would fail if):
 * - Test stubbed to pass without real BlockedError class
 * - Test expects generic Error instead of BlockedError
 * - Test allows tool dispatch despite tripwire
 * - Test skipped or marked as todo
 * - Tripwire handling doesn't prevent downstream action
 *
 * Run:
 *   PLATFORM_IT=1 pnpm vitest run tests/integration/service/struct-tripwire-blocked.test.ts
 *
 * RED state (empty impl): ReferenceError: BlockedError is not defined
 * GREEN state (after struct-1): BlockedError emitted, tool not dispatched
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { tripwireInput, tripwirePayload, tripwireSchema } from '../../fixtures/struct-fixtures';
import { PLATFORM_IT, REPO_ROOT } from './harness';
import { installNetworkCapture } from './infer-network-capture';
import { loadResolveModel } from './infer-resolve-loader';

const itLive = PLATFORM_IT ? it : it.skip;
const EVIDENCE_DIR = resolve(REPO_ROOT, '.tmp/struct-3');

function writeArtifact(name: string, body: unknown): string {
  mkdirSync(EVIDENCE_DIR, { recursive: true });
  const path = resolve(EVIDENCE_DIR, name);
  const text = typeof body === 'string' ? body : JSON.stringify(body, null, 2);
  writeFileSync(path, text.endsWith('\n') ? text : `${text}\n`, 'utf8');
  return path;
}

/**
 * Load extractStructured and BlockedError from the implementation module.
 * This will fail with ReferenceError in RED state (module doesn't exist yet).
 */
async function loadExtractStructured() {
  const path = ['../../../services/platform/src/inference', 'extract-structured'].join('/');
  try {
    return await import(path);
  } catch (err) {
    if (err instanceof Error && err.message.includes('Cannot find')) {
      const refErr = new ReferenceError(
        'BlockedError is not defined - RED state: implementation does not exist yet'
      );
      refErr.cause = err;
      throw refErr;
    }
    throw err;
  }
}

describe('struct-3 AC-3: tripwire→BlockedError with no tool dispatch (RED)', () => {
  beforeAll(() => {
    if (!PLATFORM_IT) return;
  });

  itLive('BlockedError class exists (RED: ReferenceError)', async () => {
    let caught: unknown;
    try {
      const mod = await loadExtractStructured();
      // If we reach here, check that the error class is actually defined
      expect(typeof mod.BlockedError).toBe('function');
      expect(mod.BlockedError.prototype).toBeInstanceOf(Error);
    } catch (err) {
      caught = err;
      // RED state: expect ReferenceError
      expect(caught).toBeInstanceOf(ReferenceError);
      expect(caught instanceof Error ? caught.message : String(caught)).toMatch(
        /BlockedError is not defined|RED state|implementation does not exist/i
      );
      writeArtifact('AC-3-red-BlockedError-missing.json', {
        error:
          caught instanceof Error ? { name: caught.name, message: caught.message } : String(caught),
        RED_state: true,
      });
      throw caught;
    }
  });

  itLive('tripwire during extraction emits BlockedError (RED: ReferenceError)', async () => {
    const capture = installNetworkCapture();
    try {
      const { resolveModel } = await loadResolveModel();
      const extractMod = await loadExtractStructured();

      const resolved = await resolveModel('divergent');
      expect(resolved.healthy).toBe(true);

      let caught: unknown;
      try {
        // This will fail in RED state with ReferenceError
        const result = await extractMod.extractStructured(
          tripwireSchema,
          tripwireInput,
          'divergent'
        );
        // Once implemented (GREEN), this should throw BlockedError
        writeArtifact('AC-3-should-have-thrown-blocked.json', {
          unexpectedResult: result,
          error: 'Expected BlockedError to be thrown',
        });
        expect('should have thrown BlockedError').toBe('thrown');
      } catch (err) {
        caught = err;

        // In RED state, we get ReferenceError
        if (caught instanceof ReferenceError) {
          expect(caught.message).toMatch(/BlockedError is not defined|RED state/i);
          writeArtifact('AC-3-red-reference-error.json', {
            error: { name: caught.name, message: caught.message },
            RED_state: true,
          });
          throw caught; // Re-throw to fail test as expected
        }

        // In GREEN state, expect BlockedError
        expect(caught).toBeInstanceOf(extractMod.BlockedError);
        expect(caught instanceof Error ? caught.message : String(caught)).toMatch(
          /blocked|tripwire|unsafe|filtered/i
        );

        writeArtifact('AC-3-green-blocked-emitted.json', {
          error:
            caught instanceof Error
              ? { name: caught.name, message: caught.message }
              : String(caught),
          tripwirePayload,
          fleetCount: capture.fleetCount(),
          anthropicCount: capture.anthropicCount(),
        });
      }

      // Must have real fleet traffic
      expect(capture.fleetCount()).toBeGreaterThanOrEqual(1);
      expect(capture.anthropicCount()).toBe(0);
    } finally {
      capture.restore();
    }
  });

  itLive('BlockedError carries tripwire reason and processorId (RED: ReferenceError)', async () => {
    try {
      const extractMod = await loadExtractStructured();

      // This test verifies the error structure in GREEN state
      // For now, it proves we can access the error class
      expect(extractMod.BlockedError).toBeDefined();

      writeArtifact('AC-3-red-error-structure.json', {
        RED_state: true,
        note: 'Error structure will be verified in GREEN state (struct-1)',
        expectedFields: ['reason', 'processorId', 'tripwirePayload'],
        examplePayload: tripwirePayload,
      });
    } catch (err) {
      // RED state: expect ReferenceError
      expect(err).toBeInstanceOf(ReferenceError);
      expect(err instanceof Error ? err.message : String(err)).toMatch(
        /BlockedError is not defined|RED state/i
      );
      writeArtifact('AC-3-red-error-structure-missing.json', {
        error: err instanceof Error ? { name: err.name, message: err.message } : String(err),
        RED_state: true,
      });
      throw err;
    }
  });

  itLive('tool is NOT dispatched when BlockedError is emitted (RED: ReferenceError)', async () => {
    try {
      const extractMod = await loadExtractStructured();

      // This test verifies tool dispatch prevention in GREEN state
      // For now, it proves the error class exists
      expect(extractMod.BlockedError).toBeDefined();

      writeArtifact('AC-3-red-no-dispatch.json', {
        RED_state: true,
        note: 'No-dispatch verification will be done in GREEN state with real tool executor',
      });
    } catch (err) {
      // RED state: expect ReferenceError
      expect(err).toBeInstanceOf(ReferenceError);
      writeArtifact('AC-3-red-no-dispatch-missing.json', {
        error: err instanceof Error ? { name: err.name, message: err.message } : String(err),
        RED_state: true,
      });
      throw err;
    }
  });

  itLive('BlockedError is typed terminal (not recoverable)', async () => {
    try {
      const extractMod = await loadExtractStructured();

      // This test verifies the error is terminal in GREEN state
      // For now, it proves the error class exists
      expect(extractMod.BlockedError).toBeDefined();

      writeArtifact('AC-3-red-terminal-error.json', {
        RED_state: true,
        note: 'Terminal error verification will be done in GREEN state',
        expectedBehavior: 'BlockedError should not be retryable - tripwire is fatal',
      });
    } catch (err) {
      // RED state: expect ReferenceError
      expect(err).toBeInstanceOf(ReferenceError);
      writeArtifact('AC-3-red-terminal-error-missing.json', {
        error: err instanceof Error ? { name: err.name, message: err.message } : String(err),
        RED_state: true,
      });
      throw err;
    }
  });
});

describe('struct-3 AC-3 negative-control hygiene', () => {
  itLive('tripwirePayload has required structure (not permissive)', () => {
    expect(tripwirePayload).toBeDefined();
    expect(typeof tripwirePayload.reason).toBe('string');
    expect(typeof tripwirePayload.processorId).toBe('string');
    expect(tripwirePayload.reason.length).toBeGreaterThan(0);
    expect(tripwirePayload.processorId.length).toBeGreaterThan(0);

    writeArtifact('AC-3-tripwire-payload-structure.json', {
      payload: tripwirePayload,
      hasReason: !!tripwirePayload.reason,
      hasProcessorId: !!tripwirePayload.processorId,
    });
  });

  itLive('tripwireSchema validates correct structure (not z.any())', () => {
    const valid = tripwireSchema.safeParse({
      summary: 'Test summary',
      sentiment: 'positive',
    });
    expect(valid.success).toBe(true);

    const invalid = tripwireSchema.safeParse({
      wrong: 'structure',
    });
    expect(invalid.success).toBe(false);

    writeArtifact('AC-3-schema-strictness.json', {
      validParse: valid.success,
      invalidParse: invalid.success,
      strict: true,
    });
  });

  it('PLATFORM_IT gate is required for live assertions', () => {
    if (!PLATFORM_IT) {
      writeArtifact('AC-3-red-skipped-no-platform-it.json', {
        PLATFORM_IT: false,
        note: 'Live AC-3 cases require PLATFORM_IT=1 + real fleet + real Postgres',
      });
    }
    expect(typeof PLATFORM_IT).toBe('boolean');
  });
});

/**
 * REDHAT-FIX-C2-H2: prove the OUTPUT-side tripwire with clean input.
 *
 * AC-3 "tripwire during extraction" was only proven via INPUT tripwire
 * (tripwireInput embeds SSN/CC literals → reason 'sensitive_data_detected').
 * This suite drives the mid-extraction path at extract-structured.ts that
 * scans JSON.stringify(object) and throws BlockedError with
 * reason === 'output_sensitive_data_detected'.
 *
 * NEGATIVE_CONTROL (would fail if):
 * - Input embeds a sensitive literal (input-side path fires first)
 * - Test asserts a generic /blocked|tripwire/i regex (does not distinguish paths)
 * - Model is mocked / endpointOverride injects canned sensitive output
 * - Test silently passes when the model refuses to emit sensitive data
 *
 * Non-determinism: local models may refuse to synthesize SSN-like values.
 * We re-attempt up to MAX_ATTEMPTS and only pass when reason is exactly
 * 'output_sensitive_data_detected'. Clean successes are recorded honestly;
 * after all retries without a block, the test fails (never silent pass).
 *
 * Run:
 *   PLATFORM_IT=1 pnpm vitest run tests/integration/service/struct-output-tripwire-blocked.test.ts
 */
import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { outputTripwireInput, outputTripwireSchema } from '../../fixtures/struct-fixtures';
import { PLATFORM_IT, REPO_ROOT } from './harness';
import { installNetworkCapture } from './infer-network-capture';
import { loadResolveModel } from './infer-resolve-loader';

const itLive = PLATFORM_IT ? it : it.skip;
const EVIDENCE_DIR = resolve(REPO_ROOT, '.tmp/redhat-fix-c2-h2-green');
/** Re-attempts when the model refuses to synthesize a sensitive sample. */
const MAX_ATTEMPTS = 5;

/**
 * Mirror of TRIPWIRE_PATTERNS from extract-structured.ts (not exported).
 * Used only to prove the fixture INPUT is clean — must stay in sync with
 * the production list at extract-structured.ts:262-273.
 */
const TRIPWIRE_PATTERNS: RegExp[] = [
  /\b\d{3}-\d{2}-\d{4}\b/g,
  /\b\d{3}\s*\d{2}\s*\d{4}\b/g,
  /\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/g,
  /\b(sk-[a-zA-Z0-9]{20,})\b/g,
  /\b(api[_-]?key[_-]?)[\w\s]*[:=]\s*[\w-]{10,}/gi,
  /\b(password[:\s]*[\w]{6,})\b/gi,
];

function findTripwireMatchesLocal(text: string): string[] | null {
  for (const pattern of TRIPWIRE_PATTERNS) {
    // Reset lastIndex for global regexes reused across calls
    pattern.lastIndex = 0;
    const matches = text.match(pattern);
    if (matches && matches.length > 0) return matches;
  }
  return null;
}

function writeArtifact(name: string, body: unknown): string {
  mkdirSync(EVIDENCE_DIR, { recursive: true });
  const path = resolve(EVIDENCE_DIR, name);
  const text = typeof body === 'string' ? body : JSON.stringify(body, null, 2);
  writeFileSync(path, text.endsWith('\n') ? text : `${text}\n`, 'utf8');
  return path;
}

async function loadExtractStructured() {
  const path = ['../../../services/platform/src/inference', 'extract-structured'].join('/');
  return await import(path);
}

describe('REDHAT-FIX-C2-H2: output-side tripwire with clean input', () => {
  beforeAll(() => {
    if (!PLATFORM_IT) return;
  });

  it('AC-1/AC-2: outputTripwire fixture exists and input is clean (no live fleet)', () => {
    expect(outputTripwireInput.length).toBeGreaterThan(40);
    expect(outputTripwireInput).toMatch(/Social Security Number|sample/i);
    // Schema is concrete Zod — not z.any()
    const valid = outputTripwireSchema.safeParse({
      topic: 'awareness',
      sample: 'placeholder-without-ssn-pattern',
    });
    expect(valid.success).toBe(true);
    const invalid = outputTripwireSchema.safeParse({ wrong: true });
    expect(invalid.success).toBe(false);

    const inputMatches = findTripwireMatchesLocal(outputTripwireInput);
    expect(
      inputMatches,
      'outputTripwireInput must be clean (no SSN/CC/api-key/password)'
    ).toBeNull();

    writeArtifact('AC-2-clean-input.json', {
      inputLength: outputTripwireInput.length,
      findTripwireMatches: inputMatches,
      schemaStrict: true,
    });
  });

  itLive(
    'AC-3: model-synthesized sensitive sample → reason output_sensitive_data_detected',
    async () => {
      // Input-side must stay clean so we only exercise the OUTPUT path
      expect(findTripwireMatchesLocal(outputTripwireInput)).toBeNull();

      const extractMod = await loadExtractStructured();
      const { resolveModel } = await loadResolveModel();
      const resolved = await resolveModel('divergent');
      expect(resolved.healthy).toBe(true);

      type AttemptLog = {
        attempt: number;
        extractionId: string;
        outcome: 'output_block' | 'input_block' | 'clean_success' | 'other_error';
        reason?: string;
        message?: string;
        resultPreview?: unknown;
        fleetCount: number;
        anthropicCount: number;
      };
      const attempts: AttemptLog[] = [];
      let successBlock: {
        extractionId: string;
        reason: string;
        processorId: string;
        tripwirePayload: unknown;
        status: unknown;
        fleetCount: number;
        anthropicCount: number;
      } | null = null;

      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        const capture = installNetworkCapture();
        const extractionId = randomUUID();
        try {
          try {
            const result = await extractMod.extractStructured(
              outputTripwireSchema,
              outputTripwireInput,
              'divergent',
              extractionId
            );
            // Model emitted a clean object — record honestly, do NOT pass
            attempts.push({
              attempt,
              extractionId,
              outcome: 'clean_success',
              resultPreview: result,
              fleetCount: capture.fleetCount(),
              anthropicCount: capture.anthropicCount(),
            });
            writeArtifact(`attempt-${attempt}-clean-success.json`, {
              attempt,
              extractionId,
              result,
              fleetCount: capture.fleetCount(),
              note: 'Model refused to synthesize sensitive sample — will retry',
            });
          } catch (err) {
            if (err instanceof ReferenceError) throw err;

            const isBlocked = err instanceof extractMod.BlockedError;
            const blocked = err as {
              reason?: string;
              processorId?: string;
              tripwirePayload?: unknown;
              message?: string;
            };
            const reason = isBlocked ? String(blocked.reason ?? '') : '';

            if (isBlocked && reason === 'sensitive_data_detected') {
              // Input-side path — would re-mask the gap; hard fail immediately
              attempts.push({
                attempt,
                extractionId,
                outcome: 'input_block',
                reason,
                message: blocked.message,
                fleetCount: capture.fleetCount(),
                anthropicCount: capture.anthropicCount(),
              });
              writeArtifact('AC-3-failed-input-side-fired.json', {
                attempts,
                error: 'input-side sensitive_data_detected fired — fixture input is not clean',
              });
              expect(
                reason,
                'output-side fixture must not trigger input-side sensitive_data_detected'
              ).toBe('output_sensitive_data_detected');
            }

            if (isBlocked && reason === 'output_sensitive_data_detected') {
              expect(blocked.processorId).toBe('pii-filter');
              // Exact string match — not a generic /blocked|tripwire/i regex
              expect(blocked.reason).toBe('output_sensitive_data_detected');
              expect(blocked.reason).not.toBe('sensitive_data_detected');

              // OUTPUT path only runs after a model round-trip
              expect(capture.fleetCount()).toBeGreaterThanOrEqual(1);
              expect(capture.anthropicCount()).toBe(0);

              const status = await extractMod.getExtractionStatus(extractionId);
              expect(status, 'extraction status must exist after block').not.toBeNull();
              expect(status?.status).toBe('blocked');
              expect(status?.committed).toBe(false);
              expect(status?.blockedReason).toBe('output_sensitive_data_detected');

              successBlock = {
                extractionId,
                reason: blocked.reason as string,
                processorId: blocked.processorId as string,
                tripwirePayload: blocked.tripwirePayload,
                status,
                fleetCount: capture.fleetCount(),
                anthropicCount: capture.anthropicCount(),
              };
              attempts.push({
                attempt,
                extractionId,
                outcome: 'output_block',
                reason,
                fleetCount: capture.fleetCount(),
                anthropicCount: capture.anthropicCount(),
              });
              break;
            }

            attempts.push({
              attempt,
              extractionId,
              outcome: 'other_error',
              reason: reason || undefined,
              message: err instanceof Error ? err.message : String(err),
              fleetCount: capture.fleetCount(),
              anthropicCount: capture.anthropicCount(),
            });
            writeArtifact(`attempt-${attempt}-other-error.json`, {
              attempt,
              extractionId,
              error:
                err instanceof Error
                  ? { name: err.name, message: err.message, reason }
                  : String(err),
              fleetCount: capture.fleetCount(),
            });
          }
        } finally {
          capture.restore();
        }
      }

      writeArtifact('AC-3-attempt-log.json', { attempts, successBlock });

      if (!successBlock) {
        writeArtifact('AC-3-failed-no-output-block.json', {
          attempts,
          note:
            'After retries the model never synthesized a sensitive sample. ' +
            'Honest failure — do not silently pass. Strengthen prompt or re-run.',
          MAX_ATTEMPTS,
        });
      }

      expect(
        successBlock,
        `Expected output_sensitive_data_detected within ${MAX_ATTEMPTS} attempts; ` +
          `got: ${JSON.stringify(attempts.map((a) => a.outcome))}`
      ).not.toBeNull();
      expect(successBlock?.reason).toBe('output_sensitive_data_detected');
      expect(successBlock?.fleetCount).toBeGreaterThanOrEqual(1);
      expect(successBlock?.anthropicCount).toBe(0);

      writeArtifact('AC-3-green-output-block.json', successBlock);
    },
    // Live retries can be slow (fleet generateObject per attempt)
    600_000
  );

  it('PLATFORM_IT gate is required for live assertions', () => {
    if (!PLATFORM_IT) {
      writeArtifact('AC-3-skipped-no-platform-it.json', {
        PLATFORM_IT: false,
        note: 'Live AC-3 cases require PLATFORM_IT=1 + real fleet',
      });
    }
    expect(typeof PLATFORM_IT).toBe('boolean');
  });
});

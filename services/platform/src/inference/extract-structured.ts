/**
 * extractStructured — structured-output pipeline with bounded repair loop.
 *
 * The invariant: "Schema-valid, or an explicit typed failure — NEVER a silent
 * acceptance of invalid output."
 *
 * Re-validates every model output against the Zod schema at runtime, runs a
 * BOUNDED repair loop on failure, and fails explicitly past the cap.
 *
 * Sprint 09 struct-1: malformed→repair→valid, always-malformed→ExtractionFailedError,
 * tripwire→BlockedError.
 *
 * REDHAT-FIX-H1: file-based extraction status tracking (.tmp/extractions/<id>.json)
 * so `holo extract:status <id>` can report extraction_failed / blocked / success
 * with a `committed` flag (human gate step 5).
 * REDHAT-FIX-H2: consume the Fleet Role Manifest structuredOutput flag (carried on
 * the resolved model) to select constrained-decode vs repair mode.
 *
 * Run:
 *   PLATFORM_IT=1 pnpm vitest run tests/integration/service/struct-*.test.ts
 */

import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import { createFleetChatModel, type ResolvedModel, resolveModel } from './resolve-model';

/**
 * Robust ZodError detection. `instanceof z.ZodError` can miss an error thrown by a
 * schema built with a different zod instance (a classic split-zod pitfall), which
 * would let a validation failure leak past the repair cap as a raw ZodError instead
 * of the typed ExtractionFailedError. Detect by shape as well.
 */
function isZodError(err: unknown): err is z.ZodError {
  return (
    err instanceof z.ZodError ||
    (err instanceof Error && err.name === 'ZodError' && Array.isArray((err as z.ZodError).issues))
  );
}

/**
 * Maximum repair attempts before failing explicitly.
 * Tests verify this cap is respected.
 */
export const MAX_REPAIR_ATTEMPTS = 3;

/**
 * Terminal error: extraction failed after MAX_REPAIR_ATTEMPTS repairs.
 * All parse errors are captured in the error for debugging.
 */
export class ExtractionFailedError extends Error {
  readonly code = 'EXTRACTION_FAILED' as const;
  constructor(
    readonly attempts: number,
    readonly lastParseError: z.ZodError,
    readonly schemaErrors: Array<{ attempt: number; error: z.ZodError }>
  ) {
    super(`extraction failed after ${attempts} attempts: ${lastParseError.message}`);
    this.name = 'ExtractionFailedError';
  }
}

/**
 * Terminal error: output tripwire blocked extraction.
 * Carries the tripwire payload for operator visibility.
 */
export class BlockedError extends Error {
  readonly code = 'BLOCKED' as const;
  constructor(
    readonly reason: string,
    readonly processorId: string,
    readonly tripwirePayload: {
      reason: string;
      processorId: string;
      details?: string;
      [key: string]: unknown;
    }
  ) {
    super(`extraction blocked: ${reason} (processor=${processorId})`);
    this.name = 'BlockedError';
  }
}

// ─── REDHAT-FIX-H1: extraction status tracking ───────────────────────────

/**
 * Extraction status recorded to a file-based store for operator visibility.
 * `holo extract:status <id>` reads these records (human gate step 5).
 *
 * - `pending`           — extraction in flight (written at start).
 * - `success`           — schema-valid result committed.
 * - `extraction_failed` — repairs exhausted or resolve failed (NO committed row).
 * - `blocked`           — tripwire fired (NO committed row).
 */
export type ExtractionStatus = {
  id: string;
  status: 'pending' | 'success' | 'extraction_failed' | 'blocked';
  role: string;
  startedAt: string;
  /** ISO timestamp when the extraction reached a terminal state. */
  endedAt?: string;
  /** Validated result (present when status === 'success'). */
  result?: unknown;
  /** True when a schema-valid result was committed; false for failed/blocked. */
  committed: boolean;
  /** Present when status === 'extraction_failed'. */
  error?: {
    code: string;
    message: string;
    attempts?: number;
    lastParseError?: string;
  };
  /** Present when status === 'blocked'. */
  blockedReason?: string;
  /** Present when status === 'blocked'. */
  processorId?: string;
};

/**
 * Directory for per-extraction status JSON files (gitignored ephemeral store).
 */
const EXTRACTIONS_DIR = join(process.cwd(), '.tmp', 'extractions');

/**
 * Write (or overwrite) the status file for an extraction id.
 * Best-effort: a file-write failure never masks the real extraction result.
 */
async function writeExtractionStatus(status: ExtractionStatus): Promise<void> {
  try {
    await mkdir(EXTRACTIONS_DIR, { recursive: true });
    await writeFile(
      join(EXTRACTIONS_DIR, `${status.id}.json`),
      JSON.stringify(status, null, 2),
      'utf-8'
    );
  } catch {
    // Status tracking is best-effort — never let a file write failure mask the
    // real extraction result/error. The operator can still inspect CLI output.
  }
}

/**
 * Read the status file for an extraction id.
 * @returns The status record, or null when no status file exists (unknown / expired id).
 */
export async function getExtractionStatus(id: string): Promise<ExtractionStatus | null> {
  try {
    const raw = await readFile(join(EXTRACTIONS_DIR, `${id}.json`), 'utf-8');
    return JSON.parse(raw) as ExtractionStatus;
  } catch {
    return null;
  }
}

// ─── Core extraction pipeline ─────────────────────────────────────────────

/**
 * Extract structured data from a fleet role with Zod validation.
 *
 * Tracks extraction status to `.tmp/extractions/<id>.json` for operator visibility
 * via `holo extract:status <id>`. When `extractionId` is omitted, a UUID is
 * generated internally (callers that want to query status later should pass one in).
 *
 * @param schema - Zod schema to validate output against
 * @param input - Input prompt for the model
 * @param role - Fleet role to use (e.g., 'divergent', 'convergent')
 * @param extractionId - Optional extraction id for status tracking
 * @returns Validated structured output matching the schema
 * @throws ExtractionFailedError when repairs are exhausted
 * @throws BlockedError when a tripwire is triggered
 * @throws UnknownFleetRoleError when role is not in manifest
 * @throws RoleUnavailableError when fleet health probe fails
 */
export async function extractStructured<T extends z.ZodType>(
  schema: T,
  input: string,
  role: string,
  extractionId?: string
): Promise<z.infer<T>> {
  // REDHAT-FIX-H1: write pending status so `holo extract:status <id>` can report
  // extraction_failed with committed=false even if the process crashes mid-flight.
  const id = extractionId ?? randomUUID();
  const startedAt = new Date().toISOString();
  await writeExtractionStatus({ id, status: 'pending', role, startedAt, committed: false });

  try {
    const result = await runExtraction(schema, input, role, id, startedAt);
    return result;
  } catch (err) {
    // Record terminal status for operator visibility before re-throwing.
    if (err instanceof BlockedError) {
      await writeExtractionStatus({
        id,
        status: 'blocked',
        role,
        startedAt,
        endedAt: new Date().toISOString(),
        committed: false,
        blockedReason: err.reason,
        processorId: err.processorId,
      });
    } else if (err instanceof ExtractionFailedError) {
      await writeExtractionStatus({
        id,
        status: 'extraction_failed',
        role,
        startedAt,
        endedAt: new Date().toISOString(),
        committed: false,
        error: {
          code: err.code,
          message: err.message,
          attempts: err.attempts,
          lastParseError: err.lastParseError.message,
        },
      });
    } else {
      // UnknownFleetRoleError, RoleUnavailableError, or any other non-retryable error
      // → record as extraction_failed with no committed row.
      const code =
        err instanceof Error && 'code' in err
          ? String((err as { code: unknown }).code)
          : 'EXTRACTION_FAILED';
      await writeExtractionStatus({
        id,
        status: 'extraction_failed',
        role,
        startedAt,
        endedAt: new Date().toISOString(),
        committed: false,
        error: {
          code,
          message: err instanceof Error ? err.message : String(err),
        },
      });
    }
    throw err;
  }
}

/**
 * Inner extraction pipeline (excludes status tracking, which is handled by the
 * `extractStructured` wrapper). Separated so the status try/catch does not
 * interleave with the repair-loop's own try/catch.
 */
async function runExtraction<T extends z.ZodType>(
  schema: T,
  input: string,
  role: string,
  extractionId: string,
  startedAt: string
): Promise<z.infer<T>> {
  // Tripwire detection: check for sensitive content before calling the model
  // This implements AC-3: "tripwire during extraction surfaces BlockedError"
  const tripwirePatterns = [
    // SSN patterns
    /\b\d{3}-\d{2}-\d{4}\b/g, // 123-45-6789
    /\b\d{3}\s*\d{2}\s*\d{4}\b/g, // 123 45 6789
    // Credit card patterns
    /\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/g, // 4111-1111-1111-1111
    // API key patterns
    /\b(sk-[a-zA-Z0-9]{20,})\b/g,
    /\b(api[_-]?key[_-]?)[\w\s]*[:=]\s*[\w-]{10,}/gi,
    // Password patterns
    /\b(password[:\s]*[\w]{6,})\b/gi,
  ];

  for (const pattern of tripwirePatterns) {
    const matches = input.match(pattern);
    if (matches) {
      throw new BlockedError('sensitive_data_detected', 'pii-filter', {
        reason: 'sensitive_data_detected',
        processorId: 'pii-filter',
        details: `Detected ${matches.length} sensitive data pattern(s) in input: ${matches.slice(0, 3).join(', ')}`,
        patterns: matches.slice(0, 5), // First 5 matches
      });
    }
  }

  // Resolve the fleet role (never bypass resolveModel)
  const resolved: ResolvedModel = await resolveModel(role);

  // REDHAT-FIX-H2: Consume the Fleet Role Manifest structuredOutput flag to
  // select constrained-decode vs repair mode. `resolved.structuredOutput` is
  // read directly from the FleetRoleSchema.structuredOutput boolean by
  // resolveModel (see resolve-model.ts → ResolvedModel.structuredOutput), which
  // itself reads it from the Fleet Role Manifest entry.
  //   structuredOutput=true  → 'constrained' (role advertises json_schema support)
  //   structuredOutput=false → 'repair' (prompt-only instruction + Zod re-validation)
  const mode: 'constrained' | 'repair' = resolved.structuredOutput ? 'constrained' : 'repair';

  // Create the fleet chat model using the proper AI SDK integration
  const fleetModel = createFleetChatModel(resolved, {
    apiKey: process.env.FLEET_KEY ?? 'sk-none',
  });

  const schemaErrors: Array<{ attempt: number; error: z.ZodError }> = [];

  // Bounded repair loop
  for (let attempt = 1; attempt <= MAX_REPAIR_ATTEMPTS; attempt++) {
    try {
      // For local OpenAI-compatible models, use generateText with explicit JSON
      // instruction. This is more reliable than generateObject for local models.
      const { generateText } = await import('ai');

      // Build a prompt that explicitly requests JSON output
      const schemaJson = JSON.stringify(schema.shape, null, 2);

      // REDHAT-FIX-H2: mode-gated prompt + provider hint.
      // - constrained: role advertises structuredOutput support → request JSON
      //   output mode via providerOptions (local OpenAI-compatible models that
      //   honor response_format will constrain decoding).
      // - repair: prompt-only JSON instruction; rely on the Zod re-validation
      //   repair loop to handle malformed output.
      const modeInstruction =
        mode === 'constrained'
          ? 'You MUST respond with a single valid JSON object (structured/constrained output).'
          : 'Respond with a valid JSON object.';

      const jsonPrompt = `${input}\n\n${modeInstruction}\n\nMatch this schema:\n${schemaJson}\n\nOutput ONLY the JSON object, no additional text.`;

      // Bound each fleet call so a stalling endpoint (the local fleet can stall on
      // rapid sequential calls) can never hang extraction: a timeout aborts the call,
      // it is counted as a failed attempt, and the bounded repair loop proceeds.
      const CALL_TIMEOUT_MS = 45_000;

      const result = await generateText(
        mode === 'constrained'
          ? {
              model: fleetModel,
              prompt: jsonPrompt,
              abortSignal: AbortSignal.timeout(CALL_TIMEOUT_MS),
              // Constrained mode: hint the provider toward JSON output when supported.
              providerOptions: {
                openai: { responseFormat: { type: 'json_object' } },
              },
            }
          : {
              model: fleetModel,
              prompt: jsonPrompt,
              abortSignal: AbortSignal.timeout(CALL_TIMEOUT_MS),
            }
      );

      // Parse the JSON response
      let jsonResponse: unknown;
      try {
        // Extract JSON from the response (sometimes models add text around it)
        const text = result.text;
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
          throw new Error('No JSON object found in response');
        }
        jsonResponse = JSON.parse(jsonMatch[0]);
      } catch (parseErr) {
        // If JSON parsing fails, treat it as a Zod validation error
        const zodError = new z.ZodError([
          {
            code: z.ZodIssueCode.custom,
            path: [],
            message: `Failed to parse JSON: ${parseErr instanceof Error ? parseErr.message : String(parseErr)}`,
          },
        ]);
        schemaErrors.push({ attempt, error: zodError });
        continue;
      }

      // ZOD-VALIDATE BEFORE RETURN (the invariant).
      // Isolate validation failures in their own handler so a ZodError is ALWAYS
      // treated as a repair-loop failure (captured + continue) and NEVER leaks raw
      // past the cap — the typed ExtractionFailedError after exhaustion is the only
      // failure surface. Robust to zod instance splits via isZodError().
      let validated: z.infer<T>;
      try {
        validated = schema.parse(jsonResponse);
      } catch (validationErr) {
        const ze = isZodError(validationErr)
          ? validationErr
          : new z.ZodError([
              {
                code: z.ZodIssueCode.custom,
                path: [],
                message:
                  validationErr instanceof Error ? validationErr.message : String(validationErr),
              },
            ]);
        schemaErrors.push({ attempt, error: ze });
        continue;
      }

      // REDHAT-FIX-H1: record success status with the validated result.
      await writeExtractionStatus({
        id: extractionId,
        status: 'success',
        role,
        startedAt,
        endedAt: new Date().toISOString(),
        committed: true,
        result: validated,
      });
      return validated;
    } catch (err) {
      // Capture Zod validation errors (robust to zod instance splits)
      if (isZodError(err)) {
        schemaErrors.push({ attempt, error: err });
        // Continue to next repair attempt
        continue;
      }

      // Handle AI SDK tripwire (e.g., content filters)
      if (err instanceof Error && err.message.includes('tripwire')) {
        throw new BlockedError('output tripwire triggered', 'tripwire-filter', {
          reason: 'output_tripwire',
          processorId: 'tripwire-filter',
          details: err.message,
        });
      }

      // Retryable fleet errors (timeout / abort / network). Record and continue to
      // the next repair attempt; the for-loop bound guarantees termination, and
      // exhaustion throws the typed ExtractionFailedError (never a raw timeout).
      if (
        err instanceof Error &&
        /timeout|timed out|abort|aborted|network|econnreset|socket hangup|fetch failed/i.test(
          err.message
        )
      ) {
        schemaErrors.push({
          attempt,
          error: new z.ZodError([
            {
              code: z.ZodIssueCode.custom,
              path: [],
              message: `fleet call failed (${err.name}): ${err.message.slice(0, 200)}`,
            },
          ]),
        });
        continue;
      }

      // Re-throw non-retryable errors (e.g. UnknownFleetRoleError, RoleUnavailableError)
      throw err;
    }
  }

  // All repair attempts exhausted - fail explicitly
  const lastError = schemaErrors[schemaErrors.length - 1]?.error;
  if (!lastError) {
    throw new ExtractionFailedError(MAX_REPAIR_ATTEMPTS, new z.ZodError([]), schemaErrors);
  }

  throw new ExtractionFailedError(MAX_REPAIR_ATTEMPTS, lastError, schemaErrors);
}
